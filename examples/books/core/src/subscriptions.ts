import {
  Array,
  Clock,
  Duration,
  Effect,
  Match as M,
  Option,
  Order,
  Record as Record_,
  Schema as S,
  Schedule,
  Stream,
  pipe,
} from 'effect'
import { type Command, Subscription } from 'foldkit'
import * as CodeUpdates from 'foldkit/code-updates'
import { appliedRowChanges } from 'foldkit/synchronization'
import * as Theme from 'foldkit/theme'
import * as ReadAloud from 'read-aloud-core-example'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { audibleViewOf } from './addBooks.js'
import * as Audible from './audible/index.js'
import { closingsOf } from './closings.js'
import {
  CloseUnendedPlays,
  FollowReadAloudPage,
  OpenAudibleSignIn,
  ReportStretch,
  ResolveAddressCue,
  WriteLibrary,
} from './command.js'
import { Milliseconds, TitleSlug } from './ids.js'
import { FinishTitle, LibraryStore, SavePlace } from './library.js'
import {
  DetectedAddressCue,
  FailedReadChapters,
  FailedReadShelf,
  type Message,
  ReceivedBookmarks,
  ReceivedChapters,
  ReceivedMember,
  ReceivedPlaces,
  ReceivedShelf,
  ReceivedUnendedPlays,
} from './message.js'
import {
  ChaptersReady,
  ChaptersUnavailable,
  type InProgress,
  Model,
  ShelfReady,
  ShelfUnavailable,
  type StretchReport,
  loadedPlayerOf,
  resumePlaceOf,
  sectionsOf,
  shelfOf,
  titleOf,
} from './model.js'
import { ScribeTimeline } from './scribeTimeline.js'
import type { BooksServices } from './services.js'
import { shelfFacts } from './shelfFacts.js'
import { addressCueOf, loadedSlugOf, shownTitleOf } from './stack.js'
import {
  type StretchEvent,
  type StretchState,
  finishedAt,
  reachedPlace,
  stoppedAt,
} from './stretch.js'

// SUBSCRIPTION

/** How often Books saves the listening place while audio plays. */
export const saveEveryMs = 10_000

/** How often Books looks for plays a closed page left open on Scribe's timeline. */
export const unendedPlaysCheckEvery = Duration.minutes(10)

type Recorded = readonly [StretchState, ReadonlyArray<StretchEvent>]

/**
 * The stretch after what the player reports: each new second the audio
 * reached opens, counts, or ends one at a jump; a pause, a failure, a seek,
 * and the end end it.
 */
export const recordedStretch = (
  stretch: StretchState,
  player: TranscriptPlayer.Model,
  maybeOutMessage: Option.Option<TranscriptPlayer.OutMessage>,
): Recorded =>
  Option.match(maybeOutMessage, {
    onNone: () => [stretch, []],
    onSome: M.type<TranscriptPlayer.OutMessage>().pipe(
      M.withReturnType<Recorded>(),
      M.tagsExhaustive({
        Advanced: ({ placeMs, wallClockMs }) =>
          reachedPlace(stretch, { placeMs, wallClockMs, speed: player.speed }),
        Stopped: () =>
          stoppedAt(
            stretch,
            player.transport._tag === 'Unplayable' ? 'Interrupted' : 'Paused',
          ),
        Moved: () => stoppedAt(stretch, 'Seeked'),
        Finished: () => finishedAt(stretch, player.media.durationMs),
      }),
    ),
  })

/** Each begin and end of a stretch of `slug`, as Scribe's timeline hears it. */
export const stretchReportsOf = (
  model: Model,
  slug: TitleSlug,
  events: ReadonlyArray<StretchEvent>,
): ReadonlyArray<StretchReport> =>
  Option.match(titleOf(model, slug), {
    onNone: () => [],
    onSome: title => Array.map(events, event => ({ title, event })),
  })

const checkedUnendedPlays = Effect.gen(function* () {
  const timeline = yield* ScribeTimeline
  const plays = yield* timeline.unendedPlays
  const checkedAtMs = yield* Clock.currentTimeMillis
  return Option.some(ReceivedUnendedPlays({ plays, checkedAtMs }))
}).pipe(Effect.catch(() => Effect.succeed(Option.none())))

/**
 * The plays a closed page left open on Scribe's timeline, as of each
 * check: once the shelf is here, then every 10 minutes. A check that fails
 * waits for the next.
 */
export const unendedPlaysStream = (
  isShelfReady: boolean,
): Stream.Stream<typeof ReceivedUnendedPlays.Type, never, BooksServices> =>
  isShelfReady
    ? Stream.fromEffectSchedule(
        checkedUnendedPlays,
        Schedule.spaced(unendedPlaysCheckEvery),
      ).pipe(
        Stream.flatMap(maybeMessage =>
          Stream.fromIterable(Option.toArray(maybeMessage)),
        ),
      )
    : Stream.empty

/**
 * The place the player's address asks for, when the player is not there.
 *
 * @example
 * ```typescript
 * addressCueOfModel(model) // Some({ slug: 'small-hours', atMs: 723000 }) after opening /books/small-hours/listen/12m03s
 * ```
 */
export const addressCueOfModel = (
  model: Model,
): Option.Option<Readonly<{ slug: TitleSlug; atMs: Milliseconds }>> =>
  addressCueOf(
    model,
    slug => Option.isSome(titleOf(model, slug)),
    slug =>
      model.listening._tag === 'Loaded' && model.listening.slug === slug
        ? model.listening.player.placeMs
        : resumePlaceOf(model, slug),
  )

/**
 * The titles whose chapters Books needs now: the one on screen, the one in
 * the player, and the ones in progress, whose rows name the chapter they
 * are at. Only titles on the shelf, each once, in slug order.
 *
 * @example
 * ```typescript
 * wantedChapterSlugsOf(model) // ['small-hours', 'the-lantern-keeper'] on the library with Small Hours in progress and The Lantern Keeper open
 * ```
 */
export const wantedChapterSlugsOf = (model: Model): ReadonlyArray<TitleSlug> =>
  pipe(
    [
      ...Array.fromOption(shownTitleOf(model)),
      ...Array.fromOption(loadedSlugOf(model)),
      ...Option.match(shelfOf(model), {
        onNone: () => [],
        onSome: shelf =>
          Array.map(
            Array.filter(
              shelf.progress,
              (progress): progress is InProgress =>
                progress._tag === 'InProgress',
            ),
            progress => progress.slug,
          ),
      }),
    ],
    Array.filter(slug => Option.isSome(titleOf(model, slug))),
    Array.dedupe,
    Array.sort(Order.String),
  )

type BooksCommand = Command.Command<Message, never, BooksServices>

const audibleNavCommandsOf = (
  maybeOutMessage: Option.Option<Audible.OutMessage>,
): ReadonlyArray<BooksCommand> =>
  Option.match(maybeOutMessage, {
    onNone: () => [],
    onSome: out => (out._tag === 'NeededSignIn' ? [OpenAudibleSignIn()] : []),
  })

/**
 * What Books listens to: the shelf from the library store for as long as
 * the Program runs, the chapters of each title that needs them, and the
 * loaded player's audio and words, built from the Transcript Player's own
 * entries. Each Subscription writes only `loaded` and `ephemeral` fields
 * through its typed patch, and emits Commands for any synced or external
 * follow-up.
 */
export const subscriptions = Subscription.forModel(Model)<
  Message,
  BooksServices
>()(entry => ({
  shelf: entry(
    {},
    {
      facts: [
        ReceivedShelf,
        ReceivedPlaces,
        ReceivedBookmarks,
        FailedReadShelf,
      ],
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Stream.unwrap(
          Effect.gen(function* () {
            const store = yield* LibraryStore
            return shelfFacts(store.shelf).pipe(
              Stream.catch(error =>
                Stream.make(FailedReadShelf({ reason: error.reason })),
              ),
            )
          }),
        ),
      apply: (model, fact) =>
        M.value(fact).pipe(
          M.withReturnType<
            Subscription.ScopedApplyReturn<typeof Model, Message, BooksServices>
          >(),
          M.tagsExhaustive({
            ReceivedShelf: ({ shelf }) => {
              const library = ShelfReady({ shelf })
              const maybeCue = addressCueOfModel({ ...model, library })
              return Option.match(maybeCue, {
                onNone: () => ({ library }),
                onSome: cue => [{ library }, [ResolveAddressCue(cue)]],
              })
            },
            ReceivedPlaces: changes =>
              model.library._tag === 'ShelfReady'
                ? {
                    library: {
                      ...model.library,
                      shelf: {
                        ...model.library.shelf,
                        progress: appliedRowChanges(
                          model.library.shelf.progress,
                          changes,
                          progress => progress.slug,
                        ),
                      },
                    },
                  }
                : {},
            ReceivedBookmarks: changes =>
              model.library._tag === 'ShelfReady'
                ? {
                    library: {
                      ...model.library,
                      shelf: {
                        ...model.library.shelf,
                        bookmarks: appliedRowChanges(
                          model.library.shelf.bookmarks,
                          changes,
                          bookmark => bookmark.bookmarkId,
                        ),
                      },
                    },
                  }
                : {},
            FailedReadShelf: ({ reason }) => ({
              library: ShelfUnavailable({ reason }),
            }),
          }),
        ),
    },
  ),
  chapters: entry(
    { slugs: S.Array(TitleSlug) },
    {
      facts: [ReceivedChapters, FailedReadChapters],
      modelToDependencies: model => ({ slugs: wantedChapterSlugsOf(model) }),
      dependenciesToStream: ({ slugs }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const store = yield* LibraryStore
            return Stream.mergeAll(
              Array.map(slugs, slug =>
                store.chapters(slug).pipe(
                  Stream.map(chapters => ReceivedChapters({ slug, chapters })),
                  Stream.catch(error =>
                    Stream.make(
                      FailedReadChapters({ slug, reason: error.reason }),
                    ),
                  ),
                ),
              ),
              { concurrency: 'unbounded' },
            )
          }),
        ),
      apply: (model, fact) =>
        M.value(fact).pipe(
          M.tagsExhaustive({
            ReceivedChapters: ({ slug, chapters }) => {
              const nextChapters = Record_.set(
                model.chapters,
                slug,
                ChaptersReady({ chapters }),
              )
              if (
                model.listening._tag === 'Loaded' &&
                model.listening.slug === slug
              ) {
                return {
                  chapters: nextChapters,
                  listening: {
                    Loaded: {
                      player: {
                        media: {
                          sections: sectionsOf(chapters),
                        },
                      },
                    },
                  },
                }
              } else {
                return { chapters: nextChapters }
              }
            },
            FailedReadChapters: ({ slug, reason }) => ({
              chapters: Record_.set(
                model.chapters,
                slug,
                ChaptersUnavailable({ reason }),
              ),
            }),
          }),
        ),
    },
  ),
  clock: entry(TranscriptPlayer.ClockDependencies.fields, {
    facts: [
      TranscriptPlayer.ReachedPlace,
      TranscriptPlayer.ReachedEnd,
      TranscriptPlayer.FailedPlayAudio,
    ],
    modelToDependencies: model =>
      TranscriptPlayer.clockDependenciesOf(loadedPlayerOf(model)),
    keepAliveEquivalence: TranscriptPlayer.isSameClock,
    dependenciesToStream: TranscriptPlayer.clockStream,
    // NOTE: A newer place takes a waiting place's turn, so a device
    // that falls behind holds one place and takes a press next.
    supersedes: (waiting, arrived) =>
      TranscriptPlayer.clockSupersedes(waiting, arrived),
    apply: (model, fact) => {
      if (model.listening._tag !== 'Loaded') {
        return {}
      }
      const loaded = model.listening
      const [player, commands, maybeOutMessage] = TranscriptPlayer.update(
        loaded.player,
        fact,
      )
      const [stretch, events] = recordedStretch(
        loaded.stretch,
        player,
        maybeOutMessage,
      )
      const [savedPlaceMs, saves]: readonly [
        Milliseconds,
        ReadonlyArray<BooksCommand>,
      ] = Option.match(maybeOutMessage, {
        onNone: () => [loaded.savedPlaceMs, []],
        onSome: M.type<TranscriptPlayer.OutMessage>().pipe(
          M.withReturnType<
            readonly [Milliseconds, ReadonlyArray<BooksCommand>]
          >(),
          M.tagsExhaustive({
            Advanced: ({ placeMs }) =>
              placeMs - loaded.savedPlaceMs >= saveEveryMs &&
              placeMs !== loaded.savedPlaceMs
                ? [
                    placeMs,
                    [
                      WriteLibrary({
                        write: SavePlace({ slug: loaded.slug, placeMs }),
                      }),
                    ],
                  ]
                : [loaded.savedPlaceMs, []],
            Stopped: ({ placeMs }) =>
              placeMs !== loaded.savedPlaceMs
                ? [
                    placeMs,
                    [
                      WriteLibrary({
                        write: SavePlace({ slug: loaded.slug, placeMs }),
                      }),
                    ],
                  ]
                : [loaded.savedPlaceMs, []],
            Moved: () => [loaded.savedPlaceMs, []],
            Finished: () => [
              TranscriptPlayer.currentPlaceOf(player),
              [WriteLibrary({ write: FinishTitle({ slug: loaded.slug }) })],
            ],
          }),
        ),
      })
      const newReports = stretchReportsOf(model, loaded.slug, events)
      const hasReports = Array.isReadonlyArrayNonEmpty(newReports)
      const reportCommands: ReadonlyArray<BooksCommand> = hasReports
        ? Array.map([...model.unsentReports, ...newReports], ReportStretch)
        : []
      const patch = {
        ...(hasReports ? { unsentReports: [] } : {}),
        listening: {
          Loaded: {
            savedPlaceMs,
            stretch,
            player: {
              transport: player.transport,
              maybeTickPlaceMs: player.maybeTickPlaceMs,
              maybePlacedAtMs: player.maybePlacedAtMs,
            },
          },
        },
      }
      return [patch, [...commands, ...saves, ...reportCommands]]
    },
  }),
  unendedPlays: entry(
    { isShelfReady: S.Boolean },
    {
      facts: [ReceivedUnendedPlays],
      modelToDependencies: model => ({
        isShelfReady: model.library._tag === 'ShelfReady',
      }),
      dependenciesToStream: ({ isShelfReady }) =>
        unendedPlaysStream(isShelfReady),
      apply: (model, { plays, checkedAtMs }) => [
        {},
        Array.match(closingsOf(model, plays, checkedAtMs), {
          onEmpty: (): ReadonlyArray<BooksCommand> => [],
          onNonEmpty: closings => [CloseUnendedPlays({ closings })],
        }),
      ],
    },
  ),
  member: entry(
    {},
    {
      facts: [ReceivedMember],
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Stream.unwrap(
          Effect.gen(function* () {
            const store = yield* LibraryStore
            return Stream.map(store.member, maybeEmail =>
              ReceivedMember({ maybeEmail }),
            )
          }),
        ),
      apply: (_model, { maybeEmail }) => ({ maybeMember: maybeEmail }),
    },
  ),
  addressCue: entry(
    {
      maybeCue: S.Option(S.Struct({ slug: TitleSlug, atMs: Milliseconds })),
    },
    {
      facts: [DetectedAddressCue],
      modelToDependencies: model => ({ maybeCue: addressCueOfModel(model) }),
      dependenciesToStream: ({ maybeCue }) =>
        Option.match(maybeCue, {
          onNone: () => Stream.empty,
          onSome: ({ slug, atMs }) =>
            Stream.make(DetectedAddressCue({ slug, atMs })),
        }),
      apply: (_model, { slug, atMs }) => [
        {},
        [ResolveAddressCue({ slug, atMs })],
      ],
    },
  ),
  transcript: entry(TranscriptPlayer.TranscriptDependencies.fields, {
    facts: [
      TranscriptPlayer.ReceivedPassages,
      TranscriptPlayer.FailedLoadTranscript,
    ],
    modelToDependencies: model =>
      TranscriptPlayer.transcriptDependenciesOf(loadedPlayerOf(model)),
    dependenciesToStream: TranscriptPlayer.transcriptStream,
    apply: (_model, fact) => ({
      listening: {
        Loaded: {
          player: {
            transcript:
              fact._tag === 'ReceivedPassages'
                ? TranscriptPlayer.TranscriptLoaded({
                    passages: fact.passages,
                  })
                : TranscriptPlayer.TranscriptUnavailable({
                    reason: fact.reason,
                  }),
          },
        },
      },
    }),
  }),
  // NOTE: Reading a whole title's words is the costly part of a search.
  // Books reads ahead when the search opens; a Program on a metered link
  // would pass 'OnSearch' here and read only once words are asked for.
  searchWords: entry(TranscriptPlayer.SearchWordsDependencies.fields, {
    facts: [
      TranscriptPlayer.ReadSearchWords,
      TranscriptPlayer.FailedReadSearchWords,
    ],
    modelToDependencies: model =>
      TranscriptPlayer.searchWordsDependenciesOf(
        loadedPlayerOf(model),
        'OnOpen',
      ),
    dependenciesToStream: TranscriptPlayer.searchWordsStream,
    apply: (model, fact) => {
      if (model.listening._tag !== 'Loaded') {
        return {}
      }
      const [player, commands] = TranscriptPlayer.update(
        model.listening.player,
        fact,
      )
      return [
        {
          listening: {
            Loaded: { player: { maybeSearch: player.maybeSearch } },
          },
        },
        commands,
      ]
    },
  }),
  readings: entry(
    {},
    {
      facts: [ReadAloud.ReceivedReadings, ReadAloud.FailedReadReadings],
      modelToDependencies: () => ({}),
      dependenciesToStream: ReadAloud.readingsStream,
      apply: (model, fact) => {
        const step = ReadAloud.stepOf(model, fact)
        const commands: ReadonlyArray<BooksCommand> = Option.match(
          step.maybeEdit,
          {
            onNone: () => [],
            onSome: edit =>
              edit._tag === 'ReplaceTop'
                ? [FollowReadAloudPage({ place: edit.place })]
                : [],
          },
        )
        return [{ readings: step.readings }, commands]
      },
    },
  ),
  readAloudPreview: entry(
    { maybeIsbn13: S.Option(ReadAloud.Isbn13) },
    {
      facts: [ReadAloud.ReceivedPreview, ReadAloud.FailedCheckPreview],
      modelToDependencies: model => ({
        maybeIsbn13: ReadAloud.uncheckedIsbnOf(model),
      }),
      dependenciesToStream: ReadAloud.previewStream,
      apply: (model, fact) => {
        const step = ReadAloud.stepOf(model, fact)
        return { previewChecks: step.previewChecks }
      },
    },
  ),
  audibleSignIn: entry(
    { isStarting: S.Boolean },
    {
      facts: [Audible.StartedAudibleSignIn, Audible.FailedStartAudibleSignIn],
      modelToDependencies: model => ({
        isStarting: Audible.isStartingSignIn(audibleViewOf(model)),
      }),
      dependenciesToStream: ({ isStarting }) =>
        Audible.signInStream(isStarting),
      apply: (model, fact) => {
        const [audible] = Audible.update(model.audible, fact)
        return { audible: { signIn: audible.signIn } }
      },
    },
  ),
  audibleLibrary: entry(
    { isReading: S.Boolean },
    {
      facts: [Audible.ReceivedAudibleLibrary, Audible.FailedReadAudibleLibrary],
      modelToDependencies: model => ({
        isReading: Audible.isReadingTitles(audibleViewOf(model)),
      }),
      dependenciesToStream: ({ isReading }) => Audible.libraryStream(isReading),
      apply: (model, fact) => {
        const [audible, commands, maybeOutMessage] = Audible.update(
          model.audible,
          fact,
        )
        return [
          { audible: { titles: audible.titles } },
          [...commands, ...audibleNavCommandsOf(maybeOutMessage)],
        ]
      },
    },
  ),
  audibleAudio: entry(
    { isWatching: S.Boolean },
    {
      facts: [Audible.ReceivedAudiobookAudio, Audible.FailedReadAudiobookAudio],
      modelToDependencies: model => ({
        isWatching: Audible.isWatchingAudio(audibleViewOf(model)),
      }),
      dependenciesToStream: ({ isWatching }) => Audible.audioStream(isWatching),
      apply: (model, fact) => {
        const [audible] = Audible.update(model.audible, fact)
        return { audible: { audio: audible.audio } }
      },
    },
  ),
  systemMode: entry(
    { isWatching: S.Boolean },
    {
      facts: [Theme.ObservedSystemMode],
      modelToDependencies: () => ({ isWatching: true }),
      dependenciesToStream: () => Theme.systemModeStream,
      apply: (_model, { mode }) => ({ appearance: { systemMode: mode } }),
    },
  ),
  // The contrast the system asks for, a fact from the host as the mode
  // is: a browser, a phone or any other host reports it, and one that
  // cannot know it reports Standard.
  systemContrast: entry(
    { isWatching: S.Boolean },
    {
      facts: [Theme.ObservedSystemContrast],
      modelToDependencies: () => ({ isWatching: true }),
      dependenciesToStream: () => Theme.systemContrastStream,
      apply: (_model, { contrast }) => ({
        appearance: { systemContrast: contrast },
      }),
    },
  ),
  codeStatus: entry(
    {},
    {
      facts: [CodeUpdates.ObservedCodeStatus],
      modelToDependencies: () => ({}),
      dependenciesToStream: () => CodeUpdates.statusStream,
      apply: (model, fact) => {
        const [maybeCodeStatus, commands] = CodeUpdates.update(
          model.maybeCodeStatus,
          fact,
        )
        return [{ maybeCodeStatus }, commands]
      },
    },
  ),
  audibleImport: entry(
    { maybeAsins: S.Option(S.Array(Audible.Asin)) },
    {
      facts: [
        Audible.AdvancedAudibleImport,
        Audible.ImportedAudibleTitles,
        Audible.FailedImportAudibleTitles,
      ],
      modelToDependencies: model => ({
        maybeAsins: Audible.importingAsinsOf(model.audible),
      }),
      dependenciesToStream: ({ maybeAsins }) =>
        Audible.importStream(maybeAsins),
      apply: (model, fact) => {
        const [audible, commands, maybeOutMessage] = Audible.update(
          model.audible,
          fact,
        )
        return [
          { audible: { titles: audible.titles } },
          [...commands, ...audibleNavCommandsOf(maybeOutMessage)],
        ]
      },
    },
  ),
}))

/** Facts handled directly by Books' scoped Subscriptions. */
export type BooksSubscriptionFact = Subscription.SubscriptionFactsOf<
  typeof subscriptions
>

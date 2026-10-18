import {
  Array,
  Clock,
  Duration,
  Effect,
  Option,
  Order,
  Schema as S,
  Schedule,
  Stream,
  pipe,
} from 'effect'
import { Subscription } from 'foldkit'
import * as ReadAloud from 'read-aloud-core-example'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { audibleViewOf } from './addBooks.js'
import * as Audible from './audible/index.js'
import { Milliseconds, TitleSlug } from './ids.js'
import { LibraryStore } from './library.js'
import {
  FailedReadChapters,
  FailedReadShelf,
  type Message,
  OpenedPlace,
  ReceivedChapters,
  ReceivedMember,
  ReceivedShelf,
  ReceivedUnendedPlays,
} from './message.js'
import {
  type InProgress,
  type Model,
  loadedPlayerOf,
  placeOf,
  resumePlaceOf,
  shelfOf,
  titleOf,
} from './model.js'
import { ScribeTimeline } from './scribeTimeline.js'
import type { BooksServices } from './services.js'
import { addressCueOf, loadedSlugOf, shownTitleOf } from './stack.js'

// SUBSCRIPTION

/** How often Books looks for plays a closed page left open on Scribe's timeline. */
export const unendedPlaysCheckEvery = Duration.minutes(10)

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
): Stream.Stream<Message, never, BooksServices> =>
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
        ? placeOf(model.listening)
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

/**
 * What Books listens to: the shelf from the library store for as long as
 * the Program runs, the chapters of each title that needs them, the
 * player's address when it names a place the player
 * is not at, and the loaded player's audio and words, built from
 * the Transcript Player's own entries. A new place or title restarts the
 * audio; a new speed does not, the clock reads it every step. The words
 * are read again only when the place crosses into another window. The
 * books read aloud come from the reading source for as long as the
 * Program runs, so the library's Read aloud row and an open page follow
 * the reader, and each book read aloud is asked once for a preview. The
 * Audible import starts a sign-in while its sign-in page shows, reads the
 * titles while its titles page shows, and follows an import until it is
 * done, wherever the person goes meanwhile.
 */
export const subscriptions = Subscription.make<Model, Message, BooksServices>()(
  entry => ({
    shelf: entry(
      {},
      {
        modelToDependencies: () => ({}),
        dependenciesToStream: () =>
          Stream.unwrap(
            Effect.gen(function* () {
              const store = yield* LibraryStore
              return store.shelf.pipe(
                Stream.map(shelf => ReceivedShelf({ shelf })),
                Stream.catch(error =>
                  Stream.make(FailedReadShelf({ reason: error.reason })),
                ),
              )
            }),
          ),
      },
    ),
    chapters: entry(
      { slugs: S.Array(TitleSlug) },
      {
        modelToDependencies: model => ({ slugs: wantedChapterSlugsOf(model) }),
        dependenciesToStream: ({ slugs }) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const store = yield* LibraryStore
              return Stream.mergeAll(
                Array.map(slugs, slug =>
                  store.chapters(slug).pipe(
                    Stream.map(chapters =>
                      ReceivedChapters({ slug, chapters }),
                    ),
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
      },
    ),
    clock: entry(TranscriptPlayer.ClockDependencies.fields, {
      modelToDependencies: model =>
        TranscriptPlayer.clockDependenciesOf(loadedPlayerOf(model)),
      keepAliveEquivalence: TranscriptPlayer.isSameClock,
      dependenciesToStream: TranscriptPlayer.clockStream,
    }),
    unendedPlays: entry(
      { isShelfReady: S.Boolean },
      {
        modelToDependencies: model => ({
          isShelfReady: model.library._tag === 'ShelfReady',
        }),
        dependenciesToStream: ({ isShelfReady }) =>
          unendedPlaysStream(isShelfReady),
      },
    ),
    member: entry(
      {},
      {
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
      },
    ),
    addressCue: entry(
      {
        maybeCue: S.Option(S.Struct({ slug: TitleSlug, atMs: Milliseconds })),
      },
      {
        modelToDependencies: model => ({ maybeCue: addressCueOfModel(model) }),
        dependenciesToStream: ({ maybeCue }) =>
          Option.match(maybeCue, {
            onNone: () => Stream.empty,
            onSome: ({ slug, atMs }) =>
              Stream.make(OpenedPlace({ slug, atMs })),
          }),
      },
    ),
    transcript: entry(TranscriptPlayer.TranscriptDependencies.fields, {
      modelToDependencies: model =>
        TranscriptPlayer.transcriptDependenciesOf(loadedPlayerOf(model)),
      dependenciesToStream: TranscriptPlayer.transcriptStream,
    }),
    readings: entry(
      {},
      {
        modelToDependencies: () => ({}),
        dependenciesToStream: ReadAloud.readingsStream,
      },
    ),
    readAloudPreview: entry(
      { maybeIsbn13: S.Option(ReadAloud.Isbn13) },
      {
        modelToDependencies: model => ({
          maybeIsbn13: ReadAloud.uncheckedIsbnOf(model),
        }),
        dependenciesToStream: ReadAloud.previewStream,
      },
    ),
    audibleSignIn: entry(
      { isStarting: S.Boolean },
      {
        modelToDependencies: model => ({
          isStarting: Audible.isStartingSignIn(audibleViewOf(model)),
        }),
        dependenciesToStream: ({ isStarting }) =>
          Audible.signInStream(isStarting),
      },
    ),
    audibleLibrary: entry(
      { isReading: S.Boolean },
      {
        modelToDependencies: model => ({
          isReading: Audible.isReadingTitles(audibleViewOf(model)),
        }),
        dependenciesToStream: ({ isReading }) =>
          Audible.libraryStream(isReading),
      },
    ),
    audibleImport: entry(
      { maybeAsins: S.Option(S.Array(Audible.Asin)) },
      {
        modelToDependencies: model => ({
          maybeAsins: Audible.importingAsinsOf(model.audible),
        }),
        dependenciesToStream: ({ maybeAsins }) =>
          Audible.importStream(maybeAsins),
      },
    ),
  }),
)

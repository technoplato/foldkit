import { Array, Effect, Match as M, Option } from 'effect'
import { Command } from 'foldkit'
import { type ScrubDirection, matchStepOf } from 'foldkit/renderers'

import { MediaId, Milliseconds, SearchQuery, type WordId } from './ids.js'
import { FailedSearch, type Message, ReceivedMatches } from './message.js'
import {
  LookingAt,
  type Match,
  type Model,
  Paused,
  Playing,
  ScrolledAway,
  SearchFailed,
  SearchFound,
  SearchIdle,
  Searching,
  TranscriptLoaded,
  TranscriptUnavailable,
  type Transport,
  Unplayable,
  hasAudio,
  isFollowingPlayhead,
  isSounding,
  nextSectionOf,
  previousSectionOf,
  viewPlaceOf,
  wordOf,
} from './model.js'
import {
  Advanced,
  Finished,
  Moved,
  type OutMessage,
  Stopped,
} from './outMessage.js'
import { nextParagraphOf, previousParagraphOf } from './paragraphs.js'
import { foundIn } from './search.js'
import { TranscriptSource } from './transcript.js'

// COMMAND

/**
 * Searches a whole recording for `query`: asks the transcript source for
 * the passages that may hold the words, once, and finds each place in
 * them. Only the matches come back, never the recording's words. A source
 * that cannot be read becomes FailedSearch with its reason, so a lost
 * connection never crashes the player.
 */
export const SearchRecording = Command.define(
  'SearchRecording',
  { mediaId: MediaId, query: SearchQuery },
  ReceivedMatches,
  FailedSearch,
)(({ mediaId, query }) =>
  Effect.gen(function* () {
    const source = yield* TranscriptSource
    const passages = yield* source.passagesMatching(mediaId, query)
    const { total, matches } = foundIn(passages, query)
    return ReceivedMatches({ query, total, matches })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSearch({ query, reason: error.reason })),
    ),
  ),
)

// UPDATE

/** The Model, its Commands, and what it tells the Program holding it. */
export type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, TranscriptSource>>,
  Option.Option<OutMessage>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const skipMs = 30_000

const unchanged = (model: Model): UpdateReturn => [model, [], Option.none()]

const clamped = (model: Model, placeMs: number): Milliseconds =>
  Milliseconds.make(
    Math.round(Math.min(model.media.durationMs, Math.max(0, placeMs))),
  )

const sounding = (model: Model, placeMs: Milliseconds): Model => ({
  ...model,
  placeMs,
  maybePlacedAtMs: Option.none(),
  transport: Playing({ cue: model.nextCue }),
  nextCue: model.nextCue + 1,
})

const played = (model: Model): UpdateReturn => {
  if (isSounding(model) || !hasAudio(model)) {
    return unchanged(model)
  } else {
    const placeMs =
      model.placeMs >= model.media.durationMs
        ? Milliseconds.make(0)
        : model.placeMs
    return [sounding(model, placeMs), [], Option.none()]
  }
}

const stoppedAs = (model: Model, transport: Transport): UpdateReturn =>
  isSounding(model)
    ? [
        { ...model, transport },
        [],
        Option.some(Stopped({ placeMs: model.placeMs })),
      ]
    : unchanged(model)

const following = (model: Model): Model => ({
  ...model,
  maybeAway: Option.none(),
})

const movedTo = (model: Model, placeMs: Milliseconds): UpdateReturn => [
  following(
    isSounding(model) ? sounding(model, placeMs) : { ...model, placeMs },
  ),
  [],
  Option.some(Moved({ placeMs })),
]

const movedToMaybe = (
  model: Model,
  maybePlaceMs: Option.Option<Milliseconds>,
): UpdateReturn =>
  Option.match(maybePlaceMs, {
    onNone: () => unchanged(model),
    onSome: placeMs => movedTo(model, placeMs),
  })

const playedFromWord = (model: Model, wordId: WordId): UpdateReturn =>
  Option.match(
    Option.filter(wordOf(model, wordId), () => hasAudio(model)),
    {
      onNone: () => unchanged(model),
      onSome: word => [
        following(sounding(model, word.startMs)),
        [],
        Option.some(Moved({ placeMs: word.startMs })),
      ],
    },
  )

const withSelected = (model: Model, placeMs: Milliseconds): Model =>
  Option.match(model.maybeSearch, {
    onNone: () => model,
    onSome: search =>
      search._tag === 'SearchFound' &&
      Array.some(search.matches, match => match.startMs === placeMs)
        ? {
            ...model,
            maybeSearch: Option.some(
              SearchFound({ ...search, maybeSelectedMs: Option.some(placeMs) }),
            ),
          }
        : model,
  })

const playedFrom = (model: Model, placeMs: Milliseconds): UpdateReturn =>
  hasAudio(model)
    ? [
        following(
          withSelected(sounding(model, clamped(model, placeMs)), placeMs),
        ),
        [],
        Option.some(Moved({ placeMs: clamped(model, placeMs) })),
      ]
    : unchanged(model)

const lookingAt = (model: Model, placeMs: Milliseconds): Model => ({
  ...withSelected(model, placeMs),
  maybeAway: Option.some(LookingAt({ atMs: placeMs })),
})

const shownMatch = (
  model: Model,
  maybeMatch: Option.Option<Match>,
): UpdateReturn =>
  Option.match(maybeMatch, {
    onNone: () => unchanged(model),
    onSome: match => [lookingAt(model, match.startMs), [], Option.none()],
  })

const matchesFound = (model: Model): ReadonlyArray<Match> =>
  Option.match(model.maybeSearch, {
    onNone: () => [],
    onSome: search => (search._tag === 'SearchFound' ? search.matches : []),
  })

const selectedMsOf = (model: Model): Option.Option<Milliseconds> =>
  Option.flatMap(model.maybeSearch, search =>
    search._tag === 'SearchFound' ? search.maybeSelectedMs : Option.none(),
  )

const steppedMatch = (model: Model, direction: ScrubDirection): UpdateReturn =>
  shownMatch(
    model,
    matchStepOf(
      matchesFound(model),
      Option.getOrElse(selectedMsOf(model), () => viewPlaceOf(model)),
      direction,
    ),
  )

const searchedFor = (model: Model, query: SearchQuery): UpdateReturn => [
  { ...model, maybeSearch: Option.some(Searching({ query })) },
  [SearchRecording({ mediaId: model.media.mediaId, query })],
  Option.none(),
]

const isSearchingFor = (model: Model, query: SearchQuery): boolean =>
  Option.exists(
    model.maybeSearch,
    search => search._tag === 'Searching' && search.query === query,
  )

/**
 * The matches arrive: the search holds them, and the words show the
 * first that starts at or after the place being heard, or the first of
 * all when none does. The audio does not move. Matches for words no
 * longer searched for are dropped.
 */
const receivedMatches = (
  model: Model,
  query: SearchQuery,
  total: number,
  matches: ReadonlyArray<Match>,
): UpdateReturn => {
  if (!isSearchingFor(model, query)) {
    return unchanged(model)
  }
  const found: Model = {
    ...model,
    maybeSearch: Option.some(
      SearchFound({ query, total, matches, maybeSelectedMs: Option.none() }),
    ),
  }
  return Option.match(
    Option.orElse(
      Array.findFirst(matches, match => match.startMs >= model.placeMs),
      () => Array.head(matches),
    ),
    {
      onNone: () => [found, [], Option.none()],
      onSome: match => [lookingAt(found, match.startMs), [], Option.none()],
    },
  )
}

const only = (model: Model): UpdateReturn => [model, [], Option.none()]

const reachedPlace = (
  model: Model,
  placeMs: Milliseconds,
  wallClockMs: number,
): UpdateReturn =>
  isSounding(model)
    ? [
        { ...model, placeMs, maybePlacedAtMs: Option.some(wallClockMs) },
        [],
        Option.some(Advanced({ placeMs, wallClockMs })),
      ]
    : unchanged(model)

const reachedEnd = (model: Model): UpdateReturn =>
  isSounding(model)
    ? [
        { ...model, placeMs: model.media.durationMs, transport: Paused() },
        [],
        Option.some(Finished()),
      ]
    : unchanged(model)

/**
 * The Transcript Player's update. Play starts from the place, or from the
 * start once it has reached the end; a skip, a seek, or a word moves the
 * place and keeps playing if it was; the audio's own place, end, and
 * failure come back as facts. What a parent may act on, such as saving the
 * place, comes out as an OutMessage.
 *
 * @example
 * ```typescript
 * update(player, SeekTo({ placeMs: Milliseconds.make(60_000) }))
 * // [{ ...player, placeMs: 60000 }, [], Some(Moved({ placeMs: 60000 }))]
 * ```
 */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Play: () => played(model),
      Pause: () => stoppedAs(model, Paused()),
      SkipBack: () => movedTo(model, clamped(model, model.placeMs - skipMs)),
      SkipForward: () => movedTo(model, clamped(model, model.placeMs + skipMs)),
      SeekTo: ({ placeMs }) => movedTo(model, clamped(model, placeMs)),
      SeekToWord: ({ wordId }) => playedFromWord(model, wordId),
      PreviousSection: () =>
        Option.match(previousSectionOf(model), {
          onNone: () => unchanged(model),
          onSome: section => movedTo(model, section.startMs),
        }),
      NextSection: () =>
        Option.match(nextSectionOf(model), {
          onNone: () => unchanged(model),
          onSome: section => movedTo(model, section.startMs),
        }),
      SetSeekScope: ({ scope }) => [
        { ...model, seekScope: scope },
        [],
        Option.none(),
      ],
      SetSpeed: ({ speed }) => [{ ...model, speed }, [], Option.none()],
      ReachedPlace: ({ placeMs, wallClockMs }) =>
        reachedPlace(model, placeMs, wallClockMs),
      ReachedEnd: () => reachedEnd(model),
      FailedPlayAudio: ({ reason }) => stoppedAs(model, Unplayable({ reason })),
      ReceivedPassages: ({ passages }) => [
        { ...model, transcript: TranscriptLoaded({ passages }) },
        [],
        Option.none(),
      ],
      FailedLoadTranscript: ({ reason }) => [
        { ...model, transcript: TranscriptUnavailable({ reason }) },
        [],
        Option.none(),
      ],
      PreviousParagraph: () => movedToMaybe(model, previousParagraphOf(model)),
      NextParagraph: () => movedToMaybe(model, nextParagraphOf(model)),
      ShowSearch: () =>
        only(
          Option.isSome(model.maybeSearch)
            ? model
            : { ...model, maybeSearch: Option.some(SearchIdle()) },
        ),
      CloseSearch: () => only({ ...model, maybeSearch: Option.none() }),
      SearchFor: ({ query }) => searchedFor(model, query),
      ClearSearch: () =>
        only({ ...model, maybeSearch: Option.some(SearchIdle()) }),
      NextMatch: () => steppedMatch(model, 'Next'),
      PreviousMatch: () => steppedMatch(model, 'Previous'),
      ShowMatch: ({ placeMs }) =>
        shownMatch(
          model,
          Array.findFirst(
            matchesFound(model),
            match => match.startMs === placeMs,
          ),
        ),
      PlayFrom: ({ placeMs }) => playedFrom(model, placeMs),
      LeavePlayhead: () =>
        only(
          isFollowingPlayhead(model)
            ? {
                ...model,
                maybeAway: Option.some(
                  ScrolledAway({ anchorMs: model.placeMs }),
                ),
              }
            : model,
        ),
      BackToPlayhead: () => only(following(model)),
      ReceivedMatches: ({ query, total, matches }) =>
        receivedMatches(model, query, total, matches),
      FailedSearch: ({ query, reason }) =>
        only(
          isSearchingFor(model, query)
            ? {
                ...model,
                maybeSearch: Option.some(SearchFailed({ query, reason })),
              }
            : model,
        ),
    }),
  )

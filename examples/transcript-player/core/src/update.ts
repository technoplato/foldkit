import { Array, Effect, Match as M, Option } from 'effect'
import { Command } from 'foldkit'
import { Reader } from 'foldkit/behavior'
import { type ScrubDirection, matchStepOf } from 'foldkit/renderers'

import { FailedSearch, ReceivedMatches } from './fact.js'
import { MediaId, Milliseconds, SearchQuery, type WordId } from './ids.js'
import type { Message } from './message.js'
import {
  type Match,
  type Model,
  Paused,
  Playing,
  type Search,
  SearchFailed,
  SearchFound,
  SearchIdle,
  type SearchParts,
  Searching,
  TranscriptLoaded,
  TranscriptUnavailable,
  type Transport,
  Unplayable,
  currentPlaceOf,
  hasAudio,
  isSounding,
  nextSectionOf,
  previousSectionOf,
  readerContext,
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
import { TranscriptSource, isWholeReading } from './transcript.js'

// COMMAND

/**
 * Searches a recording for `query` in the words its source holds now:
 * asks the transcript source for the passages read so far that may hold
 * the words, and finds each place in them. Only the matches come back,
 * with how many parts of the recording they are from, never the
 * recording's words. A source that cannot be read becomes FailedSearch
 * with its reason, so a lost connection never crashes the player.
 */
export const SearchRecording = Command.define(
  'SearchRecording',
  { mediaId: MediaId, query: SearchQuery },
  ReceivedMatches,
  FailedSearch,
)(({ mediaId, query }) =>
  Effect.gen(function* () {
    const source = yield* TranscriptSource
    const words = yield* source.passagesMatching(mediaId, query)
    const { total, matches } = foundIn(words.passages, query)
    return ReceivedMatches({
      query,
      total,
      matches,
      partsRead: words.partsRead,
      partsTotal: words.partsTotal,
    })
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
  maybeTickPlaceMs: Option.none(),
  maybePlacedAtMs: Option.none(),
  transport: Playing({ cue: model.nextCue }),
  nextCue: model.nextCue + 1,
})

const played = (model: Model): UpdateReturn => {
  if (isSounding(model) || !hasAudio(model)) {
    return unchanged(model)
  } else {
    const currentMs = currentPlaceOf(model)
    const placeMs =
      currentMs >= model.media.durationMs ? Milliseconds.make(0) : currentMs
    return [sounding(model, placeMs), [], Option.none()]
  }
}

const stoppedAs = (model: Model, transport: Transport): UpdateReturn => {
  if (!isSounding(model)) {
    return unchanged(model)
  } else {
    const placeMs = currentPlaceOf(model)
    return [
      { ...model, placeMs, maybeTickPlaceMs: Option.none(), transport },
      [],
      Option.some(Stopped({ placeMs })),
    ]
  }
}

const leftAtOf = (
  model: Model,
  nextReader: Reader.State,
): Option.Option<Milliseconds> => {
  if (
    Reader.isFollowing(nextReader) ||
    Option.isSome(Reader.placeOf(nextReader))
  ) {
    return Option.none()
  } else if (Reader.isFollowing(model.reader)) {
    return Option.some(currentPlaceOf(model))
  } else {
    return model.maybeLeftAtMs
  }
}

/**
 * Tells Foldkit's reader rule what happened, and keeps where the words on
 * screen stay with it: the place the voice was at when the person scrolled
 * away, and nowhere while they follow or look at a named place. A fact
 * that changes nothing gives the same Model back.
 */
const told = (model: Model, fact: Reader.Fact): Model => {
  const nextReader = Reader.step(model.reader, readerContext, fact)
  return nextReader === model.reader
    ? model
    : {
        ...model,
        reader: nextReader,
        maybeLeftAtMs: leftAtOf(model, nextReader),
      }
}

const following = (model: Model, fact: Reader.Fact): Model => ({
  ...told(model, fact),
  maybeWordMenu: Option.none(),
})

const movedTo = (model: Model, placeMs: Milliseconds): UpdateReturn => [
  following(
    isSounding(model)
      ? sounding(model, placeMs)
      : { ...model, placeMs, maybeTickPlaceMs: Option.none() },
    Reader.MovedVoice(),
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
        following(sounding(model, word.startMs), Reader.MovedVoice()),
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
          Reader.MovedVoice(),
        ),
        [],
        Option.some(Moved({ placeMs: clamped(model, placeMs) })),
      ]
    : unchanged(model)

const lookingAt = (model: Model, placeMs: Milliseconds): Model =>
  told(
    withSelected(model, placeMs),
    Reader.NamedPlace({ place: Reader.Word({ startMs: placeMs }) }),
  )

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
  {
    ...model,
    maybeSearch: Option.some(Searching({ query, maybeParts: Option.none() })),
  },
  [SearchRecording({ mediaId: model.media.mediaId, query })],
  Option.none(),
]

/**
 * The words a search still waits on more of: it is reading through for
 * them, or has found some in the parts that are in.
 */
const unfinishedSearchOf = (
  model: Model,
): Option.Option<
  Extract<Search, { _tag: 'Searching' } | { _tag: 'SearchFound' }>
> =>
  Option.flatMap(model.maybeSearch, search =>
    search._tag === 'Searching' ||
    (search._tag === 'SearchFound' && Option.isSome(search.maybeParts))
      ? Option.some(search)
      : Option.none(),
  )

const partsOf = (
  partsRead: number,
  partsTotal: number,
): Option.Option<SearchParts> =>
  isWholeReading({ partsRead, partsTotal }) || partsTotal === 0
    ? Option.none()
    : Option.some({ partsRead, partsTotal })

/**
 * More of the recording's words are in: a search still waiting on them
 * says how far the read has come and looks through what is in now. A
 * search that has every part, or none asked for, does nothing.
 */
const readSearchWords = (
  model: Model,
  partsRead: number,
  partsTotal: number,
): UpdateReturn =>
  Option.match(unfinishedSearchOf(model), {
    onNone: () => unchanged(model),
    onSome: search => [
      {
        ...model,
        maybeSearch: Option.some({
          ...search,
          maybeParts: Option.orElse(
            partsOf(partsRead, partsTotal),
            () => search.maybeParts,
          ),
        }),
      },
      [SearchRecording({ mediaId: model.media.mediaId, query: search.query })],
      Option.none(),
    ],
  })

/**
 * The matches arrive: the search holds them, and the words show the
 * first that starts at or after the place being heard, or the first of
 * all when none does. The audio does not move. While only some parts of
 * the recording are in, the search says so and keeps the match a person
 * is on as more land. Matches for words no longer searched for are
 * dropped, and so is a result from fewer parts than the one shown.
 */
const receivedMatches = (
  model: Model,
  query: SearchQuery,
  total: number,
  matches: ReadonlyArray<Match>,
  partsRead: number,
  partsTotal: number,
): UpdateReturn =>
  Option.match(
    Option.filter(
      unfinishedSearchOf(model),
      search =>
        search.query === query &&
        (search._tag === 'Searching' ||
          Option.match(search.maybeParts, {
            onNone: () => true,
            onSome: parts =>
              partsRead >= parts.partsRead || partsTotal !== parts.partsTotal,
          })),
    ),
    {
      onNone: () => unchanged(model),
      onSome: search => {
        const maybeParts = partsOf(partsRead, partsTotal)
        const isNothingRead = partsRead === 0 || partsTotal === 0
        if (isNothingRead || (Option.isSome(maybeParts) && total === 0)) {
          return [
            {
              ...model,
              maybeSearch: Option.some(Searching({ query, maybeParts })),
            },
            [],
            Option.none(),
          ]
        }
        const maybeKeptMs =
          search._tag === 'SearchFound'
            ? Option.filter(search.maybeSelectedMs, selectedMs =>
                Array.some(matches, match => match.startMs === selectedMs),
              )
            : Option.none()
        const found: Model = {
          ...model,
          maybeSearch: Option.some(
            SearchFound({
              query,
              total,
              matches,
              maybeSelectedMs: maybeKeptMs,
              maybeParts,
            }),
          ),
        }
        if (Option.isSome(maybeKeptMs)) {
          return [found, [], Option.none()]
        }
        return Option.match(
          Option.orElse(
            Array.findFirst(
              matches,
              match => match.startMs >= currentPlaceOf(model),
            ),
            () => Array.head(matches),
          ),
          {
            onNone: () => [found, [], Option.none()],
            onSome: match => [
              lookingAt(found, match.startMs),
              [],
              Option.none(),
            ],
          },
        )
      },
    },
  )

/**
 * The words could not be read: a search waiting on them fails with the
 * reason; one that has every part keeps what it found.
 */
const failedReadSearchWords = (model: Model, reason: string): UpdateReturn =>
  Option.match(unfinishedSearchOf(model), {
    onNone: () => unchanged(model),
    onSome: search => [
      {
        ...model,
        maybeSearch: Option.some(SearchFailed({ query: search.query, reason })),
      },
      [],
      Option.none(),
    ],
  })

const only = (model: Model): UpdateReturn => [model, [], Option.none()]

const reachedPlace = (
  model: Model,
  placeMs: Milliseconds,
  wallClockMs: number,
): UpdateReturn =>
  isSounding(model)
    ? [
        {
          ...model,
          maybeTickPlaceMs: Option.some(placeMs),
          maybePlacedAtMs: Option.some(wallClockMs),
        },
        [],
        Option.some(Advanced({ placeMs, wallClockMs })),
      ]
    : unchanged(model)

const reachedEnd = (model: Model): UpdateReturn =>
  isSounding(model)
    ? [
        {
          ...model,
          maybeTickPlaceMs: Option.some(model.media.durationMs),
          transport: Paused(),
        },
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
      SkipBack: () =>
        movedTo(model, clamped(model, currentPlaceOf(model) - skipMs)),
      SkipForward: () =>
        movedTo(model, clamped(model, currentPlaceOf(model) + skipMs)),
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
      FailedPlayAudio: ({ reason }) =>
        isSounding(model)
          ? [
              { ...model, transport: Unplayable({ reason }) },
              [],
              Option.some(Stopped({ placeMs: currentPlaceOf(model) })),
            ]
          : unchanged(model),
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
      LeavePlayhead: () => only(told(model, Reader.LeftVoice())),
      BackToPlayhead: () => only(following(model, Reader.ReturnedToVoice())),
      ShowWordMenu: ({ wordId }) =>
        only(
          Option.isSome(wordOf(model, wordId))
            ? { ...model, maybeWordMenu: Option.some(wordId) }
            : model,
        ),
      CloseWordMenu: () => only({ ...model, maybeWordMenu: Option.none() }),
      ReceivedMatches: ({ query, total, matches, partsRead, partsTotal }) =>
        receivedMatches(model, query, total, matches, partsRead, partsTotal),
      ReadSearchWords: ({ partsRead, partsTotal }) =>
        readSearchWords(model, partsRead, partsTotal),
      FailedReadSearchWords: ({ reason }) =>
        failedReadSearchWords(model, reason),
      FailedSearch: ({ query, reason }) =>
        only(
          Option.exists(
            unfinishedSearchOf(model),
            search => search.query === query,
          )
            ? {
                ...model,
                maybeSearch: Option.some(SearchFailed({ query, reason })),
              }
            : model,
        ),
    }),
  )

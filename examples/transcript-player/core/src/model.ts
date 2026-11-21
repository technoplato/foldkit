import { Array, Effect, Match as M, Option, Schema as S } from 'effect'
import { Program } from 'foldkit'
import { Reader } from 'foldkit/behavior'
import { ts } from 'foldkit/schema'

import { MediaId, Milliseconds, SearchQuery, Speed, WordId } from './ids.js'

// MODEL

/**
 * One named stretch of a recording, such as an audiobook's chapter: its
 * title and where it starts and ends.
 */
export const Section = S.Struct({
  title: S.String,
  startMs: Milliseconds,
  endMs: Milliseconds,
})
/** One named stretch of a recording. */
export type Section = typeof Section.Type

/**
 * The recording the player holds: its id, how long it runs, where its
 * audio is, and its sections in order, such as chapters. A recording with
 * no audio file yet has no URL, and the player will not play it.
 */
export const Media = Program.model({
  synced: {
    mediaId: MediaId,
    durationMs: Milliseconds,
  },
  loaded: {
    maybeAudioUrl: Program.loaded(S.Option(S.String), Option.none),
    sections: Program.loaded(S.Array(Section), () => []),
  },
})
/** The recording the player holds. */
export type Media = typeof Media.Type

/** One spoken word: its id, its text, and when it starts and ends. */
export const Word = S.Struct({
  wordId: WordId,
  text: S.String,
  startMs: Milliseconds,
  endMs: Milliseconds,
})
/** One spoken word. */
export type Word = typeof Word.Type

/**
 * A passage of the transcript, a few minutes of words read as one
 * paragraph, such as one segment of an audiobook's transcript.
 */
export const Passage = S.Struct({
  passageId: S.String,
  startMs: Milliseconds,
  endMs: Milliseconds,
  words: S.Array(Word),
})
/** A passage of the transcript. */
export type Passage = typeof Passage.Type

/** The words near the place are on their way. */
export const TranscriptLoading = ts('TranscriptLoading')
/** The words near the place, in order. Empty where nothing was transcribed. */
export const TranscriptLoaded = ts('TranscriptLoaded', {
  passages: S.Array(Passage),
})
/** The transcript could not be read, and why, safe to show. */
export const TranscriptUnavailable = ts('TranscriptUnavailable', {
  reason: S.String,
})
/** Where the words near the place stand. */
export const Transcript = S.Union([
  TranscriptLoading,
  TranscriptLoaded,
  TranscriptUnavailable,
])
/** Where the words near the place stand. */
export type Transcript = typeof Transcript.Type

/** The player is stopped where it is. */
export const Paused = ts('Paused')
/**
 * The player is sounding. `cue` changes whenever the place jumps, so the
 * audio restarts from the new place.
 */
export const Playing = ts('Playing', { cue: S.Int })
/**
 * The player tried to sound the recording and its audio would not play,
 * and why, safe to show. Play tries again.
 */
export const Unplayable = ts('Unplayable', { reason: S.String })
/** Whether the player is sounding. */
export const Transport = S.Union([Paused, Playing, Unplayable])
/** Whether the player is sounding. */
export type Transport = typeof Transport.Type

/**
 * What the seek bar spans: the section being heard, such as this chapter,
 * or the whole recording.
 */
export const SeekScope = S.Literals(['Section', 'Recording'])
/** What the seek bar spans. */
export type SeekScope = typeof SeekScope.Type

/**
 * One place a search found: the time its first word starts, which is the
 * word's address, the words that matched, and a few words before and
 * after them from the same passage, to show where it is.
 */
export const Match = S.Struct({
  startMs: Milliseconds,
  text: S.String,
  before: S.String,
  after: S.String,
})
/** One place a search found. */
export type Match = typeof Match.Type

/** The search is open and nothing has been searched for yet. */
export const SearchIdle = ts('SearchIdle')
/**
 * How far the read of the recording's words has come, while not all of
 * them are in: `partsRead` of `partsTotal` parts.
 */
export const SearchParts = S.Struct({ partsRead: S.Int, partsTotal: S.Int })
/** How far the read of the recording's words has come. */
export type SearchParts = typeof SearchParts.Type

/**
 * The recording is being read through for `query`, and nothing read so
 * far holds it. `maybeParts` says how far the read has come, once known.
 */
export const Searching = ts('Searching', {
  query: SearchQuery,
  maybeParts: S.OptionFromOptionalKey(SearchParts),
})
/**
 * What a search for `query` found: how many places in the whole
 * recording, the first of them in order, at most
 * {@link searchMatchesLimit}, and the one the person is on, by the time it
 * starts. While `maybeParts` is there, only those parts of the recording
 * have been read, and more matches may come.
 */
export const SearchFound = ts('SearchFound', {
  query: SearchQuery,
  total: S.Int,
  matches: S.Array(Match),
  maybeSelectedMs: S.Option(Milliseconds),
  maybeParts: S.OptionFromOptionalKey(SearchParts),
})
/** The recording could not be searched for `query`, and why, safe to show. */
export const SearchFailed = ts('SearchFailed', {
  query: SearchQuery,
  reason: S.String,
})
/** Where an open search stands. */
export const Search = S.Union([
  SearchIdle,
  Searching,
  SearchFound,
  SearchFailed,
])
/** Where an open search stands. */
export type Search = typeof Search.Type

/** How many matches a search keeps to show and step through. */
export const searchMatchesLimit = 100

/**
 * What is so for the reader's rule in this player: the word followed is
 * always the word sounding, never the newest word of a recording in
 * progress, so the way back is always Back to Playhead.
 */
export const readerContext: Reader.Context = { isLive: false }

/**
 * The Transcript Player: one recording, where it is, whether it sounds,
 * how fast, what the seek bar spans, and the words near the place.
 * `maybePlacedAtMs` is the wall-clock time the audio last reported the
 * place while playing; None after a jump until it reports again. With it
 * a painter knows the place between reports, see {@link playbackClockOf}.
 * `maybeSearch` is the search while it is open. `reader` is how the words
 * on screen stand to the word sounding, by Foldkit's shared rule
 * (`Reader` in `foldkit/behavior`): following it, or away from it, at a
 * match of a search when one is named. A Model kept before the player
 * had it opens following. `maybeLeftAtMs` is where the voice was when the
 * person scrolled away, so the words on screen stay around that place
 * while the audio plays on; None while they follow or look at a match.
 * `maybeWordMenu` is the word whose menu is open.
 */
export const Model = Program.model({
  synced: {
    media: Media,
    placeMs: Milliseconds,
    speed: Speed,
    seekScope: SeekScope,
  },
  local: {
    nextCue: Program.local(S.Int, () => 0),
    reader: Program.local(
      Reader.State.pipe(
        S.withDecodingDefaultTypeKey(Effect.succeed(Reader.initial)),
      ),
      () => Reader.initial,
    ),
  },
  loaded: {
    transcript: Program.loaded(Transcript, TranscriptLoading),
  },
  ephemeral: {
    transport: Program.ephemeral(Transport, Paused),
    maybeTickPlaceMs: Program.ephemeral(
      S.OptionFromOptionalKey(Milliseconds),
      Option.none,
    ),
    maybePlacedAtMs: Program.ephemeral(
      S.OptionFromOptionalKey(S.Number),
      Option.none,
    ),
    maybeSearch: Program.ephemeral(
      S.OptionFromOptionalKey(Search),
      Option.none,
    ),
    maybeLeftAtMs: Program.ephemeral(
      S.OptionFromOptionalKey(Milliseconds),
      Option.none,
    ),
    maybeWordMenu: Program.ephemeral(
      S.OptionFromOptionalKey(WordId),
      Option.none,
    ),
  },
})
/**
 * A Transcript Player Model value. An interface rather than an alias, so
 * every type that names it, such as each Action's, carries `Model` by
 * name instead of the whole Model again; a Program that offers the
 * player's Actions with `Catalog.within` depends on that to typecheck.
 */
export interface Model extends S.Schema.Type<typeof Model> {}

/**
 * The live place being heard: the latest ephemeral audio tick while playing,
 * falling back to the last committed `placeMs`.
 */
export const currentPlaceOf = (model: Model): Milliseconds =>
  Option.getOrElse(model.maybeTickPlaceMs, () => model.placeMs)

/**
 * A player holding `media`, paused at `placeMs` at `speed`, its words on
 * their way.
 *
 * @example
 * ```typescript
 * init(media, { placeMs: Milliseconds.make(723_000) })
 * ```
 */
export const init = (
  media: Media,
  options: Readonly<{
    placeMs?: Milliseconds
    speed?: Speed
    seekScope?: SeekScope
  }> = {},
): Model => ({
  media,
  placeMs: options.placeMs ?? Milliseconds.make(0),
  maybeTickPlaceMs: Option.none(),
  maybePlacedAtMs: Option.none(),
  transport: Paused(),
  nextCue: 0,
  speed: options.speed ?? 1,
  seekScope:
    options.seekScope ??
    (Array.isReadonlyArrayEmpty(media.sections) ? 'Recording' : 'Section'),
  transcript: TranscriptLoading(),
  maybeSearch: Option.none(),
  reader: Reader.initial,
  maybeLeftAtMs: Option.none(),
  maybeWordMenu: Option.none(),
})

/** True while the player is sounding. */
export const isSounding = (model: Model): boolean =>
  model.transport._tag === 'Playing'

/**
 * The player's clock, as a painter reads it: the place, the wall-clock
 * time the audio reported it, and how fast it moves. It runs at the speed
 * only while the player sounds and the audio has reported since the last
 * jump; paused, or just after a seek, it stands still at the place.
 *
 * @example
 * ```typescript
 * playbackClockOf(playing) // { placeMs: 20000, atMs: 1792350000000, rate: 1.5 }
 * playbackClockOf(paused) // { placeMs: 20000, atMs: 0, rate: 0 }
 * ```
 */
export const playbackClockOf = (
  model: Model,
): Readonly<{ placeMs: number; atMs: number; rate: number }> => {
  const placeMs = currentPlaceOf(model)
  return Option.match(
    Option.filter(model.maybePlacedAtMs, () => isSounding(model)),
    {
      onNone: () => ({ placeMs, atMs: 0, rate: 0 }),
      onSome: atMs => ({ placeMs, atMs, rate: model.speed }),
    },
  )
}

/** True when the recording has an audio file to play. */
export const hasAudio = (model: Model): boolean =>
  Option.isSome(model.media.maybeAudioUrl)

/** The passages near the place, empty until they arrive. */
export const passagesOf = (model: Model): ReadonlyArray<Passage> =>
  model.transcript._tag === 'TranscriptLoaded' ? model.transcript.passages : []

/**
 * The word at a place: the last one to start at or before it, within its
 * passage, so the silence after a word still shows that word.
 *
 * @example
 * ```typescript
 * wordAt(passages, Milliseconds.make(19_400)) // Some({ wordId: 'w0', text: 'Evocation', ... })
 * ```
 */
export const wordAt = (
  passages: ReadonlyArray<Passage>,
  placeMs: Milliseconds,
): Option.Option<Word> =>
  Option.flatMap(
    Array.findFirst(
      passages,
      passage => passage.startMs <= placeMs && placeMs < passage.endMs,
    ),
    passage => Array.findLast(passage.words, word => word.startMs <= placeMs),
  )

/** The word sounding now, while the words near the place are here. */
export const currentWordOf = (model: Model): Option.Option<Word> =>
  wordAt(passagesOf(model), currentPlaceOf(model))

/** The section a place falls in: the last one starting at or before it. */
export const sectionAt = (
  media: Media,
  placeMs: Milliseconds,
): Option.Option<Section> =>
  Array.findLast(media.sections, section => section.startMs <= placeMs)

/**
 * The section to go back to: this one's start, once more than a few
 * seconds into it, else the one before.
 */
export const previousSectionOf = (model: Model): Option.Option<Section> => {
  const placeMs = currentPlaceOf(model)
  const maybeCurrent = sectionAt(model.media, placeMs)
  const isWellInto = Option.exists(
    maybeCurrent,
    section => placeMs - section.startMs > restartSectionMs,
  )
  return isWellInto
    ? maybeCurrent
    : Array.findLast(
        model.media.sections,
        section => section.startMs < placeMs - restartSectionMs,
      )
}

/** The section after the one being heard. */
export const nextSectionOf = (model: Model): Option.Option<Section> => {
  const placeMs = currentPlaceOf(model)
  return Array.findFirst(
    model.media.sections,
    section => section.startMs > placeMs,
  )
}

const restartSectionMs = 3000

/** The word with this id, among the words near the place. */
export const wordOf = (model: Model, wordId: WordId): Option.Option<Word> =>
  Array.findFirst(
    Array.flatMap(passagesOf(model), passage => passage.words),
    word => word.wordId === wordId,
  )

/** The search, while it is open. */
export const searchOf = (model: Model): Option.Option<Search> =>
  model.maybeSearch

/** The words being searched for, once a search has been made. */
export const searchQueryOf = (model: Model): Option.Option<SearchQuery> =>
  Option.flatMap(model.maybeSearch, search =>
    search._tag === 'SearchIdle' ? Option.none() : Option.some(search.query),
  )

/** The matches a search found, in order; empty until it has. */
export const matchesOf = (model: Model): ReadonlyArray<Match> =>
  Option.match(model.maybeSearch, {
    onNone: () => [],
    onSome: search => (search._tag === 'SearchFound' ? search.matches : []),
  })

/** The match the person is on, while a search has one selected. */
export const selectedMatchOf = (model: Model): Option.Option<Match> =>
  Option.flatMap(model.maybeSearch, search =>
    search._tag === 'SearchFound'
      ? Option.flatMap(search.maybeSelectedMs, selectedMs =>
          Array.findFirst(
            search.matches,
            match => match.startMs === selectedMs,
          ),
        )
      : Option.none(),
  )

/** True while the words on screen follow the word sounding. */
export const isFollowingPlayhead = (model: Model): boolean =>
  Reader.isFollowing(model.reader)

const leftPlaceOf = (model: Model): Milliseconds =>
  Option.getOrElse(model.maybeLeftAtMs, () => currentPlaceOf(model))

/**
 * The place the words on screen are around: the place being heard while
 * they follow it, else where the person scrolled away or the word they
 * are looking at. The player asks its source for the words around this
 * place, so a match hours away has its words without moving the audio.
 *
 * @example
 * ```typescript
 * viewPlaceOf(following) // 723000, the place being heard
 * viewPlaceOf(atMatch) // 10802400, the match on screen, while 12:03 plays on
 * ```
 */
export const viewPlaceOf = (model: Model): Milliseconds =>
  Option.match(Reader.placeOf(model.reader), {
    onNone: () =>
      isFollowingPlayhead(model) ? currentPlaceOf(model) : leftPlaceOf(model),
    onSome: M.type<Reader.Place>().pipe(
      M.withReturnType<Milliseconds>(),
      M.tagsExhaustive({
        Word: ({ startMs }) => Milliseconds.make(startMs),
        Passage: () => leftPlaceOf(model),
      }),
    ),
  })

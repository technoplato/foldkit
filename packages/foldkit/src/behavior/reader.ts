import { Array, Match as M, Option, Schema as S } from 'effect'

import { wordAtAddress } from '../renderers/readAlong.js'
import type { TranscriptNode, TranscriptWord } from '../renderers/types.js'
import { ts } from '../schema/index.js'

// NOTE: this is the one place that decides, on the Model's side, how a
// reader stands to the voice it reads along with: following it or away
// from it, the way back, and the place to show. It names no DOM, no React
// and no phone, and it reads no clock. A Program keeps `State` in its
// Model, tells `step` what happened, and draws what `project` and
// `returnControlOf` say. What a painter does with the drawn fields is
// `TranscriptFollow`'s to say.

// PLACE

/**
 * A word to show, named by the time it starts on the Transcript's clock:
 * `Word({ startMs: 10_802_400 })` is the word that starts three hours and
 * 2.4 seconds in. A time holds when the words are made again and their
 * tokens change, and it names a word whose passage is not loaded yet.
 */
export const Word = ts('Word', { startMs: S.Number })

/**
 * A passage to show, named by its key: `Passage({ key: 's7' })` is the
 * passage a link such as `/recording/r1/section/s7` opens on.
 */
export const Passage = ts('Passage', { key: S.String })

/**
 * A place in a Transcript to show a reader: a word, such as a match a
 * search found, or a passage, such as the section a link names.
 *
 * @example
 * ```typescript
 * const match: Place = Word({ startMs: 4_000 })
 * const linked: Place = Passage({ key: 's7' })
 * ```
 */
export const Place = S.Union([Word, Passage])
/** A place in a Transcript to show a reader. */
export type Place = typeof Place.Type

// STATE

/** The words on screen follow the voice: the word followed is kept in the middle. */
export const Following = ts('Following')

/**
 * The reader is somewhere other than the word followed, and the words
 * stay where they put them. `maybePlace` is the place to show when one
 * was named: `Detached({ maybePlace: Option.some(Word({ startMs: 4_000 })) })`
 * at a match of a search, `Detached({ maybePlace: Option.none() })` after
 * a scroll away.
 */
export const Detached = ts('Detached', { maybePlace: S.Option(Place) })

/**
 * How a reader stands to the voice. It lives in the Model of the device
 * that reads: never logged, and never shown on another device.
 *
 * @example
 * ```typescript
 * const Model = S.Struct({ reader: Reader.State })
 * ```
 */
export const State = S.Union([Following, Detached])
/** How a reader stands to the voice. */
export type State = typeof State.Type

/**
 * A reader before anything has happened: the words follow the voice.
 *
 * @example
 * ```typescript
 * const init = (): Model => ({ reader: Reader.initial })
 * ```
 */
export const initial: State = Following()

/**
 * What is so when a fact arrives, read from the Model the fact arrives
 * at. `isLive` says the word followed is the newest word of a recording
 * in progress, not a word sounding: `{ isLive: true }` while a recording
 * is followed as it is made, `{ isLive: false }` for an audiobook.
 */
export const Context = S.Struct({ isLive: S.Boolean })
/** What is so when a fact arrives. */
export type Context = typeof Context.Type

// FACT

/**
 * The reader scrolled the word followed out of the middle: a painter
 * pressed the Transcript's `leaveAction`.
 */
export const LeftVoice = ts('LeftVoice')

/**
 * The reader asked for the voice again: they pressed the way back or its
 * key, or came back to a reader they had put aside.
 */
export const ReturnedToVoice = ts('ReturnedToVoice')

/**
 * The listener moved the voice on purpose: picked a word, let go of the
 * seek bar, skipped 15 seconds, stepped a paragraph, or opened a link to
 * a time. The words go with it.
 */
export const MovedVoice = ts('MovedVoice')

/**
 * A place was named to show, away from the voice: a match the reader
 * stepped to, `NamedPlace({ place: Word({ startMs: 4_000 }) })`, or the
 * section a link opens on, `NamedPlace({ place: Passage({ key: 's7' }) })`.
 */
export const NamedPlace = ts('NamedPlace', { place: Place })

/**
 * The word named is no longer to be shown: the search that named it
 * closed, or the words searched for changed.
 */
export const ForgotWord = ts('ForgotWord')

/**
 * The passage named is no longer to be shown: its mark ran out, as four
 * seconds after a link opened on it.
 */
export const ForgotPassage = ts('ForgotPassage')

/**
 * The recording in progress finished. `isPlaceSpoken` says the place the
 * voice stands at is on or past the first thing said, so words that
 * follow it would leave the newest words for that place.
 */
export const FinishedLive = ts('FinishedLive', { isPlaceSpoken: S.Boolean })

/**
 * Everything a Program tells the reader's rule.
 *
 * @example
 * ```typescript
 * const fact: Fact = NamedPlace({ place: Word({ startMs: 4_000 }) })
 * ```
 */
export const Fact = S.Union([
  LeftVoice,
  ReturnedToVoice,
  MovedVoice,
  NamedPlace,
  ForgotWord,
  ForgotPassage,
  FinishedLive,
])
/** Everything a Program tells the reader's rule. */
export type Fact = typeof Fact.Type

// STEP

/**
 * Whether the words follow the voice.
 *
 * @example
 * ```typescript
 * isFollowing(Following()) // true
 * isFollowing(Detached({ maybePlace: Option.none() })) // false
 * ```
 */
export const isFollowing = (state: State): boolean => state._tag === 'Following'

/**
 * The place to show, while one is named.
 *
 * @example
 * ```typescript
 * placeOf(Detached({ maybePlace: Option.some(Passage({ key: 's7' })) })) // Some(Passage({ key: 's7' }))
 * placeOf(Following()) // None
 * ```
 */
export const placeOf = (state: State): Option.Option<Place> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<Place>>(),
    M.tagsExhaustive({
      Following: () => Option.none(),
      Detached: ({ maybePlace }) => maybePlace,
    }),
  )

const away: State = Detached({ maybePlace: Option.none() })

const followingFrom = (state: State): State =>
  isFollowing(state) ? state : Following()

const forgetting = (state: State, kind: Place['_tag']): State =>
  Option.exists(placeOf(state), place => place._tag === kind) ? away : state

/**
 * The reader's rule, whole: what one fact leads to. It is pure, so Books
 * and Words stand to the voice the same way, and it is tested with no
 * page.
 *
 * - The reader left: the words stop following and stay where they are.
 *   A reader already away keeps the place they are at.
 * - The reader asked for the voice, or moved it: the words follow again
 *   and no place is named.
 * - A place was named: the words stop following and that place is the one
 *   to show, in place of any named before.
 * - The named word, or passage, is forgotten: the reader stays away, with
 *   no place.
 * - A recording in progress finished while its newest word was followed:
 *   when the place has something said, the words stop following, so the
 *   reader stays at the newest words. Otherwise they keep following.
 *
 * @example
 * ```typescript
 * step(Following(), { isLive: false }, LeftVoice())
 * // Detached({ maybePlace: None })
 *
 * step(Detached({ maybePlace: Option.none() }), { isLive: false }, MovedVoice())
 * // Following()
 *
 * step(Following(), { isLive: true }, FinishedLive({ isPlaceSpoken: true }))
 * // Detached({ maybePlace: None })
 * ```
 */
export const step = (state: State, context: Context, fact: Fact): State =>
  M.value(fact).pipe(
    M.withReturnType<State>(),
    M.tagsExhaustive({
      LeftVoice: () => (isFollowing(state) ? away : state),
      ReturnedToVoice: () => followingFrom(state),
      MovedVoice: () => followingFrom(state),
      NamedPlace: ({ place }) => Detached({ maybePlace: Option.some(place) }),
      ForgotWord: () => forgetting(state, 'Word'),
      ForgotPassage: () => forgetting(state, 'Passage'),
      FinishedLive: ({ isPlaceSpoken }) =>
        isFollowing(state) && context.isLive && isPlaceSpoken ? away : state,
    }),
  )

// PROJECTION

const wordStartingAt = (
  transcript: TranscriptNode,
  startMs: number,
): Option.Option<TranscriptWord> =>
  Array.findFirst(transcript.passages, passage =>
    Array.findFirst(passage.words, word => word.startMs === startMs),
  )

const shownWordOf = (
  transcript: TranscriptNode,
  startMs: number,
): Option.Option<TranscriptWord> =>
  Option.orElse(wordStartingAt(transcript, startMs), () =>
    wordAtAddress(transcript, startMs),
  )

/**
 * A Transcript with what the reader's state says written on the fields
 * every painter already draws: `isFollowing`, the `leaveAction` a painter
 * presses when the reader scrolls away, `focusToken` for a named word,
 * and `isFocused` on a named passage.
 *
 * A named word is found each time: the first word that starts on its
 * millisecond, else the last to start before it, which is the nearest
 * word there is while the word's own passage has not arrived. A passage
 * that is not marked is the same value it was, so a painter that draws a
 * passage again only when it changed draws none of them again.
 *
 * @example
 * ```typescript
 * project(Detached({ maybePlace: Option.some(Word({ startMs: 4_000 })) }), transcript, { leaveAction: 'LeavePlayhead' })
 * // { ...transcript, isFollowing: false, leaveAction: 'LeavePlayhead', focusToken: 'section-0:4' }
 *
 * project(Detached({ maybePlace: Option.some(Passage({ key: 's7' })) }), transcript, { leaveAction: 'ScrolledTranscriptAway' })
 * // { ...transcript, isFollowing: false, leaveAction: 'ScrolledTranscriptAway', passages: [..., { key: 's7', isFocused: true, ... }] }
 * ```
 */
export const project = (
  state: State,
  transcript: TranscriptNode,
  options: Readonly<{ leaveAction: string }>,
): TranscriptNode => {
  const told: TranscriptNode = {
    ...transcript,
    isFollowing: isFollowing(state),
    leaveAction: options.leaveAction,
  }
  return Option.match(placeOf(state), {
    onNone: () => told,
    onSome: M.type<Place>().pipe(
      M.withReturnType<TranscriptNode>(),
      M.tagsExhaustive({
        Word: ({ startMs }) =>
          Option.match(shownWordOf(transcript, startMs), {
            onNone: () => told,
            onSome: word => ({ ...told, focusToken: word.token }),
          }),
        Passage: ({ key }) => ({
          ...told,
          passages: Array.map(transcript.passages, passage =>
            passage.key === key ? { ...passage, isFocused: true } : passage,
          ),
        }),
      }),
    ),
  })
}

// RETURN

/**
 * Where the way back takes a reader: to the word sounding, the
 * `Playhead`, or to the newest word of a recording in progress, `Live`.
 */
export const ReturnTarget = S.Literals(['Playhead', 'Live'])
/** Where the way back takes a reader. */
export type ReturnTarget = typeof ReturnTarget.Type

/**
 * The way back to the voice, as data for a Program to draw where its
 * layout puts it: where it goes, and what it is called.
 *
 * @example
 * ```typescript
 * const control: ReturnControl = { target: 'Live', label: 'Back to Live' }
 * ```
 */
export const ReturnControl = S.Struct({
  target: ReturnTarget,
  label: S.String,
})
/** The way back to the voice, as data. */
export type ReturnControl = typeof ReturnControl.Type

/**
 * What the way back is called. This is the only place the two labels are
 * spelled; a Catalog label, a button and a line of help read it.
 *
 * @example
 * ```typescript
 * returnLabelOf('Playhead') // 'Back to Playhead'
 * returnLabelOf('Live') // 'Back to Live'
 * ```
 */
export const returnLabelOf = (target: ReturnTarget): string =>
  M.value(target).pipe(
    M.withReturnType<string>(),
    M.when('Playhead', () => 'Back to Playhead'),
    M.when('Live', () => 'Back to Live'),
    M.exhaustive,
  )

/**
 * The way back to the voice, while it shows: whenever the words do not
 * follow. It goes to `Live` while the word followed is the newest of a
 * recording in progress, else to the `Playhead`.
 *
 * @example
 * ```typescript
 * returnControlOf(Following(), { isLive: false }) // None
 * returnControlOf(Detached({ maybePlace: Option.none() }), { isLive: false })
 * // Some({ target: 'Playhead', label: 'Back to Playhead' })
 * returnControlOf(Detached({ maybePlace: Option.none() }), { isLive: true })
 * // Some({ target: 'Live', label: 'Back to Live' })
 * ```
 */
export const returnControlOf = (
  state: State,
  context: Context,
): Option.Option<ReturnControl> => {
  if (isFollowing(state)) {
    return Option.none()
  } else {
    const target: ReturnTarget = context.isLive ? 'Live' : 'Playhead'
    return Option.some({ target, label: returnLabelOf(target) })
  }
}

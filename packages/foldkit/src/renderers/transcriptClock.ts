import { Array, Option, Schema as S } from 'effect'

import { ts } from '../schema/index.js'
import type {
  TranscriptClock,
  TranscriptNode,
  TranscriptPassage,
  TranscriptWord,
} from './types.js'

// CLOCK

const maxAheadMs = 1500

/**
 * The place a Transcript's clock has reached at the wall-clock time
 * `nowMs`: the reported place plus the time since the report at the
 * clock's rate. It stays at the reported place while paused and before
 * the report, and never runs more than a second and a half past it, so a
 * player that stopped reporting does not read on by itself.
 *
 * @example
 * ```typescript
 * transcriptPlaceAt({ placeMs: 10_000, atMs: 1_000_000, rate: 1 }, 1_000_400) // 10_400
 * transcriptPlaceAt({ placeMs: 10_000, atMs: 1_000_000, rate: 0 }, 1_000_400) // 10_000
 * ```
 */
export const transcriptPlaceAt = (
  clock: TranscriptClock,
  nowMs: number,
): number =>
  clock.placeMs +
  Math.min(maxAheadMs, Math.max(0, nowMs - clock.atMs) * clock.rate)

// SPOKEN

/** A word is being spoken: the last word to start at or before the place. */
export const SpokenWord = ts('SpokenWord', { token: S.String })

/**
 * The place is in a passage that has no words of its own, such as a line
 * of text with no word times or one whose words are held back. The
 * passage is spoken as one unit, from its `startMs` until the next word or
 * wordless passage starts.
 */
export const SpokenPassage = ts('SpokenPassage', { key: S.String })

/** What is being spoken at a place: a word, or a passage with no words. */
export const SpokenUnit = S.Union([SpokenWord, SpokenPassage])
/** What is being spoken at a place: a word, or a passage with no words. */
export type SpokenUnit = typeof SpokenUnit.Type

// NOTE: one thing that can be spoken, in the order it is spoken: a word,
// which has a `token`, or a passage with no words, which has none.
type Timed = Readonly<{
  startMs: number
  passageIndex: number
  passageKey: string
  token?: string
}>

type TranscriptIndex = Readonly<{
  readonly timed: ReadonlyArray<Timed>
  readonly isMonotonic: boolean
  readonly passageIndicesByToken: ReadonlyMap<string, ReadonlyArray<number>>
  readonly currentPassageIndices: ReadonlyArray<number>
}>

const passageIndexCache = new WeakMap<
  ReadonlyArray<TranscriptPassage>,
  TranscriptIndex
>()

const buildTranscriptIndex = (
  passages: ReadonlyArray<TranscriptPassage>,
): TranscriptIndex => {
  const timed: Array<Timed> = []
  const passageIndicesByToken = new Map<string, Array<number>>()
  const currentPassageIndices: Array<number> = []
  let isMonotonic = true
  let previousStartMs = Number.NEGATIVE_INFINITY

  for (let passageIndex = 0; passageIndex < passages.length; passageIndex++) {
    const passage = passages.at(passageIndex)
    if (passage === undefined) {
      continue
    }

    let hasCurrentWord = passage.isCurrent === true

    if (passage.words.length === 0 && passage.startMs !== undefined) {
      if (passage.startMs < previousStartMs) {
        isMonotonic = false
      }
      previousStartMs = passage.startMs
      timed.push({
        startMs: passage.startMs,
        passageIndex,
        passageKey: passage.key,
      })
    }

    for (const word of passage.words) {
      if (word.isCurrent === true) {
        hasCurrentWord = true
      }

      if (word.startMs !== undefined) {
        if (word.startMs < previousStartMs) {
          isMonotonic = false
        }
        previousStartMs = word.startMs
        timed.push({
          startMs: word.startMs,
          passageIndex,
          passageKey: passage.key,
          token: word.token,
        })
      }

      const existing = passageIndicesByToken.get(word.token)
      if (existing === undefined) {
        passageIndicesByToken.set(word.token, [passageIndex])
      } else if (existing.at(-1) !== passageIndex) {
        existing.push(passageIndex)
      }
    }

    if (hasCurrentWord) {
      currentPassageIndices.push(passageIndex)
    }
  }

  return {
    timed,
    isMonotonic,
    passageIndicesByToken,
    currentPassageIndices,
  }
}

const indexOfPassages = (
  passages: ReadonlyArray<TranscriptPassage>,
): TranscriptIndex => {
  const cached = passageIndexCache.get(passages)
  if (cached !== undefined) {
    return cached
  }

  const built = buildTranscriptIndex(passages)
  passageIndexCache.set(passages, built)
  return built
}

const findLastTimedAtOrBefore = (
  index: TranscriptIndex,
  placeMs: number,
): Option.Option<Timed> => {
  const { timed, isMonotonic } = index
  const first = timed.at(0)
  if (first === undefined) {
    return Option.none()
  }

  if (!isMonotonic) {
    return Array.findLast(timed, word => word.startMs <= placeMs)
  }

  if (first.startMs > placeMs) {
    return Option.none()
  }

  let low = 0
  let high = timed.length - 1
  let answer = 0

  while (low <= high) {
    const mid = (low + high) >>> 1
    const candidate = timed.at(mid)
    if (candidate !== undefined && candidate.startMs <= placeMs) {
      answer = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return Option.fromNullishOr(timed.at(answer))
}

const spokenAt = (
  transcript: TranscriptNode,
  nowMs: number,
): Option.Option<Timed> =>
  Option.flatMap(Option.fromNullishOr(transcript.clock), clock =>
    findLastTimedAtOrBefore(
      indexOfPassages(transcript.passages),
      transcriptPlaceAt(clock, nowMs),
    ),
  )

/**
 * What is being spoken at the wall-clock time `nowMs`: the last word, or
 * passage with no words, to start at or before the place the Transcript's
 * clock has reached. A passage has no words when its text has no word
 * times or its words are held back; it needs a `startMs` to be spoken.
 * None for a Transcript with no clock or no times, and before the first
 * word or wordless passage.
 *
 * @example
 * ```typescript
 * spokenUnitAt(transcript, Date.now()) // Some(SpokenWord({ token: 'w4012' }))
 * spokenUnitAt(transcript, Date.now()) // Some(SpokenPassage({ key: 'section-7' })), inside a sealed line
 * ```
 */
export const spokenUnitAt = (
  transcript: TranscriptNode,
  nowMs: number,
): Option.Option<SpokenUnit> =>
  Option.map(spokenAt(transcript, nowMs), spoken =>
    spoken.token === undefined
      ? SpokenPassage({ key: spoken.passageKey })
      : SpokenWord({ token: spoken.token }),
  )

/**
 * The token of the word being spoken at the wall-clock time `nowMs`: the
 * last word to start at or before the place the Transcript's clock has
 * reached. None for a Transcript with no clock or no word times, before
 * its first word, and while the place is in a passage with no words,
 * which `spokenUnitAt` names.
 *
 * @example
 * ```typescript
 * currentWordTokenAt(transcript, Date.now()) // Some('w4012')
 * ```
 */
export const currentWordTokenAt = (
  transcript: TranscriptNode,
  nowMs: number,
): Option.Option<string> =>
  Option.flatMap(spokenAt(transcript, nowMs), spoken =>
    Option.fromNullishOr(spoken.token),
  )

const markedWord =
  (token: string | undefined) =>
  (word: TranscriptWord): TranscriptWord => {
    const { isCurrent: _isCurrent, ...unmarked } = word
    return word.token === token ? { ...unmarked, isCurrent: true } : unmarked
  }

const markedPassage =
  (token: string | undefined, spokenPassageIndices: ReadonlyArray<number>) =>
  (passage: TranscriptPassage, passageIndex: number): TranscriptPassage => {
    const isSpoken = spokenPassageIndices.includes(passageIndex)
    const isAlreadySo = Array.every(
      passage.words,
      word => (word.isCurrent === true) === (word.token === token),
    )
    // NOTE: A passage the word neither left nor entered is handed back as
    // the object it was, so a painter repaints only the passages that
    // changed.
    if (isAlreadySo && (passage.isCurrent === true) === isSpoken) {
      return passage
    }
    const { isCurrent: _isCurrent, ...unmarked } = passage
    const words = Array.map(passage.words, markedWord(token))
    return isSpoken
      ? { ...unmarked, isCurrent: true, words }
      : { ...unmarked, words }
  }

/**
 * A Transcript as it reads at the wall-clock time `nowMs`: what is being
 * spoken then marked current, and nothing else. That is the word being
 * spoken and its passage, or, while the place is in a passage with no
 * words, that passage alone. Before the first of them nothing is marked.
 * A painter calls it on its own clock, many times a second, and paints
 * when the mark moves, so it moves on the word while the Program hears the
 * place once a second. A Transcript with no clock or no times comes back
 * as it is.
 *
 * @example
 * ```typescript
 * transcriptExcerptOf(transcriptAt(transcript, Date.now()))
 * ```
 */
export const transcriptAt = (
  transcript: TranscriptNode,
  nowMs: number,
): TranscriptNode => {
  const index = indexOfPassages(transcript.passages)
  if (transcript.clock === undefined || index.timed.length === 0) {
    return transcript
  }
  const maybeSpoken = spokenAt(transcript, nowMs)
  const token = Option.getOrUndefined(
    Option.flatMap(maybeSpoken, spoken => Option.fromNullishOr(spoken.token)),
  )
  const targetIndices = Option.match(maybeSpoken, {
    onNone: (): ReadonlyArray<number> => [],
    onSome: spoken =>
      spoken.token === undefined
        ? [spoken.passageIndex]
        : (index.passageIndicesByToken.get(spoken.token) ?? []),
  })
  const candidateIndices = new Set<number>([
    ...index.currentPassageIndices,
    ...targetIndices,
  ])

  const mark = markedPassage(token, targetIndices)
  let nextPassages: Array<TranscriptPassage> | undefined = undefined

  for (const passageIndex of candidateIndices) {
    const current = transcript.passages.at(passageIndex)
    if (current === undefined) {
      continue
    }

    const updated = mark(current, passageIndex)
    if (updated !== current) {
      if (nextPassages === undefined) {
        nextPassages = [...transcript.passages]
      }
      nextPassages[passageIndex] = updated
    }
  }

  if (nextPassages === undefined) {
    return transcript
  }

  passageIndexCache.set(nextPassages, {
    timed: index.timed,
    isMonotonic: index.isMonotonic,
    passageIndicesByToken: index.passageIndicesByToken,
    currentPassageIndices: targetIndices,
  })

  return {
    ...transcript,
    passages: nextPassages,
  }
}

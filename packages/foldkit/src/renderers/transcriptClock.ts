import { Array, Option } from 'effect'

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

type Timed = Readonly<{ token: string; startMs: number }>

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

    for (const word of passage.words) {
      if (word.isCurrent === true) {
        hasCurrentWord = true
      }

      if (word.startMs !== undefined) {
        if (word.startMs < previousStartMs) {
          isMonotonic = false
        }
        previousStartMs = word.startMs
        timed.push({ token: word.token, startMs: word.startMs })
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

/**
 * The token of the word being spoken at the wall-clock time `nowMs`: the
 * last word to start at or before the place the Transcript's clock has
 * reached. None for a Transcript with no clock or no word times, and
 * before its first word.
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
  Option.flatMap(Option.fromNullishOr(transcript.clock), clock => {
    const placeMs = transcriptPlaceAt(clock, nowMs)
    const index = indexOfPassages(transcript.passages)
    return Option.map(
      findLastTimedAtOrBefore(index, placeMs),
      word => word.token,
    )
  })

const markedWord =
  (token: string) =>
  (word: TranscriptWord): TranscriptWord => {
    const { isCurrent: _isCurrent, ...unmarked } = word
    return word.token === token ? { ...unmarked, isCurrent: true } : unmarked
  }

const markedPassage =
  (token: string) =>
  (passage: TranscriptPassage): TranscriptPassage => {
    const hasWord = Array.some(passage.words, word => word.token === token)
    const isAlreadySo = Array.every(
      passage.words,
      word => (word.isCurrent === true) === (word.token === token),
    )
    // NOTE: A passage the word neither left nor entered is handed back as
    // the object it was, so a painter repaints only the passages that
    // changed.
    if (isAlreadySo && (passage.isCurrent === true) === hasWord) {
      return passage
    }
    const { isCurrent: _isCurrent, ...unmarked } = passage
    const words = Array.map(passage.words, markedWord(token))
    return hasWord
      ? { ...unmarked, isCurrent: true, words }
      : { ...unmarked, words }
  }

/**
 * A Transcript as it reads at the wall-clock time `nowMs`: the word being
 * spoken then, and its passage, marked current, and no other. A painter
 * calls it on its own clock, many times a second, and paints the word
 * when it changes, so the mark moves on the word while the Program hears
 * the place once a second. A Transcript with no clock or no word times
 * comes back as it is.
 *
 * @example
 * ```typescript
 * transcriptExcerptOf(transcriptAt(transcript, Date.now()))
 * ```
 */
export const transcriptAt = (
  transcript: TranscriptNode,
  nowMs: number,
): TranscriptNode =>
  Option.match(currentWordTokenAt(transcript, nowMs), {
    onNone: () => transcript,
    onSome: token => {
      const index = indexOfPassages(transcript.passages)
      const targetIndices = index.passageIndicesByToken.get(token) ?? []
      const candidateIndices = new Set<number>([
        ...index.currentPassageIndices,
        ...targetIndices,
      ])

      const mark = markedPassage(token)
      let nextPassages: Array<TranscriptPassage> | undefined = undefined

      for (const passageIndex of candidateIndices) {
        const current = transcript.passages.at(passageIndex)
        if (current === undefined) {
          continue
        }

        const updated = mark(current)
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
    },
  })

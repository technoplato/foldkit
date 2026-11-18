import { Effect, Stream } from 'effect'

import type { MountAction } from '../mount/index.js'
import { transcriptPlaceAt } from './transcriptClock.js'

// NOTE: This is the edge of the Foldkit HTML painter: small effects that
// run on the page beside the painted elements, told what to do only by
// the attributes the view puts there. The Program says the clock; the
// edge reads on from it between reports, so the page moves on the word
// while the Program hears the place about once a second.

/** The name of the mount that moves the spoken word on a painted Transcript. */
export const transcriptClockMountName = 'FoldkitTranscriptClock'

/** A word is never marked later than this after it starts. */
const PAINT_GAP_MS = 40

const CLOCK_ATTRIBUTES: ReadonlyArray<string> = [
  'data-clock-place-ms',
  'data-clock-at-ms',
  'data-clock-rate',
]

const WORD_SELECTOR = '.fk-word[data-start-ms]'

const PASSAGE_SELECTOR = '.fk-passage'

const CURRENT = 'data-current'

type PaintedClock = Readonly<{ placeMs: number; atMs: number; rate: number }>

const numberOf = (element: Element, name: string): number | undefined => {
  const text = element.getAttribute(name)
  const value = text === null ? Number.NaN : Number(text)
  return Number.isFinite(value) ? value : undefined
}

const clockOf = (transcript: Element): PaintedClock | undefined => {
  const placeMs = numberOf(transcript, 'data-clock-place-ms')
  const atMs = numberOf(transcript, 'data-clock-at-ms')
  const rate = numberOf(transcript, 'data-clock-rate')
  return placeMs === undefined || atMs === undefined || rate === undefined
    ? undefined
    : { placeMs, atMs, rate }
}

const startOf = (word: Element): number =>
  numberOf(word, 'data-start-ms') ?? Number.POSITIVE_INFINITY

/** The last word to start at or before `placeMs`, by binary search. */
const spokenWordIn = (
  words: ReadonlyArray<Element>,
  placeMs: number,
): Element | undefined => {
  const search = (
    low: number,
    high: number,
    found: Element | undefined,
  ): Element | undefined => {
    if (low > high) {
      return found
    } else {
      const middle = Math.floor((low + high) / 2)
      const word = words[middle]
      return word !== undefined && startOf(word) <= placeMs
        ? search(middle + 1, high, word)
        : search(low, middle - 1, found)
    }
  }
  return search(0, words.length - 1, undefined)
}

const markOnly = (
  transcript: Element,
  selector: string,
  maybeElement: Element | undefined,
): void => {
  transcript.querySelectorAll(`${selector}[${CURRENT}]`).forEach(marked => {
    if (marked !== maybeElement) {
      marked.removeAttribute(CURRENT)
    }
  })
  if (maybeElement !== undefined && !maybeElement.hasAttribute(CURRENT)) {
    maybeElement.setAttribute(CURRENT, 'true')
  }
}

/**
 * Marks, on a painted Transcript, the word its clock has reached at the
 * wall-clock time `nowMs`, and that word's passage, and no other: the
 * last word to start at or before the place the clock reads, as
 * `transcriptAt` says for every painter. A Transcript painted without a
 * clock is left as the view painted it. `words` may be given when the
 * caller already holds the Transcript's words in order.
 *
 * @example
 * ```typescript
 * markSpokenWord(transcriptElement, Date.now())
 * ```
 */
export const markSpokenWord = (
  transcript: Element,
  nowMs: number,
  words: ReadonlyArray<Element> = [
    ...transcript.querySelectorAll(WORD_SELECTOR),
  ],
): void => {
  const clock = clockOf(transcript)
  if (clock !== undefined) {
    const maybeWord = spokenWordIn(words, transcriptPlaceAt(clock, nowMs))
    if (maybeWord !== undefined) {
      markOnly(transcript, '.fk-word', maybeWord)
      markOnly(
        transcript,
        PASSAGE_SELECTOR,
        maybeWord.closest(PASSAGE_SELECTOR) ?? undefined,
      )
    }
  }
}

/**
 * Runs `markSpokenWord` on a painted Transcript: about 25 times a second
 * while its clock runs, once when the clock is told something new while
 * it stands still, and not at all otherwise. The words are read from the
 * page once, and again only after its passages change. It stops with the
 * tab in the background, as animation frames do.
 */
const runTranscriptClock = (transcript: Element): (() => void) => {
  const state: {
    frame: number
    isRunning: boolean
    paintedAtMs: number
    maybeWords: ReadonlyArray<Element> | undefined
  } = {
    frame: 0,
    isRunning: false,
    paintedAtMs: Number.NEGATIVE_INFINITY,
    maybeWords: undefined,
  }
  const step = (frameMs: number) => {
    if (frameMs - state.paintedAtMs >= PAINT_GAP_MS) {
      const words = state.maybeWords ?? [
        ...transcript.querySelectorAll(WORD_SELECTOR),
      ]
      state.maybeWords = words
      markSpokenWord(transcript, Date.now(), words)
      state.paintedAtMs = frameMs
      if ((clockOf(transcript)?.rate ?? 0) <= 0) {
        state.isRunning = false
        return
      }
    }
    state.frame = window.requestAnimationFrame(step)
  }
  const wake = () => {
    state.paintedAtMs = Number.NEGATIVE_INFINITY
    if (!state.isRunning) {
      state.isRunning = true
      state.frame = window.requestAnimationFrame(step)
    }
  }
  const told = new MutationObserver(wake)
  told.observe(transcript, {
    attributes: true,
    attributeFilter: [...CLOCK_ATTRIBUTES],
  })
  const passages = new MutationObserver(() => {
    state.maybeWords = undefined
    wake()
  })
  passages.observe(transcript, { childList: true, subtree: true })
  wake()
  return () => {
    told.disconnect()
    passages.disconnect()
    window.cancelAnimationFrame(state.frame)
    state.isRunning = false
  }
}

/**
 * The mount a painted Transcript with a clock carries: it moves the mark
 * on the word between a Program's reports of the place. It sends the
 * Program nothing, so any Program's page can carry it.
 *
 * @example
 * ```typescript
 * h.section([h.Class('fk-transcript'), h.OnMount(transcriptClockMount())], passages)
 * ```
 */
export const transcriptClockMount = <Message>(): MountAction<Message> => ({
  name: transcriptClockMountName,
  f: transcript =>
    Stream.callback<Message>(() =>
      Effect.acquireRelease(
        Effect.sync(() => runTranscriptClock(transcript)),
        stop => Effect.sync(stop),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
})

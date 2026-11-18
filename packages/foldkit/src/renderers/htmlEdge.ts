import { Effect, Queue, Stream } from 'effect'

import type { MountAction } from '../mount/index.js'
import { transcriptPlaceAt } from './transcriptClock.js'

// NOTE: This is the edge of the Foldkit HTML painter: small effects that
// run on the page beside the painted elements, told what to do only by
// the attributes the view puts there. The Program says the clock; the
// edge reads on from it between reports, so the page moves on the word
// while the Program hears the place about once a second.

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

/** The name of the mount every painted Transcript carries. */
export const transcriptMountName = 'FoldkitTranscript'

const LONG_PRESS_MS = 500

const LONG_PRESS_SLACK_PX = 10

const wordOfTarget = (target: EventTarget | null): Element | undefined =>
  target instanceof Element
    ? (target.closest('.fk-word[data-token]') ?? undefined)
    : undefined

/**
 * Opens a word's menu on a long press with a finger or a pen, the way a
 * right click does: it sends the word the same `contextmenu` the view
 * already answers, so the Program is told through the view's own, current
 * handler. A press that moves, or lifts early, opens nothing; the tap that
 * ends a long press does not also play from the word.
 */
const runLongPress = (transcript: Element): (() => void) => {
  const state: {
    maybePress: Readonly<{ x: number; y: number; timer: number }> | undefined
    isClickSwallowed: boolean
  } = { maybePress: undefined, isClickSwallowed: false }
  const end = () => {
    if (state.maybePress !== undefined) {
      window.clearTimeout(state.maybePress.timer)
      state.maybePress = undefined
    }
  }
  const onDown = (event: Event) => {
    const maybeWord = wordOfTarget(event.target)
    if (
      maybeWord === undefined ||
      !(event instanceof PointerEvent) ||
      event.pointerType === 'mouse' ||
      transcript.getAttribute('data-word-menu') !== 'true'
    ) {
      return
    }
    end()
    state.maybePress = {
      x: event.clientX,
      y: event.clientY,
      timer: window.setTimeout(() => {
        state.maybePress = undefined
        state.isClickSwallowed = true
        maybeWord.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
        )
      }, LONG_PRESS_MS),
    }
  }
  const onMove = (event: Event) => {
    const press = state.maybePress
    if (
      press !== undefined &&
      event instanceof PointerEvent &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) >
        LONG_PRESS_SLACK_PX
    ) {
      end()
    }
  }
  const onClick = (event: Event) => {
    if (state.isClickSwallowed) {
      state.isClickSwallowed = false
      event.stopPropagation()
      event.preventDefault()
    }
  }
  transcript.addEventListener('pointerdown', onDown)
  transcript.addEventListener('pointermove', onMove)
  transcript.addEventListener('pointerup', end)
  transcript.addEventListener('pointercancel', end)
  transcript.addEventListener('click', onClick, true)
  return () => {
    end()
    transcript.removeEventListener('pointerdown', onDown)
    transcript.removeEventListener('pointermove', onMove)
    transcript.removeEventListener('pointerup', end)
    transcript.removeEventListener('pointercancel', end)
    transcript.removeEventListener('click', onClick, true)
  }
}

/**
 * The mount every painted Transcript carries, the edge of the HTML
 * painter: it moves the mark on the word between a Program's reports of
 * the place, where the Transcript has a clock, and opens a word's menu on
 * a long press, where it offers one. What it does is told only by the
 * element's attributes, and it sends the Program nothing itself, so any
 * Program's page can carry it.
 *
 * @example
 * ```typescript
 * h.section([h.Class('fk-transcript'), h.OnMount(transcriptMount())], passages)
 * ```
 */
export const transcriptMount = <Message>(): MountAction<Message> => ({
  name: transcriptMountName,
  f: transcript =>
    Stream.callback<Message>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const stopClock = runTranscriptClock(transcript)
          const stopLongPress = runLongPress(transcript)
          return () => {
            stopClock()
            stopLongPress()
          }
        }),
        stop => Effect.sync(stop),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
})

const MENU_GAP_PX = 8

const MENU_EDGE_PX = 8

/**
 * Puts an open word menu by its word: under it, or above it where there
 * is no room below, and inside the window. The menu is named for the word.
 *
 * @example
 * ```typescript
 * placeWordMenu(menuElement, 'w4012')
 * ```
 */
export const placeWordMenu = (menu: HTMLElement, token: string): void => {
  const maybeWord = (
    menu.closest('.fk-transcript') ??
    menu.parentElement ??
    document
  ).querySelector(`[data-token="${CSS.escape(token)}"]`)
  if (maybeWord !== null) {
    const bounds = maybeWord.getBoundingClientRect()
    const size = menu.getBoundingClientRect()
    const below = bounds.bottom + MENU_GAP_PX
    const fitsBelow = below + size.height <= window.innerHeight - MENU_EDGE_PX
    const left = Math.max(
      MENU_EDGE_PX,
      Math.min(bounds.left, window.innerWidth - size.width - MENU_EDGE_PX),
    )
    const top = fitsBelow
      ? below
      : Math.max(MENU_EDGE_PX, bounds.top - MENU_GAP_PX - size.height)
    menu.style.left = `${left.toString()}px`
    menu.style.top = `${top.toString()}px`
    menu.setAttribute('aria-label', maybeWord.textContent?.trim() ?? '')
  }
}

/** The name of the mount an open word menu carries. */
export const wordMenuMountName = 'FoldkitWordMenu'

/**
 * The mount an open word menu carries: it puts the menu by its word, and
 * tells the Program `dismiss` when Escape is pressed. The Program decides
 * whether the menu is open; this only places it and reports the key.
 *
 * @example
 * ```typescript
 * h.div([h.Class('fk-word-menu'), h.OnMount(wordMenuMount(menu.token, dismissMessage))], items)
 * ```
 */
export const wordMenuMount = <Message>(
  token: string,
  dismiss: Message,
): MountAction<Message> => ({
  name: wordMenuMountName,
  args: { token },
  f: menu =>
    Stream.callback<Message>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (menu instanceof HTMLElement) {
            placeWordMenu(menu, token)
          }
          const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              Queue.offerUnsafe(queue, dismiss)
            }
          }
          document.addEventListener('keydown', onKeyDown, true)
          return onKeyDown
        }),
        onKeyDown =>
          Effect.sync(() =>
            document.removeEventListener('keydown', onKeyDown, true),
          ),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
})

import { Effect, Option, Queue, Stream } from 'effect'

import * as TranscriptFollow from '../behavior/transcriptFollow.js'
import type { MountAction } from '../mount/index.js'
import { transcriptPlaceAt } from './transcriptClock.js'

export { shouldFollowWord } from '../behavior/transcriptFollow.js'

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

const startOf = (unit: Element): number =>
  numberOf(unit, 'data-start-ms') ?? Number.POSITIVE_INFINITY

const TIMED_PASSAGE_SELECTOR = `${PASSAGE_SELECTOR}[data-start-ms]`

/**
 * What can be spoken on a painted Transcript, in the order it is spoken:
 * each word that says when it starts, and each passage that says when it
 * starts and holds no words, such as a line of text with no word times or
 * one whose words are held back.
 */
const spokenUnitsOf = (transcript: Element): ReadonlyArray<Element> =>
  [
    ...transcript.querySelectorAll(
      `${WORD_SELECTOR}, ${TIMED_PASSAGE_SELECTOR}`,
    ),
  ].filter(
    unit =>
      !unit.matches(PASSAGE_SELECTOR) ||
      unit.querySelector('.fk-word') === null,
  )

/** The last unit to start at or before `placeMs`, by binary search. */
const spokenUnitIn = (
  units: ReadonlyArray<Element>,
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
      const unit = units[middle]
      return unit !== undefined && startOf(unit) <= placeMs
        ? search(middle + 1, high, unit)
        : search(low, middle - 1, found)
    }
  }
  return search(0, units.length - 1, undefined)
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
 * Marks, on a painted Transcript, what its clock has reached at the
 * wall-clock time `nowMs`, and nothing else, as `transcriptAt` says for
 * every painter: the last word to start at or before the place the clock
 * reads, and that word's passage; or, while the place is in a passage with
 * no words, that passage alone. Before the first of them nothing is
 * marked. A Transcript painted without a clock, or with nothing that says
 * when it starts, is left as the view painted it. `units` may be given
 * when the caller already holds what can be spoken, in order.
 *
 * @example
 * ```typescript
 * markSpokenWord(transcriptElement, Date.now())
 * ```
 */
export const markSpokenWord = (
  transcript: Element,
  nowMs: number,
  units: ReadonlyArray<Element> = spokenUnitsOf(transcript),
): void => {
  const clock = clockOf(transcript)
  if (clock !== undefined && units.length > 0) {
    const maybeUnit = spokenUnitIn(units, transcriptPlaceAt(clock, nowMs))
    const maybeWord = maybeUnit?.matches(PASSAGE_SELECTOR)
      ? undefined
      : maybeUnit
    markOnly(transcript, '.fk-word', maybeWord)
    markOnly(
      transcript,
      PASSAGE_SELECTOR,
      maybeUnit?.closest(PASSAGE_SELECTOR) ?? undefined,
    )
  }
}

/**
 * Runs `markSpokenWord` on a painted Transcript: about 25 times a second
 * while its clock runs, once when the clock is told something new while
 * it stands still, and not at all otherwise. What can be spoken is read
 * from the page once, and again only after its passages change. It stops
 * with the tab in the background, as animation frames do.
 */
const runTranscriptClock = (transcript: Element): (() => void) => {
  const state: {
    frame: number
    isRunning: boolean
    paintedAtMs: number
    maybeUnits: ReadonlyArray<Element> | undefined
  } = {
    frame: 0,
    isRunning: false,
    paintedAtMs: Number.NEGATIVE_INFINITY,
    maybeUnits: undefined,
  }
  const step = (frameMs: number) => {
    if (frameMs - state.paintedAtMs >= PAINT_GAP_MS) {
      const units = state.maybeUnits ?? spokenUnitsOf(transcript)
      state.maybeUnits = units
      markSpokenWord(transcript, Date.now(), units)
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
    state.maybeUnits = undefined
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

const rowWithMenuOfTarget = (
  target: EventTarget | null,
): Element | undefined =>
  target instanceof Element
    ? (target.closest('.fk-item[data-menu="true"]') ?? undefined)
    : undefined

/**
 * Opens the menu of a part of `root`, such as a word or a list row, on a
 * long press with a finger or a pen, the way a right click does: it sends
 * the part `partOf` finds under the finger the same `contextmenu` the view
 * already answers, so the Program is told through the view's own, current
 * handler. A press that moves, or lifts early, opens nothing; the tap that
 * ends a long press does not also press the part.
 */
const runLongPress = (
  root: Element,
  partOf: (target: EventTarget | null) => Element | undefined,
): (() => void) => {
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
    const maybePart = partOf(event.target)
    if (
      maybePart === undefined ||
      !(event instanceof PointerEvent) ||
      event.pointerType === 'mouse'
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
        maybePart.dispatchEvent(
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
  root.addEventListener('pointerdown', onDown)
  root.addEventListener('pointermove', onMove)
  root.addEventListener('pointerup', end)
  root.addEventListener('pointercancel', end)
  root.addEventListener('click', onClick, true)
  return () => {
    end()
    root.removeEventListener('pointerdown', onDown)
    root.removeEventListener('pointermove', onMove)
    root.removeEventListener('pointerup', end)
    root.removeEventListener('pointercancel', end)
    root.removeEventListener('click', onClick, true)
  }
}

/**
 * The event the edge sends a painted Transcript for a press on one of its
 * parts, carrying the press as the Transcript wrote it in `detail`: a
 * click on a word, `ClickedWord:w4012`; a right click or a long press on
 * a word that has a menu, `OpenedWordMenu:w4012`; a click on a passage's
 * label, `OpenedSectionMenu:s7`. One listener hears every word, so a
 * recording of thirty thousand words carries no handler per word, and the
 * view tells the Program through its own, current handler.
 */
export const transcriptPressEventName = 'fk-transcript-press'

const pressedPartOf = (target: EventTarget | null): Element | undefined =>
  target instanceof Element
    ? (target.closest('[data-press]') ?? undefined)
    : undefined

/**
 * The press a click or a right click on `target` makes in a painted
 * Transcript, or none: a part that names its own press, `data-press`, or
 * a word, joined to the Transcript's word action, or its word menu action
 * for a right click.
 *
 * @example
 * ```typescript
 * transcriptPressOf(transcript, wordElement, 'Click') // 'ClickedWord:w4012'
 * ```
 */
export const transcriptPressOf = (
  transcript: Element,
  target: EventTarget | null,
  kind: 'Click' | 'Menu',
): string | undefined => {
  const maybePart = kind === 'Click' ? pressedPartOf(target) : undefined
  if (maybePart !== undefined) {
    return maybePart.getAttribute('data-press') ?? undefined
  }
  const maybeWord = wordOfTarget(target)
  const maybeToken = maybeWord?.getAttribute('data-token') ?? undefined
  const maybeAction =
    transcript.getAttribute(
      kind === 'Click' ? 'data-word-action' : 'data-word-menu-action',
    ) ?? undefined
  return maybeToken === undefined || maybeAction === undefined
    ? undefined
    : `${maybeAction}:${maybeToken}`
}

// NOTE: a click that ends a text selection, or a right click on selected
// words, is the reader copying, not pressing a word: the selection stays,
// and the browser's own menu still copies and looks up.
const isSelectingText = (): boolean => {
  const maybeSelection = window.getSelection()
  return maybeSelection !== null && !maybeSelection.isCollapsed
}

const runTranscriptPresses = (transcript: Element): (() => void) => {
  const tell = (press: string) => {
    transcript.dispatchEvent(
      new CustomEvent(transcriptPressEventName, { detail: press }),
    )
  }
  const onClick = (event: Event) => {
    const maybePress = transcriptPressOf(transcript, event.target, 'Click')
    if (maybePress !== undefined && !isSelectingText()) {
      tell(maybePress)
    }
  }
  const onContextMenu = (event: Event) => {
    const maybePress = transcriptPressOf(transcript, event.target, 'Menu')
    if (maybePress !== undefined && !isSelectingText()) {
      event.preventDefault()
      tell(maybePress)
    }
  }
  transcript.addEventListener('click', onClick)
  transcript.addEventListener('contextmenu', onContextMenu)
  return () => {
    transcript.removeEventListener('click', onClick)
    transcript.removeEventListener('contextmenu', onContextMenu)
  }
}

/**
 * The event the edge sends a painted Transcript when the reader has
 * scrolled the spoken word out of the middle. The view listens for it and
 * tells the Program with its own, current handler.
 */
export const leftPlayheadEventName = 'fk-left-playhead'

const isScrollArea = (transcript: Element): boolean =>
  transcript.scrollHeight > transcript.clientHeight

const sightOf = (
  transcript: Element,
  word: Element,
): TranscriptFollow.Sight => {
  const view = isScrollArea(transcript)
    ? transcript.getBoundingClientRect()
    : { top: 0, height: window.innerHeight }
  const bounds = word.getBoundingClientRect()
  return {
    top: bounds.top,
    bottom: bounds.bottom,
    viewStart: view.top,
    viewSize: view.height,
  }
}

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'

const pixelsOf = (length: string): number => {
  const pixels = Number.parseFloat(length)
  return Number.isFinite(pixels) ? pixels : 0
}

/**
 * How far the window scrolls to put a word in the middle of the part of
 * the window the page's scroll padding leaves free, as `scrollIntoView`
 * with `block: 'center'` would: a page that keeps 72 px for a bar at the
 * top and 192 px for controls at the bottom of an 800 px window has the
 * word's middle land at 340 px.
 */
const windowDeltaOf = (word: Element): number => {
  const bounds = word.getBoundingClientRect()
  const rootStyle = getComputedStyle(document.documentElement)
  const freeTop = pixelsOf(rootStyle.scrollPaddingTop)
  const freeBottom =
    window.innerHeight - pixelsOf(rootStyle.scrollPaddingBottom)
  return bounds.top + bounds.height / 2 - (freeTop + freeBottom) / 2
}

/**
 * A glide the edge started: where the view is heading, down the area that
 * scrolls.
 */
type Glide = Readonly<{ top: number }>

/** How near its end a glide counts as there, since a view rests on a fraction of a pixel. */
const GLIDE_ARRIVED_PX = 1

const scrolledTopOf = (transcript: Element): number =>
  isScrollArea(transcript) ? transcript.scrollTop : window.scrollY

const scrollViewTo = (
  transcript: Element,
  top: number,
  behavior: ScrollBehavior,
): void => {
  if (isScrollArea(transcript)) {
    transcript.scrollTo({ top, behavior })
  } else {
    // NOTE: this scrolls the window rather than call scrollIntoView. In
    // Chromium, scrollIntoView moves the sequential focus navigation
    // starting point, so with nothing focused the next Tab would skip
    // everything above the Transcript and land in its words.
    window.scrollTo({ top, behavior })
  }
}

const middleTopOf = (transcript: Element, word: Element): number => {
  if (isScrollArea(transcript)) {
    const view = transcript.getBoundingClientRect()
    const bounds = word.getBoundingClientRect()
    return (
      transcript.scrollTop +
      (bounds.top - view.top) -
      transcript.clientHeight / 2
    )
  } else {
    return window.scrollY + windowDeltaOf(word)
  }
}

/**
 * Brings a word to the middle of the Transcript: inside the Transcript's
 * own scroll area when it has one, so what is above stays put, else in
 * the window. It glides, and answers with the glide it started; it jumps
 * with no animation where the reader asked for reduced motion, and then
 * there is no glide.
 */
const centerWord = (
  transcript: Element,
  word: Element,
): Option.Option<Glide> => {
  const top = middleTopOf(transcript, word)
  const behavior = scrollBehavior()
  scrollViewTo(transcript, top, behavior)
  return behavior === 'smooth'
    ? Option.some({ top: Math.max(0, top) })
    : Option.none()
}

// NOTE: a glide is over when the browser says its scroll ended, and it is
// taken to be over when the view is already where it was heading, for a
// browser that does not say. A glide that could not reach where it was
// heading, as to a word on the last line of a page, then counts as running
// until the reader next scrolls, and stopping it there moves nothing.
const isGlideRunning = (transcript: Element, glide: Glide): boolean =>
  Math.abs(scrolledTopOf(transcript) - glide.top) > GLIDE_ARRIVED_PX

/**
 * Stops a glide where it is, by a jump to the place the view is at. The
 * reader's own scroll then moves the view from there.
 */
const stopGlide = (transcript: Element): void => {
  scrollViewTo(transcript, scrolledTopOf(transcript), 'instant')
}

const isFollowingOf = (transcript: Element): boolean =>
  transcript.getAttribute('data-following') !== 'false'

const hasLeaveOf = (transcript: Element): boolean =>
  transcript.getAttribute('data-leave') === 'true'

const wordWithToken = (transcript: Element, token: string): Element | null =>
  transcript.querySelector(`[data-token="${CSS.escape(token)}"]`)

/**
 * Follows the voice on a painted Transcript, as `TranscriptFollow` says
 * every painter does. This is only the browser's part: it tells the rule
 * when the spoken word changes, when a word is named and when the page
 * scrolls, measures the spoken word against the window or the
 * Transcript's own scroll area, scrolls a word to the middle, stops that
 * scroll when the reader's own lands on it, and sends the view the leave
 * event. When to do any of it is the rule's.
 */
const runFollow = (transcript: Element): (() => void) => {
  const held: {
    maybeFollowed: Element | undefined
    maybeGlide: Option.Option<Glide>
  } = {
    maybeFollowed: undefined,
    maybeGlide: Option.none(),
  }
  // NOTE: what is followed is the word being spoken, or, while the place
  // is in a passage with no words, that passage.
  const spokenWord = (): Element | null =>
    transcript.querySelector(`.fk-word[${CURRENT}]`) ??
    transcript.querySelector(`${PASSAGE_SELECTOR}[${CURRENT}]`)
  const namedWord = (): Element | null => {
    const maybeToken = transcript.getAttribute('data-focus-token')
    return maybeToken === null ? null : wordWithToken(transcript, maybeToken)
  }
  const follow = TranscriptFollow.start({
    now: () => Date.now(),
    wait: (afterMs, elapsed) => {
      const timer = setTimeout(elapsed, afterMs)
      return () => {
        clearTimeout(timer)
      }
    },
    told: () => ({
      isFollowing: isFollowingOf(transcript),
      hasLeave: hasLeaveOf(transcript),
    }),
    measure: (_purpose, answer) => {
      const maybeWord = spokenWord()
      if (maybeWord !== null) {
        answer(Option.some(sightOf(transcript, maybeWord)))
      }
    },
    bringToMiddle: word => {
      const maybeWord = word === 'Spoken' ? spokenWord() : namedWord()
      if (maybeWord !== null) {
        held.maybeGlide = centerWord(transcript, maybeWord)
      }
    },
    pressLeave: () => {
      transcript.dispatchEvent(new CustomEvent(leftPlayheadEventName))
    },
  })
  const noteSpoken = () => {
    const maybeWord = spokenWord()
    if (maybeWord !== null && maybeWord !== held.maybeFollowed) {
      held.maybeFollowed = maybeWord
      follow.tell(TranscriptFollow.ChangedSpokenWord())
    }
  }
  const noteTold = (records: ReadonlyArray<MutationRecord>) => {
    const isNamed = records.some(
      record => record.attributeName === 'data-focus-token',
    )
    const isFollowingAgain = records.some(
      record =>
        record.attributeName === 'data-following' &&
        record.oldValue === 'false',
    )
    if (isNamed && transcript.hasAttribute('data-focus-token')) {
      follow.tell(TranscriptFollow.NamedWord())
    }
    if (isFollowingAgain && isFollowingOf(transcript)) {
      follow.tell(TranscriptFollow.ResumedFollowing())
    }
  }
  // NOTE: a wheel or a finger that lands while the edge's own glide is
  // still running would lose to it: the glide carries the word back to the
  // middle, and the rule, looking a moment later, finds the reader never
  // left. So the reader's scroll stops the glide first.
  const noteReaderScroll = () => {
    const isGliding = Option.exists(held.maybeGlide, glide =>
      isGlideRunning(transcript, glide),
    )
    held.maybeGlide = Option.none()
    if (isGliding) {
      stopGlide(transcript)
    }
    follow.tell(TranscriptFollow.ScrolledByReader())
  }
  const noteGlideEnded = () => {
    held.maybeGlide = Option.none()
  }
  const noteScroll = () => {
    follow.tell(TranscriptFollow.ScrolledView())
  }
  const spoken = new MutationObserver(noteSpoken)
  spoken.observe(transcript, {
    attributes: true,
    attributeFilter: [CURRENT],
    subtree: true,
  })
  const told = new MutationObserver(noteTold)
  told.observe(transcript, {
    attributes: true,
    attributeFilter: ['data-focus-token', 'data-following'],
    attributeOldValue: true,
  })
  window.addEventListener('wheel', noteReaderScroll, { passive: true })
  window.addEventListener('touchmove', noteReaderScroll, { passive: true })
  window.addEventListener('scroll', noteScroll, { passive: true })
  transcript.addEventListener('scroll', noteScroll, { passive: true })
  window.addEventListener('scrollend', noteGlideEnded, { passive: true })
  transcript.addEventListener('scrollend', noteGlideEnded, { passive: true })
  if (transcript.hasAttribute('data-focus-token')) {
    follow.tell(TranscriptFollow.NamedWord())
  }
  return () => {
    spoken.disconnect()
    told.disconnect()
    follow.stop()
    window.removeEventListener('wheel', noteReaderScroll)
    window.removeEventListener('touchmove', noteReaderScroll)
    window.removeEventListener('scroll', noteScroll)
    transcript.removeEventListener('scroll', noteScroll)
    window.removeEventListener('scrollend', noteGlideEnded)
    transcript.removeEventListener('scrollend', noteGlideEnded)
  }
}

/**
 * The mount every painted Transcript carries, the edge of the HTML
 * painter: it hears every press on the Transcript's words and passage
 * labels with one listener and sends the view `transcriptPressEventName`;
 * moves the mark on the word between a Program's reports of
 * the place, where the Transcript has a clock; opens a word's menu on a
 * long press, where it offers one; keeps the spoken word in the middle
 * while the words follow the voice; and tells the view when the reader
 * has scrolled away. What it does is told only by the
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
          const stopLongPress = runLongPress(transcript, target =>
            transcript.hasAttribute('data-word-menu-action')
              ? wordOfTarget(target)
              : undefined,
          )
          const stopFollow = runFollow(transcript)
          const stopPresses = runTranscriptPresses(transcript)
          return () => {
            stopClock()
            stopLongPress()
            stopFollow()
            stopPresses()
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
  placeMenuBy(
    menu,
    (
      menu.closest('.fk-transcript') ??
      menu.parentElement ??
      document
    ).querySelector(`[data-token="${CSS.escape(token)}"]`),
  )
}

const placeMenuBy = (menu: HTMLElement, maybePart: Element | null): void => {
  if (maybePart !== null) {
    const bounds = maybePart.getBoundingClientRect()
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
    if (!menu.hasAttribute('aria-label')) {
      menu.setAttribute('aria-label', maybePart.textContent?.trim() ?? '')
    }
  }
}

/**
 * Puts an open row menu by its row: under it, or above it where there is
 * no room below, and inside the window.
 *
 * @example
 * ```typescript
 * placeItemMenu(menuElement, 'salt-road')
 * ```
 */
export const placeItemMenu = (menu: HTMLElement, key: string): void => {
  placeMenuBy(
    menu,
    (menu.closest('.fk-list') ?? menu.parentElement ?? document).querySelector(
      `.fk-item[data-key="${CSS.escape(key)}"]`,
    ),
  )
}

/**
 * Puts an open passage menu by its passage's label: under it, or above it
 * where there is no room below, and inside the window.
 *
 * @example
 * ```typescript
 * placePassageMenu(menuElement, 'section-7')
 * ```
 */
export const placePassageMenu = (menu: HTMLElement, key: string): void => {
  placeMenuBy(
    menu,
    (
      menu.closest('.fk-transcript') ??
      menu.parentElement ??
      document
    ).querySelector(
      `.fk-passage[data-key="${CSS.escape(key)}"] .fk-passage-label`,
    ),
  )
}

const menuMountOf = <Message>(
  name: string,
  args: Readonly<Record<string, string>>,
  place: (menu: HTMLElement) => void,
  dismiss: Message,
): MountAction<Message> => ({
  name,
  args,
  f: menu =>
    Stream.callback<Message>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (menu instanceof HTMLElement) {
            place(menu)
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

/** The name of the mount an open row menu carries. */
export const itemMenuMountName = 'FoldkitItemMenu'

/**
 * The mount an open row menu carries: it puts the menu by its row, and
 * tells the Program `dismiss` when Escape is pressed. The Program decides
 * whether the menu is open; this only places it and reports the key.
 *
 * @example
 * ```typescript
 * h.div([h.Class('fk-word-menu'), h.OnMount(itemMenuMount(menu.key, dismissMessage))], items)
 * ```
 */
export const itemMenuMount = <Message>(
  key: string,
  dismiss: Message,
): MountAction<Message> =>
  menuMountOf(
    itemMenuMountName,
    { key },
    menu => {
      placeItemMenu(menu, key)
    },
    dismiss,
  )

/** The name of the mount a painted List with row menus carries. */
export const listMountName = 'FoldkitList'

/**
 * The mount a painted List carries when a row has a menu: it opens the
 * row's menu on a long press, as a right click does. It sends the Program
 * nothing itself, so any Program's page can carry it.
 *
 * @example
 * ```typescript
 * h.ul([h.Class('fk-list'), h.OnMount(listMount())], rows)
 * ```
 */
export const listMount = <Message>(): MountAction<Message> => ({
  name: listMountName,
  f: list =>
    Stream.callback<Message>(() =>
      Effect.acquireRelease(
        Effect.sync(() => runLongPress(list, rowWithMenuOfTarget)),
        stop => Effect.sync(stop),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
})

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
): MountAction<Message> =>
  menuMountOf(
    wordMenuMountName,
    { token },
    menu => {
      placeWordMenu(menu, token)
    },
    dismiss,
  )

/** The name of the mount an open passage menu carries. */
export const passageMenuMountName = 'FoldkitPassageMenu'

/**
 * The mount an open passage menu carries: it puts the menu by its
 * passage's label, and tells the Program `dismiss` when Escape is
 * pressed. The Program decides whether the menu is open.
 *
 * @example
 * ```typescript
 * h.div([h.Class('fk-word-menu'), h.OnMount(passageMenuMount(menu.key, dismissMessage))], items)
 * ```
 */
export const passageMenuMount = <Message>(
  key: string,
  dismiss: Message,
): MountAction<Message> =>
  menuMountOf(
    passageMenuMountName,
    { key },
    menu => {
      placePassageMenu(menu, key)
    },
    dismiss,
  )

// SEEK

type PaintedLanding = Readonly<{ value: number; text: string }>

const isPaintedLanding = (value: unknown): value is PaintedLanding =>
  typeof value === 'object' &&
  value !== null &&
  'value' in value &&
  typeof value.value === 'number' &&
  'text' in value &&
  typeof value.text === 'string'

const landingsOf = (field: Element): ReadonlyArray<PaintedLanding> => {
  try {
    const parsed: unknown = JSON.parse(
      field.getAttribute('data-landings') ?? '[]',
    )
    return Array.isArray(parsed) ? parsed.filter(isPaintedLanding) : []
  } catch {
    return []
  }
}

/**
 * Names, beside a painted seek bar, what a drag to `value` will land on:
 * the last of the bar's landings to start at or before it, as
 * `seekLandingAt` says for every painter. Before the first landing it
 * names nothing and puts the name away.
 *
 * @example
 * ```typescript
 * showSeekLanding(seekFieldElement, 730_000)
 * ```
 */
export const showSeekLanding = (field: Element, value: number): void => {
  const maybeOutput = field.querySelector('.fk-seek-landing')
  const maybeInput = field.querySelector('input')
  const maybeLanding = landingsOf(field)
    .filter(landing => landing.value <= value)
    .at(-1)
  if (maybeOutput instanceof HTMLElement) {
    maybeOutput.textContent = maybeLanding?.text ?? ''
    maybeOutput.hidden = maybeLanding === undefined
  }
  if (maybeInput !== null && maybeLanding !== undefined) {
    if (!maybeInput.hasAttribute('data-value-text')) {
      maybeInput.setAttribute(
        'data-value-text',
        maybeInput.getAttribute('aria-valuetext') ?? '',
      )
    }
    maybeInput.setAttribute('aria-valuetext', maybeLanding.text)
  }
}

const hideSeekLanding = (field: Element): void => {
  const maybeOutput = field.querySelector('.fk-seek-landing')
  const maybeInput = field.querySelector('input')
  if (maybeOutput instanceof HTMLElement) {
    maybeOutput.hidden = true
  }
  if (maybeInput !== null && maybeInput.hasAttribute('data-value-text')) {
    maybeInput.setAttribute(
      'aria-valuetext',
      maybeInput.getAttribute('data-value-text') ?? '',
    )
    maybeInput.removeAttribute('data-value-text')
  }
}

/** The name of the mount a painted seek bar with landings carries. */
export const seekFieldMountName = 'FoldkitSeekField'

/**
 * The mount a painted seek bar with landings carries: while a person
 * drags the bar it names what the drag will land on, such as the
 * paragraph there, and puts the name away on release. It sends the
 * Program nothing; the bar's own handler presses the seek.
 *
 * @example
 * ```typescript
 * h.span([h.Class('fk-seek-field'), h.OnMount(seekFieldMount())], [input, output])
 * ```
 */
export const seekFieldMount = <Message>(): MountAction<Message> => ({
  name: seekFieldMountName,
  f: field =>
    Stream.callback<Message>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const onInput = (event: Event) => {
            if (event.target instanceof HTMLInputElement) {
              showSeekLanding(field, Number(event.target.value))
            }
          }
          const onRelease = () => {
            hideSeekLanding(field)
          }
          field.addEventListener('input', onInput)
          field.addEventListener('change', onRelease)
          return { onInput, onRelease }
        }),
        ({ onInput, onRelease }) =>
          Effect.sync(() => {
            field.removeEventListener('input', onInput)
            field.removeEventListener('change', onRelease)
          }),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
})

// TEXT FIELD

/**
 * The event the edge sends a painted text field when Enter is pressed on
 * text that has not changed. The view listens for it and presses the
 * field's again action with its own, current handler.
 */
export const againEventName = 'fk-again'

/** The name of the mount a painted text field with an again action carries. */
export const textAgainMountName = 'FoldkitTextAgain'

/**
 * The mount a painted text field with an again action carries: Enter on
 * text that is what the field already shows, and not empty, sends the
 * field the again event, such as the next match of a search; Enter on
 * changed text is left to the field's own submit.
 *
 * @example
 * ```typescript
 * h.input([h.DataAttribute('shown', input.value), h.OnMount(textAgainMount())])
 * ```
 */
export const textAgainMount = <Message>(): MountAction<Message> => ({
  name: textAgainMountName,
  f: field =>
    Stream.callback<Message>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const onKeyDown = (event: Event) => {
            if (
              event instanceof KeyboardEvent &&
              event.key === 'Enter' &&
              field instanceof HTMLInputElement
            ) {
              const shown = (field.getAttribute('data-shown') ?? '').trim()
              if (shown !== '' && field.value.trim() === shown) {
                field.dispatchEvent(new CustomEvent(againEventName))
              }
            }
          }
          field.addEventListener('keydown', onKeyDown)
          return onKeyDown
        }),
        onKeyDown =>
          Effect.sync(() => field.removeEventListener('keydown', onKeyDown)),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
})

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
 * The event the edge sends a painted Transcript when the reader has
 * scrolled the spoken word out of the middle. The view listens for it and
 * tells the Program with its own, current handler.
 */
export const leftPlayheadEventName = 'fk-left-playhead'

/** After the reader scrolls, the words are left alone this long, where leaving is the Program's to hear. */
const LEAVING_QUIET_MS = 1000

/** After the reader scrolls, the words are left alone this long, where nothing hears of leaving. */
const SCROLL_QUIET_MS = 4000

/** How long after the reader's scroll the edge looks whether the spoken word left the middle. */
const LEAVE_CHECK_AFTER_MS = 250

/** How long a scroll the edge started is taken to be its own. */
const OWN_SCROLL_MS = 900

const MIDDLE_BAND_START = 0.25

const MIDDLE_BAND_END = 0.75

/**
 * Whether the edge brings a newly spoken word to the middle now: only
 * while the words follow the voice, and not for a moment after the reader
 * scrolled, a second where leaving is reported, four where it is not.
 *
 * @example
 * ```typescript
 * shouldFollowWord({ isFollowing: true, hasLeave: true, nowMs: 10_000, userScrolledAtMs: 9_500 }) // false
 * ```
 */
export const shouldFollowWord = (
  facts: Readonly<{
    isFollowing: boolean
    hasLeave: boolean
    nowMs: number
    userScrolledAtMs: number
  }>,
): boolean =>
  facts.isFollowing &&
  facts.nowMs - facts.userScrolledAtMs >=
    (facts.hasLeave ? LEAVING_QUIET_MS : SCROLL_QUIET_MS)

const isScrollArea = (transcript: Element): boolean =>
  transcript.scrollHeight > transcript.clientHeight

const isNearMiddleOf = (transcript: Element, word: Element): boolean => {
  const view = isScrollArea(transcript)
    ? transcript.getBoundingClientRect()
    : { top: 0, height: window.innerHeight }
  const bounds = word.getBoundingClientRect()
  return (
    bounds.top > view.top + view.height * MIDDLE_BAND_START &&
    bounds.bottom < view.top + view.height * MIDDLE_BAND_END
  )
}

/**
 * Brings a word to the middle of the Transcript: inside the Transcript's
 * own scroll area when it has one, so what is above stays put, else in
 * the window.
 */
const centerWord = (transcript: Element, word: Element): void => {
  if (isScrollArea(transcript)) {
    const view = transcript.getBoundingClientRect()
    const bounds = word.getBoundingClientRect()
    transcript.scrollTo({
      top:
        transcript.scrollTop +
        (bounds.top - view.top) -
        transcript.clientHeight / 2,
      behavior: 'smooth',
    })
  } else {
    word.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

const isFollowingOf = (transcript: Element): boolean =>
  transcript.getAttribute('data-following') !== 'false'

const hasLeaveOf = (transcript: Element): boolean =>
  transcript.getAttribute('data-leave') === 'true'

const wordWithToken = (transcript: Element, token: string): Element | null =>
  transcript.querySelector(`[data-token="${CSS.escape(token)}"]`)

/**
 * Keeps the spoken word in the middle while the words follow the voice,
 * shows the word the Transcript says to show, and tells the view when the
 * reader has scrolled the spoken word out of the middle. The Program
 * decides whether the words follow; this reads that from the element and
 * moves nothing once they do not.
 */
const runFollow = (transcript: Element): (() => void) => {
  const state: {
    userScrolledAtMs: number
    ownScrollUntilMs: number
    leaveCheck: number
    maybeFollowed: Element | undefined
  } = {
    userScrolledAtMs: Number.NEGATIVE_INFINITY,
    ownScrollUntilMs: Number.NEGATIVE_INFINITY,
    leaveCheck: 0,
    maybeFollowed: undefined,
  }
  const currentWord = (): Element | null =>
    transcript.querySelector(`.fk-word[${CURRENT}]`)
  const leaveIfAway = () => {
    const maybeWord = currentWord()
    if (
      isFollowingOf(transcript) &&
      hasLeaveOf(transcript) &&
      maybeWord !== null &&
      !isNearMiddleOf(transcript, maybeWord)
    ) {
      transcript.dispatchEvent(new CustomEvent(leftPlayheadEventName))
    }
  }
  const noteUserScroll = () => {
    state.userScrolledAtMs = Date.now()
    window.clearTimeout(state.leaveCheck)
    state.leaveCheck = window.setTimeout(leaveIfAway, LEAVE_CHECK_AFTER_MS)
  }
  const noteScroll = () => {
    if (Date.now() > state.ownScrollUntilMs) {
      noteUserScroll()
    }
  }
  const follow = () => {
    const maybeWord = currentWord()
    if (maybeWord === null || maybeWord === state.maybeFollowed) {
      return
    }
    state.maybeFollowed = maybeWord
    if (
      shouldFollowWord({
        isFollowing: isFollowingOf(transcript),
        hasLeave: hasLeaveOf(transcript),
        nowMs: Date.now(),
        userScrolledAtMs: state.userScrolledAtMs,
      }) &&
      !isNearMiddleOf(transcript, maybeWord)
    ) {
      state.ownScrollUntilMs = Date.now() + OWN_SCROLL_MS
      centerWord(transcript, maybeWord)
    }
  }
  const show = () => {
    const maybeToken = transcript.getAttribute('data-focus-token')
    const maybeWord =
      maybeToken === null ? null : wordWithToken(transcript, maybeToken)
    if (maybeWord !== null) {
      state.ownScrollUntilMs = Date.now() + OWN_SCROLL_MS
      centerWord(transcript, maybeWord)
    }
  }
  const spoken = new MutationObserver(follow)
  spoken.observe(transcript, {
    attributes: true,
    attributeFilter: [CURRENT],
    subtree: true,
  })
  const told = new MutationObserver(show)
  told.observe(transcript, {
    attributes: true,
    attributeFilter: ['data-focus-token'],
  })
  window.addEventListener('wheel', noteUserScroll, { passive: true })
  window.addEventListener('touchmove', noteUserScroll, { passive: true })
  window.addEventListener('scroll', noteScroll, { passive: true })
  transcript.addEventListener('scroll', noteScroll, { passive: true })
  show()
  return () => {
    spoken.disconnect()
    told.disconnect()
    window.clearTimeout(state.leaveCheck)
    window.removeEventListener('wheel', noteUserScroll)
    window.removeEventListener('touchmove', noteUserScroll)
    window.removeEventListener('scroll', noteScroll)
    transcript.removeEventListener('scroll', noteScroll)
  }
}

/**
 * The mount every painted Transcript carries, the edge of the HTML
 * painter: it moves the mark on the word between a Program's reports of
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
            transcript.getAttribute('data-word-menu') === 'true'
              ? wordOfTarget(target)
              : undefined,
          )
          const stopFollow = runFollow(transcript)
          return () => {
            stopClock()
            stopLongPress()
            stopFollow()
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

import { Array, Effect, Function, Option, Queue, Stream, pipe } from 'effect'
import { Mount, Theme } from 'foldkit'
import {
  ApproachedListEdge,
  ChangedListRowFocus,
  ChangedPlayheadVisibility,
  CompletedRunPlaybackClock,
  CompletedRunWallClock,
  CompletedShowRowMenuOnContextMenu,
  GotShareMessage,
  ListEdge,
  type Message,
  type PlaybackClock,
  ReachedListTop,
  RecordingWindow,
  Share,
  type SpokenSection,
  bringsIntoView,
  clockPlaceAt,
  formatClock,
  progressFractionOf,
  spokenAt,
} from 'words-core-example'

import { passageSelectorOf, scrollSectionElementTo } from './browser.js'

const TOP_BAR_CLEARANCE_PX = 64
const BOTTOM_CONTROLS_CLEARANCE_PX = 168

/**
 * Reports whether the followed section is on screen, between the top bar
 * and the floating controls, as the listener scrolls or the transcript
 * grows. The transcript names the followed section in
 * `data-followed-section`; when that changes, or the passage first
 * appears, the observer moves to it and reports at once.
 */
export const ObserveFollowedSection = Mount.defineStream(
  'ObserveFollowedSection',
  ChangedPlayheadVisibility,
)(transcript =>
  Stream.callback<typeof ChangedPlayheadVisibility.Type>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const state: {
          maybeObserved: Element | undefined
          maybeObserver: IntersectionObserver | undefined
        } = { maybeObserved: undefined, maybeObserver: undefined }
        const watch = () => {
          const sectionID =
            transcript.getAttribute('data-followed-section') ?? ''
          const maybePassage =
            sectionID === ''
              ? undefined
              : (transcript.querySelector(passageSelectorOf(sectionID)) ??
                undefined)
          if (maybePassage === state.maybeObserved) {
            return
          }
          state.maybeObserver?.disconnect()
          state.maybeObserved = maybePassage
          state.maybeObserver =
            maybePassage === undefined
              ? undefined
              : new IntersectionObserver(
                  entries => {
                    pipe(
                      Array.last(entries),
                      Option.match({
                        onNone: Function.constVoid,
                        onSome: entry =>
                          Queue.offerUnsafe(
                            queue,
                            ChangedPlayheadVisibility({
                              sectionID,
                              visibility: entry.isIntersecting
                                ? 'OnScreen'
                                : 'OffScreen',
                            }),
                          ),
                      }),
                    )
                  },
                  {
                    rootMargin: `-${TOP_BAR_CLEARANCE_PX}px 0px -${BOTTOM_CONTROLS_CLEARANCE_PX}px 0px`,
                  },
                )
          if (maybePassage !== undefined) {
            state.maybeObserver?.observe(maybePassage)
          }
        }
        const changes = new MutationObserver(watch)
        changes.observe(transcript, {
          attributes: true,
          attributeFilter: ['data-followed-section'],
          childList: true,
          subtree: true,
        })
        watch()
        return { changes, state }
      }),
      ({ changes, state }) =>
        Effect.sync(() => {
          changes.disconnect()
          state.maybeObserver?.disconnect()
        }),
    ).pipe(Effect.flatMap(() => Effect.never)),
  ),
)

/**
 * Opens the share sheet's `<dialog>` as a native modal: the page behind is
 * inert, focus stays inside, and Escape asks the Model to close it. Removing
 * the dialog returns focus to what had it before.
 */
export const ShowShareDialog = Mount.defineStream(
  'ShowShareDialog',
  GotShareMessage,
)(element =>
  Stream.callback<typeof GotShareMessage.Type>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const maybeReturnFocus = pipe(
          Option.fromNullishOr(document.activeElement),
          Option.filter(
            (active): active is HTMLElement => active instanceof HTMLElement,
          ),
        )
        const handleCancel = (event: Event) => {
          event.preventDefault()
          Queue.offerUnsafe(
            queue,
            GotShareMessage({ message: Share.closeShareSheet() }),
          )
        }
        element.addEventListener('cancel', handleCancel)
        if (element instanceof HTMLDialogElement && !element.open) {
          element.showModal()
        }
        return { handleCancel, maybeReturnFocus }
      }),
      ({ handleCancel, maybeReturnFocus }) =>
        Effect.sync(() => {
          element.removeEventListener('cancel', handleCancel)
          if (element instanceof HTMLDialogElement && element.open) {
            element.close()
          }
          Option.map(maybeReturnFocus, returnFocus => {
            if (returnFocus.isConnected) {
              returnFocus.focus()
            }
          })
        }),
    ).pipe(Effect.flatMap(() => Effect.never)),
  ),
)

const ROW_MENU_SELECTOR = '[data-row-menu]'

// NOTE: a right-click fires `contextmenu` while the button is still down on
// macOS and Linux, and an auto popover shown then is light-dismissed by the
// pointerup that follows, so the menu opens once the button is released.
const showPopoverAfterRelease = (menu: HTMLElement, event: Event): void => {
  const isButtonHeld = event instanceof MouseEvent && event.buttons !== 0
  if (isButtonHeld) {
    window.addEventListener(
      'pointerup',
      () => window.setTimeout(() => menu.showPopover()),
      { once: true },
    )
  } else {
    menu.showPopover()
  }
}

/**
 * Opens a recording row's menu when the row is right-clicked, like the
 * context menu on the Mac's recording list. One listener serves every row;
 * each row names its menu in `data-row-menu`.
 */
export const ShowRowMenuOnContextMenu = Mount.define(
  'ShowRowMenuOnContextMenu',
  CompletedShowRowMenuOnContextMenu,
)(element =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const handleContextMenu = (event: Event) => {
        const maybeMenu = pipe(
          Option.fromNullishOr(event.target),
          Option.filter(
            (target): target is Element => target instanceof Element,
          ),
          Option.flatMap(target =>
            Option.fromNullishOr(target.closest(ROW_MENU_SELECTOR)),
          ),
          Option.flatMap(row =>
            Option.fromNullishOr(row.getAttribute('data-row-menu')),
          ),
          Option.flatMap(menuID =>
            Option.fromNullishOr(document.getElementById(menuID)),
          ),
        )
        if (Option.isSome(maybeMenu)) {
          event.preventDefault()
          showPopoverAfterRelease(maybeMenu.value, event)
        }
      }
      element.addEventListener('contextmenu', handleContextMenu)
      return handleContextMenu
    }),
    handleContextMenu =>
      Effect.sync(() =>
        element.removeEventListener('contextmenu', handleContextMenu),
      ),
  ).pipe(Effect.as(CompletedShowRowMenuOnContextMenu())),
)

const WALL_CLOCK_REDUCED_MOTION_INTERVAL_MS = 100
const MILLISECONDS_PER_SECOND = 1_000

const wallClockFaceFormat = (): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 2,
    timeZoneName: 'short',
  })

const wallClockSpokenFormat = (): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })

const childOf = (element: Element, selector: string): Option.Option<Element> =>
  Option.fromNullishOr(element.querySelector(selector))

/**
 * Paints the full-screen wall clock to the hundredth of a second, like the
 * iPhone's vertical timestamps: every animation frame, or ten times a second
 * under Reduce Motion. It stops with the tab in the background, and it tells
 * screen readers the time once a second rather than on every frame.
 */
export const RunWallClock = Mount.define(
  'RunWallClock',
  CompletedRunWallClock,
)(element =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const maybeFace = childOf(element, '[data-wall-clock-face]')
      const maybeSpoken = childOf(element, '[data-wall-clock-spoken]')
      const faceFormat = wallClockFaceFormat()
      const spokenFormat = wallClockSpokenFormat()
      const isReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
      const clock = { frame: 0, lastPaintMs: 0, lastSpokenSecond: 0 }
      const paint = (nowMs: number) => {
        if (
          !isReducedMotion ||
          nowMs - clock.lastPaintMs >= WALL_CLOCK_REDUCED_MOTION_INTERVAL_MS
        ) {
          clock.lastPaintMs = nowMs
          const now = new Date()
          Option.map(maybeFace, face => {
            face.textContent = faceFormat.format(now)
          })
          const second = Math.floor(now.getTime() / MILLISECONDS_PER_SECOND)
          if (second !== clock.lastSpokenSecond) {
            clock.lastSpokenSecond = second
            Option.map(maybeSpoken, spoken => {
              spoken.textContent = `Current time ${spokenFormat.format(now)}`
            })
          }
        }
        clock.frame = window.requestAnimationFrame(paint)
      }
      clock.frame = window.requestAnimationFrame(paint)
      return clock
    }),
    clock => Effect.sync(() => window.cancelAnimationFrame(clock.frame)),
  ).pipe(Effect.as(CompletedRunWallClock())),
)

/** The data attribute each recording row carries: its recording id. */
export const RECORDING_ROW_DATA_KEY = 'recording-row'
/** The data attribute on the rows container that says whether newer pages are unloaded. */
export const HAS_NEWER_ROWS_DATA_KEY = 'has-newer-rows'
/** The data attribute on the element whose height stands in for the rows above the window. */
export const ROWS_SPACER_DATA_KEY = 'rows-spacer'

const RECORDING_ROW_ATTRIBUTE = `data-${RECORDING_ROW_DATA_KEY}`
const HAS_NEWER_ROWS_ATTRIBUTE = `data-${HAS_NEWER_ROWS_DATA_KEY}`
const ROWS_SPACER_ATTRIBUTE = `data-${ROWS_SPACER_DATA_KEY}`

const SCROLLING_OVERFLOW = /(auto|scroll|overlay)/
const EDGE_ROOT_MARGIN = '100% 0px'
const LIST_TOP_TOLERANCE_PX = 1
const SCROLL_CORRECTION_THRESHOLD_PX = 0.5

/**
 * The element that scrolls the list: the sidebar column from 1024 px, where
 * the list scrolls on its own; `None` when the page itself scrolls it.
 */
const listScrollerOf = (element: Element): Option.Option<HTMLElement> => {
  const scrollerOf = (node: HTMLElement | null): Option.Option<HTMLElement> => {
    if (node === null || node === document.body) {
      return Option.none()
    } else if (SCROLLING_OVERFLOW.test(getComputedStyle(node).overflowY)) {
      return Option.some(node)
    } else {
      return scrollerOf(node.parentElement)
    }
  }
  return scrollerOf(element.parentElement)
}

const scrollTopOf = (maybeScroller: Option.Option<HTMLElement>): number =>
  Option.match(maybeScroller, {
    onNone: () => window.scrollY,
    onSome: scroller => scroller.scrollTop,
  })

const scrollByPixels = (
  maybeScroller: Option.Option<HTMLElement>,
  pixels: number,
): void => {
  if (Math.abs(pixels) >= SCROLL_CORRECTION_THRESHOLD_PX) {
    Option.match(maybeScroller, {
      onNone: () => window.scrollBy({ top: pixels, behavior: 'instant' }),
      onSome: scroller =>
        scroller.scrollBy({ top: pixels, behavior: 'instant' }),
    })
  }
}

const pixelsOf = (length: string): number => {
  const pixels = Number.parseFloat(length)
  return Number.isFinite(pixels) ? pixels : 0
}

/** Where the list's visible part begins: below the top bar, or the sidebar's top edge. */
const visibleTopOf = (maybeScroller: Option.Option<HTMLElement>): number =>
  Option.match(maybeScroller, {
    onNone: () =>
      pixelsOf(getComputedStyle(document.documentElement).scrollPaddingTop),
    onSome: scroller => scroller.getBoundingClientRect().top,
  })

type RowAnchor = Readonly<{
  recordingID: string
  top: number
  scrollTop: number
}>

const rowsOf = (element: Element): ReadonlyArray<Element> =>
  Array.fromIterable(element.querySelectorAll(`[${RECORDING_ROW_ATTRIBUTE}]`))

/** The first row whose bottom is below the top of the list's visible part, found by halving. */
const firstVisibleRowOf = (
  rows: ReadonlyArray<Element>,
  visibleTop: number,
): Option.Option<Element> => {
  const search = (low: number, high: number): number => {
    if (low >= high) {
      return low
    } else {
      const middle = Math.floor((low + high) / 2)
      const isBelowTop = Option.exists(
        Array.get(rows, middle),
        row => row.getBoundingClientRect().bottom > visibleTop,
      )
      return isBelowTop ? search(low, middle) : search(middle + 1, high)
    }
  }
  return Array.get(rows, search(0, Array.length(rows)))
}

const anchorOf = (element: Element): Option.Option<RowAnchor> => {
  const maybeScroller = listScrollerOf(element)
  return pipe(
    firstVisibleRowOf(rowsOf(element), visibleTopOf(maybeScroller)),
    Option.flatMap(row =>
      Option.map(
        Option.fromNullishOr(row.getAttribute(RECORDING_ROW_ATTRIBUTE)),
        recordingID => ({
          recordingID,
          top: row.getBoundingClientRect().top,
          scrollTop: scrollTopOf(maybeScroller),
        }),
      ),
    ),
  )
}

const rowElementOf = (
  element: Element,
  recordingID: string,
): Option.Option<Element> =>
  Option.fromNullishOr(
    element.querySelector(
      `[${RECORDING_ROW_ATTRIBUTE}="${CSS.escape(recordingID)}"]`,
    ),
  )

const spacerOf = (element: Element): Option.Option<HTMLElement> =>
  pipe(
    Option.fromNullishOr(element.querySelector(`[${ROWS_SPACER_ATTRIBUTE}]`)),
    Option.filter(
      (spacer): spacer is HTMLElement => spacer instanceof HTMLElement,
    ),
  )

const heightOf = (maybeElement: Option.Option<HTMLElement>): number =>
  Option.match(maybeElement, {
    onNone: () => 0,
    onSome: element => element.getBoundingClientRect().height,
  })

const setHeight = (
  maybeElement: Option.Option<HTMLElement>,
  height: number,
): void => {
  Option.map(maybeElement, element => {
    element.style.height = `${height}px`
  })
}

/**
 * Puts the anchor row back where it was on screen after rows changed above
 * it, unless the rows are hidden (the sidebar below 1024 px), where nothing
 * shows and nothing is corrected. While newer pages are unloaded the spacer above the rows absorbs the
 * change (it grows by the rows a page took with it, and shrinks by the rows a
 * page brings back), so the scroll position does not move, which keeps a
 * fling going in Safari; what the spacer cannot absorb is scrolled away. At
 * the very top of a list that starts at the newest recording nothing is
 * corrected, so newer rows show at the top.
 */
const restoreAnchor = (
  element: Element,
  maybeAnchor: Option.Option<RowAnchor>,
): void => {
  if (element.getClientRects().length === 0) {
    return
  }
  const maybeScroller = listScrollerOf(element)
  const scrollTop = scrollTopOf(maybeScroller)
  const hasNewerRows = element.getAttribute(HAS_NEWER_ROWS_ATTRIBUTE) === 'true'
  const maybeSpacer = spacerOf(element)
  const spacerHeight = heightOf(maybeSpacer)
  const maybeShift = Option.flatMap(maybeAnchor, anchor =>
    Option.map(
      rowElementOf(element, anchor.recordingID),
      row =>
        row.getBoundingClientRect().top -
        (anchor.top - (scrollTop - anchor.scrollTop)),
    ),
  )
  if (!hasNewerRows && scrollTop <= LIST_TOP_TOLERANCE_PX) {
    setHeight(maybeSpacer, 0)
  } else if (Option.isSome(maybeShift)) {
    const nextSpacerHeight = hasNewerRows
      ? Math.max(0, spacerHeight - maybeShift.value)
      : 0
    setHeight(maybeSpacer, nextSpacerHeight)
    scrollByPixels(
      maybeScroller,
      maybeShift.value - (spacerHeight - nextSpacerHeight),
    )
  } else if (!hasNewerRows) {
    setHeight(maybeSpacer, 0)
    scrollByPixels(maybeScroller, -spacerHeight)
  }
}

// NOTE: the first layout after a render clamps the scroll position to the new
// content height before any correction can run, so rows leaving above the
// anchor near the end of the list would pull the view up. The rows keep at
// least their height from the last correction until the next one, which makes
// that first layout keep the scroll position.
const holdRowsHeight = (element: Element): void => {
  if (element instanceof HTMLElement) {
    element.style.minHeight = ''
    element.style.minHeight = `${element.getBoundingClientRect().height}px`
  }
}

/** The spacer above the rows a newer edge belongs to: it stands in for the unloaded rows, so reaching it counts. */
const spacerBesideOf = (element: Element): Option.Option<HTMLElement> =>
  Option.flatMap(
    Option.fromNullishOr(element.closest(`[${HAS_NEWER_ROWS_ATTRIBUTE}]`)),
    spacerOf,
  )

/** Whether a batch of DOM changes took `focused` out of the page, even if only to put it back elsewhere. */
const wasFocusMovedIn = (
  records: ReadonlyArray<MutationRecord>,
  focused: Element,
): boolean =>
  Array.some(records, record =>
    Array.some(
      Array.fromIterable(record.removedNodes),
      node => node === focused || node.contains(focused),
    ),
  )

// NOTE: Foldkit's renderer moves a keyed row within its list when rows around
// it leave in the same render, and moving an element drops keyboard focus
// (WebKit fires no focusout when it does). A focused row that a render moved,
// and that is still on the page, gets focus back before the frame paints, so
// focus is on the same element before and after every load and eviction.
const restoreMovedFocus = (
  records: ReadonlyArray<MutationRecord>,
  maybeFocused: Option.Option<HTMLElement>,
): void => {
  if (
    Option.isSome(maybeFocused) &&
    maybeFocused.value.isConnected &&
    document.activeElement !== maybeFocused.value &&
    wasFocusMovedIn(records, maybeFocused.value)
  ) {
    maybeFocused.value.focus({ preventScroll: true })
  }
}

const recordingIDOfTarget = (
  target: EventTarget | null,
): Option.Option<string> =>
  pipe(
    Option.fromNullishOr(target),
    Option.filter((node): node is Element => node instanceof Element),
    Option.flatMap(node =>
      Option.fromNullishOr(node.closest(`[${RECORDING_ROW_ATTRIBUTE}]`)),
    ),
    Option.flatMap(row =>
      Option.fromNullishOr(row.getAttribute(RECORDING_ROW_ATTRIBUTE)),
    ),
  )

/**
 * Keeps the recording list steady while its window moves, and reports which
 * row holds keyboard focus. The row at the top of the visible part stays
 * where it is on screen when rows arrive or leave above it, in every engine:
 * the browser's own scroll anchoring is off for the rows, and a
 * MutationObserver corrects each render before it paints. Focus moving onto a
 * row, or off every row, becomes `ChangedListRowFocus`, so the list keeps a
 * focused row when its page leaves, and a focused row that a render moved
 * keeps its focus. New rows report the focus as they find it, so a row that
 * had focus in rows that are gone (opening a recording replaces the list
 * with the sidebar) is not kept.
 */
export const TrackRecordingRows = Mount.defineStream(
  'TrackRecordingRows',
  ChangedListRowFocus,
)(element =>
  Stream.callback<typeof ChangedListRowFocus.Type>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        holdRowsHeight(element)
        const state: {
          maybeAnchor: Option.Option<RowAnchor>
          maybeFocused: Option.Option<HTMLElement>
          frame: number
        } = {
          maybeAnchor: anchorOf(element),
          maybeFocused: Option.none(),
          frame: 0,
        }
        const recordAnchor = () => {
          state.maybeAnchor = anchorOf(element)
        }
        const keepAnchorInPlace = (records: ReadonlyArray<MutationRecord>) => {
          restoreMovedFocus(records, state.maybeFocused)
          restoreAnchor(element, state.maybeAnchor)
          holdRowsHeight(element)
          recordAnchor()
        }
        const mutations = new MutationObserver(keepAnchorInPlace)
        mutations.observe(element, {
          childList: true,
          subtree: true,
          characterData: true,
        })
        const handleScroll = () => {
          window.cancelAnimationFrame(state.frame)
          state.frame = window.requestAnimationFrame(recordAnchor)
        }
        const handleResize = () => {
          window.cancelAnimationFrame(state.frame)
          state.frame = window.requestAnimationFrame(() => {
            holdRowsHeight(element)
            recordAnchor()
          })
        }
        document.addEventListener('scroll', handleScroll, {
          capture: true,
          passive: true,
        })
        window.addEventListener('resize', handleResize)
        const handleFocusIn = (event: Event) => {
          state.maybeFocused = Option.liftPredicate(
            event.target,
            (target): target is HTMLElement => target instanceof HTMLElement,
          )
          Queue.offerUnsafe(
            queue,
            ChangedListRowFocus({
              maybeRecordingID: recordingIDOfTarget(event.target),
            }),
          )
        }
        const reportFocusLeftRows = () => {
          if (!element.contains(document.activeElement)) {
            state.maybeFocused = Option.none()
            Queue.offerUnsafe(
              queue,
              ChangedListRowFocus({ maybeRecordingID: Option.none() }),
            )
          }
        }
        const handleFocusOut = (event: Event) => {
          const isFocusStayingInRows =
            event instanceof FocusEvent &&
            event.relatedTarget instanceof Node &&
            element.contains(event.relatedTarget)
          if (!isFocusStayingInRows) {
            window.setTimeout(reportFocusLeftRows)
          }
        }
        element.addEventListener('focusin', handleFocusIn)
        element.addEventListener('focusout', handleFocusOut)
        state.maybeFocused = Option.liftPredicate(
          document.activeElement,
          (active): active is HTMLElement =>
            active instanceof HTMLElement && element.contains(active),
        )
        Queue.offerUnsafe(
          queue,
          ChangedListRowFocus({
            maybeRecordingID: Option.flatMap(state.maybeFocused, focused =>
              recordingIDOfTarget(focused),
            ),
          }),
        )
        return {
          mutations,
          handleScroll,
          handleResize,
          handleFocusIn,
          handleFocusOut,
          state,
        }
      }),
      ({
        mutations,
        handleScroll,
        handleResize,
        handleFocusIn,
        handleFocusOut,
        state,
      }) =>
        Effect.sync(() => {
          mutations.disconnect()
          document.removeEventListener('scroll', handleScroll, {
            capture: true,
          })
          window.removeEventListener('resize', handleResize)
          element.removeEventListener('focusin', handleFocusIn)
          element.removeEventListener('focusout', handleFocusOut)
          window.cancelAnimationFrame(state.frame)
        }),
    ).pipe(Effect.flatMap(() => Effect.never)),
  ),
)

/**
 * Reports when the listener scrolls to within about a screen of an edge of
 * the loaded rows (`ApproachedListEdge`), measured against whatever scrolls
 * the list, the page or the sidebar. The newer edge also reports the very top
 * of the list (`ReachedListTop`), where the list goes back to the newest page
 * in one step. It mounts once per window: the edge of a new window is a new
 * element, so a window that loaded without moving the edge off screen reports
 * again, and the core decides whether that asks for anything.
 */
export const ObserveListEdge = Mount.defineStream(
  'ObserveListEdge',
  { edge: ListEdge, window: RecordingWindow },
  ApproachedListEdge,
  ReachedListTop,
)(
  ({ edge, window: rowsWindow }) =>
    element =>
      Stream.callback<
        typeof ApproachedListEdge.Type | typeof ReachedListTop.Type
      >(queue =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const state: {
              maybeObserved: Option.Option<
                Readonly<{
                  observer: IntersectionObserver
                  maybeRoot: Option.Option<HTMLElement>
                }>
              >
              frame: number
            } = { maybeObserved: Option.none(), frame: 0 }
            const report = (
              entries: ReadonlyArray<IntersectionObserverEntry>,
            ) => {
              if (Array.some(entries, entry => entry.isIntersecting)) {
                const isAtListTop =
                  edge === 'Newer' &&
                  scrollTopOf(listScrollerOf(element)) <= LIST_TOP_TOLERANCE_PX
                Queue.offerUnsafe(
                  queue,
                  isAtListTop
                    ? ReachedListTop({ window: rowsWindow })
                    : ApproachedListEdge({ edge, window: rowsWindow }),
                )
              }
            }
            const observe = () => {
              const maybeRoot = listScrollerOf(element)
              const isSameRoot = Option.exists(
                state.maybeObserved,
                observed =>
                  Option.getOrNull(observed.maybeRoot) ===
                  Option.getOrNull(maybeRoot),
              )
              if (!isSameRoot) {
                Option.map(state.maybeObserved, observed =>
                  observed.observer.disconnect(),
                )
                const observer = new IntersectionObserver(report, {
                  root: Option.getOrNull(maybeRoot),
                  rootMargin: EDGE_ROOT_MARGIN,
                })
                observer.observe(element)
                if (edge === 'Newer') {
                  Option.map(spacerBesideOf(element), spacer =>
                    observer.observe(spacer),
                  )
                }
                state.maybeObserved = Option.some({ observer, maybeRoot })
              }
            }
            observe()
            const handleResize = () => {
              window.cancelAnimationFrame(state.frame)
              state.frame = window.requestAnimationFrame(observe)
            }
            window.addEventListener('resize', handleResize)
            return { state, handleResize }
          }),
          ({ state, handleResize }) =>
            Effect.sync(() => {
              window.removeEventListener('resize', handleResize)
              window.cancelAnimationFrame(state.frame)
              Option.map(state.maybeObserved, observed =>
                observed.observer.disconnect(),
              )
            }),
        ).pipe(Effect.flatMap(() => Effect.never)),
      ),
)

// PLAYBACK CLOCK

const clockOfElement = (element: Element): PlaybackClock => ({
  placeSeconds: Number(element.getAttribute('data-clock-place') ?? '0'),
  rate: Number(element.getAttribute('data-clock-rate') ?? '0'),
  durationSeconds: Number(element.getAttribute('data-clock-duration') ?? '0'),
  isMarking: element.getAttribute('data-clock-marking') !== 'false',
  keepsInView: element.getAttribute('data-clock-follow') === 'true',
})

const CLOCK_ATTRIBUTES: ReadonlyArray<string> = [
  'data-clock-place',
  'data-clock-rate',
  'data-clock-duration',
  'data-clock-marking',
  'data-clock-follow',
]

/** The spoken word is painted at most this often: it is never marked later than this. */
const WORD_PAINT_GAP_MS = 40

/** The scrubber and the time beside it are painted at most this often. */
const BAR_PAINT_GAP_MS = 100

/** How long the scrubber's measured width is trusted before it is read again. */
const WIDTH_TRUST_MS = 1000

type ClockRunner = Readonly<{ wake: () => void; stop: () => void }>

/**
 * Calls `paint` with the place the element's clock has reached, every
 * `paintGapMs` while it runs, once when the clock is told something new
 * while it stands still, and not at all otherwise. The element carries
 * the clock the Model said (`data-clock-place`, `-rate`, `-duration`,
 * `-marking`); this notes the moment each new place or rate arrives and
 * reads on from there, so the page hears the place about once a second
 * and still moves on the word. It stops with the tab in the background,
 * as animation frames do. `wake` paints again after something other than
 * the clock changed.
 */
const runPlaybackClock = (
  element: Element,
  paintGapMs: number,
  paint: (clock: PlaybackClock, placeSeconds: number, nowMs: number) => void,
): ClockRunner => {
  const state = {
    frame: 0,
    isRunning: false,
    told: '',
    anchoredAtMs: performance.now(),
    paintedAtMs: Number.NEGATIVE_INFINITY,
  }
  const step = (nowMs: number) => {
    if (nowMs - state.paintedAtMs >= paintGapMs) {
      const told = `${element.getAttribute('data-clock-place') ?? ''}|${element.getAttribute('data-clock-rate') ?? ''}`
      if (told !== state.told) {
        state.told = told
        state.anchoredAtMs = nowMs
      }
      const clock = clockOfElement(element)
      paint(clock, clockPlaceAt(clock, state.anchoredAtMs, nowMs), nowMs)
      state.paintedAtMs = nowMs
      if (clock.rate <= 0) {
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
  const observer = new MutationObserver(wake)
  observer.observe(element, {
    attributes: true,
    attributeFilter: [...CLOCK_ATTRIBUTES],
  })
  wake()
  return {
    wake,
    stop: () => {
      observer.disconnect()
      window.cancelAnimationFrame(state.frame)
      state.isRunning = false
    },
  }
}

const onPlaybackClock = (
  element: Element,
  paint: (clock: PlaybackClock, placeSeconds: number, nowMs: number) => void,
) =>
  Effect.acquireRelease(
    Effect.sync(() => runPlaybackClock(element, BAR_PAINT_GAP_MS, paint)),
    runner => Effect.sync(runner.stop),
  ).pipe(Effect.as(CompletedRunPlaybackClock()))

const SECTION_SELECTOR = '.fk-passage[data-start-ms]'
const WORD_SELECTOR = '.fk-word[data-start-ms]'
const WORD_CURRENT = 'data-word-current'
const SECTION_CURRENT = 'data-section-current'

type SpokenElements = Readonly<{
  sections: ReadonlyArray<SpokenSection>
  sectionElements: ReadonlyArray<Element>
  wordElements: ReadonlyArray<ReadonlyArray<Element>>
}>

const secondsOf = (element: Element): number =>
  Number(element.getAttribute('data-start-ms')) / MILLISECONDS_PER_SECOND

const spokenElementsOf = (transcript: Element): SpokenElements => {
  const sectionElements = Array.fromIterable(
    transcript.querySelectorAll(SECTION_SELECTOR),
  )
  const wordElements = Array.map(sectionElements, section =>
    Array.fromIterable(section.querySelectorAll(WORD_SELECTOR)),
  )
  return {
    sectionElements,
    wordElements,
    sections: Array.map(sectionElements, (section, index) => ({
      startSeconds: secondsOf(section),
      wordStarts: Array.map(wordElements[index] ?? [], secondsOf),
    })),
  }
}

const moveMark = (
  maybeFrom: Element | undefined,
  maybeTo: Element | undefined,
  attribute: string,
): void => {
  if (maybeFrom !== maybeTo) {
    maybeFrom?.removeAttribute(attribute)
  }
  if (maybeTo !== undefined && !maybeTo.hasAttribute(attribute)) {
    maybeTo.setAttribute(attribute, '')
  }
}

/**
 * Marks the section and the word being spoken, on the transcript: the
 * ones the playback clock has reached, by the page's own rule
 * (`spokenAt`). Only the old and the new word and section are touched.
 * It reads the sections and words from the page once, and again only
 * after the page's lines change.
 */
export const RunSpokenWord = Mount.define(
  'RunSpokenWord',
  CompletedRunPlaybackClock,
)(element => {
  const state: {
    maybeElements: SpokenElements | undefined
    maybeSection: Element | undefined
    maybeWord: Element | undefined
    maybeSectionIndex: Option.Option<number>
    hasLooked: boolean
  } = {
    maybeElements: undefined,
    maybeSection: undefined,
    maybeWord: undefined,
    maybeSectionIndex: Option.none(),
    hasLooked: false,
  }
  const paint = (clock: PlaybackClock, placeSeconds: number): void => {
    const elements = state.maybeElements ?? spokenElementsOf(element)
    state.maybeElements = elements
    const spoken = clock.isMarking
      ? spokenAt(elements.sections, placeSeconds)
      : { maybeSection: Option.none(), maybeWord: Option.none() }
    const maybeSectionIndex = Option.getOrUndefined(spoken.maybeSection)
    const maybeSection =
      maybeSectionIndex === undefined
        ? undefined
        : elements.sectionElements[maybeSectionIndex]
    const maybeWord =
      maybeSectionIndex === undefined
        ? undefined
        : Option.getOrUndefined(
            Option.flatMap(spoken.maybeWord, index =>
              Option.fromNullishOr(
                elements.wordElements[maybeSectionIndex]?.[index],
              ),
            ),
          )
    moveMark(state.maybeSection, maybeSection, SECTION_CURRENT)
    moveMark(state.maybeWord, maybeWord, WORD_CURRENT)
    // NOTE: the spoken section is brought into view here, at the moment
    // the mark crosses into it, not when the Model next hears the place.
    // The first look only marks: where the page opens is the Model's to
    // say. Once the listener scrolls away the clock says so, and nothing
    // is moved.
    if (
      state.hasLooked &&
      maybeSection instanceof HTMLElement &&
      bringsIntoView(clock, state.maybeSectionIndex, spoken.maybeSection)
    ) {
      scrollSectionElementTo(maybeSection, 'Center')
    }
    state.hasLooked = true
    state.maybeSectionIndex = spoken.maybeSection
    state.maybeSection = maybeSection
    state.maybeWord = maybeWord
  }
  return Effect.acquireRelease(
    Effect.sync(() => {
      const runner = runPlaybackClock(element, WORD_PAINT_GAP_MS, paint)
      // NOTE: when the page's lines change, the lists of sections and
      // words are read again, and the mark is put back at once, also while
      // the clock stands still.
      const lines = new MutationObserver(() => {
        state.maybeElements = undefined
        runner.wake()
      })
      lines.observe(element, { childList: true, subtree: true })
      return { runner, lines }
    }),
    ({ runner, lines }) =>
      Effect.sync(() => {
        lines.disconnect()
        runner.stop()
        state.maybeSection?.removeAttribute(SECTION_CURRENT)
        state.maybeWord?.removeAttribute(WORD_CURRENT)
      }),
  ).pipe(Effect.as(CompletedRunPlaybackClock()))
})

/**
 * Moves the scrubber's thumb and its filled track with the playback
 * clock, between the Model's own reports of the place.
 */
export const RunScrubberProgress = Mount.define(
  'RunScrubberProgress',
  CompletedRunPlaybackClock,
)(element => {
  const state = {
    halfPixels: Number.NaN,
    width: 0,
    measuredAtMs: Number.NEGATIVE_INFINITY,
  }
  return onPlaybackClock(element, (clock, placeSeconds, nowMs) => {
    const fraction = progressFractionOf(placeSeconds, clock.durationSeconds)
    // NOTE: reading an element's width makes the browser settle its
    // styles first, so the width is read once a second, not on every
    // paint; and the thumb is drawn again only when it would move by half
    // a pixel, so a long recording does not lay the bar out for nothing.
    if (nowMs - state.measuredAtMs >= WIDTH_TRUST_MS) {
      state.width = element.clientWidth
      state.measuredAtMs = nowMs
    }
    const halfPixels = Math.round(fraction * state.width * 2)
    if (halfPixels !== state.halfPixels && element instanceof HTMLElement) {
      state.halfPixels = halfPixels
      element.style.setProperty('--progress', `${fraction * 100}%`)
      element.style.setProperty('--progress-fraction', String(fraction))
    }
  })
})

/**
 * Turns the time beside the scrubber over on the second, with the
 * playback clock, between the Model's own reports of the place. It
 * writes into the text the view put there, so the view's next report
 * finds its own text to change.
 */
export const RunClockTime = Mount.define(
  'RunClockTime',
  CompletedRunPlaybackClock,
)(element =>
  onPlaybackClock(element, (_clock, placeSeconds) => {
    const text = formatClock(placeSeconds)
    const maybeText = element.firstChild
    if (maybeText instanceof Text && maybeText.nodeValue !== text) {
      maybeText.nodeValue = text
    }
  }),
)

// APPEARANCE

/**
 * Tells the page its mode and its contrast. The view says both on the
 * element this is mounted on (`data-mode`, `data-contrast`, from the
 * Model); this paints them on the page's
 * root, where the theme's colors are declared, remembers it for the next
 * first paint, and gives the browser's own bar the page's ground. It is
 * the only place the mode reaches the page, and it reads nothing but the
 * attribute it is told.
 */
export const TellPageItsMode: Mount.MountAction<Message> = {
  name: 'TellPageItsMode',
  f: element =>
    Stream.callback<Message>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const tell = () => {
            const mode =
              element.getAttribute('data-mode') === 'Dark' ? 'Dark' : 'Light'
            Theme.paintModeOnPage(mode, {
              root: document.documentElement,
              storage: window.localStorage,
            })
            Theme.paintContrastOnPage(
              element.getAttribute('data-contrast') === 'More'
                ? 'More'
                : 'Standard',
              document.documentElement,
            )
            const ground = getComputedStyle(document.documentElement)
              .getPropertyValue('--fk-page-ground')
              .trim()
            const maybeBar = document.querySelector('meta[name="theme-color"]')
            if (maybeBar !== null && ground !== '') {
              maybeBar.setAttribute('content', ground)
            }
          }
          const told = new MutationObserver(tell)
          told.observe(element, {
            attributes: true,
            attributeFilter: ['data-mode', 'data-contrast'],
          })
          tell()
          return told
        }),
        told => Effect.sync(() => told.disconnect()),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
}

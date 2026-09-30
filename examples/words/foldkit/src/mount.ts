import {
  Array,
  Effect,
  Function,
  Option,
  Queue,
  Schema as S,
  Stream,
  pipe,
} from 'effect'
import { Mount } from 'foldkit'
import {
  ApproachedListEdge,
  ChangedListRowFocus,
  ChangedPlayheadVisibility,
  ClickedWord,
  CompletedRunWallClock,
  CompletedShowRowMenuOnContextMenu,
  GotShareMessage,
  ListEdge,
  ReachedListTop,
  RecordingWindow,
  Share,
} from 'words-core-example'

const TOP_BAR_CLEARANCE_PX = 64
const BOTTOM_CONTROLS_CLEARANCE_PX = 168

/**
 * Reports whether the followed section is on screen, between the top bar and
 * the floating controls, as the listener scrolls or the transcript grows. It
 * mounts inside the followed section only, so a new followed section starts a
 * new observer and reports at once.
 */
export const ObservePlayheadVisibility = Mount.defineStream(
  'ObservePlayheadVisibility',
  { sectionID: S.String },
  ChangedPlayheadVisibility,
)(
  ({ sectionID }) =>
    element =>
      Stream.callback<typeof ChangedPlayheadVisibility.Type>(queue =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const observer = new IntersectionObserver(
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
            observer.observe(element)
            return observer
          }),
          observer => Effect.sync(() => observer.disconnect()),
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

const WORD_SELECTOR = '[data-word-seconds]'

/**
 * Plays from a transcript word when it is clicked, but not when the click
 * ends a text selection, so selecting words to copy never moves playback.
 * One listener serves every word of the transcript.
 */
export const TrackWordClicks = Mount.defineStream(
  'TrackWordClicks',
  ClickedWord,
)(element =>
  Stream.callback<typeof ClickedWord.Type>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const handleClick = (event: Event) => {
          const isSelecting = Option.exists(
            Option.fromNullishOr(window.getSelection()),
            selection => !selection.isCollapsed,
          )
          const maybeWord = pipe(
            Option.fromNullishOr(event.target),
            Option.filter(
              (target): target is Element => target instanceof Element,
            ),
            Option.flatMap(target =>
              Option.fromNullishOr(target.closest(WORD_SELECTOR)),
            ),
          )
          if (!isSelecting && Option.isSome(maybeWord)) {
            const seconds = Number(
              maybeWord.value.getAttribute('data-word-seconds'),
            )
            if (Number.isFinite(seconds)) {
              Queue.offerUnsafe(queue, ClickedWord({ seconds }))
            }
          }
        }
        element.addEventListener('click', handleClick)
        return handleClick
      }),
      handleClick =>
        Effect.sync(() => element.removeEventListener('click', handleClick)),
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

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
  ChangedPlayheadVisibility,
  ClickedWord,
  CompletedRunWallClock,
  CompletedShowRowMenuOnContextMenu,
  GotShareMessage,
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

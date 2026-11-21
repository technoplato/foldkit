import { Option, Schema as S } from 'effect'

import * as Command from '../command/index.js'
import {
  define,
  ignore,
  otherwise,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import type * as Placement from './placement.js'
import * as TimedHint from './timedHint.js'

// NOTE: this is the reusable framework-free `hoverIntent` block (Scribe #2630).
// It models delayed pointer open/close intent, interactive panel engagement,
// pointer-type focus discrimination (mouse click focus does not affirm open;
// keyboard/touch/pen focus does), Escape dismissal until full disengage,
// monotonic open/close version guards, and safe-triangle pointer-corridor
// geometry. Every wait is a Command (`Command.answerAfter`), so no painter
// holds a timer. Reused by Tooltip (#11), NavigationMenu (#21), and
// HoverCard (#27).

// CONSTANTS

/** Default pointer hover open delay in milliseconds (`200`). */
export const defaultOpenDelayMs = 200

/** Default pointer departure grace period in milliseconds (`300`). */
export const defaultCloseDelayMs = 300

/** Default lateral padding in pixels applied to the safe-triangle corridor. */
export const defaultCorridorPaddingPx = 5

// SCHEMAS

/** Where affirming focus currently resides inside a hover-intent pair. */
export const FocusLocation = S.Literals(['Trigger', 'Panel'])
/** Where affirming focus currently resides inside a hover-intent pair. */
export type FocusLocation = typeof FocusLocation.Type

/** A 2D point in the view's coordinate space (`{ x: 120, y: 64 }`). */
export const Point = S.Struct({ x: S.Number, y: S.Number })
/** A 2D point in the view's coordinate space. */
export type Point = typeof Point.Type

/** A closed polygon of 2D vertices used for safe pointer-corridor checks. */
export const Polygon = S.Array(Point)
/** A closed polygon of 2D vertices. */
export type Polygon = typeof Polygon.Type

/**
 * Read-only configuration supplied to the HoverIntent chart.
 *
 * - `openDelayMs`: delay before pointer hover opens (defaults to `200`; `0` opens immediately).
 * - `closeDelayMs`: grace delay before pointer departure closes (defaults to `300`; `0` closes immediately).
 * - `isInteractive`: whether hovering or focusing the floating panel keeps intent open (defaults to `true`).
 */
export const Props = S.Struct({
  openDelayMs: S.optionalKey(S.Number),
  closeDelayMs: S.optionalKey(S.Number),
  isInteractive: S.optionalKey(S.Boolean),
})
/** Read-only configuration supplied to the HoverIntent chart. */
export type Props = typeof Props.Type

// STATE

const stateFields = {
  isTriggerHovered: S.Boolean,
  isPanelHovered: S.Boolean,
  maybeFocusLocation: S.Option(FocusLocation),
  isDismissed: S.Boolean,
  maybeLastPointerType: S.Option(S.String),
  openVersion: S.Number,
  closeVersion: S.Number,
}

/** Hidden with no open timer running. */
export const Closed = ts('Closed', stateFields)
/** Hidden with no open timer running. */
export type Closed = typeof Closed.Type

/** Hidden while waiting for `WaitBeforeOpening` to elapse. */
export const Opening = ts('Opening', stateFields)
/** Hidden while waiting for `WaitBeforeOpening` to elapse. */
export type Opening = typeof Opening.Type

/** Visible and engaged (or opened programmatically). */
export const Open = ts('Open', stateFields)
/** Visible and engaged. */
export type Open = typeof Open.Type

/** Still visible while waiting for `WaitBeforeClosing` to elapse after disengagement. */
export const Closing = ts('Closing', stateFields)
/** Still visible while waiting for `WaitBeforeClosing` to elapse. */
export type Closing = typeof Closing.Type

/**
 * Where a HoverIntent block stands: `Closed`, `Opening`, `Open`, or `Closing`.
 * Lives in the Model and is JSON-serializable with no sentinel values.
 */
export const State = S.Union([Closed, Opening, Open, Closing])
/** Where a HoverIntent block stands. */
export type State = typeof State.Type

/** Initial HoverIntent state: closed, unengaged, at versions `0`. */
export const initial: State = Closed({
  isTriggerHovered: false,
  isPanelHovered: false,
  maybeFocusLocation: Option.none(),
  isDismissed: false,
  maybeLastPointerType: Option.none(),
  openVersion: 0,
  closeVersion: 0,
})

// MESSAGE

/** Pointer entered the trigger element. */
export const EnteredTrigger = m('EnteredTrigger', {
  pointerType: S.optionalKey(S.String),
})
/** Pointer left the trigger element. */
export const LeftTrigger = m('LeftTrigger', {
  pointerType: S.optionalKey(S.String),
})
/** Pointer entered the floating panel (honored when `isInteractive` is true). */
export const EnteredPanel = m('EnteredPanel', {
  pointerType: S.optionalKey(S.String),
})
/** Pointer left the floating panel. */
export const LeftPanel = m('LeftPanel', {
  pointerType: S.optionalKey(S.String),
})
/** Focus moved onto the trigger element. */
export const FocusedTrigger = m('FocusedTrigger')
/** Focus left the trigger element. */
export const BlurredTrigger = m('BlurredTrigger')
/** Focus moved into the floating panel (honored when `isInteractive` is true). */
export const FocusedPanel = m('FocusedPanel')
/** Focus left the floating panel. */
export const BlurredPanel = m('BlurredPanel')
/** Pointer pressed down on the trigger; recorded to tell mouse click focus apart from keyboard/touch/pen focus. */
export const PressedPointer = m('PressedPointer', { pointerType: S.String })
/** Escape was pressed, closing immediately and suppressing reopen until full disengage. */
export const PressedEscape = m('PressedEscape')
/** Programmatically opens immediately without waiting for `openDelayMs`. */
export const ShowNow = m('ShowNow')
/** Programmatically closes immediately without waiting for `closeDelayMs`. */
export const HideNow = m('HideNow')
/** A scheduled open delay elapsed for `version`. */
export const ElapsedOpen = m('ElapsedOpen', { version: S.Number })
/** A scheduled close delay elapsed for `version`. */
export const ElapsedClose = m('ElapsedClose', { version: S.Number })

/** Every Message the HoverIntent block handles. */
export const Message = S.Union([
  EnteredTrigger,
  LeftTrigger,
  EnteredPanel,
  LeftPanel,
  FocusedTrigger,
  BlurredTrigger,
  FocusedPanel,
  BlurredPanel,
  PressedPointer,
  PressedEscape,
  ShowNow,
  HideNow,
  ElapsedOpen,
  ElapsedClose,
])
/** Every Message the HoverIntent block handles. */
export type Message = typeof Message.Type

/** True for a Message of the HoverIntent block. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits `afterMs` milliseconds and answers `ElapsedOpen({ version })`. */
export const WaitBeforeOpening = Command.define(
  'WaitBeforeOpening',
  { version: S.Number, afterMs: S.Number },
  ElapsedOpen,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedOpen({ version })),
)

/** Waits `afterMs` milliseconds and answers `ElapsedClose({ version })`. */
export const WaitBeforeClosing = Command.define(
  'WaitBeforeClosing',
  { version: S.Number, afterMs: S.Number },
  ElapsedClose,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedClose({ version })),
)

// PURE READINGS & RULES

/** Resolved open delay in milliseconds (defaults to `200`, clamped to `>= 0`). */
export const openDelayMsOf = (props: Pick<Props, 'openDelayMs'>): number =>
  Math.max(0, props.openDelayMs ?? defaultOpenDelayMs)

/** Resolved close delay in milliseconds (defaults to `300`, clamped to `>= 0`). */
export const closeDelayMsOf = (props: Pick<Props, 'closeDelayMs'>): number =>
  Math.max(0, props.closeDelayMs ?? defaultCloseDelayMs)

/** True when hovering or focusing the floating panel keeps intent open (`true` by default). */
export const isInteractiveOf = (props: Pick<Props, 'isInteractive'>): boolean =>
  props.isInteractive ?? true

/**
 * Delay in milliseconds used when `message` schedules `WaitBeforeClosing`:
 * blur uses `0` ms so focus handoff from trigger to panel can cancel it without
 * adding the pointer grace period; pointer departure uses `closeDelayMs`.
 */
export const closeWaitDelayMsOf = (
  message: Message,
  props: Pick<Props, 'closeDelayMs'>,
): number =>
  message._tag === 'BlurredTrigger' || message._tag === 'BlurredPanel'
    ? 0
    : closeDelayMsOf(props)

/** True while the surface is visible (`Open` or `Closing`). */
export const isOpen = (state: State): boolean =>
  state._tag === 'Open' || state._tag === 'Closing'

/** True while waiting for `openDelayMs` to elapse (`Opening`). */
export const isOpening = (state: State): boolean => state._tag === 'Opening'

/** True while visible and counting down `closeDelayMs` (`Closing`). */
export const isClosing = (state: State): boolean => state._tag === 'Closing'

/** True when the pointer is over either the trigger or the floating panel. */
export const isPointerOver = (
  state: Pick<State, 'isTriggerHovered' | 'isPanelHovered'>,
): boolean => state.isTriggerHovered || state.isPanelHovered

/** True when pointer hover or affirming focus currently engages the trigger or panel. */
export const isEngaged = (
  state: Pick<
    State,
    'isTriggerHovered' | 'isPanelHovered' | 'maybeFocusLocation'
  >,
): boolean => isPointerOver(state) || Option.isSome(state.maybeFocusLocation)

/**
 * True when `maybePointerType` represents a pointer capable of hover intent:
 * `'mouse'`, `'pen'`, or `undefined` (unspecified) return `true`; touch
 * pointers (`'touch'` / `'Touch'`) return `false` so tap-synthesized
 * pointerenter/pointerleave events never masquerade as hover.
 *
 * @example
 * ```typescript
 * canHoverPointer(undefined) // true
 * canHoverPointer('mouse') // true
 * canHoverPointer('pen') // true
 * canHoverPointer('touch') // false
 * ```
 */
export const canHoverPointer = (maybePointerType?: string): boolean =>
  maybePointerType === undefined || maybePointerType.toLowerCase() !== 'touch'

/**
 * True when focus on the trigger should affirm opening: keyboard and assistive
 * technology focus (`None`, no preceding pointer press) affirms open, whereas
 * pointer-induced focus (`'mouse'`, `'touch'`, or `'pen'` tap) does not stick
 * or double-toggle on mobile browsers.
 *
 * @example
 * ```typescript
 * isPointerAffirmedFocus(Option.none()) // true (keyboard / VoiceOver)
 * isPointerAffirmedFocus(Option.some('touch')) // false
 * isPointerAffirmedFocus(Option.some('mouse')) // false
 * ```
 */
export const isPointerAffirmedFocus = (
  maybeLastPointerType: Option.Option<string>,
): boolean => Option.isNone(maybeLastPointerType)

/**
 * True when an elapsed wait carrying `version` matches the current monotonic
 * `currentVersion`. Rejects stale timers after re-entry, leave, blur, or Escape.
 *
 * @example
 * ```typescript
 * shouldAcceptVersion(3, 3) // true
 * shouldAcceptVersion(3, 2) // false
 * ```
 */
export const shouldAcceptVersion = (
  currentVersion: number,
  version: number,
): boolean => currentVersion === version

/** True when `key` is `'Escape'`. */
export const isEscapeKey = (key: string): boolean => key === 'Escape'

// SAFE-TRIANGLE & POINTER-CORRIDOR GEOMETRY

const cross2D = (a: Point, b: Point, c: Point): number =>
  (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y)

/**
 * True when `point` lies inside or on the boundary of the non-degenerate
 * triangle `(a, b, c)`, regardless of clockwise or counter-clockwise winding.
 *
 * @example
 * ```typescript
 * isPointInTriangle(
 *   { x: 2, y: 2 },
 *   { x: 0, y: 0 },
 *   { x: 10, y: 0 },
 *   { x: 0, y: 10 },
 * ) // true
 * ```
 */
export const isPointInTriangle = (
  point: Point,
  a: Point,
  b: Point,
  c: Point,
): boolean => {
  if (cross2D(a, b, c) === 0) {
    return false
  }
  const d1 = cross2D(point, a, b)
  const d2 = cross2D(point, b, c)
  const d3 = cross2D(point, c, a)
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNegative && hasPositive)
}

/** True when `point` lies inside or on the edges of `rect`. */
export const isPointInRect = (point: Point, rect: Placement.Rect): boolean =>
  point.x >= rect.left &&
  point.x <= rect.left + rect.width &&
  point.y >= rect.top &&
  point.y <= rect.top + rect.height

/**
 * True when `point` lies inside `polygon` (ray-casting test), for safe-corridor
 * checks around floating panels and submenus.
 */
export const isPointInPolygon = (
  point: Point,
  polygon: ReadonlyArray<Point>,
): boolean => {
  if (polygon.length < 3) {
    return false
  }
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a === undefined || b === undefined) {
      continue
    }
    const straddlesY = a.y > point.y !== b.y > point.y
    if (
      straddlesY &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Builds the safe-triangle vertices `[origin, cornerA, cornerB]` spanning the
 * silhouette of `panelRect` as seen from `origin`, expanded laterally by
 * `paddingPx`. Works for panels placed above, below, left, right, or
 * diagonally from the trigger.
 */
export const safeTriangleOf = (
  origin: Point,
  panelRect: Placement.Rect,
  paddingPx: number = defaultCorridorPaddingPx,
): readonly [Point, Point, Point] => {
  const pad = Math.max(0, paddingPx)
  const left = panelRect.left
  const right = panelRect.left + panelRect.width
  const top = panelRect.top
  const bottom = panelRect.top + panelRect.height

  if (origin.y < top) {
    if (origin.x < left) {
      return [origin, { x: left, y: bottom + pad }, { x: right + pad, y: top }]
    } else if (origin.x > right) {
      return [origin, { x: left - pad, y: top }, { x: right, y: bottom + pad }]
    } else {
      return [origin, { x: left - pad, y: top }, { x: right + pad, y: top }]
    }
  } else if (origin.y > bottom) {
    if (origin.x < left) {
      return [origin, { x: left, y: top - pad }, { x: right + pad, y: bottom }]
    } else if (origin.x > right) {
      return [origin, { x: left - pad, y: bottom }, { x: right, y: top - pad }]
    } else {
      return [
        origin,
        { x: left - pad, y: bottom },
        { x: right + pad, y: bottom },
      ]
    }
  } else if (origin.x < left) {
    return [origin, { x: left, y: top - pad }, { x: left, y: bottom + pad }]
  } else if (origin.x > right) {
    return [origin, { x: right, y: top - pad }, { x: right, y: bottom + pad }]
  } else {
    return [origin, { x: left, y: top }, { x: right, y: bottom }]
  }
}

/**
 * True when a pointer moving from `origin` to `point` is inside `panelRect` or
 * within the safe triangle pointing from `origin` toward `panelRect`. Used by
 * HoverCard and NavigationMenu submenus so diagonal movement toward a floating
 * panel keeps it open.
 *
 * @example
 * ```typescript
 * const panel = { left: 110, top: 60, width: 200, height: 240 }
 * isMovingTowardPanel({ x: 100, y: 115 }, { x: 106, y: 80 }, panel) // true
 * isMovingTowardPanel({ x: 100, y: 115 }, { x: 100, y: 40 }, panel) // false
 * ```
 */
export const isMovingTowardPanel = (
  origin: Point,
  point: Point,
  panelRect: Placement.Rect,
  paddingPx: number = defaultCorridorPaddingPx,
): boolean => {
  if (isPointInRect(point, panelRect)) {
    return true
  }
  if (isPointInRect(origin, panelRect)) {
    return false
  }
  const [a, b, c] = safeTriangleOf(origin, panelRect, paddingPx)
  return isPointInTriangle(point, a, b, c)
}

// INTERNAL TRANSITION HELPERS

type Fields = Readonly<{
  isTriggerHovered: boolean
  isPanelHovered: boolean
  maybeFocusLocation: Option.Option<FocusLocation>
  isDismissed: boolean
  maybeLastPointerType: Option.Option<string>
  openVersion: number
  closeVersion: number
}>

const fieldsOf = (state: State): Fields => ({
  isTriggerHovered: state.isTriggerHovered,
  isPanelHovered: state.isPanelHovered,
  maybeFocusLocation: state.maybeFocusLocation,
  isDismissed: state.isDismissed,
  maybeLastPointerType: state.maybeLastPointerType,
  openVersion: state.openVersion,
  closeVersion: state.closeVersion,
})

const clearFocusAt = (
  maybeFocusLocation: Option.Option<FocusLocation>,
  location: FocusLocation,
): Option.Option<FocusLocation> =>
  Option.contains(maybeFocusLocation, location)
    ? Option.none()
    : maybeFocusLocation

const dismissFieldsOf = (state: State): Fields => {
  const maybeFocusLocation = Option.contains(
    state.maybeFocusLocation,
    'Trigger',
  )
    ? state.maybeFocusLocation
    : Option.none<FocusLocation>()
  return {
    isTriggerHovered: state.isTriggerHovered,
    isPanelHovered: false,
    maybeFocusLocation,
    isDismissed: state.isTriggerHovered || Option.isSome(maybeFocusLocation),
    maybeLastPointerType: state.maybeLastPointerType,
    openVersion: TimedHint.nextVersion(state.openVersion),
    closeVersion: TimedHint.nextVersion(state.closeVersion),
  }
}

const leftFieldsOf = (state: State, which: 'Trigger' | 'Panel'): Fields => {
  const next: Fields = {
    ...fieldsOf(state),
    ...(which === 'Trigger'
      ? { isTriggerHovered: false }
      : { isPanelHovered: false }),
    openVersion: TimedHint.nextVersion(state.openVersion),
  }
  return isEngaged(next) ? next : { ...next, isDismissed: false }
}

const blurredFieldsOf = (state: State, location: FocusLocation): Fields => {
  const next: Fields = {
    ...fieldsOf(state),
    maybeFocusLocation: clearFocusAt(state.maybeFocusLocation, location),
    ...(location === 'Trigger' ? { maybeLastPointerType: Option.none() } : {}),
    openVersion: TimedHint.nextVersion(state.openVersion),
  }
  return isEngaged(next) ? next : { ...next, isDismissed: false }
}

const shouldScheduleBlurClose = (props: Props): boolean =>
  isInteractiveOf(props) && closeDelayMsOf(props) > 0

// CHART

/**
 * The HoverIntent Machine chart: delayed pointer open, optional close grace
 * period, interactive panel hover/focus engagement, pointer-type focus
 * discrimination, Escape dismissal until full disengage, and monotonic version
 * guards rejecting stale `ElapsedOpen` / `ElapsedClose` timers.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Closed: {
        on: {
          EnteredTrigger: [
            when(
              (state, message, context) =>
                canHoverPointer(message.pointerType) &&
                !state.isDismissed &&
                openDelayMsOf(context) <= 0,
              'Open',
              ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  isTriggerHovered: true,
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            when(
              (state, message, context) =>
                canHoverPointer(message.pointerType) &&
                !state.isDismissed &&
                openDelayMsOf(context) > 0,
              'Opening',
              ({ state, context }) => {
                const version = TimedHint.nextVersion(state.openVersion)
                return {
                  model: Opening({
                    ...fieldsOf(state),
                    isTriggerHovered: true,
                    openVersion: version,
                    closeVersion: TimedHint.nextVersion(state.closeVersion),
                  }),
                  commands: [
                    WaitBeforeOpening({
                      version,
                      afterMs: openDelayMsOf(context),
                    }),
                  ],
                }
              },
            ),
            when(
              (_state, message) => canHoverPointer(message.pointerType),
              'Closed',
              ({ state }) =>
                Closed({
                  ...fieldsOf(state),
                  isTriggerHovered: true,
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          LeftTrigger: [
            when(
              (_state, message) => canHoverPointer(message.pointerType),
              'Closed',
              ({ state }) => Closed(leftFieldsOf(state, 'Trigger')),
            ),
            ignore(),
          ],
          EnteredPanel: [
            when(
              (state, message, context) =>
                canHoverPointer(message.pointerType) &&
                isInteractiveOf(context) &&
                !state.isDismissed &&
                openDelayMsOf(context) <= 0,
              'Open',
              ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  isPanelHovered: true,
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            when(
              (state, message, context) =>
                canHoverPointer(message.pointerType) &&
                isInteractiveOf(context) &&
                !state.isDismissed &&
                openDelayMsOf(context) > 0,
              'Opening',
              ({ state, context }) => {
                const version = TimedHint.nextVersion(state.openVersion)
                return {
                  model: Opening({
                    ...fieldsOf(state),
                    isPanelHovered: true,
                    openVersion: version,
                    closeVersion: TimedHint.nextVersion(state.closeVersion),
                  }),
                  commands: [
                    WaitBeforeOpening({
                      version,
                      afterMs: openDelayMsOf(context),
                    }),
                  ],
                }
              },
            ),
            when(
              (_state, message, context) =>
                canHoverPointer(message.pointerType) &&
                isInteractiveOf(context),
              'Closed',
              ({ state }) =>
                Closed({
                  ...fieldsOf(state),
                  isPanelHovered: true,
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          LeftPanel: [
            when(
              (_state, message) => canHoverPointer(message.pointerType),
              'Closed',
              ({ state }) => Closed(leftFieldsOf(state, 'Panel')),
            ),
            ignore(),
          ],
          FocusedTrigger: [
            when(
              state => !isPointerAffirmedFocus(state.maybeLastPointerType),
              'Closed',
              ({ state }) =>
                Closed({
                  ...fieldsOf(state),
                  maybeLastPointerType: Option.none(),
                }),
            ),
            when(
              state => state.isDismissed,
              'Closed',
              ({ state }) =>
                Closed({
                  ...fieldsOf(state),
                  maybeFocusLocation: Option.some('Trigger'),
                  maybeLastPointerType: Option.none(),
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            otherwise(
              to('Open', ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  maybeFocusLocation: Option.some('Trigger'),
                  maybeLastPointerType: Option.none(),
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
              ),
            ),
          ],
          BlurredTrigger: to('Closed', ({ state }) =>
            Closed(blurredFieldsOf(state, 'Trigger')),
          ),
          FocusedPanel: [
            when(
              (state, _message, context) =>
                isInteractiveOf(context) && state.isDismissed,
              'Closed',
              ({ state }) =>
                Closed({
                  ...fieldsOf(state),
                  maybeFocusLocation: Option.some('Panel'),
                  maybeLastPointerType: Option.none(),
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            when(
              (_state, _message, context) => isInteractiveOf(context),
              'Open',
              ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  maybeFocusLocation: Option.some('Panel'),
                  maybeLastPointerType: Option.none(),
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          BlurredPanel: to('Closed', ({ state }) =>
            Closed(blurredFieldsOf(state, 'Panel')),
          ),
          PressedPointer: to('Closed', ({ state, message }) =>
            Closed({
              ...fieldsOf(state),
              maybeLastPointerType: Option.some(message.pointerType),
            }),
          ),
          PressedEscape: to('Closed', ({ state }) =>
            Closed(dismissFieldsOf(state)),
          ),
          ShowNow: to('Open', ({ state }) =>
            Open({
              ...fieldsOf(state),
              isDismissed: false,
              openVersion: TimedHint.nextVersion(state.openVersion),
              closeVersion: TimedHint.nextVersion(state.closeVersion),
            }),
          ),
          HideNow: [ignore()],
          ElapsedOpen: [ignore()],
          ElapsedClose: [ignore()],
        },
      },
      Opening: {
        on: {
          EnteredTrigger: [
            when(
              (_state, message) => canHoverPointer(message.pointerType),
              'Opening',
              ({ state }) =>
                Opening({
                  ...fieldsOf(state),
                  isTriggerHovered: true,
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          LeftTrigger: [
            when(
              (state, message) =>
                canHoverPointer(message.pointerType) &&
                isEngaged(leftFieldsOf(state, 'Trigger')),
              'Opening',
              ({ state }) => Opening(leftFieldsOf(state, 'Trigger')),
            ),
            when(
              (_state, message) => canHoverPointer(message.pointerType),
              'Closed',
              ({ state }) => Closed(leftFieldsOf(state, 'Trigger')),
            ),
            ignore(),
          ],
          EnteredPanel: [
            when(
              (_state, message, context) =>
                canHoverPointer(message.pointerType) &&
                isInteractiveOf(context),
              'Opening',
              ({ state }) =>
                Opening({
                  ...fieldsOf(state),
                  isPanelHovered: true,
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          LeftPanel: [
            when(
              (state, message) =>
                canHoverPointer(message.pointerType) &&
                isEngaged(leftFieldsOf(state, 'Panel')),
              'Opening',
              ({ state }) => Opening(leftFieldsOf(state, 'Panel')),
            ),
            when(
              (_state, message) => canHoverPointer(message.pointerType),
              'Closed',
              ({ state }) => Closed(leftFieldsOf(state, 'Panel')),
            ),
            ignore(),
          ],
          FocusedTrigger: [
            when(
              state => !isPointerAffirmedFocus(state.maybeLastPointerType),
              'Opening',
              ({ state }) =>
                Opening({
                  ...fieldsOf(state),
                  maybeLastPointerType: Option.none(),
                }),
            ),
            otherwise(
              to('Open', ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  maybeFocusLocation: Option.some('Trigger'),
                  maybeLastPointerType: Option.none(),
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
              ),
            ),
          ],
          BlurredTrigger: [
            when(
              state => isEngaged(blurredFieldsOf(state, 'Trigger')),
              'Opening',
              ({ state }) => Opening(blurredFieldsOf(state, 'Trigger')),
            ),
            otherwise(
              to('Closed', ({ state }) =>
                Closed(blurredFieldsOf(state, 'Trigger')),
              ),
            ),
          ],
          FocusedPanel: [
            when(
              (_state, _message, context) => isInteractiveOf(context),
              'Open',
              ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  maybeFocusLocation: Option.some('Panel'),
                  maybeLastPointerType: Option.none(),
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          BlurredPanel: [
            when(
              state => isEngaged(blurredFieldsOf(state, 'Panel')),
              'Opening',
              ({ state }) => Opening(blurredFieldsOf(state, 'Panel')),
            ),
            otherwise(
              to('Closed', ({ state }) =>
                Closed(blurredFieldsOf(state, 'Panel')),
              ),
            ),
          ],
          PressedPointer: to('Opening', ({ state, message }) =>
            Opening({
              ...fieldsOf(state),
              maybeLastPointerType: Option.some(message.pointerType),
            }),
          ),
          PressedEscape: to('Closed', ({ state }) =>
            Closed(dismissFieldsOf(state)),
          ),
          ShowNow: to('Open', ({ state }) =>
            Open({
              ...fieldsOf(state),
              isDismissed: false,
              openVersion: TimedHint.nextVersion(state.openVersion),
              closeVersion: TimedHint.nextVersion(state.closeVersion),
            }),
          ),
          HideNow: to('Closed', ({ state }) => Closed(dismissFieldsOf(state))),
          ElapsedOpen: [
            when(
              (state, message) =>
                shouldAcceptVersion(state.openVersion, message.version) &&
                !state.isDismissed &&
                isEngaged(state),
              'Open',
              ({ state }) => Open(fieldsOf(state)),
            ),
            ignore(),
          ],
          ElapsedClose: [ignore()],
        },
      },
      Open: {
        on: {
          EnteredTrigger: [
            when(
              (_state, message) => canHoverPointer(message.pointerType),
              'Open',
              ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  isTriggerHovered: true,
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          LeftTrigger: [
            when(
              (_state, message) => !canHoverPointer(message.pointerType),
              'Open',
              ({ state }) => state,
            ),
            when(
              state => isEngaged(leftFieldsOf(state, 'Trigger')),
              'Open',
              ({ state }) => Open(leftFieldsOf(state, 'Trigger')),
            ),
            when(
              (_state, _message, context) => closeDelayMsOf(context) <= 0,
              'Closed',
              ({ state }) =>
                Closed({
                  ...leftFieldsOf(state, 'Trigger'),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            otherwise(
              to('Closing', ({ state, context }) => {
                const version = TimedHint.nextVersion(state.closeVersion)
                return {
                  model: Closing({
                    ...leftFieldsOf(state, 'Trigger'),
                    closeVersion: version,
                  }),
                  commands: [
                    WaitBeforeClosing({
                      version,
                      afterMs: closeDelayMsOf(context),
                    }),
                  ],
                }
              }),
            ),
          ],
          EnteredPanel: [
            when(
              (_state, message, context) =>
                canHoverPointer(message.pointerType) &&
                isInteractiveOf(context),
              'Open',
              ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  isPanelHovered: true,
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          LeftPanel: [
            when(
              (_state, message) => !canHoverPointer(message.pointerType),
              'Open',
              ({ state }) => state,
            ),
            when(
              state => isEngaged(leftFieldsOf(state, 'Panel')),
              'Open',
              ({ state }) => Open(leftFieldsOf(state, 'Panel')),
            ),
            when(
              (_state, _message, context) => closeDelayMsOf(context) <= 0,
              'Closed',
              ({ state }) =>
                Closed({
                  ...leftFieldsOf(state, 'Panel'),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            otherwise(
              to('Closing', ({ state, context }) => {
                const version = TimedHint.nextVersion(state.closeVersion)
                return {
                  model: Closing({
                    ...leftFieldsOf(state, 'Panel'),
                    closeVersion: version,
                  }),
                  commands: [
                    WaitBeforeClosing({
                      version,
                      afterMs: closeDelayMsOf(context),
                    }),
                  ],
                }
              }),
            ),
          ],
          FocusedTrigger: [
            when(
              state => !isPointerAffirmedFocus(state.maybeLastPointerType),
              'Open',
              ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  maybeLastPointerType: Option.none(),
                }),
            ),
            otherwise(
              to('Open', ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  maybeFocusLocation: Option.some('Trigger'),
                  maybeLastPointerType: Option.none(),
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
              ),
            ),
          ],
          BlurredTrigger: [
            when(
              state => isEngaged(blurredFieldsOf(state, 'Trigger')),
              'Open',
              ({ state }) => Open(blurredFieldsOf(state, 'Trigger')),
            ),
            when(
              (_state, _message, context) => shouldScheduleBlurClose(context),
              'Closing',
              ({ state }) => {
                const version = TimedHint.nextVersion(state.closeVersion)
                return {
                  model: Closing({
                    ...blurredFieldsOf(state, 'Trigger'),
                    closeVersion: version,
                  }),
                  commands: [WaitBeforeClosing({ version, afterMs: 0 })],
                }
              },
            ),
            otherwise(
              to('Closed', ({ state }) =>
                Closed({
                  ...blurredFieldsOf(state, 'Trigger'),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
              ),
            ),
          ],
          FocusedPanel: [
            when(
              (_state, _message, context) => isInteractiveOf(context),
              'Open',
              ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  maybeFocusLocation: Option.some('Panel'),
                  maybeLastPointerType: Option.none(),
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          BlurredPanel: [
            when(
              state => isEngaged(blurredFieldsOf(state, 'Panel')),
              'Open',
              ({ state }) => Open(blurredFieldsOf(state, 'Panel')),
            ),
            when(
              (_state, _message, context) => shouldScheduleBlurClose(context),
              'Closing',
              ({ state }) => {
                const version = TimedHint.nextVersion(state.closeVersion)
                return {
                  model: Closing({
                    ...blurredFieldsOf(state, 'Panel'),
                    closeVersion: version,
                  }),
                  commands: [WaitBeforeClosing({ version, afterMs: 0 })],
                }
              },
            ),
            otherwise(
              to('Closed', ({ state }) =>
                Closed({
                  ...blurredFieldsOf(state, 'Panel'),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
              ),
            ),
          ],
          PressedPointer: to('Open', ({ state, message }) =>
            Open({
              ...fieldsOf(state),
              maybeLastPointerType: Option.some(message.pointerType),
            }),
          ),
          PressedEscape: to('Closed', ({ state }) =>
            Closed(dismissFieldsOf(state)),
          ),
          ShowNow: [ignore()],
          HideNow: to('Closed', ({ state }) => Closed(dismissFieldsOf(state))),
          ElapsedOpen: [ignore()],
          ElapsedClose: [ignore()],
        },
      },
      Closing: {
        on: {
          EnteredTrigger: [
            when(
              (_state, message) => canHoverPointer(message.pointerType),
              'Open',
              ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  isTriggerHovered: true,
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          LeftTrigger: [
            when(
              (_state, message) => canHoverPointer(message.pointerType),
              'Closing',
              ({ state }) => Closing(leftFieldsOf(state, 'Trigger')),
            ),
            ignore(),
          ],
          EnteredPanel: [
            when(
              (_state, message, context) =>
                canHoverPointer(message.pointerType) &&
                isInteractiveOf(context),
              'Open',
              ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  isPanelHovered: true,
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          LeftPanel: [
            when(
              (_state, message) => canHoverPointer(message.pointerType),
              'Closing',
              ({ state }) => Closing(leftFieldsOf(state, 'Panel')),
            ),
            ignore(),
          ],
          FocusedTrigger: [
            when(
              state => !isPointerAffirmedFocus(state.maybeLastPointerType),
              'Closing',
              ({ state }) =>
                Closing({
                  ...fieldsOf(state),
                  maybeLastPointerType: Option.none(),
                }),
            ),
            otherwise(
              to('Open', ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  maybeFocusLocation: Option.some('Trigger'),
                  maybeLastPointerType: Option.none(),
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
              ),
            ),
          ],
          BlurredTrigger: to('Closing', ({ state }) =>
            Closing(blurredFieldsOf(state, 'Trigger')),
          ),
          FocusedPanel: [
            when(
              (_state, _message, context) => isInteractiveOf(context),
              'Open',
              ({ state }) =>
                Open({
                  ...fieldsOf(state),
                  maybeFocusLocation: Option.some('Panel'),
                  maybeLastPointerType: Option.none(),
                  openVersion: TimedHint.nextVersion(state.openVersion),
                  closeVersion: TimedHint.nextVersion(state.closeVersion),
                }),
            ),
            ignore(),
          ],
          BlurredPanel: to('Closing', ({ state }) =>
            Closing(blurredFieldsOf(state, 'Panel')),
          ),
          PressedPointer: to('Closing', ({ state, message }) =>
            Closing({
              ...fieldsOf(state),
              maybeLastPointerType: Option.some(message.pointerType),
            }),
          ),
          PressedEscape: to('Closed', ({ state }) =>
            Closed(dismissFieldsOf(state)),
          ),
          ShowNow: to('Open', ({ state }) =>
            Open({
              ...fieldsOf(state),
              isDismissed: false,
              openVersion: TimedHint.nextVersion(state.openVersion),
              closeVersion: TimedHint.nextVersion(state.closeVersion),
            }),
          ),
          HideNow: to('Closed', ({ state }) => Closed(dismissFieldsOf(state))),
          ElapsedOpen: [ignore()],
          ElapsedClose: [
            when(
              (state, message) =>
                shouldAcceptVersion(state.closeVersion, message.version) &&
                !isEngaged(state),
              'Closed',
              ({ state }) =>
                Closed({
                  ...fieldsOf(state),
                  isDismissed: false,
                }),
            ),
            ignore(),
          ],
        },
      },
    },
  },
)

// SYNC & REST

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  EnteredTrigger: pace,
  LeftTrigger: pace,
  EnteredPanel: pace,
  LeftPanel: pace,
  FocusedTrigger: pace,
  BlurredTrigger: pace,
  FocusedPanel: pace,
  BlurredPanel: pace,
  PressedPointer: pace,
  PressedEscape: pace,
  ShowNow: pace,
  HideNow: pace,
  ElapsedOpen: pace,
  ElapsedClose: pace,
})

/** Synced synchronization table when a host Part syncs its HoverIntent Messages. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for HoverIntent kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

/** Default standalone block synchronization: device-only input-in-progress. */
export const sync: Readonly<Record<Message['_tag'], Sync>> =
  deviceSync('InputInProgress')

/**
 * What a restart opens HoverIntent on: closed and unengaged, preserving the
 * monotonic open and close version counters.
 */
export const atRest = (state: State): State =>
  Closed({
    isTriggerHovered: false,
    isPanelHovered: false,
    maybeFocusLocation: Option.none(),
    isDismissed: false,
    maybeLastPointerType: Option.none(),
    openVersion: state.openVersion,
    closeVersion: state.closeVersion,
  })

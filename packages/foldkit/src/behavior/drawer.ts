import { Array, Match as M, Option, Schema as S, pipe } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  type GuardedEdge,
  define,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import type { BoxLayer } from '../renderers/types.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as FocusScope from './focusScope.js'
import * as Layers from './layers.js'
import {
  Device,
  type DeviceReason,
  Free,
  Sampled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import * as PointerDrag from './pointerDrag.js'
import type { SlotOrientation, SlotProps, Role as SlotRole } from './slot.js'

// NOTE: this is the core Drawer Part (Widget #26 of 54, Scribe #2665). It
// composes `layers`, `focusScope`, and `pointerDrag` into one framework-free
// Machine and Part declaration covering edge sheets (`Left`, `Right`, `Top`,
// `Bottom`), fractional snap points (`[0.5, 1]`), swipe-to-dismiss velocity
// and threshold rules, modal backdrops, layer-aware Escape and outside-press
// dismissal, and focus trapping/return. Its state (`Closed` | `Open` |
// `Dragging`) lives in the Model, synced by default (`Navigation` category)
// with `Pace.Sampled` on `MoveDrawerDrag` and `Pace.Synced` on discrete open,
// snap, release, cancel, and close transitions, plus `Drawer.make` and
// `Drawer.deviceOnly()`.

// CONSTANTS

/** Default fractional snap points when none are supplied (`[1]`: fully expanded). */
export const defaultSnapPoints: ReadonlyArray<number> = [1]

/** Default visible fraction threshold crossed toward closing before release dismisses (`0.5`). */
export const defaultCloseThreshold = 0.5

/** Default release velocity (px/s toward dismissal) that dismisses the drawer (`500`). */
export const defaultSwipeVelocityThreshold = 500

/** Minimum absolute release velocity (px/s) that projects snap-point momentum (`400`). */
export const defaultSnapVelocityThreshold = 400

/** Multiplier converting projected release velocity (px/s) into offset momentum (`0.4`). */
export const defaultSnapVelocityMultiplier = 0.4

/** Upper bound on release velocity magnitude (px/s) during snap projection (`4000`). */
export const defaultMaxSnapVelocity = 4000

/** Minimum drag offset displacement (px) needed to step sequentially without high velocity (`24`). */
export const defaultSequentialThresholdPx = 24

/** Fallback drawer content dimension (px) used when no measured size is supplied (`400`). */
export const defaultContentSizePx = 400

/** Default pointer-move sync sampling window in milliseconds (`50`). */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

// SCHEMAS

/** Viewport edge from which the drawer enters (`Left`, `Right`, `Top`, or `Bottom`). */
export const Edge = S.Literals(['Left', 'Right', 'Top', 'Bottom'])
/** Viewport edge from which the drawer enters. */
export type Edge = typeof Edge.Type

/** Default viewport edge the drawer slides from (`'Bottom'`). */
export const defaultEdge: Edge = 'Bottom'

/** WAI-ARIA role for the drawer surface (`'dialog'` or `'alertdialog'`). */
export const Role = S.Literals(['dialog', 'alertdialog'])
/** WAI-ARIA role for the drawer surface. */
export type Role = typeof Role.Type

/** Standard `data-state` marker (`'open'` or `'closed'`). */
export const DataState = S.Literals(['open', 'closed'])
/** Standard `data-state` marker. */
export type DataState = typeof DataState.Type

/**
 * Read-only props supplied to the Drawer chart and projection from the
 * Program's Model. Edge placement, snap points, thresholds, focusable IDs, and
 * active layer/focus-scope stacks stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  edge: S.optionalKey(Edge),
  role: S.optionalKey(Role),
  isModal: S.optionalKey(S.Boolean),
  snapPoints: S.optionalKey(S.Array(S.Number)),
  defaultSnapPoint: S.optionalKey(S.Number),
  snapToSequentialPoints: S.optionalKey(S.Boolean),
  closeThreshold: S.optionalKey(S.Number),
  swipeVelocityThreshold: S.optionalKey(S.Number),
  contentSizePx: S.optionalKey(S.Number),
  isSwipeDismissible: S.optionalKey(S.Boolean),
  isDraggable: S.optionalKey(S.Boolean),
  thresholdPx: S.optionalKey(S.Number),
  sampleMs: S.optionalKey(S.Number),
  trapFocus: S.optionalKey(S.Boolean),
  loopFocus: S.optionalKey(S.Boolean),
  restoreFocus: S.optionalKey(S.Boolean),
  preventScroll: S.optionalKey(S.Boolean),
  inertOthers: S.optionalKey(S.Boolean),
  dismissOnEscape: S.optionalKey(S.Boolean),
  dismissOnOutsidePress: S.optionalKey(S.Boolean),
  focusableIds: S.optionalKey(S.Array(S.String)),
  maybeInitialFocusId: S.optionalKey(S.Option(S.String)),
  maybeReturnFocusId: S.optionalKey(S.Option(S.String)),
  label: S.optionalKey(S.String),
  hasTitle: S.optionalKey(S.Boolean),
  hasDescription: S.optionalKey(S.Boolean),
  layers: S.optionalKey(Layers.Stack),
  focusScopes: S.optionalKey(FocusScope.Stack),
  branches: S.optionalKey(S.Array(S.String)),
})
/** Read-only props supplied to the Drawer chart and projection. */
export type Props = typeof Props.Type

/** Active overlay and drag hygiene declarations derived from Drawer state and props. */
export const Hygiene = S.Struct({
  shouldLockScroll: S.Boolean,
  shouldInertOthers: S.Boolean,
  isOutsidePointerBlocked: S.Boolean,
  isTrappingFocus: S.Boolean,
  isFocusPaused: S.Boolean,
  isDragging: S.Boolean,
  dragOffsetPx: S.Number,
  openPercentage: S.Number,
  maybeFocusedId: S.Option(S.String),
  maybeReturnFocusId: S.Option(S.String),
})
/** Active overlay and drag hygiene declarations. */
export type Hygiene = typeof Hygiene.Type

// STATE

/** The drawer is closed, carrying the element ID that should receive return focus when applicable. */
export const Closed = ts('Closed', {
  maybeReturnFocusId: S.Option(S.String),
})
/** The drawer is closed. */
export type Closed = typeof Closed.Type

/** The drawer is open and resting at `activeSnapPoint`. */
export const Open = ts('Open', {
  activeSnapPoint: S.Number,
  maybeTriggerValue: S.Option(S.String),
  maybePreviouslyFocusedId: S.Option(S.String),
  maybeFocusedId: S.Option(S.String),
})
/** The drawer is open and resting at `activeSnapPoint`. */
export type Open = typeof Open.Type

/**
 * The drawer is open and actively dragged by a pointer, holding `dragOffsetPx`
 * (dismiss-signed offset in px), `originSnapPoint` for cancel recovery, and the
 * embedded `PointerDrag.Dragging` state.
 */
export const Dragging = ts('Dragging', {
  activeSnapPoint: S.Number,
  originSnapPoint: S.Number,
  dragOffsetPx: S.Number,
  maybeTriggerValue: S.Option(S.String),
  maybePreviouslyFocusedId: S.Option(S.String),
  maybeFocusedId: S.Option(S.String),
  drag: PointerDrag.Dragging,
})
/** The drawer is open and actively dragged by a pointer. */
export type Dragging = typeof Dragging.Type

/** Where a Drawer Part stands: `Closed`, `Open`, or `Dragging`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open, Dragging])
/** Where a Drawer Part stands. */
export type State = typeof State.Type

/** Initial Drawer state: closed with no pending return focus target. */
export const initial: State = Closed({ maybeReturnFocusId: Option.none() })

// ACTIONS

/** Opens the drawer at its default snap point. */
export const OpenDrawer = Catalog.action('OpenDrawer', {
  what: 'Opens the drawer',
  why: 'To reveal the drawer content',
  meta: { label: 'Open drawer', keys: [] },
})

/** Closes the open drawer unconditionally. */
export const CloseDrawer = Catalog.action('CloseDrawer', {
  what: 'Closes the open drawer',
  why: 'To return to the content beneath it',
  meta: { label: 'Close drawer', keys: [] },
})

/** Opens the drawer when closed or closes it when open. */
export const ToggleDrawer = Catalog.action('ToggleDrawer', {
  what: 'Opens the drawer or closes it when open',
  why: 'To reveal or hide the drawer content',
  meta: { label: 'Drawer', keys: [] },
})

/** Dismisses the open drawer when it is the topmost layer and outside dismissal is allowed. */
export const DismissDrawer = Catalog.action('DismissDrawer', {
  what: 'Dismisses the open drawer when allowed',
  why: 'To leave the drawer without completing its action',
  meta: { label: 'Dismiss drawer', keys: [] },
})

/** Moves the open drawer to the specified snap point fraction. */
export const SetDrawerSnapPoint = Catalog.action('SetDrawerSnapPoint', {
  fields: { snapPoint: S.Number },
  choose: {
    field: 'snapPoint',
    noun: 'snap point',
    prompt: 'Move the drawer to which snap point?',
    token: S.FiniteFromString,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter a snap point value',
  },
  what: 'Moves the open drawer to the chosen snap point',
  why: 'To resize the visible portion of the sheet',
  meta: { label: 'Set snap point', keys: [] },
})

/** The Catalog Actions a Drawer Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenDrawer,
  CloseDrawer,
  ToggleDrawer,
  DismissDrawer,
  SetDrawerSnapPoint,
]

// MESSAGES

/** Opens the drawer with an explicit trigger value, previously focused element ID, and optional snap point. */
export const OpenedDrawer = m('OpenedDrawer', {
  maybeTriggerValue: S.Option(S.String),
  maybePreviouslyFocusedId: S.Option(S.String),
  maybeSnapPoint: S.optionalKey(S.Option(S.Number)),
})

/** A key was pressed while the drawer is open or dragging (`Escape` or `Tab` / `Shift+Tab`). */
export const PressedDrawerKey = m('PressedDrawerKey', {
  key: S.String,
  shiftKey: S.optionalKey(S.Boolean),
})

/** A pointer press landed outside the layers listed in `insideIds`. */
export const PressedOutsideDrawer = m('PressedOutsideDrawer', {
  insideIds: S.Array(S.String),
  shouldRestoreFocus: S.optionalKey(S.Boolean),
})

/** Focus moved onto `targetId` while the drawer is open; trapped scopes reclaim focus if it escaped. */
export const FocusedDrawerElement = m('FocusedDrawerElement', {
  targetId: S.String,
})

/** Begins a pointer swipe drag on the drawer grabber or surface. */
export const BeginDrawerDrag = m('BeginDrawerDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  contentSizePx: S.optionalKey(S.Number),
})

/** Updates the active drawer pointer drag to `(x, y)`. Synced via `Pace.Sampled`. */
export const MoveDrawerDrag = m('MoveDrawerDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  contentSizePx: S.optionalKey(S.Number),
})

/** Releases the active drawer drag, either dismissing the drawer or snapping to the resolved snap point. */
export const ReleaseDrawerDrag = m('ReleaseDrawerDrag', {
  pointerId: S.optionalKey(S.Number),
  velocityPxPerSec: S.optionalKey(S.Number),
  contentSizePx: S.optionalKey(S.Number),
})

/** Cancels the active drawer drag and settles back to `originSnapPoint`. */
export const CancelDrawerDrag = m('CancelDrawerDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** The drawer unmounted while open or dragging, resetting it to closed. */
export const UnmountedDrawer = m('UnmountedDrawer', {
  restoreFocus: S.optionalKey(S.Boolean),
})

/** Every Message the Drawer chart handles. */
export const Message = S.Union([
  OpenDrawer,
  CloseDrawer,
  ToggleDrawer,
  DismissDrawer,
  SetDrawerSnapPoint,
  OpenedDrawer,
  PressedDrawerKey,
  PressedOutsideDrawer,
  FocusedDrawerElement,
  BeginDrawerDrag,
  MoveDrawerDrag,
  ReleaseDrawerDrag,
  CancelDrawerDrag,
  UnmountedDrawer,
])
/** Every Message the Drawer chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Drawer Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the trigger button element id from a drawer base `id`. */
export const triggerId = (id: string): string => `${id}-trigger`

/** Derives the backdrop overlay element id from a drawer base `id`. */
export const backdropId = (id: string): string => `${id}-backdrop`

/** Derives the drawer content surface element id from a drawer base `id`. */
export const contentId = (id: string): string => `${id}-content`

/** Derives the drawer title heading element id referenced by `aria-labelledby`. */
export const titleId = (id: string): string => `${id}-title`

/** Derives the drawer description element id referenced by `aria-describedby`. */
export const descriptionId = (id: string): string => `${id}-description`

/** Derives the drawer close button element id from a drawer base `id`. */
export const closeButtonId = (id: string): string => `${id}-close`

/** Derives the drawer drag grabber handle element id from a drawer base `id`. */
export const grabberId = (id: string): string => `${id}-grabber`

// PURE RULES & CONFIGURATION READERS

/** Resolved edge placement for `props` (`'Bottom'` by default). */
export const edgeOf = (props: Pick<Props, 'edge'> = {}): Edge =>
  props.edge ?? defaultEdge

/** Drag axis corresponding to `edge`: `'Vertical'` for `Top`/`Bottom`, `'Horizontal'` for `Left`/`Right`. */
export const orientationOf = (
  props: Pick<Props, 'edge'> = {},
): SlotOrientation => {
  const edge = edgeOf(props)
  return edge === 'Top' || edge === 'Bottom' ? 'Vertical' : 'Horizontal'
}

/** True when dismissing the drawer requires moving toward smaller screen coordinates (`Top` or `Left`). */
export const isInvertedSwipeOf = (props: Pick<Props, 'edge'> = {}): boolean => {
  const edge = edgeOf(props)
  return edge === 'Top' || edge === 'Left'
}

/** Effective WAI-ARIA role for the drawer content (`'dialog'` by default). */
export const roleOf = (props: Pick<Props, 'role'> = {}): Role =>
  props.role ?? 'dialog'

/** True when the drawer carries the `'alertdialog'` role. */
export const isAlertDialog = (props: Pick<Props, 'role'> = {}): boolean =>
  roleOf(props) === 'alertdialog'

/** True when the drawer is modal (`true` by default). */
export const isModalOf = (props: Pick<Props, 'isModal'> = {}): boolean =>
  props.isModal ?? true

/** True when pressing Escape dismisses the drawer (`true` by default). */
export const dismissesOnEscapeOf = (
  props: Pick<Props, 'dismissOnEscape'> = {},
): boolean => props.dismissOnEscape ?? true

/** True when pressing outside or on the backdrop dismisses the drawer (defaults to `!isAlertDialog`). */
export const dismissesOnOutsidePressOf = (
  props: Pick<Props, 'role' | 'dismissOnOutsidePress'> = {},
): boolean => props.dismissOnOutsidePress ?? !isAlertDialog(props)

/** True when focus should be trapped inside the drawer (defaults to `isModal`). */
export const isTrappingFocusOf = (
  props: Pick<Props, 'isModal' | 'trapFocus'> = {},
): boolean => props.trapFocus ?? isModalOf(props)

/** True when Tab wraps around focusable edges inside the drawer (defaults to `isTrappingFocusOf`). */
export const isLoopingFocusOf = (
  props: Pick<Props, 'isModal' | 'trapFocus' | 'loopFocus'> = {},
): boolean => props.loopFocus ?? isTrappingFocusOf(props)

/** True when closing or unmounting restores focus (`true` by default). */
export const shouldRestoreFocusOf = (
  props: Pick<Props, 'restoreFocus'> = {},
): boolean => props.restoreFocus ?? true

/** True when page scrolling should be locked while open (defaults to `isModal`). */
export const shouldPreventScrollOf = (
  props: Pick<Props, 'isModal' | 'preventScroll'> = {},
): boolean => props.preventScroll ?? isModalOf(props)

/** True when background content outside the drawer should be marked inert (defaults to `isModal`). */
export const shouldInertOthersOf = (
  props: Pick<Props, 'isModal' | 'inertOthers'> = {},
): boolean => props.inertOthers ?? isModalOf(props)

/** True when pointer dragging is enabled on the drawer (`true` by default). */
export const isDraggableOf = (
  props: Pick<Props, 'isDraggable'> = {},
): boolean => props.isDraggable ?? true

/** True when swiping past the close threshold or velocity threshold dismisses the drawer (`true` by default). */
export const isSwipeDismissibleOf = (
  props: Pick<Props, 'isSwipeDismissible'> = {},
): boolean => props.isSwipeDismissible ?? true

/** True when snap release steps only one snap point at a time (`false` by default). */
export const snapToSequentialPointsOf = (
  props: Pick<Props, 'snapToSequentialPoints'> = {},
): boolean => props.snapToSequentialPoints === true

/** Clamped close threshold fraction in `(0, 1]` (`0.5` by default). */
export const closeThresholdOf = (
  props: Pick<Props, 'closeThreshold'> = {},
): number =>
  PointerDrag.clampValue(props.closeThreshold ?? defaultCloseThreshold, 0.05, 1)

/** Non-negative swipe dismiss velocity threshold in px/s (`500` by default). */
export const swipeVelocityThresholdOf = (
  props: Pick<Props, 'swipeVelocityThreshold'> = {},
): number =>
  Math.max(0, props.swipeVelocityThreshold ?? defaultSwipeVelocityThreshold)

/** Resolved drawer dimension along its edge axis in px (`400` fallback when unmeasured). */
export const contentSizePxOf = (
  props: Pick<Props, 'contentSizePx'> = {},
  override?: number,
): number => {
  const candidate = override ?? props.contentSizePx ?? defaultContentSizePx
  return Number.isFinite(candidate) && candidate > 0
    ? candidate
    : defaultContentSizePx
}

/** Resolved pointer-move sync sampling window in milliseconds (`50` by default). */
export const sampleMsOf = (props: Pick<Props, 'sampleMs'> = {}): number =>
  props.sampleMs ?? defaultSampleMs

/**
 * Normalized ascending unique fractional snap points in `(0, 1]`. Falls back
 * to `[1]` when `props.snapPoints` is omitted or has no valid positive values.
 *
 * @example
 * ```typescript
 * snapPointsOf({ snapPoints: [1, 0.5, 0.5] }) // [0.5, 1]
 * snapPointsOf({}) // [1]
 * ```
 */
export const snapPointsOf = (
  props: Pick<Props, 'snapPoints'> = {},
): ReadonlyArray<number> => {
  const raw = props.snapPoints ?? defaultSnapPoints
  const valid = pipe(
    raw,
    Array.filter(point => Number.isFinite(point) && point > 0 && point <= 1),
    Array.dedupe,
  )
  if (Array.isReadonlyArrayEmpty(valid)) {
    return defaultSnapPoints
  } else {
    return [...valid].sort((left, right) => left - right)
  }
}

/**
 * Resolves the default snap point for `props`: uses `props.defaultSnapPoint`
 * when it matches one of `snapPointsOf(props)`, otherwise the first snap point
 * in `props.snapPoints` (matching Zag), falling back to `1`.
 */
export const defaultSnapPointOf = (
  props: Pick<Props, 'snapPoints' | 'defaultSnapPoint'> = {},
): number => {
  const normalized = snapPointsOf(props)
  if (
    props.defaultSnapPoint !== undefined &&
    Array.contains(normalized, props.defaultSnapPoint)
  ) {
    return props.defaultSnapPoint
  }
  const maybeDeclaredFirst =
    props.snapPoints === undefined
      ? Option.none<number>()
      : Array.findFirst(props.snapPoints, point =>
          Array.contains(normalized, point),
        )
  return Option.getOrElse(maybeDeclaredFirst, () =>
    Option.getOrElse(Array.head(normalized), () => 1),
  )
}

/** Finds the snap point in `snapPointsOf(props)` closest to `candidate`. */
export const closestSnapPointOf = (
  candidate: number,
  props: Pick<Props, 'snapPoints'> = {},
): number => {
  const points = snapPointsOf(props)
  return Array.reduce(
    points,
    Option.getOrElse(Array.head(points), () => 1),
    (best, current) =>
      Math.abs(current - candidate) < Math.abs(best - candidate)
        ? current
        : best,
  )
}

/**
 * Converts a snap point fraction `snapPoint` in `(0, 1]` into its dismiss-axis
 * rest offset in px for `contentSizePx`: `1` rests at `0` px, `0.5` rests at
 * `0.5 * contentSizePx`.
 */
export const restOffsetOf = (
  snapPoint: number,
  contentSizePx: number,
): number =>
  Math.max(0, (1 - PointerDrag.clampValue(snapPoint, 0, 1)) * contentSizePx)

/**
 * Computes the dismiss-signed drag offset (in px) from `originOffsetPx` and
 * dismiss-axis pointer displacement `deltaPx`. Over-dragging past fully open
 * (`offset < 0`) applies square-root rubber-band resistance matching Zag.
 */
export const computeDragOffset = (
  originOffsetPx: number,
  deltaPx: number,
): number => {
  const raw = originOffsetPx + deltaPx
  if (raw < 0) {
    return -Math.sqrt(Math.abs(raw))
  } else {
    return raw
  }
}

/** Projects `Drawer.Props` onto the underlying {@link PointerDrag.Props}. */
export const dragPropsOf = (
  props: Pick<Props, 'edge' | 'isDraggable' | 'thresholdPx' | 'sampleMs'> = {},
): PointerDrag.Props => ({
  axis: orientationOf(props),
  isInverted: isInvertedSwipeOf(props),
  isDisabled: !isDraggableOf(props),
  ...(props.thresholdPx === undefined
    ? {}
    : { thresholdPx: props.thresholdPx }),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

const dismissThresholdOffsetOf = (
  props: Pick<Props, 'snapPoints' | 'closeThreshold'>,
  contentSizePx: number,
): number => {
  const points = snapPointsOf(props)
  const lowestSnap = Option.getOrElse(Array.head(points), () => 1)
  const lowestRestOffset = restOffsetOf(lowestSnap, contentSizePx)
  const lowestVisibleSize = Math.max(0, contentSizePx - lowestRestOffset)
  return lowestRestOffset + lowestVisibleSize * closeThresholdOf(props)
}

const projectedOffsetOf = (
  dragOffsetPx: number,
  velocityPxPerSec: number,
): number => {
  if (Math.abs(velocityPxPerSec) >= defaultSnapVelocityThreshold) {
    const clampedVelocity = PointerDrag.clampValue(
      velocityPxPerSec,
      -defaultMaxSnapVelocity,
      defaultMaxSnapVelocity,
    )
    return Math.max(
      0,
      dragOffsetPx + clampedVelocity * defaultSnapVelocityMultiplier,
    )
  } else {
    return Math.max(0, dragOffsetPx)
  }
}

/**
 * Outcome of releasing a drawer drag: either `Option.none()` (dismiss the
 * drawer) or `Option.some(snapPoint)` (settle open at that snap point).
 *
 * @example
 * ```typescript
 * resolveReleaseOutcome({
 *   dragOffsetPx: 250,
 *   originSnapPoint: 1,
 *   velocityPxPerSec: 0,
 *   contentSizePx: 400,
 *   props: { id: 'sheet', snapPoints: [1], closeThreshold: 0.5 },
 * }) // None (dismisses)
 * ```
 */
export const resolveReleaseOutcome = (
  input: Readonly<{
    dragOffsetPx: number
    originSnapPoint: number
    velocityPxPerSec: number
    contentSizePx: number
    props: Pick<
      Props,
      | 'snapPoints'
      | 'snapToSequentialPoints'
      | 'closeThreshold'
      | 'swipeVelocityThreshold'
      | 'isSwipeDismissible'
    >
  }>,
): Option.Option<number> => {
  const { dragOffsetPx, originSnapPoint, velocityPxPerSec, contentSizePx } =
    input
  const points = snapPointsOf(input.props)
  const canDismiss = isSwipeDismissibleOf(input.props)
  const dismissVelocity = swipeVelocityThresholdOf(input.props)
  const dismissOffset = dismissThresholdOffsetOf(input.props, contentSizePx)
  const lowestSnap = Option.getOrElse(Array.head(points), () => 1)
  const lowestRestOffset = restOffsetOf(lowestSnap, contentSizePx)
  const originOffset = restOffsetOf(originSnapPoint, contentSizePx)
  const displacementFromOrigin = dragOffsetPx - originOffset

  if (snapToSequentialPointsOf(input.props)) {
    const descending = [...points].sort((left, right) => right - left)
    const currentIndex = Option.getOrElse(
      Array.findFirstIndex(descending, point => point === originSnapPoint),
      () => 0,
    )
    const isDismissSwipe =
      velocityPxPerSec >= dismissVelocity && displacementFromOrigin >= 0
    const isExpandSwipe =
      velocityPxPerSec <= -dismissVelocity && displacementFromOrigin <= 0
    const isBeyondDismiss =
      displacementFromOrigin > defaultSequentialThresholdPx
    const isBeyondExpand =
      displacementFromOrigin < -defaultSequentialThresholdPx

    if (isDismissSwipe || isBeyondDismiss) {
      const nextIndex = currentIndex + 1
      if (nextIndex >= descending.length) {
        return canDismiss ? Option.none() : Option.some(lowestSnap)
      } else {
        return Array.get(descending, nextIndex)
      }
    } else if (isExpandSwipe || isBeyondExpand) {
      const prevIndex = Math.max(0, currentIndex - 1)
      return Array.get(descending, prevIndex)
    } else {
      return Option.some(originSnapPoint)
    }
  }

  if (canDismiss) {
    if (dragOffsetPx >= contentSizePx) {
      return Option.none()
    }
    if (
      velocityPxPerSec >= dismissVelocity &&
      dragOffsetPx > lowestRestOffset
    ) {
      return Option.none()
    }
  }

  const projected = projectedOffsetOf(dragOffsetPx, velocityPxPerSec)
  if (canDismiss && projected >= dismissOffset) {
    return Option.none()
  }

  const bestSnap = Array.reduce(
    points,
    Option.getOrElse(Array.head(points), () => 1),
    (best, candidate) =>
      Math.abs(restOffsetOf(candidate, contentSizePx) - projected) <
      Math.abs(restOffsetOf(best, contentSizePx) - projected)
        ? candidate
        : best,
  )
  return Option.some(bestSnap)
}

/** True when releasing the current drawer drag should dismiss the drawer. */
export const shouldDismissOnRelease = (
  input: Parameters<typeof resolveReleaseOutcome>[0],
): boolean => Option.isNone(resolveReleaseOutcome(input))

/** Builds the {@link Layers.Layer} entry representing this Drawer. */
export const layerOf = (
  props: Pick<
    Props,
    'id' | 'role' | 'isModal' | 'dismissOnEscape' | 'dismissOnOutsidePress'
  >,
): Layers.Layer =>
  Layers.layer(props.id, {
    isModal: isModalOf(props),
    dismissesOnEscape: dismissesOnEscapeOf(props),
    dismissesOnOutsidePress: dismissesOnOutsidePressOf(props),
  })

/** The active dismissable layer stack containing this Drawer. */
export const layersOf = (props: Props): Layers.Stack =>
  props.layers ?? [layerOf(props)]

/** Builds the {@link FocusScope.Scope} entry representing this Drawer when open or dragging, or none while closed. */
export const focusScopeOf = (
  state: State,
  props: Props,
): Option.Option<FocusScope.Scope> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<FocusScope.Scope>>(),
    M.tagsExhaustive({
      Closed: () => Option.none(),
      Open: openState =>
        Option.some(
          FocusScope.scope(props.id, {
            containerId: contentId(props.id),
            isTrapped: isTrappingFocusOf(props),
            loop: isLoopingFocusOf(props),
            restoreFocus: shouldRestoreFocusOf(props),
            maybePreviouslyFocusedId: openState.maybePreviouslyFocusedId,
            maybeLastFocusedId: openState.maybeFocusedId,
            ...(props.branches === undefined
              ? {}
              : { branches: props.branches }),
          }),
        ),
      Dragging: draggingState =>
        Option.some(
          FocusScope.scope(props.id, {
            containerId: contentId(props.id),
            isTrapped: isTrappingFocusOf(props),
            loop: isLoopingFocusOf(props),
            restoreFocus: shouldRestoreFocusOf(props),
            maybePreviouslyFocusedId: draggingState.maybePreviouslyFocusedId,
            maybeLastFocusedId: draggingState.maybeFocusedId,
            ...(props.branches === undefined
              ? {}
              : { branches: props.branches }),
          }),
        ),
    }),
  )

type OpenLike = Open | Dragging

const focusScopesOf = (state: OpenLike, props: Props): FocusScope.Stack =>
  props.focusScopes ?? Option.toArray(focusScopeOf(state, props))

/** True when this Drawer's focus scope is paused beneath a nested scope. */
export const isFocusScopePaused = (state: State, props: Props): boolean =>
  state._tag !== 'Closed' &&
  FocusScope.isPaused(focusScopesOf(state, props), props.id)

/** True when page scrolling should be locked for this Drawer in its current state. */
export const shouldLockScroll = (state: State, props: Props): boolean =>
  isOpen(state) && shouldPreventScrollOf(props)

/** True when background content outside this Drawer should be marked inert. */
export const shouldInertOutside = (state: State, props: Props): boolean =>
  isOpen(state) && shouldInertOthersOf(props)

/** True when pointer interaction outside the Drawer layer stack is blocked. */
export const isOutsidePointerBlocked = (state: State, props: Props): boolean =>
  isOpen(state) && Layers.isOutsidePointerBlocked(layersOf(props))

// READINGS

/** True when the Drawer is open (resting in `Open` or actively `Dragging`). */
export const isOpen = (state: State): boolean => state._tag !== 'Closed'

/** True while the Drawer is actively being dragged by a pointer. */
export const isDragging = (state: State): boolean => state._tag === 'Dragging'

/** Standard `data-state` marker (`'open'` when open or dragging, `'closed'` otherwise). */
export const dataStateOf = (state: State): DataState =>
  isOpen(state) ? 'open' : 'closed'

/** The active snap point fraction when open or dragging, or none while closed. */
export const activeSnapPointOf = (state: State): Option.Option<number> =>
  state._tag === 'Closed' ? Option.none() : Option.some(state.activeSnapPoint)

/** The current dismiss-axis drag offset in px (`0` when closed, snap rest offset when open, live drag offset while dragging). */
export const dragOffsetPxOf = (
  state: State,
  props: Pick<Props, 'contentSizePx'> = {},
): number =>
  M.value(state).pipe(
    M.withReturnType<number>(),
    M.tagsExhaustive({
      Closed: () => 0,
      Open: ({ activeSnapPoint }) =>
        restOffsetOf(activeSnapPoint, contentSizePxOf(props)),
      Dragging: ({ dragOffsetPx }) => dragOffsetPx,
    }),
  )

/** Normalized open visibility fraction in `[0, 1]` (`0` when closed, `1` when fully open at offset `0`). */
export const openPercentageOf = (
  state: State,
  props: Pick<Props, 'contentSizePx'> = {},
): number => {
  if (state._tag === 'Closed') {
    return 0
  }
  const size = contentSizePxOf(props)
  const offset = dragOffsetPxOf(state, props)
  return PointerDrag.clampValue(1 - offset / size, 0, 1)
}

/** The currently focused element ID inside the Drawer when open or dragging, or none. */
export const focusedIdOf = (state: State): Option.Option<string> =>
  state._tag === 'Closed' ? Option.none() : state.maybeFocusedId

/** The element ID that should receive return focus after closing, or none. */
export const returnFocusIdOf = (state: State): Option.Option<string> =>
  state._tag === 'Closed' ? state.maybeReturnFocusId : Option.none()

/** The element ID that had focus before the Drawer opened, or none while closed. */
export const previouslyFocusedIdOf = (state: State): Option.Option<string> =>
  state._tag === 'Closed' ? Option.none() : state.maybePreviouslyFocusedId

/** The trigger value that opened the Drawer, or none. */
export const triggerValueOf = (state: State): Option.Option<string> =>
  state._tag === 'Closed' ? Option.none() : state.maybeTriggerValue

/** Pure summary of active overlay and drag hygiene declarations for a painter. */
export const hygieneOf = (state: State, props: Props): Hygiene => ({
  shouldLockScroll: shouldLockScroll(state, props),
  shouldInertOthers: shouldInertOutside(state, props),
  isOutsidePointerBlocked: isOutsidePointerBlocked(state, props),
  isTrappingFocus: isOpen(state) && isTrappingFocusOf(props),
  isFocusPaused: isFocusScopePaused(state, props),
  isDragging: isDragging(state),
  dragOffsetPx: dragOffsetPxOf(state, props),
  openPercentage: openPercentageOf(state, props),
  maybeFocusedId: focusedIdOf(state),
  maybeReturnFocusId: returnFocusIdOf(state),
})

// INTERNAL CHART HELPERS

const canDismissEscape = (props: Props): boolean =>
  Layers.canDismissOnEscape(layersOf(props), props.id)

const canDismissOutside = (
  props: Props,
  insideIds: ReadonlyArray<string>,
): boolean =>
  Layers.canDismissOnOutsidePress(layersOf(props), props.id, insideIds)

const preferredInitialFocusOf = (props: Props): Option.Option<string> =>
  Option.orElse(props.maybeInitialFocusId ?? Option.none(), () =>
    isAlertDialog(props) ? Option.some(closeButtonId(props.id)) : Option.none(),
  )

const openWith = (
  props: Props,
  maybeTriggerValue: Option.Option<string>,
  maybePreviouslyFocusedId: Option.Option<string>,
  maybeSnapPoint: Option.Option<number> = Option.none(),
): Open =>
  Open({
    activeSnapPoint: Option.match(maybeSnapPoint, {
      onNone: () => defaultSnapPointOf(props),
      onSome: snapPoint => closestSnapPointOf(snapPoint, props),
    }),
    maybeTriggerValue,
    maybePreviouslyFocusedId: Option.orElse(maybePreviouslyFocusedId, () =>
      Option.some(triggerId(props.id)),
    ),
    maybeFocusedId: FocusScope.resolveInitialFocus({
      containerId: contentId(props.id),
      focusableIds: props.focusableIds ?? [],
      maybeInitialFocusId: preferredInitialFocusOf(props),
    }),
  })

const closeWith = (
  state: OpenLike,
  props: Props,
  restoreFocusOverride?: boolean,
): Closed =>
  Closed({
    maybeReturnFocusId: FocusScope.resolveReturnFocus({
      restoreFocus: restoreFocusOverride ?? shouldRestoreFocusOf(props),
      maybeReturnFocusId: props.maybeReturnFocusId ?? Option.none(),
      maybePreviouslyFocusedId: state.maybePreviouslyFocusedId,
      maybeFallbackId: Option.some(triggerId(props.id)),
    }),
  })

const tabMoveOf = (
  state: OpenLike,
  props: Props,
  key: string,
  shiftKey?: boolean,
): Option.Option<FocusScope.MoveFocus> => {
  const resolution = FocusScope.resolveTabKey({
    key,
    ...(shiftKey === undefined ? {} : { shiftKey }),
    containerId: contentId(props.id),
    focusableIds: props.focusableIds ?? [],
    maybeCurrentId: state.maybeFocusedId,
    isTrapped: isTrappingFocusOf(props),
    loop: isLoopingFocusOf(props),
    isPaused: isFocusScopePaused(state, props),
  })
  return resolution._tag === 'MoveFocus'
    ? Option.some(resolution)
    : Option.none()
}

const startDragOf = (
  pointerId: number,
  x: number,
  y: number,
  originOffsetPx: number,
  props: Props,
): Option.Option<PointerDrag.Dragging> => {
  const [nextDrag] = PointerDrag.chart.transition(
    PointerDrag.Idle(),
    PointerDrag.StartDrag({ pointerId, x, y, originValue: originOffsetPx }),
    dragPropsOf(props),
  )
  return nextDrag._tag === 'Dragging' ? Option.some(nextDrag) : Option.none()
}

const moveDragOf = (
  drag: PointerDrag.Dragging,
  pointerId: number,
  x: number,
  y: number,
  props: Props,
): PointerDrag.Dragging => {
  const [nextDrag] = PointerDrag.chart.transition(
    drag,
    PointerDrag.MoveDrag({ pointerId, x, y }),
    dragPropsOf(props),
  )
  return nextDrag._tag === 'Dragging' ? nextDrag : drag
}

const isMatchingPointer = (
  activePointerId: number,
  incomingPointerId: number | undefined,
): boolean =>
  incomingPointerId === undefined || incomingPointerId === activePointerId

const focusedElementEdges = <
  Target extends 'Open' | 'Dragging',
  S extends Extract<State, { readonly _tag: Target }>,
>(
  target: Target,
  withFocusedId: (state: S, targetId: string) => S,
): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof FocusedDrawerElement.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof FocusedDrawerElement.Type, context: Props) =>
      FocusScope.isTargetInScope(
        {
          containerId: contentId(context.id),
          focusableIds: context.focusableIds ?? [],
          ...(context.branches === undefined
            ? {}
            : { branches: context.branches }),
        },
        message.targetId,
      ),
    target,
    ({ state, message }) => withFocusedId(state, message.targetId),
  ),
  when(
    (state: S, message: typeof FocusedDrawerElement.Type, context: Props) =>
      FocusScope.resolveOutsideFocus({
        containerId: contentId(context.id),
        focusableIds: context.focusableIds ?? [],
        targetId: message.targetId,
        maybeLastFocusedId: state.maybeFocusedId,
        ...(context.branches === undefined
          ? {}
          : { branches: context.branches }),
        isTrapped: isTrappingFocusOf(context),
        isPaused: isFocusScopePaused(state, context),
      }),
    target,
    ({ state, guardValue }) => withFocusedId(state, guardValue),
  ),
  ignore(),
]

// CHART

/**
 * The Drawer Machine chart: open/close/toggle transitions, snap-point
 * selection, pointer swipe dragging via `PointerDrag`, velocity and threshold
 * swipe-to-dismiss, layer-aware Escape and outside-press dismissal, Tab /
 * Shift+Tab focus trapping and wrapping, outside-focus reclamation, and
 * return-focus resolution.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Closed: {
        on: {
          OpenDrawer: to('Open', ({ context }) =>
            openWith(context, Option.none(), Option.none()),
          ),
          ToggleDrawer: to('Open', ({ context }) =>
            openWith(context, Option.none(), Option.none()),
          ),
          OpenedDrawer: to('Open', ({ message, context }) =>
            openWith(
              context,
              message.maybeTriggerValue,
              message.maybePreviouslyFocusedId,
              message.maybeSnapPoint ?? Option.none(),
            ),
          ),
        },
      },
      Open: {
        on: {
          CloseDrawer: to('Closed', ({ state, context }) =>
            closeWith(state, context),
          ),
          ToggleDrawer: to('Closed', ({ state, context }) =>
            closeWith(state, context),
          ),
          OpenedDrawer: to('Open', ({ message, context }) =>
            openWith(
              context,
              message.maybeTriggerValue,
              message.maybePreviouslyFocusedId,
              message.maybeSnapPoint ?? Option.none(),
            ),
          ),
          SetDrawerSnapPoint: to('Open', ({ state, message, context }) =>
            Open({
              ...state,
              activeSnapPoint: closestSnapPointOf(message.snapPoint, context),
            }),
          ),
          DismissDrawer: [
            when(
              (_state, _message, context) => canDismissOutside(context, []),
              'Closed',
              ({ state, context }) => closeWith(state, context),
            ),
            ignore(),
          ],
          PressedOutsideDrawer: [
            when(
              (_state, message, context) =>
                canDismissOutside(context, message.insideIds),
              'Closed',
              ({ state, message, context }) =>
                closeWith(state, context, message.shouldRestoreFocus),
            ),
            ignore(),
          ],
          PressedDrawerKey: [
            when(
              (_state, message, context) =>
                message.key === 'Escape' && canDismissEscape(context),
              'Closed',
              ({ state, context }) => closeWith(state, context),
            ),
            when(
              (state, message, context) =>
                tabMoveOf(state, context, message.key, message.shiftKey),
              'Open',
              ({ state, guardValue }) =>
                Open({
                  ...state,
                  maybeFocusedId: Option.some(guardValue.targetId),
                }),
            ),
            ignore(),
          ],
          FocusedDrawerElement: focusedElementEdges('Open', (state, targetId) =>
            Open({
              ...state,
              maybeFocusedId: Option.some(targetId),
            }),
          ),
          BeginDrawerDrag: [
            when(
              (state, message, context) => {
                const originOffset = restOffsetOf(
                  state.activeSnapPoint,
                  contentSizePxOf(context, message.contentSizePx),
                )
                return startDragOf(
                  message.pointerId,
                  message.x,
                  message.y,
                  originOffset,
                  context,
                )
              },
              'Dragging',
              ({ state, guardValue }) =>
                Dragging({
                  activeSnapPoint: state.activeSnapPoint,
                  originSnapPoint: state.activeSnapPoint,
                  dragOffsetPx: guardValue.originValue,
                  maybeTriggerValue: state.maybeTriggerValue,
                  maybePreviouslyFocusedId: state.maybePreviouslyFocusedId,
                  maybeFocusedId: state.maybeFocusedId,
                  drag: guardValue,
                }),
            ),
            ignore(),
          ],
          UnmountedDrawer: to('Closed', ({ state, message, context }) =>
            closeWith(state, context, message.restoreFocus),
          ),
        },
      },
      Dragging: {
        on: {
          CloseDrawer: to('Closed', ({ state, context }) =>
            closeWith(state, context),
          ),
          ToggleDrawer: to('Closed', ({ state, context }) =>
            closeWith(state, context),
          ),
          SetDrawerSnapPoint: to('Open', ({ state, message, context }) =>
            Open({
              activeSnapPoint: closestSnapPointOf(message.snapPoint, context),
              maybeTriggerValue: state.maybeTriggerValue,
              maybePreviouslyFocusedId: state.maybePreviouslyFocusedId,
              maybeFocusedId: state.maybeFocusedId,
            }),
          ),
          DismissDrawer: [
            when(
              (_state, _message, context) => canDismissOutside(context, []),
              'Closed',
              ({ state, context }) => closeWith(state, context),
            ),
            ignore(),
          ],
          PressedOutsideDrawer: [
            when(
              (_state, message, context) =>
                canDismissOutside(context, message.insideIds),
              'Closed',
              ({ state, message, context }) =>
                closeWith(state, context, message.shouldRestoreFocus),
            ),
            ignore(),
          ],
          PressedDrawerKey: [
            when(
              (_state, message, context) =>
                message.key === 'Escape' && canDismissEscape(context),
              'Closed',
              ({ state, context }) => closeWith(state, context),
            ),
            when(
              (_state, message) => PointerDrag.isCancelKey(message.key),
              'Open',
              ({ state }) =>
                Open({
                  activeSnapPoint: state.originSnapPoint,
                  maybeTriggerValue: state.maybeTriggerValue,
                  maybePreviouslyFocusedId: state.maybePreviouslyFocusedId,
                  maybeFocusedId: state.maybeFocusedId,
                }),
            ),
            ignore(),
          ],
          FocusedDrawerElement: focusedElementEdges(
            'Dragging',
            (state, targetId) =>
              Dragging({
                ...state,
                maybeFocusedId: Option.some(targetId),
              }),
          ),
          MoveDrawerDrag: [
            when(
              (state, message, context) =>
                isDraggableOf(context) &&
                message.pointerId === state.drag.pointerId,
              'Dragging',
              ({ state, message, context }) => {
                const nextDrag = moveDragOf(
                  state.drag,
                  message.pointerId,
                  message.x,
                  message.y,
                  context,
                )
                const dragOffsetPx = nextDrag.isActivated
                  ? computeDragOffset(
                      nextDrag.originValue,
                      PointerDrag.axisDeltaOf(nextDrag, dragPropsOf(context)),
                    )
                  : state.dragOffsetPx
                return Dragging({
                  ...state,
                  dragOffsetPx,
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          ReleaseDrawerDrag: [
            when(
              (state, message, context) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId) &&
                shouldDismissOnRelease({
                  dragOffsetPx: state.dragOffsetPx,
                  originSnapPoint: state.originSnapPoint,
                  velocityPxPerSec: message.velocityPxPerSec ?? 0,
                  contentSizePx: contentSizePxOf(
                    context,
                    message.contentSizePx,
                  ),
                  props: context,
                }),
              'Closed',
              ({ state, context }) => closeWith(state, context),
            ),
            when(
              (state, message, context) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId)
                  ? resolveReleaseOutcome({
                      dragOffsetPx: state.dragOffsetPx,
                      originSnapPoint: state.originSnapPoint,
                      velocityPxPerSec: message.velocityPxPerSec ?? 0,
                      contentSizePx: contentSizePxOf(
                        context,
                        message.contentSizePx,
                      ),
                      props: context,
                    })
                  : Option.none(),
              'Open',
              ({ state, guardValue }) =>
                Open({
                  activeSnapPoint: guardValue,
                  maybeTriggerValue: state.maybeTriggerValue,
                  maybePreviouslyFocusedId: state.maybePreviouslyFocusedId,
                  maybeFocusedId: state.maybeFocusedId,
                }),
            ),
            ignore(),
          ],
          CancelDrawerDrag: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Open',
              ({ state }) =>
                Open({
                  activeSnapPoint: state.originSnapPoint,
                  maybeTriggerValue: state.maybeTriggerValue,
                  maybePreviouslyFocusedId: state.maybePreviouslyFocusedId,
                  maybeFocusedId: state.maybeFocusedId,
                }),
            ),
            ignore(),
          ],
          UnmountedDrawer: to('Closed', ({ state, message, context }) =>
            closeWith(state, context, message.restoreFocus),
          ),
        },
      },
    },
  },
)

// SYNC

/**
 * Builds the Drawer sync table using `Pace.Sampled({ everyMs })` on
 * `MoveDrawerDrag` (50 ms default) and `Pace.Synced()` on open, snap, release,
 * cancel, and close Messages.
 *
 * @example
 * ```typescript
 * syncOf(50).MoveDrawerDrag // Sampled({ everyMs: 50 })
 * syncOf(50).OpenDrawer // Synced()
 * ```
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenDrawer: Synced(),
  CloseDrawer: Synced(),
  ToggleDrawer: Synced(),
  DismissDrawer: Synced(),
  SetDrawerSnapPoint: Synced(),
  OpenedDrawer: Synced(),
  PressedDrawerKey: Synced(),
  PressedOutsideDrawer: Synced(),
  FocusedDrawerElement: Synced(),
  BeginDrawerDrag: Synced(),
  MoveDrawerDrag: Sampled({ everyMs: sampleMs }),
  ReleaseDrawerDrag: Synced(),
  CancelDrawerDrag: Synced(),
  UnmountedDrawer: Synced(),
})

/** Default Drawer synchronization: `MoveDrawerDrag` sampled at 50 ms, all discrete transitions synced immediately. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a Drawer kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenDrawer: Device({ because }),
  CloseDrawer: Device({ because }),
  ToggleDrawer: Device({ because }),
  DismissDrawer: Device({ because }),
  SetDrawerSnapPoint: Device({ because }),
  OpenedDrawer: Device({ because }),
  PressedDrawerKey: Device({ because }),
  PressedOutsideDrawer: Device({ because }),
  FocusedDrawerElement: Device({ because }),
  BeginDrawerDrag: Device({ because }),
  MoveDrawerDrag: Device({ because }),
  ReleaseDrawerDrag: Device({ because }),
  CancelDrawerDrag: Device({ because }),
  UnmountedDrawer: Device({ because }),
})

/** Returns the {@link Sync} pace for one Drawer Message under `sampleMs`. */
export const paceOf = (
  message: Message,
  sampleMs: number = defaultSampleMs,
): Sync => syncOf(sampleMs)[message._tag]

// SLOTS & PROJECTION

/**
 * The seven painted slots of a Drawer Part: `Trigger`, `Backdrop`, `Content`,
 * `Title`, `Description`, `CloseButton`, and `Grabber`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleDrawer' }],
  },
  Backdrop: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'DismissDrawer' }],
  },
  Content: {
    role: 'Dialog',
    focus: 'Container',
    gestures: [],
  },
  Title: {
    focus: 'None',
    gestures: [],
  },
  Description: {
    focus: 'None',
    gestures: [],
  },
  CloseButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'CloseDrawer' }],
  },
  Grabber: {
    focus: 'None',
    gestures: [],
  },
}

const contentLabelPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.label !== undefined) {
    return { label: props.label }
  } else if (props.hasTitle === false) {
    return {}
  } else {
    return { labelledBy: titleId(props.id) }
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Trigger') {
    return {
      id: triggerId(props.id),
      isExpanded: isOpen(state),
      controls: contentId(props.id),
      hasPopup: 'dialog',
    }
  } else if (slot === 'Backdrop') {
    return {
      id: backdropId(props.id),
      ...(isOpen(state) ? {} : { isHidden: true }),
    }
  } else if (slot === 'Content') {
    const contentRole: SlotRole = isAlertDialog(props)
      ? 'AlertDialog'
      : 'Dialog'
    const maybeFocused = focusedIdOf(state)
    return {
      role: contentRole,
      id: contentId(props.id),
      isModal: isModalOf(props),
      tabIndex: -1,
      ...contentLabelPropsOf(props),
      ...(props.hasDescription === false
        ? {}
        : { describedBy: descriptionId(props.id) }),
      ...(Option.isSome(maybeFocused) ? { activeId: maybeFocused.value } : {}),
      ...(isOpen(state) ? {} : { isHidden: true }),
    }
  } else if (slot === 'Title') {
    return {
      id: titleId(props.id),
    }
  } else if (slot === 'Description') {
    return {
      id: descriptionId(props.id),
    }
  } else if (slot === 'CloseButton') {
    return {
      id: closeButtonId(props.id),
      isCurrent:
        isOpen(state) &&
        Option.contains(focusedIdOf(state), closeButtonId(props.id)),
    }
  } else if (slot === 'Grabber') {
    return {
      id: grabberId(props.id),
      orientation: orientationOf(props),
      ...(isDraggableOf(props) ? {} : { isDisabled: true }),
    }
  } else {
    return {}
  }
}

/** What a restart opens a Drawer on: always closed with no pending return focus. */
export const atRest = (_state: State): State => initial

// PART FACTORY

/** Options for customizing a Drawer Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Drawer device-only. */
  sync?: 'Synced' | DeviceReason
  /** Pointer-move sync sampling interval in milliseconds (`50` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Drawer {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`, `MoveDrawerDrag` at `Pace.Sampled({ everyMs: 50 })`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Drawer local to one device.
 *
 * @example
 * ```typescript
 * const FiltersDrawer = Drawer.make({ name: 'FiltersDrawer' })
 * const LocalDrawer = Drawer.deviceOnly({ name: 'LocalDrawer' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  return Part.define<State, Message, Props>({
    name: options.name ?? 'Drawer',
    State,
    Message,
    chart,
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? syncOf(sampleMs)
        : deviceSync(options.sync),
    category: options.category ?? 'Navigation',
    slots,
    atRest,
    project: projectSlot,
    configuration: options.configuration ?? {
      base: {
        pace: {
          ...defaultPace,
          dragGrain: Free(),
          dragSampleMs: sampleMs,
        },
      },
      presets: {},
    },
  })
}

/**
 * Shorthand for a Drawer Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> => {
  const { because, ...rest } = options
  return make({
    ...rest,
    sync: because ?? 'OwnView',
  })
}

/** The default synced Drawer Part (`name: 'Drawer'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

/**
 * Projects an open or dragging Drawer into the `BoxLayer` field a `Box` node
 * reads on HTML, React, and React Native, or `{}` while closed.
 */
export const boxLayerOf = (
  view: Part.View<State>,
  props: Props,
): Readonly<{ layer?: BoxLayer }> =>
  isOpen(view.state)
    ? {
        layer: {
          kind: isModalOf(props) ? 'Dialog' : 'Panel',
          label: props.label ?? props.id,
          ...(dismissesOnOutsidePressOf(props)
            ? { dismissToken: DismissDrawer.tag }
            : {}),
        },
      }
    : {}

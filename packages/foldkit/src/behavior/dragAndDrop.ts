import { Array, Match as M, Option, Schema as S, pipe } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  type GuardedEdge,
  define,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
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
import { SlotOrientation, type SlotProps } from './slot.js'

// NOTE: this is the core DragAndDrop Part (Widget #22 of 54, Scribe #2661).
// It composes `PointerDrag` into one framework-free Machine and Part
// declaration covering packages/ui DragAndDrop. Its state (`Idle` | `Pending` |
// `Dragging` | `KeyboardDragging`) lives in the Model, synced by default
// (`Domain` category) using `Pace.Sampled` on pointer drag movement (50 ms
// default) and `Pace.Synced` on lift, keyboard move, drop, and cancel, with
// `DragAndDrop.make` and `DragAndDrop.deviceOnly()` options. Reference-stable
// SlotBindings (`Draggable`, `Droppable`, `LiveRegion`) project generic button,
// region, and assertive live-status ARIA across HTML, React, and React Native
// generic hosts with zero DragAndDrop-specific painter logic.

// SCHEMAS

/** Default pointer movement distance in pixels before a press activates a drag (`5`). */
export const defaultActivationDistancePx = 5

/** Default pointer-move sync sampling window in milliseconds (`50`), taken from `PointerDrag`. */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

/** Default viewport edge threshold in pixels for auto-scrolling during a pointer drag (`40`). */
export const defaultAutoScrollEdgePx = 40

/** Default maximum auto-scroll speed in pixels per animation frame (`15`). */
export const defaultAutoScrollMaxSpeedPx = 15

/** Primary layout axis of sortable items inside each container (`Horizontal` or `Vertical`). */
export const Orientation = SlotOrientation
/** Primary layout axis of sortable items inside each container. */
export type Orientation = typeof Orientation.Type

/** Default container layout orientation (`'Vertical'`). */
export const defaultOrientation: Orientation = 'Vertical'

/** Discrete keyboard movement directions during a keyboard drag. */
export const KeyboardMoveDirection = S.Literals([
  'Up',
  'Down',
  'Left',
  'Right',
  'NextContainer',
  'PreviousContainer',
])
/** Discrete keyboard movement directions during a keyboard drag. */
export type KeyboardMoveDirection = typeof KeyboardMoveDirection.Type

/** A candidate drop destination: container id and insertion index within that container. */
export const DropTarget = S.Struct({
  containerId: S.String,
  index: S.Number,
})
/** A candidate drop destination. */
export type DropTarget = typeof DropTarget.Type

/** A completed item reorder from a source container and index to a destination container and index. */
export const Reorder = S.Struct({
  itemId: S.String,
  fromContainerId: S.String,
  fromIndex: S.Number,
  toContainerId: S.String,
  toIndex: S.Number,
})
/** A completed item reorder. */
export type Reorder = typeof Reorder.Type

/** Optional metadata for one draggable item, as plain data. */
export const Item = S.Struct({
  id: S.String,
  label: S.optionalKey(S.String),
  isDisabled: S.optionalKey(S.Boolean),
})
/** Optional metadata for one draggable item. */
export type Item = typeof Item.Type

/** One droppable container holding ordered item ids, as plain data. */
export const Container = S.Struct({
  id: S.String,
  itemIds: S.Array(S.String),
  label: S.optionalKey(S.String),
  isDisabled: S.optionalKey(S.Boolean),
})
/** One droppable container holding ordered item ids. */
export type Container = typeof Container.Type

/** Painter-measured bounding rectangle for one candidate target (container or item). */
export const TargetBounds = S.Struct({
  id: S.String,
  rect: PointerDrag.Rect,
  isDisabled: S.optionalKey(S.Boolean),
})
/** Painter-measured bounding rectangle for one candidate target. */
export type TargetBounds = typeof TargetBounds.Type

/** Painter-measured bounds for one droppable container together with its ordered sortable item rects. */
export const ContainerBounds = S.Struct({
  id: S.String,
  rect: PointerDrag.Rect,
  itemRects: S.Array(PointerDrag.Rect),
  isDisabled: S.optionalKey(S.Boolean),
})
/** Painter-measured bounds for one droppable container and its items. */
export type ContainerBounds = typeof ContainerBounds.Type

/**
 * Read-only props supplied to the DragAndDrop chart and projection from the
 * Program's Model. Containers, item labels, orientation, threshold, and
 * disabled state stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  containers: S.Array(Container),
  items: S.optionalKey(S.Array(Item)),
  orientation: S.optionalKey(Orientation),
  activationDistancePx: S.optionalKey(S.Number),
  sampleMs: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  describedBy: S.optionalKey(S.String),
})
/** Read-only props supplied to the DragAndDrop chart and projection. */
export type Props = typeof Props.Type

/** Origin container and index where a drag began. */
export type Origin = Readonly<{
  itemId: string
  containerId: string
  index: number
}>

// STATE

/** The most recent drag settled by dropping an item at a valid destination. */
export const Dropped = ts('Dropped', {
  itemId: S.String,
  fromContainerId: S.String,
  fromIndex: S.Number,
  toContainerId: S.String,
  toIndex: S.Number,
})
/** The most recent drag settled by dropping an item. */
export type Dropped = typeof Dropped.Type

/** The most recent drag was cancelled and restored to its original position. */
export const Cancelled = ts('Cancelled', {
  itemId: S.String,
  originContainerId: S.String,
  originIndex: S.Number,
})
/** The most recent drag was cancelled. */
export type Cancelled = typeof Cancelled.Type

/** The settled outcome of the last completed or cancelled drag, used for live announcements and parent observation. */
export const Outcome = S.Union([Dropped, Cancelled])
/** The settled outcome of the last completed or cancelled drag. */
export type Outcome = typeof Outcome.Type

/** No drag is in progress; optionally retains the most recent settled outcome for live announcements. */
export const Idle = ts('Idle', {
  maybeLastOutcome: S.Option(Outcome),
  drag: PointerDrag.Idle,
})
/** No drag is in progress. */
export type Idle = typeof Idle.Type

/**
 * A pointer went down on `itemId` and has not yet crossed `activationDistancePx`.
 * Releasing before crossing the threshold returns to `Idle` with no drop or cancel outcome.
 */
export const Pending = ts('Pending', {
  itemId: S.String,
  sourceContainerId: S.String,
  sourceIndex: S.Number,
  drag: PointerDrag.Dragging,
})
/** A pointer press is waiting to cross the activation threshold. */
export type Pending = typeof Pending.Type

/** A pointer drag is actively moving `itemId` toward `maybeDropTarget`. */
export const Dragging = ts('Dragging', {
  itemId: S.String,
  sourceContainerId: S.String,
  sourceIndex: S.Number,
  maybeDropTarget: S.Option(DropTarget),
  hasMoved: S.Boolean,
  drag: PointerDrag.Dragging,
})
/** A pointer drag is actively in progress. */
export type Dragging = typeof Dragging.Type

/** A keyboard drag is actively moving `itemId` between containers and indices. */
export const KeyboardDragging = ts('KeyboardDragging', {
  itemId: S.String,
  sourceContainerId: S.String,
  sourceIndex: S.Number,
  targetContainerId: S.String,
  targetIndex: S.Number,
  hasMoved: S.Boolean,
  drag: PointerDrag.Idle,
})
/** A keyboard drag is actively in progress. */
export type KeyboardDragging = typeof KeyboardDragging.Type

/** Where a DragAndDrop Part stands: `Idle`, `Pending`, `Dragging`, or `KeyboardDragging`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Pending, Dragging, KeyboardDragging])
/** Where a DragAndDrop Part stands. */
export type State = typeof State.Type

/** Initial DragAndDrop state: idle with no prior outcome and an idle `PointerDrag`. */
export const initial: State = Idle({
  maybeLastOutcome: Option.none(),
  drag: PointerDrag.Idle(),
})

// ACTIONS

/** Picks up a draggable item for keyboard reordering. */
export const LiftItem = Catalog.action('LiftItem', {
  fields: {
    itemId: S.String,
    containerId: S.optionalKey(S.String),
    index: S.optionalKey(S.Number),
  },
  choose: {
    field: 'itemId',
    noun: 'item',
    prompt: 'Lift which item?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No draggable item is available',
  },
  what: 'Picks up the chosen draggable item for reordering',
  why: 'To move it to a new slot or container',
  meta: { label: 'Lift item', keys: [] },
})

/** Moves the currently lifted item one position within its container or across containers. */
export const MoveDraggedItem = Catalog.action('MoveDraggedItem', {
  fields: {
    direction: KeyboardMoveDirection,
  },
  choose: {
    field: 'direction',
    noun: 'direction',
    prompt: 'Move the lifted item in which direction?',
    token: KeyboardMoveDirection,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Choose a movement direction',
  },
  what: 'Shifts the lifted item one position or across containers',
  why: 'To place it where the user intends to drop it',
  meta: { label: 'Move item', keys: [] },
})

/** Commits the currently dragged item at its active drop target. */
export const DropItem = Catalog.action('DropItem', {
  what: 'Commits the lifted item at the active drop target',
  why: 'To finish reordering and settle the board',
  meta: { label: 'Drop item', keys: [] },
})

/** Cancels the active drag and restores the item to its original position. */
export const CancelDrag = Catalog.action('CancelDrag', {
  what: 'Aborts the current drag and restores the original position',
  why: 'To leave the item order unchanged',
  meta: { label: 'Cancel drag', keys: [] },
})

/** The Catalog Actions a DragAndDrop Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  LiftItem,
  MoveDraggedItem,
  DropItem,
  CancelDrag,
]

// MESSAGE

/** A pointer went down on a draggable item at `(x, y)`. Enters `Pending` (or `Dragging` if threshold is `0`). */
export const BeginPointerDrag = m('BeginPointerDrag', {
  itemId: S.String,
  containerId: S.optionalKey(S.String),
  index: S.optionalKey(S.Number),
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/**
 * The active drag pointer moved to `(x, y)` with collision-detected `maybeDropTarget`.
 * Synced via `Pace.Sampled` (50 ms default). Ignored for non-matching pointers.
 */
export const MovePointerDrag = m('MovePointerDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  maybeDropTarget: S.Option(DropTarget),
})

/**
 * The active drag pointer was released. While `Pending`, returns silently to `Idle`;
 * while `Dragging`, commits `Dropped` when over a target or `Cancelled` otherwise.
 */
export const ReleasePointerDrag = m('ReleasePointerDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** The active pointer drag was cancelled (for example on `pointercancel`), returning to `Idle`. */
export const CancelPointerDrag = m('CancelPointerDrag', {
  pointerId: S.optionalKey(S.Number),
})

/**
 * A keyboard key was pressed while interacting with DragAndDrop:
 * Space/Enter lifts from `Idle` or commits from `KeyboardDragging`;
 * arrow keys and Tab/Shift+Tab move during `KeyboardDragging`;
 * Escape cancels any pending or active drag.
 */
export const PressedDragKey = m('PressedDragKey', {
  key: S.String,
  isShift: S.optionalKey(S.Boolean),
  itemId: S.optionalKey(S.String),
  containerId: S.optionalKey(S.String),
  index: S.optionalKey(S.Number),
})

/** Every Message the DragAndDrop chart handles. */
export const Message = S.Union([
  LiftItem,
  MoveDraggedItem,
  DropItem,
  CancelDrag,
  BeginPointerDrag,
  MovePointerDrag,
  ReleasePointerDrag,
  CancelPointerDrag,
  PressedDragKey,
])
/** Every Message the DragAndDrop chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the DragAndDrop Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives a draggable item slot element id from a base `id` and optional `itemId`. */
export const draggableId = (id: string, itemId?: string): string =>
  itemId === undefined ? `${id}-draggable` : `${id}-item-${itemId}`

/** Derives a droppable container slot element id from a base `id` and optional `containerId`. */
export const droppableId = (id: string, containerId?: string): string =>
  containerId === undefined
    ? `${id}-droppable`
    : `${id}-container-${containerId}`

/** Derives the assertive live announcement region element id from a base `id`. */
export const liveRegionId = (id: string): string => `${id}-live`

// CONFIGURATION

/** Resolved container orientation (`'Vertical'` by default). */
export const orientationOf = (
  props: Pick<Props, 'orientation'> = {},
): Orientation => props.orientation ?? defaultOrientation

/** Resolved non-negative pointer drag activation distance in pixels (`5` by default). */
export const activationDistancePxOf = (
  props: Pick<Props, 'activationDistancePx'> = {},
): number =>
  Math.max(0, props.activationDistancePx ?? defaultActivationDistancePx)

/** Resolved pointer-move sync sampling window in milliseconds (`50` by default). */
export const sampleMsOf = (props: Pick<Props, 'sampleMs'> = {}): number =>
  props.sampleMs ?? defaultSampleMs

/** True when the whole DragAndDrop interaction is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when DragAndDrop accepts interaction (`!isDisabled`). */
export const canInteract = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  !isDisabledOf(props)

/** Projects `DragAndDrop.Props` onto the underlying {@link PointerDrag.Props}. */
export const dragPropsOf = (props: Props): PointerDrag.Props => ({
  axis: 'Both',
  thresholdPx: activationDistancePxOf(props),
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

/** Looks up one container in `props.containers` by its `id`. */
export const containerById = (
  containerId: string,
  props: Pick<Props, 'containers'>,
): Option.Option<Container> =>
  Array.findFirst(props.containers, container => container.id === containerId)

/** Looks up optional item metadata in `props.items` by its `id`. */
export const itemMetaById = (
  itemId: string,
  props: Pick<Props, 'items'>,
): Option.Option<Item> =>
  props.items === undefined
    ? Option.none()
    : Array.findFirst(props.items, item => item.id === itemId)

/** Locates `itemId` across `props.containers`, returning its container id and index. */
export const locateItem = (
  itemId: string,
  props: Pick<Props, 'containers'>,
): Option.Option<Readonly<{ containerId: string; index: number }>> =>
  Array.findFirst(props.containers, container =>
    Array.contains(container.itemIds, itemId),
  ).pipe(
    Option.flatMap(container =>
      Option.map(
        Array.findFirstIndex(container.itemIds, id => id === itemId),
        index => ({ containerId: container.id, index }),
      ),
    ),
  )

/** True when `containerId` is disabled (either globally via `props.isDisabled` or on the container itself). */
export const isContainerDisabled = (
  containerId: string,
  props: Pick<Props, 'containers' | 'isDisabled'>,
): boolean => {
  if (isDisabledOf(props)) {
    return true
  } else {
    return Option.exists(
      containerById(containerId, props),
      container => container.isDisabled === true,
    )
  }
}

/** True when `itemId` is disabled (globally, on its `Item` metadata, or via its containing `Container`). */
export const isItemDisabled = (
  itemId: string,
  props: Pick<Props, 'containers' | 'items' | 'isDisabled'>,
): boolean => {
  if (isDisabledOf(props)) {
    return true
  } else if (
    Option.exists(itemMetaById(itemId, props), item => item.isDisabled === true)
  ) {
    return true
  } else {
    return Option.exists(locateItem(itemId, props), located =>
      isContainerDisabled(located.containerId, props),
    )
  }
}

const maybeItemLabelOf = (
  itemId: string,
  props: Pick<Props, 'items'>,
): Option.Option<string> =>
  Option.flatMap(itemMetaById(itemId, props), item =>
    Option.fromNullishOr(item.label),
  )

const maybeContainerLabelOf = (
  containerId: string,
  props: Pick<Props, 'containers'>,
): Option.Option<string> =>
  Option.flatMap(containerById(containerId, props), container =>
    Option.fromNullishOr(container.label),
  )

/** Human-readable label for `itemId`, falling back to `itemId` when no label is supplied. */
export const itemLabelOf = (
  itemId: string,
  props: Pick<Props, 'items'>,
): string => Option.getOrElse(maybeItemLabelOf(itemId, props), () => itemId)

/** Human-readable label for `containerId`, falling back to `containerId` when no label is supplied. */
export const containerLabelOf = (
  containerId: string,
  props: Pick<Props, 'containers'>,
): string =>
  Option.getOrElse(maybeContainerLabelOf(containerId, props), () => containerId)

// GEOMETRY

/**
 * Center point `{ x, y }` of `rect`.
 *
 * @example
 * ```typescript
 * rectCenter({ x: 10, y: 20, width: 100, height: 40 }) // { x: 60, y: 40 }
 * ```
 */
export const rectCenter = (rect: PointerDrag.Rect): PointerDrag.Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
})

/**
 * True when `point` lies inside or on the boundary of `rect`.
 *
 * @example
 * ```typescript
 * rectContainsPoint({ x: 0, y: 0, width: 100, height: 50 }, { x: 50, y: 25 }) // true
 * rectContainsPoint({ x: 0, y: 0, width: 100, height: 50 }, { x: 150, y: 25 }) // false
 * ```
 */
export const rectContainsPoint = (
  rect: PointerDrag.Rect,
  point: PointerDrag.Point,
): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height

/**
 * Euclidean distance between two 2D points.
 *
 * @example
 * ```typescript
 * pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 }) // 5
 * ```
 */
export const pointDistance = (
  origin: PointerDrag.Point,
  target: PointerDrag.Point,
): number =>
  PointerDrag.distanceAlongAxis(
    target.x - origin.x,
    target.y - origin.y,
    'Both',
  )

/**
 * Shortest Euclidean distance from `point` to any point inside `rect` (`0` when inside `rect`).
 *
 * @example
 * ```typescript
 * rectDistanceToPoint({ x: 0, y: 0, width: 100, height: 50 }, { x: 50, y: 25 }) // 0
 * rectDistanceToPoint({ x: 0, y: 0, width: 100, height: 50 }, { x: 103, y: 54 }) // 5
 * ```
 */
export const rectDistanceToPoint = (
  rect: PointerDrag.Rect,
  point: PointerDrag.Point,
): number => {
  const clampedX = PointerDrag.clampValue(point.x, rect.x, rect.x + rect.width)
  const clampedY = PointerDrag.clampValue(point.y, rect.y, rect.y + rect.height)
  return PointerDrag.distanceAlongAxis(
    point.x - clampedX,
    point.y - clampedY,
    'Both',
  )
}

/**
 * Euclidean distance between the centers of two rectangles.
 *
 * @example
 * ```typescript
 * rectCenterDistance(
 *   { x: 0, y: 0, width: 20, height: 20 },
 *   { x: 30, y: 40, width: 20, height: 20 },
 * ) // 50
 * ```
 */
export const rectCenterDistance = (
  first: PointerDrag.Rect,
  second: PointerDrag.Rect,
): number => pointDistance(rectCenter(first), rectCenter(second))

/**
 * Overlapping area of two rectangles (`0` when they do not overlap).
 *
 * @example
 * ```typescript
 * rectIntersectionArea(
 *   { x: 0, y: 0, width: 100, height: 100 },
 *   { x: 50, y: 50, width: 100, height: 100 },
 * ) // 2500
 * ```
 */
export const rectIntersectionArea = (
  first: PointerDrag.Rect,
  second: PointerDrag.Rect,
): number => {
  const overlapX = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) -
      Math.max(first.x, second.x),
  )
  const overlapY = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) -
      Math.max(first.y, second.y),
  )
  return overlapX * overlapY
}

/**
 * True when two rectangles share a positive overlapping area.
 *
 * @example
 * ```typescript
 * rectsIntersect(
 *   { x: 0, y: 0, width: 50, height: 50 },
 *   { x: 25, y: 25, width: 50, height: 50 },
 * ) // true
 * ```
 */
export const rectsIntersect = (
  first: PointerDrag.Rect,
  second: PointerDrag.Rect,
): boolean => rectIntersectionArea(first, second) > 0

/**
 * Intersection-over-union ratio in `[0, 1]` between two rectangles (`0` when disjoint or empty).
 *
 * @example
 * ```typescript
 * rectIntersectionRatio(
 *   { x: 0, y: 0, width: 100, height: 100 },
 *   { x: 0, y: 0, width: 100, height: 100 },
 * ) // 1
 * ```
 */
export const rectIntersectionRatio = (
  first: PointerDrag.Rect,
  second: PointerDrag.Rect,
): number => {
  const intersection = rectIntersectionArea(first, second)
  if (intersection <= 0) {
    return 0
  } else {
    const firstArea = Math.max(0, first.width) * Math.max(0, first.height)
    const secondArea = Math.max(0, second.width) * Math.max(0, second.height)
    const union = firstArea + secondArea - intersection
    return union <= 0 ? 0 : intersection / union
  }
}

/**
 * True when movement from `origin` to `current` has reached or exceeded
 * `activationDistancePx` (5 px by default), reusing `PointerDrag.distanceAlongAxis`.
 *
 * @example
 * ```typescript
 * hasCrossedActivationThreshold({ x: 100, y: 200 }, { x: 102, y: 201 }, 5) // false
 * hasCrossedActivationThreshold({ x: 100, y: 200 }, { x: 105, y: 200 }, 5) // true
 * ```
 */
export const hasCrossedActivationThreshold = (
  origin: PointerDrag.Point,
  current: PointerDrag.Point,
  activationDistancePx: number = defaultActivationDistancePx,
): boolean =>
  pointDistance(origin, current) >= Math.max(0, activationDistancePx)

/**
 * Computes the per-frame auto-scroll delta along an axis when the pointer approaches
 * either viewport edge within `edgePx` (40 px default, max speed 15 px default).
 * Returns negative values near the leading edge, positive near the trailing edge, and `0` in the middle.
 *
 * @example
 * ```typescript
 * computeAutoScrollDelta(20, 800) // -7.5
 * computeAutoScrollDelta(400, 800) // 0
 * computeAutoScrollDelta(780, 800) // 7.5
 * ```
 */
export const computeAutoScrollDelta = (
  position: number,
  viewportSize: number,
  options: Readonly<{
    edgePx?: number
    maxSpeedPx?: number
  }> = {},
): number => {
  const edgePx = options.edgePx ?? defaultAutoScrollEdgePx
  const maxSpeedPx = options.maxSpeedPx ?? defaultAutoScrollMaxSpeedPx
  if (edgePx <= 0 || maxSpeedPx <= 0 || viewportSize <= 0) {
    return 0
  }
  const distanceFromStart = position
  const distanceFromEnd = viewportSize - position
  if (distanceFromStart < edgePx) {
    const clamped = Math.max(0, distanceFromStart)
    return -(maxSpeedPx * (1 - clamped / edgePx))
  } else if (distanceFromEnd < edgePx) {
    const clamped = Math.max(0, distanceFromEnd)
    return maxSpeedPx * (1 - clamped / edgePx)
  } else {
    return 0
  }
}

// COLLISION

/**
 * Selects the closest enabled target to `pointer`. Targets containing `pointer`
 * always win over targets outside; ties break by shortest center distance.
 * Returns `Option.none()` when no enabled target exists or when `maxDistancePx`
 * is exceeded.
 *
 * @example
 * ```typescript
 * findClosestTarget({ x: 150, y: 40 }, [
 *   { id: 'todo', rect: { x: 0, y: 0, width: 100, height: 200 } },
 *   { id: 'done', rect: { x: 120, y: 0, width: 100, height: 200 } },
 * ]) // Some({ id: 'done', ... })
 * ```
 */
export const findClosestTarget = (
  pointer: PointerDrag.Point,
  targets: ReadonlyArray<TargetBounds>,
  options: Readonly<{ maxDistancePx?: number }> = {},
): Option.Option<TargetBounds> => {
  const enabled = Array.filter(targets, target => target.isDisabled !== true)
  return Array.match(enabled, {
    onEmpty: () => Option.none(),
    onNonEmpty: candidates => {
      const best = Array.reduce(
        candidates,
        Array.headNonEmpty(candidates),
        (winner, candidate) => {
          const winnerEdgeDistance = rectDistanceToPoint(winner.rect, pointer)
          const candidateEdgeDistance = rectDistanceToPoint(
            candidate.rect,
            pointer,
          )
          if (candidateEdgeDistance < winnerEdgeDistance) {
            return candidate
          } else if (candidateEdgeDistance === winnerEdgeDistance) {
            const winnerCenterDistance = pointDistance(
              rectCenter(winner.rect),
              pointer,
            )
            const candidateCenterDistance = pointDistance(
              rectCenter(candidate.rect),
              pointer,
            )
            return candidateCenterDistance < winnerCenterDistance
              ? candidate
              : winner
          } else {
            return winner
          }
        },
      )
      const bestDistance = rectDistanceToPoint(best.rect, pointer)
      if (
        options.maxDistancePx !== undefined &&
        bestDistance > options.maxDistancePx
      ) {
        return Option.none()
      } else {
        return Option.some(best)
      }
    },
  })
}

/**
 * Selects the enabled target with the largest positive intersection area against
 * `draggedRect`, breaking ties by shortest center distance.
 *
 * @example
 * ```typescript
 * findMostIntersectingTarget(
 *   { x: 10, y: 10, width: 50, height: 50 },
 *   [{ id: 'todo', rect: { x: 0, y: 0, width: 100, height: 100 } }],
 * ) // Some({ id: 'todo', ... })
 * ```
 */
export const findMostIntersectingTarget = (
  draggedRect: PointerDrag.Rect,
  targets: ReadonlyArray<TargetBounds>,
): Option.Option<TargetBounds> => {
  const overlapping = Array.filter(
    targets,
    target =>
      target.isDisabled !== true &&
      rectIntersectionArea(draggedRect, target.rect) > 0,
  )
  return Array.match(overlapping, {
    onEmpty: () => Option.none(),
    onNonEmpty: candidates => {
      const best = Array.reduce(
        candidates,
        Array.headNonEmpty(candidates),
        (winner, candidate) => {
          const winnerArea = rectIntersectionArea(draggedRect, winner.rect)
          const candidateArea = rectIntersectionArea(
            draggedRect,
            candidate.rect,
          )
          if (candidateArea > winnerArea) {
            return candidate
          } else if (candidateArea === winnerArea) {
            return rectCenterDistance(draggedRect, candidate.rect) <
              rectCenterDistance(draggedRect, winner.rect)
              ? candidate
              : winner
          } else {
            return winner
          }
        },
      )
      return Option.some(best)
    },
  })
}

/**
 * Computes the insertion index for `pointer` among ordered `itemRects` along
 * `orientation`: returns the first index whose midpoint lies past `pointer`,
 * or `itemRects.length` to append at the end.
 *
 * @example
 * ```typescript
 * computeInsertionIndex(
 *   { x: 50, y: 55 },
 *   [
 *     { x: 0, y: 0, width: 100, height: 40 },
 *     { x: 0, y: 40, width: 100, height: 40 },
 *   ],
 *   'Vertical',
 * ) // 1
 * ```
 */
export const computeInsertionIndex = (
  pointer: PointerDrag.Point,
  itemRects: ReadonlyArray<PointerDrag.Rect>,
  orientation: Orientation = defaultOrientation,
): number =>
  pipe(
    itemRects,
    Array.findFirstIndex(rect =>
      M.value(orientation).pipe(
        M.withReturnType<boolean>(),
        M.when('Vertical', () => pointer.y < rect.y + rect.height / 2),
        M.when('Horizontal', () => pointer.x < rect.x + rect.width / 2),
        M.exhaustive,
      ),
    ),
    Option.getOrElse(() => itemRects.length),
  )

/**
 * Resolves a {@link DropTarget} from painter-measured {@link ContainerBounds}
 * by finding the closest enabled container to `pointer` and computing its
 * insertion index along `orientation`.
 */
export const resolveDropTargetFromBounds = (
  pointer: PointerDrag.Point,
  containers: ReadonlyArray<ContainerBounds>,
  options: Readonly<{
    orientation?: Orientation
    maxDistancePx?: number
  }> = {},
): Option.Option<DropTarget> => {
  const orientation = orientationOf(options)
  const targetBounds: ReadonlyArray<TargetBounds> = Array.map(
    containers,
    container => ({
      id: container.id,
      rect: container.rect,
      ...(container.isDisabled === undefined
        ? {}
        : { isDisabled: container.isDisabled }),
    }),
  )
  return Option.flatMap(
    findClosestTarget(
      pointer,
      targetBounds,
      options.maxDistancePx === undefined
        ? {}
        : { maxDistancePx: options.maxDistancePx },
    ),
    matched =>
      Option.map(
        Array.findFirst(containers, container => container.id === matched.id),
        container => ({
          containerId: container.id,
          index: computeInsertionIndex(
            pointer,
            container.itemRects,
            orientation,
          ),
        }),
      ),
  )
}

// REORDER

/**
 * Builds a {@link Reorder} for dropping `source` onto `target`. When
 * `adjustForSameContainer` is `true`, an insertion index measured against a list
 * that still includes the dragged item is shifted down by 1 when moving forward
 * within the same container (`target.index > source.index`).
 *
 * @example
 * ```typescript
 * computeReorder(
 *   { itemId: 'a', containerId: 'todo', index: 0 },
 *   { containerId: 'todo', index: 2 },
 *   { adjustForSameContainer: true },
 * ) // { itemId: 'a', fromContainerId: 'todo', fromIndex: 0, toContainerId: 'todo', toIndex: 1 }
 * ```
 */
export const computeReorder = (
  source: Origin,
  target: DropTarget,
  options: Readonly<{ adjustForSameContainer?: boolean }> = {},
): Reorder => {
  const rawIndex = Math.max(0, Math.trunc(target.index))
  const toIndex =
    options.adjustForSameContainer === true &&
    source.containerId === target.containerId &&
    rawIndex > source.index
      ? rawIndex - 1
      : rawIndex
  return {
    itemId: source.itemId,
    fromContainerId: source.containerId,
    fromIndex: source.index,
    toContainerId: target.containerId,
    toIndex,
  }
}

/**
 * Moves the item at `fromIndex` to `toIndex` within a single list, clamping
 * `toIndex` into `[0, items.length - 1]`. Returns `items` unchanged when
 * `fromIndex` is out of range or equal to the clamped destination.
 *
 * @example
 * ```typescript
 * moveItem(['a', 'b', 'c'], 0, 2) // ['b', 'c', 'a']
 * moveItem(['a', 'b', 'c'], 2, 0) // ['c', 'a', 'b']
 * ```
 */
export const moveItem = <ItemValue>(
  items: ReadonlyArray<ItemValue>,
  fromIndex: number,
  toIndex: number,
): ReadonlyArray<ItemValue> => {
  if (Array.isReadonlyArrayEmpty(items)) {
    return items
  }
  const safeFrom = Math.trunc(fromIndex)
  const maybeMoved = Array.get(items, safeFrom)
  if (Option.isNone(maybeMoved)) {
    return items
  }
  const safeTo = PointerDrag.clampValue(
    Math.trunc(toIndex),
    0,
    items.length - 1,
  )
  if (safeFrom === safeTo) {
    return items
  } else {
    const withoutMoved = Array.remove(items, safeFrom)
    return Option.getOrElse(
      Array.insertAt(withoutMoved, safeTo, maybeMoved.value),
      () => [...withoutMoved, maybeMoved.value],
    )
  }
}

/**
 * Moves one item from `source` at `fromIndex` into `destination` at `toIndex`
 * (clamped into `[0, destination.length]`). Returns both arrays unchanged when
 * `fromIndex` is out of range.
 *
 * @example
 * ```typescript
 * moveBetweenLists(['a', 'b'], ['c'], 0, 1)
 * // { source: ['b'], destination: ['c', 'a'] }
 * ```
 */
export const moveBetweenLists = <ItemValue>(
  source: ReadonlyArray<ItemValue>,
  destination: ReadonlyArray<ItemValue>,
  fromIndex: number,
  toIndex: number,
): Readonly<{
  source: ReadonlyArray<ItemValue>
  destination: ReadonlyArray<ItemValue>
}> => {
  const safeFrom = Math.trunc(fromIndex)
  const maybeMoved = Array.get(source, safeFrom)
  if (Option.isNone(maybeMoved)) {
    return { source, destination }
  } else {
    const nextSource = Array.remove(source, safeFrom)
    const safeTo = PointerDrag.clampValue(
      Math.trunc(toIndex),
      0,
      destination.length,
    )
    const nextDestination = Option.getOrElse(
      Array.insertAt(destination, safeTo, maybeMoved.value),
      () => [...destination, maybeMoved.value],
    )
    return { source: nextSource, destination: nextDestination }
  }
}

/**
 * Applies a {@link Reorder} across an ordered array of containers, preserving
 * every extra field on each container and keeping untouched containers
 * reference-equal. Handles both same-container and cross-container moves.
 *
 * @example
 * ```typescript
 * moveItemAcrossContainers(
 *   [
 *     { id: 'todo', itemIds: ['a', 'b'] },
 *     { id: 'done', itemIds: ['c'] },
 *   ],
 *   { fromContainerId: 'todo', fromIndex: 0, toContainerId: 'done', toIndex: 1 },
 * )
 * // [{ id: 'todo', itemIds: ['b'] }, { id: 'done', itemIds: ['c', 'a'] }]
 * ```
 */
export const moveItemAcrossContainers = <
  ContainerValue extends Readonly<{
    id: string
    itemIds: ReadonlyArray<string>
  }>,
>(
  containers: ReadonlyArray<ContainerValue>,
  reorder: Readonly<{
    fromContainerId: string
    fromIndex: number
    toContainerId: string
    toIndex: number
  }>,
): ReadonlyArray<ContainerValue> => {
  if (reorder.fromContainerId === reorder.toContainerId) {
    return Array.map(containers, container => {
      if (container.id !== reorder.fromContainerId) {
        return container
      } else {
        const nextItemIds = moveItem(
          container.itemIds,
          reorder.fromIndex,
          reorder.toIndex,
        )
        return nextItemIds === container.itemIds
          ? container
          : { ...container, itemIds: nextItemIds }
      }
    })
  }

  const maybeFrom = Array.findFirst(
    containers,
    container => container.id === reorder.fromContainerId,
  )
  const maybeTo = Array.findFirst(
    containers,
    container => container.id === reorder.toContainerId,
  )
  if (Option.isNone(maybeFrom) || Option.isNone(maybeTo)) {
    return containers
  }

  const moved = moveBetweenLists(
    maybeFrom.value.itemIds,
    maybeTo.value.itemIds,
    reorder.fromIndex,
    reorder.toIndex,
  )
  if (moved.source === maybeFrom.value.itemIds) {
    return containers
  } else {
    return Array.map(containers, container => {
      if (container.id === reorder.fromContainerId) {
        return { ...container, itemIds: moved.source }
      } else if (container.id === reorder.toContainerId) {
        return { ...container, itemIds: moved.destination }
      } else {
        return container
      }
    })
  }
}

// KEYBOARD

/** True when `key` activates (lifts) or commits (drops) a keyboard drag (`' '` Space or `'Enter'`). */
export const isActivationKey = (key: string): boolean =>
  key === ' ' || key === 'Enter'

/** True when `key` cancels an active or pending drag (`'Escape'`). */
export const isCancelKey = (key: string): boolean =>
  PointerDrag.isCancelKey(key)

/**
 * Maps an arrow key to its cardinal {@link KeyboardMoveDirection}, or `Option.none()` for other keys.
 *
 * @example
 * ```typescript
 * arrowKeyToDirection('ArrowDown') // Some('Down')
 * arrowKeyToDirection('Enter') // None
 * ```
 */
export const arrowKeyToDirection = (
  key: string,
): Option.Option<'Up' | 'Down' | 'Left' | 'Right'> =>
  M.value(key).pipe(
    M.withReturnType<'Up' | 'Down' | 'Left' | 'Right'>(),
    M.when('ArrowUp', () => 'Up'),
    M.when('ArrowDown', () => 'Down'),
    M.when('ArrowLeft', () => 'Left'),
    M.when('ArrowRight', () => 'Right'),
    M.option,
  )

/**
 * Maps a keyboard key during keyboard dragging (`Tab`, `Shift+Tab`, and arrow keys)
 * to a {@link KeyboardMoveDirection}.
 *
 * @example
 * ```typescript
 * keyToMoveDirection('Tab') // Some('NextContainer')
 * keyToMoveDirection('Tab', { isShift: true }) // Some('PreviousContainer')
 * keyToMoveDirection('ArrowUp') // Some('Up')
 * ```
 */
export const keyToMoveDirection = (
  key: string,
  options: Readonly<{ isShift?: boolean }> = {},
): Option.Option<KeyboardMoveDirection> => {
  if (key === 'Tab') {
    return Option.some(
      options.isShift === true ? 'PreviousContainer' : 'NextContainer',
    )
  } else {
    return arrowKeyToDirection(key)
  }
}

/**
 * Advances `currentIndex` forward or backward within a container holding
 * `otherItemCount` items besides the dragged item, clamping into `[0, otherItemCount]`.
 *
 * @example
 * ```typescript
 * stepIndexWithinContainer(0, 2, true) // 1
 * stepIndexWithinContainer(0, 2, false) // 0
 * stepIndexWithinContainer(2, 2, true) // 2
 * ```
 */
export const stepIndexWithinContainer = (
  currentIndex: number,
  otherItemCount: number,
  isForward: boolean,
): number => {
  const maxIndex = Math.max(0, otherItemCount)
  if (isForward) {
    return Math.min(currentIndex + 1, maxIndex)
  } else {
    return Math.max(currentIndex - 1, 0)
  }
}

/**
 * Advances `currentContainerIndex` forward or backward across `containerCount`
 * containers, clamping into `[0, Math.max(0, containerCount - 1)]`.
 *
 * @example
 * ```typescript
 * stepContainerIndex(0, 3, true) // 1
 * stepContainerIndex(0, 3, false) // 0
 * stepContainerIndex(2, 3, true) // 2
 * ```
 */
export const stepContainerIndex = (
  currentContainerIndex: number,
  containerCount: number,
  isForward: boolean,
): number => {
  const maxIndex = Math.max(0, containerCount - 1)
  if (isForward) {
    return Math.min(currentContainerIndex + 1, maxIndex)
  } else {
    return Math.max(currentContainerIndex - 1, 0)
  }
}

const otherItemCountIn = (container: Container, itemId: string): number =>
  Array.filter(container.itemIds, id => id !== itemId).length

const moveWithinContainer = (
  itemId: string,
  currentContainerId: string,
  currentIndex: number,
  isForward: boolean,
  props: Pick<Props, 'containers'>,
): DropTarget =>
  Option.match(containerById(currentContainerId, props), {
    onNone: () => ({ containerId: currentContainerId, index: currentIndex }),
    onSome: container => ({
      containerId: container.id,
      index: stepIndexWithinContainer(
        currentIndex,
        otherItemCountIn(container, itemId),
        isForward,
      ),
    }),
  })

const moveBetweenContainers = (
  itemId: string,
  currentContainerId: string,
  currentIndex: number,
  isForward: boolean,
  props: Pick<Props, 'containers'>,
): DropTarget => {
  const enabledContainers = Array.filter(
    props.containers,
    container => container.isDisabled !== true,
  )
  if (Array.isReadonlyArrayEmpty(enabledContainers)) {
    return { containerId: currentContainerId, index: currentIndex }
  }
  const currentContainerIndex = Option.getOrElse(
    Array.findFirstIndex(
      enabledContainers,
      container => container.id === currentContainerId,
    ),
    () => 0,
  )
  const nextContainerIndex = stepContainerIndex(
    currentContainerIndex,
    enabledContainers.length,
    isForward,
  )
  return Option.match(Array.get(enabledContainers, nextContainerIndex), {
    onNone: () => ({ containerId: currentContainerId, index: currentIndex }),
    onSome: nextContainer => {
      if (nextContainer.id === currentContainerId) {
        return { containerId: currentContainerId, index: currentIndex }
      } else {
        const maxIndex = otherItemCountIn(nextContainer, itemId)
        return {
          containerId: nextContainer.id,
          index: PointerDrag.clampValue(currentIndex, 0, maxIndex),
        }
      }
    },
  })
}

/**
 * Resolves the next {@link DropTarget} during keyboard dragging from `current`
 * in `direction` over `props.containers`, honoring `orientation`:
 * - `Vertical`: `Up`/`Down` move within the container; `Left`/`Right` and `PreviousContainer`/`NextContainer` move across enabled containers.
 * - `Horizontal`: `Left`/`Right` move within the container; `Up`/`Down` and `PreviousContainer`/`NextContainer` move across enabled containers.
 */
export const resolveKeyboardMove = (
  current: Readonly<{
    itemId: string
    containerId: string
    index: number
  }>,
  direction: KeyboardMoveDirection,
  props: Pick<Props, 'containers' | 'orientation'>,
): DropTarget => {
  const orientation = orientationOf(props)
  return M.value(direction).pipe(
    M.withReturnType<DropTarget>(),
    M.when('NextContainer', () =>
      moveBetweenContainers(
        current.itemId,
        current.containerId,
        current.index,
        true,
        props,
      ),
    ),
    M.when('PreviousContainer', () =>
      moveBetweenContainers(
        current.itemId,
        current.containerId,
        current.index,
        false,
        props,
      ),
    ),
    M.when('Down', () =>
      orientation === 'Vertical'
        ? moveWithinContainer(
            current.itemId,
            current.containerId,
            current.index,
            true,
            props,
          )
        : moveBetweenContainers(
            current.itemId,
            current.containerId,
            current.index,
            true,
            props,
          ),
    ),
    M.when('Up', () =>
      orientation === 'Vertical'
        ? moveWithinContainer(
            current.itemId,
            current.containerId,
            current.index,
            false,
            props,
          )
        : moveBetweenContainers(
            current.itemId,
            current.containerId,
            current.index,
            false,
            props,
          ),
    ),
    M.when('Right', () =>
      orientation === 'Horizontal'
        ? moveWithinContainer(
            current.itemId,
            current.containerId,
            current.index,
            true,
            props,
          )
        : moveBetweenContainers(
            current.itemId,
            current.containerId,
            current.index,
            true,
            props,
          ),
    ),
    M.when('Left', () =>
      orientation === 'Horizontal'
        ? moveWithinContainer(
            current.itemId,
            current.containerId,
            current.index,
            false,
            props,
          )
        : moveBetweenContainers(
            current.itemId,
            current.containerId,
            current.index,
            false,
            props,
          ),
    ),
    M.exhaustive,
  )
}

// READINGS

/** True while `state` is `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True while `state` is `Pending` (pointer down, below activation threshold). */
export const isPending = (state: State): boolean => state._tag === 'Pending'

/** True while `state` is `Dragging` (active pointer drag). */
export const isPointerDragging = (state: State): boolean =>
  state._tag === 'Dragging'

/** True while `state` is `KeyboardDragging`. */
export const isKeyboardDragging = (state: State): boolean =>
  state._tag === 'KeyboardDragging'

/** True while an item is actively being dragged via pointer or keyboard (`Dragging` or `KeyboardDragging`). */
export const isDragging = (state: State): boolean =>
  state._tag === 'Dragging' || state._tag === 'KeyboardDragging'

/** True while `state` is `Pending`, `Dragging`, or `KeyboardDragging`. */
export const isActive = (state: State): boolean => state._tag !== 'Idle'

/** True when `itemId` is the item currently being dragged (`Dragging` or `KeyboardDragging`). */
export const isItemDragging = (state: State, itemId: string): boolean =>
  (state._tag === 'Dragging' || state._tag === 'KeyboardDragging') &&
  state.itemId === itemId

/** The item id currently pending or being dragged, or none while `Idle`. */
export const maybeDraggedItemId = (state: State): Option.Option<string> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      Idle: () => Option.none(),
      Pending: ({ itemId }) => Option.some(itemId),
      Dragging: ({ itemId }) => Option.some(itemId),
      KeyboardDragging: ({ itemId }) => Option.some(itemId),
    }),
  )

/** Active drop target during `Dragging` or `KeyboardDragging`, or none while `Idle` or `Pending`. */
export const maybeDropTarget = (state: State): Option.Option<DropTarget> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<DropTarget>>(),
    M.tagsExhaustive({
      Idle: () => Option.none(),
      Pending: () => Option.none(),
      Dragging: dragging => dragging.maybeDropTarget,
      KeyboardDragging: keyboard =>
        Option.some({
          containerId: keyboard.targetContainerId,
          index: keyboard.targetIndex,
        }),
    }),
  )

/** True when `containerId` is the current drop target container during an active drag. */
export const isDropTargetContainer = (
  state: State,
  containerId: string,
): boolean =>
  Option.exists(
    maybeDropTarget(state),
    target => target.containerId === containerId,
  )

/** Origin item, container, and index of the active or pending drag, or none while `Idle`. */
export const maybeOrigin = (state: State): Option.Option<Origin> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<Origin>>(),
    M.tagsExhaustive({
      Idle: () => Option.none(),
      Pending: ({ itemId, sourceContainerId, sourceIndex }) =>
        Option.some({
          itemId,
          containerId: sourceContainerId,
          index: sourceIndex,
        }),
      Dragging: ({ itemId, sourceContainerId, sourceIndex }) =>
        Option.some({
          itemId,
          containerId: sourceContainerId,
          index: sourceIndex,
        }),
      KeyboardDragging: ({ itemId, sourceContainerId, sourceIndex }) =>
        Option.some({
          itemId,
          containerId: sourceContainerId,
          index: sourceIndex,
        }),
    }),
  )

/** Most recent settled drag outcome (`Dropped` or `Cancelled`) when `Idle`, or none otherwise. */
export const maybeLastOutcome = (state: State): Option.Option<Outcome> =>
  state._tag === 'Idle' ? state.maybeLastOutcome : Option.none()

/** Most recent committed {@link Reorder} when `Idle` after a drop, or none otherwise. */
export const lastReorderOf = (state: State): Option.Option<Reorder> =>
  Option.flatMap(maybeLastOutcome(state), outcome =>
    outcome._tag === 'Dropped'
      ? Option.some({
          itemId: outcome.itemId,
          fromContainerId: outcome.fromContainerId,
          fromIndex: outcome.fromIndex,
          toContainerId: outcome.toContainerId,
          toIndex: outcome.toIndex,
        })
      : Option.none(),
  )

/** Underlying `PointerDrag.State` held by `state`. */
export const dragOf = (state: State): PointerDrag.State => state.drag

/** Active pointer identifier while `Pending` or `Dragging`, or none otherwise. */
export const pointerIdOf = (state: State): Option.Option<number> =>
  PointerDrag.pointerIdOf(state.drag)

/** Pointer displacement `{ dx, dy }` from the press origin while `Pending` or `Dragging`, or `{ dx: 0, dy: 0 }`. */
export const deltaOf = (state: State): PointerDrag.Delta =>
  PointerDrag.deltaOf(state.drag)

const totalPositionsOf = (
  containerId: string,
  itemId: string,
  fallbackIndex: number,
  props: Pick<Props, 'containers'>,
): number =>
  Option.match(containerById(containerId, props), {
    onNone: () => Math.max(1, fallbackIndex + 1),
    onSome: container => otherItemCountIn(container, itemId) + 1,
  })

/**
 * Derives an accessible live-region announcement string for assistive technology
 * from the current drag state and container data:
 * - Lifted (pointer or keyboard pickup)
 * - Moved to position N of M in container
 * - Dropped at position N of M in container
 * - Cancelled and returned to original position N of M in container
 * - Empty string when idle with no settled outcome or while pending below threshold
 */
export const announcementOf = (
  state: State,
  props: Pick<Props, 'containers' | 'items'>,
): string =>
  M.value(state).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Idle: ({ maybeLastOutcome: outcome }) =>
        Option.match(outcome, {
          onNone: () => '',
          onSome: settled =>
            M.value(settled).pipe(
              M.withReturnType<string>(),
              M.tagsExhaustive({
                Dropped: ({ itemId, toContainerId, toIndex }) => {
                  const item = itemLabelOf(itemId, props)
                  const container = containerLabelOf(toContainerId, props)
                  const total = totalPositionsOf(
                    toContainerId,
                    itemId,
                    toIndex,
                    props,
                  )
                  return `Dropped ${item} at position ${(toIndex + 1).toString()} of ${total.toString()} in ${container}.`
                },
                Cancelled: ({ itemId, originContainerId, originIndex }) => {
                  const item = itemLabelOf(itemId, props)
                  const container = containerLabelOf(originContainerId, props)
                  const total = totalPositionsOf(
                    originContainerId,
                    itemId,
                    originIndex,
                    props,
                  )
                  return `Cancelled dragging ${item}. Returned to position ${(originIndex + 1).toString()} of ${total.toString()} in ${container}.`
                },
              }),
            ),
        }),
      Pending: () => '',
      Dragging: ({
        itemId,
        sourceContainerId,
        sourceIndex,
        maybeDropTarget: target,
        hasMoved,
      }) => {
        const item = itemLabelOf(itemId, props)
        if (!hasMoved) {
          const container = containerLabelOf(sourceContainerId, props)
          const total = totalPositionsOf(
            sourceContainerId,
            itemId,
            sourceIndex,
            props,
          )
          return `Lifted ${item} from position ${(sourceIndex + 1).toString()} of ${total.toString()} in ${container}.`
        } else {
          return Option.match(target, {
            onNone: () => `Dragging ${item} outside any drop zone.`,
            onSome: ({ containerId, index }) => {
              const container = containerLabelOf(containerId, props)
              const total = totalPositionsOf(containerId, itemId, index, props)
              return `Moved ${item} to position ${(index + 1).toString()} of ${total.toString()} in ${container}.`
            },
          })
        }
      },
      KeyboardDragging: ({
        itemId,
        sourceContainerId,
        sourceIndex,
        targetContainerId,
        targetIndex,
        hasMoved,
      }) => {
        const item = itemLabelOf(itemId, props)
        if (!hasMoved) {
          const container = containerLabelOf(sourceContainerId, props)
          const total = totalPositionsOf(
            sourceContainerId,
            itemId,
            sourceIndex,
            props,
          )
          return `Lifted ${item} at position ${(sourceIndex + 1).toString()} of ${total.toString()} in ${container}. Use arrow keys to move, Space or Enter to drop, Escape to cancel.`
        } else {
          const container = containerLabelOf(targetContainerId, props)
          const total = totalPositionsOf(
            targetContainerId,
            itemId,
            targetIndex,
            props,
          )
          return `Moved ${item} to position ${(targetIndex + 1).toString()} of ${total.toString()} in ${container}.`
        }
      },
    }),
  )

// CHART

const resolveItemLocation = (
  itemId: string,
  explicitContainerId: string | undefined,
  explicitIndex: number | undefined,
  props: Props,
): Option.Option<Readonly<{ containerId: string; index: number }>> => {
  if (!canInteract(props) || isItemDisabled(itemId, props)) {
    return Option.none()
  }
  if (explicitContainerId !== undefined) {
    if (isContainerDisabled(explicitContainerId, props)) {
      return Option.none()
    }
    if (explicitIndex !== undefined) {
      return Option.some({
        containerId: explicitContainerId,
        index: Math.max(0, Math.trunc(explicitIndex)),
      })
    } else {
      return Option.flatMap(
        containerById(explicitContainerId, props),
        container =>
          Option.map(
            Array.findFirstIndex(container.itemIds, id => id === itemId),
            index => ({ containerId: container.id, index }),
          ),
      )
    }
  } else {
    return locateItem(itemId, props)
  }
}

const filterEnabledDropTarget = (
  target: Option.Option<DropTarget>,
  props: Props,
): Option.Option<DropTarget> =>
  Option.filter(
    target,
    candidate => !isContainerDisabled(candidate.containerId, props),
  )

const isSameOptionDropTarget = (
  before: Option.Option<DropTarget>,
  after: Option.Option<DropTarget>,
): boolean =>
  Option.match(before, {
    onNone: () => Option.isNone(after),
    onSome: first =>
      Option.exists(
        after,
        second =>
          first.containerId === second.containerId &&
          first.index === second.index,
      ),
  })

const isMatchingPointer = (
  activePointerId: number,
  incomingPointerId: number | undefined,
): boolean =>
  incomingPointerId === undefined || incomingPointerId === activePointerId

const startDragOf = (
  drag: PointerDrag.State,
  message: Readonly<{ pointerId: number; x: number; y: number }>,
  originIndex: number,
  context: Props,
): PointerDrag.Dragging => {
  const [nextDrag] = PointerDrag.chart.transition(
    drag,
    PointerDrag.StartDrag({
      pointerId: message.pointerId,
      x: message.x,
      y: message.y,
      originValue: originIndex,
    }),
    dragPropsOf(context),
  )
  return nextDrag._tag === 'Dragging'
    ? nextDrag
    : PointerDrag.Dragging({
        pointerId: message.pointerId,
        startX: message.x,
        startY: message.y,
        currentX: message.x,
        currentY: message.y,
        originValue: originIndex,
        isActivated: activationDistancePxOf(context) <= 0,
      })
}

const moveDragOf = (
  drag: PointerDrag.Dragging,
  message: Readonly<{ pointerId: number; x: number; y: number }>,
  context: Props,
): PointerDrag.Dragging => {
  const [nextDrag] = PointerDrag.chart.transition(
    drag,
    PointerDrag.MoveDrag({
      pointerId: message.pointerId,
      x: message.x,
      y: message.y,
    }),
    dragPropsOf(context),
  )
  return nextDrag._tag === 'Dragging' ? nextDrag : drag
}

const endDragOf = (
  drag: PointerDrag.Dragging,
  pointerId: number | undefined,
  context: Props,
): PointerDrag.Idle => {
  const [nextDrag] = PointerDrag.chart.transition(
    drag,
    PointerDrag.EndDrag(pointerId === undefined ? {} : { pointerId }),
    dragPropsOf(context),
  )
  return nextDrag._tag === 'Idle' ? nextDrag : PointerDrag.Idle()
}

const cancelDragOf = (
  drag: PointerDrag.Dragging,
  pointerId: number | undefined,
  context: Props,
): PointerDrag.Idle => {
  const [nextDrag] = PointerDrag.chart.transition(
    drag,
    PointerDrag.CancelDrag(pointerId === undefined ? {} : { pointerId }),
    dragPropsOf(context),
  )
  return nextDrag._tag === 'Idle' ? nextDrag : PointerDrag.Idle()
}

const dropFromDragging = (
  state: Dragging,
  pointerId: number | undefined,
  context: Props,
): Idle => {
  const nextOutcome = Option.match(state.maybeDropTarget, {
    onNone: (): Outcome =>
      Cancelled({
        itemId: state.itemId,
        originContainerId: state.sourceContainerId,
        originIndex: state.sourceIndex,
      }),
    onSome: (target): Outcome =>
      Dropped(
        computeReorder(
          {
            itemId: state.itemId,
            containerId: state.sourceContainerId,
            index: state.sourceIndex,
          },
          target,
        ),
      ),
  })
  return Idle({
    maybeLastOutcome: Option.some(nextOutcome),
    drag: endDragOf(state.drag, pointerId, context),
  })
}

const cancelFromDragging = (
  state: Dragging,
  pointerId: number | undefined,
  context: Props,
): Idle =>
  Idle({
    maybeLastOutcome: Option.some(
      Cancelled({
        itemId: state.itemId,
        originContainerId: state.sourceContainerId,
        originIndex: state.sourceIndex,
      }),
    ),
    drag: cancelDragOf(state.drag, pointerId, context),
  })

const dropFromKeyboard = (state: KeyboardDragging): Idle =>
  Idle({
    maybeLastOutcome: Option.some(
      Dropped({
        itemId: state.itemId,
        fromContainerId: state.sourceContainerId,
        fromIndex: state.sourceIndex,
        toContainerId: state.targetContainerId,
        toIndex: state.targetIndex,
      }),
    ),
    drag: PointerDrag.Idle(),
  })

const cancelFromKeyboard = (state: KeyboardDragging): Idle =>
  Idle({
    maybeLastOutcome: Option.some(
      Cancelled({
        itemId: state.itemId,
        originContainerId: state.sourceContainerId,
        originIndex: state.sourceIndex,
      }),
    ),
    drag: PointerDrag.Idle(),
  })

const stepKeyboardMove = (
  state: KeyboardDragging,
  direction: KeyboardMoveDirection,
  context: Props,
): KeyboardDragging => {
  const nextTarget = resolveKeyboardMove(
    {
      itemId: state.itemId,
      containerId: state.targetContainerId,
      index: state.targetIndex,
    },
    direction,
    context,
  )
  const didMove =
    nextTarget.containerId !== state.targetContainerId ||
    nextTarget.index !== state.targetIndex
  return KeyboardDragging({
    itemId: state.itemId,
    sourceContainerId: state.sourceContainerId,
    sourceIndex: state.sourceIndex,
    targetContainerId: nextTarget.containerId,
    targetIndex: nextTarget.index,
    hasMoved: state.hasMoved || didMove,
    drag: PointerDrag.Idle(),
  })
}

const beginPointerDragEdges = (): ReadonlyArray<
  GuardedEdge<State, Message, Idle, typeof BeginPointerDrag.Type, never, Props>
> => [
  when(
    (_state, message, context) =>
      activationDistancePxOf(context) <= 0
        ? resolveItemLocation(
            message.itemId,
            message.containerId,
            message.index,
            context,
          )
        : Option.none(),
    'Dragging',
    ({ state, message, guardValue, context }) =>
      Dragging({
        itemId: message.itemId,
        sourceContainerId: guardValue.containerId,
        sourceIndex: guardValue.index,
        maybeDropTarget: Option.none(),
        hasMoved: false,
        drag: startDragOf(state.drag, message, guardValue.index, context),
      }),
  ),
  when(
    (_state, message, context) =>
      activationDistancePxOf(context) > 0
        ? resolveItemLocation(
            message.itemId,
            message.containerId,
            message.index,
            context,
          )
        : Option.none(),
    'Pending',
    ({ state, message, guardValue, context }) =>
      Pending({
        itemId: message.itemId,
        sourceContainerId: guardValue.containerId,
        sourceIndex: guardValue.index,
        drag: startDragOf(state.drag, message, guardValue.index, context),
      }),
  ),
  ignore(),
]

/**
 * Builds the DragAndDrop Machine chart starting in `initialState`, composing
 * `PointerDrag.chart` for pointer activation thresholds, pointerId tracking,
 * and cancellation while handling full keyboard lifting, movement within and
 * across containers, drop confirmation, and Escape cancellation.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          LiftItem: [
            when(
              (_state, message, context) =>
                resolveItemLocation(
                  message.itemId,
                  message.containerId,
                  message.index,
                  context,
                ),
              'KeyboardDragging',
              ({ message, guardValue }) =>
                KeyboardDragging({
                  itemId: message.itemId,
                  sourceContainerId: guardValue.containerId,
                  sourceIndex: guardValue.index,
                  targetContainerId: guardValue.containerId,
                  targetIndex: guardValue.index,
                  hasMoved: false,
                  drag: PointerDrag.Idle(),
                }),
            ),
            ignore(),
          ],
          MoveDraggedItem: [ignore()],
          DropItem: [ignore()],
          CancelDrag: [ignore()],
          BeginPointerDrag: beginPointerDragEdges(),
          MovePointerDrag: [ignore()],
          ReleasePointerDrag: [ignore()],
          CancelPointerDrag: [ignore()],
          PressedDragKey: [
            when(
              (_state, message, context) => {
                const itemId = message.itemId
                if (!isActivationKey(message.key) || itemId === undefined) {
                  return Option.none()
                } else {
                  return Option.map(
                    resolveItemLocation(
                      itemId,
                      message.containerId,
                      message.index,
                      context,
                    ),
                    located => ({ itemId, ...located }),
                  )
                }
              },
              'KeyboardDragging',
              ({ guardValue }) =>
                KeyboardDragging({
                  itemId: guardValue.itemId,
                  sourceContainerId: guardValue.containerId,
                  sourceIndex: guardValue.index,
                  targetContainerId: guardValue.containerId,
                  targetIndex: guardValue.index,
                  hasMoved: false,
                  drag: PointerDrag.Idle(),
                }),
            ),
            ignore(),
          ],
        },
      },
      Pending: {
        on: {
          LiftItem: [ignore()],
          MoveDraggedItem: [ignore()],
          DropItem: to('Idle', ({ state, context }) =>
            Idle({
              maybeLastOutcome: Option.none(),
              drag: endDragOf(state.drag, undefined, context),
            }),
          ),
          CancelDrag: to('Idle', ({ state, context }) =>
            Idle({
              maybeLastOutcome: Option.none(),
              drag: cancelDragOf(state.drag, undefined, context),
            }),
          ),
          BeginPointerDrag: [ignore()],
          MovePointerDrag: [
            when(
              (state, message, context) => {
                if (
                  !canInteract(context) ||
                  message.pointerId !== state.drag.pointerId
                ) {
                  return Option.none()
                }
                const nextDrag = moveDragOf(state.drag, message, context)
                return nextDrag.isActivated
                  ? Option.some(nextDrag)
                  : Option.none()
              },
              'Dragging',
              ({ state, message, guardValue, context }) =>
                Dragging({
                  itemId: state.itemId,
                  sourceContainerId: state.sourceContainerId,
                  sourceIndex: state.sourceIndex,
                  maybeDropTarget: filterEnabledDropTarget(
                    message.maybeDropTarget,
                    context,
                  ),
                  hasMoved: false,
                  drag: guardValue,
                }),
            ),
            when(
              (state, message, context) => {
                if (
                  !canInteract(context) ||
                  message.pointerId !== state.drag.pointerId
                ) {
                  return Option.none()
                }
                const nextDrag = moveDragOf(state.drag, message, context)
                return !nextDrag.isActivated
                  ? Option.some(nextDrag)
                  : Option.none()
              },
              'Pending',
              ({ state, guardValue }) =>
                Pending({
                  itemId: state.itemId,
                  sourceContainerId: state.sourceContainerId,
                  sourceIndex: state.sourceIndex,
                  drag: guardValue,
                }),
            ),
            ignore(),
          ],
          ReleasePointerDrag: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state, message, context }) =>
                Idle({
                  maybeLastOutcome: Option.none(),
                  drag: endDragOf(state.drag, message.pointerId, context),
                }),
            ),
            ignore(),
          ],
          CancelPointerDrag: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state, message, context }) =>
                Idle({
                  maybeLastOutcome: Option.none(),
                  drag: cancelDragOf(state.drag, message.pointerId, context),
                }),
            ),
            ignore(),
          ],
          PressedDragKey: [
            when(
              (_state, message) => isCancelKey(message.key),
              'Idle',
              ({ state, context }) =>
                Idle({
                  maybeLastOutcome: Option.none(),
                  drag: cancelDragOf(state.drag, undefined, context),
                }),
            ),
            ignore(),
          ],
        },
      },
      Dragging: {
        on: {
          LiftItem: [ignore()],
          MoveDraggedItem: [ignore()],
          DropItem: to('Idle', ({ state, context }) =>
            dropFromDragging(state, undefined, context),
          ),
          CancelDrag: to('Idle', ({ state, context }) =>
            cancelFromDragging(state, undefined, context),
          ),
          BeginPointerDrag: [ignore()],
          MovePointerDrag: [
            when(
              (state, message, context) =>
                canInteract(context) &&
                message.pointerId === state.drag.pointerId,
              'Dragging',
              ({ state, message, context }) => {
                const nextDrag = moveDragOf(state.drag, message, context)
                const nextDropTarget = filterEnabledDropTarget(
                  message.maybeDropTarget,
                  context,
                )
                const targetChanged = !isSameOptionDropTarget(
                  state.maybeDropTarget,
                  nextDropTarget,
                )
                return Dragging({
                  itemId: state.itemId,
                  sourceContainerId: state.sourceContainerId,
                  sourceIndex: state.sourceIndex,
                  maybeDropTarget: nextDropTarget,
                  hasMoved:
                    state.hasMoved ||
                    (Option.isSome(nextDropTarget) && targetChanged),
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          ReleasePointerDrag: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state, message, context }) =>
                dropFromDragging(state, message.pointerId, context),
            ),
            ignore(),
          ],
          CancelPointerDrag: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state, message, context }) =>
                cancelFromDragging(state, message.pointerId, context),
            ),
            ignore(),
          ],
          PressedDragKey: [
            when(
              (_state, message) => isCancelKey(message.key),
              'Idle',
              ({ state, context }) =>
                cancelFromDragging(state, undefined, context),
            ),
            ignore(),
          ],
        },
      },
      KeyboardDragging: {
        on: {
          LiftItem: [ignore()],
          MoveDraggedItem: [
            when(
              (_state, _message, context) => canInteract(context),
              'KeyboardDragging',
              ({ state, message, context }) =>
                stepKeyboardMove(state, message.direction, context),
            ),
            ignore(),
          ],
          DropItem: to('Idle', ({ state }) => dropFromKeyboard(state)),
          CancelDrag: to('Idle', ({ state }) => cancelFromKeyboard(state)),
          BeginPointerDrag: [ignore()],
          MovePointerDrag: [ignore()],
          ReleasePointerDrag: [ignore()],
          CancelPointerDrag: [ignore()],
          PressedDragKey: [
            when(
              (_state, message) => isCancelKey(message.key),
              'Idle',
              ({ state }) => cancelFromKeyboard(state),
            ),
            when(
              (_state, message) => isActivationKey(message.key),
              'Idle',
              ({ state }) => dropFromKeyboard(state),
            ),
            when(
              (_state, message, context) =>
                canInteract(context)
                  ? keyToMoveDirection(message.key, {
                      ...(message.isShift === undefined
                        ? {}
                        : { isShift: message.isShift }),
                    })
                  : Option.none(),
              'KeyboardDragging',
              ({ state, guardValue, context }) =>
                stepKeyboardMove(state, guardValue, context),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** The default DragAndDrop Machine chart starting in `Idle`. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the DragAndDrop sync table using `Pace.Sampled({ everyMs })` on
 * `MovePointerDrag` (50 ms default) and `Pace.Synced()` on lift, keyboard
 * moves, drops, and cancels.
 *
 * @example
 * ```typescript
 * syncOf(50).MovePointerDrag // Sampled({ everyMs: 50 })
 * syncOf(50).DropItem // Synced()
 * syncOf(50).LiftItem // Synced()
 * ```
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  LiftItem: Synced(),
  MoveDraggedItem: Synced(),
  DropItem: Synced(),
  CancelDrag: Synced(),
  BeginPointerDrag: Synced(),
  MovePointerDrag: Sampled({ everyMs: sampleMs }),
  ReleasePointerDrag: Synced(),
  CancelPointerDrag: Synced(),
  PressedDragKey: Synced(),
})

/** Default synchronization: `MovePointerDrag` uses `Pace.Sampled({ everyMs: 50 })`, all discrete actions use `Pace.Synced()`. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a DragAndDrop interaction kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  LiftItem: Device({ because }),
  MoveDraggedItem: Device({ because }),
  DropItem: Device({ because }),
  CancelDrag: Device({ because }),
  BeginPointerDrag: Device({ because }),
  MovePointerDrag: Device({ because }),
  ReleasePointerDrag: Device({ because }),
  CancelPointerDrag: Device({ because }),
  PressedDragKey: Device({ because }),
})

/** Returns the {@link Sync} pace for one DragAndDrop Message under `sampleMs`. */
export const paceOf = (
  message: Message,
  sampleMs: number = defaultSampleMs,
): Sync => syncOf(sampleMs)[message._tag]

// SLOTS

/**
 * The three painted slots of a DragAndDrop Part:
 * - `Draggable`: an interactive draggable item (`role="button"`, `aria-pressed`, `aria-disabled`, `aria-describedby`, `LiftItem`).
 * - `Droppable`: a droppable container landmark (`role="region"`, `aria-current`, `aria-orientation`).
 * - `LiveRegion`: an assertive live announcement region (`role="status"`, `aria-live="assertive"`, `aria-atomic="true"`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Draggable: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'LiftItem' }],
  },
  Droppable: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  LiveRegion: {
    role: 'Status',
    focus: 'None',
    gestures: [],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Draggable') {
    const itemId = Option.getOrUndefined(maybeChoice)
    const disabled =
      itemId === undefined ? isDisabledOf(props) : isItemDisabled(itemId, props)
    const pressed = itemId !== undefined && isItemDragging(state, itemId)
    const maybeLabel =
      itemId === undefined
        ? Option.none<string>()
        : maybeItemLabelOf(itemId, props)
    return {
      id: draggableId(props.id, itemId),
      isPressed: pressed,
      ...(disabled ? { isDisabled: true } : {}),
      describedBy: props.describedBy ?? liveRegionId(props.id),
      tabIndex: disabled ? -1 : 0,
      ...Option.match(maybeLabel, {
        onNone: () => ({}),
        onSome: label => ({ label }),
      }),
    }
  } else if (slot === 'Droppable') {
    const containerId = Option.getOrUndefined(maybeChoice)
    const disabled =
      containerId === undefined
        ? isDisabledOf(props)
        : isContainerDisabled(containerId, props)
    const current =
      containerId !== undefined && isDropTargetContainer(state, containerId)
    const maybeLabel =
      containerId === undefined
        ? Option.none<string>()
        : maybeContainerLabelOf(containerId, props)
    return {
      id: droppableId(props.id, containerId),
      isCurrent: current,
      orientation: orientationOf(props),
      ...(disabled ? { isDisabled: true } : {}),
      ...Option.match(maybeLabel, {
        onNone: () => ({}),
        onSome: label => ({ label }),
      }),
    }
  } else if (slot === 'LiveRegion') {
    return {
      id: liveRegionId(props.id),
      live: 'Assertive',
      isAtomic: true,
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a DragAndDrop on: cancels any pending or active drag
 * cleanly back to `Idle` with `PointerDrag.Idle()` and clears transient
 * live-region outcomes so a restored session never reopens mid-drag.
 */
export const atRest = (state: State): State =>
  Idle({
    maybeLastOutcome: Option.none(),
    drag: PointerDrag.atRest(state.drag),
  })

// PART

/** Options for customizing a DragAndDrop Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (such as `'OwnView'`) to keep this DragAndDrop device-only. */
  sync?: 'Synced' | DeviceReason
  /** Pointer-move sync sampling interval in milliseconds (`50` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a DragAndDrop {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * `MovePointerDrag` with `Pace.Sampled({ everyMs: sampleMs ?? 50 })`, discrete
 * lifts/moves/drops/cancels with `Pace.Synced()`). Use {@link deviceOnly} for
 * local-only drag interactions.
 *
 * @example
 * ```typescript
 * const BoardDrag = DragAndDrop.make({ name: 'BoardDrag' })
 * const SampledDrag = DragAndDrop.make({ name: 'SampledDrag', sampleMs: 100 })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  return Part.define<State, Message, Props>({
    name: options.name ?? 'DragAndDrop',
    State,
    Message,
    chart,
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? syncOf(sampleMs)
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
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
 * Shorthand for a DragAndDrop Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalDrag = DragAndDrop.deviceOnly({ name: 'LocalDrag' })
 * ```
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

/** The default synced DragAndDrop Part (`name: 'DragAndDrop'`, `category: 'Domain'`, `MovePointerDrag` at `Pace.Sampled({ everyMs: 50 })`). */
export const part: Part.Part<State, Message, Props> = make()

import { Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, when } from '../experimental/machine/machine.js'
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
import type { SlotProps } from './slot.js'

// NOTE: this is the core ImageCropper Part (Widget #46 of 54, Scribe #2685).
// It composes `PointerDrag` (`Pace.Sampled`) into one framework-free Machine
// and Part declaration covering Zag image-cropper: `cropRect` (`x, y, width,
// height`), `viewportSize`, optional `aspectRatio` lock, `minSize`/`maxSize`,
// `zoom` (`minZoom..maxZoom`), `rotation` (`0..360`), `flipHorizontal` /
// `flipVertical`, pure 8-handle resize and pan clamping within image bounds,
// keyboard arrow nudging (with Shift for larger steps and Alt for resizing),
// and `normalizedCropOf` (`0..1` ratios). Its state (`Idle` | `DraggingCrop` |
// `ResizingCrop`) lives in the Model, synced by default (`Domain` category,
// `Pace.Sampled` on live crop drag and handle resize moves) with
// `ImageCropper.make` and `ImageCropper.deviceOnly()`, and projects
// reference-stable SlotBindings (`Root`, `Viewport`, `Selection`, `Handle`,
// `ZoomControl`).

// CONSTANTS

/** Default minimum crop selection dimensions (`{ width: 40, height: 40 }`, matching Zag ImageCropper). */
export const defaultMinSize: Readonly<{ width: number; height: number }> = {
  width: 40,
  height: 40,
}

/** Default minimum magnification factor (`1`). */
export const defaultMinZoom = 1

/** Default maximum magnification factor (`5`). */
export const defaultMaxZoom = 5

/** Default incremental zoom adjustment step (`0.1`). */
export const defaultZoomStep = 0.1

/** Default keyboard arrow nudge step in pixels (`1`). */
export const defaultNudgeStepPx = 1

/** Default Shift + Arrow keyboard nudge step in pixels (`10`). */
export const defaultNudgeStepShiftPx = 10

/** Default viewport fill fraction used when computing a fresh centered crop (`0.8`). */
export const defaultViewportFill = 0.8

/** Maximum rotation angle in degrees (`360`). */
export const maxRotationDeg = 360

/** Default pointer-move sync sampling window in milliseconds (`50`). */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

/** Default accessible label for the ImageCropper root container. */
export const defaultLabel = 'Image cropper'

// SCHEMAS

/** Crop selection rectangle inside the image viewport coordinate space. */
export const CropRect = S.Struct({
  x: S.Number,
  y: S.Number,
  width: S.Number,
  height: S.Number,
})
/** Crop selection rectangle inside the image viewport coordinate space. */
export type CropRect = typeof CropRect.Type

/** Width and height dimensions of the crop viewport or size bounds. */
export const ViewportSize = S.Struct({
  width: S.Number,
  height: S.Number,
})
/** Width and height dimensions of the crop viewport or size bounds. */
export type ViewportSize = typeof ViewportSize.Type

/** Crop rectangle expressed as `[0, 1]` ratios relative to `viewportSize`. */
export const NormalizedCrop = S.Struct({
  x: S.Number,
  y: S.Number,
  width: S.Number,
  height: S.Number,
})
/** Crop rectangle expressed as `[0, 1]` ratios relative to `viewportSize`. */
export type NormalizedCrop = typeof NormalizedCrop.Type

/** One of the eight edge or corner resize handles on the crop selection box. */
export const HandlePosition = S.Literals([
  'N',
  'S',
  'E',
  'W',
  'NE',
  'NW',
  'SE',
  'SW',
])
/** One of the eight edge or corner resize handles on the crop selection box. */
export type HandlePosition = typeof HandlePosition.Type

/** All eight crop resize handle positions. */
export const allHandles: ReadonlyArray<HandlePosition> = HandlePosition.literals

/** Shape of the crop selection mask (`'Rectangle'` or `'Circle'`). */
export const CropShape = S.Literals(['Rectangle', 'Circle'])
/** Shape of the crop selection mask. */
export type CropShape = typeof CropShape.Type

/**
 * Read-only configuration supplied to the ImageCropper chart and projection
 * from the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  viewportSize: ViewportSize,
  aspectRatio: S.optionalKey(S.Number),
  cropShape: S.optionalKey(CropShape),
  minSize: S.optionalKey(ViewportSize),
  maxSize: S.optionalKey(ViewportSize),
  minZoom: S.optionalKey(S.Number),
  maxZoom: S.optionalKey(S.Number),
  zoomStep: S.optionalKey(S.Number),
  nudgeStepPx: S.optionalKey(S.Number),
  nudgeStepShiftPx: S.optionalKey(S.Number),
  isFixedCropArea: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  sampleMs: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the ImageCropper chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The cropper is resting with its committed `cropRect`, `zoom`, `rotation`, and flip flags. */
export const Idle = ts('Idle', {
  cropRect: CropRect,
  zoom: S.Number,
  rotation: S.Number,
  flipHorizontal: S.Boolean,
  flipVertical: S.Boolean,
})
/** The cropper is resting. */
export type Idle = typeof Idle.Type

/** The crop selection box is actively being dragged to a new position within the viewport. */
export const DraggingCrop = ts('DraggingCrop', {
  cropRect: CropRect,
  zoom: S.Number,
  rotation: S.Number,
  flipHorizontal: S.Boolean,
  flipVertical: S.Boolean,
  originCropRect: CropRect,
  drag: PointerDrag.Dragging,
})
/** The crop selection box is actively being dragged. */
export type DraggingCrop = typeof DraggingCrop.Type

/** One of the eight handles on the crop selection box is actively being dragged to resize it. */
export const ResizingCrop = ts('ResizingCrop', {
  cropRect: CropRect,
  zoom: S.Number,
  rotation: S.Number,
  flipHorizontal: S.Boolean,
  flipVertical: S.Boolean,
  handle: HandlePosition,
  originCropRect: CropRect,
  drag: PointerDrag.Dragging,
})
/** One of the eight handles is actively resizing the crop selection. */
export type ResizingCrop = typeof ResizingCrop.Type

/** Where an ImageCropper Part stands: `Idle`, `DraggingCrop`, or `ResizingCrop`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, DraggingCrop, ResizingCrop])
/** Where an ImageCropper Part stands. */
export type State = typeof State.Type

/** Default initial ImageCropper state: idle with a 100x100 selection at `(0, 0)`, 1x zoom, 0° rotation, unflipped. */
export const initial: State = Idle({
  cropRect: { x: 0, y: 0, width: 100, height: 100 },
  zoom: defaultMinZoom,
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
})

// ACTIONS

const chooseZoom: Readonly<{
  field: 'zoom'
  noun: string
  prompt: string
  token: typeof S.FiniteFromString
  choicesOf: () => ReadonlyArray<never>
  accepts: () => ReturnType<typeof Catalog.Enabled>
  nothingToChoose: string
}> = {
  field: 'zoom',
  noun: 'zoom level',
  prompt: 'Set magnification to which factor?',
  token: S.FiniteFromString,
  choicesOf: () => [],
  accepts: () => Catalog.Enabled(),
  nothingToChoose: 'Enter a magnification factor',
}

const chooseRotation: Readonly<{
  field: 'rotation'
  noun: string
  prompt: string
  token: typeof S.FiniteFromString
  choicesOf: () => ReadonlyArray<never>
  accepts: () => ReturnType<typeof Catalog.Enabled>
  nothingToChoose: string
}> = {
  field: 'rotation',
  noun: 'rotation angle',
  prompt: 'Rotate the image to how many degrees?',
  token: S.FiniteFromString,
  choicesOf: () => [],
  accepts: () => Catalog.Enabled(),
  nothingToChoose: 'Enter an angle from 0 to 360',
}

/** Sets the crop selection rectangle, constrained to viewport, min/max size, and aspect ratio. */
export const SetCropRect = Catalog.action('SetCropRect', {
  fields: {
    x: S.Number,
    y: S.Number,
    width: S.Number,
    height: S.Number,
  },
  what: 'Sets the crop selection rectangle',
  why: 'To frame an exact region of the image',
  meta: { label: 'Set crop', keys: [] },
})

/** Sets the image zoom factor clamped within `[minZoom, maxZoom]`. */
export const SetCropZoom = Catalog.action('SetCropZoom', {
  fields: { zoom: S.Number },
  choose: chooseZoom,
  what: 'Sets the image magnification level',
  why: 'To inspect details closely or see more of the frame',
  meta: { label: 'Set zoom', keys: [] },
})

/** Increases the image zoom factor by one `zoomStep`. */
export const ZoomInCrop = Catalog.action('ZoomInCrop', {
  what: 'Increases the image magnification by one step',
  why: 'To examine finer details within the frame',
  meta: { label: 'Zoom in', keys: [] },
})

/** Decreases the image zoom factor by one `zoomStep`. */
export const ZoomOutCrop = Catalog.action('ZoomOutCrop', {
  what: 'Decreases the image magnification by one step',
  why: 'To bring more of the picture into view',
  meta: { label: 'Zoom out', keys: [] },
})

/** Sets the image rotation in degrees clamped to `[0, 360]`. */
export const SetCropRotation = Catalog.action('SetCropRotation', {
  fields: { rotation: S.Number },
  choose: chooseRotation,
  what: 'Sets the image rotation angle in degrees',
  why: 'To straighten or orient the picture',
  meta: { label: 'Set rotation', keys: [] },
})

/** Toggles horizontal mirroring of the image. */
export const FlipCropHorizontal = Catalog.action('FlipCropHorizontal', {
  what: 'Mirrors the image horizontally',
  why: 'To reverse its left and right orientation',
  meta: { label: 'Flip horizontal', keys: [] },
})

/** Toggles vertical mirroring of the image. */
export const FlipCropVertical = Catalog.action('FlipCropVertical', {
  what: 'Mirrors the image vertically',
  why: 'To invert its top and bottom orientation',
  meta: { label: 'Flip vertical', keys: [] },
})

/** Resets crop bounds, zoom, rotation, and flip flags to defaults for the current viewport. */
export const ResetCrop = Catalog.action('ResetCrop', {
  what: 'Restores crop bounds, zoom, rotation, and flip defaults',
  why: 'To start framing the picture again cleanly',
  meta: { label: 'Reset crop', keys: [] },
})

/** The Catalog Actions an ImageCropper Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SetCropRect,
  SetCropZoom,
  ZoomInCrop,
  ZoomOutCrop,
  SetCropRotation,
  FlipCropHorizontal,
  FlipCropVertical,
  ResetCrop,
]

// MESSAGES

/** Begins a pointer drag to pan the crop selection box within the viewport. */
export const BeginCropDrag = m('BeginCropDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/** Updates the active crop selection drag position. Synced via `Pace.Sampled`. */
export const MoveCropDrag = m('MoveCropDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/** Commits the active crop selection drag and settles into `Idle`. */
export const EndCropDrag = m('EndCropDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** Cancels the active crop selection drag and restores `originCropRect`. */
export const CancelCropDrag = m('CancelCropDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** Begins resizing the crop selection box by dragging one of its 8 handles. */
export const BeginCropResize = m('BeginCropResize', {
  pointerId: S.Number,
  handle: HandlePosition,
  x: S.Number,
  y: S.Number,
})

/** Updates the active crop handle resize gesture. Synced via `Pace.Sampled`. */
export const MoveCropResize = m('MoveCropResize', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  shiftKey: S.optionalKey(S.Boolean),
})

/** Commits the active crop handle resize and settles into `Idle`. */
export const EndCropResize = m('EndCropResize', {
  pointerId: S.optionalKey(S.Number),
})

/** Cancels the active crop handle resize and restores `originCropRect`. */
export const CancelCropResize = m('CancelCropResize', {
  pointerId: S.optionalKey(S.Number),
})

/** A keyboard key was pressed on the crop selection (`ArrowLeft/Right/Up/Down`, `+`/`-`, `Escape`). */
export const PressedCropKey = m('PressedCropKey', {
  key: S.String,
  shiftKey: S.optionalKey(S.Boolean),
  altKey: S.optionalKey(S.Boolean),
})

/** Every Message the ImageCropper chart handles. */
export const Message = S.Union([
  SetCropRect,
  SetCropZoom,
  ZoomInCrop,
  ZoomOutCrop,
  SetCropRotation,
  FlipCropHorizontal,
  FlipCropVertical,
  ResetCrop,
  BeginCropDrag,
  MoveCropDrag,
  EndCropDrag,
  CancelCropDrag,
  BeginCropResize,
  MoveCropResize,
  EndCropResize,
  CancelCropResize,
  PressedCropKey,
])
/** Every Message the ImageCropper chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the ImageCropper Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the root image-cropper container element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the viewport element id from a base `id`. */
export const viewportId = (id: string): string => `${id}-viewport`

/** Derives the draggable crop selection box element id from a base `id`. */
export const selectionId = (id: string): string => `${id}-selection`

/** Derives one resize handle element id from a base `id` and `handle`. */
export const handleId = (id: string, handle: HandlePosition): string =>
  `${id}-handle-${handle.toLowerCase()}`

/** Derives the zoom control element id from a base `id`. */
export const zoomControlId = (id: string): string => `${id}-zoom`

// PURE RULES & CONFIGURATION READERS

/** Resolved crop shape (`'Rectangle'` by default). */
export const cropShapeOf = (props: Pick<Props, 'cropShape'> = {}): CropShape =>
  props.cropShape ?? 'Rectangle'

/**
 * Resolved optional positive aspect ratio (`width / height`). Forces `1` when
 * `cropShape` is `'Circle'`.
 */
export const aspectRatioOf = (
  props: Pick<Props, 'aspectRatio' | 'cropShape'> = {},
): Option.Option<number> => {
  if (cropShapeOf(props) === 'Circle') {
    return Option.some(1)
  } else if (
    props.aspectRatio !== undefined &&
    Number.isFinite(props.aspectRatio) &&
    props.aspectRatio > 0
  ) {
    return Option.some(props.aspectRatio)
  } else {
    return Option.none()
  }
}

/** Resolved minimum crop size clamped against `viewportSize`. */
export const minSizeOf = (
  props: Pick<Props, 'viewportSize' | 'minSize'>,
): ViewportSize => ({
  width: Math.min(
    Math.max(0, props.viewportSize.width),
    Math.max(1, props.minSize?.width ?? defaultMinSize.width),
  ),
  height: Math.min(
    Math.max(0, props.viewportSize.height),
    Math.max(1, props.minSize?.height ?? defaultMinSize.height),
  ),
})

/** Resolved maximum crop size clamped against `viewportSize` and `minSize`. */
export const maxSizeOf = (
  props: Pick<Props, 'viewportSize' | 'minSize' | 'maxSize'>,
): ViewportSize => {
  const min = minSizeOf(props)
  const vpW = Math.max(0, props.viewportSize.width)
  const vpH = Math.max(0, props.viewportSize.height)
  const rawMaxW = props.maxSize?.width ?? vpW
  const rawMaxH = props.maxSize?.height ?? vpH
  const safeMaxW = Number.isFinite(rawMaxW) ? Math.min(rawMaxW, vpW) : vpW
  const safeMaxH = Number.isFinite(rawMaxH) ? Math.min(rawMaxH, vpH) : vpH
  return {
    width: Math.max(min.width, safeMaxW),
    height: Math.max(min.height, safeMaxH),
  }
}

/** Resolved minimum zoom factor (`1` by default, clamped positive). */
export const minZoomOf = (props: Pick<Props, 'minZoom'> = {}): number => {
  const raw = props.minZoom ?? defaultMinZoom
  return Number.isFinite(raw) && raw > 0 ? raw : defaultMinZoom
}

/** Resolved maximum zoom factor (`5` by default, never below `minZoom`). */
export const maxZoomOf = (
  props: Pick<Props, 'minZoom' | 'maxZoom'> = {},
): number => {
  const low = minZoomOf(props)
  const raw = props.maxZoom ?? defaultMaxZoom
  return Number.isFinite(raw)
    ? Math.max(low, raw)
    : Math.max(low, defaultMaxZoom)
}

/** Resolved zoom step increment (`0.1` by default, clamped positive). */
export const zoomStepOf = (props: Pick<Props, 'zoomStep'> = {}): number => {
  const raw = props.zoomStep ?? defaultZoomStep
  return Number.isFinite(raw) && raw > 0 ? raw : defaultZoomStep
}

/** Resolved base keyboard arrow nudge distance in pixels (`1` by default). */
export const nudgeStepPxOf = (
  props: Pick<Props, 'nudgeStepPx'> = {},
): number => {
  const raw = props.nudgeStepPx ?? defaultNudgeStepPx
  return Number.isFinite(raw) && raw > 0 ? raw : defaultNudgeStepPx
}

/** Resolved Shift + Arrow keyboard nudge distance in pixels (`10` by default). */
export const nudgeStepShiftPxOf = (
  props: Pick<Props, 'nudgeStepShiftPx'> = {},
): number => {
  const raw = props.nudgeStepShiftPx ?? defaultNudgeStepShiftPx
  return Number.isFinite(raw) && raw > 0 ? raw : defaultNudgeStepShiftPx
}

/** True when the crop selection area cannot be dragged or resized (`false` by default). */
export const isFixedCropAreaOf = (
  props: Pick<Props, 'isFixedCropArea'> = {},
): boolean => props.isFixedCropArea === true

/** True when all cropper interactions are disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** Resolved pointer-move sync sampling window in milliseconds (`50` by default). */
export const sampleMsOf = (props: Pick<Props, 'sampleMs'> = {}): number =>
  props.sampleMs ?? defaultSampleMs

/** Resolved accessible label for the root container (`'Image cropper'` by default). */
export const labelOf = (props: Pick<Props, 'label'> = {}): string =>
  props.label ?? defaultLabel

/** Projects `ImageCropper.Props` onto the underlying {@link PointerDrag.Props}. */
export const dragPropsOf = (
  props: Pick<Props, 'isDisabled' | 'sampleMs'> = {},
): PointerDrag.Props => ({
  axis: 'Both',
  isDisabled: isDisabledOf(props),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

// PURE GEOMETRY, RESIZE, CLAMPING & NORMALIZATION

const isLeftHandle = (handle: HandlePosition): boolean =>
  handle === 'W' || handle === 'NW' || handle === 'SW'

const isRightHandle = (handle: HandlePosition): boolean =>
  handle === 'E' || handle === 'NE' || handle === 'SE'

const isTopHandle = (handle: HandlePosition): boolean =>
  handle === 'N' || handle === 'NW' || handle === 'NE'

const isBottomHandle = (handle: HandlePosition): boolean =>
  handle === 'S' || handle === 'SW' || handle === 'SE'

const isCornerHandle = (handle: HandlePosition): boolean =>
  (isLeftHandle(handle) || isRightHandle(handle)) &&
  (isTopHandle(handle) || isBottomHandle(handle))

const isHorizontalEdgeHandle = (handle: HandlePosition): boolean =>
  (isLeftHandle(handle) || isRightHandle(handle)) &&
  !(isTopHandle(handle) || isBottomHandle(handle))

/** Clamps a magnification value into `[minZoom, maxZoom]` without floating-point drift. */
export const clampZoom = (
  zoom: number,
  props: Pick<Props, 'minZoom' | 'maxZoom' | 'zoomStep'> = {},
): number => {
  const clamped = PointerDrag.clampValue(
    zoom,
    minZoomOf(props),
    maxZoomOf(props),
  )
  return PointerDrag.roundToStepPrecision(clamped, zoomStepOf(props))
}

/** Clamps a rotation angle in degrees into `[0, 360]`. */
export const clampRotation = (rotation: number): number =>
  Number.isFinite(rotation)
    ? PointerDrag.clampValue(rotation, 0, maxRotationDeg)
    : 0

/**
 * Pure translation of `originCropRect` by `delta`, clamped inside
 * `[0, viewportSize.width - width]` x `[0, viewportSize.height - height]`.
 */
export const moveCropRect = (
  originCropRect: CropRect,
  delta: PointerDrag.Delta,
  props: Pick<Props, 'viewportSize'>,
): CropRect => {
  const maxX = Math.max(0, props.viewportSize.width - originCropRect.width)
  const maxY = Math.max(0, props.viewportSize.height - originCropRect.height)
  return {
    x: PointerDrag.clampValue(originCropRect.x + delta.dx, 0, maxX),
    y: PointerDrag.clampValue(originCropRect.y + delta.dy, 0, maxY),
    width: originCropRect.width,
    height: originCropRect.height,
  }
}

type AspectBounds = Readonly<{
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}>

const aspectBoundsOf = (
  min: ViewportSize,
  max: ViewportSize,
  viewport: ViewportSize,
  ratio: number,
): AspectBounds => {
  const rawMinWidth = Math.max(min.width, min.height * ratio)
  const minWidth = Math.min(
    rawMinWidth,
    viewport.width,
    viewport.height * ratio,
  )
  const minHeight = minWidth / ratio

  const rawMaxWidth = Math.min(max.width, max.height * ratio, viewport.width)
  const rawMaxHeight = rawMaxWidth / ratio
  if (rawMaxHeight > max.height || rawMaxHeight > viewport.height) {
    const cappedHeight = Math.min(max.height, viewport.height)
    const cappedWidth = Math.min(cappedHeight * ratio, viewport.width)
    return {
      minWidth,
      minHeight,
      maxWidth: Math.max(minWidth, cappedWidth),
      maxHeight: Math.max(minHeight, cappedWidth / ratio),
    }
  } else {
    return {
      minWidth,
      minHeight,
      maxWidth: Math.max(minWidth, rawMaxWidth),
      maxHeight: Math.max(minHeight, rawMaxHeight),
    }
  }
}

/**
 * Pure 8-handle resize math for `ImageCropper`. Moves the selected edge or
 * corner of `originCropRect` by `delta`, anchors the opposite edge or corner,
 * enforces `minSize`, `maxSize`, and `viewportSize`, and locks `aspectRatio`
 * when configured (or when `lockCurrentAspectRatio` is requested via Shift).
 *
 * @example
 * ```typescript
 * resizeCropRect(
 *   { x: 50, y: 50, width: 100, height: 100 },
 *   'SE',
 *   { dx: 40, dy: 20 },
 *   { viewportSize: { width: 400, height: 300 }, aspectRatio: 1 },
 * ) // { x: 50, y: 50, width: 120, height: 120 }
 * ```
 */
export const resizeCropRect = (
  originCropRect: CropRect,
  handle: HandlePosition,
  delta: PointerDrag.Delta,
  props: Pick<
    Props,
    'viewportSize' | 'minSize' | 'maxSize' | 'aspectRatio' | 'cropShape'
  >,
  options: Readonly<{ lockCurrentAspectRatio?: boolean }> = {},
): CropRect => {
  const viewport = props.viewportSize
  if (viewport.width <= 0 || viewport.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const min = minSizeOf(props)
  const max = maxSizeOf(props)
  const originLeft = originCropRect.x
  const originTop = originCropRect.y
  const originRight = originCropRect.x + originCropRect.width
  const originBottom = originCropRect.y + originCropRect.height

  const isLeft = isLeftHandle(handle)
  const isRight = isRightHandle(handle)
  const isTop = isTopHandle(handle)
  const isBottom = isBottomHandle(handle)

  const leftAfterDelta = isLeft
    ? PointerDrag.clampValue(
        originLeft + delta.dx,
        Math.max(0, originRight - max.width),
        originRight - min.width,
      )
    : originLeft
  const rightAfterDelta = isRight
    ? PointerDrag.clampValue(
        originRight + delta.dx,
        originLeft + min.width,
        Math.min(viewport.width, originLeft + max.width),
      )
    : originRight
  const topAfterDelta = isTop
    ? PointerDrag.clampValue(
        originTop + delta.dy,
        Math.max(0, originBottom - max.height),
        originBottom - min.height,
      )
    : originTop
  const bottomAfterDelta = isBottom
    ? PointerDrag.clampValue(
        originBottom + delta.dy,
        originTop + min.height,
        Math.min(viewport.height, originTop + max.height),
      )
    : originBottom

  const maybeRatio = Option.orElse(aspectRatioOf(props), () =>
    options.lockCurrentAspectRatio === true &&
    originCropRect.width > 0 &&
    originCropRect.height > 0
      ? Option.some(originCropRect.width / originCropRect.height)
      : Option.none(),
  )

  return Option.match(maybeRatio, {
    onNone: () => {
      const clampedLeft = PointerDrag.clampValue(
        leftAfterDelta,
        0,
        Math.max(0, viewport.width - min.width),
      )
      const clampedTop = PointerDrag.clampValue(
        topAfterDelta,
        0,
        Math.max(0, viewport.height - min.height),
      )
      const clampedRight = PointerDrag.clampValue(
        rightAfterDelta,
        clampedLeft + min.width,
        Math.min(viewport.width, clampedLeft + max.width),
      )
      const clampedBottom = PointerDrag.clampValue(
        bottomAfterDelta,
        clampedTop + min.height,
        Math.min(viewport.height, clampedTop + max.height),
      )
      return {
        x: clampedLeft,
        y: clampedTop,
        width: clampedRight - clampedLeft,
        height: clampedBottom - clampedTop,
      }
    },
    onSome: ratio => {
      const bounds = aspectBoundsOf(min, max, viewport, ratio)

      if (isCornerHandle(handle)) {
        const availWidth = isRight ? viewport.width - originLeft : originRight
        const availHeight = isBottom
          ? viewport.height - originTop
          : originBottom
        const cornerMaxW = Math.min(
          bounds.maxWidth,
          availWidth,
          availHeight * ratio,
        )
        const cornerMinW = Math.min(bounds.minWidth, cornerMaxW)

        const rawW = rightAfterDelta - leftAfterDelta
        const rawH = bottomAfterDelta - topAfterDelta
        const chosenW = rawW / ratio <= rawH ? rawW : rawH * ratio
        const finalW = PointerDrag.clampValue(chosenW, cornerMinW, cornerMaxW)
        const finalH = finalW / ratio

        const x = isLeft ? originRight - finalW : originLeft
        const y = isTop ? originBottom - finalH : originTop
        return {
          x: PointerDrag.clampValue(x, 0, Math.max(0, viewport.width - finalW)),
          y: PointerDrag.clampValue(
            y,
            0,
            Math.max(0, viewport.height - finalH),
          ),
          width: finalW,
          height: finalH,
        }
      } else if (isHorizontalEdgeHandle(handle)) {
        const availWidth = isRight ? viewport.width - originLeft : originRight
        const edgeMaxW = Math.min(bounds.maxWidth, availWidth)
        const edgeMinW = Math.min(bounds.minWidth, edgeMaxW)
        const finalW = PointerDrag.clampValue(
          rightAfterDelta - leftAfterDelta,
          edgeMinW,
          edgeMaxW,
        )
        const finalH = finalW / ratio
        const centerY = (originTop + originBottom) / 2
        const rawY = centerY - finalH / 2
        const y = PointerDrag.clampValue(
          rawY,
          0,
          Math.max(0, viewport.height - finalH),
        )
        const x = isLeft ? originRight - finalW : originLeft
        return {
          x: PointerDrag.clampValue(x, 0, Math.max(0, viewport.width - finalW)),
          y,
          width: finalW,
          height: finalH,
        }
      } else {
        const availHeight = isBottom
          ? viewport.height - originTop
          : originBottom
        const edgeMaxH = Math.min(bounds.maxHeight, availHeight)
        const edgeMinH = Math.min(bounds.minHeight, edgeMaxH)
        const finalH = PointerDrag.clampValue(
          bottomAfterDelta - topAfterDelta,
          edgeMinH,
          edgeMaxH,
        )
        const finalW = finalH * ratio
        const centerX = (originLeft + originRight) / 2
        const rawX = centerX - finalW / 2
        const x = PointerDrag.clampValue(
          rawX,
          0,
          Math.max(0, viewport.width - finalW),
        )
        const y = isTop ? originBottom - finalH : originTop
        return {
          x,
          y: PointerDrag.clampValue(
            y,
            0,
            Math.max(0, viewport.height - finalH),
          ),
          width: finalW,
          height: finalH,
        }
      }
    },
  })
}

/** Constrains a candidate `cropRect` to `viewportSize`, `minSize`/`maxSize`, and `aspectRatio`. */
export const constrainCropRect = (
  cropRect: CropRect,
  props: Pick<
    Props,
    'viewportSize' | 'minSize' | 'maxSize' | 'aspectRatio' | 'cropShape'
  >,
): CropRect => {
  const sized = resizeCropRect(
    {
      x: 0,
      y: 0,
      width: Math.max(0, cropRect.width),
      height: Math.max(0, cropRect.height),
    },
    'SE',
    { dx: 0, dy: 0 },
    props,
  )
  const maxX = Math.max(0, props.viewportSize.width - sized.width)
  const maxY = Math.max(0, props.viewportSize.height - sized.height)
  return {
    x: PointerDrag.clampValue(cropRect.x, 0, maxX),
    y: PointerDrag.clampValue(cropRect.y, 0, maxY),
    width: sized.width,
    height: sized.height,
  }
}

/** Computes a centered default crop rectangle covering 80% of `viewportSize`, respecting `aspectRatio` and limits. */
export const defaultCropRectOf = (
  props: Pick<
    Props,
    'viewportSize' | 'minSize' | 'maxSize' | 'aspectRatio' | 'cropShape'
  >,
): CropRect => {
  const vpW = Math.max(0, props.viewportSize.width)
  const vpH = Math.max(0, props.viewportSize.height)
  const targetW = vpW * defaultViewportFill
  const targetH = vpH * defaultViewportFill
  const rawSize = Option.match(aspectRatioOf(props), {
    onNone: () => ({ width: targetW, height: targetH }),
    onSome: ratio => {
      const targetAspect = targetH > 0 ? targetW / targetH : ratio
      if (ratio > targetAspect) {
        return { width: targetW, height: targetW / ratio }
      } else {
        return { width: targetH * ratio, height: targetH }
      }
    },
  })
  const sized = resizeCropRect(
    { x: 0, y: 0, width: rawSize.width, height: rawSize.height },
    'SE',
    { dx: 0, dy: 0 },
    props,
  )
  return {
    x: Math.max(0, (vpW - sized.width) / 2),
    y: Math.max(0, (vpH - sized.height) / 2),
    width: sized.width,
    height: sized.height,
  }
}

/** Builds an initial idle `ImageCropper.State` centered inside `props.viewportSize`. */
export const initialFor = (
  props: Pick<
    Props,
    | 'viewportSize'
    | 'minSize'
    | 'maxSize'
    | 'aspectRatio'
    | 'cropShape'
    | 'minZoom'
  >,
): State =>
  Idle({
    cropRect: defaultCropRectOf(props),
    zoom: minZoomOf(props),
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
  })

/**
 * Projects `state.cropRect` into normalized `[0, 1]` ratios relative to
 * `props.viewportSize`.
 *
 * @example
 * ```typescript
 * normalizedCropOf(
 *   Idle({ cropRect: { x: 100, y: 75, width: 200, height: 150 }, zoom: 1, rotation: 0, flipHorizontal: false, flipVertical: false }),
 *   { viewportSize: { width: 400, height: 300 } },
 * ) // { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
 * ```
 */
export const normalizedCropOf = (
  state: State,
  props: Pick<Props, 'viewportSize'>,
): NormalizedCrop => {
  const vpW = props.viewportSize.width
  const vpH = props.viewportSize.height
  if (vpW <= 0 || vpH <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  } else {
    return {
      x: PointerDrag.clampValue(state.cropRect.x / vpW, 0, 1),
      y: PointerDrag.clampValue(state.cropRect.y / vpH, 0, 1),
      width: PointerDrag.clampValue(state.cropRect.width / vpW, 0, 1),
      height: PointerDrag.clampValue(state.cropRect.height / vpH, 0, 1),
    }
  }
}

// READINGS

/** True while resting in `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True while dragging the crop selection rectangle. */
export const isDraggingCrop = (state: State): boolean =>
  state._tag === 'DraggingCrop'

/** True while resizing the crop selection via a handle. */
export const isResizingCrop = (state: State): boolean =>
  state._tag === 'ResizingCrop'

/** Current crop rectangle. */
export const cropRectOf = (state: State): CropRect => state.cropRect

/** Current magnification factor. */
export const zoomOf = (state: State): number => state.zoom

/** Current rotation angle in degrees (`0..360`). */
export const rotationOf = (state: State): number => state.rotation

/** Current active resize handle while `ResizingCrop`, or none. */
export const activeHandleOf = (state: State): Option.Option<HandlePosition> =>
  state._tag === 'ResizingCrop' ? Option.some(state.handle) : Option.none()

/** True when crop bounds can be dragged or resized (not disabled and not fixed crop area). */
export const canEditCrop = (
  props: Pick<Props, 'isDisabled' | 'isFixedCropArea'> = {},
): boolean => !isDisabledOf(props) && !isFixedCropAreaOf(props)

// INTERNAL CHART HELPERS

const startDragOf = (
  pointerId: number,
  x: number,
  y: number,
  props: Props,
): Option.Option<PointerDrag.Dragging> => {
  const [nextDrag] = PointerDrag.chart.transition(
    PointerDrag.Idle(),
    PointerDrag.StartDrag({ pointerId, x, y, originValue: 0 }),
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

const arrowDeltaOf = (
  key: string,
  step: number,
): Option.Option<PointerDrag.Delta> => {
  if (key === 'ArrowLeft') {
    return Option.some({ dx: -step, dy: 0 })
  } else if (key === 'ArrowRight') {
    return Option.some({ dx: step, dy: 0 })
  } else if (key === 'ArrowUp') {
    return Option.some({ dx: 0, dy: -step })
  } else if (key === 'ArrowDown') {
    return Option.some({ dx: 0, dy: step })
  } else {
    return Option.none()
  }
}

const toIdleFrom = (state: State, cropRect: CropRect = state.cropRect): Idle =>
  Idle({
    cropRect,
    zoom: state.zoom,
    rotation: state.rotation,
    flipHorizontal: state.flipHorizontal,
    flipVertical: state.flipVertical,
  })

// CHART

/**
 * The ImageCropper Machine chart: `Idle | DraggingCrop | ResizingCrop`
 * composing `PointerDrag`, with viewport clamping, 8-handle aspect-ratio
 * resize math, zoom/rotation/flip controls, keyboard arrow nudging (Shift for
 * larger steps, Alt for resize), and Escape cancellation.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Idle: {
        on: {
          SetCropRect: [
            when(
              (_state, _message, context) => canEditCrop(context),
              'Idle',
              ({ state, message, context }) =>
                Idle({
                  ...state,
                  cropRect: constrainCropRect(
                    {
                      x: message.x,
                      y: message.y,
                      width: message.width,
                      height: message.height,
                    },
                    context,
                  ),
                }),
            ),
            ignore(),
          ],
          SetCropZoom: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ state, message, context }) =>
                Idle({
                  ...state,
                  zoom: clampZoom(message.zoom, context),
                }),
            ),
            ignore(),
          ],
          ZoomInCrop: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ state, context }) =>
                Idle({
                  ...state,
                  zoom: clampZoom(state.zoom + zoomStepOf(context), context),
                }),
            ),
            ignore(),
          ],
          ZoomOutCrop: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ state, context }) =>
                Idle({
                  ...state,
                  zoom: clampZoom(state.zoom - zoomStepOf(context), context),
                }),
            ),
            ignore(),
          ],
          SetCropRotation: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ state, message }) =>
                Idle({
                  ...state,
                  rotation: clampRotation(message.rotation),
                }),
            ),
            ignore(),
          ],
          FlipCropHorizontal: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ state }) =>
                Idle({
                  ...state,
                  flipHorizontal: !state.flipHorizontal,
                }),
            ),
            ignore(),
          ],
          FlipCropVertical: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ state }) =>
                Idle({
                  ...state,
                  flipVertical: !state.flipVertical,
                }),
            ),
            ignore(),
          ],
          ResetCrop: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ context }) =>
                Idle({
                  cropRect: defaultCropRectOf(context),
                  zoom: minZoomOf(context),
                  rotation: 0,
                  flipHorizontal: false,
                  flipVertical: false,
                }),
            ),
            ignore(),
          ],
          BeginCropDrag: [
            when(
              (_state, message, context) =>
                canEditCrop(context)
                  ? startDragOf(
                      message.pointerId,
                      message.x,
                      message.y,
                      context,
                    )
                  : Option.none(),
              'DraggingCrop',
              ({ state, guardValue, context }) => {
                const constrained = constrainCropRect(state.cropRect, context)
                return DraggingCrop({
                  cropRect: constrained,
                  zoom: state.zoom,
                  rotation: state.rotation,
                  flipHorizontal: state.flipHorizontal,
                  flipVertical: state.flipVertical,
                  originCropRect: constrained,
                  drag: guardValue,
                })
              },
            ),
            ignore(),
          ],
          MoveCropDrag: [ignore()],
          EndCropDrag: [ignore()],
          CancelCropDrag: [ignore()],
          BeginCropResize: [
            when(
              (_state, message, context) =>
                canEditCrop(context)
                  ? startDragOf(
                      message.pointerId,
                      message.x,
                      message.y,
                      context,
                    )
                  : Option.none(),
              'ResizingCrop',
              ({ state, message, guardValue, context }) => {
                const constrained = constrainCropRect(state.cropRect, context)
                return ResizingCrop({
                  cropRect: constrained,
                  zoom: state.zoom,
                  rotation: state.rotation,
                  flipHorizontal: state.flipHorizontal,
                  flipVertical: state.flipVertical,
                  handle: message.handle,
                  originCropRect: constrained,
                  drag: guardValue,
                })
              },
            ),
            ignore(),
          ],
          MoveCropResize: [ignore()],
          EndCropResize: [ignore()],
          CancelCropResize: [ignore()],
          PressedCropKey: [
            when(
              (_state, message, context) =>
                !isDisabledOf(context) &&
                (message.key === '+' || message.key === '='),
              'Idle',
              ({ state, context }) =>
                Idle({
                  ...state,
                  zoom: clampZoom(state.zoom + zoomStepOf(context), context),
                }),
            ),
            when(
              (_state, message, context) =>
                !isDisabledOf(context) &&
                (message.key === '-' || message.key === '_'),
              'Idle',
              ({ state, context }) =>
                Idle({
                  ...state,
                  zoom: clampZoom(state.zoom - zoomStepOf(context), context),
                }),
            ),
            when(
              (_state, message, context) => {
                if (!canEditCrop(context)) {
                  return Option.none()
                }
                const step =
                  message.shiftKey === true
                    ? nudgeStepShiftPxOf(context)
                    : nudgeStepPxOf(context)
                return arrowDeltaOf(message.key, step)
              },
              'Idle',
              ({ state, message, guardValue, context }) => {
                const constrained = constrainCropRect(state.cropRect, context)
                const nextCrop =
                  message.altKey === true
                    ? resizeCropRect(
                        constrained,
                        message.key === 'ArrowUp' || message.key === 'ArrowDown'
                          ? 'S'
                          : 'E',
                        guardValue,
                        context,
                      )
                    : moveCropRect(constrained, guardValue, context)
                return Idle({
                  ...state,
                  cropRect: nextCrop,
                })
              },
            ),
            ignore(),
          ],
        },
      },
      DraggingCrop: {
        on: {
          SetCropRect: [ignore()],
          SetCropZoom: [ignore()],
          ZoomInCrop: [ignore()],
          ZoomOutCrop: [ignore()],
          SetCropRotation: [ignore()],
          FlipCropHorizontal: [ignore()],
          FlipCropVertical: [ignore()],
          ResetCrop: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ context }) =>
                Idle({
                  cropRect: defaultCropRectOf(context),
                  zoom: minZoomOf(context),
                  rotation: 0,
                  flipHorizontal: false,
                  flipVertical: false,
                }),
            ),
            ignore(),
          ],
          BeginCropDrag: [ignore()],
          MoveCropDrag: [
            when(
              (state, message, context) =>
                canEditCrop(context) &&
                message.pointerId === state.drag.pointerId,
              'DraggingCrop',
              ({ state, message, context }) => {
                const nextDrag = moveDragOf(
                  state.drag,
                  message.pointerId,
                  message.x,
                  message.y,
                  context,
                )
                return DraggingCrop({
                  ...state,
                  cropRect: moveCropRect(
                    state.originCropRect,
                    PointerDrag.deltaOf(nextDrag),
                    context,
                  ),
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          EndCropDrag: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state }) => toIdleFrom(state),
            ),
            ignore(),
          ],
          CancelCropDrag: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state }) => toIdleFrom(state, state.originCropRect),
            ),
            ignore(),
          ],
          BeginCropResize: [ignore()],
          MoveCropResize: [ignore()],
          EndCropResize: [ignore()],
          CancelCropResize: [ignore()],
          PressedCropKey: [
            when(
              (_state, message) => PointerDrag.isCancelKey(message.key),
              'Idle',
              ({ state }) => toIdleFrom(state, state.originCropRect),
            ),
            ignore(),
          ],
        },
      },
      ResizingCrop: {
        on: {
          SetCropRect: [ignore()],
          SetCropZoom: [ignore()],
          ZoomInCrop: [ignore()],
          ZoomOutCrop: [ignore()],
          SetCropRotation: [ignore()],
          FlipCropHorizontal: [ignore()],
          FlipCropVertical: [ignore()],
          ResetCrop: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ context }) =>
                Idle({
                  cropRect: defaultCropRectOf(context),
                  zoom: minZoomOf(context),
                  rotation: 0,
                  flipHorizontal: false,
                  flipVertical: false,
                }),
            ),
            ignore(),
          ],
          BeginCropDrag: [ignore()],
          MoveCropDrag: [ignore()],
          EndCropDrag: [ignore()],
          CancelCropDrag: [ignore()],
          BeginCropResize: [ignore()],
          MoveCropResize: [
            when(
              (state, message, context) =>
                canEditCrop(context) &&
                message.pointerId === state.drag.pointerId,
              'ResizingCrop',
              ({ state, message, context }) => {
                const nextDrag = moveDragOf(
                  state.drag,
                  message.pointerId,
                  message.x,
                  message.y,
                  context,
                )
                return ResizingCrop({
                  ...state,
                  cropRect: resizeCropRect(
                    state.originCropRect,
                    state.handle,
                    PointerDrag.deltaOf(nextDrag),
                    context,
                    { lockCurrentAspectRatio: message.shiftKey === true },
                  ),
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          EndCropResize: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state }) => toIdleFrom(state),
            ),
            ignore(),
          ],
          CancelCropResize: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state }) => toIdleFrom(state, state.originCropRect),
            ),
            ignore(),
          ],
          PressedCropKey: [
            when(
              (_state, message) => PointerDrag.isCancelKey(message.key),
              'Idle',
              ({ state }) => toIdleFrom(state, state.originCropRect),
            ),
            ignore(),
          ],
        },
      },
    },
  },
)

// SYNC

/**
 * Builds the ImageCropper sync table using `Pace.Sampled({ everyMs })` on
 * `MoveCropDrag` and `MoveCropResize` (50 ms default) and `Pace.Synced()` on
 * all discrete crop, zoom, rotation, flip, reset, and drag lifecycle Messages.
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetCropRect: Synced(),
  SetCropZoom: Synced(),
  ZoomInCrop: Synced(),
  ZoomOutCrop: Synced(),
  SetCropRotation: Synced(),
  FlipCropHorizontal: Synced(),
  FlipCropVertical: Synced(),
  ResetCrop: Synced(),
  BeginCropDrag: Synced(),
  MoveCropDrag: Sampled({ everyMs: sampleMs }),
  EndCropDrag: Synced(),
  CancelCropDrag: Synced(),
  BeginCropResize: Synced(),
  MoveCropResize: Sampled({ everyMs: sampleMs }),
  EndCropResize: Synced(),
  CancelCropResize: Synced(),
  PressedCropKey: Synced(),
})

/** Default ImageCropper synchronization: live drag and resize moves sampled at 50 ms. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for an ImageCropper kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetCropRect: Device({ because }),
  SetCropZoom: Device({ because }),
  ZoomInCrop: Device({ because }),
  ZoomOutCrop: Device({ because }),
  SetCropRotation: Device({ because }),
  FlipCropHorizontal: Device({ because }),
  FlipCropVertical: Device({ because }),
  ResetCrop: Device({ because }),
  BeginCropDrag: Device({ because }),
  MoveCropDrag: Device({ because }),
  EndCropDrag: Device({ because }),
  CancelCropDrag: Device({ because }),
  BeginCropResize: Device({ because }),
  MoveCropResize: Device({ because }),
  EndCropResize: Device({ because }),
  CancelCropResize: Device({ because }),
  PressedCropKey: Device({ because }),
})

/** Returns the {@link Sync} pace for one ImageCropper Message under `sampleMs`. */
export const paceOf = (
  message: Message,
  sampleMs: number = defaultSampleMs,
): Sync => syncOf(sampleMs)[message._tag]

// SLOTS & PROJECTION

/**
 * The five painted slots of an ImageCropper Part: `Root`, `Viewport`,
 * `Selection`, `Handle`, and `ZoomControl`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Viewport: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  Selection: {
    role: 'Slider',
    focus: 'Container',
    gestures: [],
  },
  Handle: {
    role: 'Button',
    focus: 'None',
    gestures: [],
  },
  ZoomControl: {
    role: 'Slider',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ZoomInCrop' }],
  },
}

const parseHandleChoice = (
  maybeChoice: Option.Option<string>,
): HandlePosition =>
  Option.match(maybeChoice, {
    onNone: () => 'SE',
    onSome: raw => {
      const upper = raw.toUpperCase()
      return S.is(HandlePosition)(upper) ? upper : 'SE'
    },
  })

const handleLabelOf = (handle: HandlePosition): string =>
  M.value(handle).pipe(
    M.withReturnType<string>(),
    M.when('N', () => 'Resize crop north edge'),
    M.when('S', () => 'Resize crop south edge'),
    M.when('E', () => 'Resize crop east edge'),
    M.when('W', () => 'Resize crop west edge'),
    M.when('NE', () => 'Resize crop northeast corner'),
    M.when('NW', () => 'Resize crop northwest corner'),
    M.when('SE', () => 'Resize crop southeast corner'),
    M.when('SW', () => 'Resize crop southwest corner'),
    M.exhaustive,
  )

/** Accessible description of the current crop selection bounds. */
export const selectionValueTextOf = (state: State): string => {
  const x = Math.round(state.cropRect.x).toString()
  const y = Math.round(state.cropRect.y).toString()
  const width = Math.round(state.cropRect.width).toString()
  const height = Math.round(state.cropRect.height).toString()
  return `Position X ${x}px, Y ${y}px, size ${width}px by ${height}px`
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const disabled = isDisabledOf(props)
  const editable = canEditCrop(props)

  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      label: labelOf(props),
      controls: selectionId(props.id),
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Viewport') {
    return {
      id: viewportId(props.id),
      label: 'Crop viewport',
      ...(editable ? {} : { isDisabled: true }),
    }
  } else if (slot === 'Selection') {
    const maxX = Math.max(
      0,
      Math.round(props.viewportSize.width - state.cropRect.width),
    )
    return {
      id: selectionId(props.id),
      label:
        cropShapeOf(props) === 'Circle'
          ? 'Crop selection area (circle)'
          : 'Crop selection area (rectangle)',
      valueMin: 0,
      valueMax: maxX,
      valueNow: Math.round(state.cropRect.x),
      valueText: selectionValueTextOf(state),
      dragAxis: 'Plane',
      ...(disabled ? { isDisabled: true } : { tabIndex: 0 }),
      ...(editable ? {} : { isDisabled: true }),
    }
  } else if (slot === 'Handle') {
    const handle = parseHandleChoice(maybeChoice)
    return {
      id: handleId(props.id, handle),
      label: handleLabelOf(handle),
      dragAxis: 'Plane',
      ...(editable ? {} : { isDisabled: true }),
    }
  } else if (slot === 'ZoomControl') {
    const zoomPercent = Math.round(state.zoom * 100).toString()
    return {
      id: zoomControlId(props.id),
      label: 'Zoom level',
      valueMin: minZoomOf(props),
      valueMax: maxZoomOf(props),
      valueNow: state.zoom,
      valueText: `${zoomPercent}%`,
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens an ImageCropper on: idle while preserving committed
 * `cropRect`, `zoom`, `rotation`, and flip state.
 */
export const atRest = (state: State): State => toIdleFrom(state)

// PART FACTORY

/** Options for customizing an ImageCropper Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this ImageCropper device-only. */
  sync?: 'Synced' | DeviceReason
  /** Pointer-move sync sampling interval in milliseconds (`50` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates an ImageCropper {@link Part.Part}. Synced by default
 * (`category: 'Domain'`, `MoveCropDrag` and `MoveCropResize` at
 * `Pace.Sampled({ everyMs: 50 })`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's ImageCropper local to one device.
 *
 * @example
 * ```typescript
 * const AvatarCropper = ImageCropper.make({ name: 'AvatarCropper' })
 * const LocalCropper = ImageCropper.deviceOnly({ name: 'LocalCropper' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  return Part.define<State, Message, Props>({
    name: options.name ?? 'ImageCropper',
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

/** Shorthand for an ImageCropper Part whose state stays on the device and is omitted from the synced log and encoded Model. */
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

/** The default synced ImageCropper Part (`name: 'ImageCropper'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

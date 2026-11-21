import { Array, Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import * as Command from '../command/index.js'
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
  Sampled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import * as PointerDrag from './pointerDrag.js'
import { SlotOrientation, type SlotProps } from './slot.js'
import * as TimedHint from './timedHint.js'

// NOTE: this is the core ScrollArea Part (Widget #40 of 54, Scribe #2679).
// It composes `PointerDrag` (`Pace.Sampled` on live thumb drags) and
// `TimedHint` (auto-hide scrollbar after `scrollHideDelayMs` default 600 ms
// via `Command.answerAfter`) into one framework-free Machine and Part
// declaration covering Zag scroll-area and Radix scroll-area semantics. Its
// state (`Idle` | `Scrolling` | `DraggingThumb`) lives in the Model, synced by
// default (`Navigation` category), with `ScrollArea.make` and
// `ScrollArea.deviceOnly()` options. Reference-stable SlotBindings (`Viewport`,
// `Scrollbar`, `Thumb`) render across HTML, React, and React Native generic
// hosts with zero ScrollArea-specific painter logic.

// SCHEMAS & CONSTANTS

/** Default auto-hide delay for scrollbars in milliseconds (`600`), matching Radix ScrollArea. */
export const defaultScrollHideDelayMs = 600

/** Default minimum thumb length in pixels (`20`), matching Zag ScrollArea. */
export const defaultMinThumbPx = 20

/** Default pointer-move sync sampling window in milliseconds (`50`). */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

/** Default accessible label for the scroll viewport landmark. */
export const defaultLabel = 'Scrollable content'

/** Scrollbar axis orientation (`Horizontal` or `Vertical`). */
export const Orientation = SlotOrientation
/** Scrollbar axis orientation. */
export type Orientation = typeof Orientation.Type

/** Default scrollbar orientation (`'Vertical'`). */
export const defaultOrientation: Orientation = 'Vertical'

/**
 * Policy governing when the scrollbar is shown, matching Radix ScrollArea:
 * - `'Always'`: always visible regardless of overflow or interaction.
 * - `'Auto'`: visible whenever `contentSize > viewportSize`.
 * - `'Scroll'`: visible while scrolling or dragging, auto-hiding after `scrollHideDelayMs`.
 * - `'Hover'`: visible while hovering, scrolling, or dragging, auto-hiding after `scrollHideDelayMs`.
 */
export const ScrollbarVisibility = S.Literals([
  'Always',
  'Auto',
  'Scroll',
  'Hover',
])
/** Policy governing when the scrollbar is shown. */
export type ScrollbarVisibility = typeof ScrollbarVisibility.Type

/** Default scrollbar visibility policy (`'Hover'`). */
export const defaultScrollbarVisibility: ScrollbarVisibility = 'Hover'

/** Computed scrollbar thumb geometry derived purely from viewport, content, and scroll offset. */
export const ThumbGeometry = S.Struct({
  hasOverflow: S.Boolean,
  thumbLengthPx: S.Number,
  thumbLengthRatio: S.Number,
  thumbOffsetPx: S.Number,
  thumbOffsetRatio: S.Number,
  maxScrollOffset: S.Number,
  maxThumbOffsetPx: S.Number,
})
/** Computed scrollbar thumb geometry. */
export type ThumbGeometry = typeof ThumbGeometry.Type

/**
 * Read-only props supplied to the ScrollArea chart and projection from the
 * Program's Model. Visibility policy, hide delay, minimum thumb size, and axis
 * stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  orientation: S.optionalKey(Orientation),
  scrollbarVisibility: S.optionalKey(ScrollbarVisibility),
  scrollHideDelayMs: S.optionalKey(S.Number),
  minThumbPx: S.optionalKey(S.Number),
  trackSize: S.optionalKey(S.Number),
  sampleMs: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
})
/** Read-only props supplied to the ScrollArea chart and projection. */
export type Props = typeof Props.Type

// STATE

const sharedFields = {
  viewportSize: S.Number,
  contentSize: S.Number,
  scrollOffset: S.Number,
  isHovering: S.Boolean,
  hideHint: TimedHint.State,
}

/** The scroll area is at rest, neither actively scrolling nor dragging the thumb. */
export const Idle = ts('Idle', {
  ...sharedFields,
  drag: PointerDrag.Idle,
})
/** The scroll area is at rest. */
export type Idle = typeof Idle.Type

/** The scroll area recently scrolled and is showing the scrollbar until its hide timer elapses. */
export const Scrolling = ts('Scrolling', {
  ...sharedFields,
  drag: PointerDrag.Idle,
})
/** The scroll area is actively scrolling or awaiting auto-hide. */
export type Scrolling = typeof Scrolling.Type

/** The user is actively dragging the scrollbar thumb via `PointerDrag`. */
export const DraggingThumb = ts('DraggingThumb', {
  ...sharedFields,
  drag: PointerDrag.Dragging,
})
/** The user is actively dragging the scrollbar thumb. */
export type DraggingThumb = typeof DraggingThumb.Type

/** Where a ScrollArea Part stands: `Idle`, `Scrolling`, or `DraggingThumb`. Lives in the Model. */
export const State = S.Union([Idle, Scrolling, DraggingThumb])
/** Where a ScrollArea Part stands. */
export type State = typeof State.Type

/** Initial ScrollArea state: zero measurements, idle, hidden countdown at version `0`. */
export const initial: State = Idle({
  viewportSize: 0,
  contentSize: 0,
  scrollOffset: 0,
  isHovering: false,
  hideHint: TimedHint.initial,
  drag: PointerDrag.Idle(),
})

/** Creates an initial idle ScrollArea state with known `viewportSize`, `contentSize`, and optional `scrollOffset`. */
export const initialMeasured = (
  input: Readonly<{
    viewportSize: number
    contentSize: number
    scrollOffset?: number
  }>,
): State => {
  const viewportSize = Math.max(0, input.viewportSize)
  const contentSize = Math.max(0, input.contentSize)
  const maxOffset = Math.max(0, contentSize - viewportSize)
  return Idle({
    viewportSize,
    contentSize,
    scrollOffset: PointerDrag.clampValue(input.scrollOffset ?? 0, 0, maxOffset),
    isHovering: false,
    hideHint: TimedHint.initial,
    drag: PointerDrag.Idle(),
  })
}

// ACTIONS

/** Scrolls the viewport to an absolute `offset` in pixels, clamped to valid scroll bounds. */
export const ScrollTo = Catalog.action('ScrollTo', {
  fields: { offset: S.Number },
  choose: {
    field: 'offset',
    noun: 'offset',
    prompt: 'Scroll to which pixel offset?',
    token: S.FiniteFromString,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter a scroll offset',
  },
  what: 'Scrolls the viewport to the chosen pixel offset',
  why: 'To bring a specific portion of content into view',
  meta: { label: 'Scroll to offset', keys: [] },
})

/** Scrolls the viewport by a relative pixel `delta`, clamped to valid scroll bounds. */
export const ScrollBy = Catalog.action('ScrollBy', {
  fields: { delta: S.Number },
  what: 'Scrolls the viewport by a relative distance',
  why: 'To move further along the scrollable region',
  meta: { label: 'Scroll by delta', keys: [] },
})

/** Scrolls the viewport back to offset `0`. */
export const ScrollToStart = Catalog.action('ScrollToStart', {
  what: 'Scrolls the viewport back to the beginning',
  why: 'To jump straight to the earliest content',
  meta: { label: 'Scroll to start', keys: [] },
})

/** Scrolls the viewport to its maximum scroll offset. */
export const ScrollToEnd = Catalog.action('ScrollToEnd', {
  what: 'Scrolls the viewport all the way to the end',
  why: 'To reach the final content immediately',
  meta: { label: 'Scroll to end', keys: [] },
})

/** The Catalog Actions a ScrollArea Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ScrollTo,
  ScrollBy,
  ScrollToStart,
  ScrollToEnd,
]

// MESSAGES

/** Reports updated viewport and content measurements from the painter. */
export const MeasureScrollArea = m('MeasureScrollArea', {
  viewportSize: S.Number,
  contentSize: S.Number,
})

/** Observes a native viewport scroll offset change. Synced via `Pace.Sampled`. */
export const ObserveScrollOffset = m('ObserveScrollOffset', {
  scrollOffset: S.Number,
})

/** The pointer entered the scroll area, keeping `Hover` scrollbars visible and pausing auto-hide. */
export const HoverScrollArea = m('HoverScrollArea')

/** The pointer left the scroll area, resuming or starting the scrollbar auto-hide delay. */
export const LeaveScrollArea = m('LeaveScrollArea')

/** A pointer went down on the scrollbar thumb to begin dragging. */
export const BeginThumbDrag = m('BeginThumbDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/** The active thumb-drag pointer moved to `(x, y)`. Synced via `Pace.Sampled`. */
export const MoveThumbDrag = m('MoveThumbDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/** The active thumb-drag pointer was released, transitioning into the auto-hide countdown. */
export const EndThumbDrag = m('EndThumbDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** The active thumb drag was cancelled (for example Escape or pointercancel), restoring the pre-drag scroll offset. */
export const CancelThumbDrag = m('CancelThumbDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** A scheduled scrollbar hide delay elapsed for `version`. Ignored unless matching the current `hideHint` version. */
export const ElapsedScrollbarHide = m('ElapsedScrollbarHide', {
  version: S.Number,
})

/** Every Message the ScrollArea chart handles. */
export const Message = S.Union([
  ScrollTo,
  ScrollBy,
  ScrollToStart,
  ScrollToEnd,
  MeasureScrollArea,
  ObserveScrollOffset,
  HoverScrollArea,
  LeaveScrollArea,
  BeginThumbDrag,
  MoveThumbDrag,
  EndThumbDrag,
  CancelThumbDrag,
  ElapsedScrollbarHide,
])
/** Every Message the ScrollArea chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the ScrollArea Part. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits `afterMs` milliseconds (via `Command.answerAfter`) and answers `ElapsedScrollbarHide({ version })`. */
export const WaitForScrollbarHide = Command.define(
  'WaitForScrollbarHide',
  { version: S.Number, afterMs: S.Number },
  ElapsedScrollbarHide,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedScrollbarHide({ version })),
)

// ELEMENT IDS

/** Derives the scroll viewport element id from a base `id`. */
export const viewportId = (id: string): string => `${id}-viewport`

/** Derives the scrollbar track element id from a base `id`. */
export const scrollbarId = (id: string): string => `${id}-scrollbar`

/** Derives the scrollbar thumb element id from a base `id`. */
export const thumbId = (id: string): string => `${id}-thumb`

// PURE CONFIGURATION READERS & GEOMETRY

/** Resolved scrollbar orientation (`'Vertical'` by default). */
export const orientationOf = (
  props: Pick<Props, 'orientation'> = {},
): Orientation => props.orientation ?? defaultOrientation

/** Resolved scrollbar visibility policy (`'Hover'` by default). */
export const scrollbarVisibilityOf = (
  props: Pick<Props, 'scrollbarVisibility'> = {},
): ScrollbarVisibility =>
  props.scrollbarVisibility ?? defaultScrollbarVisibility

/** Resolved auto-hide delay in milliseconds (`600` by default). */
export const scrollHideDelayMsOf = (
  props: Pick<Props, 'scrollHideDelayMs'> = {},
): number => Math.max(0, props.scrollHideDelayMs ?? defaultScrollHideDelayMs)

/** Resolved minimum thumb length in pixels (`20` by default). */
export const minThumbPxOf = (props: Pick<Props, 'minThumbPx'> = {}): number =>
  Math.max(0, props.minThumbPx ?? defaultMinThumbPx)

/** True when the scroll area is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** Resolved accessible viewport label (`'Scrollable content'` by default). */
export const labelOf = (props: Pick<Props, 'label'> = {}): string =>
  props.label ?? defaultLabel

/**
 * Purely computes scrollbar thumb dimensions and position from `viewportSize`,
 * `contentSize`, `scrollOffset`, optional `trackSize` (defaults to
 * `viewportSize`), and optional `minThumbPx` (defaults to `20`).
 *
 * @example
 * ```typescript
 * thumbGeometryOf({ viewportSize: 200, contentSize: 1000, scrollOffset: 400 })
 * // { hasOverflow: true, thumbLengthPx: 40, thumbLengthRatio: 0.2, thumbOffsetPx: 80, thumbOffsetRatio: 0.4, maxScrollOffset: 800, maxThumbOffsetPx: 160 }
 * ```
 */
export const thumbGeometryOf = (
  input: Readonly<{
    viewportSize: number
    contentSize: number
    scrollOffset: number
    trackSize?: number
    minThumbPx?: number
  }>,
): ThumbGeometry => {
  const viewportSize = Math.max(0, input.viewportSize)
  const contentSize = Math.max(0, input.contentSize)
  const trackSize = Math.max(0, input.trackSize ?? viewportSize)
  const minThumbPx = Math.max(0, input.minThumbPx ?? defaultMinThumbPx)
  const maxScrollOffset = Math.max(0, contentSize - viewportSize)
  const hasOverflow = viewportSize > 0 && contentSize > viewportSize

  if (!hasOverflow || trackSize <= 0) {
    return {
      hasOverflow: false,
      thumbLengthPx: trackSize,
      thumbLengthRatio: trackSize > 0 ? 1 : 0,
      thumbOffsetPx: 0,
      thumbOffsetRatio: 0,
      maxScrollOffset: 0,
      maxThumbOffsetPx: 0,
    }
  }

  const rawThumbPx = trackSize * (viewportSize / contentSize)
  const thumbLengthPx = Math.min(trackSize, Math.max(minThumbPx, rawThumbPx))
  const thumbLengthRatio = thumbLengthPx / trackSize
  const maxThumbOffsetPx = Math.max(0, trackSize - thumbLengthPx)
  const clampedOffset = PointerDrag.clampValue(
    input.scrollOffset,
    0,
    maxScrollOffset,
  )
  const scrollProgress =
    maxScrollOffset > 0 ? clampedOffset / maxScrollOffset : 0
  const thumbOffsetPx = scrollProgress * maxThumbOffsetPx
  const thumbOffsetRatio = thumbOffsetPx / trackSize

  return {
    hasOverflow: true,
    thumbLengthPx,
    thumbLengthRatio,
    thumbOffsetPx,
    thumbOffsetRatio,
    maxScrollOffset,
    maxThumbOffsetPx,
  }
}

/**
 * Purely maps a thumb drag displacement `deltaPx` from `startScrollOffset`
 * into the next clamped viewport scroll offset.
 *
 * @example
 * ```typescript
 * scrollOffsetFromThumbDrag({ startScrollOffset: 0, deltaPx: 80, viewportSize: 200, contentSize: 1000 })
 * // 400
 * ```
 */
export const scrollOffsetFromThumbDrag = (
  input: Readonly<{
    startScrollOffset: number
    deltaPx: number
    viewportSize: number
    contentSize: number
    trackSize?: number
    minThumbPx?: number
  }>,
): number => {
  const geometry = thumbGeometryOf({
    viewportSize: input.viewportSize,
    contentSize: input.contentSize,
    scrollOffset: input.startScrollOffset,
    ...(input.trackSize === undefined ? {} : { trackSize: input.trackSize }),
    ...(input.minThumbPx === undefined ? {} : { minThumbPx: input.minThumbPx }),
  })
  if (!geometry.hasOverflow || geometry.maxThumbOffsetPx <= 0) {
    return 0
  }
  const deltaScroll =
    (input.deltaPx / geometry.maxThumbOffsetPx) * geometry.maxScrollOffset
  return PointerDrag.clampValue(
    input.startScrollOffset + deltaScroll,
    0,
    geometry.maxScrollOffset,
  )
}

/** Computes {@link ThumbGeometry} for `state` and `props`. */
export const geometryOf = (
  state: State,
  props: Pick<Props, 'trackSize' | 'minThumbPx'> = {},
): ThumbGeometry =>
  thumbGeometryOf({
    viewportSize: state.viewportSize,
    contentSize: state.contentSize,
    scrollOffset: state.scrollOffset,
    ...(props.trackSize === undefined ? {} : { trackSize: props.trackSize }),
    ...(props.minThumbPx === undefined ? {} : { minThumbPx: props.minThumbPx }),
  })

/** True when `state` has scrollable overflow (`contentSize > viewportSize > 0`). */
export const hasOverflow = (state: State): boolean =>
  state.viewportSize > 0 && state.contentSize > state.viewportSize

/** Maximum scroll offset (`Math.max(0, contentSize - viewportSize)`). */
export const maxScrollOffsetOf = (state: State): number =>
  Math.max(0, state.contentSize - state.viewportSize)

/** True while `state` is `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True while `state` is `Scrolling`. */
export const isScrolling = (state: State): boolean => state._tag === 'Scrolling'

/** True while `state` is `DraggingThumb`. */
export const isDraggingThumb = (state: State): boolean =>
  state._tag === 'DraggingThumb'

/**
 * True when the scrollbar should be rendered visible under `props.scrollbarVisibility`:
 * - `'Always'`: always `true`.
 * - `'Auto'`: `true` whenever content overflows.
 * - `'Scroll'`: `true` on overflow while scrolling, dragging, or awaiting hide countdown.
 * - `'Hover'`: `true` on overflow while hovered, scrolling, dragging, or awaiting hide countdown.
 */
export const isScrollbarVisible = (
  state: State,
  props: Pick<Props, 'scrollbarVisibility'> = {},
): boolean => {
  const policy = scrollbarVisibilityOf(props)
  const overflow = hasOverflow(state)
  return M.value(policy).pipe(
    M.withReturnType<boolean>(),
    M.when('Always', () => true),
    M.when('Auto', () => overflow),
    M.when(
      'Scroll',
      () =>
        overflow &&
        (state._tag === 'Scrolling' ||
          state._tag === 'DraggingThumb' ||
          TimedHint.isVisible(state.hideHint)),
    ),
    M.when(
      'Hover',
      () =>
        overflow &&
        (state.isHovering ||
          state._tag === 'Scrolling' ||
          state._tag === 'DraggingThumb' ||
          TimedHint.isVisible(state.hideHint)),
    ),
    M.exhaustive,
  )
}

// INTERNAL CHART HELPERS

const dragPropsOf = (props: Props): PointerDrag.Props => ({
  axis: orientationOf(props),
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

const mapHintCommands = (
  nextHint: TimedHint.State,
  hintCommands: ReadonlyArray<Command.Command<TimedHint.Message>>,
): ReadonlyArray<Command.Command<Message>> => {
  if (Array.isReadonlyArrayEmpty(hintCommands)) {
    return []
  }
  return Option.match(TimedHint.durationMsOf(nextHint), {
    onNone: () => [],
    onSome: afterMs => [
      WaitForScrollbarHide({
        version: TimedHint.versionOf(nextHint),
        afterMs,
      }),
    ],
  })
}

const showHideCountdown = (
  hint: TimedHint.State,
  isHovering: boolean,
  props: Props,
): readonly [TimedHint.State, ReadonlyArray<Command.Command<Message>>] => {
  const delayMs = scrollHideDelayMsOf(props)
  const [shownHint, shownCommands] = TimedHint.chart.transition(
    hint,
    TimedHint.ShowHint({ maybeDurationMs: Option.some(delayMs) }),
  )
  if (isHovering) {
    const [pausedHint] = TimedHint.chart.transition(
      shownHint,
      TimedHint.PauseHint(),
    )
    return [pausedHint, []]
  } else {
    return [shownHint, mapHintCommands(shownHint, shownCommands)]
  }
}

const pauseHideCountdown = (hint: TimedHint.State): TimedHint.State => {
  const [nextHint] = TimedHint.chart.transition(hint, TimedHint.PauseHint())
  return nextHint
}

const resumeHideCountdown = (
  hint: TimedHint.State,
  props: Props,
): readonly [TimedHint.State, ReadonlyArray<Command.Command<Message>>] => {
  if (TimedHint.isPaused(hint)) {
    const [resumedHint, resumedCommands] = TimedHint.chart.transition(
      hint,
      TimedHint.ResumeHint(),
    )
    return [resumedHint, mapHintCommands(resumedHint, resumedCommands)]
  } else {
    const [shownHint, shownCommands] = TimedHint.chart.transition(
      hint,
      TimedHint.ShowHint({
        maybeDurationMs: Option.some(scrollHideDelayMsOf(props)),
      }),
    )
    return [shownHint, mapHintCommands(shownHint, shownCommands)]
  }
}

const scrollToOffset = (
  state: Idle | Scrolling,
  targetOffset: number,
  props: Props,
): Readonly<{
  model: Scrolling
  commands: ReadonlyArray<Command.Command<Message>>
}> => {
  const clampedOffset = PointerDrag.clampValue(
    targetOffset,
    0,
    maxScrollOffsetOf(state),
  )
  const [nextHint, commands] = showHideCountdown(
    state.hideHint,
    state.isHovering,
    props,
  )
  return {
    model: Scrolling({
      viewportSize: state.viewportSize,
      contentSize: state.contentSize,
      scrollOffset: clampedOffset,
      isHovering: state.isHovering,
      hideHint: nextHint,
      drag: PointerDrag.Idle(),
    }),
    commands,
  }
}

const startThumbDrag = (
  state: Idle | Scrolling,
  message: typeof BeginThumbDrag.Type,
  props: Props,
): DraggingThumb => {
  const [nextDrag] = PointerDrag.chart.transition(
    state.drag,
    PointerDrag.StartDrag({
      pointerId: message.pointerId,
      x: message.x,
      y: message.y,
      originValue: state.scrollOffset,
    }),
    dragPropsOf(props),
  )
  const dragging =
    nextDrag._tag === 'Dragging'
      ? nextDrag
      : PointerDrag.Dragging({
          pointerId: message.pointerId,
          startX: message.x,
          startY: message.y,
          currentX: message.x,
          currentY: message.y,
          originValue: state.scrollOffset,
          isActivated: true,
        })
  return DraggingThumb({
    viewportSize: state.viewportSize,
    contentSize: state.contentSize,
    scrollOffset: state.scrollOffset,
    isHovering: state.isHovering,
    hideHint: pauseHideCountdown(state.hideHint),
    drag: dragging,
  })
}

const beginThumbDragEdges = <Source extends Idle | Scrolling>(): ReadonlyArray<
  GuardedEdge<State, Message, Source, typeof BeginThumbDrag.Type, never, Props>
> => [
  when(
    (state, _message, context) => !isDisabledOf(context) && hasOverflow(state),
    'DraggingThumb',
    ({ state, message, context }) => startThumbDrag(state, message, context),
  ),
  ignore(),
]

const scrollToEdges = <Source extends Idle | Scrolling>(): ReadonlyArray<
  GuardedEdge<State, Message, Source, typeof ScrollTo.Type, never, Props>
> => [
  when(
    (_state, _message, context) => !isDisabledOf(context),
    'Scrolling',
    ({ state, message, context }) =>
      scrollToOffset(state, message.offset, context),
  ),
  ignore(),
]

const scrollByEdges = <Source extends Idle | Scrolling>(): ReadonlyArray<
  GuardedEdge<State, Message, Source, typeof ScrollBy.Type, never, Props>
> => [
  when(
    (_state, _message, context) => !isDisabledOf(context),
    'Scrolling',
    ({ state, message, context }) =>
      scrollToOffset(state, state.scrollOffset + message.delta, context),
  ),
  ignore(),
]

const scrollToStartEdges = <Source extends Idle | Scrolling>(): ReadonlyArray<
  GuardedEdge<State, Message, Source, typeof ScrollToStart.Type, never, Props>
> => [
  when(
    (_state, _message, context) => !isDisabledOf(context),
    'Scrolling',
    ({ state, context }) => scrollToOffset(state, 0, context),
  ),
  ignore(),
]

const scrollToEndEdges = <Source extends Idle | Scrolling>(): ReadonlyArray<
  GuardedEdge<State, Message, Source, typeof ScrollToEnd.Type, never, Props>
> => [
  when(
    (_state, _message, context) => !isDisabledOf(context),
    'Scrolling',
    ({ state, context }) =>
      scrollToOffset(state, maxScrollOffsetOf(state), context),
  ),
  ignore(),
]

const observeScrollEdges = <Source extends Idle | Scrolling>(): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    Source,
    typeof ObserveScrollOffset.Type,
    never,
    Props
  >
> => [
  when(
    (_state, _message, context) => !isDisabledOf(context),
    'Scrolling',
    ({ state, message, context }) =>
      scrollToOffset(state, message.scrollOffset, context),
  ),
  ignore(),
]

// CHART

/**
 * Builds the ScrollArea Machine chart starting in `initialState`: composes
 * `PointerDrag.chart` for thumb dragging and `TimedHint.chart` for versioned
 * scrollbar auto-hide via `WaitForScrollbarHide` (`Command.answerAfter`).
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          ScrollTo: scrollToEdges<Idle>(),
          ScrollBy: scrollByEdges<Idle>(),
          ScrollToStart: scrollToStartEdges<Idle>(),
          ScrollToEnd: scrollToEndEdges<Idle>(),
          MeasureScrollArea: to('Idle', ({ state, message }) => {
            const viewportSize = Math.max(0, message.viewportSize)
            const contentSize = Math.max(0, message.contentSize)
            const maxOffset = Math.max(0, contentSize - viewportSize)
            return Idle({
              ...state,
              viewportSize,
              contentSize,
              scrollOffset: PointerDrag.clampValue(
                state.scrollOffset,
                0,
                maxOffset,
              ),
            })
          }),
          ObserveScrollOffset: observeScrollEdges<Idle>(),
          HoverScrollArea: to('Idle', ({ state }) =>
            Idle({
              ...state,
              isHovering: true,
              hideHint: pauseHideCountdown(state.hideHint),
            }),
          ),
          LeaveScrollArea: [
            when(
              (state, _message, context) =>
                state.isHovering &&
                hasOverflow(state) &&
                scrollbarVisibilityOf(context) === 'Hover',
              'Scrolling',
              ({ state, context }) => {
                const [nextHint, commands] = resumeHideCountdown(
                  state.hideHint,
                  context,
                )
                return {
                  model: Scrolling({
                    viewportSize: state.viewportSize,
                    contentSize: state.contentSize,
                    scrollOffset: state.scrollOffset,
                    isHovering: false,
                    hideHint: nextHint,
                    drag: PointerDrag.Idle(),
                  }),
                  commands,
                }
              },
            ),
            when(
              state => state.isHovering,
              'Idle',
              ({ state }) => Idle({ ...state, isHovering: false }),
            ),
            ignore(),
          ],
          BeginThumbDrag: beginThumbDragEdges<Idle>(),
          MoveThumbDrag: [ignore()],
          EndThumbDrag: [ignore()],
          CancelThumbDrag: [ignore()],
          ElapsedScrollbarHide: [ignore()],
        },
      },
      Scrolling: {
        on: {
          ScrollTo: scrollToEdges<Scrolling>(),
          ScrollBy: scrollByEdges<Scrolling>(),
          ScrollToStart: scrollToStartEdges<Scrolling>(),
          ScrollToEnd: scrollToEndEdges<Scrolling>(),
          MeasureScrollArea: to('Scrolling', ({ state, message }) => {
            const viewportSize = Math.max(0, message.viewportSize)
            const contentSize = Math.max(0, message.contentSize)
            const maxOffset = Math.max(0, contentSize - viewportSize)
            return Scrolling({
              ...state,
              viewportSize,
              contentSize,
              scrollOffset: PointerDrag.clampValue(
                state.scrollOffset,
                0,
                maxOffset,
              ),
            })
          }),
          ObserveScrollOffset: observeScrollEdges<Scrolling>(),
          HoverScrollArea: to('Scrolling', ({ state }) =>
            Scrolling({
              ...state,
              isHovering: true,
              hideHint: pauseHideCountdown(state.hideHint),
            }),
          ),
          LeaveScrollArea: to('Scrolling', ({ state, context }) => {
            const [nextHint, commands] = resumeHideCountdown(
              state.hideHint,
              context,
            )
            return {
              model: Scrolling({
                ...state,
                isHovering: false,
                hideHint: nextHint,
              }),
              commands,
            }
          }),
          BeginThumbDrag: beginThumbDragEdges<Scrolling>(),
          MoveThumbDrag: [ignore()],
          EndThumbDrag: [ignore()],
          CancelThumbDrag: [ignore()],
          ElapsedScrollbarHide: [
            when(
              (state, message) =>
                TimedHint.shouldAcceptElapsed(state.hideHint, message.version),
              'Idle',
              ({ state, message }) => {
                const [nextHint] = TimedHint.chart.transition(
                  state.hideHint,
                  TimedHint.ElapsedHint({ version: message.version }),
                )
                return Idle({
                  viewportSize: state.viewportSize,
                  contentSize: state.contentSize,
                  scrollOffset: state.scrollOffset,
                  isHovering: state.isHovering,
                  hideHint: nextHint,
                  drag: PointerDrag.Idle(),
                })
              },
            ),
            ignore(),
          ],
        },
      },
      DraggingThumb: {
        on: {
          ScrollTo: [ignore()],
          ScrollBy: [ignore()],
          ScrollToStart: [ignore()],
          ScrollToEnd: [ignore()],
          MeasureScrollArea: to('DraggingThumb', ({ state, message }) => {
            const viewportSize = Math.max(0, message.viewportSize)
            const contentSize = Math.max(0, message.contentSize)
            const maxOffset = Math.max(0, contentSize - viewportSize)
            return DraggingThumb({
              ...state,
              viewportSize,
              contentSize,
              scrollOffset: PointerDrag.clampValue(
                state.scrollOffset,
                0,
                maxOffset,
              ),
            })
          }),
          ObserveScrollOffset: [ignore()],
          HoverScrollArea: to('DraggingThumb', ({ state }) =>
            DraggingThumb({ ...state, isHovering: true }),
          ),
          LeaveScrollArea: to('DraggingThumb', ({ state }) =>
            DraggingThumb({ ...state, isHovering: false }),
          ),
          BeginThumbDrag: [ignore()],
          MoveThumbDrag: [
            when(
              (state, message, context) =>
                !isDisabledOf(context) &&
                message.pointerId === state.drag.pointerId,
              'DraggingThumb',
              ({ state, message, context }) => {
                const [nextDragState] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.MoveDrag({
                    pointerId: message.pointerId,
                    x: message.x,
                    y: message.y,
                  }),
                  dragPropsOf(context),
                )
                const nextDrag =
                  nextDragState._tag === 'Dragging' ? nextDragState : state.drag
                const deltaPx = PointerDrag.axisDeltaOf(nextDrag, {
                  axis: orientationOf(context),
                })
                const nextOffset = scrollOffsetFromThumbDrag({
                  startScrollOffset: nextDrag.originValue,
                  deltaPx,
                  viewportSize: state.viewportSize,
                  contentSize: state.contentSize,
                  ...(context.trackSize === undefined
                    ? {}
                    : { trackSize: context.trackSize }),
                  ...(context.minThumbPx === undefined
                    ? {}
                    : { minThumbPx: context.minThumbPx }),
                })
                return DraggingThumb({
                  ...state,
                  scrollOffset: nextOffset,
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          EndThumbDrag: [
            when(
              (state, message) =>
                message.pointerId === undefined ||
                message.pointerId === state.drag.pointerId,
              'Scrolling',
              ({ state, message, context }) => {
                const [endedDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.EndDrag(
                    message.pointerId === undefined
                      ? {}
                      : { pointerId: message.pointerId },
                  ),
                  dragPropsOf(context),
                )
                const [nextHint, commands] = showHideCountdown(
                  state.hideHint,
                  state.isHovering,
                  context,
                )
                return {
                  model: Scrolling({
                    viewportSize: state.viewportSize,
                    contentSize: state.contentSize,
                    scrollOffset: state.scrollOffset,
                    isHovering: state.isHovering,
                    hideHint: nextHint,
                    drag:
                      endedDrag._tag === 'Idle'
                        ? endedDrag
                        : PointerDrag.Idle(),
                  }),
                  commands,
                }
              },
            ),
            ignore(),
          ],
          CancelThumbDrag: [
            when(
              (state, message) =>
                message.pointerId === undefined ||
                message.pointerId === state.drag.pointerId,
              'Idle',
              ({ state, message, context }) => {
                const [cancelledDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.CancelDrag(
                    message.pointerId === undefined
                      ? {}
                      : { pointerId: message.pointerId },
                  ),
                  dragPropsOf(context),
                )
                return Idle({
                  viewportSize: state.viewportSize,
                  contentSize: state.contentSize,
                  scrollOffset: state.drag.originValue,
                  isHovering: state.isHovering,
                  hideHint: TimedHint.atRest(state.hideHint),
                  drag:
                    cancelledDrag._tag === 'Idle'
                      ? cancelledDrag
                      : PointerDrag.Idle(),
                })
              },
            ),
            ignore(),
          ],
          ElapsedScrollbarHide: [ignore()],
        },
      },
    },
  })

/** Default ScrollArea Machine chart starting in `Idle`. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the ScrollArea sync table using `Pace.Sampled({ everyMs })` on
 * `ObserveScrollOffset` and `MoveThumbDrag` and `Pace.Synced()` on discrete actions.
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  ScrollTo: Synced(),
  ScrollBy: Synced(),
  ScrollToStart: Synced(),
  ScrollToEnd: Synced(),
  MeasureScrollArea: Synced(),
  ObserveScrollOffset: Sampled({ everyMs: sampleMs }),
  HoverScrollArea: Synced(),
  LeaveScrollArea: Synced(),
  BeginThumbDrag: Synced(),
  MoveThumbDrag: Sampled({ everyMs: sampleMs }),
  EndThumbDrag: Synced(),
  CancelThumbDrag: Synced(),
  ElapsedScrollbarHide: Synced(),
})

/** Default synchronization: live scroll and thumb drag moves sampled at 50 ms. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a ScrollArea kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  ScrollTo: Device({ because }),
  ScrollBy: Device({ because }),
  ScrollToStart: Device({ because }),
  ScrollToEnd: Device({ because }),
  MeasureScrollArea: Device({ because }),
  ObserveScrollOffset: Device({ because }),
  HoverScrollArea: Device({ because }),
  LeaveScrollArea: Device({ because }),
  BeginThumbDrag: Device({ because }),
  MoveThumbDrag: Device({ because }),
  EndThumbDrag: Device({ because }),
  CancelThumbDrag: Device({ because }),
  ElapsedScrollbarHide: Device({ because }),
})

// SLOTS & PROJECTION

/**
 * The three painted slots of a ScrollArea Part:
 * - `Viewport`: scrollable content region (`role="region"`, `tabIndex`).
 * - `Scrollbar`: scrollbar range control (`role="slider"`, `orientation`, `controls`, `valueMin/Max/Now`, `isHidden`).
 * - `Thumb`: draggable scrollbar thumb (`role="button"`, `isHidden`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Viewport: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  Scrollbar: {
    role: 'Slider',
    focus: 'None',
    gestures: [],
  },
  Thumb: {
    role: 'Button',
    focus: 'None',
    gestures: [],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  const geometry = geometryOf(state, props)
  const visible = isScrollbarVisible(state, props)
  const disabled = isDisabledOf(props)
  const orientation = orientationOf(props)

  if (slot === 'Viewport') {
    return {
      id: viewportId(props.id),
      label: labelOf(props),
      tabIndex: geometry.hasOverflow && !disabled ? 0 : -1,
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Scrollbar') {
    return {
      id: scrollbarId(props.id),
      orientation,
      dragAxis: orientation === 'Horizontal' ? 'Horizontal' : 'Vertical',
      controls: viewportId(props.id),
      valueMin: 0,
      valueMax: geometry.maxScrollOffset,
      valueNow: Math.round(
        PointerDrag.clampValue(state.scrollOffset, 0, geometry.maxScrollOffset),
      ),
      isHidden: !visible,
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Thumb') {
    return {
      id: thumbId(props.id),
      dragAxis: orientation === 'Horizontal' ? 'Horizontal' : 'Vertical',
      isHidden: !visible,
      tabIndex: visible && !disabled ? 0 : -1,
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a ScrollArea Part on: returns to `Idle` with settled
 * measurements and scroll offset, clearing hover, transient hide countdown,
 * and any in-flight drag.
 */
export const atRest = (state: State): State =>
  Idle({
    viewportSize: state.viewportSize,
    contentSize: state.contentSize,
    scrollOffset: state.scrollOffset,
    isHovering: false,
    hideHint: TimedHint.atRest(state.hideHint),
    drag: PointerDrag.atRest(state.drag),
  })

// PART FACTORY

/** Options for customizing a ScrollArea Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (such as `'OwnView'`) to keep ScrollArea device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial measured viewport size in pixels (`0` by default). */
  viewportSize?: number
  /** Initial measured content size in pixels (`0` by default). */
  contentSize?: number
  /** Initial scroll offset in pixels (`0` by default). */
  scrollOffset?: number
  /** Sampling interval in milliseconds for live scroll and thumb drag moves (`50` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a ScrollArea {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`, `ObserveScrollOffset` and `MoveThumbDrag` at
 * `Pace.Sampled({ everyMs: sampleMs ?? 50 })`). Use {@link deviceOnly} for
 * local-only scroll areas.
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  const initialState =
    options.viewportSize === undefined &&
    options.contentSize === undefined &&
    options.scrollOffset === undefined
      ? initial
      : initialMeasured({
          viewportSize: options.viewportSize ?? 0,
          contentSize: options.contentSize ?? 0,
          scrollOffset: options.scrollOffset ?? 0,
        })
  return Part.define<State, Message, Props>({
    name: options.name ?? 'ScrollArea',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
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
          dragSampleMs: sampleMs,
        },
      },
      presets: {},
    },
  })
}

/**
 * Shorthand for a ScrollArea Part whose state stays on the device and is
 * omitted from the synced log and encoded Model.
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

/** The default synced ScrollArea Part (`name: 'ScrollArea'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

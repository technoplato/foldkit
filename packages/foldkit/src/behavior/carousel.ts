import { Array, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import * as Command from '../command/index.js'
import {
  type EdgeReturn,
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
import { type SlotOrientation, type SlotProps } from './slot.js'
import * as TimedHint from './timedHint.js'

// NOTE: this is the core Carousel Part (Widget #44 of 54, Scribe #2683). It
// composes `PointerDrag` and `TimedHint` (`Command.answerAfter` autoplay ticks
// guarded by a monotonic version counter) into one framework-free Machine and
// Part declaration covering Zag carousel: paging with `slideCount`,
// `slidesPerPage`, `slidesPerMove`, `loop`, `orientation`, `autoplayIntervalMs`,
// `allowMouseDrag`, swipe threshold advancing/retreating slides, pause on hover
// and interaction, keyboard arrows/Home/End, and reference-stable SlotBindings
// (`Root`, `Viewport`, `Slide`, `PrevButton`, `NextButton`, `Indicator`,
// `AutoplayTrigger`). Its state (`Idle` | `Autoplaying` | `Dragging`) lives in
// the Model, synced by default (`Navigation` category, `Pace.Sampled` on live
// pointer drag moves) with `Carousel.make` and `Carousel.deviceOnly()`.

// CONSTANTS

/** Default number of slides visible per page (`1`). */
export const defaultSlidesPerPage = 1

/** Default autoplay interval in milliseconds (`4000`, matching Zag Carousel). */
export const defaultAutoplayIntervalMs = 4000

/** Default pointer swipe displacement in pixels required to advance or retreat a page (`50`). */
export const defaultSwipeThresholdPx = 50

/** Default pointer-move sync sampling window in milliseconds (`50`). */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

/** Default layout axis for a Carousel (`'Horizontal'`). */
export const defaultOrientation: SlotOrientation = 'Horizontal'

/** Default horizontal reading direction (`'Ltr'`). */
export const defaultDirection: PointerDrag.DragDirection = 'Ltr'

/** Default accessible label for the Carousel landmark region. */
export const defaultLabel = 'Carousel'

// SCHEMAS

/** How many slides one page step moves: a positive integer or `'Auto'` (one full page). */
export const SlidesPerMove = S.Union([S.Number, S.Literal('Auto')])
/** How many slides one page step moves. */
export type SlidesPerMove = typeof SlidesPerMove.Type

/**
 * Read-only configuration supplied to the Carousel chart and projection from
 * the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  slideCount: S.Number,
  slidesPerPage: S.optionalKey(S.Number),
  slidesPerMove: S.optionalKey(SlidesPerMove),
  loop: S.optionalKey(S.Boolean),
  orientation: S.optionalKey(S.Literals(['Horizontal', 'Vertical'])),
  direction: S.optionalKey(PointerDrag.DragDirection),
  autoplayIntervalMs: S.optionalKey(S.Number),
  allowMouseDrag: S.optionalKey(S.Boolean),
  swipeThresholdPx: S.optionalKey(S.Number),
  pauseOnHover: S.optionalKey(S.Boolean),
  pauseOnInteraction: S.optionalKey(S.Boolean),
  sampleMs: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  isDisabled: S.optionalKey(S.Boolean),
})
/** Read-only configuration supplied to the Carousel chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The carousel is resting at `page` with no active autoplay countdown or pointer drag. */
export const Idle = ts('Idle', {
  page: S.Number,
  hint: TimedHint.State,
  isHovering: S.Boolean,
  shouldResumeAfterHover: S.Boolean,
})
/** The carousel is resting at `page`. */
export type Idle = typeof Idle.Type

/** The carousel is advancing automatically via a versioned `TimedHint` countdown. */
export const Autoplaying = ts('Autoplaying', {
  page: S.Number,
  hint: TimedHint.State,
  isHovering: S.Boolean,
})
/** The carousel is advancing automatically. */
export type Autoplaying = typeof Autoplaying.Type

/** The carousel is actively being swiped by a pointer tracked through `PointerDrag`. */
export const Dragging = ts('Dragging', {
  page: S.Number,
  hint: TimedHint.State,
  drag: PointerDrag.Dragging,
  dragOffsetPx: S.Number,
  wasAutoplaying: S.Boolean,
  isHovering: S.Boolean,
})
/** The carousel is actively being swiped by a pointer. */
export type Dragging = typeof Dragging.Type

/** Where a Carousel Part stands: `Idle`, `Autoplaying`, or `Dragging`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Autoplaying, Dragging])
/** Where a Carousel Part stands. */
export type State = typeof State.Type

/** Initial Carousel state: idle at page `0` with a fresh `TimedHint` version counter. */
export const initial: State = Idle({
  page: 0,
  hint: TimedHint.initial,
  isHovering: false,
  shouldResumeAfterHover: false,
})

/** Creates an initial idle Carousel state starting on `page` (clamped non-negative integer). */
export const initialPage = (page: number): State =>
  Idle({
    page: Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0,
    hint: TimedHint.initial,
    isHovering: false,
    shouldResumeAfterHover: false,
  })

// ACTIONS

const chooseSlidePage: Readonly<{
  field: 'page'
  noun: string
  prompt: string
  token: typeof S.FiniteFromString
  choicesOf: () => ReadonlyArray<never>
  accepts: () => ReturnType<typeof Catalog.Enabled>
  nothingToChoose: string
}> = {
  field: 'page',
  noun: 'slide page',
  prompt: 'Jump to which slide page?',
  token: S.FiniteFromString,
  choicesOf: () => [],
  accepts: () => Catalog.Enabled(),
  nothingToChoose: 'Enter a slide page number',
}

/** Advances the carousel by one page (wrapping when `loop` is enabled). */
export const NextSlide = Catalog.action('NextSlide', {
  what: 'Advances the carousel to the next page',
  why: 'To view upcoming slides',
  meta: { label: 'Next slide', keys: [] },
})

/** Retreats the carousel by one page (wrapping when `loop` is enabled). */
export const PrevSlide = Catalog.action('PrevSlide', {
  what: 'Moves the carousel to the previous page',
  why: 'To revisit earlier slides',
  meta: { label: 'Previous slide', keys: [] },
})

/** Jumps directly to the 0-based page index `page`. */
export const GoToSlide = Catalog.action('GoToSlide', {
  fields: { page: S.Number },
  choose: chooseSlidePage,
  what: 'Jumps directly to the chosen slide page',
  why: 'To inspect a specific item in the sequence',
  meta: { label: 'Go to slide', keys: [] },
})

/** Starts automatic page advancement at `autoplayIntervalMs`. */
export const PlayCarousel = Catalog.action('PlayCarousel', {
  what: 'Starts automatic slide rotation',
  why: 'To cycle through items continuously',
  meta: { label: 'Play carousel', keys: [] },
})

/** Stops automatic page advancement and holds the current page. */
export const PauseCarousel = Catalog.action('PauseCarousel', {
  what: 'Pauses automatic slide rotation',
  why: 'To hold the current item in place',
  meta: { label: 'Pause carousel', keys: [] },
})

/** Starts automatic slide rotation when idle or pauses it when running. */
export const ToggleCarouselAutoplay = Catalog.action('ToggleCarouselAutoplay', {
  what: 'Starts automatic slide rotation or pauses it when active',
  why: 'To control continuous cycling of items',
  meta: { label: 'Toggle autoplay', keys: [] },
})

/** The Catalog Actions a Carousel Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  NextSlide,
  PrevSlide,
  GoToSlide,
  PlayCarousel,
  PauseCarousel,
  ToggleCarouselAutoplay,
]

// MESSAGES

/** Begins a pointer swipe gesture on the carousel viewport. */
export const BeginCarouselDrag = m('BeginCarouselDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  pointerType: S.optionalKey(S.String),
})

/** Updates the active swipe drag coordinate `(x, y)`. Synced via `Pace.Sampled`. */
export const MoveCarouselDrag = m('MoveCarouselDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/** Releases the active swipe drag, advancing or retreating when displacement crosses `swipeThresholdPx`. */
export const ReleaseCarouselDrag = m('ReleaseCarouselDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** Cancels the active swipe drag and keeps the original page. */
export const CancelCarouselDrag = m('CancelCarouselDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** Pointer or focus entered the carousel, pausing autoplay when `pauseOnHover` is enabled. */
export const EnterCarousel = m('EnterCarousel')

/** Pointer or focus left the carousel, resuming hover-paused autoplay when appropriate. */
export const LeaveCarousel = m('LeaveCarousel')

/** A keyboard navigation key was pressed (`ArrowLeft/Right/Up/Down`, `Home`, `End`, `Escape`). */
export const PressedCarouselKey = m('PressedCarouselKey', {
  key: S.String,
})

/** A scheduled autoplay interval elapsed for `version`. Ignored unless autoplaying on the matching version. */
export const ElapsedCarouselTick = m('ElapsedCarouselTick', {
  version: S.Number,
})

/** Every Message the Carousel chart handles. */
export const Message = S.Union([
  NextSlide,
  PrevSlide,
  GoToSlide,
  PlayCarousel,
  PauseCarousel,
  ToggleCarouselAutoplay,
  BeginCarouselDrag,
  MoveCarouselDrag,
  ReleaseCarouselDrag,
  CancelCarouselDrag,
  EnterCarousel,
  LeaveCarousel,
  PressedCarouselKey,
  ElapsedCarouselTick,
])
/** Every Message the Carousel chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Carousel Part. */
export const isMessage = S.is(Message)

// COMMANDS

/** Waits `afterMs` milliseconds and answers `ElapsedCarouselTick({ version })`. */
export const WaitForCarouselTick = Command.define(
  'WaitForCarouselTick',
  { version: S.Number, afterMs: S.Number },
  ElapsedCarouselTick,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedCarouselTick({ version })),
)

// ELEMENT IDS

/** Derives the root carousel landmark element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the slide viewport element id from a base `id`. */
export const viewportId = (id: string): string => `${id}-viewport`

/** Derives one 0-based slide item element id from a base `id` and `index`. */
export const slideId = (id: string, index: number): string =>
  `${id}-slide-${index.toString()}`

/** Derives the previous-slide button element id from a base `id`. */
export const prevButtonId = (id: string): string => `${id}-prev`

/** Derives the next-slide button element id from a base `id`. */
export const nextButtonId = (id: string): string => `${id}-next`

/** Derives one 0-based page indicator button element id from a base `id` and `page`. */
export const indicatorId = (id: string, page: number): string =>
  `${id}-indicator-${page.toString()}`

/** Derives the autoplay toggle button element id from a base `id`. */
export const autoplayTriggerId = (id: string): string => `${id}-autoplay`

// PURE RULES & CONFIGURATION READERS

/** Normalized non-negative slide count (`0` when non-finite or negative). */
export const slideCountOf = (props: Pick<Props, 'slideCount'>): number =>
  Number.isFinite(props.slideCount)
    ? Math.max(0, Math.floor(props.slideCount))
    : 0

/** Resolved slides visible per page (`1` by default, clamped to `>= 1`). */
export const slidesPerPageOf = (
  props: Pick<Props, 'slidesPerPage'> = {},
): number => {
  const raw = props.slidesPerPage ?? defaultSlidesPerPage
  return Number.isFinite(raw) && raw >= 1
    ? Math.floor(raw)
    : defaultSlidesPerPage
}

/** Resolved slides stepped per page move (`slidesPerPage` when `'Auto'` or omitted). */
export const slidesPerMoveOf = (
  props: Pick<Props, 'slidesPerPage' | 'slidesPerMove'> = {},
): number => {
  const perPage = slidesPerPageOf(props)
  if (props.slidesPerMove === undefined || props.slidesPerMove === 'Auto') {
    return perPage
  } else if (Number.isFinite(props.slidesPerMove) && props.slidesPerMove >= 1) {
    return Math.floor(props.slidesPerMove)
  } else {
    return perPage
  }
}

/** True when navigation and autoplay wrap around from last page to first (`false` by default). */
export const isLoopOf = (props: Pick<Props, 'loop'> = {}): boolean =>
  props.loop === true

/** Resolved carousel layout orientation (`'Horizontal'` by default). */
export const orientationOf = (
  props: Pick<Props, 'orientation'> = {},
): SlotOrientation => props.orientation ?? defaultOrientation

/** Resolved horizontal reading direction (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): PointerDrag.DragDirection => props.direction ?? defaultDirection

/** Resolved autoplay tick delay in milliseconds (`4000` by default, clamped to `>= 1`). */
export const autoplayIntervalMsOf = (
  props: Pick<Props, 'autoplayIntervalMs'> = {},
): number => {
  const raw = props.autoplayIntervalMs ?? defaultAutoplayIntervalMs
  return Number.isFinite(raw) && raw >= 1 ? raw : defaultAutoplayIntervalMs
}

/** True when mouse pointer dragging is enabled on the viewport (`false` by default, matching Zag). */
export const allowMouseDragOf = (
  props: Pick<Props, 'allowMouseDrag'> = {},
): boolean => props.allowMouseDrag === true

/** Resolved pointer swipe displacement threshold in pixels (`50` by default, clamped to `>= 1`). */
export const swipeThresholdPxOf = (
  props: Pick<Props, 'swipeThresholdPx'> = {},
): number => {
  const raw = props.swipeThresholdPx ?? defaultSwipeThresholdPx
  return Number.isFinite(raw) && raw >= 1 ? raw : defaultSwipeThresholdPx
}

/** True when entering the carousel pauses autoplay and leaving resumes it (`true` by default). */
export const pauseOnHoverOf = (
  props: Pick<Props, 'pauseOnHover'> = {},
): boolean => props.pauseOnHover ?? true

/** True when manual page navigation or dragging stops autoplay (`true` by default). */
export const pauseOnInteractionOf = (
  props: Pick<Props, 'pauseOnInteraction'> = {},
): boolean => props.pauseOnInteraction ?? true

/** Resolved pointer-move sync sampling window in milliseconds (`50` by default). */
export const sampleMsOf = (props: Pick<Props, 'sampleMs'> = {}): number =>
  props.sampleMs ?? defaultSampleMs

/** Resolved accessible label for the root carousel landmark (`'Carousel'` by default). */
export const labelOf = (props: Pick<Props, 'label'> = {}): string =>
  props.label ?? defaultLabel

/** True when the carousel controls are disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/**
 * Computes the starting 0-based slide index of every page given `slideCount`,
 * `slidesPerPage`, and `slidesPerMove`, matching Zag's `getPageSnapPoints`.
 *
 * @example
 * ```typescript
 * pageSnapPointsOf({ slideCount: 5, slidesPerPage: 1 }) // [0, 1, 2, 3, 4]
 * pageSnapPointsOf({ slideCount: 6, slidesPerPage: 2, slidesPerMove: 2 }) // [0, 2, 4]
 * pageSnapPointsOf({ slideCount: 5, slidesPerPage: 3, slidesPerMove: 1 }) // [0, 1, 2]
 * ```
 */
export const pageSnapPointsOf = (
  props: Pick<Props, 'slideCount' | 'slidesPerPage' | 'slidesPerMove'>,
): ReadonlyArray<number> => {
  const totalSlides = slideCountOf(props)
  if (totalSlides <= 0) {
    return []
  }
  const perPage = Math.min(slidesPerPageOf(props), totalSlides)
  const perMove = slidesPerMoveOf(props)
  const snapPoints: Array<number> = []
  for (let index = 0; index < totalSlides; index += perMove) {
    if (index + perPage > totalSlides) {
      break
    }
    snapPoints.push(index)
  }
  return Array.isReadonlyArrayEmpty(snapPoints) ? [0] : snapPoints
}

/**
 * Total number of navigable pages derived from `slideCount`, `slidesPerPage`,
 * and `slidesPerMove`.
 *
 * @example
 * ```typescript
 * pageCountOf({ slideCount: 5, slidesPerPage: 1 }) // 5
 * pageCountOf({ slideCount: 6, slidesPerPage: 2 }) // 3
 * ```
 */
export const pageCountOf = (
  props: Pick<Props, 'slideCount' | 'slidesPerPage' | 'slidesPerMove'>,
): number => pageSnapPointsOf(props).length

/** Clamps a candidate 0-based page index into `[0, max(0, pageCount - 1)]`. */
export const clampPage = (
  page: number,
  props: Pick<Props, 'slideCount' | 'slidesPerPage' | 'slidesPerMove'>,
): number => {
  const count = pageCountOf(props)
  if (count <= 0 || !Number.isFinite(page)) {
    return 0
  } else {
    return PointerDrag.clampValue(Math.floor(page), 0, count - 1)
  }
}

/** Projects `Carousel.Props` onto the underlying {@link PointerDrag.Props}. */
export const dragPropsOf = (
  props: Pick<
    Props,
    'orientation' | 'direction' | 'isDisabled' | 'sampleMs'
  > = {},
): PointerDrag.Props => ({
  axis: orientationOf(props),
  direction: directionOf(props),
  isDisabled: isDisabledOf(props),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

/** True when a pointer of `pointerType` is permitted to drag the carousel viewport. */
export const canDragPointer = (
  props: Pick<
    Props,
    | 'slideCount'
    | 'slidesPerPage'
    | 'slidesPerMove'
    | 'allowMouseDrag'
    | 'isDisabled'
  >,
  pointerType?: string,
): boolean =>
  !isDisabledOf(props) &&
  pageCountOf(props) > 1 &&
  (pointerType !== 'mouse' || allowMouseDragOf(props))

// READINGS

/** Active 0-based page index clamped against `props`. */
export const pageOf = (
  state: State,
  props: Pick<Props, 'slideCount' | 'slidesPerPage' | 'slidesPerMove'>,
): number => clampPage(state.page, props)

/** True while automatic slide rotation is running. */
export const isAutoplaying = (state: State): boolean =>
  state._tag === 'Autoplaying'

/** True while a pointer swipe drag is active. */
export const isDragging = (state: State): boolean => state._tag === 'Dragging'

/** True when the carousel is resting (neither autoplaying nor dragging). */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** Signed pointer displacement along the carousel axis while dragging, or `0` otherwise. */
export const dragOffsetPxOf = (state: State): number =>
  state._tag === 'Dragging' ? state.dragOffsetPx : 0

/** Current monotonic autoplay `TimedHint` version counter. */
export const autoplayVersionOf = (state: State): number =>
  TimedHint.versionOf(state.hint)

/** True when advancing forward to another page is possible from `state`. */
export const canNext = (
  state: State,
  props: Pick<Props, 'slideCount' | 'slidesPerPage' | 'slidesPerMove' | 'loop'>,
): boolean => {
  const count = pageCountOf(props)
  if (count <= 1) {
    return false
  } else {
    return isLoopOf(props) || pageOf(state, props) < count - 1
  }
}

/** True when moving backward to another page is possible from `state`. */
export const canPrev = (
  state: State,
  props: Pick<Props, 'slideCount' | 'slidesPerPage' | 'slidesPerMove' | 'loop'>,
): boolean => {
  const count = pageCountOf(props)
  if (count <= 1) {
    return false
  } else {
    return isLoopOf(props) || pageOf(state, props) > 0
  }
}

/** Zero-based slide indices visible on the currently active page. */
export const visibleSlideIndicesOf = (
  state: State,
  props: Pick<Props, 'slideCount' | 'slidesPerPage' | 'slidesPerMove'>,
): ReadonlyArray<number> => {
  const totalSlides = slideCountOf(props)
  if (totalSlides <= 0) {
    return []
  }
  const snapPoints = pageSnapPointsOf(props)
  const startSlide = Option.getOrElse(
    Array.get(snapPoints, pageOf(state, props)),
    () => 0,
  )
  const perPage = Math.min(slidesPerPageOf(props), totalSlides - startSlide)
  return Array.makeBy(perPage, offset => startSlide + offset)
}

/** True when 0-based `slideIndex` falls within the active page's visible window. */
export const isSlideInView = (
  state: State,
  props: Pick<Props, 'slideCount' | 'slidesPerPage' | 'slidesPerMove'>,
  slideIndex: number,
): boolean => Array.contains(visibleSlideIndicesOf(state, props), slideIndex)

/** Normalized progress ratio in `[0, 1]` across navigable pages (`0` on page 0, `1` on last page). */
export const progressOf = (
  state: State,
  props: Pick<Props, 'slideCount' | 'slidesPerPage' | 'slidesPerMove'>,
): number => {
  const count = pageCountOf(props)
  if (count <= 1) {
    return count === 1 ? 1 : 0
  } else {
    return PointerDrag.clampValue(pageOf(state, props) / (count - 1), 0, 1)
  }
}

/** Resolves the next page index after stepping forward by one page. */
export const nextPageOf = (
  currentPage: number,
  props: Pick<Props, 'slideCount' | 'slidesPerPage' | 'slidesPerMove' | 'loop'>,
): number => {
  const count = pageCountOf(props)
  if (count <= 1) {
    return 0
  }
  const clamped = clampPage(currentPage, props)
  if (clamped < count - 1) {
    return clamped + 1
  } else if (isLoopOf(props)) {
    return 0
  } else {
    return clamped
  }
}

/** Resolves the previous page index after stepping backward by one page. */
export const prevPageOf = (
  currentPage: number,
  props: Pick<Props, 'slideCount' | 'slidesPerPage' | 'slidesPerMove' | 'loop'>,
): number => {
  const count = pageCountOf(props)
  if (count <= 1) {
    return 0
  }
  const clamped = clampPage(currentPage, props)
  if (clamped > 0) {
    return clamped - 1
  } else if (isLoopOf(props)) {
    return count - 1
  } else {
    return clamped
  }
}

/**
 * Resolves the page index after releasing a swipe drag of signed axis delta
 * `dragOffsetPx`: negative delta beyond `swipeThresholdPx` advances one page,
 * positive delta beyond `swipeThresholdPx` retreats one page, and smaller
 * drags snap back to `currentPage`.
 */
export const resolveSwipeReleasePage = (
  currentPage: number,
  dragOffsetPx: number,
  props: Pick<
    Props,
    | 'slideCount'
    | 'slidesPerPage'
    | 'slidesPerMove'
    | 'loop'
    | 'swipeThresholdPx'
  >,
): number => {
  const threshold = swipeThresholdPxOf(props)
  if (dragOffsetPx <= -threshold) {
    return nextPageOf(currentPage, props)
  } else if (dragOffsetPx >= threshold) {
    return prevPageOf(currentPage, props)
  } else {
    return clampPage(currentPage, props)
  }
}

// INTERNAL CHART HELPERS

const waitCommandsFor = (
  hint: TimedHint.State,
  hintCommands: ReadonlyArray<Command.Command<TimedHint.Message>>,
): ReadonlyArray<Command.Command<Message>> =>
  Array.isReadonlyArrayNonEmpty(hintCommands)
    ? Option.match(TimedHint.durationMsOf(hint), {
        onNone: () => [],
        onSome: afterMs => [
          WaitForCarouselTick({
            version: TimedHint.versionOf(hint),
            afterMs,
          }),
        ],
      })
    : []

const canAutoplayPage = (page: number, props: Props): boolean => {
  const count = pageCountOf(props)
  return (
    !isDisabledOf(props) && count > 1 && (isLoopOf(props) || page < count - 1)
  )
}

const startAutoplayOn = (
  page: number,
  hint: TimedHint.State,
  isHovering: boolean,
  props: Props,
): EdgeReturn<Autoplaying, Message> => {
  const [nextHint, hintCommands] = TimedHint.chart.transition(
    hint,
    TimedHint.ShowHint({
      maybeDurationMs: Option.some(autoplayIntervalMsOf(props)),
    }),
  )
  return {
    model: Autoplaying({
      page: clampPage(page, props),
      hint: nextHint,
      isHovering,
    }),
    commands: waitCommandsFor(nextHint, hintCommands),
  }
}

const pauseHintOf = (hint: TimedHint.State): TimedHint.State => {
  const [nextHint] = TimedHint.chart.transition(hint, TimedHint.PauseHint())
  return nextHint
}

const dismissHintOf = (hint: TimedHint.State): TimedHint.State => {
  const [nextHint] = TimedHint.chart.transition(hint, TimedHint.DismissHint())
  return nextHint
}

const resumeAutoplayOn = (
  page: number,
  hint: TimedHint.State,
  props: Props,
): EdgeReturn<Autoplaying, Message> => {
  const [resumedHint, hintCommands] = TimedHint.chart.transition(
    hint,
    TimedHint.ResumeHint(),
  )
  if (TimedHint.isActive(resumedHint)) {
    return {
      model: Autoplaying({
        page: clampPage(page, props),
        hint: resumedHint,
        isHovering: false,
      }),
      commands: waitCommandsFor(resumedHint, hintCommands),
    }
  } else {
    return startAutoplayOn(page, resumedHint, false, props)
  }
}

const startDragOf = (
  pointerId: number,
  x: number,
  y: number,
  page: number,
  props: Props,
): Option.Option<PointerDrag.Dragging> => {
  const [nextDrag] = PointerDrag.chart.transition(
    PointerDrag.Idle(),
    PointerDrag.StartDrag({ pointerId, x, y, originValue: page }),
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

const resolveKeyPage = (
  currentPage: number,
  key: string,
  props: Props,
): Option.Option<number> => {
  const count = pageCountOf(props)
  if (isDisabledOf(props) || count <= 0) {
    return Option.none()
  }
  const orientation = orientationOf(props)
  const isRtl = directionOf(props) === 'Rtl'
  if (key === 'Home') {
    return Option.some(0)
  } else if (key === 'End') {
    return Option.some(count - 1)
  } else if (orientation === 'Horizontal') {
    if (key === 'ArrowRight') {
      return Option.some(
        isRtl ? prevPageOf(currentPage, props) : nextPageOf(currentPage, props),
      )
    } else if (key === 'ArrowLeft') {
      return Option.some(
        isRtl ? nextPageOf(currentPage, props) : prevPageOf(currentPage, props),
      )
    } else {
      return Option.none()
    }
  } else if (key === 'ArrowDown') {
    return Option.some(nextPageOf(currentPage, props))
  } else if (key === 'ArrowUp') {
    return Option.some(prevPageOf(currentPage, props))
  } else {
    return Option.none()
  }
}

// CHART

/**
 * The Carousel Machine chart: `Idle | Autoplaying | Dragging` composing
 * `PointerDrag` and `TimedHint` (`WaitForCarouselTick` backed by
 * `Command.answerAfter` with monotonic version checking), paging with
 * `slidesPerPage`/`slidesPerMove`/`loop`, swipe threshold release, keyboard
 * navigation, and pause-on-hover/interaction.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Idle: {
        on: {
          NextSlide: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && canNext(state, context),
              'Idle',
              ({ state, context }) =>
                Idle({
                  ...state,
                  page: nextPageOf(state.page, context),
                  shouldResumeAfterHover: pauseOnInteractionOf(context)
                    ? false
                    : state.shouldResumeAfterHover,
                }),
            ),
            ignore(),
          ],
          PrevSlide: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && canPrev(state, context),
              'Idle',
              ({ state, context }) =>
                Idle({
                  ...state,
                  page: prevPageOf(state.page, context),
                  shouldResumeAfterHover: pauseOnInteractionOf(context)
                    ? false
                    : state.shouldResumeAfterHover,
                }),
            ),
            ignore(),
          ],
          GoToSlide: [
            when(
              (_state, _message, context) =>
                !isDisabledOf(context) && pageCountOf(context) > 0,
              'Idle',
              ({ state, message, context }) =>
                Idle({
                  ...state,
                  page: clampPage(message.page, context),
                  shouldResumeAfterHover: pauseOnInteractionOf(context)
                    ? false
                    : state.shouldResumeAfterHover,
                }),
            ),
            ignore(),
          ],
          PlayCarousel: [
            when(
              (state, _message, context) =>
                canAutoplayPage(pageOf(state, context), context),
              'Autoplaying',
              ({ state, context }) =>
                startAutoplayOn(
                  state.page,
                  state.hint,
                  state.isHovering,
                  context,
                ),
            ),
            ignore(),
          ],
          ToggleCarouselAutoplay: [
            when(
              (state, _message, context) =>
                canAutoplayPage(pageOf(state, context), context),
              'Autoplaying',
              ({ state, context }) =>
                startAutoplayOn(
                  state.page,
                  state.hint,
                  state.isHovering,
                  context,
                ),
            ),
            ignore(),
          ],
          PauseCarousel: [
            when(
              state => state.shouldResumeAfterHover,
              'Idle',
              ({ state }) =>
                Idle({
                  ...state,
                  hint: dismissHintOf(state.hint),
                  shouldResumeAfterHover: false,
                }),
            ),
            ignore(),
          ],
          BeginCarouselDrag: [
            when(
              (state, message, context) =>
                canDragPointer(context, message.pointerType)
                  ? startDragOf(
                      message.pointerId,
                      message.x,
                      message.y,
                      pageOf(state, context),
                      context,
                    )
                  : Option.none(),
              'Dragging',
              ({ state, guardValue, context }) =>
                Dragging({
                  page: pageOf(state, context),
                  hint: state.hint,
                  drag: guardValue,
                  dragOffsetPx: 0,
                  wasAutoplaying:
                    state.shouldResumeAfterHover &&
                    !pauseOnInteractionOf(context),
                  isHovering: state.isHovering,
                }),
            ),
            ignore(),
          ],
          MoveCarouselDrag: [ignore()],
          ReleaseCarouselDrag: [ignore()],
          CancelCarouselDrag: [ignore()],
          EnterCarousel: [
            when(
              state => !state.isHovering,
              'Idle',
              ({ state }) => Idle({ ...state, isHovering: true }),
            ),
            ignore(),
          ],
          LeaveCarousel: [
            when(
              (state, _message, context) =>
                state.shouldResumeAfterHover &&
                canAutoplayPage(pageOf(state, context), context),
              'Autoplaying',
              ({ state, context }) =>
                resumeAutoplayOn(state.page, state.hint, context),
            ),
            when(
              state => state.isHovering || state.shouldResumeAfterHover,
              'Idle',
              ({ state }) =>
                Idle({
                  ...state,
                  isHovering: false,
                  shouldResumeAfterHover: false,
                }),
            ),
            ignore(),
          ],
          PressedCarouselKey: [
            when(
              (state, message, context) =>
                resolveKeyPage(state.page, message.key, context),
              'Idle',
              ({ state, guardValue, context }) =>
                Idle({
                  ...state,
                  page: guardValue,
                  shouldResumeAfterHover: pauseOnInteractionOf(context)
                    ? false
                    : state.shouldResumeAfterHover,
                }),
            ),
            ignore(),
          ],
          ElapsedCarouselTick: [ignore()],
        },
      },
      Autoplaying: {
        on: {
          NextSlide: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) &&
                canNext(state, context) &&
                pauseOnInteractionOf(context),
              'Idle',
              ({ state, context }) =>
                Idle({
                  page: nextPageOf(state.page, context),
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            when(
              (state, _message, context) =>
                !isDisabledOf(context) &&
                canNext(state, context) &&
                canAutoplayPage(nextPageOf(state.page, context), context),
              'Autoplaying',
              ({ state, context }) =>
                startAutoplayOn(
                  nextPageOf(state.page, context),
                  state.hint,
                  state.isHovering,
                  context,
                ),
            ),
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && canNext(state, context),
              'Idle',
              ({ state, context }) =>
                Idle({
                  page: nextPageOf(state.page, context),
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            ignore(),
          ],
          PrevSlide: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) &&
                canPrev(state, context) &&
                pauseOnInteractionOf(context),
              'Idle',
              ({ state, context }) =>
                Idle({
                  page: prevPageOf(state.page, context),
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && canPrev(state, context),
              'Autoplaying',
              ({ state, context }) =>
                startAutoplayOn(
                  prevPageOf(state.page, context),
                  state.hint,
                  state.isHovering,
                  context,
                ),
            ),
            ignore(),
          ],
          GoToSlide: [
            when(
              (_state, _message, context) =>
                !isDisabledOf(context) &&
                pageCountOf(context) > 0 &&
                pauseOnInteractionOf(context),
              'Idle',
              ({ state, message, context }) =>
                Idle({
                  page: clampPage(message.page, context),
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            when(
              (_state, message, context) =>
                !isDisabledOf(context) &&
                pageCountOf(context) > 0 &&
                canAutoplayPage(clampPage(message.page, context), context),
              'Autoplaying',
              ({ state, message, context }) =>
                startAutoplayOn(
                  clampPage(message.page, context),
                  state.hint,
                  state.isHovering,
                  context,
                ),
            ),
            when(
              (_state, _message, context) =>
                !isDisabledOf(context) && pageCountOf(context) > 0,
              'Idle',
              ({ state, message, context }) =>
                Idle({
                  page: clampPage(message.page, context),
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            ignore(),
          ],
          PlayCarousel: [ignore()],
          PauseCarousel: to('Idle', ({ state }) =>
            Idle({
              page: state.page,
              hint: dismissHintOf(state.hint),
              isHovering: state.isHovering,
              shouldResumeAfterHover: false,
            }),
          ),
          ToggleCarouselAutoplay: to('Idle', ({ state }) =>
            Idle({
              page: state.page,
              hint: dismissHintOf(state.hint),
              isHovering: state.isHovering,
              shouldResumeAfterHover: false,
            }),
          ),
          BeginCarouselDrag: [
            when(
              (state, message, context) =>
                canDragPointer(context, message.pointerType)
                  ? startDragOf(
                      message.pointerId,
                      message.x,
                      message.y,
                      pageOf(state, context),
                      context,
                    )
                  : Option.none(),
              'Dragging',
              ({ state, guardValue, context }) =>
                Dragging({
                  page: pageOf(state, context),
                  hint: pauseHintOf(state.hint),
                  drag: guardValue,
                  dragOffsetPx: 0,
                  wasAutoplaying: true,
                  isHovering: state.isHovering,
                }),
            ),
            ignore(),
          ],
          MoveCarouselDrag: [ignore()],
          ReleaseCarouselDrag: [ignore()],
          CancelCarouselDrag: [ignore()],
          EnterCarousel: [
            when(
              (_state, _message, context) => pauseOnHoverOf(context),
              'Idle',
              ({ state }) =>
                Idle({
                  page: state.page,
                  hint: pauseHintOf(state.hint),
                  isHovering: true,
                  shouldResumeAfterHover: true,
                }),
            ),
            when(
              state => !state.isHovering,
              'Autoplaying',
              ({ state }) => Autoplaying({ ...state, isHovering: true }),
            ),
            ignore(),
          ],
          LeaveCarousel: [
            when(
              state => state.isHovering,
              'Autoplaying',
              ({ state }) => Autoplaying({ ...state, isHovering: false }),
            ),
            ignore(),
          ],
          PressedCarouselKey: [
            when(
              (state, message, context) =>
                pauseOnInteractionOf(context)
                  ? resolveKeyPage(state.page, message.key, context)
                  : Option.none(),
              'Idle',
              ({ state, guardValue }) =>
                Idle({
                  page: guardValue,
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            when(
              (state, message, context) =>
                Option.filter(
                  resolveKeyPage(state.page, message.key, context),
                  next => canAutoplayPage(next, context),
                ),
              'Autoplaying',
              ({ state, guardValue, context }) =>
                startAutoplayOn(
                  guardValue,
                  state.hint,
                  state.isHovering,
                  context,
                ),
            ),
            when(
              (state, message, context) =>
                resolveKeyPage(state.page, message.key, context),
              'Idle',
              ({ state, guardValue }) =>
                Idle({
                  page: guardValue,
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            ignore(),
          ],
          ElapsedCarouselTick: [
            when(
              (state, message, context) =>
                TimedHint.shouldAcceptElapsed(state.hint, message.version) &&
                canAutoplayPage(state.page, context) &&
                canAutoplayPage(nextPageOf(state.page, context), context),
              'Autoplaying',
              ({ state, message, context }) => {
                const [elapsedHint] = TimedHint.chart.transition(
                  state.hint,
                  TimedHint.ElapsedHint({ version: message.version }),
                )
                return startAutoplayOn(
                  nextPageOf(state.page, context),
                  elapsedHint,
                  state.isHovering,
                  context,
                )
              },
            ),
            when(
              (state, message) =>
                TimedHint.shouldAcceptElapsed(state.hint, message.version),
              'Idle',
              ({ state, message, context }) => {
                const [elapsedHint] = TimedHint.chart.transition(
                  state.hint,
                  TimedHint.ElapsedHint({ version: message.version }),
                )
                const nextPage = canNext(state, context)
                  ? nextPageOf(state.page, context)
                  : pageOf(state, context)
                return Idle({
                  page: nextPage,
                  hint: elapsedHint,
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                })
              },
            ),
            ignore(),
          ],
        },
      },
      Dragging: {
        on: {
          NextSlide: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && canNext(state, context),
              'Idle',
              ({ state, context }) =>
                Idle({
                  page: nextPageOf(state.page, context),
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            ignore(),
          ],
          PrevSlide: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && canPrev(state, context),
              'Idle',
              ({ state, context }) =>
                Idle({
                  page: prevPageOf(state.page, context),
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            ignore(),
          ],
          GoToSlide: [
            when(
              (_state, _message, context) =>
                !isDisabledOf(context) && pageCountOf(context) > 0,
              'Idle',
              ({ state, message, context }) =>
                Idle({
                  page: clampPage(message.page, context),
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            ignore(),
          ],
          PlayCarousel: [ignore()],
          PauseCarousel: to('Idle', ({ state }) =>
            Idle({
              page: state.page,
              hint: dismissHintOf(state.hint),
              isHovering: state.isHovering,
              shouldResumeAfterHover: false,
            }),
          ),
          ToggleCarouselAutoplay: to('Idle', ({ state }) =>
            Idle({
              page: state.page,
              hint: dismissHintOf(state.hint),
              isHovering: state.isHovering,
              shouldResumeAfterHover: false,
            }),
          ),
          BeginCarouselDrag: [ignore()],
          MoveCarouselDrag: [
            when(
              (state, message, context) =>
                !isDisabledOf(context) &&
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
                return Dragging({
                  ...state,
                  drag: nextDrag,
                  dragOffsetPx: PointerDrag.axisDeltaOf(
                    nextDrag,
                    dragPropsOf(context),
                  ),
                })
              },
            ),
            ignore(),
          ],
          ReleaseCarouselDrag: [
            when(
              (state, message, context) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId) &&
                state.wasAutoplaying &&
                !pauseOnInteractionOf(context) &&
                canAutoplayPage(
                  resolveSwipeReleasePage(
                    state.page,
                    state.dragOffsetPx,
                    context,
                  ),
                  context,
                ),
              'Autoplaying',
              ({ state, context }) =>
                startAutoplayOn(
                  resolveSwipeReleasePage(
                    state.page,
                    state.dragOffsetPx,
                    context,
                  ),
                  state.hint,
                  state.isHovering,
                  context,
                ),
            ),
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state, context }) =>
                Idle({
                  page: resolveSwipeReleasePage(
                    state.page,
                    state.dragOffsetPx,
                    context,
                  ),
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            ignore(),
          ],
          CancelCarouselDrag: [
            when(
              (state, message, context) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId) &&
                state.wasAutoplaying &&
                !pauseOnInteractionOf(context) &&
                canAutoplayPage(state.page, context),
              'Autoplaying',
              ({ state, context }) =>
                startAutoplayOn(
                  state.page,
                  state.hint,
                  state.isHovering,
                  context,
                ),
            ),
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state }) =>
                Idle({
                  page: state.page,
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            ignore(),
          ],
          EnterCarousel: [
            when(
              state => !state.isHovering,
              'Dragging',
              ({ state }) => Dragging({ ...state, isHovering: true }),
            ),
            ignore(),
          ],
          LeaveCarousel: [
            when(
              state => state.isHovering,
              'Dragging',
              ({ state }) => Dragging({ ...state, isHovering: false }),
            ),
            ignore(),
          ],
          PressedCarouselKey: [
            when(
              (_state, message) => PointerDrag.isCancelKey(message.key),
              'Idle',
              ({ state }) =>
                Idle({
                  page: state.page,
                  hint: dismissHintOf(state.hint),
                  isHovering: state.isHovering,
                  shouldResumeAfterHover: false,
                }),
            ),
            ignore(),
          ],
          ElapsedCarouselTick: [ignore()],
        },
      },
    },
  },
)

// SYNC

/**
 * Builds the Carousel sync table using `Pace.Sampled({ everyMs })` on
 * `MoveCarouselDrag` (50 ms default) and `Pace.Synced()` on all discrete page,
 * autoplay, drag start/release/cancel, and keyboard transitions.
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  NextSlide: Synced(),
  PrevSlide: Synced(),
  GoToSlide: Synced(),
  PlayCarousel: Synced(),
  PauseCarousel: Synced(),
  ToggleCarouselAutoplay: Synced(),
  BeginCarouselDrag: Synced(),
  MoveCarouselDrag: Sampled({ everyMs: sampleMs }),
  ReleaseCarouselDrag: Synced(),
  CancelCarouselDrag: Synced(),
  EnterCarousel: Synced(),
  LeaveCarousel: Synced(),
  PressedCarouselKey: Synced(),
  ElapsedCarouselTick: Synced(),
})

/** Default Carousel synchronization: `MoveCarouselDrag` sampled at 50 ms, all discrete transitions synced immediately. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a Carousel kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  NextSlide: Device({ because }),
  PrevSlide: Device({ because }),
  GoToSlide: Device({ because }),
  PlayCarousel: Device({ because }),
  PauseCarousel: Device({ because }),
  ToggleCarouselAutoplay: Device({ because }),
  BeginCarouselDrag: Device({ because }),
  MoveCarouselDrag: Device({ because }),
  ReleaseCarouselDrag: Device({ because }),
  CancelCarouselDrag: Device({ because }),
  EnterCarousel: Device({ because }),
  LeaveCarousel: Device({ because }),
  PressedCarouselKey: Device({ because }),
  ElapsedCarouselTick: Device({ because }),
})

/** Returns the {@link Sync} pace for one Carousel Message under `sampleMs`. */
export const paceOf = (
  message: Message,
  sampleMs: number = defaultSampleMs,
): Sync => syncOf(sampleMs)[message._tag]

// SLOTS & PROJECTION

/**
 * The seven painted slots of a Carousel Part: `Root`, `Viewport`, `Slide`,
 * `PrevButton`, `NextButton`, `Indicator`, and `AutoplayTrigger`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  Viewport: {
    role: 'Group',
    focus: 'Container',
    gestures: [],
  },
  Slide: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  PrevButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'PrevSlide' }],
  },
  NextButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'NextSlide' }],
  },
  Indicator: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'GoToSlide' }],
  },
  AutoplayTrigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleCarouselAutoplay' }],
  },
}

const parseChoiceIndex = (maybeChoice: Option.Option<string>): number =>
  Option.match(maybeChoice, {
    onNone: () => 0,
    onSome: raw => {
      const parsed = Number(raw)
      return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
    },
  })

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const orientation = orientationOf(props)
  const disabled = isDisabledOf(props)
  const activePage = pageOf(state, props)

  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      label: labelOf(props),
      orientation,
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Viewport') {
    return {
      id: viewportId(props.id),
      orientation,
      live: isAutoplaying(state) ? 'Off' : 'Polite',
      ...(disabled ? { isDisabled: true } : { tabIndex: 0 }),
    }
  } else if (slot === 'Slide') {
    const index = parseChoiceIndex(maybeChoice)
    const total = slideCountOf(props)
    const inView = isSlideInView(state, props, index)
    return {
      id: slideId(props.id, index),
      label: `${(index + 1).toString()} of ${total.toString()}`,
      orientation,
      isCurrent: inView,
      ...(inView ? {} : { isHidden: true }),
    }
  } else if (slot === 'PrevButton') {
    return {
      id: prevButtonId(props.id),
      label: 'Previous slide',
      controls: viewportId(props.id),
      isDisabled: disabled || !canPrev(state, props),
    }
  } else if (slot === 'NextButton') {
    return {
      id: nextButtonId(props.id),
      label: 'Next slide',
      controls: viewportId(props.id),
      isDisabled: disabled || !canNext(state, props),
    }
  } else if (slot === 'Indicator') {
    const pageIndex = parseChoiceIndex(maybeChoice)
    return {
      id: indicatorId(props.id, pageIndex),
      label: `Go to slide ${(pageIndex + 1).toString()}`,
      controls: viewportId(props.id),
      isCurrent: pageIndex === activePage,
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'AutoplayTrigger') {
    const playing = isAutoplaying(state)
    return {
      id: autoplayTriggerId(props.id),
      label: playing ? 'Pause slide rotation' : 'Start slide rotation',
      isPressed: playing,
      controls: viewportId(props.id),
      isDisabled: disabled || pageCountOf(props) <= 1,
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a Carousel on: idle at its current `page` with the
 * monotonic `TimedHint` version preserved, so no session reopens mid-drag or
 * with an unscheduled autoplay countdown.
 */
export const atRest = (state: State): State =>
  Idle({
    page: state.page,
    hint: TimedHint.atRest(state.hint),
    isHovering: false,
    shouldResumeAfterHover: false,
  })

// PART FACTORY

/** Options for customizing a Carousel Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Carousel device-only. */
  sync?: 'Synced' | DeviceReason
  /** Pointer-move sync sampling interval in milliseconds (`50` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Carousel {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`, `MoveCarouselDrag` at `Pace.Sampled({ everyMs: 50 })`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Carousel local to one device.
 *
 * @example
 * ```typescript
 * const HeroCarousel = Carousel.make({ name: 'HeroCarousel' })
 * const LocalCarousel = Carousel.deviceOnly({ name: 'LocalCarousel' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  return Part.define<State, Message, Props>({
    name: options.name ?? 'Carousel',
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

/** Shorthand for a Carousel Part whose state stays on the device and is omitted from the synced log and encoded Model. */
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

/** The default synced Carousel Part (`name: 'Carousel'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

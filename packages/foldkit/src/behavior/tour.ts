import { Array, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  define,
  ignore,
  otherwise,
  to,
  when,
} from '../experimental/machine/machine.js'
import type { BoxLayer } from '../renderers/types.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as Layers from './layers.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as Placement from './placement.js'
import * as PointerDrag from './pointerDrag.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core Tour Part (Widget #48 of 54, Scribe #2687). It
// composes `Placement` and `Layers` into one framework-free Machine and Part
// declaration covering Zag tour: multi-step guided walkthrough (`TourStep`
// with `id`, `title`, `description`, optional `targetRect`, `preferredSide`,
// `isSkippable`), `StartTour`/`NextStep`/`PrevStep`/`GoToStep`/`SkipTour`/
// `DismissTour`, spotlight cutout geometry (`spotlightRectOf` with
// configurable padding), `placeFor` popover positioning, `progressOf`
// (`0..1`), and keyboard Arrow/Escape handling honoring `Layers`. Its state
// (`Idle` | `Running`) lives in the Model, synced by default (`Navigation`
// category, `Pace.Synced`) with `Tour.make` and `Tour.deviceOnly()`, and
// projects reference-stable SlotBindings (`Backdrop`, `Spotlight`, `Content`,
// `Title`, `Description`, `NextButton`, `PrevButton`, `SkipButton`,
// `CloseButton`).

// CONSTANTS

/** Default padding in pixels expanding a step's `targetRect` into its spotlight cutout (`10`, matching Zag Tour). */
export const defaultSpotlightPaddingPx = 10

/** Default horizontal reading direction (`'Ltr'`). */
export const defaultDirection: PointerDrag.DragDirection = 'Ltr'

// SCHEMAS

/** Optional placement spacing overrides for the Tour popover card. */
export const PlacementOptions = S.Struct({
  gapPx: S.optionalKey(S.Number),
  edgePx: S.optionalKey(S.Number),
})
/** Optional placement spacing overrides for the Tour popover card. */
export type PlacementOptions = typeof PlacementOptions.Type

/** Why a previous walkthrough session ended (`Completed`, `Skipped`, or `Dismissed`). */
export const EndReason = S.Literals(['Completed', 'Skipped', 'Dismissed'])
/** Why a previous walkthrough session ended. */
export type EndReason = typeof EndReason.Type

/**
 * One step of a guided tour walkthrough. When `targetRect` is provided, the
 * spotlight highlights that region and `placeFor` anchors the dialog popover
 * beside it; when omitted, the step presents as a centered modal dialog.
 */
export const TourStep = S.Struct({
  id: S.String,
  title: S.String,
  description: S.String,
  targetRect: S.optionalKey(Placement.Rect),
  preferredSide: S.optionalKey(Placement.Side),
  isSkippable: S.optionalKey(S.Boolean),
})
/** One step of a guided tour walkthrough. */
export type TourStep = typeof TourStep.Type

/**
 * Read-only configuration supplied to the Tour chart and projection from the
 * Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  steps: S.Array(TourStep),
  spotlightPaddingPx: S.optionalKey(S.Number),
  isModal: S.optionalKey(S.Boolean),
  dismissOnEscape: S.optionalKey(S.Boolean),
  dismissOnOutsidePress: S.optionalKey(S.Boolean),
  keyboardNavigation: S.optionalKey(S.Boolean),
  direction: S.optionalKey(PointerDrag.DragDirection),
  placement: S.optionalKey(PlacementOptions),
  layers: S.optionalKey(Layers.Stack),
  label: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the Tour chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The tour is inactive, optionally recording how the last run ended. */
export const Idle = ts('Idle', {
  maybeEndedReason: S.Option(EndReason),
})
/** The tour is inactive. */
export type Idle = typeof Idle.Type

/** The tour is active on 0-based `stepIndex` within `props.steps`. */
export const Running = ts('Running', {
  stepIndex: S.Number,
})
/** The tour is active on `stepIndex`. */
export type Running = typeof Running.Type

/** Where a Tour Part stands: `Idle` or `Running`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Running])
/** Where a Tour Part stands. */
export type State = typeof State.Type

/** Initial Tour state: inactive with no prior end reason. */
export const initial: State = Idle({ maybeEndedReason: Option.none() })

// ACTIONS

const chooseStepIndex: Readonly<{
  field: 'stepIndex'
  noun: string
  prompt: string
  token: typeof S.FiniteFromString
  choicesOf: () => ReadonlyArray<never>
  accepts: () => ReturnType<typeof Catalog.Enabled>
  nothingToChoose: string
}> = {
  field: 'stepIndex',
  noun: 'step index',
  prompt: 'Jump to which walkthrough step?',
  token: S.FiniteFromString,
  choicesOf: () => [],
  accepts: () => Catalog.Enabled(),
  nothingToChoose: 'Enter a step number',
}

/** Starts the guided walkthrough on the first step (`stepIndex: 0`). */
export const StartTour = Catalog.action('StartTour', {
  what: 'Starts the guided walkthrough from the first step',
  why: 'To explore key features in sequence',
  meta: { label: 'Start tour', keys: [] },
})

/** Advances to the next step, or completes the walkthrough when already on the final step. */
export const NextStep = Catalog.action('NextStep', {
  what: 'Advances the walkthrough to the next step or finishes on the last',
  why: 'To continue through the guided sequence',
  meta: { label: 'Next step', keys: [] },
})

/** Moves back to the previous step when not on the first step. */
export const PrevStep = Catalog.action('PrevStep', {
  what: 'Returns the walkthrough to the previous step',
  why: 'To review an earlier explanation',
  meta: { label: 'Previous step', keys: [] },
})

/** Jumps directly to the clamped 0-based `stepIndex`, starting the tour if idle. */
export const GoToStep = Catalog.action('GoToStep', {
  fields: { stepIndex: S.Number },
  choose: chooseStepIndex,
  what: 'Jumps the walkthrough directly to the chosen step',
  why: 'To inspect a particular highlight out of order',
  meta: { label: 'Go to step', keys: [] },
})

/** Skips the remaining steps of the tour when the current step permits skipping. */
export const SkipTour = Catalog.action('SkipTour', {
  what: 'Skips the remainder of the walkthrough when allowed',
  why: 'To resume ordinary work immediately',
  meta: { label: 'Skip tour', keys: [] },
})

/** Dismisses the active tour unconditionally (for example from the close button). */
export const DismissTour = Catalog.action('DismissTour', {
  what: 'Closes the active walkthrough overlay',
  why: 'To leave the guide at the current step',
  meta: { label: 'Close tour', keys: [] },
})

/** Dismisses the active tour when it is topmost in `Layers` and outside dismissal is allowed. */
export const DismissTourOutside = Catalog.action('DismissTourOutside', {
  what: 'Closes the active walkthrough when outside dismissal is permitted',
  why: 'To exit by interacting away from the guide',
  meta: { label: 'Dismiss tour', keys: [] },
})

/** The Catalog Actions a Tour Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  StartTour,
  NextStep,
  PrevStep,
  GoToStep,
  SkipTour,
  DismissTour,
  DismissTourOutside,
]

// MESSAGES

/** A key was pressed while the tour is running (`Escape`, `ArrowLeft`, `ArrowRight`). */
export const PressedTourKey = m('PressedTourKey', {
  key: S.String,
})

/** A pointer press landed outside the layers listed in `insideIds`. */
export const PressedOutsideTour = m('PressedOutsideTour', {
  insideIds: S.Array(S.String),
})

/** Every Message the Tour chart handles. */
export const Message = S.Union([
  StartTour,
  NextStep,
  PrevStep,
  GoToStep,
  SkipTour,
  DismissTour,
  DismissTourOutside,
  PressedTourKey,
  PressedOutsideTour,
])
/** Every Message the Tour chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Tour Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the backdrop element id from a Tour base `id`. */
export const backdropId = (id: string): string => `${id}-backdrop`

/** Derives the spotlight cutout element id from a Tour base `id`. */
export const spotlightId = (id: string): string => `${id}-spotlight`

/** Derives the tour step dialog content element id from a Tour base `id`. */
export const contentId = (id: string): string => `${id}-content`

/** Derives the step title heading element id from a Tour base `id`. */
export const titleId = (id: string): string => `${id}-title`

/** Derives the step description element id from a Tour base `id`. */
export const descriptionId = (id: string): string => `${id}-description`

/** Derives the next/finish button element id from a Tour base `id`. */
export const nextButtonId = (id: string): string => `${id}-next`

/** Derives the previous button element id from a Tour base `id`. */
export const prevButtonId = (id: string): string => `${id}-prev`

/** Derives the skip button element id from a Tour base `id`. */
export const skipButtonId = (id: string): string => `${id}-skip`

/** Derives the close button element id from a Tour base `id`. */
export const closeButtonId = (id: string): string => `${id}-close`

// PURE RULES & CONFIGURATION READERS

/** Resolved spotlight cutout padding in pixels (`10` by default, clamped `>= 0`). */
export const spotlightPaddingPxOf = (
  props: Pick<Props, 'spotlightPaddingPx'> = {},
): number => {
  const raw = props.spotlightPaddingPx ?? defaultSpotlightPaddingPx
  return Number.isFinite(raw) ? Math.max(0, raw) : defaultSpotlightPaddingPx
}

/** True when the tour dialog is modal (`true` by default). */
export const isModalOf = (props: Pick<Props, 'isModal'> = {}): boolean =>
  props.isModal ?? true

/** True when pressing Escape dismisses the tour (`true` by default). */
export const dismissesOnEscapeOf = (
  props: Pick<Props, 'dismissOnEscape'> = {},
): boolean => props.dismissOnEscape ?? true

/** True when pressing outside or on the backdrop dismisses the tour (`true` by default). */
export const dismissesOnOutsidePressOf = (
  props: Pick<Props, 'dismissOnOutsidePress'> = {},
): boolean => props.dismissOnOutsidePress ?? true

/** True when ArrowLeft/ArrowRight step through the tour (`true` by default). */
export const keyboardNavigationOf = (
  props: Pick<Props, 'keyboardNavigation'> = {},
): boolean => props.keyboardNavigation ?? true

/** Resolved horizontal reading direction (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): PointerDrag.DragDirection => props.direction ?? defaultDirection

/** Builds the {@link Layers.Layer} entry representing this Tour. */
export const layerOf = (
  props: Pick<
    Props,
    'id' | 'isModal' | 'dismissOnEscape' | 'dismissOnOutsidePress'
  >,
): Layers.Layer =>
  Layers.layer(props.id, {
    isModal: isModalOf(props),
    dismissesOnEscape: dismissesOnEscapeOf(props),
    dismissesOnOutsidePress: dismissesOnOutsidePressOf(props),
  })

/** The active dismissable layer stack containing this Tour. */
export const layersOf = (props: Props): Layers.Stack =>
  props.layers ?? [layerOf(props)]

/** Clamps a candidate 0-based `stepIndex` into `[0, max(0, steps.length - 1)]`. */
export const clampStepIndex = (
  stepIndex: number,
  props: Pick<Props, 'steps'>,
): number => {
  if (Array.isReadonlyArrayEmpty(props.steps) || !Number.isFinite(stepIndex)) {
    return 0
  } else {
    return PointerDrag.clampValue(
      Math.floor(stepIndex),
      0,
      props.steps.length - 1,
    )
  }
}

// READINGS & PURE GEOMETRY

/** True while the tour walkthrough is running. */
export const isRunning = (state: State): boolean => state._tag === 'Running'

/** True while the tour is inactive. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** How the previous tour session ended while `Idle`, or none. */
export const endedReasonOf = (state: State): Option.Option<EndReason> =>
  state._tag === 'Idle' ? state.maybeEndedReason : Option.none()

/** Current clamped 0-based step index while `Running` with steps present, or none. */
export const stepIndexOf = (
  state: State,
  props: Pick<Props, 'steps'>,
): Option.Option<number> => {
  if (state._tag !== 'Running' || Array.isReadonlyArrayEmpty(props.steps)) {
    return Option.none()
  } else {
    return Option.some(clampStepIndex(state.stepIndex, props))
  }
}

/** Current active {@link TourStep} while `Running`, or none. */
export const currentStepOf = (
  state: State,
  props: Pick<Props, 'steps'>,
): Option.Option<TourStep> =>
  Option.flatMap(stepIndexOf(state, props), index =>
    Array.get(props.steps, index),
  )

/** True when a step follows the current step. */
export const hasNextStep = (
  state: State,
  props: Pick<Props, 'steps'>,
): boolean =>
  Option.exists(
    stepIndexOf(state, props),
    index => index < props.steps.length - 1,
  )

/** True when a step precedes the current step. */
export const hasPrevStep = (
  state: State,
  props: Pick<Props, 'steps'>,
): boolean => Option.exists(stepIndexOf(state, props), index => index > 0)

/** True when running on the first step (`stepIndex === 0`). */
export const isFirstStep = (
  state: State,
  props: Pick<Props, 'steps'>,
): boolean => Option.exists(stepIndexOf(state, props), index => index === 0)

/** True when running on the last step (`stepIndex === steps.length - 1`). */
export const isLastStep = (
  state: State,
  props: Pick<Props, 'steps'>,
): boolean =>
  Option.exists(
    stepIndexOf(state, props),
    index => index === props.steps.length - 1,
  )

/** True when the current running step permits skipping (`true` unless `step.isSkippable === false`). */
export const isCurrentStepSkippable = (
  state: State,
  props: Pick<Props, 'steps'>,
): boolean =>
  Option.exists(currentStepOf(state, props), step => step.isSkippable !== false)

/**
 * Normalized walkthrough progress ratio in `[0, 1]`: `0` while idle or empty,
 * and `(stepIndex + 1) / steps.length` while running (matching Zag Tour).
 *
 * @example
 * ```typescript
 * progressOf(Running({ stepIndex: 0 }), { steps: [step1, step2] }) // 0.5
 * progressOf(Running({ stepIndex: 1 }), { steps: [step1, step2] }) // 1
 * ```
 */
export const progressOf = (
  state: State,
  props: Pick<Props, 'steps'>,
): number => {
  const total = props.steps.length
  if (total <= 0) {
    return 0
  }
  return Option.match(stepIndexOf(state, props), {
    onNone: () => 0,
    onSome: index => PointerDrag.clampValue((index + 1) / total, 0, 1),
  })
}

/**
 * Expands `targetRect` outward on all four edges by `paddingPx` to derive the
 * spotlight cutout rectangle.
 */
export const paddedSpotlightRect = (
  targetRect: Placement.Rect,
  paddingPx: number = defaultSpotlightPaddingPx,
): Placement.Rect => {
  const pad = Math.max(0, Number.isFinite(paddingPx) ? paddingPx : 0)
  return {
    left: targetRect.left - pad,
    top: targetRect.top - pad,
    width: targetRect.width + pad * 2,
    height: targetRect.height + pad * 2,
  }
}

/**
 * Spotlight cutout rectangle for the active running step with `spotlightPaddingPx`
 * applied, or `Option.none()` while idle or when the active step has no `targetRect`.
 */
export const spotlightRectOf = (
  state: State,
  props: Pick<Props, 'steps' | 'spotlightPaddingPx'>,
): Option.Option<Placement.Rect> =>
  Option.flatMap(currentStepOf(state, props), step =>
    Option.map(Option.fromNullishOr(step.targetRect), rect =>
      paddedSpotlightRect(rect, spotlightPaddingPxOf(props)),
    ),
  )

/**
 * Places the Tour popover card beside the current step's spotlight cutout (or
 * an explicit `anchor` override) inside `view`, honoring the step's
 * `preferredSide` (`'Above'` or `'Below'`) and `props.placement` spacing via
 * `Placement.place`. When the current step has no `targetRect` and no `anchor`
 * is supplied, centers the card inside `view`.
 *
 * @example
 * ```typescript
 * placeFor(Running({ stepIndex: 0 }), props, {
 *   size: { width: 280, height: 140 },
 *   view: { width: 1024, height: 768 },
 * })
 * ```
 */
export const placeFor = (
  state: State,
  props: Pick<Props, 'steps' | 'spotlightPaddingPx' | 'placement'>,
  geometry: Readonly<{
    size: Placement.Size
    view: Placement.Size
    anchor?: Placement.Rect
  }>,
): Placement.Placed => {
  const gapPx = props.placement?.gapPx ?? Placement.defaultGapPx
  const edgePx = props.placement?.edgePx ?? Placement.defaultEdgePx
  const maybeAnchor = Option.orElse(Option.fromNullishOr(geometry.anchor), () =>
    spotlightRectOf(state, props),
  )

  return Option.match(maybeAnchor, {
    onNone: () => ({
      left: Math.max(edgePx, (geometry.view.width - geometry.size.width) / 2),
      top: Math.max(edgePx, (geometry.view.height - geometry.size.height) / 2),
      side: 'Below',
    }),
    onSome: anchor => {
      const preferredSide = Option.flatMap(currentStepOf(state, props), step =>
        Option.fromNullishOr(step.preferredSide),
      )
      if (Option.contains(preferredSide, 'Above')) {
        const aboveTop = anchor.top - gapPx - geometry.size.height
        if (aboveTop >= edgePx) {
          const left = Math.max(
            edgePx,
            Math.min(
              anchor.left,
              geometry.view.width - geometry.size.width - edgePx,
            ),
          )
          return { left, top: aboveTop, side: 'Above' }
        }
      }
      return Placement.place({
        anchor,
        size: geometry.size,
        view: geometry.view,
        gapPx,
        edgePx,
      })
    },
  })
}

// INTERNAL CHART HELPERS

const canDismissEscape = (props: Props): boolean =>
  Layers.canDismissOnEscape(layersOf(props), props.id)

const canDismissOutside = (
  props: Props,
  insideIds: ReadonlyArray<string>,
): boolean =>
  Layers.canDismissOnOutsidePress(layersOf(props), props.id, insideIds)

const resolveArrowStep = (
  state: Running,
  key: string,
  props: Props,
): Option.Option<number> => {
  if (!keyboardNavigationOf(props)) {
    return Option.none()
  }
  const isRtl = directionOf(props) === 'Rtl'
  const isForwardKey = isRtl ? key === 'ArrowLeft' : key === 'ArrowRight'
  const isBackwardKey = isRtl ? key === 'ArrowRight' : key === 'ArrowLeft'
  const current = clampStepIndex(state.stepIndex, props)

  if (isForwardKey && current < props.steps.length - 1) {
    return Option.some(current + 1)
  } else if (isBackwardKey && current > 0) {
    return Option.some(current - 1)
  } else {
    return Option.none()
  }
}

// CHART

/**
 * The Tour Machine chart: `Idle | Running` composing `Placement` and `Layers`,
 * with `StartTour`, `NextStep` (finishing on the last step), `PrevStep`,
 * `GoToStep`, `SkipTour` (honoring `isSkippable`), `DismissTour`, and
 * `Layers`-gated Escape / outside dismissal plus ArrowRight / ArrowLeft
 * keyboard navigation.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Idle: {
        on: {
          StartTour: [
            when(
              (_state, _message, context) =>
                Array.isReadonlyArrayNonEmpty(context.steps),
              'Running',
              () => Running({ stepIndex: 0 }),
            ),
            ignore(),
          ],
          GoToStep: [
            when(
              (_state, _message, context) =>
                Array.isReadonlyArrayNonEmpty(context.steps),
              'Running',
              ({ message, context }) =>
                Running({
                  stepIndex: clampStepIndex(message.stepIndex, context),
                }),
            ),
            ignore(),
          ],
          NextStep: [ignore()],
          PrevStep: [ignore()],
          SkipTour: [ignore()],
          DismissTour: [ignore()],
          DismissTourOutside: [ignore()],
          PressedTourKey: [ignore()],
          PressedOutsideTour: [ignore()],
        },
      },
      Running: {
        on: {
          StartTour: [
            when(
              (_state, _message, context) =>
                Array.isReadonlyArrayNonEmpty(context.steps),
              'Running',
              () => Running({ stepIndex: 0 }),
            ),
            ignore(),
          ],
          NextStep: [
            when(
              (state, _message, context) => hasNextStep(state, context),
              'Running',
              ({ state, context }) =>
                Running({
                  stepIndex: clampStepIndex(state.stepIndex, context) + 1,
                }),
            ),
            otherwise(
              to('Idle', () =>
                Idle({ maybeEndedReason: Option.some('Completed') }),
              ),
            ),
          ],
          PrevStep: [
            when(
              (state, _message, context) => hasPrevStep(state, context),
              'Running',
              ({ state, context }) =>
                Running({
                  stepIndex: clampStepIndex(state.stepIndex, context) - 1,
                }),
            ),
            ignore(),
          ],
          GoToStep: [
            when(
              (_state, _message, context) =>
                Array.isReadonlyArrayNonEmpty(context.steps),
              'Running',
              ({ message, context }) =>
                Running({
                  stepIndex: clampStepIndex(message.stepIndex, context),
                }),
            ),
            ignore(),
          ],
          SkipTour: [
            when(
              (state, _message, context) =>
                isCurrentStepSkippable(state, context),
              'Idle',
              () => Idle({ maybeEndedReason: Option.some('Skipped') }),
            ),
            ignore(),
          ],
          DismissTour: to('Idle', () =>
            Idle({ maybeEndedReason: Option.some('Dismissed') }),
          ),
          DismissTourOutside: [
            when(
              (_state, _message, context) => canDismissOutside(context, []),
              'Idle',
              () => Idle({ maybeEndedReason: Option.some('Dismissed') }),
            ),
            ignore(),
          ],
          PressedOutsideTour: [
            when(
              (_state, message, context) =>
                canDismissOutside(context, message.insideIds),
              'Idle',
              () => Idle({ maybeEndedReason: Option.some('Dismissed') }),
            ),
            ignore(),
          ],
          PressedTourKey: [
            when(
              (_state, message, context) =>
                message.key === 'Escape' && canDismissEscape(context),
              'Idle',
              () => Idle({ maybeEndedReason: Option.some('Dismissed') }),
            ),
            when(
              (state, message, context) =>
                resolveArrowStep(state, message.key, context),
              'Running',
              ({ guardValue }) => Running({ stepIndex: guardValue }),
            ),
            ignore(),
          ],
        },
      },
    },
  },
)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  StartTour: pace,
  NextStep: pace,
  PrevStep: pace,
  GoToStep: pace,
  SkipTour: pace,
  DismissTour: pace,
  DismissTourOutside: pace,
  PressedTourKey: pace,
  PressedOutsideTour: pace,
})

/** Default synchronization: every Tour Message syncs immediately. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Tour kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The nine painted slots of a Tour Part: `Backdrop`, `Spotlight`, `Content`,
 * `Title`, `Description`, `NextButton`, `PrevButton`, `SkipButton`, and
 * `CloseButton`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Backdrop: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'DismissTourOutside' }],
  },
  Spotlight: {
    focus: 'None',
    gestures: [],
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
  NextButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'NextStep' }],
  },
  PrevButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'PrevStep' }],
  },
  SkipButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SkipTour' }],
  },
  CloseButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'DismissTour' }],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  const running = isRunning(state)

  if (slot === 'Backdrop') {
    return {
      id: backdropId(props.id),
      ...(running ? {} : { isHidden: true }),
    }
  } else if (slot === 'Spotlight') {
    return {
      id: spotlightId(props.id),
      ...(Option.isSome(spotlightRectOf(state, props))
        ? {}
        : { isHidden: true }),
    }
  } else if (slot === 'Content') {
    return {
      id: contentId(props.id),
      isModal: isModalOf(props),
      live: 'Polite',
      isAtomic: true,
      tabIndex: -1,
      labelledBy: titleId(props.id),
      describedBy: descriptionId(props.id),
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(running ? {} : { isHidden: true }),
    }
  } else if (slot === 'Title') {
    return {
      id: titleId(props.id),
    }
  } else if (slot === 'Description') {
    return {
      id: descriptionId(props.id),
    }
  } else if (slot === 'NextButton') {
    return {
      id: nextButtonId(props.id),
      label: isLastStep(state, props) ? 'Finish tour' : 'Next step',
      isDisabled: !running,
    }
  } else if (slot === 'PrevButton') {
    return {
      id: prevButtonId(props.id),
      label: 'Previous step',
      isDisabled: !hasPrevStep(state, props),
    }
  } else if (slot === 'SkipButton') {
    const canSkip = running && isCurrentStepSkippable(state, props)
    return {
      id: skipButtonId(props.id),
      label: 'Skip tour',
      isDisabled: !canSkip,
      ...(canSkip ? {} : { isHidden: true }),
    }
  } else if (slot === 'CloseButton') {
    return {
      id: closeButtonId(props.id),
      label: 'Close tour',
      isDisabled: !running,
    }
  } else {
    return {}
  }
}

/** What a restart opens a Tour on: always inactive with no prior end reason. */
export const atRest = (_state: State): State => initial

// PART FACTORY

/** Options for customizing a Tour Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Tour device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Tour {@link Part.Part}. Synced by default (`category: 'Navigation'`,
 * `Pace.Synced`); pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a
 * Program's Tour local to one device.
 *
 * @example
 * ```typescript
 * const OnboardingTour = Tour.make({ name: 'OnboardingTour' })
 * const LocalTour = Tour.deviceOnly({ name: 'LocalTour' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Tour',
    State,
    Message,
    chart,
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? synced
        : deviceSync(options.sync),
    category: options.category ?? 'Navigation',
    slots,
    atRest,
    project: projectSlot,
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
  })

/** Shorthand for a Tour Part whose state stays on the device and is omitted from the synced log and encoded Model. */
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

/** The default synced Tour Part (`name: 'Tour'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

/**
 * Projects a running Tour into the `BoxLayer` field a `Box` node reads on
 * HTML, React, and React Native, or `{}` while idle.
 */
export const boxLayerOf = (
  view: Part.View<State>,
  props: Props,
): Readonly<{ layer?: BoxLayer }> =>
  isRunning(view.state)
    ? {
        layer: {
          kind: isModalOf(props) ? 'Dialog' : 'Panel',
          label: props.label ?? props.id,
          ...(dismissesOnOutsidePressOf(props)
            ? { dismissToken: DismissTourOutside.tag }
            : {}),
        },
      }
    : {}

import { Array, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, when } from '../experimental/machine/machine.js'
import { ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import { SlotOrientation, type SlotProps } from './slot.js'

// NOTE: this is the core Steps Part (Widget #38 of 54, Scribe #2677).
// It models linear and non-linear multi-step progression in one framework-free
// Machine and Part declaration covering Zag steps semantics. Its state
// (`Active({ step, count })`) lives in the Model, synced by default
// (`Navigation` category, `Pace.Synced()`), with `Steps.make` and
// `Steps.deviceOnly()` options. Reference-stable SlotBindings (`Root`,
// `Trigger`, `Content`, `NextButton`, `PrevButton`) render across HTML, React,
// and React Native generic hosts with zero Steps-specific painter logic.

// SCHEMAS & CONSTANTS

/** Default starting step index (`0`). */
export const defaultStep = 0

/** Default total number of steps (`1`). */
export const defaultCount = 1

/** Percentage scale factor for completion calculation (`100`). */
const fullPercent = 100

/** Layout orientation for the step list (`Horizontal` or `Vertical`). */
export const Orientation = SlotOrientation
/** Layout orientation for the step list. */
export type Orientation = typeof Orientation.Type

/** Default step list orientation (`'Horizontal'`). */
export const defaultOrientation: Orientation = 'Horizontal'

/** Completion status of one step relative to the current active step. */
export const StepStatus = S.Literals(['Complete', 'Current', 'Incomplete'])
/** Completion status of one step relative to the current active step. */
export type StepStatus = typeof StepStatus.Type

/** Plain-data metadata for one step in a Steps sequence. */
export const StepItem = S.Struct({
  label: S.optionalKey(S.String),
  isSkippable: S.optionalKey(S.Boolean),
  isValid: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
})
/** Plain-data metadata for one step in a Steps sequence. */
export type StepItem = typeof StepItem.Type

/**
 * Read-only props supplied to the Steps chart and projection from the
 * Program's Model. Linear mode, orientation, per-step metadata, and labels
 * stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  count: S.optionalKey(S.Number),
  linear: S.optionalKey(S.Boolean),
  orientation: S.optionalKey(Orientation),
  isDisabled: S.optionalKey(S.Boolean),
  defaultStep: S.optionalKey(S.Number),
  items: S.optionalKey(S.Array(StepItem)),
  label: S.optionalKey(S.String),
})
/** Read-only props supplied to the Steps chart and projection. */
export type Props = typeof Props.Type

// STATE

/**
 * Active step progression holding the current 0-based `step` index (`0..count`,
 * where `step === count` denotes completion) and the total step `count`.
 */
export const Active = ts('Active', {
  step: S.Number,
  count: S.Number,
})
/** Active step progression state. */
export type Active = typeof Active.Type

/** Where a Steps Part stands. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Active])
/** Where a Steps Part stands. */
export type State = typeof State.Type

const normalizeCount = (count: number): number =>
  Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : defaultCount

const clampStep = (step: number, count: number): number => {
  const safeCount = normalizeCount(count)
  if (!Number.isFinite(step)) {
    return defaultStep
  }
  return Math.min(Math.max(Math.trunc(step), defaultStep), safeCount)
}

/** Initial Steps state: step `0` of `1`. */
export const initial: State = Active({
  step: defaultStep,
  count: defaultCount,
})

/**
 * Creates an initial Steps state with `count` total steps starting at `step`
 * (`0` by default), clamped into `[0, count]`.
 *
 * @example
 * ```typescript
 * initialSteps(3) // Active({ step: 0, count: 3 })
 * initialSteps(3, 1) // Active({ step: 1, count: 3 })
 * ```
 */
export const initialSteps = (
  count: number,
  step: number = defaultStep,
): State => {
  const safeCount = normalizeCount(count)
  return Active({
    step: clampStep(step, safeCount),
    count: safeCount,
  })
}

// ACTIONS

/** Advances progression by one step when another step remains and the current step is valid. */
export const NextStep = Catalog.action('NextStep', {
  what: 'Advances progression by one step in the sequence',
  why: 'To continue forward through the workflow',
  meta: { label: 'Next step', keys: [] },
})

/** Moves progression back by one step when not already on the first step. */
export const PrevStep = Catalog.action('PrevStep', {
  what: 'Moves progression back to the preceding step',
  why: 'To revisit an earlier stage',
  meta: { label: 'Previous step', keys: [] },
})

/** Jumps directly to the chosen 0-based `step` index (honoring linear mode and validation). */
export const GoToStep = Catalog.action('GoToStep', {
  fields: { step: S.Number },
  choose: {
    field: 'step',
    noun: 'step',
    prompt: 'Go to which step?',
    token: S.FiniteFromString.pipe(S.decodeTo(S.Int)),
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No step is available',
  },
  what: 'Navigates directly to the chosen step index',
  why: 'To jump straight to a specific stage',
  meta: { label: 'Go to step', keys: [] },
})

/** Resets step progression back to `props.defaultStep` (or `0`). */
export const ResetSteps = Catalog.action('ResetSteps', {
  what: 'Resets step progress back to the starting position',
  why: 'To begin the workflow over from the start',
  meta: { label: 'Reset steps', keys: [] },
})

/** The Catalog Actions a Steps Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  NextStep,
  PrevStep,
  GoToStep,
  ResetSteps,
]

// MESSAGE

/** Every Message the Steps chart handles. */
export const Message = S.Union([NextStep, PrevStep, GoToStep, ResetSteps])
/** Every Message the Steps chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Steps Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the steps root element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives one step trigger element id from a base `id` and 0-based `index`. */
export const triggerId = (id: string, index: number): string =>
  `${id}-trigger-${index.toString()}`

/** Derives one step content panel element id from a base `id` and 0-based `index`. */
export const contentId = (id: string, index: number): string =>
  `${id}-content-${index.toString()}`

/** Derives the next-step button element id from a base `id`. */
export const nextButtonId = (id: string): string => `${id}-next`

/** Derives the previous-step button element id from a base `id`. */
export const prevButtonId = (id: string): string => `${id}-prev`

// PURE CONFIGURATION READERS & RULES

/** Resolved orientation (`'Horizontal'` by default). */
export const orientationOf = (
  props: Pick<Props, 'orientation'> = {},
): Orientation => props.orientation ?? defaultOrientation

/** True when linear progression is enforced (`false` by default). */
export const isLinearOf = (props: Pick<Props, 'linear'> = {}): boolean =>
  props.linear === true

/** True when the entire Steps control is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** Resolved total step count, preferring `props.count` when supplied over `state.count`. */
export const countOf = (
  state: State,
  props: Pick<Props, 'count'> = {},
): number => normalizeCount(props.count ?? state.count)

/** Current 0-based step index clamped to `[0, countOf(state, props)]`. */
export const stepOf = (
  state: State,
  props: Pick<Props, 'count'> = {},
): number => clampStep(state.step, countOf(state, props))

/**
 * Returns the status of the step at 0-based `index` relative to `state.step`:
 * - `'Complete'` when `index < step`
 * - `'Current'` when `index === step`
 * - `'Incomplete'` when `index > step`
 *
 * @example
 * ```typescript
 * stepStatusOf(initialSteps(3, 1), 0) // 'Complete'
 * stepStatusOf(initialSteps(3, 1), 1) // 'Current'
 * stepStatusOf(initialSteps(3, 1), 2) // 'Incomplete'
 * ```
 */
export const stepStatusOf = (
  state: State,
  index: number,
  props: Pick<Props, 'count'> = {},
): StepStatus => {
  const current = stepOf(state, props)
  if (index < current) {
    return 'Complete'
  } else if (index === current) {
    return 'Current'
  } else {
    return 'Incomplete'
  }
}

/**
 * Completion percentage (`0..100`) calculated as `(step / count) * 100`.
 * Returns `0` when `count <= 0`.
 *
 * @example
 * ```typescript
 * percentOf(initialSteps(4, 2)) // 50
 * percentOf(initialSteps(4, 4)) // 100
 * ```
 */
export const percentOf = (
  state: State,
  props: Pick<Props, 'count'> = {},
): number => {
  const count = countOf(state, props)
  if (count <= 0) {
    return 0
  }
  return (stepOf(state, props) / count) * fullPercent
}

/** True when progression is on step `0`. */
export const isFirstStep = (state: State): boolean => state.step <= defaultStep

/** True when progression is on the final active step (`count - 1`) with `count > 0`. */
export const isLastStep = (
  state: State,
  props: Pick<Props, 'count'> = {},
): boolean => {
  const count = countOf(state, props)
  return count > 0 && stepOf(state, props) === count - 1
}

/** True when all steps have been completed (`step >= count` with `count > 0`). */
export const isCompleted = (
  state: State,
  props: Pick<Props, 'count'> = {},
): boolean => {
  const count = countOf(state, props)
  return count > 0 && stepOf(state, props) >= count
}

/** True when advancing forward is possible (`step < count`). */
export const hasNextStep = (
  state: State,
  props: Pick<Props, 'count'> = {},
): boolean => stepOf(state, props) < countOf(state, props)

/** True when moving backward is possible (`step > 0`). */
export const hasPrevStep = (state: State): boolean => state.step > defaultStep

const itemAt = (
  props: Pick<Props, 'items'>,
  index: number,
): Option.Option<StepItem> =>
  props.items === undefined ? Option.none() : Array.get(props.items, index)

/** True when the step at `index` is explicitly marked disabled in `props.items`. */
export const isStepDisabled = (
  index: number,
  props: Pick<Props, 'isDisabled' | 'items'> = {},
): boolean =>
  isDisabledOf(props) ||
  Option.exists(itemAt(props, index), item => item.isDisabled === true)

/** True when the step at `index` may advance forward (either skippable or not explicitly invalid). */
export const isStepValidToAdvance = (
  index: number,
  props: Pick<Props, 'items'> = {},
): boolean =>
  Option.match(itemAt(props, index), {
    onNone: () => true,
    onSome: item => item.isSkippable === true || item.isValid !== false,
  })

/**
 * True when navigating from `state` to `targetStep` is permitted under `props`:
 * checks enabled state, `[0, count]` bounds, target item disabled state,
 * `linear` mode (forbids skipping beyond `current + 1`), and current-step
 * validity for forward navigation.
 */
export const canGoToStep = (
  state: State,
  targetStep: number,
  props: Pick<Props, 'count' | 'linear' | 'isDisabled' | 'items'> = {},
): boolean => {
  if (isDisabledOf(props) || !Number.isFinite(targetStep)) {
    return false
  }
  const count = countOf(state, props)
  const target = Math.trunc(targetStep)
  if (target < defaultStep || target > count) {
    return false
  }
  if (target < count && isStepDisabled(target, props)) {
    return false
  }
  const current = stepOf(state, props)
  if (target <= current) {
    return true
  }
  if (isLinearOf(props) && target > current + 1) {
    return false
  }
  return isStepValidToAdvance(current, props)
}

// CHART

const defaultContextFor = (state: State, props?: Partial<Props>): Props => ({
  id: props?.id ?? 'steps',
  count: props?.count ?? state.count,
  ...(props?.linear === undefined ? {} : { linear: props.linear }),
  ...(props?.orientation === undefined
    ? {}
    : { orientation: props.orientation }),
  ...(props?.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props?.defaultStep === undefined
    ? {}
    : { defaultStep: props.defaultStep }),
  ...(props?.items === undefined ? {} : { items: props.items }),
  ...(props?.label === undefined ? {} : { label: props.label }),
})

/**
 * Builds the Steps Machine chart starting in `initialState`: handles
 * `NextStep`, `PrevStep`, `GoToStep`, and `ResetSteps`, honoring linear mode,
 * disabled guards, per-step validity/skippability, and step bounds.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Active: {
        on: {
          NextStep: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) &&
                hasNextStep(state, context) &&
                isStepValidToAdvance(stepOf(state, context), context),
              'Active',
              ({ state, context }) => {
                const count = countOf(state, context)
                const nextStep = clampStep(stepOf(state, context) + 1, count)
                return Active({ step: nextStep, count })
              },
            ),
            ignore(),
          ],
          PrevStep: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && hasPrevStep(state),
              'Active',
              ({ state, context }) => {
                const count = countOf(state, context)
                const prevStep = clampStep(stepOf(state, context) - 1, count)
                return Active({ step: prevStep, count })
              },
            ),
            ignore(),
          ],
          GoToStep: [
            when(
              (state, message, context) =>
                canGoToStep(state, message.step, context),
              'Active',
              ({ state, message, context }) => {
                const count = countOf(state, context)
                return Active({
                  step: clampStep(message.step, count),
                  count,
                })
              },
            ),
            ignore(),
          ],
          ResetSteps: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Active',
              ({ state, context }) => {
                const count = countOf(state, context)
                const target = clampStep(
                  context.defaultStep ?? defaultStep,
                  count,
                )
                return Active({ step: target, count })
              },
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** Default Steps Machine chart starting at step `0` of `1`. */
export const chart = chartOf(initial)

// PURE TRANSITION HELPERS

/** Advances `state` to the next step via {@link chart}, returning the updated state. */
export const next = (state: State, props?: Partial<Props>): State =>
  chart.transition(state, NextStep(), defaultContextFor(state, props))[0]

/** Moves `state` back to the previous step via {@link chart}, returning the updated state. */
export const prev = (state: State, props?: Partial<Props>): State =>
  chart.transition(state, PrevStep(), defaultContextFor(state, props))[0]

/** Moves `state` to `step` via {@link chart}, returning the updated state. */
export const goToStep = (
  state: State,
  step: number,
  props?: Partial<Props>,
): State =>
  chart.transition(
    state,
    GoToStep({ step }),
    defaultContextFor(state, props),
  )[0]

/** Resets `state` to its starting step via {@link chart}, returning the updated state. */
export const reset = (state: State, props?: Partial<Props>): State =>
  chart.transition(state, ResetSteps(), defaultContextFor(state, props))[0]

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  NextStep: pace,
  PrevStep: pace,
  GoToStep: pace,
  ResetSteps: pace,
})

/** Default synchronization: every Steps Message syncs via `Pace.Synced()`. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Steps Part kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The five painted slots of a Steps Part:
 * - `Root`: outer container with orientation and optional label/disabled state.
 * - `Trigger`: indexed step tab trigger (`role="tab"`, `aria-current`, `aria-selected`, `aria-controls`, `GoToStep`).
 * - `Content`: indexed step panel (`role="tabpanel"`, `aria-labelledby`, `hidden`).
 * - `NextButton`: advances to the next step (`role="button"`, `NextStep`).
 * - `PrevButton`: returns to the previous step (`role="button"`, `PrevStep`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Trigger: {
    role: 'Tab',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'GoToStep' }],
  },
  Content: {
    role: 'TabPanel',
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
}

const parseStepChoice = (
  maybeChoice: Option.Option<string>,
): Option.Option<number> =>
  Option.flatMap(maybeChoice, raw => {
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0
      ? Option.some(Math.trunc(parsed))
      : Option.none()
  })

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const orientation = orientationOf(props)
  const disabled = isDisabledOf(props)
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      orientation,
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Trigger') {
    return Option.match(parseStepChoice(maybeChoice), {
      onNone: () => ({}),
      onSome: index => {
        const status = stepStatusOf(state, index, props)
        const isCurrent = status === 'Current'
        const isTriggerDisabled =
          isStepDisabled(index, props) ||
          (isLinearOf(props) && index > stepOf(state, props) + 1)
        const maybeLabel = Option.flatMap(itemAt(props, index), item =>
          Option.fromNullishOr(item.label),
        )
        return {
          id: triggerId(props.id, index),
          isCurrent,
          isSelected: isCurrent,
          controls: contentId(props.id, index),
          tabIndex:
            isTriggerDisabled || (isLinearOf(props) && !isCurrent) ? -1 : 0,
          ...(isTriggerDisabled ? { isDisabled: true } : {}),
          ...Option.match(maybeLabel, {
            onNone: () => ({}),
            onSome: label => ({ label }),
          }),
        }
      },
    })
  } else if (slot === 'Content') {
    return Option.match(parseStepChoice(maybeChoice), {
      onNone: () => ({}),
      onSome: index => {
        const isCurrent = stepStatusOf(state, index, props) === 'Current'
        return {
          id: contentId(props.id, index),
          labelledBy: triggerId(props.id, index),
          isHidden: !isCurrent,
          tabIndex: isCurrent ? 0 : -1,
        }
      },
    })
  } else if (slot === 'NextButton') {
    const isNextDisabled = disabled || !hasNextStep(state, props)
    return {
      id: nextButtonId(props.id),
      isDisabled: isNextDisabled,
      tabIndex: isNextDisabled ? -1 : 0,
    }
  } else if (slot === 'PrevButton') {
    const isPrevDisabled = disabled || !hasPrevStep(state)
    return {
      id: prevButtonId(props.id),
      isDisabled: isPrevDisabled,
      tabIndex: isPrevDisabled ? -1 : 0,
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a Steps Part on: preserves durable `step` and `count`
 * clamped to valid bounds.
 */
export const atRest = (state: State): State =>
  initialSteps(state.count, state.step)

// PART FACTORY

/** Options for customizing a Steps Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (such as `'OwnView'`) to keep Steps device-only. */
  sync?: 'Synced' | DeviceReason
  /** Total step count for the initial state (`1` by default). */
  count?: number
  /** Starting 0-based step index (`0` by default). */
  defaultStep?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Steps {@link Part.Part}. Synced by default (`category: 'Navigation'`,
 * `Pace.Synced()`). Use {@link deviceOnly} for local-only step workflows.
 *
 * @example
 * ```typescript
 * const CheckoutSteps = Steps.make({ name: 'CheckoutSteps', count: 3 })
 * const LocalWizard = Steps.deviceOnly({ name: 'LocalWizard', count: 4 })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const initialState =
    options.count === undefined && options.defaultStep === undefined
      ? initial
      : initialSteps(
          options.count ?? defaultCount,
          options.defaultStep ?? defaultStep,
        )
  return Part.define<State, Message, Props>({
    name: options.name ?? 'Steps',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
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
}

/**
 * Shorthand for a Steps Part whose state stays on the device and is omitted
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

/** The default synced Steps Part (`name: 'Steps'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

import { Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  define,
  forStates,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type { SlotOrientation, SlotProps, Role as SlotRole } from './slot.js'

// NOTE: this is the core Progress & Meter Part (Widget #51 of 54, Scribe
// #2690). It covers linear and circular progress indicators (determinate and
// indeterminate) as well as thresholded meters (`kind: 'Progress' | 'Meter'`
// with optional `low`, `high`, and `optimum` bounds) over `Indeterminate |
// Determinate | Complete`. Synced by default (`Domain` category,
// `Pace.Synced`) with `Progress.make` and `Progress.deviceOnly()`.

// CONSTANTS

/** Default lower bound of a Progress or Meter range (`0`). */
export const defaultMin = 0

/** Default upper bound of a Progress or Meter range (`100`). */
export const defaultMax = 100

/** Full-scale percentage multiplier (`100`). */
const fullPercent = 100

/** Halfway divisor used when `optimum` is omitted on a Meter (`2`). */
const midpointDivisor = 2

/** Full-circle multiplier for circular SVG stroke geometry (`2 * Math.PI`). */
const tau = 2 * Math.PI

// SCHEMAS

/** Semantic indicator kind: `'Progress'` for completion over time, `'Meter'` for a scalar measurement within a range. */
export const Kind = S.Literals(['Progress', 'Meter'])
/** Semantic indicator kind. */
export type Kind = typeof Kind.Type

/** Default indicator kind (`'Progress'`). */
export const defaultKind: Kind = 'Progress'

/** Visual layout shape (`'Linear'` or `'Circular'`). */
export const Shape = S.Literals(['Linear', 'Circular'])
/** Visual layout shape. */
export type Shape = typeof Shape.Type

/** Meter threshold evaluation zone (`'Optimal' | 'Suboptimal' | 'Critical'`). */
export const MeterZone = S.Literals(['Optimal', 'Suboptimal', 'Critical'])
/** Meter threshold evaluation zone. */
export type MeterZone = typeof MeterZone.Type

/** Standard `data-state` marker (`'indeterminate' | 'loading' | 'complete'`). */
export const DataState = S.Literals(['indeterminate', 'loading', 'complete'])
/** Standard `data-state` marker. */
export type DataState = typeof DataState.Type

/** SVG circular dash geometry produced by {@link circleDashOf}. */
export const CircleDash = S.Struct({
  circumference: S.Number,
  dashOffset: S.Number,
})
/** SVG circular dash geometry. */
export type CircleDash = typeof CircleDash.Type

/**
 * Read-only configuration supplied to the Progress / Meter chart and
 * projection from the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  kind: S.optionalKey(Kind),
  shape: S.optionalKey(Shape),
  orientation: S.optionalKey(S.Literals(['Horizontal', 'Vertical'])),
  min: S.optionalKey(S.Number),
  max: S.optionalKey(S.Number),
  defaultValue: S.optionalKey(S.Number),
  defaultIndeterminate: S.optionalKey(S.Boolean),
  low: S.optionalKey(S.Number),
  high: S.optionalKey(S.Number),
  optimum: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  valueText: S.optionalKey(S.String),
  indeterminateText: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the Progress / Meter chart and projection. */
export type Props = typeof Props.Type

// STATE

/** Progress value is unknown (`Option.none()`), showing ongoing activity without a numeric completion ratio. */
export const Indeterminate = ts('Indeterminate', {
  min: S.Number,
  max: S.Number,
})
/** Progress value is unknown. */
export type Indeterminate = typeof Indeterminate.Type

/** A known numeric value strictly below `max` within `[min, max]`. */
export const Determinate = ts('Determinate', {
  value: S.Number,
  min: S.Number,
  max: S.Number,
})
/** A known numeric value below `max`. */
export type Determinate = typeof Determinate.Type

/** A known numeric value that reached `max`. */
export const Complete = ts('Complete', {
  value: S.Number,
  min: S.Number,
  max: S.Number,
})
/** A known numeric value that reached `max`. */
export type Complete = typeof Complete.Type

/** Where a Progress / Meter Part stands: `Indeterminate`, `Determinate`, or `Complete`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Indeterminate, Determinate, Complete])
/** Where a Progress / Meter Part stands. */
export type State = typeof State.Type

const normalizeBounds = (
  min: number,
  max: number,
): Readonly<{ min: number; max: number }> => {
  const safeMin = Number.isFinite(min) ? min : defaultMin
  const safeMax = Number.isFinite(max) && max >= safeMin ? max : safeMin
  return { min: safeMin, max: safeMax }
}

const clampValue = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min
  } else {
    return Math.min(Math.max(value, min), max)
  }
}

const classifyDeterminate = (
  rawValue: number,
  min: number,
  max: number,
): Determinate | Complete => {
  const bounds = normalizeBounds(min, max)
  const value = clampValue(rawValue, bounds.min, bounds.max)
  return value >= bounds.max
    ? Complete({ value, min: bounds.min, max: bounds.max })
    : Determinate({ value, min: bounds.min, max: bounds.max })
}

/** Initial Progress state: determinate at `0` within `[0, 100]`. */
export const initial: State = Determinate({
  value: defaultMin,
  min: defaultMin,
  max: defaultMax,
})

/** Creates an initial determinate (or complete) Progress / Meter state for `value` within `[min, max]`. */
export const initialValue = (
  value: number,
  min: number = defaultMin,
  max: number = defaultMax,
): State => classifyDeterminate(value, min, max)

/** Creates an initial indeterminate Progress state within `[min, max]`. */
export const initialIndeterminate = (
  min: number = defaultMin,
  max: number = defaultMax,
): State => Indeterminate(normalizeBounds(min, max))

// ACTIONS

/** Sets the indicator value (clamped to `[min, max]`), entering `Complete` at `max`. */
export const SetProgressValue = Catalog.action('SetProgressValue', {
  fields: { value: S.Number },
  choose: {
    field: 'value',
    noun: 'progress value',
    prompt: 'Set the progress value?',
    token: S.FiniteFromString,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter a numeric value',
  },
  what: 'Updates the measured value within the range',
  why: 'To reflect current completion or level',
  meta: { label: 'Set value', keys: [] },
})

/** Marks a Progress indicator as indeterminate (ignored in `'Meter'` kind). */
export const SetProgressIndeterminate = Catalog.action(
  'SetProgressIndeterminate',
  {
    what: 'Marks progress as indeterminate',
    why: 'To show ongoing activity with an unknown duration',
    meta: { label: 'Set indeterminate', keys: [] },
  },
)

/** Resets the indicator back to its configured baseline value and range. */
export const ResetProgress = Catalog.action('ResetProgress', {
  what: 'Resets the indicator to its starting value',
  why: 'To begin tracking from the baseline',
  meta: { label: 'Reset', keys: [] },
})

/** The Catalog Actions a Progress / Meter Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SetProgressValue,
  SetProgressIndeterminate,
  ResetProgress,
]

// MESSAGES

/** Updates the indicator's `[min, max]` bounds and re-clamps any determinate value. */
export const SetProgressRange = m('SetProgressRange', {
  min: S.Number,
  max: S.Number,
})

/** Every Message the Progress / Meter chart handles. */
export const Message = S.Union([
  SetProgressValue,
  SetProgressRange,
  SetProgressIndeterminate,
  ResetProgress,
])
/** Every Message the Progress / Meter chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Progress / Meter Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the root container element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the visible label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

/** Derives the track element id from a base `id`. */
export const trackId = (id: string): string => `${id}-track`

/** Derives the filled range indicator element id from a base `id`. */
export const rangeId = (id: string): string => `${id}-range`

/** Derives the live value text element id from a base `id`. */
export const valueTextId = (id: string): string => `${id}-value-text`

// PURE RULES & READINGS

/** Resolved semantic kind (`'Progress'` by default). */
export const kindOf = (props: Pick<Props, 'kind'> = {}): Kind =>
  props.kind ?? defaultKind

/** Resolved WAI-ARIA role name for thin HTML painters (`'progressbar'` or `'meter'`). */
export const ariaRoleOf = (
  props: Pick<Props, 'kind'> = {},
): 'progressbar' | 'meter' =>
  kindOf(props) === 'Meter' ? 'meter' : 'progressbar'

/** Resolved visual shape (`'Linear'` by default). */
export const shapeOf = (props: Pick<Props, 'shape'> = {}): Shape =>
  props.shape ?? 'Linear'

/** Resolved bar orientation (`'Horizontal'` by default). */
export const orientationOf = (
  props: Pick<Props, 'orientation'> = {},
): SlotOrientation => props.orientation ?? 'Horizontal'

/** True when the indicator is `Indeterminate`. */
export const isIndeterminate = (state: State): boolean =>
  state._tag === 'Indeterminate'

/** True when the indicator reached `Complete`. */
export const isComplete = (state: State): boolean => state._tag === 'Complete'

/** Standard `data-state` marker (`'indeterminate' | 'loading' | 'complete'`). */
export const dataStateOf = (state: State): DataState =>
  M.value(state).pipe(
    M.withReturnType<DataState>(),
    M.tagsExhaustive({
      Indeterminate: () => 'indeterminate',
      Determinate: () => 'loading',
      Complete: () => 'complete',
    }),
  )

/** Current numeric value as `Option.Option<number>` (`None` when indeterminate). */
export const valueOf = (state: State): Option.Option<number> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<number>>(),
    M.tagsExhaustive({
      Indeterminate: () => Option.none(),
      Determinate: ({ value }) => Option.some(value),
      Complete: ({ value }) => Option.some(value),
    }),
  )

/**
 * Normalized completion ratio in `[0, 1]`, or `Option.none()` when
 * indeterminate.
 *
 * @example
 * ```typescript
 * ratioOf(Progress.initialValue(25, 0, 100)) // Some(0.25)
 * ratioOf(Progress.initialIndeterminate()) // None
 * ```
 */
export const ratioOf = (state: State): Option.Option<number> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<number>>(),
    M.tagsExhaustive({
      Indeterminate: () => Option.none(),
      Determinate: ({ value, min, max }) => {
        const span = max - min
        if (span <= 0) {
          return Option.some(value >= max ? 1 : 0)
        } else {
          return Option.some(clampValue((value - min) / span, 0, 1))
        }
      },
      Complete: () => Option.some(1),
    }),
  )

/**
 * Completion percentage in `[0, 100]`, or `Option.none()` when indeterminate.
 *
 * @example
 * ```typescript
 * percentOf(Progress.initialValue(50, 0, 100)) // Some(50)
 * percentOf(Progress.initialIndeterminate()) // None
 * ```
 */
export const percentOf = (state: State): Option.Option<number> =>
  Option.map(ratioOf(state), ratio => ratio * fullPercent)

/**
 * Evaluates which HTML Meter threshold zone (`'Optimal' | 'Suboptimal' |
 * 'Critical'`) the current value occupies against `low`, `high`, and
 * `optimum`.
 *
 * @example
 * ```typescript
 * meterZoneOf(Progress.initialValue(20), { low: 30, high: 70, optimum: 85 })
 * // 'Critical'
 * ```
 */
export const meterZoneOf = (
  state: State,
  props: Pick<Props, 'low' | 'high' | 'optimum'> = {},
): MeterZone =>
  Option.match(valueOf(state), {
    onNone: () => 'Optimal',
    onSome: value => {
      if (props.low === undefined && props.high === undefined) {
        return 'Optimal'
      }
      const effectiveLow =
        props.low !== undefined
          ? clampValue(props.low, state.min, state.max)
          : state.min
      const effectiveHigh =
        props.high !== undefined
          ? clampValue(props.high, effectiveLow, state.max)
          : state.max
      const effectiveOptimum =
        props.optimum !== undefined
          ? clampValue(props.optimum, state.min, state.max)
          : (state.min + state.max) / midpointDivisor

      if (effectiveOptimum < effectiveLow) {
        if (value < effectiveLow) {
          return 'Optimal'
        } else if (value <= effectiveHigh) {
          return 'Suboptimal'
        } else {
          return 'Critical'
        }
      } else if (effectiveOptimum > effectiveHigh) {
        if (value > effectiveHigh) {
          return 'Optimal'
        } else if (value >= effectiveLow) {
          return 'Suboptimal'
        } else {
          return 'Critical'
        }
      } else if (value >= effectiveLow && value <= effectiveHigh) {
        return 'Optimal'
      } else {
        return 'Suboptimal'
      }
    },
  })

/**
 * Computes SVG stroke geometry `{ circumference, dashOffset }` for a circular
 * progress indicator of `radius`. At `100%`, `dashOffset` is `0`; at `0%` or
 * when indeterminate, `dashOffset` equals `circumference`.
 *
 * @example
 * ```typescript
 * circleDashOf(Progress.initialValue(50), 20)
 * // { circumference: 125.6637..., dashOffset: 62.8318... }
 * ```
 */
export const circleDashOf = (state: State, radius: number): CircleDash => {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 0
  const circumference = tau * safeRadius
  const ratio = Option.getOrElse(ratioOf(state), () => 0)
  return {
    circumference,
    dashOffset: circumference * (1 - ratio),
  }
}

/**
 * Human-readable accessible value text for the indicator (`'50%'`, `'100%'`,
 * or `'Loading'` when indeterminate, unless overridden by `props.valueText`).
 */
export const valueTextOf = (
  state: State,
  props: Pick<Props, 'valueText' | 'indeterminateText'> = {},
): string => {
  if (props.valueText !== undefined) {
    return props.valueText
  }
  return Option.match(percentOf(state), {
    onNone: () => props.indeterminateText ?? 'Loading',
    onSome: percent => `${Math.round(percent).toString()}%`,
  })
}

// INTERNAL HELPERS

const resetStateOf = (props: Props): State => {
  const min = props.min ?? defaultMin
  const max = props.max ?? defaultMax
  if (props.defaultIndeterminate === true && kindOf(props) === 'Progress') {
    return initialIndeterminate(min, max)
  } else {
    return classifyDeterminate(props.defaultValue ?? min, min, max)
  }
}

// CHART

/**
 * The Progress & Meter Machine chart: value updates classifying `Determinate`
 * vs `Complete`, range updates that re-clamp active values, indeterminate
 * transitions (guarded off for `'Meter'`), and reset to configured baseline.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Indeterminate: {
        on: {
          SetProgressRange: to('Indeterminate', ({ message }) =>
            Indeterminate(normalizeBounds(message.min, message.max)),
          ),
          SetProgressIndeterminate: [ignore()],
        },
      },
      Determinate: {
        on: {
          SetProgressRange: [
            when(
              (state, message) =>
                classifyDeterminate(state.value, message.min, message.max)
                  ._tag === 'Complete',
              'Complete',
              ({ state, message }) => {
                const next = classifyDeterminate(
                  state.value,
                  message.min,
                  message.max,
                )
                return Complete({
                  value: next.value,
                  min: next.min,
                  max: next.max,
                })
              },
            ),
            when(
              () => true,
              'Determinate',
              ({ state, message }) => {
                const next = classifyDeterminate(
                  state.value,
                  message.min,
                  message.max,
                )
                return Determinate({
                  value: next.value,
                  min: next.min,
                  max: next.max,
                })
              },
            ),
          ],
          SetProgressIndeterminate: [
            when(
              (_state, _message, context) => kindOf(context) === 'Progress',
              'Indeterminate',
              ({ state }) => Indeterminate({ min: state.min, max: state.max }),
            ),
            ignore(),
          ],
        },
      },
      Complete: {
        on: {
          SetProgressRange: [
            when(
              (state, message) =>
                classifyDeterminate(state.value, message.min, message.max)
                  ._tag === 'Complete',
              'Complete',
              ({ state, message }) => {
                const next = classifyDeterminate(
                  state.value,
                  message.min,
                  message.max,
                )
                return Complete({
                  value: next.value,
                  min: next.min,
                  max: next.max,
                })
              },
            ),
            when(
              () => true,
              'Determinate',
              ({ state, message }) => {
                const next = classifyDeterminate(
                  state.value,
                  message.min,
                  message.max,
                )
                return Determinate({
                  value: next.value,
                  min: next.min,
                  max: next.max,
                })
              },
            ),
          ],
          SetProgressIndeterminate: [
            when(
              (_state, _message, context) => kindOf(context) === 'Progress',
              'Indeterminate',
              ({ state }) => Indeterminate({ min: state.min, max: state.max }),
            ),
            ignore(),
          ],
        },
      },
    },
    shared: [
      forStates(['Indeterminate', 'Determinate', 'Complete']).on({
        SetProgressValue: [
          when(
            (state, message) =>
              classifyDeterminate(message.value, state.min, state.max)._tag ===
              'Complete',
            'Complete',
            ({ state, message }) => {
              const next = classifyDeterminate(
                message.value,
                state.min,
                state.max,
              )
              return Complete({
                value: next.value,
                min: next.min,
                max: next.max,
              })
            },
          ),
          when(
            () => true,
            'Determinate',
            ({ state, message }) => {
              const next = classifyDeterminate(
                message.value,
                state.min,
                state.max,
              )
              return Determinate({
                value: next.value,
                min: next.min,
                max: next.max,
              })
            },
          ),
        ],
        ResetProgress: [
          when(
            (_state, _message, context) =>
              resetStateOf(context)._tag === 'Indeterminate',
            'Indeterminate',
            ({ context }) => {
              const next = resetStateOf(context)
              return Indeterminate({ min: next.min, max: next.max })
            },
          ),
          when(
            (_state, _message, context) =>
              resetStateOf(context)._tag === 'Complete',
            'Complete',
            ({ context }) => {
              const next = resetStateOf(context)
              return Complete({
                value: Option.getOrElse(valueOf(next), () => next.max),
                min: next.min,
                max: next.max,
              })
            },
          ),
          when(
            () => true,
            'Determinate',
            ({ context }) => {
              const next = resetStateOf(context)
              return Determinate({
                value: Option.getOrElse(valueOf(next), () => next.min),
                min: next.min,
                max: next.max,
              })
            },
          ),
        ],
      }),
    ],
  },
)

// SYNC

/** Default Progress / Meter synchronization: all Messages synced immediately. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = {
  SetProgressValue: Synced(),
  SetProgressRange: Synced(),
  SetProgressIndeterminate: Synced(),
  ResetProgress: Synced(),
}

/** Device-only synchronization table for a Progress / Meter kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetProgressValue: Device({ because }),
  SetProgressRange: Device({ because }),
  SetProgressIndeterminate: Device({ because }),
  ResetProgress: Device({ because }),
})

// SLOTS & PROJECTION

/**
 * The five painted slots of a Progress / Meter Part: `Root`, `Label`,
 * `Track`, `Range`, and `ValueText`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    focus: 'None',
    gestures: [],
  },
  Label: {
    focus: 'None',
    gestures: [],
  },
  Track: {
    role: 'Status',
    focus: 'None',
    gestures: [],
  },
  Range: {
    focus: 'None',
    gestures: [],
  },
  ValueText: {
    focus: 'None',
    gestures: [],
  },
}

const labelPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.labelledBy !== undefined) {
    return { labelledBy: props.labelledBy }
  } else if (props.label !== undefined && props.hasLabel !== true) {
    return { label: props.label }
  } else if (props.hasLabel === false) {
    return props.label === undefined ? {} : { label: props.label }
  } else {
    return { labelledBy: labelId(props.id) }
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  const orientation = orientationOf(props)
  const maybeValue = valueOf(state)
  const text = valueTextOf(state, props)

  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      orientation,
    }
  } else if (slot === 'Label') {
    return {
      id: labelId(props.id),
    }
  } else if (slot === 'Track') {
    const trackRole: SlotRole = kindOf(props) === 'Meter' ? 'Region' : 'Status'
    return {
      role: trackRole,
      id: trackId(props.id),
      orientation,
      ...labelPropsOf(props),
      valueMin: state.min,
      valueMax: state.max,
      ...(Option.isSome(maybeValue) ? { valueNow: maybeValue.value } : {}),
      valueText: text,
    }
  } else if (slot === 'Range') {
    return {
      id: rangeId(props.id),
      orientation,
      ...(Option.isSome(maybeValue) ? { valueNow: maybeValue.value } : {}),
    }
  } else if (slot === 'ValueText') {
    return {
      id: valueTextId(props.id),
      live: 'Polite',
      valueText: text,
    }
  } else {
    return {}
  }
}

/** What a restart opens a Progress / Meter on: keeps its domain state intact. */
export const atRest = (state: State): State => state

// PART FACTORY

/** Options for customizing a Progress / Meter Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Progress device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Progress / Meter {@link Part.Part}. Synced by default
 * (`category: 'Domain'`, `Pace.Synced`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's indicator local to one device.
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Progress',
    State,
    Message,
    chart,
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? synced
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
    slots,
    atRest,
    project: projectSlot,
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
  })

/**
 * Shorthand for a Progress / Meter Part whose state stays on the device and
 * is omitted from the synced log and encoded Model.
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

/** The default synced Progress / Meter Part (`name: 'Progress'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

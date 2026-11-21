import { Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core Switch Part (Widget #6 of 54, Scribe #2618). It
// models an accessible on/off toggle control in one framework-free Machine
// and Part declaration covering packages/ui Switch, Zag switch, and Radix
// switch. Its state (`Off` | `On`) lives in the Model, synced by default
// (`Domain` category) with a device-only option, and projects reference-stable
// SlotBindings (`Control`, `Label`, `Description`) rendered by HTML, React,
// and React Native generic hosts with zero Switch-specific painter logic.

// CONSTANTS

/** Default form submission value sent when the switch is checked. */
export const defaultValue = 'on'

// SCHEMAS

/**
 * Read-only props supplied to the Switch chart and projection from the
 * Program's Model. Configuration and form metadata stay out of the chart's
 * state.
 */
export const Props = S.Struct({
  id: S.String,
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  hasDescription: S.optionalKey(S.Boolean),
  name: S.optionalKey(S.String),
  value: S.optionalKey(S.String),
  form: S.optionalKey(S.String),
  defaultChecked: S.optionalKey(S.Boolean),
})
/** Read-only props supplied to the Switch chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The switch is off (`aria-checked="false"`). */
export const Off = ts('Off')
/** The switch is off. */
export type Off = typeof Off.Type

/** The switch is on (`aria-checked="true"`). */
export const On = ts('On')
/** The switch is on. */
export type On = typeof On.Type

/** Where a Switch stands: `Off` or `On`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Off, On])
/** Where a Switch stands. */
export type State = typeof State.Type

/** Initial Switch state: `Off`. */
export const initial: State = Off()

/** Creates an initial Switch state from a boolean (`true` gives `On()`, `false` gives `Off()`). */
export const initialChecked = (isChecked: boolean): State =>
  isChecked ? On() : Off()

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Toggles the switch between on and off when interactive. */
export const ToggleSwitch = Catalog.action('ToggleSwitch', {
  what: 'Toggles the switch between on and off',
  why: 'To change whether the setting is enabled',
  meta: { label: 'Toggle switch', keys: [] },
})

/** Sets the switch to an explicit checked value when interactive. */
export const SetSwitchChecked = Catalog.action('SetSwitchChecked', {
  fields: { isChecked: S.Boolean },
  what: 'Sets the switch to the requested checked value',
  why: 'To apply a specific on or off setting directly',
  meta: { label: 'Set switch', keys: [] },
})

/** Turns the switch on when interactive. */
export const TurnSwitchOn = Catalog.action('TurnSwitchOn', {
  what: 'Turns the switch on',
  why: 'To enable the setting',
  meta: { label: 'Turn switch on', keys: [] },
})

/** Turns the switch off when interactive. */
export const TurnSwitchOff = Catalog.action('TurnSwitchOff', {
  what: 'Turns the switch off',
  why: 'To disable the setting',
  meta: { label: 'Turn switch off', keys: [] },
})

/** The Catalog Actions a Switch Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ToggleSwitch,
  SetSwitchChecked,
  TurnSwitchOn,
  TurnSwitchOff,
]

// MESSAGES (Facts in addition to the Actions above)

/** A keyboard key was pressed while focus is on the switch control. */
export const PressedSwitchKey = m('PressedSwitchKey', { key: S.String })

/** The enclosing form was reset, restoring `props.defaultChecked` (default `false`). */
export const ResetSwitch = m('ResetSwitch')

/** Every Message the Switch chart handles. */
export const Message = S.Union([
  ToggleSwitch,
  SetSwitchChecked,
  TurnSwitchOn,
  TurnSwitchOff,
  PressedSwitchKey,
  ResetSwitch,
])
/** Every Message the Switch chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Switch Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS (shared by chart and thin painters such as @foldkit/ui Switch)

/** Derives the switch control element id from a switch's base `id`. */
export const controlId = (id: string): string => `${id}-control`

/** Derives the switch label element id from a switch's base `id`. */
export const labelId = (id: string): string => `${id}-label`

/** Derives the switch description element id from a switch's base `id`. */
export const descriptionId = (id: string): string => `${id}-description`

/** Derives the switch thumb element id from a switch's base `id`. */
export const thumbId = (id: string): string => `${id}-thumb`

/** Derives the switch hidden form input element id from a switch's base `id`. */
export const hiddenInputId = (id: string): string => `${id}-input`

// PURE RULES (shared by chart and thin painters such as @foldkit/ui Switch)

/** True when the switch is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'>): boolean =>
  props.isDisabled === true

/** True when the switch is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'>): boolean =>
  props.isReadOnly === true

/** True when the switch is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'>): boolean =>
  props.isRequired === true

/** True when the switch is marked invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'>): boolean =>
  props.isInvalid === true

/** True when the switch accepts toggle interaction (neither disabled nor read-only). */
export const isInteractiveOf = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'>,
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/** Default checked value used when initializing or resetting (`false` by default). */
export const defaultCheckedOf = (
  props: Pick<Props, 'defaultChecked'>,
): boolean => props.defaultChecked === true

/** Resolved form submission value when checked (`'on'` by default). */
export const valueOf = (props: Pick<Props, 'value'>): string =>
  props.value ?? defaultValue

/**
 * Form value submitted for a switch: `value` (default `'on'`) when checked,
 * or `''` when unchecked.
 *
 * @example
 * ```typescript
 * formValueOf(true) // 'on'
 * formValueOf(true, 'yes') // 'yes'
 * formValueOf(false, 'yes') // ''
 * ```
 */
export const formValueOf = (
  isChecked: boolean,
  value: string = defaultValue,
): string => (isChecked ? value : '')

/**
 * True when `key` is the Space key (`' '`), which toggles a switch on keyup
 * in WAI-ARIA and `@foldkit/ui` Switch.
 *
 * @example
 * ```typescript
 * isToggleKey(' ') // true
 * isToggleKey('Escape') // false
 * ```
 */
export const isToggleKey = (key: string): boolean => key === ' '

/**
 * True when `key` activates a switch via keyboard (`' '` Space or `'Enter'`),
 * matching WAI-ARIA Switch keyboard semantics when a host forwards raw keys.
 *
 * @example
 * ```typescript
 * isActivationKey(' ') // true
 * isActivationKey('Enter') // true
 * isActivationKey('Tab') // false
 * ```
 */
export const isActivationKey = (key: string): boolean =>
  key === ' ' || key === 'Enter'

/**
 * Computes the next checked value when toggling a switch, or `Option.none()`
 * when the switch is disabled or read-only.
 *
 * @example
 * ```typescript
 * nextCheckedOf({ isChecked: false }) // Some(true)
 * nextCheckedOf({ isChecked: true, isDisabled: true }) // None
 * nextCheckedOf({ isChecked: false, isReadOnly: true }) // None
 * ```
 */
export const nextCheckedOf = (
  input: Readonly<{
    isChecked: boolean
    isDisabled?: boolean
    isReadOnly?: boolean
  }>,
): Option.Option<boolean> =>
  isInteractiveOf(input) ? Option.some(!input.isChecked) : Option.none()

// READINGS

/** True when the switch state is `On`. */
export const isChecked = (state: State): boolean => state._tag === 'On'

/** True when the switch state is `On`. */
export const isOn = (state: State): boolean => state._tag === 'On'

/** True when the switch state is `Off`. */
export const isOff = (state: State): boolean => state._tag === 'Off'

/** Data state string matching Zag and Radix (`'checked'` when `On`, `'unchecked'` when `Off`). */
export const dataStateOf = (state: State): 'checked' | 'unchecked' =>
  isChecked(state) ? 'checked' : 'unchecked'

/** Form submission value derived directly from `state` and `props.value`. */
export const stateFormValueOf = (
  state: State,
  props: Pick<Props, 'value'>,
): string => formValueOf(isChecked(state), valueOf(props))

// CHART

/**
 * Builds the Switch Machine chart starting in `initialState`: toggle,
 * explicit on/off/setChecked, disabled and read-only guards, Space/Enter
 * keyboard activation, and form reset to `props.defaultChecked`.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Off: {
        on: {
          ToggleSwitch: [
            when(
              (_state, _message, context) => isInteractiveOf(context),
              'On',
              () => On(),
            ),
            ignore(),
          ],
          TurnSwitchOn: [
            when(
              (_state, _message, context) => isInteractiveOf(context),
              'On',
              () => On(),
            ),
            ignore(),
          ],
          SetSwitchChecked: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context) && message.isChecked,
              'On',
              () => On(),
            ),
            ignore(),
          ],
          PressedSwitchKey: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context) && isActivationKey(message.key),
              'On',
              () => On(),
            ),
            ignore(),
          ],
          ResetSwitch: [
            when(
              (_state, _message, context) => defaultCheckedOf(context),
              'On',
              () => On(),
            ),
            ignore(),
          ],
        },
      },
      On: {
        on: {
          ToggleSwitch: [
            when(
              (_state, _message, context) => isInteractiveOf(context),
              'Off',
              () => Off(),
            ),
            ignore(),
          ],
          TurnSwitchOff: [
            when(
              (_state, _message, context) => isInteractiveOf(context),
              'Off',
              () => Off(),
            ),
            ignore(),
          ],
          SetSwitchChecked: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context) && !message.isChecked,
              'Off',
              () => Off(),
            ),
            ignore(),
          ],
          PressedSwitchKey: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context) && isActivationKey(message.key),
              'Off',
              () => Off(),
            ),
            ignore(),
          ],
          ResetSwitch: [
            when(
              (_state, _message, context) => !defaultCheckedOf(context),
              'Off',
              () => Off(),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** The default Switch Machine chart starting in `Off()`. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  ToggleSwitch: pace,
  SetSwitchChecked: pace,
  TurnSwitchOn: pace,
  TurnSwitchOff: pace,
  PressedSwitchKey: pace,
  ResetSwitch: pace,
})

/** Default synchronization: every Switch Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Switch kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The three painted slots of a Switch Part: `Control`, `Label`, and `Description`. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Control: {
    role: 'Switch',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleSwitch' }],
  },
  Label: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleSwitch' }],
  },
  Description: {
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
  if (slot === 'Control') {
    const isDisabled = isDisabledOf(props)
    const isReadOnly = isReadOnlyOf(props)
    const isRequired = isRequiredOf(props)
    const labelProps =
      props.label !== undefined
        ? { label: props.label }
        : props.hasLabel === false
          ? {}
          : { labelledBy: labelId(props.id) }
    const descriptionProps =
      props.hasDescription === false
        ? {}
        : { describedBy: descriptionId(props.id) }
    return {
      id: controlId(props.id),
      isChecked: isChecked(state),
      tabIndex: 0,
      ...labelProps,
      ...descriptionProps,
      ...(isDisabled ? { isDisabled: true } : {}),
      ...(isReadOnly ? { isReadOnly: true } : {}),
      ...(isRequired ? { isRequired: true } : {}),
    }
  } else if (slot === 'Label') {
    return {
      id: labelId(props.id),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Description') {
    return {
      id: descriptionId(props.id),
    }
  } else {
    return {}
  }
}

/** What a restart opens a Switch on: preserves its checked state (`Off` or `On`). */
export const atRest = (state: State): State => state

// PART FACTORY

/** Options for customizing a Switch Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'` or `'OwnChoice'`) to keep this Switch device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial checked state for the Part's chart (`false` by default). */
  defaultChecked?: boolean
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Switch {@link Part.Part}. Synced by default (`category: 'Domain'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Switch local to one device.
 *
 * @example
 * ```typescript
 * const NotificationsSwitch = Switch.make({ name: 'NotificationsSwitch' })
 * const LocalSwitch = Switch.make({ name: 'LocalSwitch', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Switch',
    State,
    Message,
    chart: options.defaultChecked === true ? chartOf(On()) : chart,
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
 * Shorthand for a Switch Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalSwitch = Switch.deviceOnly({ name: 'LocalSwitch' })
 * ```
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.defaultChecked === undefined
      ? {}
      : { defaultChecked: options.defaultChecked }),
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
    sync: options.because ?? 'OwnView',
  })

/** The default synced Switch Part (`name: 'Switch'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

import { Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core Toggle / Button Part (Widget #9 of 54, Scribe #2623).
// It models an accessible two-state toggle button and pure button activation
// rules in one framework-free Machine and Part declaration covering packages/ui
// Button, Zag toggle, and Radix toggle. Its state (`Unpressed` | `Pressed`)
// lives in the Model, synced by default (`Domain` category) with a device-only
// option, and projects reference-stable SlotBindings (`Button`, `Label`,
// `Description`) rendered by HTML, React, and React Native generic hosts with
// zero Toggle- or Button-specific painter logic.

// SCHEMAS

/** Native HTML button behavior kind (`'button'`, `'submit'`, or `'reset'`). */
export const ButtonType = S.Literals(['button', 'submit', 'reset'])
/** Native HTML button behavior kind. */
export type ButtonType = typeof ButtonType.Type

/** Standard `data-state` marker for a toggle button (`'on'` when pressed, `'off'` when unpressed). */
export const DataState = S.Literals(['on', 'off'])
/** Standard `data-state` marker for a toggle button. */
export type DataState = typeof DataState.Type

// CONSTANTS

/** Default button type when `type` is omitted (`'button'`). */
export const defaultButtonType: ButtonType = 'button'

/**
 * Read-only props supplied to the Toggle chart and projection from the
 * Program's Model. Configuration and accessibility linkage stay out of the
 * chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  type: S.optionalKey(ButtonType),
  label: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  hasDescription: S.optionalKey(S.Boolean),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
  defaultPressed: S.optionalKey(S.Boolean),
})
/** Read-only props supplied to the Toggle chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The toggle button is unpressed (`aria-pressed="false"`, `data-state="off"`). */
export const Unpressed = ts('Unpressed')
/** The toggle button is unpressed. */
export type Unpressed = typeof Unpressed.Type

/** The toggle button is pressed (`aria-pressed="true"`, `data-state="on"`). */
export const Pressed = ts('Pressed')
/** The toggle button is pressed. */
export type Pressed = typeof Pressed.Type

/** Where a Toggle Part stands: `Unpressed` or `Pressed`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Unpressed, Pressed])
/** Where a Toggle Part stands. */
export type State = typeof State.Type

/** Initial Toggle state: `Unpressed`. */
export const initial: State = Unpressed()

/** Creates an initial Toggle state from a boolean (`true` gives `Pressed()`, `false` gives `Unpressed()`). */
export const initialPressed = (isPressed: boolean): State =>
  isPressed ? Pressed() : Unpressed()

// ACTIONS

/** Toggles the button between pressed and unpressed when interactive. */
export const ToggleButton = Catalog.action('ToggleButton', {
  what: 'Toggles the button between pressed and unpressed',
  why: 'To switch the control between active and inactive',
  meta: { label: 'Toggle button', keys: [] },
})

/** Sets the button to an explicit pressed value when interactive. */
export const SetButtonPressed = Catalog.action('SetButtonPressed', {
  fields: { isPressed: S.Boolean },
  what: 'Sets the button to an explicit pressed value',
  why: 'To assign a known active or inactive state directly',
  meta: { label: 'Set button pressed', keys: [] },
})

/** Marks the button as pressed when interactive. */
export const PressButton = Catalog.action('PressButton', {
  what: 'Marks the button as pressed',
  why: 'To activate the control',
  meta: { label: 'Press button', keys: [] },
})

/** Marks the button as unpressed when interactive. */
export const ReleaseButton = Catalog.action('ReleaseButton', {
  what: 'Marks the button as unpressed',
  why: 'To deactivate the control',
  meta: { label: 'Release button', keys: [] },
})

/** The Catalog Actions a Toggle Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ToggleButton,
  SetButtonPressed,
  PressButton,
  ReleaseButton,
]

// MESSAGES

/** A keyboard key was pressed while focus is on the toggle button. */
export const PressedButtonKey = m('PressedButtonKey', { key: S.String })

/** The toggle was reset to `props.defaultPressed` (default `false`). */
export const ResetToggle = m('ResetToggle')

/** Every Message the Toggle chart handles. */
export const Message = S.Union([
  ToggleButton,
  SetButtonPressed,
  PressButton,
  ReleaseButton,
  PressedButtonKey,
  ResetToggle,
])
/** Every Message the Toggle chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Toggle Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the toggle button element id from a base `id`. */
export const buttonId = (id: string): string => `${id}-button`

/** Derives the toggle label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

/** Derives the toggle description element id from a base `id`. */
export const descriptionId = (id: string): string => `${id}-description`

// PURE RULES & BUTTON HELPERS

/** True when the button or toggle is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'>): boolean =>
  props.isDisabled === true

/** True when the toggle is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'>): boolean =>
  props.isReadOnly === true

/** Default pressed value used when initializing or resetting (`false` by default). */
export const defaultPressedOf = (
  props: Pick<Props, 'defaultPressed'>,
): boolean => props.defaultPressed === true

/**
 * Resolved button type (`'button'` when `props.type` is omitted).
 *
 * @example
 * ```typescript
 * buttonTypeOf({}) // 'button'
 * buttonTypeOf({ type: 'submit' }) // 'submit'
 * ```
 */
export const buttonTypeOf = (props: Pick<Props, 'type'> = {}): ButtonType =>
  props.type ?? defaultButtonType

/**
 * True when the button or toggle accepts interaction (neither disabled nor read-only).
 *
 * @example
 * ```typescript
 * isInteractive({ isDisabled: false }) // true
 * isInteractive({ isDisabled: true }) // false
 * isInteractive({ isReadOnly: true }) // false
 * ```
 */
export const isInteractive = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'>,
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/**
 * True when the button or toggle can be activated (alias of {@link isInteractive}).
 *
 * @example
 * ```typescript
 * canActivate({}) // true
 * canActivate({ isDisabled: true }) // false
 * ```
 */
export const canActivate = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'>,
): boolean => isInteractive(props)

/**
 * True when a button should respond to a click: it is interactive (neither
 * disabled nor read-only) and, if `hasHandler` is specified, a handler exists.
 * Shared by thin painters such as `@foldkit/ui` `Button`.
 *
 * @example
 * ```typescript
 * canClick({ isDisabled: false }) // true
 * canClick({ isDisabled: true }) // false
 * canClick({ isDisabled: false, hasHandler: false }) // false
 * ```
 */
export const canClick = (
  input: Readonly<{
    isDisabled?: boolean
    isReadOnly?: boolean
    hasHandler?: boolean
  }>,
): boolean => isInteractive(input) && input.hasHandler !== false

/**
 * True when `key` activates a button or toggle via keyboard (`' '` Space or
 * `'Enter'`), matching WAI-ARIA Button and Toggle Button keyboard semantics.
 *
 * @example
 * ```typescript
 * isActivationKey(' ') // true
 * isActivationKey('Enter') // true
 * isActivationKey('Escape') // false
 * ```
 */
export const isActivationKey = (key: string): boolean =>
  key === ' ' || key === 'Enter'

/**
 * Computes the next pressed value when toggling, or `Option.none()` when the
 * toggle is disabled or read-only.
 *
 * @example
 * ```typescript
 * nextPressedOf({ isPressed: false }) // Some(true)
 * nextPressedOf({ isPressed: true }) // Some(false)
 * nextPressedOf({ isPressed: false, isDisabled: true }) // None
 * ```
 */
export const nextPressedOf = (
  input: Readonly<{
    isPressed: boolean
    isDisabled?: boolean
    isReadOnly?: boolean
  }>,
): Option.Option<boolean> =>
  isInteractive(input) ? Option.some(!input.isPressed) : Option.none()

// READINGS

/** True when `state` is `Pressed`. */
export const isPressed = (state: State): boolean => state._tag === 'Pressed'

/** True when `state` is `Unpressed`. */
export const isUnpressed = (state: State): boolean => state._tag === 'Unpressed'

/**
 * Projects `state` to its standard `data-state` marker matching Zag and Radix
 * (`'on'` when `Pressed`, `'off'` when `Unpressed`).
 *
 * @example
 * ```typescript
 * dataStateOf(Pressed()) // 'on'
 * dataStateOf(Unpressed()) // 'off'
 * ```
 */
export const dataStateOf = (state: State): DataState =>
  isPressed(state) ? 'on' : 'off'

// CHART

const canActivateGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => canActivate(context)

/**
 * Builds the Toggle Machine chart starting in `initialState`: toggle,
 * explicit press/release/setPressed, disabled and read-only guards,
 * Space/Enter keyboard activation, and reset to `props.defaultPressed`.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Unpressed: {
        on: {
          ToggleButton: [
            when(canActivateGuard, 'Pressed', () => Pressed()),
            ignore(),
          ],
          PressButton: [
            when(canActivateGuard, 'Pressed', () => Pressed()),
            ignore(),
          ],
          SetButtonPressed: [
            when(
              (_state, message, context) =>
                canActivate(context) && message.isPressed,
              'Pressed',
              () => Pressed(),
            ),
            ignore(),
          ],
          PressedButtonKey: [
            when(
              (_state, message, context) =>
                canActivate(context) && isActivationKey(message.key),
              'Pressed',
              () => Pressed(),
            ),
            ignore(),
          ],
          ResetToggle: [
            when(
              (_state, _message, context) => defaultPressedOf(context),
              'Pressed',
              () => Pressed(),
            ),
            ignore(),
          ],
        },
      },
      Pressed: {
        on: {
          ToggleButton: [
            when(canActivateGuard, 'Unpressed', () => Unpressed()),
            ignore(),
          ],
          ReleaseButton: [
            when(canActivateGuard, 'Unpressed', () => Unpressed()),
            ignore(),
          ],
          SetButtonPressed: [
            when(
              (_state, message, context) =>
                canActivate(context) && !message.isPressed,
              'Unpressed',
              () => Unpressed(),
            ),
            ignore(),
          ],
          PressedButtonKey: [
            when(
              (_state, message, context) =>
                canActivate(context) && isActivationKey(message.key),
              'Unpressed',
              () => Unpressed(),
            ),
            ignore(),
          ],
          ResetToggle: [
            when(
              (_state, _message, context) => !defaultPressedOf(context),
              'Unpressed',
              () => Unpressed(),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** The default Toggle Machine chart starting in `Unpressed()`. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  ToggleButton: pace,
  SetButtonPressed: pace,
  PressButton: pace,
  ReleaseButton: pace,
  PressedButtonKey: pace,
  ResetToggle: pace,
})

/** Default synchronization: every Toggle Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Toggle kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The three painted slots of a Toggle Part:
 * - `Button`: the interactive toggle button (`role="button"`, `aria-pressed`, `ToggleButton`).
 * - `Label`: the clickable label linked via `aria-labelledby` (`ToggleButton`).
 * - `Description`: the descriptive text linked via `aria-describedby`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Button: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleButton' }],
  },
  Label: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleButton' }],
  },
  Description: {
    focus: 'None',
    gestures: [],
  },
}

const labelSlotPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.labelledBy !== undefined) {
    return { labelledBy: props.labelledBy }
  } else if (props.hasLabel === false) {
    return props.label === undefined ? {} : { label: props.label }
  } else if (props.label !== undefined && props.hasLabel !== true) {
    return { label: props.label }
  } else {
    return { labelledBy: labelId(props.id) }
  }
}

const descriptionSlotPropsOf = (
  props: Props,
): Pick<SlotProps, 'describedBy'> => {
  if (props.describedBy !== undefined) {
    return { describedBy: props.describedBy }
  } else if (props.hasDescription === false) {
    return {}
  } else {
    return { describedBy: descriptionId(props.id) }
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Button') {
    return {
      id: buttonId(props.id),
      isPressed: isPressed(state),
      tabIndex: 0,
      ...labelSlotPropsOf(props),
      ...descriptionSlotPropsOf(props),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
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

/** What a restart opens a Toggle on: preserves its pressed state (`Unpressed` or `Pressed`). */
export const atRest = (state: State): State => state

// PART FACTORY

/** Options for customizing a Toggle Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'` or `'OwnChoice'`) to keep this Toggle device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial pressed state for the Part's chart (`false` by default). */
  defaultPressed?: boolean
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Toggle {@link Part.Part}. Synced by default (`category: 'Domain'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Toggle local to one device.
 *
 * @example
 * ```typescript
 * const MuteToggle = Toggle.make({ name: 'MuteToggle' })
 * const BoldToggle = Toggle.make({ name: 'BoldToggle', defaultPressed: true })
 * const LocalToggle = Toggle.make({ name: 'LocalToggle', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Toggle',
    State,
    Message,
    chart: options.defaultPressed === true ? chartOf(Pressed()) : chart,
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
 * Shorthand for a Toggle Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalToggle = Toggle.deviceOnly({ name: 'LocalToggle' })
 * ```
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.defaultPressed === undefined
      ? {}
      : { defaultPressed: options.defaultPressed }),
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
    sync: options.because ?? 'OwnView',
  })

/** The default synced Toggle Part (`name: 'Toggle'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

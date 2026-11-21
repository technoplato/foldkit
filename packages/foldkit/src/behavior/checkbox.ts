import { Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core Checkbox Part (Widget #7 of 54, Scribe #2619).
// It defines a tri-state (Unchecked / Checked / Indeterminate) Checkbox as a
// framework-free Machine and Part declaration covering disabled and readOnly
// guards, required/invalid/name/value form metadata, Space-only WAI-ARIA
// keyboard toggling, element IDs, and reference-stable SlotBindings rendered
// by HTML, React, and React Native generic hosts with zero Checkbox-specific
// painter logic.

// CONSTANTS

/** Default form submission value for a checked checkbox when `props.value` is omitted. */
export const defaultValue = 'on'

// SCHEMAS

/** WAI-ARIA `aria-checked` value for a tri-state checkbox (`true`, `false`, or `'mixed'`). */
export const AriaChecked = S.Union([S.Boolean, S.Literal('mixed')])
/** WAI-ARIA `aria-checked` value for a tri-state checkbox. */
export type AriaChecked = typeof AriaChecked.Type

/** Standard `data-state` marker for a tri-state checkbox (`'checked'`, `'unchecked'`, or `'indeterminate'`). */
export const DataState = S.Literals(['checked', 'unchecked', 'indeterminate'])
/** Standard `data-state` marker for a tri-state checkbox. */
export type DataState = typeof DataState.Type

/**
 * Read-only props supplied to the Checkbox chart and projection from the
 * Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  name: S.optionalKey(S.String),
  value: S.optionalKey(S.String),
  label: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  hasDescription: S.optionalKey(S.Boolean),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
})
/** Read-only props supplied to the Checkbox chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The checkbox is unchecked. */
export const Unchecked = ts('Unchecked')
/** The checkbox is unchecked. */
export type Unchecked = typeof Unchecked.Type

/** The checkbox is checked. */
export const Checked = ts('Checked')
/** The checkbox is checked. */
export type Checked = typeof Checked.Type

/** The checkbox is in an indeterminate (mixed) state. */
export const Indeterminate = ts('Indeterminate')
/** The checkbox is in an indeterminate (mixed) state. */
export type Indeterminate = typeof Indeterminate.Type

/** Where a Checkbox Part stands. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Unchecked, Checked, Indeterminate])
/** Where a Checkbox Part stands. */
export type State = typeof State.Type

/** Initial Checkbox state: unchecked. */
export const initial: State = Unchecked()

// ACTIONS

/** Toggles the checkbox (`Unchecked -> Checked`, `Indeterminate -> Checked`, `Checked -> Unchecked`). */
export const ToggleCheckbox = Catalog.action('ToggleCheckbox', {
  what: 'Toggles the checkbox between checked and unchecked',
  why: 'To flip the option state',
  meta: { label: 'Toggle checkbox', keys: [] },
})

/** Marks the checkbox as checked. */
export const CheckCheckbox = Catalog.action('CheckCheckbox', {
  what: 'Marks the checkbox as checked',
  why: 'To enable or select the option',
  meta: { label: 'Check', keys: [] },
})

/** Clears the checkbox to unchecked. */
export const UncheckCheckbox = Catalog.action('UncheckCheckbox', {
  what: 'Clears the checkbox to unchecked',
  why: 'To disable or deselect the option',
  meta: { label: 'Uncheck', keys: [] },
})

/** Sets the checkbox explicitly to checked or unchecked. */
export const SetCheckboxChecked = Catalog.action('SetCheckboxChecked', {
  fields: { isChecked: S.Boolean },
  what: 'Sets the checkbox to an explicit checked or unchecked state',
  why: 'To assign a known on or off value',
  meta: { label: 'Set checkbox', keys: [] },
})

/** Marks the checkbox as indeterminate (mixed). */
export const SetCheckboxIndeterminate = Catalog.action(
  'SetCheckboxIndeterminate',
  {
    what: 'Marks the checkbox as indeterminate',
    why: 'To represent a partially selected group',
    meta: { label: 'Set indeterminate', keys: [] },
  },
)

/** The Catalog Actions a Checkbox Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ToggleCheckbox,
  CheckCheckbox,
  UncheckCheckbox,
  SetCheckboxChecked,
  SetCheckboxIndeterminate,
]

// MESSAGES

/** A key was released on the checkbox control; only Space (`' '`) toggles per WAI-ARIA. */
export const PressedCheckboxKey = m('PressedCheckboxKey', {
  key: S.String,
})

/** Every Message the Checkbox chart handles. */
export const Message = S.Union([
  ToggleCheckbox,
  CheckCheckbox,
  UncheckCheckbox,
  SetCheckboxChecked,
  SetCheckboxIndeterminate,
  PressedCheckboxKey,
])
/** Every Message the Checkbox chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Checkbox Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the checkbox control element id from a base `id`. */
export const controlId = (id: string): string => `${id}-control`

/** Derives the checkbox label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

/** Derives the checkbox description element id from a base `id`. */
export const descriptionId = (id: string): string => `${id}-description`

/** Derives the checkbox hidden form input element id from a base `id`. */
export const hiddenInputId = (id: string): string => `${id}-input`

// PURE RULES & READINGS

/** Resolved `isDisabled` flag for `props` (defaults to `false`). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'>): boolean =>
  props.isDisabled === true

/** Resolved `isReadOnly` flag for `props` (defaults to `false`). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'>): boolean =>
  props.isReadOnly === true

/** Resolved `isRequired` flag for `props` (defaults to `false`). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'>): boolean =>
  props.isRequired === true

/** Resolved `isInvalid` flag for `props` (defaults to `false`). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'>): boolean =>
  props.isInvalid === true

/** True when user and agent interactions may change the checkbox state (neither disabled nor read-only). */
export const isInteractiveOf = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'>,
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/** Resolved form submission value for `props` (defaults to `'on'`). */
export const valueOf = (props: Pick<Props, 'value'> = {}): string =>
  props.value ?? defaultValue

/** True when `state` is `Checked`. */
export const isChecked = (state: State): boolean => state._tag === 'Checked'

/** True when `state` is `Unchecked`. */
export const isUnchecked = (state: State): boolean => state._tag === 'Unchecked'

/** True when `state` is `Indeterminate`. */
export const isIndeterminate = (state: State): boolean =>
  state._tag === 'Indeterminate'

/**
 * Derives a tri-state {@link State} from boolean flags (`isIndeterminate`
 * takes precedence over `isChecked`), shared by thin painters such as
 * `@foldkit/ui` `Checkbox`.
 *
 * @example
 * ```typescript
 * stateFrom({ isChecked: false }) // Unchecked()
 * stateFrom({ isChecked: true }) // Checked()
 * stateFrom({ isChecked: false, isIndeterminate: true }) // Indeterminate()
 * ```
 */
export const stateFrom = (
  input: Readonly<{ isChecked: boolean; isIndeterminate?: boolean }>,
): State => {
  if (input.isIndeterminate === true) {
    return Indeterminate()
  } else if (input.isChecked) {
    return Checked()
  } else {
    return Unchecked()
  }
}

/**
 * Projects `state` to its WAI-ARIA `aria-checked` value (`true`, `false`, or `'mixed'`).
 *
 * @example
 * ```typescript
 * ariaCheckedOf(Unchecked()) // false
 * ariaCheckedOf(Checked()) // true
 * ariaCheckedOf(Indeterminate()) // 'mixed'
 * ```
 */
export const ariaCheckedOf = (state: State): AriaChecked =>
  M.value(state).pipe(
    M.withReturnType<AriaChecked>(),
    M.tagsExhaustive({
      Unchecked: () => false,
      Checked: () => true,
      Indeterminate: () => 'mixed',
    }),
  )

/**
 * Projects `state` to its standard `data-state` attribute (`'checked'`, `'unchecked'`, or `'indeterminate'`).
 *
 * @example
 * ```typescript
 * dataStateOf(Unchecked()) // 'unchecked'
 * dataStateOf(Checked()) // 'checked'
 * dataStateOf(Indeterminate()) // 'indeterminate'
 * ```
 */
export const dataStateOf = (state: State): DataState =>
  M.value(state).pipe(
    M.withReturnType<DataState>(),
    M.tagsExhaustive({
      Unchecked: () => 'unchecked',
      Checked: () => 'checked',
      Indeterminate: () => 'indeterminate',
    }),
  )

/**
 * Derives the hidden form input value for `state`: `value` (default `'on'`)
 * when `Checked`, otherwise `''` (for both `Unchecked` and `Indeterminate`).
 *
 * @example
 * ```typescript
 * formValueOf(Checked()) // 'on'
 * formValueOf(Checked(), { value: 'yes' }) // 'yes'
 * formValueOf(Unchecked()) // ''
 * formValueOf(Indeterminate()) // ''
 * ```
 */
export const formValueOf = (
  state: State,
  props: Pick<Props, 'value'> = {},
): string => (isChecked(state) ? valueOf(props) : '')

/**
 * The boolean checked value produced by toggling `state`:
 * `Unchecked -> true`, `Indeterminate -> true`, `Checked -> false`.
 *
 * @example
 * ```typescript
 * nextCheckedOnToggle(Unchecked()) // true
 * nextCheckedOnToggle(Indeterminate()) // true
 * nextCheckedOnToggle(Checked()) // false
 * ```
 */
export const nextCheckedOnToggle = (state: State): boolean =>
  M.value(state).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      Unchecked: () => true,
      Indeterminate: () => true,
      Checked: () => false,
    }),
  )

/**
 * True when `key` toggles a checkbox (`' '` / Space only, matching WAI-ARIA
 * and `@foldkit/ui` Checkbox; `Enter` does not toggle a checkbox).
 *
 * @example
 * ```typescript
 * isToggleKey(' ') // true
 * isToggleKey('Enter') // false
 * ```
 */
export const isToggleKey = (key: string): boolean => key === ' '

/**
 * Pure checkbox keyboard rule shared by the chart and thin painters such as
 * `@foldkit/ui` `Checkbox`: returns `Some(nextChecked)` on Space (`' '`) when
 * interactive (neither disabled nor read-only), else `None`.
 *
 * @example
 * ```typescript
 * resolveKeyToggle({ key: ' ', state: Unchecked() }) // Some(true)
 * resolveKeyToggle({ key: ' ', state: Indeterminate() }) // Some(true)
 * resolveKeyToggle({ key: ' ', state: Checked() }) // Some(false)
 * resolveKeyToggle({ key: 'Enter', state: Unchecked() }) // None
 * resolveKeyToggle({ key: ' ', state: Unchecked(), isDisabled: true }) // None
 * ```
 */
export const resolveKeyToggle = (
  input: Readonly<{
    key: string
    state: State
    isDisabled?: boolean
    isReadOnly?: boolean
  }>,
): Option.Option<boolean> =>
  isInteractiveOf(input) && isToggleKey(input.key)
    ? Option.some(nextCheckedOnToggle(input.state))
    : Option.none()

// CHART

const isInteractiveGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => isInteractiveOf(context)

const makeChart = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Unchecked: {
        on: {
          ToggleCheckbox: [
            when(isInteractiveGuard, 'Checked', () => Checked()),
            ignore(),
          ],
          CheckCheckbox: [
            when(isInteractiveGuard, 'Checked', () => Checked()),
            ignore(),
          ],
          SetCheckboxChecked: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context) && message.isChecked,
              'Checked',
              () => Checked(),
            ),
            ignore(),
          ],
          SetCheckboxIndeterminate: [
            when(isInteractiveGuard, 'Indeterminate', () => Indeterminate()),
            ignore(),
          ],
          PressedCheckboxKey: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context) && isToggleKey(message.key),
              'Checked',
              () => Checked(),
            ),
            ignore(),
          ],
        },
      },
      Checked: {
        on: {
          ToggleCheckbox: [
            when(isInteractiveGuard, 'Unchecked', () => Unchecked()),
            ignore(),
          ],
          UncheckCheckbox: [
            when(isInteractiveGuard, 'Unchecked', () => Unchecked()),
            ignore(),
          ],
          SetCheckboxChecked: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context) && !message.isChecked,
              'Unchecked',
              () => Unchecked(),
            ),
            ignore(),
          ],
          SetCheckboxIndeterminate: [
            when(isInteractiveGuard, 'Indeterminate', () => Indeterminate()),
            ignore(),
          ],
          PressedCheckboxKey: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context) && isToggleKey(message.key),
              'Unchecked',
              () => Unchecked(),
            ),
            ignore(),
          ],
        },
      },
      Indeterminate: {
        on: {
          ToggleCheckbox: [
            when(isInteractiveGuard, 'Checked', () => Checked()),
            ignore(),
          ],
          CheckCheckbox: [
            when(isInteractiveGuard, 'Checked', () => Checked()),
            ignore(),
          ],
          UncheckCheckbox: [
            when(isInteractiveGuard, 'Unchecked', () => Unchecked()),
            ignore(),
          ],
          SetCheckboxChecked: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context) && message.isChecked,
              'Checked',
              () => Checked(),
            ),
            when(
              (_state, message, context) =>
                isInteractiveOf(context) && !message.isChecked,
              'Unchecked',
              () => Unchecked(),
            ),
            ignore(),
          ],
          PressedCheckboxKey: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context) && isToggleKey(message.key),
              'Checked',
              () => Checked(),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/**
 * The Checkbox Machine chart: tri-state `Unchecked` / `Checked` / `Indeterminate`
 * transitions, `ToggleCheckbox` (`Indeterminate -> Checked`), explicit
 * `CheckCheckbox` / `UncheckCheckbox` / `SetCheckboxChecked` /
 * `SetCheckboxIndeterminate`, disabled and read-only guards, and Space-only
 * keyboard toggling.
 */
export const chart = makeChart(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  ToggleCheckbox: pace,
  CheckCheckbox: pace,
  UncheckCheckbox: pace,
  SetCheckboxChecked: pace,
  SetCheckboxIndeterminate: pace,
  PressedCheckboxKey: pace,
})

/** Default synchronization: every Checkbox Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Checkbox kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The three painted slots of a Checkbox Part:
 * - `Control`: the interactive checkbox (`role="checkbox"`, `aria-checked`, `ToggleCheckbox`).
 * - `Label`: the clickable label linked via `aria-labelledby` (`ToggleCheckbox`).
 * - `Description`: the descriptive text linked via `aria-describedby`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Control: {
    role: 'Checkbox',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleCheckbox' }],
  },
  Label: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleCheckbox' }],
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
  if (slot === 'Control') {
    return {
      id: controlId(props.id),
      isChecked: ariaCheckedOf(state),
      tabIndex: 0,
      ...labelSlotPropsOf(props),
      ...descriptionSlotPropsOf(props),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
      ...(isInvalidOf(props) ? { isInvalid: true } : {}),
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

/** What a restart opens a Checkbox on: keeps the checked, unchecked, or indeterminate state intact. */
export const atRest = (state: State): State => state

// PART FACTORY

/** Options for customizing a Checkbox Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep Checkbox state device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial state when the Part mounts (`Unchecked()`, `Checked()`, or `Indeterminate()`). Defaults to `Unchecked()`. */
  initial?: State
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Checkbox {@link Part.Part}. Synced by default (`category: 'Domain'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Checkbox local to one device.
 *
 * @example
 * ```typescript
 * const AcceptTerms = Checkbox.make({ name: 'AcceptTerms' })
 * const SelectAll = Checkbox.make({ name: 'SelectAll', initial: Checkbox.Indeterminate() })
 * const LocalFilter = Checkbox.make({ name: 'LocalFilter', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Checkbox',
    State,
    Message,
    chart: options.initial === undefined ? chart : makeChart(options.initial),
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
 * Shorthand for a Checkbox Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalCheckbox = Checkbox.deviceOnly({ name: 'LocalCheckbox' })
 * ```
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.initial === undefined ? {} : { initial: options.initial }),
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
    sync: options.because ?? 'OwnView',
  })

/** The default synced Checkbox Part (`name: 'Checkbox'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

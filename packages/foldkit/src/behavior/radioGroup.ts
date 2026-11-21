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
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as RovingFocus from './rovingFocus.js'
import { SlotOrientation, type SlotProps } from './slot.js'

// NOTE: this is the core RadioGroup Part (Widget #8 of 54, Scribe #2620).
// It reuses `rovingFocus` in one framework-free Machine and Part declaration
// covering packages/ui RadioGroup, Zag radio-group, and Radix radio-group.
// Its state (`Idle` | `Focused`) lives in the Model, synced by default
// (`Domain` category) with a device-only option, and projects reference-stable
// SlotBindings (`Group`, `Option`, `Label`, `Description`) rendered by HTML,
// React, and React Native generic hosts with zero RadioGroup-specific painter
// logic.

// SCHEMAS

/** Controls the radio group layout direction and which arrow keys navigate between options. */
export const Orientation = SlotOrientation
/** Controls the radio group layout direction and which arrow keys navigate between options. */
export type Orientation = typeof Orientation.Type

/** One radio option in a RadioGroup, as plain data. */
export const Item = S.Struct({
  value: S.String,
  label: S.String,
  isDisabled: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  hasDescription: S.optionalKey(S.Boolean),
})
/** One radio option in a RadioGroup, as plain data. */
export type Item = typeof Item.Type

/**
 * Read-only props supplied to the RadioGroup chart and projection from the
 * Program's Model. Options and form metadata stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  options: S.Array(Item),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  defaultValue: S.optionalKey(S.String),
  orientation: S.optionalKey(Orientation),
  direction: S.optionalKey(RovingFocus.Direction),
  loop: S.optionalKey(S.Boolean),
  pageKeys: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  name: S.optionalKey(S.String),
  form: S.optionalKey(S.String),
})
/** Read-only props supplied to the RadioGroup chart and projection. */
export type Props = typeof Props.Type

/** A keyboard key press that commits selection to the option at `index`. */
export const SelectIndex = ts('SelectIndex', { index: S.Number })
/** A keyboard key press that commits selection to the option at `index`. */
export type SelectIndex = typeof SelectIndex.Type

/** A keyboard key press that moves focus to `index` without changing selection (used when read-only). */
export const FocusIndex = ts('FocusIndex', { index: S.Number })
/** A keyboard key press that moves focus to `index` without changing selection. */
export type FocusIndex = typeof FocusIndex.Type

/** The pure outcome of a key press on a radio group, shared by the chart and thin painters. */
export const KeyOutcome = S.Union([SelectIndex, FocusIndex])
/** The pure outcome of a key press on a radio group. */
export type KeyOutcome = typeof KeyOutcome.Type

// STATE

/** No option has explicit focus divergence; the roving tab stop follows the selected option when enabled. */
export const Idle = ts('Idle', {
  maybeSelectedValue: S.Option(S.String),
})
/** No option has explicit focus divergence. */
export type Idle = typeof Idle.Type

/** Keyboard focus is on `focusedValue`, which may differ from `maybeSelectedValue` when unselected or read-only. */
export const Focused = ts('Focused', {
  maybeSelectedValue: S.Option(S.String),
  focusedValue: S.String,
})
/** Keyboard focus is on `focusedValue`. */
export type Focused = typeof Focused.Type

/** Where a RadioGroup stands: `Idle` or `Focused`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Focused])
/** Where a RadioGroup stands. */
export type State = typeof State.Type

/** Initial RadioGroup state: idle with no option selected. */
export const initial: State = Idle({ maybeSelectedValue: Option.none() })

/** Creates an initial RadioGroup state with `value` pre-selected. */
export const initialSelected = (value: string): State =>
  Idle({ maybeSelectedValue: Option.some(value) })

// ACTIONS

/** Selects an enabled radio option by its value when the group is interactive. */
export const SelectRadioOption = Catalog.action('SelectRadioOption', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'option',
    prompt: 'Select which option?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No option is available',
  },
  what: 'Selects the chosen radio option',
  why: 'To pick one choice from the group',
  meta: { label: 'Select option', keys: [] },
})

/** Clears the active selection when the group is interactive. */
export const ClearRadioSelection = Catalog.action('ClearRadioSelection', {
  what: 'Clears the selected radio option',
  why: 'To leave the group with no option chosen',
  meta: { label: 'Clear selection', keys: [] },
})

/** The Catalog Actions a RadioGroup Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SelectRadioOption,
  ClearRadioSelection,
]

// MESSAGE

/** A radio option received focus without changing selection. */
export const FocusRadioOption = m('FocusRadioOption', { value: S.String })

/** Focus left the radio group, clearing transient focus divergence while keeping selection. */
export const BlurRadioGroup = m('BlurRadioGroup')

/** A keyboard key was pressed while focus is inside the radio group. */
export const PressedRadioKey = m('PressedRadioKey', { key: S.String })

/** The enclosing form was reset, restoring `props.defaultValue` (or none) and returning to rest. */
export const ResetRadioGroup = m('ResetRadioGroup')

/** Every Message the RadioGroup chart handles. */
export const Message = S.Union([
  SelectRadioOption,
  ClearRadioSelection,
  FocusRadioOption,
  BlurRadioGroup,
  PressedRadioKey,
  ResetRadioGroup,
])
/** Every Message the RadioGroup chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the RadioGroup Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the radiogroup container element id from a RadioGroup's base `id`. */
export const groupId = (id: string): string => `${id}-group`

/** Derives one radio option element id from a RadioGroup's base `id` and `index`. */
export const optionId = (id: string, index: number): string =>
  `${id}-option-${index}`

/** Derives one radio option label element id from a RadioGroup's base `id` and `index`. */
export const labelId = (id: string, index: number): string =>
  `${id}-option-${index}-label`

/** Derives one radio option description element id from a RadioGroup's base `id` and `index`. */
export const descriptionId = (id: string, index: number): string =>
  `${id}-option-${index}-description`

/** Derives the hidden form input element id from a RadioGroup's base `id`. */
export const hiddenInputId = (id: string): string => `${id}-input`

// PURE RULES

/** Resolved orientation for `props` (defaults to `'Vertical'`, matching `@foldkit/ui` RadioGroup). */
export const orientationOf = (props: Pick<Props, 'orientation'>): Orientation =>
  props.orientation ?? 'Vertical'

/** Resolved reading direction for `props` (defaults to `'Ltr'`). */
export const directionOf = (
  props: Pick<Props, 'direction'>,
): RovingFocus.Direction => props.direction ?? 'Ltr'

/** True when roving navigation wraps at the ends (`true` by default). */
export const loopOf = (props: Pick<Props, 'loop'>): boolean =>
  props.loop ?? true

/** True when the entire radio group is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'>): boolean =>
  props.isDisabled === true

/** True when the radio group is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'>): boolean =>
  props.isReadOnly === true

/** True when a selection is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'>): boolean =>
  props.isRequired === true

/** True when the radio group is marked invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'>): boolean =>
  props.isInvalid === true

/** True when the radio group accepts selection changes (neither disabled nor read-only). */
export const isInteractiveOf = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'>,
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/**
 * Resolves the roving tab stop index for a list of `count` radio options.
 * Prefers `maybeFocusedIndex` when enabled, then `maybeSelectedIndex` when
 * enabled, and otherwise falls back to the first enabled option so keyboard
 * navigation is never stranded on a disabled selected option.
 *
 * @example
 * ```typescript
 * resolveFocusedIndex({
 *   count: 3,
 *   maybeSelectedIndex: Option.some(0),
 *   isDisabled: index => index === 0,
 * })
 * // Some(1)
 * ```
 */
export const resolveFocusedIndex = (
  input: Readonly<{
    count: number
    maybeSelectedIndex: Option.Option<number>
    maybeFocusedIndex?: Option.Option<number>
    isDisabled?: (index: number) => boolean
  }>,
): Option.Option<number> => {
  const isDisabled = input.isDisabled ?? (() => false)
  const isEnabled = (index: number): boolean =>
    index >= 0 && index < input.count && !isDisabled(index)
  const fromFocused = Option.filter(
    input.maybeFocusedIndex ?? Option.none(),
    isEnabled,
  )
  const fromSelected = Option.filter(input.maybeSelectedIndex, isEnabled)
  return Option.orElse(fromFocused, () =>
    Option.orElse(fromSelected, () =>
      RovingFocus.firstEnabled(input.count, isDisabled),
    ),
  )
}

/**
 * Resolves a key press on a radio group into a selection or focus outcome
 * using `RovingFocus.resolveKey`.
 *
 * - Orientation arrow keys (`ArrowDown`/`ArrowUp` in `Vertical`,
 *   `ArrowRight`/`ArrowLeft` in `Horizontal` respecting `Ltr`/`Rtl`), `Home`,
 *   `End`, and `PageUp`/`PageDown` (when `pageKeys` is true) produce
 *   `SelectIndex` normally and `FocusIndex` when `isReadOnly` is true.
 * - Space (`' '`) produces `SelectIndex` for the currently focused enabled
 *   option when not read-only. `Enter` does not select a radio option per
 *   WAI-ARIA.
 * - Any other key, or when no enabled option exists, produces `Option.none()`.
 *
 * @example
 * ```typescript
 * resolveKeyOutcome({ key: 'ArrowDown', count: 3, current: Option.some(0) })
 * // Some(SelectIndex({ index: 1 }))
 * resolveKeyOutcome({ key: ' ', count: 3, current: Option.some(0) })
 * // Some(SelectIndex({ index: 0 }))
 * resolveKeyOutcome({ key: 'ArrowDown', count: 3, current: Option.some(0), isReadOnly: true })
 * // Some(FocusIndex({ index: 1 }))
 * ```
 */
export const resolveKeyOutcome = (
  input: Readonly<{
    key: string
    count: number
    current: Option.Option<number>
    isDisabled?: (index: number) => boolean
    isReadOnly?: boolean
    orientation?: Orientation
    direction?: RovingFocus.Direction
    loop?: boolean
    pageKeys?: boolean
  }>,
): Option.Option<KeyOutcome> => {
  const isDisabled = input.isDisabled ?? (() => false)
  const isReadOnly = input.isReadOnly === true
  const orientation = input.orientation ?? 'Vertical'
  const direction = input.direction ?? 'Ltr'
  const loop = input.loop ?? true
  const pageKeys = input.pageKeys ?? true

  if (input.key === ' ') {
    if (isReadOnly) {
      return Option.none()
    } else {
      return pipe(
        input.current,
        Option.filter(
          index => index >= 0 && index < input.count && !isDisabled(index),
        ),
        Option.map(index => SelectIndex({ index })),
      )
    }
  } else {
    return Option.map(
      RovingFocus.resolveKey({
        key: input.key,
        count: input.count,
        current: input.current,
        isDisabled,
        orientation,
        direction,
        loop,
        pageKeys,
      }),
      index => (isReadOnly ? FocusIndex({ index }) : SelectIndex({ index })),
    )
  }
}

// INTERNAL HELPERS

const isOptionDisabledAt =
  (props: Props) =>
  (index: number): boolean =>
    isDisabledOf(props) ||
    Option.exists(
      Array.get(props.options, index),
      item => item.isDisabled === true,
    )

const isEnabledIndex = (props: Props, index: number): boolean =>
  index >= 0 &&
  index < props.options.length &&
  !isOptionDisabledAt(props)(index)

const indexByValue = (props: Props, value: string): Option.Option<number> =>
  Array.findFirstIndex(props.options, item => item.value === value)

const enabledIndexByValue = (
  props: Props,
  value: string,
): Option.Option<number> =>
  Option.filter(indexByValue(props, value), index =>
    isEnabledIndex(props, index),
  )

const enabledValueAt = (props: Props, index: number): Option.Option<string> =>
  isEnabledIndex(props, index)
    ? Option.map(Array.get(props.options, index), item => item.value)
    : Option.none()

const defaultSelectedValueOf = (props: Props): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(props.defaultValue), value =>
    Option.isSome(indexByValue(props, value)),
  )

// READINGS

/** The selected option's index in `props.options`, or none when unselected or absent. */
export const selectedIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> =>
  Option.flatMap(state.maybeSelectedValue, value => indexByValue(props, value))

/** The selected option's value when present in `props.options`, or none. */
export const selectedValueOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(selectedIndexOf(state, props), index =>
    Option.map(Array.get(props.options, index), item => item.value),
  )

/** The selected option item, or none. */
export const selectedItemOf = (
  state: State,
  props: Props,
): Option.Option<Item> =>
  Option.flatMap(selectedIndexOf(state, props), index =>
    Array.get(props.options, index),
  )

/**
 * The focused option's index in `props.options` (driving roving `tabIndex: 0`).
 * Uses explicit keyboard focus when enabled, otherwise the selected option ONLY
 * when it is enabled, otherwise the first enabled option so keyboard navigation
 * is never stranded. Returns `Option.none()` when empty or all options are
 * disabled.
 */
export const focusedIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> =>
  resolveFocusedIndex({
    count: props.options.length,
    maybeSelectedIndex: selectedIndexOf(state, props),
    maybeFocusedIndex:
      state._tag === 'Focused'
        ? indexByValue(props, state.focusedValue)
        : Option.none(),
    isDisabled: isOptionDisabledAt(props),
  })

/** The focused option's value, or none when empty or all options are disabled. */
export const focusedValueOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(focusedIndexOf(state, props), index =>
    Option.map(Array.get(props.options, index), item => item.value),
  )

/** True when keyboard focus is explicitly tracked inside the radio group. */
export const isFocused = (state: State): boolean => state._tag === 'Focused'

/** True when the option with `value` is currently selected. */
export const isOptionSelected = (
  state: State,
  props: Props,
  value: string,
): boolean => Option.contains(selectedValueOf(state, props), value)

/** True when the option with `value` currently holds the roving tab stop. */
export const isOptionFocused = (
  state: State,
  props: Props,
  value: string,
): boolean => Option.contains(focusedValueOf(state, props), value)

/** True when the option with `value` is disabled (either on the option or via the group). */
export const isOptionDisabled = (props: Props, value: string): boolean =>
  isDisabledOf(props) ||
  Option.exists(indexByValue(props, value), isOptionDisabledAt(props))

/** Data state string for one option matching Zag and Radix (`'checked'` or `'unchecked'`). */
export const optionDataStateOf = (
  state: State,
  props: Props,
  value: string,
): 'checked' | 'unchecked' =>
  isOptionSelected(state, props, value) ? 'checked' : 'unchecked'

/** Form submission payload when both `props.name` and a selected option exist. */
export const hiddenInputOf = (
  state: State,
  props: Props,
): Option.Option<
  Readonly<{ id: string; name: string; value: string; form?: string }>
> =>
  Option.flatMap(Option.fromNullishOr(props.name), name =>
    Option.map(selectedValueOf(state, props), value => ({
      id: hiddenInputId(props.id),
      name,
      value,
      ...(props.form === undefined ? {} : { form: props.form }),
    })),
  )

// CHART TRANSITION HELPERS

const selectOptionEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof SelectRadioOption.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof SelectRadioOption.Type, context: Props) =>
      isInteractiveOf(context)
        ? Option.flatMap(enabledIndexByValue(context, message.value), index =>
            enabledValueAt(context, index),
          )
        : Option.none(),
    'Focused',
    ({ guardValue }) =>
      Focused({
        maybeSelectedValue: Option.some(guardValue),
        focusedValue: guardValue,
      }),
  ),
  ignore(),
]

const focusOptionEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof FocusRadioOption.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof FocusRadioOption.Type, context: Props) =>
      Option.flatMap(enabledIndexByValue(context, message.value), index =>
        enabledValueAt(context, index),
      ),
    'Focused',
    ({ state, guardValue }) =>
      Focused({
        maybeSelectedValue: state.maybeSelectedValue,
        focusedValue: guardValue,
      }),
  ),
  ignore(),
]

const pressedKeyEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof PressedRadioKey.Type, never, Props>
> => [
  when(
    (state: S, message: typeof PressedRadioKey.Type, context: Props) =>
      Option.flatMap(
        resolveKeyOutcome({
          key: message.key,
          count: context.options.length,
          current: focusedIndexOf(state, context),
          isDisabled: isOptionDisabledAt(context),
          isReadOnly: isReadOnlyOf(context),
          orientation: orientationOf(context),
          direction: directionOf(context),
          loop: loopOf(context),
          pageKeys: context.pageKeys ?? true,
        }),
        outcome =>
          Option.map(enabledValueAt(context, outcome.index), value => ({
            outcome,
            value,
          })),
      ),
    'Focused',
    ({ state, guardValue }) =>
      M.value(guardValue.outcome).pipe(
        M.withReturnType<Focused>(),
        M.tagsExhaustive({
          SelectIndex: () =>
            Focused({
              maybeSelectedValue: Option.some(guardValue.value),
              focusedValue: guardValue.value,
            }),
          FocusIndex: () =>
            Focused({
              maybeSelectedValue: state.maybeSelectedValue,
              focusedValue: guardValue.value,
            }),
        }),
      ),
  ),
  ignore(),
]

// CHART

/**
 * Builds the RadioGroup Machine chart starting in `initialState`: selection,
 * clearing, form reset to `props.defaultValue`, horizontal and vertical
 * orientation, LTR and RTL reading direction, looping or clamped roving focus,
 * Space selection, disabled group and per-option disabled guards, read-only
 * navigation without selection, and blur clearing focus divergence.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          SelectRadioOption: selectOptionEdges<Idle>(),
          ClearRadioSelection: [
            when(
              (state, _message, context) =>
                isInteractiveOf(context) &&
                Option.isSome(state.maybeSelectedValue),
              'Idle',
              () => Idle({ maybeSelectedValue: Option.none() }),
            ),
            ignore(),
          ],
          FocusRadioOption: focusOptionEdges<Idle>(),
          PressedRadioKey: pressedKeyEdges<Idle>(),
          ResetRadioGroup: [
            when(
              (state, _message, context) =>
                Option.getOrUndefined(state.maybeSelectedValue) !==
                Option.getOrUndefined(defaultSelectedValueOf(context)),
              'Idle',
              ({ context }) =>
                Idle({ maybeSelectedValue: defaultSelectedValueOf(context) }),
            ),
            ignore(),
          ],
        },
      },
      Focused: {
        on: {
          SelectRadioOption: selectOptionEdges<Focused>(),
          ClearRadioSelection: [
            when(
              (state, _message, context) =>
                isInteractiveOf(context) &&
                Option.isSome(state.maybeSelectedValue),
              'Focused',
              ({ state }) =>
                Focused({
                  maybeSelectedValue: Option.none(),
                  focusedValue: state.focusedValue,
                }),
            ),
            ignore(),
          ],
          FocusRadioOption: focusOptionEdges<Focused>(),
          BlurRadioGroup: to('Idle', ({ state }) =>
            Idle({ maybeSelectedValue: state.maybeSelectedValue }),
          ),
          PressedRadioKey: pressedKeyEdges<Focused>(),
          ResetRadioGroup: to('Idle', ({ context }) =>
            Idle({ maybeSelectedValue: defaultSelectedValueOf(context) }),
          ),
        },
      },
    },
  })

/** The default RadioGroup Machine chart starting in `Idle({ maybeSelectedValue: Option.none() })`. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  SelectRadioOption: pace,
  ClearRadioSelection: pace,
  FocusRadioOption: pace,
  BlurRadioGroup: pace,
  PressedRadioKey: pace,
  ResetRadioGroup: pace,
})

/** Default synchronization: every RadioGroup Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a RadioGroup kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The four painted slots of a RadioGroup Part: `Group`, `Option`, `Label`, and `Description`. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Group: {
    role: 'RadioGroup',
    focus: 'None',
    gestures: [],
  },
  Option: {
    role: 'Radio',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectRadioOption' }],
  },
  Label: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectRadioOption' }],
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
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Group') {
    return {
      id: groupId(props.id),
      orientation: orientationOf(props),
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(props.labelledBy === undefined
        ? {}
        : { labelledBy: props.labelledBy }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
    }
  } else if (slot === 'Option') {
    return Option.match(
      Option.flatMap(maybeChoice, value => indexByValue(props, value)),
      {
        onNone: () => ({}),
        onSome: index => {
          const isDisabled = isOptionDisabledAt(props)(index)
          const isReadOnly = isReadOnlyOf(props)
          const isChecked = Option.contains(
            selectedIndexOf(state, props),
            index,
          )
          const isRovingTarget =
            !isDisabled && Option.contains(focusedIndexOf(state, props), index)
          const hasDescription = Option.exists(
            Array.get(props.options, index),
            item => item.hasDescription !== false,
          )
          return {
            id: optionId(props.id, index),
            isChecked,
            labelledBy: labelId(props.id, index),
            ...(hasDescription
              ? { describedBy: descriptionId(props.id, index) }
              : {}),
            tabIndex: isRovingTarget ? 0 : -1,
            ...(isDisabled ? { isDisabled: true } : {}),
            ...(isReadOnly ? { isReadOnly: true } : {}),
          }
        },
      },
    )
  } else if (slot === 'Label') {
    return Option.match(
      Option.flatMap(maybeChoice, value => indexByValue(props, value)),
      {
        onNone: () => ({}),
        onSome: index => ({
          id: labelId(props.id, index),
          ...(isOptionDisabledAt(props)(index) ? { isDisabled: true } : {}),
        }),
      },
    )
  } else if (slot === 'Description') {
    return Option.match(
      Option.flatMap(maybeChoice, value => indexByValue(props, value)),
      {
        onNone: () => ({}),
        onSome: index => ({
          id: descriptionId(props.id, index),
        }),
      },
    )
  } else {
    return {}
  }
}

/** What a restart opens a RadioGroup on: keeps the selected option and clears transient focus state. */
export const atRest = (state: State): State =>
  Idle({ maybeSelectedValue: state.maybeSelectedValue })

// PART FACTORY

/** Options for customizing a RadioGroup Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'` or `'OwnChoice'`) to keep this RadioGroup device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial selected value for the Part's chart (none by default). */
  defaultValue?: string
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a RadioGroup {@link Part.Part}. Synced by default (`category: 'Domain'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * RadioGroup local to one device.
 *
 * @example
 * ```typescript
 * const ToolRadioGroup = RadioGroup.make({ name: 'ToolRadioGroup' })
 * const LocalRadioGroup = RadioGroup.make({ name: 'LocalRadioGroup', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'RadioGroup',
    State,
    Message,
    chart:
      options.defaultValue === undefined
        ? chart
        : chartOf(initialSelected(options.defaultValue)),
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
 * Shorthand for a RadioGroup Part whose state stays on the device and is
 * omitted from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalRadioGroup = RadioGroup.deviceOnly({ name: 'LocalRadioGroup' })
 * ```
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.defaultValue === undefined
      ? {}
      : { defaultValue: options.defaultValue }),
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
    sync: options.because ?? 'OwnView',
  })

/** The default synced RadioGroup Part (`name: 'RadioGroup'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

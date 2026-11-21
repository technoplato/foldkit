import { Array, Option, Schema as S } from 'effect'

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
import * as Selection from './selection.js'
import { SlotOrientation, type SlotProps } from './slot.js'
import * as Toggle from './toggle.js'

// NOTE: this is the core ToggleGroup Part (Widget #30 of 54, Scribe #2669). It
// composes `RovingFocus` and `Selection` into one framework-free Machine and
// Part declaration covering Zag toggle-group and Radix toggle-group: `Single`
// and `Multiple` modes, `deselectable` guard (true by default), horizontal or
// vertical orientation, LTR/RTL direction, loop, disabled and read-only
// guards, roving tabindex, and `isPressed` (`aria-pressed`) on every item. Its
// state (`Idle` | `Focused`) lives in the Model, synced by default (`Domain`
// category, `Pace.Synced`) with `ToggleGroup.make` and `ToggleGroup.deviceOnly()`.

// SCHEMAS

/** Controls the toggle group layout direction and which arrow keys navigate between items. */
export const Orientation = SlotOrientation
/** Controls the toggle group layout direction and which arrow keys navigate between items. */
export type Orientation = typeof Orientation.Type

/** Whether one item (`Single`) or many items (`Multiple`) may be pressed at once. */
export const SelectionMode = Selection.SelectionMode
/** Whether one item or many items may be pressed at once. */
export type SelectionMode = Selection.SelectionMode

/** Standard `data-state` marker for one toggle item (`'on'` when pressed, `'off'` when unpressed). */
export const DataState = Toggle.DataState
/** Standard `data-state` marker for one toggle item. */
export type DataState = Toggle.DataState

/** Default toggle group orientation (`'Horizontal'`). */
export const defaultOrientation: Orientation = 'Horizontal'

/** Default horizontal reading direction (`'Ltr'`). */
export const defaultDirection: RovingFocus.Direction = 'Ltr'

/** One toggle button inside a ToggleGroup, as plain data. */
export const Item = S.Struct({
  value: S.String,
  label: S.String,
  isDisabled: S.optionalKey(S.Boolean),
})
/** One toggle button inside a ToggleGroup. */
export type Item = typeof Item.Type

/**
 * Read-only props supplied to the ToggleGroup chart and projection from the
 * Program's Model. Items and policies stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  items: S.Array(Item),
  mode: S.optionalKey(SelectionMode),
  deselectable: S.optionalKey(S.Boolean),
  orientation: S.optionalKey(Orientation),
  direction: S.optionalKey(RovingFocus.Direction),
  loop: S.optionalKey(S.Boolean),
  rovingFocus: S.optionalKey(S.Boolean),
  pageKeys: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  defaultValue: S.optionalKey(S.Array(S.String)),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
})
/** Read-only props supplied to the ToggleGroup chart and projection. */
export type Props = typeof Props.Type

// STATE

/** Focus is outside the toggle group while preserving which items are pressed. */
export const Idle = ts('Idle', {
  selection: Selection.State,
})
/** Focus is outside the toggle group. */
export type Idle = typeof Idle.Type

/** Focus is on `focusedValue` inside the toggle group, driving roving navigation and activation. */
export const Focused = ts('Focused', {
  selection: Selection.State,
  focusedValue: S.String,
})
/** Focus is inside the toggle group. */
export type Focused = typeof Focused.Type

/** Where a ToggleGroup Part stands: `Idle` or `Focused`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Focused])
/** Where a ToggleGroup Part stands. */
export type State = typeof State.Type

/** Initial ToggleGroup state: idle with no pressed items. */
export const initial: State = Idle({ selection: Selection.initial })

/** Creates an initial idle ToggleGroup state with `values` pre-pressed. */
export const initialSelected = (values: ReadonlyArray<string>): State =>
  Idle({ selection: Selection.initialSelected(values) })

// ACTIONS

/** Toggles an enabled toggle group item between pressed and unpressed. */
export const ToggleGroupItem = Catalog.action('ToggleGroupItem', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'item',
    prompt: 'Toggle which group item?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No toggle item is available',
  },
  what: 'Toggles the pressed state of the chosen group item',
  why: 'To switch that option between active and inactive',
  meta: { label: 'Toggle item', keys: [] },
})

/** Marks an enabled toggle group item as pressed. */
export const SelectGroupItem = Catalog.action('SelectGroupItem', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'item',
    prompt: 'Press which group item?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No toggle item is available',
  },
  what: 'Marks the chosen group item as pressed',
  why: 'To include that option in the active set',
  meta: { label: 'Select toggle item', keys: [] },
})

/** Releases a pressed toggle group item when deselectability permits. */
export const DeselectGroupItem = Catalog.action('DeselectGroupItem', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'item',
    prompt: 'Release which group item?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No toggle item is available',
  },
  what: 'Releases the pressed state of the chosen group item',
  why: 'To remove that option from the active set',
  meta: { label: 'Deselect toggle item', keys: [] },
})

/** Releases every pressed item in the toggle group when deselectability permits. */
export const ClearToggleGroup = Catalog.action('ClearToggleGroup', {
  what: 'Releases every pressed item in the toggle group',
  why: 'To leave no options active',
  meta: { label: 'Clear toggle group', keys: [] },
})

/** The Catalog Actions a ToggleGroup Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ToggleGroupItem,
  SelectGroupItem,
  DeselectGroupItem,
  ClearToggleGroup,
]

// MESSAGES

/** Focus moved onto an enabled toggle item without changing pressed values. */
export const FocusToggleGroupItem = m('FocusToggleGroupItem', {
  value: S.String,
})

/** Focus left the toggle group, returning to `Idle` while keeping pressed values. */
export const BlurToggleGroup = m('BlurToggleGroup')

/** A key was pressed while interacting with the toggle group (roving keys or Space/Enter). */
export const PressedToggleGroupKey = m('PressedToggleGroupKey', {
  key: S.String,
})

/** Replaces the pressed items programmatically with `values`. */
export const ReplaceToggleGroupSelection = m('ReplaceToggleGroupSelection', {
  values: S.Array(S.String),
})

/** Reconciles pressed values and focus against an updated `props.items` list. */
export const ReconcileToggleGroupItems = m('ReconcileToggleGroupItems')

/** Resets pressed values to `props.defaultValue` (or empty) and returns to `Idle`. */
export const ResetToggleGroup = m('ResetToggleGroup')

/** Every Message the ToggleGroup chart handles. */
export const Message = S.Union([
  ToggleGroupItem,
  SelectGroupItem,
  DeselectGroupItem,
  ClearToggleGroup,
  FocusToggleGroupItem,
  BlurToggleGroup,
  PressedToggleGroupKey,
  ReplaceToggleGroupSelection,
  ReconcileToggleGroupItems,
  ResetToggleGroup,
])
/** Every Message the ToggleGroup chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the ToggleGroup Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the toggle group root element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives one toggle item element id from a base `id` and `index`. */
export const itemId = (id: string, index: number): string =>
  `${id}-item-${index.toString()}`

// PURE RULES & CONFIGURATION READERS

/** Resolved selection mode (`'Single'` by default). */
export const modeOf = (props: Pick<Props, 'mode'> = {}): SelectionMode =>
  props.mode ?? 'Single'

/** True when multiple items may be pressed at once. */
export const isMultipleOf = (props: Pick<Props, 'mode'> = {}): boolean =>
  modeOf(props) === 'Multiple'

/** True when the last pressed item may be released (`true` by default for ToggleGroup). */
export const isDeselectableOf = (
  props: Pick<Props, 'deselectable'> = {},
): boolean => props.deselectable ?? true

/** Resolved orientation (`'Horizontal'` by default). */
export const orientationOf = (
  props: Pick<Props, 'orientation'> = {},
): Orientation => props.orientation ?? defaultOrientation

/** Resolved horizontal reading direction (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): RovingFocus.Direction => props.direction ?? defaultDirection

/** True when roving navigation wraps around edges (`true` by default). */
export const loopOf = (props: Pick<Props, 'loop'> = {}): boolean =>
  props.loop ?? true

/** True when roving tabindex and arrow navigation are enabled (`true` by default). */
export const rovingFocusOf = (
  props: Pick<Props, 'rovingFocus'> = {},
): boolean => props.rovingFocus ?? true

/** True when `PageUp` / `PageDown` jump to first/last enabled items (`true` by default). */
export const pageKeysOf = (props: Pick<Props, 'pageKeys'> = {}): boolean =>
  props.pageKeys ?? true

/** True when the entire toggle group is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the toggle group is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when pressed state may be changed by user interaction (neither disabled nor read-only). */
export const isInteractiveOf = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

const selectionPropsOf = (props: Props): Selection.Props => ({
  items: Array.map(props.items, item => ({
    value: item.value,
    ...(item.isDisabled === undefined ? {} : { isDisabled: item.isDisabled }),
  })),
  mode: modeOf(props),
  deselectable: isDeselectableOf(props),
  isDisabled: !isInteractiveOf(props),
})

const isItemDisabledAt =
  (props: Props) =>
  (index: number): boolean =>
    isDisabledOf(props) ||
    Option.exists(
      Array.get(props.items, index),
      item => item.isDisabled === true,
    )

const isEnabledIndex = (props: Props, index: number): boolean =>
  index >= 0 && index < props.items.length && !isItemDisabledAt(props)(index)

const indexByValue = (props: Props, value: string): Option.Option<number> =>
  Array.findFirstIndex(props.items, item => item.value === value)

const enabledValueByValue = (
  props: Props,
  value: string,
): Option.Option<string> =>
  Option.flatMap(indexByValue(props, value), index =>
    isEnabledIndex(props, index) ? Option.some(value) : Option.none(),
  )

const enabledValueAt = (props: Props, index: number): Option.Option<string> =>
  isEnabledIndex(props, index)
    ? Option.map(Array.get(props.items, index), item => item.value)
    : Option.none()

// READINGS

/** All currently pressed item values in order (`[]` when none are pressed). */
export const valuesOf = (state: State): ReadonlyArray<string> =>
  Selection.selectedOf(state.selection)

/** First pressed value in `props.items` order (or head of `valuesOf`), or none. */
export const valueOf = (
  state: State,
  props?: Pick<Props, 'items'>,
): Option.Option<string> =>
  Selection.firstSelectedOf(
    state.selection,
    props === undefined
      ? undefined
      : {
          items: Array.map(props.items, item => ({
            value: item.value,
            ...(item.isDisabled === undefined
              ? {}
              : { isDisabled: item.isDisabled }),
          })),
        },
  )

/** True when the item named `value` is currently pressed. */
export const isItemPressed = (state: State, value: string): boolean =>
  Selection.isSelected(state.selection, value)

/** True when keyboard focus is explicitly tracked inside the toggle group. */
export const isFocused = (state: State): boolean => state._tag === 'Focused'

/** Standard `data-state` marker for one item (`'on'` when pressed, `'off'` when unpressed). */
export const itemDataStateOf = (state: State, value: string): DataState =>
  isItemPressed(state, value) ? 'on' : 'off'

/**
 * The toggle item index currently holding the roving tab stop (`tabIndex: 0`).
 * Prefers `focusedValue` when enabled, then the first pressed enabled item,
 * then the first enabled item.
 */
export const focusedIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> => {
  if (isDisabledOf(props)) {
    return Option.none()
  }
  const fromFocused =
    state._tag === 'Focused'
      ? Option.filter(indexByValue(props, state.focusedValue), index =>
          isEnabledIndex(props, index),
        )
      : Option.none<number>()
  const fromSelected = Option.flatMap(valueOf(state, props), selected =>
    Option.filter(indexByValue(props, selected), index =>
      isEnabledIndex(props, index),
    ),
  )
  return Option.orElse(fromFocused, () =>
    Option.orElse(fromSelected, () =>
      RovingFocus.firstEnabled(props.items.length, isItemDisabledAt(props)),
    ),
  )
}

/** The toggle item value holding the roving tab stop, or none. */
export const focusedValueOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(focusedIndexOf(state, props), index =>
    Option.map(Array.get(props.items, index), item => item.value),
  )

/** True when the item with `value` is disabled (individually or via the group). */
export const isItemDisabled = (props: Props, value: string): boolean =>
  isDisabledOf(props) ||
  Option.exists(indexByValue(props, value), isItemDisabledAt(props))

// INTERNAL CHART HELPERS

const toggleItemEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof ToggleGroupItem.Type, never, Props>
> => [
  when(
    (state: S, message: typeof ToggleGroupItem.Type, context: Props) =>
      isInteractiveOf(context)
        ? Option.map(enabledValueByValue(context, message.value), value => ({
            value,
            selection: Selection.toggle(
              state.selection,
              value,
              selectionPropsOf(context),
            ),
          }))
        : Option.none(),
    'Focused',
    ({ guardValue }) =>
      Focused({
        selection: guardValue.selection,
        focusedValue: guardValue.value,
      }),
  ),
  ignore(),
]

const selectItemEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof SelectGroupItem.Type, never, Props>
> => [
  when(
    (state: S, message: typeof SelectGroupItem.Type, context: Props) =>
      isInteractiveOf(context)
        ? Option.map(enabledValueByValue(context, message.value), value => ({
            value,
            selection: Selection.select(
              state.selection,
              value,
              selectionPropsOf(context),
            ),
          }))
        : Option.none(),
    'Focused',
    ({ guardValue }) =>
      Focused({
        selection: guardValue.selection,
        focusedValue: guardValue.value,
      }),
  ),
  ignore(),
]

const deselectItemEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof DeselectGroupItem.Type, never, Props>
> => [
  when(
    (state: S, message: typeof DeselectGroupItem.Type, context: Props) => {
      if (!isInteractiveOf(context)) {
        return Option.none()
      }
      const next = Selection.deselect(
        state.selection,
        message.value,
        selectionPropsOf(context),
      )
      return next === state.selection
        ? Option.none()
        : Option.map(enabledValueByValue(context, message.value), value => ({
            value,
            selection: next,
          }))
    },
    'Focused',
    ({ guardValue }) =>
      Focused({
        selection: guardValue.selection,
        focusedValue: guardValue.value,
      }),
  ),
  ignore(),
]

const focusItemEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof FocusToggleGroupItem.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof FocusToggleGroupItem.Type, context: Props) =>
      enabledValueByValue(context, message.value),
    'Focused',
    ({ state, guardValue }) =>
      Focused({
        selection: state.selection,
        focusedValue: guardValue,
      }),
  ),
  ignore(),
]

const pressedKeyEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    S,
    typeof PressedToggleGroupKey.Type,
    never,
    Props
  >
> => [
  when(
    (state: S, message: typeof PressedToggleGroupKey.Type, context: Props) =>
      isInteractiveOf(context) && Toggle.isActivationKey(message.key)
        ? Option.map(focusedValueOf(state, context), value => ({
            value,
            selection: Selection.toggle(
              state.selection,
              value,
              selectionPropsOf(context),
            ),
          }))
        : Option.none(),
    'Focused',
    ({ guardValue }) =>
      Focused({
        selection: guardValue.selection,
        focusedValue: guardValue.value,
      }),
  ),
  when(
    (state: S, message: typeof PressedToggleGroupKey.Type, context: Props) =>
      isDisabledOf(context) || !rovingFocusOf(context)
        ? Option.none()
        : Option.flatMap(
            RovingFocus.resolveKey({
              key: message.key,
              count: context.items.length,
              current: focusedIndexOf(state, context),
              isDisabled: isItemDisabledAt(context),
              orientation: orientationOf(context),
              direction: directionOf(context),
              loop: loopOf(context),
              pageKeys: pageKeysOf(context),
            }),
            index => enabledValueAt(context, index),
          ),
    'Focused',
    ({ state, guardValue }) =>
      Focused({
        selection: state.selection,
        focusedValue: guardValue,
      }),
  ),
  ignore(),
]

// CHART

/**
 * Builds the ToggleGroup Machine chart starting in `initialState`: `Single` and
 * `Multiple` modes via `Selection`, `deselectable` guard, horizontal/vertical
 * orientation, LTR/RTL roving navigation via `RovingFocus`, Space/Enter toggle
 * activation, disabled and read-only guards, item reconciliation, and reset.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          ToggleGroupItem: toggleItemEdges<Idle>(),
          SelectGroupItem: selectItemEdges<Idle>(),
          DeselectGroupItem: deselectItemEdges<Idle>(),
          ClearToggleGroup: [
            when(
              (state, _message, context) => {
                const next = Selection.clear(
                  state.selection,
                  selectionPropsOf(context),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Idle',
              ({ guardValue }) => Idle({ selection: guardValue }),
            ),
            ignore(),
          ],
          FocusToggleGroupItem: focusItemEdges<Idle>(),
          PressedToggleGroupKey: pressedKeyEdges<Idle>(),
          ReplaceToggleGroupSelection: [
            when(
              (state, message, context) => {
                const next = Selection.replace(
                  state.selection,
                  message.values,
                  selectionPropsOf(context),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Idle',
              ({ guardValue }) => Idle({ selection: guardValue }),
            ),
            ignore(),
          ],
          ReconcileToggleGroupItems: [
            when(
              (state, _message, context) => {
                const next = Selection.reconcile(
                  state.selection,
                  selectionPropsOf(context),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Idle',
              ({ guardValue }) => Idle({ selection: guardValue }),
            ),
            ignore(),
          ],
          ResetToggleGroup: to('Idle', ({ state, context }) =>
            Idle({
              selection: Selection.replace(
                state.selection,
                context.defaultValue ?? [],
                { ...selectionPropsOf(context), isDisabled: false },
              ),
            }),
          ),
        },
      },
      Focused: {
        on: {
          ToggleGroupItem: toggleItemEdges<Focused>(),
          SelectGroupItem: selectItemEdges<Focused>(),
          DeselectGroupItem: deselectItemEdges<Focused>(),
          ClearToggleGroup: [
            when(
              (state, _message, context) => {
                const next = Selection.clear(
                  state.selection,
                  selectionPropsOf(context),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Focused',
              ({ state, guardValue }) =>
                Focused({
                  selection: guardValue,
                  focusedValue: state.focusedValue,
                }),
            ),
            ignore(),
          ],
          FocusToggleGroupItem: focusItemEdges<Focused>(),
          BlurToggleGroup: to('Idle', ({ state }) =>
            Idle({ selection: state.selection }),
          ),
          PressedToggleGroupKey: pressedKeyEdges<Focused>(),
          ReplaceToggleGroupSelection: [
            when(
              (state, message, context) => {
                const next = Selection.replace(
                  state.selection,
                  message.values,
                  selectionPropsOf(context),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Focused',
              ({ state, guardValue }) =>
                Focused({
                  selection: guardValue,
                  focusedValue: state.focusedValue,
                }),
            ),
            ignore(),
          ],
          ReconcileToggleGroupItems: [
            when(
              (state, _message, context) => {
                const nextSelection = Selection.reconcile(
                  state.selection,
                  selectionPropsOf(context),
                )
                const nextFocus = focusedValueOf(
                  Focused({
                    selection: nextSelection,
                    focusedValue: state.focusedValue,
                  }),
                  context,
                )
                if (Option.isNone(nextFocus)) {
                  return Option.none()
                }
                const focusChanged = nextFocus.value !== state.focusedValue
                const selectionChanged = nextSelection !== state.selection
                return focusChanged || selectionChanged
                  ? Option.some({
                      selection: nextSelection,
                      focusedValue: nextFocus.value,
                    })
                  : Option.none()
              },
              'Focused',
              ({ guardValue }) =>
                Focused({
                  selection: guardValue.selection,
                  focusedValue: guardValue.focusedValue,
                }),
            ),
            when(
              (state, _message, context) =>
                Option.isNone(focusedValueOf(state, context)),
              'Idle',
              ({ state, context }) =>
                Idle({
                  selection: Selection.reconcile(
                    state.selection,
                    selectionPropsOf(context),
                  ),
                }),
            ),
            ignore(),
          ],
          ResetToggleGroup: to('Idle', ({ state, context }) =>
            Idle({
              selection: Selection.replace(
                state.selection,
                context.defaultValue ?? [],
                { ...selectionPropsOf(context), isDisabled: false },
              ),
            }),
          ),
        },
      },
    },
  })

/** The default ToggleGroup Machine chart starting in `Idle({ selection: Selection.initial })`. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  ToggleGroupItem: pace,
  SelectGroupItem: pace,
  DeselectGroupItem: pace,
  ClearToggleGroup: pace,
  FocusToggleGroupItem: pace,
  BlurToggleGroup: pace,
  PressedToggleGroupKey: pace,
  ReplaceToggleGroupSelection: pace,
  ReconcileToggleGroupItems: pace,
  ResetToggleGroup: pace,
})

/** Default synchronization: every ToggleGroup Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a ToggleGroup kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The two painted slots of a ToggleGroup Part: `Root` and `Item`. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Item: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleGroupItem' }],
  },
}

const itemTabIndexOf = (
  props: Props,
  isRovingTarget: boolean,
  isDisabled: boolean,
): number => {
  if (rovingFocusOf(props)) {
    return isRovingTarget ? 0 : -1
  } else {
    return isDisabled ? -1 : 0
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      orientation: orientationOf(props),
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(props.labelledBy === undefined
        ? {}
        : { labelledBy: props.labelledBy }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'Item') {
    return Option.match(
      Option.flatMap(maybeChoice, value =>
        Option.map(indexByValue(props, value), index => ({ value, index })),
      ),
      {
        onNone: () => ({}),
        onSome: ({ value, index }) => {
          const isDisabled = isItemDisabledAt(props)(index)
          const isReadOnly = isReadOnlyOf(props)
          const isPressed = isItemPressed(state, value)
          const isRovingTarget =
            !isDisabled && Option.contains(focusedIndexOf(state, props), index)
          const tabIndex = itemTabIndexOf(props, isRovingTarget, isDisabled)
          return {
            id: itemId(props.id, index),
            isPressed,
            tabIndex,
            ...(isDisabled ? { isDisabled: true } : {}),
            ...(isReadOnly ? { isReadOnly: true } : {}),
          }
        },
      },
    )
  } else {
    return {}
  }
}

/** What a restart opens a ToggleGroup on: preserves pressed values and clears transient focus. */
export const atRest = (state: State): State =>
  Idle({ selection: Selection.atRest(state.selection) })

// PART FACTORY

/** Options for customizing a ToggleGroup Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this ToggleGroup device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial pressed values for the Part's chart (empty by default). */
  defaultValue?: ReadonlyArray<string>
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a ToggleGroup {@link Part.Part}. Synced by default
 * (`category: 'Domain'`); pass `sync: 'OwnView'` (or use {@link deviceOnly})
 * to keep a Program's ToggleGroup local to one device.
 *
 * @example
 * ```typescript
 * const FormatToggleGroup = ToggleGroup.make({ name: 'FormatToggleGroup' })
 * const LocalToggleGroup = ToggleGroup.deviceOnly({ name: 'LocalToggleGroup' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'ToggleGroup',
    State,
    Message,
    chart:
      options.defaultValue === undefined ||
      Array.isReadonlyArrayEmpty(options.defaultValue)
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

/** Default synced ToggleGroup {@link Part.Part} (`name: 'ToggleGroup'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

/** Creates a device-only ToggleGroup {@link Part.Part} (`Device({ because })`, defaulting to `'OwnView'`). */
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

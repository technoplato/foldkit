import { Array, Option, Schema as S } from 'effect'

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
import * as Layers from './layers.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as Placement from './placement.js'
import * as RovingFocus from './rovingFocus.js'
import * as Selection from './selection.js'
import type { SlotProps } from './slot.js'
import * as Typeahead from './typeahead.js'

// NOTE: this is the core Select Part (Widget #16 of 54, Scribe #2653).
// It composes `Placement`, `Layers`, `Typeahead`, `RovingFocus`, and
// `Selection` into one framework-free Machine and Part declaration covering
// packages/ui Select, Zag select, and Radix select. Its state (`Closed` |
// `Open`) lives in the Model, synced by default (`Domain` category,
// `Pace.Synced`) with `Select.make` and `Select.deviceOnly()`, and projects
// reference-stable SlotBindings (`Trigger`, `Content`, `Option`, `Label`,
// `Description`, `Error`, `Backdrop`, `ClearButton`) rendered by HTML, React,
// and React Native generic hosts with zero Select-specific painter logic.

// SCHEMAS

/** Whether one option (`Single`) or many options (`Multiple`) may be selected at once. */
export const SelectionMode = Selection.SelectionMode
/** Whether one option or many options may be selected at once. */
export type SelectionMode = Selection.SelectionMode

/** Whether the active option was highlighted by a pointer or by the keyboard. */
export const ActivationTrigger = S.Literals(['Pointer', 'Keyboard'])
/** Whether the active option was highlighted by a pointer or by the keyboard. */
export type ActivationTrigger = typeof ActivationTrigger.Type

/** Screen-space pointer coordinates used to ignore redundant same-position hover events. */
export const PointerPosition = S.Struct({
  screenX: S.Number,
  screenY: S.Number,
})
/** Screen-space pointer coordinates. */
export type PointerPosition = typeof PointerPosition.Type

/** Optional placement spacing overrides for the Select popup panel. */
export const PlacementOptions = S.Struct({
  gapPx: S.optionalKey(S.Number),
  edgePx: S.optionalKey(S.Number),
})
/** Optional placement spacing overrides. */
export type PlacementOptions = typeof PlacementOptions.Type

/** One selectable option in a Select, as plain data. */
export const Item = S.Struct({
  value: S.String,
  label: S.String,
  searchText: S.optionalKey(S.String),
  isDisabled: S.optionalKey(S.Boolean),
})
/** One selectable option in a Select, as plain data. */
export type Item = typeof Item.Type

/**
 * Read-only props supplied to the Select chart and projection from the
 * Program's Model. Options, layer stack, placement spacing, and accessibility
 * linkage stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  items: S.Array(Item),
  placeholder: S.optionalKey(S.String),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  hasDescription: S.optionalKey(S.Boolean),
  hasError: S.optionalKey(S.Boolean),
  selectionMode: S.optionalKey(SelectionMode),
  deselectable: S.optionalKey(S.Boolean),
  closeOnSelect: S.optionalKey(S.Boolean),
  isModal: S.optionalKey(S.Boolean),
  dismissOnEscape: S.optionalKey(S.Boolean),
  dismissOnOutsidePress: S.optionalKey(S.Boolean),
  direction: S.optionalKey(RovingFocus.Direction),
  loop: S.optionalKey(S.Boolean),
  pageKeys: S.optionalKey(S.Boolean),
  typeahead: S.optionalKey(S.Boolean),
  searchResetMs: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  defaultValue: S.optionalKey(S.Array(S.String)),
  name: S.optionalKey(S.String),
  form: S.optionalKey(S.String),
  layers: S.optionalKey(Layers.Stack),
  placement: S.optionalKey(PlacementOptions),
})
/** Read-only props supplied to the Select chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The select popup is closed while retaining its selection and closed-trigger typeahead buffer. */
export const Closed = ts('Closed', {
  selection: Selection.State,
  typeahead: Typeahead.State,
})
/** The select popup is closed. */
export type Closed = typeof Closed.Type

/**
 * The select popup is open, retaining its selection while tracking the
 * highlighted option, activation trigger, typeahead buffer, and last pointer
 * position.
 */
export const Open = ts('Open', {
  selection: Selection.State,
  maybeActiveIndex: S.Option(S.Number),
  activationTrigger: ActivationTrigger,
  typeahead: Typeahead.State,
  maybeLastPointerPosition: S.Option(PointerPosition),
})
/** The select popup is open. */
export type Open = typeof Open.Type

/** Where a Select Part stands: `Closed` or `Open`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open])
/** Where a Select Part stands. */
export type State = typeof State.Type

/** Initial Select state: closed, empty selection, idle typeahead. */
export const initial: State = Closed({
  selection: Selection.initial,
  typeahead: Typeahead.initial,
})

/** Creates an initial closed Select state with `values` pre-selected. */
export const initialSelected = (values: ReadonlyArray<string>): State =>
  Closed({
    selection: Selection.initialSelected(values),
    typeahead: Typeahead.initial,
  })

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Opens the select options list. */
export const OpenSelect = Catalog.action('OpenSelect', {
  what: 'Opens the select options list',
  why: 'To browse and pick from the available choices',
  meta: { label: 'Open select', keys: [] },
})

/** Closes the open select options list unconditionally. */
export const CloseSelect = Catalog.action('CloseSelect', {
  what: 'Closes the open select options list',
  why: 'To hide the choices and return to the control',
  meta: { label: 'Close select', keys: [] },
})

/** Opens the select options list when closed or closes it when open. */
export const ToggleSelect = Catalog.action('ToggleSelect', {
  what: 'Opens the select options list or closes it when open',
  why: 'To reveal or hide the available choices',
  meta: { label: 'Select', keys: [] },
})

/** Dismisses the open select list when it is the topmost dismissable layer. */
export const DismissSelect = Catalog.action('DismissSelect', {
  what: 'Dismisses the open select list when it is the topmost layer',
  why: 'To leave the choices without changing the selection',
  meta: { label: 'Dismiss select', keys: [] },
})

/** Selects or toggles an enabled option by its value. */
export const SelectOption = Catalog.action('SelectOption', {
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
  what: 'Selects or toggles the chosen option',
  why: 'To set or update the chosen value',
  meta: { label: 'Select option', keys: [] },
})

/** Clears the current select value when deselectable. */
export const ClearSelect = Catalog.action('ClearSelect', {
  what: 'Clears the current select value',
  why: 'To leave no option selected',
  meta: { label: 'Clear select', keys: [] },
})

/** The Catalog Actions a Select Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenSelect,
  CloseSelect,
  ToggleSelect,
  DismissSelect,
  SelectOption,
  ClearSelect,
]

// MESSAGES (Facts in addition to the Actions above)

/** A key was pressed while focus is on the trigger control. */
export const PressedTriggerKey = m('PressedTriggerKey', {
  key: S.String,
  isAlt: S.optionalKey(S.Boolean),
  isMeta: S.optionalKey(S.Boolean),
  isControl: S.optionalKey(S.Boolean),
})

/** A key was pressed while the select popup is open. */
export const PressedSelectKey = m('PressedSelectKey', {
  key: S.String,
  isAlt: S.optionalKey(S.Boolean),
  isMeta: S.optionalKey(S.Boolean),
  isControl: S.optionalKey(S.Boolean),
})

/** A roving highlight move was requested while the select popup is open. */
export const MovedSelectHighlight = m('MovedSelectHighlight', {
  move: RovingFocus.Move,
})

/** A specific enabled option index was highlighted while open. */
export const HighlightedSelectItem = m('HighlightedSelectItem', {
  index: S.Number,
  activationTrigger: ActivationTrigger,
})

/** The pointer moved over an option at `index` with screen coordinates. */
export const MovedPointerOverSelectItem = m('MovedPointerOverSelectItem', {
  index: S.Number,
  screenX: S.Number,
  screenY: S.Number,
})

/** The pointer left the currently hovered option while open. */
export const LeftSelectItem = m('LeftSelectItem')

/** A printable character was typed for typeahead search (closed or open). */
export const SearchedSelect = m('SearchedSelect', { key: S.String })

/** The debounced typeahead reset wait finished for `version`. */
export const ClearedSelectSearch = m('ClearedSelectSearch', {
  version: S.Number,
})

/** A pointer press landed outside the layers listed in `insideIds`. */
export const PressedOutsideSelect = m('PressedOutsideSelect', {
  insideIds: S.Array(S.String),
})

/** Replaces the selection programmatically with `values`. */
export const ReplaceSelectValue = m('ReplaceSelectValue', {
  values: S.Array(S.String),
})

/** Reconciles selection and active highlight against an updated `props.items` list. */
export const ReconcileSelectItems = m('ReconcileSelectItems')

/** Resets the select value to `props.defaultValue` (or empty) and closes the popup. */
export const ResetSelect = m('ResetSelect')

/** Every Message the Select chart handles. */
export const Message = S.Union([
  OpenSelect,
  CloseSelect,
  ToggleSelect,
  DismissSelect,
  SelectOption,
  ClearSelect,
  PressedTriggerKey,
  PressedSelectKey,
  MovedSelectHighlight,
  HighlightedSelectItem,
  MovedPointerOverSelectItem,
  LeftSelectItem,
  SearchedSelect,
  ClearedSelectSearch,
  PressedOutsideSelect,
  ReplaceSelectValue,
  ReconcileSelectItems,
  ResetSelect,
])
/** Every Message the Select chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Select Part. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits out the typeahead debounce period and answers `ClearedSelectSearch` for `version`. */
export const WaitToClearSelectSearch = Command.define(
  'WaitToClearSelectSearch',
  { version: S.Number, afterMs: S.Number },
  ClearedSelectSearch,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ClearedSelectSearch({ version })),
)

// ELEMENT IDS (shared by chart and thin painters such as @foldkit/ui Select)

/** Derives the root/native select element id from a base `id`. */
export const selectId = (id: string): string => `${id}-select`

/** Derives the trigger combobox/button element id from a base `id`. */
export const triggerId = (id: string): string => `${id}-trigger`

/** Derives the popup listbox container element id (`role="listbox"`) from a base `id`. */
export const contentId = (id: string): string => `${id}-content`

/** Derives one option element id (`role="option"`) from a base `id` and `index`. */
export const optionId = (id: string, index: number): string =>
  `${id}-option-${index}`

/** Derives the label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

/** Derives the description element id referenced by `aria-describedby` from a base `id`. */
export const descriptionId = (id: string): string => `${id}-description`

/** Derives the validation error element id from a base `id`. */
export const errorId = (id: string): string => `${id}-error`

/** Derives the clear button element id from a base `id`. */
export const clearButtonId = (id: string): string => `${id}-clear`

// PURE RULES & CONFIG READERS

/** Resolved selection mode for `props` (`'Single'` by default). */
export const selectionModeOf = (
  props: Pick<Props, 'selectionMode'> = {},
): SelectionMode => props.selectionMode ?? 'Single'

/** True when the select allows selecting multiple options. */
export const isMultipleOf = (
  props: Pick<Props, 'selectionMode'> = {},
): boolean => selectionModeOf(props) === 'Multiple'

/** True when the select is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the select is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when the select is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'> = {}): boolean =>
  props.isRequired === true

/** True when the select is currently invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/**
 * True when the select accepts user interaction: neither disabled nor
 * read-only, and if `hasHandler` is specified, a handler exists. Shared by
 * thin painters such as `@foldkit/ui` `Select`.
 *
 * @example
 * ```typescript
 * canSelect({}) // true
 * canSelect({ isDisabled: true }) // false
 * canSelect({ isReadOnly: true }) // false
 * canSelect({ hasHandler: false }) // false
 * ```
 */
export const canSelect = (
  input: Readonly<{
    isDisabled?: boolean
    isReadOnly?: boolean
    hasHandler?: boolean
  }> = {},
): boolean =>
  input.isDisabled !== true &&
  input.isReadOnly !== true &&
  input.hasHandler !== false

/** True when the selection may be emptied by user deselection or clearing. */
export const isDeselectableOf = (
  props: Pick<Props, 'selectionMode' | 'deselectable'> = {},
): boolean =>
  Selection.isDeselectableOf({
    mode: selectionModeOf(props),
    ...(props.deselectable === undefined
      ? {}
      : { deselectable: props.deselectable }),
  })

/**
 * True when selecting an option should automatically close the popup: defaults
 * to `true` in `Single` mode and `false` in `Multiple` mode.
 *
 * @example
 * ```typescript
 * closeOnSelectOf({}) // true
 * closeOnSelectOf({ selectionMode: 'Multiple' }) // false
 * closeOnSelectOf({ selectionMode: 'Multiple', closeOnSelect: true }) // true
 * ```
 */
export const closeOnSelectOf = (
  props: Pick<Props, 'selectionMode' | 'closeOnSelect'> = {},
): boolean => props.closeOnSelect ?? !isMultipleOf(props)

/** True when roving navigation wraps at the ends (`false` by default, matching Zag and Radix). */
export const loopOf = (props: Pick<Props, 'loop'> = {}): boolean =>
  props.loop === true

/** True when `PageUp`/`PageDown` act as First/Last roving keys (`true` by default). */
export const pageKeysOf = (props: Pick<Props, 'pageKeys'> = {}): boolean =>
  props.pageKeys ?? true

/** True when typeahead search is enabled (`true` by default). */
export const typeaheadEnabledOf = (
  props: Pick<Props, 'typeahead'> = {},
): boolean => props.typeahead ?? true

/** Resolved reading direction for horizontal closed-trigger navigation (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): RovingFocus.Direction => props.direction ?? 'Ltr'

/** True when the select popup is modal (`false` by default). */
export const isModalOf = (props: Pick<Props, 'isModal'> = {}): boolean =>
  props.isModal === true

/** True when pressing Escape is allowed to dismiss this select (`true` by default). */
export const dismissesOnEscapeOf = (
  props: Pick<Props, 'dismissOnEscape'> = {},
): boolean => props.dismissOnEscape ?? true

/** True when pressing outside is allowed to dismiss this select (`true` by default). */
export const dismissesOnOutsidePressOf = (
  props: Pick<Props, 'dismissOnOutsidePress'> = {},
): boolean => props.dismissOnOutsidePress ?? true

/** Projects `Select.Props` onto the underlying {@link Selection.Props}. */
export const selectionPropsOf = (props: Props): Selection.Props => ({
  items: props.items,
  mode: selectionModeOf(props),
  ...(props.deselectable === undefined
    ? {}
    : { deselectable: props.deselectable }),
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
})

/**
 * True when `next` has the exact same screen coordinates as `maybeLast`, so
 * redundant pointer-move events caused by scrolling or layout shifts do not
 * steal keyboard highlight.
 *
 * @example
 * ```typescript
 * isSamePointerPosition(Option.some({ screenX: 10, screenY: 20 }), { screenX: 10, screenY: 20 }) // true
 * ```
 */
export const isSamePointerPosition = (
  maybeLast: Option.Option<PointerPosition>,
  next: PointerPosition,
): boolean =>
  Option.exists(
    maybeLast,
    position =>
      position.screenX === next.screenX && position.screenY === next.screenY,
  )

/**
 * True when leaving an option with the pointer should clear the highlight:
 * pointer-activated highlights clear on leave, while keyboard-activated
 * highlights stay put.
 */
export const shouldDeactivateOnLeave = (trigger: ActivationTrigger): boolean =>
  trigger === 'Pointer'

/** Builds the {@link Layers.Layer} entry representing this Select popup. */
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

/** The active dismissable layer stack containing this Select popup. */
export const layersOf = (props: Props): Layers.Stack =>
  props.layers ?? [layerOf(props)]

/**
 * Places a Select popup panel by its trigger anchor using `Placement.place`,
 * applying any `gapPx` and `edgePx` configured in `props.placement`.
 *
 * @example
 * ```typescript
 * placeFor(props, { anchor, size, view }) // { left, top, side }
 * ```
 */
export const placeFor = (
  props: Pick<Props, 'placement'>,
  geometry: Readonly<{
    anchor: Placement.Rect
    size: Placement.Size
    view: Placement.Size
  }>,
): Placement.Placed =>
  Placement.place({
    ...geometry,
    ...(props.placement?.gapPx === undefined
      ? {}
      : { gapPx: props.placement.gapPx }),
    ...(props.placement?.edgePx === undefined
      ? {}
      : { edgePx: props.placement.edgePx }),
  })

// INTERNAL HELPERS

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

const enabledIndexByValue = (
  props: Props,
  value: string,
): Option.Option<number> =>
  Option.filter(indexByValue(props, value), index =>
    isEnabledIndex(props, index),
  )

const enabledValueAt = (props: Props, index: number): Option.Option<string> =>
  isEnabledIndex(props, index)
    ? Option.map(Array.get(props.items, index), item => item.value)
    : Option.none()

const itemSearchText = (item: Item): string => item.searchText ?? item.label

const canDismissEscape = (props: Props): boolean =>
  Layers.canDismissOnEscape(layersOf(props), props.id)

const canDismissOutside = (
  props: Props,
  insideIds: ReadonlyArray<string>,
): boolean =>
  Layers.canDismissOnOutsidePress(layersOf(props), props.id, insideIds)

const firstSelectedIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> =>
  Option.flatMap(
    Selection.firstSelectedOf(state.selection, selectionPropsOf(props)),
    value => enabledIndexByValue(props, value),
  )

const firstSelectedOr = (
  state: State,
  props: Props,
  fallback: () => Option.Option<number>,
): Option.Option<number> =>
  Option.orElse(firstSelectedIndexOf(state, props), fallback)

const stepHighlight = (
  props: Props,
  current: Option.Option<number>,
  move: RovingFocus.Move,
): Option.Option<number> =>
  RovingFocus.stepEnabled({
    count: props.items.length,
    current,
    move,
    isDisabled: isItemDisabledAt(props),
    loop: loopOf(props),
  })

const openRovingMoveOf = (
  props: Props,
  key: string,
): Option.Option<RovingFocus.Move> =>
  RovingFocus.moveOfKey(key, {
    orientation: 'Vertical',
    pageKeys: pageKeysOf(props),
  })

const closedRovingValueOf = (
  state: Closed,
  props: Props,
  key: string,
): Option.Option<string> =>
  Option.flatMap(
    RovingFocus.moveOfKey(key, {
      orientation: 'Horizontal',
      direction: directionOf(props),
      pageKeys: false,
    }),
    move =>
      Option.flatMap(
        stepHighlight(props, firstSelectedIndexOf(state, props), move),
        index => enabledValueAt(props, index),
      ),
  )

const isActivationKey = (state: Open, key: string): boolean =>
  key === 'Enter' || (key === ' ' && !Typeahead.isSearching(state.typeahead))

const closedFrom = (
  state: State,
  updates: Partial<
    Readonly<{ selection: Selection.State; typeahead: Typeahead.State }>
  > = {},
): Closed =>
  Closed({
    selection: updates.selection ?? state.selection,
    typeahead: updates.typeahead ?? Typeahead.atRest(state.typeahead),
  })

const openedFrom = (
  state: Closed,
  maybeActiveIndex: Option.Option<number>,
  activationTrigger: ActivationTrigger,
): Open =>
  Open({
    selection: state.selection,
    maybeActiveIndex,
    activationTrigger,
    typeahead: Typeahead.atRest(state.typeahead),
    maybeLastPointerPosition: Option.none(),
  })

const openFrom = (
  state: Open,
  updates: Partial<
    Readonly<{
      selection: Selection.State
      maybeActiveIndex: Option.Option<number>
      activationTrigger: ActivationTrigger
      typeahead: Typeahead.State
      maybeLastPointerPosition: Option.Option<PointerPosition>
    }>
  > = {},
): Open =>
  Open({
    selection: updates.selection ?? state.selection,
    maybeActiveIndex: updates.maybeActiveIndex ?? state.maybeActiveIndex,
    activationTrigger: updates.activationTrigger ?? state.activationTrigger,
    typeahead: updates.typeahead ?? state.typeahead,
    maybeLastPointerPosition:
      updates.maybeLastPointerPosition ?? state.maybeLastPointerPosition,
  })

const runClosedTypeahead = (state: Closed, props: Props, key: string) => {
  const isRefinement = Typeahead.isSearching(state.typeahead)
  const [nextTypeahead] = Typeahead.chart.transition(
    state.typeahead,
    Typeahead.Typed({
      key,
      ...(props.searchResetMs === undefined
        ? {}
        : { afterMs: props.searchResetMs }),
    }),
  )
  const query = Typeahead.queryOf(nextTypeahead)
  const maybeMatchedIndex = Typeahead.match({
    items: props.items,
    query,
    maybeActiveIndex: firstSelectedIndexOf(state, props),
    isDisabled: isItemDisabledAt(props),
    textOf: itemSearchText,
    isRefinement,
  })
  const nextSelection = Option.match(
    Option.flatMap(maybeMatchedIndex, index => enabledValueAt(props, index)),
    {
      onNone: () => state.selection,
      onSome: value =>
        Selection.select(state.selection, value, selectionPropsOf(props)),
    },
  )
  return {
    model: Closed({
      selection: nextSelection,
      typeahead: nextTypeahead,
    }),
    commands: [
      WaitToClearSelectSearch({
        version: Typeahead.versionOf(nextTypeahead),
        afterMs: props.searchResetMs ?? Typeahead.resetMs,
      }),
    ],
  }
}

const runOpenTypeahead = (state: Open, props: Props, key: string) => {
  const isRefinement = Typeahead.isSearching(state.typeahead)
  const [nextTypeahead] = Typeahead.chart.transition(
    state.typeahead,
    Typeahead.Typed({
      key,
      ...(props.searchResetMs === undefined
        ? {}
        : { afterMs: props.searchResetMs }),
    }),
  )
  const query = Typeahead.queryOf(nextTypeahead)
  const maybeMatched = Typeahead.match({
    items: props.items,
    query,
    maybeActiveIndex: activeIndexOf(state, props),
    isDisabled: isItemDisabledAt(props),
    textOf: itemSearchText,
    isRefinement,
  })
  return {
    model: openFrom(state, {
      typeahead: nextTypeahead,
      maybeActiveIndex: Option.orElse(
        maybeMatched,
        () => state.maybeActiveIndex,
      ),
      activationTrigger: Option.isSome(maybeMatched)
        ? 'Keyboard'
        : state.activationTrigger,
    }),
    commands: [
      WaitToClearSelectSearch({
        version: Typeahead.versionOf(nextTypeahead),
        afterMs: props.searchResetMs ?? Typeahead.resetMs,
      }),
    ],
  }
}

// READINGS

/** True when the select popup is open. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** True when the select popup is closed. */
export const isClosed = (state: State): boolean => state._tag === 'Closed'

/** All currently selected option values in order. */
export const selectedValuesOf = (state: State): ReadonlyArray<string> =>
  Selection.selectedOf(state.selection)

/** The first selected option value (in `props.items` order when `props` is given), or none. */
export const firstSelectedValueOf = (
  state: State,
  props?: Pick<Props, 'items'>,
): Option.Option<string> => Selection.firstSelectedOf(state.selection, props)

/** All currently selected option items from `props.items`, in `props.items` order. */
export const selectedOptionsOf = (
  state: State,
  props: Pick<Props, 'items'>,
): ReadonlyArray<Item> =>
  Array.filter(props.items, item =>
    Selection.isSelected(state.selection, item.value),
  )

/**
 * Human-readable trigger label derived from the selected options in
 * `props.items` order, joined by `separator` (`', '` by default), or
 * `props.placeholder ?? ''` when nothing is selected.
 *
 * @example
 * ```typescript
 * displayLabelOf(Select.initial, { items, placeholder: 'Choose a fruit' }) // 'Choose a fruit'
 * displayLabelOf(Select.initialSelected(['apple', 'cherry']), { items }) // 'Apple, Cherry'
 * ```
 */
export const displayLabelOf = (
  state: State,
  props: Pick<Props, 'items' | 'placeholder'>,
  separator: string = ', ',
): string => {
  const selected = selectedOptionsOf(state, props)
  if (Array.isReadonlyArrayEmpty(selected)) {
    return props.placeholder ?? ''
  } else {
    return Array.join(
      Array.map(selected, item => item.label),
      separator,
    )
  }
}

/** Number of currently selected options. */
export const selectedCountOf = (state: State): number =>
  Selection.selectedCountOf(state.selection)

/** True when the option with `value` is currently selected. */
export const isOptionSelected = (state: State, value: string): boolean =>
  Selection.isSelected(state.selection, value)

/** True when no options are currently selected. */
export const isSelectionEmpty = (state: State): boolean =>
  Selection.isEmpty(state.selection)

/** The currently highlighted enabled option index while open, or none while closed. */
export const activeIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> =>
  state._tag === 'Open'
    ? Option.filter(state.maybeActiveIndex, index =>
        isEnabledIndex(props, index),
      )
    : Option.none()

/** The currently highlighted option's value while open, or none. */
export const activeValueOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(activeIndexOf(state, props), index =>
    Option.map(Array.get(props.items, index), item => item.value),
  )

/** The currently highlighted option item while open, or none. */
export const activeItemOf = (state: State, props: Props): Option.Option<Item> =>
  Option.flatMap(activeIndexOf(state, props), index =>
    Array.get(props.items, index),
  )

/** The element id of the currently highlighted option (`aria-activedescendant`) while open, or none. */
export const activeDescendantIdOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.map(activeIndexOf(state, props), index => optionId(props.id, index))

/** True when the option with `value` is currently highlighted while open. */
export const isOptionActive = (
  state: State,
  props: Props,
  value: string,
): boolean => Option.contains(activeValueOf(state, props), value)

/** True when the option with `value` is disabled (either on the option or via the select). */
export const isOptionDisabled = (props: Props, value: string): boolean =>
  isDisabledOf(props) ||
  Option.exists(indexByValue(props, value), isItemDisabledAt(props))

/** The current accumulated typeahead query, or `''` while idle. */
export const searchQueryOf = (state: State): string =>
  Typeahead.queryOf(state.typeahead)

/** Data state marker for one option matching Zag (`'checked'` or `'unchecked'`). */
export const optionDataStateOf = (
  state: State,
  value: string,
): 'checked' | 'unchecked' =>
  isOptionSelected(state, value) ? 'checked' : 'unchecked'

/** Form submission hidden input descriptors when `props.name` is provided. */
export const hiddenInputsOf = (
  state: State,
  props: Props,
): ReadonlyArray<Readonly<{ name: string; value?: string; form?: string }>> =>
  Option.match(Option.fromNullishOr(props.name), {
    onNone: () => [],
    onSome: name => {
      const formField = props.form === undefined ? {} : { form: props.form }
      return Array.match(selectedValuesOf(state), {
        onEmpty: () => [{ name, ...formField }],
        onNonEmpty: Array.map(value => ({ name, value, ...formField })),
      })
    },
  })

// CHART TRANSITION HELPERS

const openKeyEdges = <
  KeyMessage extends
    | typeof PressedTriggerKey.Type
    | typeof PressedSelectKey.Type,
>(): ReadonlyArray<
  GuardedEdge<State, Message, Open, KeyMessage, never, Props>
> => [
  when(
    (_state: Open, message: KeyMessage, context: Props) =>
      message.key === 'Escape' && canDismissEscape(context),
    'Closed',
    ({ state }) => closedFrom(state),
  ),
  when(
    (_state: Open, message: KeyMessage) =>
      message.key === 'Tab' ||
      (message.key === 'ArrowUp' && message.isAlt === true),
    'Closed',
    ({ state }) => closedFrom(state),
  ),
  when(
    (state: Open, message: KeyMessage, context: Props) =>
      canSelect(context) &&
      isActivationKey(state, message.key) &&
      closeOnSelectOf(context)
        ? activeValueOf(state, context)
        : Option.none(),
    'Closed',
    ({ state, guardValue, context }) =>
      closedFrom(state, {
        selection: Selection.toggle(
          state.selection,
          guardValue,
          selectionPropsOf(context),
        ),
      }),
  ),
  when(
    (state: Open, message: KeyMessage, context: Props) =>
      canSelect(context) &&
      isActivationKey(state, message.key) &&
      !closeOnSelectOf(context)
        ? activeValueOf(state, context)
        : Option.none(),
    'Open',
    ({ state, guardValue, context }) =>
      openFrom(state, {
        selection: Selection.toggle(
          state.selection,
          guardValue,
          selectionPropsOf(context),
        ),
      }),
  ),
  when(
    (state: Open, message: KeyMessage, context: Props) =>
      isDisabledOf(context)
        ? Option.none()
        : Option.flatMap(openRovingMoveOf(context, message.key), move =>
            stepHighlight(context, activeIndexOf(state, context), move),
          ),
    'Open',
    ({ state, guardValue }) =>
      openFrom(state, {
        maybeActiveIndex: Option.some(guardValue),
        activationTrigger: 'Keyboard',
      }),
  ),
  when(
    (state: Open, message: KeyMessage, context: Props) =>
      canSelect(context) &&
      typeaheadEnabledOf(context) &&
      message.isAlt !== true &&
      message.isMeta !== true &&
      message.isControl !== true &&
      Typeahead.isSearchKey(
        message.key,
        Typeahead.isSearching(state.typeahead),
      ),
    'Open',
    ({ state, message, context }) =>
      runOpenTypeahead(state, context, message.key),
  ),
  ignore(),
]

// CHART

/**
 * Builds the Select Machine chart starting in `initialState`: `Closed` and
 * `Open` popup states, single and multiple selection via `Selection`, trigger
 * opening (click, Enter, Space, ArrowDown, ArrowUp), popup closing (Escape,
 * outside pointer press via `Layers`, Tab, Alt+ArrowUp, and select-in-single-
 * mode), roving option highlight via `RovingFocus`, debounced typeahead both
 * while closed (selecting matching options directly in single mode) and while
 * open (highlighting matching options) via `Typeahead` and
 * `Command.answerAfter`, pointer hover deduplication, disabled and read-only
 * guards, item reconciliation, and form reset.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Closed: {
        on: {
          OpenSelect: [
            when(
              (_state, _message, context) => canSelect(context),
              'Open',
              ({ state, context }) =>
                openedFrom(
                  state,
                  firstSelectedIndexOf(state, context),
                  'Pointer',
                ),
            ),
            ignore(),
          ],
          ToggleSelect: [
            when(
              (_state, _message, context) => canSelect(context),
              'Open',
              ({ state, context }) =>
                openedFrom(
                  state,
                  firstSelectedIndexOf(state, context),
                  'Pointer',
                ),
            ),
            ignore(),
          ],
          SelectOption: [
            when(
              (_state, message, context) =>
                canSelect(context)
                  ? Option.flatMap(
                      enabledIndexByValue(context, message.value),
                      index => enabledValueAt(context, index),
                    )
                  : Option.none(),
              'Closed',
              ({ state, guardValue, context }) =>
                closedFrom(state, {
                  selection: Selection.toggle(
                    state.selection,
                    guardValue,
                    selectionPropsOf(context),
                  ),
                }),
            ),
            ignore(),
          ],
          ClearSelect: [
            when(
              (state, _message, context) => {
                if (!canSelect(context)) {
                  return Option.none()
                }
                const next = Selection.clear(
                  state.selection,
                  selectionPropsOf(context),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Closed',
              ({ state, guardValue }) =>
                closedFrom(state, { selection: guardValue }),
            ),
            ignore(),
          ],
          PressedTriggerKey: [
            when(
              (state, message, context) =>
                canSelect(context) &&
                (message.key === 'Enter' ||
                  (message.key === ' ' &&
                    !Typeahead.isSearching(state.typeahead)) ||
                  message.key === 'ArrowDown'),
              'Open',
              ({ state, context }) =>
                openedFrom(
                  state,
                  firstSelectedOr(state, context, () =>
                    RovingFocus.firstEnabled(
                      context.items.length,
                      isItemDisabledAt(context),
                    ),
                  ),
                  'Keyboard',
                ),
            ),
            when(
              (_state, message, context) =>
                canSelect(context) && message.key === 'ArrowUp',
              'Open',
              ({ state, context }) =>
                openedFrom(
                  state,
                  firstSelectedOr(state, context, () =>
                    RovingFocus.lastEnabled(
                      context.items.length,
                      isItemDisabledAt(context),
                    ),
                  ),
                  'Keyboard',
                ),
            ),
            when(
              (state, message, context) =>
                canSelect(context) && !isMultipleOf(context)
                  ? closedRovingValueOf(state, context, message.key)
                  : Option.none(),
              'Closed',
              ({ state, guardValue, context }) =>
                closedFrom(state, {
                  selection: Selection.select(
                    state.selection,
                    guardValue,
                    selectionPropsOf(context),
                  ),
                }),
            ),
            when(
              (state, message, context) =>
                canSelect(context) &&
                typeaheadEnabledOf(context) &&
                !isMultipleOf(context) &&
                message.isAlt !== true &&
                message.isMeta !== true &&
                message.isControl !== true &&
                Typeahead.isSearchKey(
                  message.key,
                  Typeahead.isSearching(state.typeahead),
                ),
              'Closed',
              ({ state, message, context }) =>
                runClosedTypeahead(state, context, message.key),
            ),
            ignore(),
          ],
          SearchedSelect: [
            when(
              (_state, _message, context) =>
                canSelect(context) &&
                typeaheadEnabledOf(context) &&
                !isMultipleOf(context),
              'Closed',
              ({ state, message, context }) =>
                runClosedTypeahead(state, context, message.key),
            ),
            ignore(),
          ],
          ClearedSelectSearch: [
            when(
              (state, message) =>
                Typeahead.isSearching(state.typeahead) &&
                Typeahead.versionOf(state.typeahead) === message.version,
              'Closed',
              ({ state, message }) => {
                const [nextTypeahead] = Typeahead.chart.transition(
                  state.typeahead,
                  Typeahead.ElapsedReset({ version: message.version }),
                )
                return Closed({
                  selection: state.selection,
                  typeahead: nextTypeahead,
                })
              },
            ),
            ignore(),
          ],
          ReplaceSelectValue: [
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
              'Closed',
              ({ state, guardValue }) =>
                closedFrom(state, { selection: guardValue }),
            ),
            ignore(),
          ],
          ReconcileSelectItems: [
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
              'Closed',
              ({ state, guardValue }) =>
                Closed({ selection: guardValue, typeahead: state.typeahead }),
            ),
            ignore(),
          ],
          ResetSelect: to('Closed', ({ state, context }) =>
            Closed({
              selection: Selection.replace(
                state.selection,
                context.defaultValue ?? [],
                selectionPropsOf(context),
              ),
              typeahead: Typeahead.atRest(state.typeahead),
            }),
          ),
        },
      },
      Open: {
        on: {
          CloseSelect: to('Closed', ({ state }) => closedFrom(state)),
          ToggleSelect: to('Closed', ({ state }) => closedFrom(state)),
          DismissSelect: [
            when(
              (_state, _message, context) => canDismissOutside(context, []),
              'Closed',
              ({ state }) => closedFrom(state),
            ),
            ignore(),
          ],
          PressedOutsideSelect: [
            when(
              (_state, message, context) =>
                canDismissOutside(context, message.insideIds),
              'Closed',
              ({ state }) => closedFrom(state),
            ),
            ignore(),
          ],
          SelectOption: [
            when(
              (_state, message, context) =>
                canSelect(context) && closeOnSelectOf(context)
                  ? Option.flatMap(
                      enabledIndexByValue(context, message.value),
                      index => enabledValueAt(context, index),
                    )
                  : Option.none(),
              'Closed',
              ({ state, guardValue, context }) =>
                closedFrom(state, {
                  selection: Selection.toggle(
                    state.selection,
                    guardValue,
                    selectionPropsOf(context),
                  ),
                }),
            ),
            when(
              (_state, message, context) =>
                canSelect(context) && !closeOnSelectOf(context)
                  ? Option.flatMap(
                      enabledIndexByValue(context, message.value),
                      index =>
                        Option.map(enabledValueAt(context, index), value => ({
                          index,
                          value,
                        })),
                    )
                  : Option.none(),
              'Open',
              ({ state, guardValue, context }) =>
                openFrom(state, {
                  selection: Selection.toggle(
                    state.selection,
                    guardValue.value,
                    selectionPropsOf(context),
                  ),
                  maybeActiveIndex: Option.some(guardValue.index),
                }),
            ),
            ignore(),
          ],
          ClearSelect: [
            when(
              (state, _message, context) => {
                if (!canSelect(context)) {
                  return Option.none()
                }
                const next = Selection.clear(
                  state.selection,
                  selectionPropsOf(context),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Open',
              ({ state, guardValue }) =>
                openFrom(state, { selection: guardValue }),
            ),
            ignore(),
          ],
          MovedSelectHighlight: [
            when(
              (state, message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepHighlight(
                      context,
                      activeIndexOf(state, context),
                      message.move,
                    ),
              'Open',
              ({ state, guardValue }) =>
                openFrom(state, {
                  maybeActiveIndex: Option.some(guardValue),
                  activationTrigger: 'Keyboard',
                }),
            ),
            ignore(),
          ],
          HighlightedSelectItem: [
            when(
              (_state, message, context) =>
                isEnabledIndex(context, message.index),
              'Open',
              ({ state, message }) =>
                openFrom(state, {
                  maybeActiveIndex: Option.some(message.index),
                  activationTrigger: message.activationTrigger,
                }),
            ),
            ignore(),
          ],
          MovedPointerOverSelectItem: [
            when(
              (state, message, context) =>
                isEnabledIndex(context, message.index) &&
                !isSamePointerPosition(state.maybeLastPointerPosition, {
                  screenX: message.screenX,
                  screenY: message.screenY,
                }),
              'Open',
              ({ state, message }) =>
                openFrom(state, {
                  maybeActiveIndex: Option.some(message.index),
                  activationTrigger: 'Pointer',
                  maybeLastPointerPosition: Option.some({
                    screenX: message.screenX,
                    screenY: message.screenY,
                  }),
                }),
            ),
            ignore(),
          ],
          LeftSelectItem: [
            when(
              state =>
                shouldDeactivateOnLeave(state.activationTrigger) &&
                Option.isSome(state.maybeActiveIndex),
              'Open',
              ({ state }) =>
                openFrom(state, { maybeActiveIndex: Option.none() }),
            ),
            ignore(),
          ],
          SearchedSelect: [
            when(
              (_state, _message, context) =>
                canSelect(context) && typeaheadEnabledOf(context),
              'Open',
              ({ state, message, context }) =>
                runOpenTypeahead(state, context, message.key),
            ),
            ignore(),
          ],
          ClearedSelectSearch: [
            when(
              (state, message) =>
                Typeahead.isSearching(state.typeahead) &&
                Typeahead.versionOf(state.typeahead) === message.version,
              'Open',
              ({ state, message }) => {
                const [nextTypeahead] = Typeahead.chart.transition(
                  state.typeahead,
                  Typeahead.ElapsedReset({ version: message.version }),
                )
                return openFrom(state, { typeahead: nextTypeahead })
              },
            ),
            ignore(),
          ],
          PressedTriggerKey: openKeyEdges<typeof PressedTriggerKey.Type>(),
          PressedSelectKey: openKeyEdges<typeof PressedSelectKey.Type>(),
          ReplaceSelectValue: [
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
              'Open',
              ({ state, guardValue }) =>
                openFrom(state, { selection: guardValue }),
            ),
            ignore(),
          ],
          ReconcileSelectItems: [
            when(
              (state, _message, context) => {
                const nextSelection = Selection.reconcile(
                  state.selection,
                  selectionPropsOf(context),
                )
                const nextActiveIndex = activeIndexOf(state, context)
                const selectionChanged = nextSelection !== state.selection
                const activeChanged =
                  Option.getOrUndefined(nextActiveIndex) !==
                  Option.getOrUndefined(state.maybeActiveIndex)
                return selectionChanged || activeChanged
                  ? Option.some({ nextSelection, nextActiveIndex })
                  : Option.none()
              },
              'Open',
              ({ state, guardValue }) =>
                openFrom(state, {
                  selection: guardValue.nextSelection,
                  maybeActiveIndex: guardValue.nextActiveIndex,
                }),
            ),
            ignore(),
          ],
          ResetSelect: to('Closed', ({ state, context }) =>
            Closed({
              selection: Selection.replace(
                state.selection,
                context.defaultValue ?? [],
                selectionPropsOf(context),
              ),
              typeahead: Typeahead.atRest(state.typeahead),
            }),
          ),
        },
      },
    },
  })

/** The default Select Machine chart starting in `Closed` with empty selection. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenSelect: pace,
  CloseSelect: pace,
  ToggleSelect: pace,
  DismissSelect: pace,
  SelectOption: pace,
  ClearSelect: pace,
  PressedTriggerKey: pace,
  PressedSelectKey: pace,
  MovedSelectHighlight: pace,
  HighlightedSelectItem: pace,
  MovedPointerOverSelectItem: pace,
  LeftSelectItem: pace,
  SearchedSelect: pace,
  ClearedSelectSearch: pace,
  PressedOutsideSelect: pace,
  ReplaceSelectValue: pace,
  ReconcileSelectItems: pace,
  ResetSelect: pace,
})

/** Default synchronization: every Select Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Select kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The painted slots of a Select Part:
 * - `Trigger`: combobox trigger (`role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`, `ToggleSelect`).
 * - `Content`: popup listbox container (`role="listbox"`, `aria-multiselectable`, `aria-activedescendant`, `hidden` when closed).
 * - `Option`: one selectable option (`role="option"`, `aria-selected`, `aria-current`, `aria-disabled`, `SelectOption`).
 * - `Label`: field label (`id: labelId(id)`).
 * - `Description`: helper text linked via `aria-describedby` (`id: descriptionId(id)`).
 * - `Error`: validation message linked via `aria-describedby` when invalid (`id: errorId(id)`).
 * - `Backdrop`: outside-dismiss surface (`DismissSelect`).
 * - `ClearButton`: button that clears the selected value when deselectable (`ClearSelect`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Trigger: {
    role: 'Combobox',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleSelect' }],
  },
  Content: {
    role: 'Listbox',
    focus: 'Container',
    gestures: [],
  },
  Option: {
    role: 'Option',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectOption' }],
  },
  Label: {
    focus: 'None',
    gestures: [],
  },
  Description: {
    focus: 'None',
    gestures: [],
  },
  Error: {
    focus: 'None',
    gestures: [],
  },
  Backdrop: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'DismissSelect' }],
  },
  ClearButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ClearSelect' }],
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
  }
  const ids: ReadonlyArray<string> = [
    ...(props.hasDescription === false ? [] : [descriptionId(props.id)]),
    ...(isInvalidOf(props) && props.hasError === true
      ? [errorId(props.id)]
      : []),
  ]
  return Array.isReadonlyArrayEmpty(ids)
    ? {}
    : { describedBy: Array.join(ids, ' ') }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Trigger') {
    return {
      id: triggerId(props.id),
      hasPopup: 'listbox',
      isExpanded: isOpen(state),
      controls: contentId(props.id),
      tabIndex: isDisabledOf(props) ? -1 : 0,
      ...labelSlotPropsOf(props),
      ...descriptionSlotPropsOf(props),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
      ...(isInvalidOf(props) ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Content') {
    const maybeActiveId = activeDescendantIdOf(state, props)
    return {
      id: contentId(props.id),
      ...labelSlotPropsOf(props),
      ...(isMultipleOf(props) ? { isMultiselectable: true } : {}),
      ...Option.match(maybeActiveId, {
        onNone: () => ({}),
        onSome: activeId => ({ activeId }),
      }),
      ...(isOpen(state) ? { tabIndex: 0 } : { isHidden: true }),
    }
  } else if (slot === 'Option') {
    return Option.match(
      Option.flatMap(maybeChoice, value => indexByValue(props, value)),
      {
        onNone: () => ({}),
        onSome: index => {
          const isDisabled = isItemDisabledAt(props)(index)
          const value = Option.getOrElse(
            Option.map(Array.get(props.items, index), item => item.value),
            () => '',
          )
          const isSelected = isOptionSelected(state, value)
          const isCurrent = Option.contains(activeIndexOf(state, props), index)
          return {
            id: optionId(props.id, index),
            isSelected,
            isCurrent,
            ...(isDisabled ? { isDisabled: true } : {}),
          }
        },
      },
    )
  } else if (slot === 'Label') {
    return {
      id: labelId(props.id),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Description') {
    return {
      id: descriptionId(props.id),
    }
  } else if (slot === 'Error') {
    return {
      id: errorId(props.id),
      ...(!isInvalidOf(props) ? { isHidden: true } : {}),
    }
  } else if (slot === 'Backdrop') {
    return {
      ...(!isOpen(state) ? { isHidden: true } : {}),
    }
  } else if (slot === 'ClearButton') {
    return {
      id: clearButtonId(props.id),
      controls: triggerId(props.id),
      label: 'Clear select',
      tabIndex: 0,
      ...(isSelectionEmpty(state) ||
      !canSelect(props) ||
      !isDeselectableOf(props)
        ? { isHidden: true }
        : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a Select on: closes any open popup and resets transient
 * typeahead state while preserving the resting selection and monotonic
 * typeahead version counter.
 */
export const atRest = (state: State): State =>
  Closed({
    selection: Selection.atRest(state.selection),
    typeahead: Typeahead.atRest(state.typeahead),
  })

// PART FACTORY

/** Options for customizing a Select Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'` or `'OwnChoice'`) to keep this Select device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial selected option values for the Part's chart (empty by default). */
  defaultValue?: ReadonlyArray<string>
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Select {@link Part.Part}. Synced by default (`category: 'Domain'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Select local to one device.
 *
 * @example
 * ```typescript
 * const CountrySelect = Select.make({ name: 'CountrySelect' })
 * const LocalSelect = Select.make({ name: 'LocalSelect', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Select',
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
 * Shorthand for a Select Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalSelect = Select.deviceOnly({ name: 'LocalSelect' })
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

/** The default synced Select Part (`name: 'Select'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

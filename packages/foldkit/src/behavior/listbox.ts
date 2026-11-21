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
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as RovingFocus from './rovingFocus.js'
import * as Selection from './selection.js'
import { SlotOrientation, type SlotProps } from './slot.js'
import * as Typeahead from './typeahead.js'

// NOTE: this is the core Listbox Part (Widget #15 of 54, Scribe #2633).
// It composes `Selection`, `RovingFocus`, and `Typeahead` into one
// framework-free Machine and Part declaration covering packages/ui Listbox
// (single + Multi) and Zag listbox. Its state (`Idle` | `Focused`) lives in
// the Model, synced by default (`Domain` category, `Pace.Synced`) with a
// device-only option, and projects reference-stable SlotBindings (`Listbox`,
// `Option`, `Label`) rendered by HTML, React, and React Native generic hosts
// with zero Listbox-specific painter logic.

// SCHEMAS

/** Controls the listbox layout direction and which arrow keys navigate between options. */
export const Orientation = SlotOrientation
/** Controls the listbox layout direction and which arrow keys navigate between options. */
export type Orientation = typeof Orientation.Type

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

/** One selectable option in a Listbox, as plain data. */
export const Item = S.Struct({
  value: S.String,
  label: S.String,
  searchText: S.optionalKey(S.String),
  isDisabled: S.optionalKey(S.Boolean),
})
/** One selectable option in a Listbox, as plain data. */
export type Item = typeof Item.Type

/**
 * Read-only props supplied to the Listbox chart and projection from the
 * Program's Model. Options and configuration stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  items: S.Array(Item),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  selectionMode: S.optionalKey(SelectionMode),
  deselectable: S.optionalKey(S.Boolean),
  disallowSelectAll: S.optionalKey(S.Boolean),
  selectOnHighlight: S.optionalKey(S.Boolean),
  orientation: S.optionalKey(Orientation),
  direction: S.optionalKey(RovingFocus.Direction),
  loop: S.optionalKey(S.Boolean),
  pageKeys: S.optionalKey(S.Boolean),
  typeahead: S.optionalKey(S.Boolean),
  searchResetMs: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  defaultValue: S.optionalKey(S.Array(S.String)),
  name: S.optionalKey(S.String),
  form: S.optionalKey(S.String),
})
/** Read-only props supplied to the Listbox chart and projection. */
export type Props = typeof Props.Type

// STATE

const stateFields = {
  selection: Selection.State,
  maybeActiveIndex: S.Option(S.Number),
  activationTrigger: ActivationTrigger,
  typeahead: Typeahead.State,
  maybeLastPointerPosition: S.Option(PointerPosition),
}

/** Focus is outside the listbox while retaining its selection and any passive highlight. */
export const Idle = ts('Idle', stateFields)
/** Focus is outside the listbox. */
export type Idle = typeof Idle.Type

/** Focus is inside the listbox, driving active-descendant navigation, selection, and typeahead. */
export const Focused = ts('Focused', stateFields)
/** Focus is inside the listbox. */
export type Focused = typeof Focused.Type

/** Where a Listbox Part stands: `Idle` or `Focused`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Focused])
/** Where a Listbox Part stands. */
export type State = typeof State.Type

/** Initial Listbox state: idle, empty selection, no active option, idle typeahead. */
export const initial: State = Idle({
  selection: Selection.initial,
  maybeActiveIndex: Option.none(),
  activationTrigger: 'Keyboard',
  typeahead: Typeahead.initial,
  maybeLastPointerPosition: Option.none(),
})

/** Creates an initial idle Listbox state with `values` pre-selected. */
export const initialSelected = (values: ReadonlyArray<string>): State =>
  Idle({
    selection: Selection.initialSelected(values),
    maybeActiveIndex: Option.none(),
    activationTrigger: 'Keyboard',
    typeahead: Typeahead.initial,
    maybeLastPointerPosition: Option.none(),
  })

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Selects or toggles an enabled option in the list by its value. */
export const SelectListboxOption = Catalog.action('SelectListboxOption', {
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
  what: 'Selects or toggles the chosen option in the list',
  why: 'To include or change that choice in the selection',
  meta: { label: 'Select option', keys: [] },
})

/** Extends the selection from the active anchor to an enabled option (Shift+Click / range). */
export const SelectListboxRange = Catalog.action('SelectListboxRange', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'option',
    prompt: 'Extend selection to which option?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No option is available',
  },
  what: 'Extends the selection from the anchor to the chosen option',
  why: 'To pick a contiguous span of options at once',
  meta: { label: 'Select range', keys: [] },
})

/** Selects every available enabled option when multiple selection is allowed. */
export const SelectAllListboxOptions = Catalog.action(
  'SelectAllListboxOptions',
  {
    what: 'Selects every available option in the list',
    why: 'To include all choices at once',
    meta: { label: 'Select all', keys: [] },
  },
)

/** Clears the current selection when deselectable. */
export const ClearListboxSelection = Catalog.action('ClearListboxSelection', {
  what: 'Clears the current list selection',
  why: 'To leave the list with no options chosen',
  meta: { label: 'Clear selection', keys: [] },
})

/** The Catalog Actions a Listbox Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SelectListboxOption,
  SelectListboxRange,
  SelectAllListboxOptions,
  ClearListboxSelection,
]

// MESSAGES (Facts in addition to the Actions above)

/** Focus entered the listbox container. */
export const FocusListbox = m('FocusListbox')

/** Focus left the listbox container, resetting transient typeahead and pointer state. */
export const BlurListbox = m('BlurListbox')

/** A specific enabled item index was highlighted. */
export const HighlightListboxItem = m('HighlightListboxItem', {
  index: S.Number,
  activationTrigger: ActivationTrigger,
})

/** The pointer moved over an option at `index` with screen coordinates. */
export const MovedPointerOverListboxItem = m('MovedPointerOverListboxItem', {
  index: S.Number,
  screenX: S.Number,
  screenY: S.Number,
})

/** The pointer left the currently hovered option. */
export const LeftListboxItem = m('LeftListboxItem')

/** A roving highlight move was requested, optionally extending range selection with Shift. */
export const MovedListboxHighlight = m('MovedListboxHighlight', {
  move: RovingFocus.Move,
  isShift: S.optionalKey(S.Boolean),
})

/** A key was pressed while interacting with the listbox. */
export const PressedListboxKey = m('PressedListboxKey', {
  key: S.String,
  isShift: S.optionalKey(S.Boolean),
  isMeta: S.optionalKey(S.Boolean),
  isControl: S.optionalKey(S.Boolean),
})

/** A printable character was typed for typeahead navigation. */
export const SearchedListbox = m('SearchedListbox', { key: S.String })

/** The debounced typeahead reset wait finished for `version`. */
export const ClearedListboxSearch = m('ClearedListboxSearch', {
  version: S.Number,
})

/** Replaces the selection programmatically with `values`. */
export const ReplaceListboxSelection = m('ReplaceListboxSelection', {
  values: S.Array(S.String),
})

/** Reconciles selection and active highlight against an updated `props.items` list. */
export const ReconcileListboxItems = m('ReconcileListboxItems')

/** Resets the listbox selection to `props.defaultValue` (or empty) and returns to `Idle`. */
export const ResetListbox = m('ResetListbox')

/** Every Message the Listbox chart handles. */
export const Message = S.Union([
  SelectListboxOption,
  SelectListboxRange,
  SelectAllListboxOptions,
  ClearListboxSelection,
  FocusListbox,
  BlurListbox,
  HighlightListboxItem,
  MovedPointerOverListboxItem,
  LeftListboxItem,
  MovedListboxHighlight,
  PressedListboxKey,
  SearchedListbox,
  ClearedListboxSearch,
  ReplaceListboxSelection,
  ReconcileListboxItems,
  ResetListbox,
])
/** Every Message the Listbox chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Listbox Part. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits out the typeahead debounce period and answers `ClearedListboxSearch` for `version`. */
export const WaitToClearListboxSearch = Command.define(
  'WaitToClearListboxSearch',
  { version: S.Number, afterMs: S.Number },
  ClearedListboxSearch,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ClearedListboxSearch({ version })),
)

// ELEMENT IDS (shared by chart and thin painters such as @foldkit/ui Listbox)

/** Derives the trigger button element id from a Listbox base `id`. */
export const buttonId = (id: string): string => `${id}-button`

/** Derives the listbox options container element id (`role="listbox"`) from a base `id`. */
export const listboxId = (id: string): string => `${id}-items`

/** Derives one option element id (`role="option"`) from a base `id` and `index`. */
export const optionId = (id: string, index: number): string =>
  `${id}-item-${index}`

/** Derives the listbox label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

/** Derives a grouped options container element id from a base `id` and `groupKey`. */
export const groupId = (id: string, groupKey: string): string =>
  `${id}-group-${groupKey}`

/** Derives a group heading element id from a base `id` and `groupKey`. */
export const headingId = (id: string, groupKey: string): string =>
  `${id}-heading-${groupKey}`

// PURE RULES & CONFIG READERS

/** Resolved orientation for `props` (`'Vertical'` by default). */
export const orientationOf = (
  props: Pick<Props, 'orientation'> = {},
): Orientation => props.orientation ?? 'Vertical'

/** Resolved reading direction for `props` (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): RovingFocus.Direction => props.direction ?? 'Ltr'

/** Resolved selection mode for `props` (`'Single'` by default). */
export const selectionModeOf = (
  props: Pick<Props, 'selectionMode'> = {},
): SelectionMode => props.selectionMode ?? 'Single'

/** True when the listbox allows selecting multiple options. */
export const isMultipleOf = (
  props: Pick<Props, 'selectionMode'> = {},
): boolean => selectionModeOf(props) === 'Multiple'

/** True when the entire listbox is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the listbox is marked invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/** True when roving navigation wraps at the ends (`true` by default). */
export const loopOf = (props: Pick<Props, 'loop'> = {}): boolean =>
  props.loop ?? true

/** True when `PageUp`/`PageDown` act as First/Last roving keys (`true` by default). */
export const pageKeysOf = (props: Pick<Props, 'pageKeys'> = {}): boolean =>
  props.pageKeys ?? true

/** True when typeahead search is enabled (`true` by default). */
export const typeaheadEnabledOf = (
  props: Pick<Props, 'typeahead'> = {},
): boolean => props.typeahead ?? true

/** True when roving arrow navigation immediately selects the highlighted option (`false` by default). */
export const selectOnHighlightOf = (
  props: Pick<Props, 'selectOnHighlight'> = {},
): boolean => props.selectOnHighlight === true

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

/** Projects `Listbox.Props` onto the underlying {@link Selection.Props}. */
export const selectionPropsOf = (props: Props): Selection.Props => ({
  items: props.items,
  mode: selectionModeOf(props),
  ...(props.deselectable === undefined
    ? {}
    : { deselectable: props.deselectable }),
  ...(props.disallowSelectAll === undefined
    ? {}
    : { disallowSelectAll: props.disallowSelectAll }),
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
})

/**
 * True when `next` has the exact same screen coordinates as `maybeLast`, so
 * redundant pointer-move events from scrolling or layout shifts do not steal
 * keyboard highlight.
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

/** True when a key press is the Mod+A (Cmd+A / Ctrl+A) select-all shortcut. */
export const isSelectAllKey = (
  input: Readonly<{ key: string; isMeta?: boolean; isControl?: boolean }>,
): boolean =>
  (input.key === 'a' || input.key === 'A') &&
  (input.isMeta === true || input.isControl === true)

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

const rovingMoveOf = (
  props: Props,
  key: string,
): Option.Option<RovingFocus.Move> =>
  RovingFocus.moveOfKey(key, {
    orientation: orientationOf(props),
    direction: directionOf(props),
    pageKeys: pageKeysOf(props),
  })

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

const defaultFocusIndex = (state: State, props: Props): Option.Option<number> =>
  Option.orElse(
    Option.filter(state.maybeActiveIndex, index =>
      isEnabledIndex(props, index),
    ),
    () =>
      Option.orElse(
        Option.flatMap(
          Selection.firstSelectedOf(state.selection, selectionPropsOf(props)),
          value => enabledIndexByValue(props, value),
        ),
        () =>
          RovingFocus.firstEnabled(props.items.length, isItemDisabledAt(props)),
      ),
  )

const isActivationKey = (state: State, key: string): boolean =>
  key === 'Enter' || (key === ' ' && !Typeahead.isSearching(state.typeahead))

type StateUpdates = Partial<
  Readonly<{
    selection: Selection.State
    maybeActiveIndex: Option.Option<number>
    activationTrigger: ActivationTrigger
    typeahead: Typeahead.State
    maybeLastPointerPosition: Option.Option<PointerPosition>
  }>
>

const focusedFrom = (state: State, updates: StateUpdates = {}): Focused =>
  Focused({
    selection: updates.selection ?? state.selection,
    maybeActiveIndex: updates.maybeActiveIndex ?? state.maybeActiveIndex,
    activationTrigger: updates.activationTrigger ?? state.activationTrigger,
    typeahead: updates.typeahead ?? state.typeahead,
    maybeLastPointerPosition:
      updates.maybeLastPointerPosition ?? state.maybeLastPointerPosition,
  })

const idleFrom = (state: State, updates: StateUpdates = {}): Idle =>
  Idle({
    selection: updates.selection ?? state.selection,
    maybeActiveIndex: updates.maybeActiveIndex ?? state.maybeActiveIndex,
    activationTrigger: updates.activationTrigger ?? state.activationTrigger,
    typeahead: updates.typeahead ?? state.typeahead,
    maybeLastPointerPosition:
      updates.maybeLastPointerPosition ?? state.maybeLastPointerPosition,
  })

const runTypeahead = (state: State, props: Props, key: string) => {
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
    model: focusedFrom(state, {
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
      WaitToClearListboxSearch({
        version: Typeahead.versionOf(nextTypeahead),
        afterMs: props.searchResetMs ?? Typeahead.resetMs,
      }),
    ],
  }
}

const applyNavigation = (
  state: State,
  props: Props,
  nextIndex: number,
  isShift: boolean,
): Focused => {
  const nextSelection = Option.match(enabledValueAt(props, nextIndex), {
    onNone: () => state.selection,
    onSome: nextValue => {
      const selProps = selectionPropsOf(props)
      if (isShift && isMultipleOf(props)) {
        return Selection.selectRange(
          state.selection,
          nextValue,
          selProps,
          activeValueOf(state, props),
        )
      } else if (selectOnHighlightOf(props)) {
        return Selection.replace(state.selection, [nextValue], selProps)
      } else {
        return state.selection
      }
    },
  })
  return focusedFrom(state, {
    selection: nextSelection,
    maybeActiveIndex: Option.some(nextIndex),
    activationTrigger: 'Keyboard',
  })
}

// READINGS

/** True when keyboard focus is tracked inside the listbox. */
export const isFocused = (state: State): boolean => state._tag === 'Focused'

/** All currently selected option values in order. */
export const selectedValuesOf = (state: State): ReadonlyArray<string> =>
  Selection.selectedOf(state.selection)

/** The first selected option value (in `props.items` order when `props` is given), or none. */
export const firstSelectedValueOf = (
  state: State,
  props?: Pick<Props, 'items'>,
): Option.Option<string> => Selection.firstSelectedOf(state.selection, props)

/** All currently selected option items from `props.items`, in `props.items` order. */
export const selectedItemsOf = (
  state: State,
  props: Pick<Props, 'items'>,
): ReadonlyArray<Item> =>
  Array.filter(props.items, item =>
    Selection.isSelected(state.selection, item.value),
  )

/** Number of currently selected options. */
export const selectedCountOf = (state: State): number =>
  Selection.selectedCountOf(state.selection)

/** True when the option with `value` is currently selected. */
export const isOptionSelected = (state: State, value: string): boolean =>
  Selection.isSelected(state.selection, value)

/** True when every enabled option in `props.items` is selected (and at least one exists). */
export const isAllSelected = (
  state: State,
  props: Pick<Props, 'items' | 'isDisabled'>,
): boolean => Selection.isAllSelected(state.selection, props)

/** True when no options are currently selected. */
export const isSelectionEmpty = (state: State): boolean =>
  Selection.isEmpty(state.selection)

/** The current Shift/extended range anchor value, or none. */
export const anchorOf = (state: State): Option.Option<string> =>
  Selection.anchorOf(state.selection)

/** The currently highlighted enabled option index in `props.items`, or none. */
export const activeIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> =>
  Option.filter(state.maybeActiveIndex, index => isEnabledIndex(props, index))

/** The currently highlighted option's value, or none. */
export const activeValueOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(activeIndexOf(state, props), index =>
    Option.map(Array.get(props.items, index), item => item.value),
  )

/** The currently highlighted option item, or none. */
export const activeItemOf = (state: State, props: Props): Option.Option<Item> =>
  Option.flatMap(activeIndexOf(state, props), index =>
    Array.get(props.items, index),
  )

/** The element id of the currently highlighted option (`aria-activedescendant`), or none. */
export const activeDescendantIdOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.map(activeIndexOf(state, props), index => optionId(props.id, index))

/** True when the option with `value` is currently highlighted. */
export const isOptionActive = (
  state: State,
  props: Props,
  value: string,
): boolean => Option.contains(activeValueOf(state, props), value)

/** True when the option with `value` is disabled (either on the option or via the listbox). */
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

const selectOptionEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof SelectListboxOption.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof SelectListboxOption.Type, context: Props) =>
      Option.flatMap(enabledIndexByValue(context, message.value), index =>
        Option.map(enabledValueAt(context, index), value => ({ index, value })),
      ),
    'Focused',
    ({ state, guardValue, context }) =>
      focusedFrom(state, {
        selection: Selection.toggle(
          state.selection,
          guardValue.value,
          selectionPropsOf(context),
        ),
        maybeActiveIndex: Option.some(guardValue.index),
      }),
  ),
  ignore(),
]

const selectRangeEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof SelectListboxRange.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof SelectListboxRange.Type, context: Props) =>
      Option.flatMap(enabledIndexByValue(context, message.value), index =>
        Option.map(enabledValueAt(context, index), value => ({ index, value })),
      ),
    'Focused',
    ({ state, guardValue, context }) =>
      focusedFrom(state, {
        selection: Selection.selectRange(
          state.selection,
          guardValue.value,
          selectionPropsOf(context),
          activeValueOf(state, context),
        ),
        maybeActiveIndex: Option.some(guardValue.index),
      }),
  ),
  ignore(),
]

type StateVariant<Tag extends State['_tag']> = Extract<
  State,
  { readonly _tag: Tag }
>

const selectAllEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof SelectAllListboxOptions.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: StateVariant<Target>,
      _message: typeof SelectAllListboxOptions.Type,
      context: Props,
    ) => {
      const next = Selection.selectAll(
        state.selection,
        selectionPropsOf(context),
      )
      return next === state.selection ? Option.none() : Option.some(next)
    },
    target,
    ({ state, guardValue }) => build(state, { selection: guardValue }),
  ),
  ignore(),
]

const clearSelectionEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof ClearListboxSelection.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: StateVariant<Target>,
      _message: typeof ClearListboxSelection.Type,
      context: Props,
    ) => {
      const next = Selection.clear(state.selection, selectionPropsOf(context))
      return next === state.selection ? Option.none() : Option.some(next)
    },
    target,
    ({ state, guardValue }) => build(state, { selection: guardValue }),
  ),
  ignore(),
]

const highlightItemEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof HighlightListboxItem.Type,
    never,
    Props
  >
> => [
  when(
    (
      _state: StateVariant<Target>,
      message: typeof HighlightListboxItem.Type,
      context: Props,
    ) => isEnabledIndex(context, message.index),
    target,
    ({ state, message }) =>
      build(state, {
        maybeActiveIndex: Option.some(message.index),
        activationTrigger: message.activationTrigger,
      }),
  ),
  ignore(),
]

const movedPointerEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof MovedPointerOverListboxItem.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: StateVariant<Target>,
      message: typeof MovedPointerOverListboxItem.Type,
      context: Props,
    ) =>
      isEnabledIndex(context, message.index) &&
      !isSamePointerPosition(state.maybeLastPointerPosition, {
        screenX: message.screenX,
        screenY: message.screenY,
      }),
    target,
    ({ state, message }) =>
      build(state, {
        maybeActiveIndex: Option.some(message.index),
        activationTrigger: 'Pointer',
        maybeLastPointerPosition: Option.some({
          screenX: message.screenX,
          screenY: message.screenY,
        }),
      }),
  ),
  ignore(),
]

const leftItemEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof LeftListboxItem.Type,
    never,
    Props
  >
> => [
  when(
    (state: StateVariant<Target>) =>
      shouldDeactivateOnLeave(state.activationTrigger) &&
      Option.isSome(state.maybeActiveIndex),
    target,
    ({ state }) => build(state, { maybeActiveIndex: Option.none() }),
  ),
  ignore(),
]

const movedHighlightEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    S,
    typeof MovedListboxHighlight.Type,
    never,
    Props
  >
> => [
  when(
    (state: S, message: typeof MovedListboxHighlight.Type, context: Props) =>
      stepHighlight(context, activeIndexOf(state, context), message.move),
    'Focused',
    ({ state, message, guardValue, context }) =>
      applyNavigation(state, context, guardValue, message.isShift === true),
  ),
  ignore(),
]

const pressedKeyEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof PressedListboxKey.Type, never, Props>
> => [
  when(
    (state: S, message: typeof PressedListboxKey.Type, context: Props) =>
      isSelectAllKey(message) &&
      Selection.canSelectAllOf(selectionPropsOf(context))
        ? Option.some(
            Selection.selectAll(state.selection, selectionPropsOf(context)),
          )
        : Option.none(),
    'Focused',
    ({ state, guardValue }) => focusedFrom(state, { selection: guardValue }),
  ),
  when(
    (state: S, message: typeof PressedListboxKey.Type, context: Props) =>
      message.key === 'Escape' &&
      !isDisabledOf(context) &&
      isDeselectableOf(context) &&
      !Selection.isEmpty(state.selection),
    'Focused',
    ({ state, context }) =>
      focusedFrom(state, {
        selection: Selection.clear(state.selection, selectionPropsOf(context)),
      }),
  ),
  when(
    (state: S, message: typeof PressedListboxKey.Type, context: Props) =>
      !isDisabledOf(context) && isActivationKey(state, message.key)
        ? activeValueOf(state, context)
        : Option.none(),
    'Focused',
    ({ state, message, guardValue, context }) => {
      const selProps = selectionPropsOf(context)
      const nextSelection =
        message.isShift === true && isMultipleOf(context)
          ? Selection.selectRange(
              state.selection,
              guardValue,
              selProps,
              activeValueOf(state, context),
            )
          : Selection.toggle(state.selection, guardValue, selProps)
      return focusedFrom(state, { selection: nextSelection })
    },
  ),
  when(
    (state: S, message: typeof PressedListboxKey.Type, context: Props) =>
      isDisabledOf(context)
        ? Option.none()
        : Option.flatMap(rovingMoveOf(context, message.key), move =>
            stepHighlight(context, activeIndexOf(state, context), move),
          ),
    'Focused',
    ({ state, message, guardValue, context }) =>
      applyNavigation(state, context, guardValue, message.isShift === true),
  ),
  when(
    (state: S, message: typeof PressedListboxKey.Type, context: Props) =>
      !isDisabledOf(context) &&
      typeaheadEnabledOf(context) &&
      message.isMeta !== true &&
      message.isControl !== true &&
      Typeahead.isSearchKey(
        message.key,
        Typeahead.isSearching(state.typeahead),
      ),
    'Focused',
    ({ state, message, context }) => runTypeahead(state, context, message.key),
  ),
  ignore(),
]

const searchedEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof SearchedListbox.Type, never, Props>
> => [
  when(
    (_state: S, _message: typeof SearchedListbox.Type, context: Props) =>
      !isDisabledOf(context) && typeaheadEnabledOf(context),
    'Focused',
    ({ state, message, context }) => runTypeahead(state, context, message.key),
  ),
  ignore(),
]

const replaceSelectionEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof ReplaceListboxSelection.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: StateVariant<Target>,
      message: typeof ReplaceListboxSelection.Type,
      context: Props,
    ) => {
      const next = Selection.replace(
        state.selection,
        message.values,
        selectionPropsOf(context),
      )
      return next === state.selection ? Option.none() : Option.some(next)
    },
    target,
    ({ state, guardValue }) => build(state, { selection: guardValue }),
  ),
  ignore(),
]

const reconcileEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof ReconcileListboxItems.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: StateVariant<Target>,
      _message: typeof ReconcileListboxItems.Type,
      context: Props,
    ) => {
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
    target,
    ({ state, guardValue }) =>
      build(state, {
        selection: guardValue.nextSelection,
        maybeActiveIndex: guardValue.nextActiveIndex,
      }),
  ),
  ignore(),
]

// CHART

/**
 * Builds the Listbox Machine chart starting in `initialState`: single and
 * multiple selection modes, horizontal and vertical orientation, LTR and RTL
 * reading direction, roving focus with active-descendant tracking, Shift+Arrow
 * and Shift+Click range selection, Mod+A select-all, Escape clear when
 * deselectable, debounced typeahead via `Typeahead` and `Command.answerAfter`,
 * pointer hover deduplication, disabled item skipping, item reconciliation,
 * and form reset.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          SelectListboxOption: selectOptionEdges<Idle>(),
          SelectListboxRange: selectRangeEdges<Idle>(),
          SelectAllListboxOptions: selectAllEdges('Idle', idleFrom),
          ClearListboxSelection: clearSelectionEdges('Idle', idleFrom),
          FocusListbox: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Focused',
              ({ state, context }) =>
                focusedFrom(state, {
                  maybeActiveIndex: defaultFocusIndex(state, context),
                }),
            ),
            ignore(),
          ],
          HighlightListboxItem: highlightItemEdges('Idle', idleFrom),
          MovedPointerOverListboxItem: movedPointerEdges('Idle', idleFrom),
          LeftListboxItem: leftItemEdges('Idle', idleFrom),
          MovedListboxHighlight: movedHighlightEdges<Idle>(),
          PressedListboxKey: pressedKeyEdges<Idle>(),
          SearchedListbox: searchedEdges<Idle>(),
          ReplaceListboxSelection: replaceSelectionEdges('Idle', idleFrom),
          ReconcileListboxItems: reconcileEdges('Idle', idleFrom),
          ResetListbox: to('Idle', ({ state, context }) =>
            Idle({
              selection: Selection.replace(
                state.selection,
                context.defaultValue ?? [],
                selectionPropsOf(context),
              ),
              maybeActiveIndex: Option.none(),
              activationTrigger: 'Keyboard',
              typeahead: Typeahead.atRest(state.typeahead),
              maybeLastPointerPosition: Option.none(),
            }),
          ),
        },
      },
      Focused: {
        on: {
          SelectListboxOption: selectOptionEdges<Focused>(),
          SelectListboxRange: selectRangeEdges<Focused>(),
          SelectAllListboxOptions: selectAllEdges('Focused', focusedFrom),
          ClearListboxSelection: clearSelectionEdges('Focused', focusedFrom),
          BlurListbox: to('Idle', ({ state }) =>
            Idle({
              selection: state.selection,
              maybeActiveIndex: state.maybeActiveIndex,
              activationTrigger: state.activationTrigger,
              typeahead: Typeahead.atRest(state.typeahead),
              maybeLastPointerPosition: Option.none(),
            }),
          ),
          HighlightListboxItem: highlightItemEdges('Focused', focusedFrom),
          MovedPointerOverListboxItem: movedPointerEdges(
            'Focused',
            focusedFrom,
          ),
          LeftListboxItem: leftItemEdges('Focused', focusedFrom),
          MovedListboxHighlight: movedHighlightEdges<Focused>(),
          PressedListboxKey: pressedKeyEdges<Focused>(),
          SearchedListbox: searchedEdges<Focused>(),
          ClearedListboxSearch: [
            when(
              (state, message) =>
                Typeahead.isSearching(state.typeahead) &&
                Typeahead.versionOf(state.typeahead) === message.version,
              'Focused',
              ({ state, message }) => {
                const [nextTypeahead] = Typeahead.chart.transition(
                  state.typeahead,
                  Typeahead.ElapsedReset({ version: message.version }),
                )
                return focusedFrom(state, { typeahead: nextTypeahead })
              },
            ),
            ignore(),
          ],
          ReplaceListboxSelection: replaceSelectionEdges(
            'Focused',
            focusedFrom,
          ),
          ReconcileListboxItems: reconcileEdges('Focused', focusedFrom),
          ResetListbox: to('Idle', ({ state, context }) =>
            Idle({
              selection: Selection.replace(
                state.selection,
                context.defaultValue ?? [],
                selectionPropsOf(context),
              ),
              maybeActiveIndex: Option.none(),
              activationTrigger: 'Keyboard',
              typeahead: Typeahead.atRest(state.typeahead),
              maybeLastPointerPosition: Option.none(),
            }),
          ),
        },
      },
    },
  })

/** The default Listbox Machine chart starting in `Idle` with empty selection. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  SelectListboxOption: pace,
  SelectListboxRange: pace,
  SelectAllListboxOptions: pace,
  ClearListboxSelection: pace,
  FocusListbox: pace,
  BlurListbox: pace,
  HighlightListboxItem: pace,
  MovedPointerOverListboxItem: pace,
  LeftListboxItem: pace,
  MovedListboxHighlight: pace,
  PressedListboxKey: pace,
  SearchedListbox: pace,
  ClearedListboxSearch: pace,
  ReplaceListboxSelection: pace,
  ReconcileListboxItems: pace,
  ResetListbox: pace,
})

/** Default synchronization: every Listbox Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Listbox kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The three painted slots of a Listbox Part: `Listbox`, `Option`, and `Label`. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Listbox: {
    role: 'Listbox',
    focus: 'Container',
    gestures: [],
  },
  Option: {
    role: 'Option',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectListboxOption' }],
  },
  Label: {
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
  if (slot === 'Listbox') {
    const maybeActiveId = activeDescendantIdOf(state, props)
    const labelledBy =
      props.labelledBy ??
      (props.label === undefined && props.hasLabel === true
        ? labelId(props.id)
        : undefined)
    return {
      id: listboxId(props.id),
      orientation: orientationOf(props),
      tabIndex: isDisabledOf(props) ? -1 : 0,
      ...(isMultipleOf(props) ? { isMultiselectable: true } : {}),
      ...Option.match(maybeActiveId, {
        onNone: () => ({}),
        onSome: activeId => ({ activeId }),
      }),
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(labelledBy === undefined ? {} : { labelledBy }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isInvalidOf(props) ? { isInvalid: true } : {}),
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
  } else {
    return {}
  }
}

/**
 * What a restart opens a Listbox on: preserves the resting selection and
 * monotonic typeahead version counter while clearing focus, active highlight,
 * search query, and pointer position.
 */
export const atRest = (state: State): State =>
  Idle({
    selection: Selection.atRest(state.selection),
    maybeActiveIndex: Option.none(),
    activationTrigger: 'Keyboard',
    typeahead: Typeahead.atRest(state.typeahead),
    maybeLastPointerPosition: Option.none(),
  })

// PART FACTORY

/** Options for customizing a Listbox Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'` or `'OwnChoice'`) to keep this Listbox device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial selected option values for the Part's chart (empty by default). */
  defaultValue?: ReadonlyArray<string>
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Listbox {@link Part.Part}. Synced by default (`category: 'Domain'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Listbox local to one device.
 *
 * @example
 * ```typescript
 * const FruitListbox = Listbox.make({ name: 'FruitListbox' })
 * const LocalListbox = Listbox.make({ name: 'LocalListbox', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Listbox',
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
 * Shorthand for a Listbox Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalListbox = Listbox.deviceOnly({ name: 'LocalListbox' })
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

/** The default synced Listbox Part (`name: 'Listbox'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

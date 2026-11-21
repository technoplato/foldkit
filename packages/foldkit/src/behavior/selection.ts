import { Array, Match as M, Option, Schema as S, pipe } from 'effect'

import {
  type GuardedEdge,
  define,
  ignore,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'

// NOTE: this is the reusable framework-free `selection` block (Scribe #2633).
// It models single and multiple selection over ordered selectable items
// (skipping disabled items), deselectability rules, anchor and range-end
// tracking for Shift/extended range selection, select-all, clear, replace,
// and item-list reconciliation as pure functions and a `Machine.define` chart.
// Reused by Listbox (#15), Select (#16), Combobox (#17), ToggleGroup (#30),
// CascadeSelect (#35), and TreeView (#36) without touching the DOM, timers,
// or any UI framework.

// SCHEMAS

/** Whether one item (`Single`) or many items (`Multiple`) may be selected at once. */
export const SelectionMode = S.Literals(['Single', 'Multiple'])
/** Whether one item or many items may be selected at once. */
export type SelectionMode = typeof SelectionMode.Type

/** One selectable item in an ordered collection, as plain data. */
export const Item = S.Struct({
  value: S.String,
  isDisabled: S.optionalKey(S.Boolean),
})
/** One selectable item in an ordered collection, as plain data. */
export type Item = typeof Item.Type

/**
 * Read-only configuration supplied to the Selection block as its context.
 * Items and policies stay out of the selection's state.
 */
export const Props = S.Struct({
  items: S.Array(Item),
  mode: S.optionalKey(SelectionMode),
  deselectable: S.optionalKey(S.Boolean),
  disallowSelectAll: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
})
/** Read-only configuration supplied to the Selection block. */
export type Props = typeof Props.Type

// STATE

/** No items are currently selected. */
export const Empty = ts('Empty', {})
/** No items are currently selected. */
export type Empty = typeof Empty.Type

/**
 * One or more items are selected, with an optional `maybeAnchor` for
 * Shift/extended range selection and `maybeRangeEnd` tracking the active
 * extended range so reversing direction shrinks the range cleanly.
 */
export const Selected = ts('Selected', {
  selectedValues: S.Array(S.String),
  maybeAnchor: S.Option(S.String),
  maybeRangeEnd: S.Option(S.String),
})
/** One or more items are selected. */
export type Selected = typeof Selected.Type

/** Where a Selection stands: `Empty` or `Selected`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Empty, Selected])
/** Where a Selection stands. */
export type State = typeof State.Type

/** Initial Selection state: empty. */
export const initial: State = Empty()

/**
 * Creates an initial Selection state from `values` (deduped) and an optional
 * `anchor`. Returns `Empty()` when `values` is empty.
 *
 * @example
 * ```typescript
 * initialSelected(['apple', 'banana'])
 * // Selected({ selectedValues: ['apple', 'banana'], maybeAnchor: Some('banana'), maybeRangeEnd: None })
 * initialSelected([]) // Empty()
 * ```
 */
export const initialSelected = (
  values: ReadonlyArray<string>,
  anchor?: string,
): State => {
  const unique = Array.dedupe(values)
  if (Array.isReadonlyArrayEmpty(unique)) {
    return Empty()
  } else {
    return Selected({
      selectedValues: unique,
      maybeAnchor: Option.orElse(Option.fromNullishOr(anchor), () =>
        Array.last(unique),
      ),
      maybeRangeEnd: Option.none(),
    })
  }
}

// MESSAGE

/** Selects an enabled item (`Single` replaces; `Multiple` adds). */
export const SelectItem = m('SelectItem', { value: S.String })

/** Deselects a selected item when deselectability permits. */
export const DeselectItem = m('DeselectItem', { value: S.String })

/** Toggles an enabled item's selected state. */
export const ToggleItem = m('ToggleItem', { value: S.String })

/** Extends selection from the anchor (or `maybeFrom`) to `value`, skipping disabled items. */
export const SelectRange = m('SelectRange', {
  value: S.String,
  maybeFrom: S.optionalKey(S.Option(S.String)),
})

/** Selects every enabled item in `Multiple` mode when select-all is allowed. */
export const SelectAll = m('SelectAll')

/** Clears all selected items when deselectability permits. */
export const ClearSelection = m('ClearSelection')

/** Replaces the selection with the enabled values in `values`. */
export const ReplaceSelection = m('ReplaceSelection', {
  values: S.Array(S.String),
})

/** Reconciles the selection against an updated item list, dropping absent values. */
export const ReconcileSelection = m('ReconcileSelection')

/** Every Message the Selection block handles. */
export const Message = S.Union([
  SelectItem,
  DeselectItem,
  ToggleItem,
  SelectRange,
  SelectAll,
  ClearSelection,
  ReplaceSelection,
  ReconcileSelection,
])
/** Every Message the Selection block handles. */
export type Message = typeof Message.Type

/** True for a Message of the Selection block. */
export const isMessage = S.is(Message)

// CONFIG READERS

/** Resolved selection mode for `props` (`'Single'` by default). */
export const modeOf = (props: Pick<Props, 'mode'> = {}): SelectionMode =>
  props.mode ?? 'Single'

/** True when `props` allows selecting multiple items. */
export const isMultipleOf = (props: Pick<Props, 'mode'> = {}): boolean =>
  modeOf(props) === 'Multiple'

/** True when the entire selectable collection is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/**
 * True when the selection may be emptied by user deselection or clearing.
 * Defaults to `false` in `Single` mode and `true` in `Multiple` mode when
 * `props.deselectable` is omitted.
 *
 * @example
 * ```typescript
 * isDeselectableOf({ mode: 'Single' }) // false
 * isDeselectableOf({ mode: 'Single', deselectable: true }) // true
 * isDeselectableOf({ mode: 'Multiple' }) // true
 * isDeselectableOf({ mode: 'Multiple', deselectable: false }) // false
 * ```
 */
export const isDeselectableOf = (
  props: Pick<Props, 'mode' | 'deselectable'> = {},
): boolean => props.deselectable ?? isMultipleOf(props)

/** True when selecting all items is permitted (`Multiple`, enabled, and not disallowed). */
export const canSelectAllOf = (
  props: Pick<Props, 'mode' | 'isDisabled' | 'disallowSelectAll'> = {},
): boolean =>
  isMultipleOf(props) &&
  !isDisabledOf(props) &&
  props.disallowSelectAll !== true

// INTERNAL HELPERS

const hasItem = (props: Props, value: string): boolean =>
  Array.some(props.items, item => item.value === value)

const indexOfValue = (props: Props, value: string): Option.Option<number> =>
  Array.findFirstIndex(props.items, item => item.value === value)

const isEnabledItem = (props: Props, value: string): boolean =>
  !isDisabledOf(props) &&
  Array.some(
    props.items,
    item => item.value === value && item.isDisabled !== true,
  )

const enabledValuesOf = (props: Props): ReadonlyArray<string> =>
  isDisabledOf(props)
    ? []
    : pipe(
        props.items,
        Array.filter(item => item.isDisabled !== true),
        Array.map(item => item.value),
        Array.dedupe,
      )

const rangeEnabledValues = (
  props: Props,
  fromValue: string,
  toValue: string,
): ReadonlyArray<string> =>
  Option.match(
    Option.all([indexOfValue(props, fromValue), indexOfValue(props, toValue)]),
    {
      onNone: () => [],
      onSome: ([fromIndex, toIndex]) => {
        const start = Math.min(fromIndex, toIndex)
        const end = Math.max(fromIndex, toIndex)
        return pipe(
          props.items.slice(start, end + 1),
          Array.filter(item => item.isDisabled !== true),
          Array.map(item => item.value),
          Array.dedupe,
        )
      },
    },
  )

const arraysEqual = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean =>
  left.length === right.length &&
  Array.every(left, (value, index) => right[index] === value)

const optionsEqual = (
  left: Option.Option<string>,
  right: Option.Option<string>,
): boolean => Option.getOrUndefined(left) === Option.getOrUndefined(right)

// READINGS

/** All currently selected values in order (`[]` when empty). */
export const selectedOf = (state: State): ReadonlyArray<string> =>
  M.value(state).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      Empty: () => [],
      Selected: ({ selectedValues }) => selectedValues,
    }),
  )

/**
 * The first selected value: when `props` is supplied, the earliest selected
 * item in `props.items` order; otherwise the head of `selectedOf(state)`.
 *
 * @example
 * ```typescript
 * firstSelectedOf(initialSelected(['cherry', 'apple']), { items: [{ value: 'apple' }, { value: 'cherry' }] })
 * // Some('apple')
 * ```
 */
export const firstSelectedOf = (
  state: State,
  props?: Pick<Props, 'items'>,
): Option.Option<string> => {
  const values = selectedOf(state)
  if (Array.isReadonlyArrayEmpty(values)) {
    return Option.none()
  } else if (props === undefined) {
    return Array.head(values)
  } else {
    return Option.map(
      Array.findFirst(props.items, item => Array.contains(values, item.value)),
      item => item.value,
    )
  }
}

/** True when `value` is currently selected. */
export const isSelected = (state: State, value: string): boolean =>
  Array.contains(selectedOf(state), value)

/** True when `value` appears in the raw `selectedValues` array. */
export const hasValue = (
  selectedValues: ReadonlyArray<string>,
  value: string,
): boolean => Array.contains(selectedValues, value)

/** The number of currently selected items. */
export const selectedCountOf = (state: State): number =>
  selectedOf(state).length

/** The current range-selection anchor, or none when empty or unset. */
export const anchorOf = (state: State): Option.Option<string> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      Empty: () => Option.none(),
      Selected: ({ maybeAnchor }) => maybeAnchor,
    }),
  )

/** The end of the current extended range selection, or none. */
export const rangeEndOf = (state: State): Option.Option<string> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      Empty: () => Option.none(),
      Selected: ({ maybeRangeEnd }) => maybeRangeEnd,
    }),
  )

/**
 * True when there is at least one enabled item in `props.items` and every
 * enabled item is currently selected.
 *
 * @example
 * ```typescript
 * isAllSelected(initialSelected(['a', 'b']), { items: [{ value: 'a' }, { value: 'b' }, { value: 'c', isDisabled: true }] })
 * // true
 * ```
 */
export const isAllSelected = (
  state: State,
  props: Pick<Props, 'items' | 'isDisabled'>,
): boolean => {
  const enabled = enabledValuesOf({ ...props, items: props.items })
  return (
    Array.isReadonlyArrayNonEmpty(enabled) &&
    Array.every(enabled, value => isSelected(state, value))
  )
}

/** True when no items are currently selected. */
export const isEmpty = (state: State): boolean => state._tag === 'Empty'

// PURE TRANSITIONS

/**
 * Selects an enabled `value`. In `Single` mode, replaces the selection with
 * `[value]`; in `Multiple` mode, adds `value` if absent. Updates the range
 * anchor to `Some(value)` and clears any active range end. Returns `state`
 * unchanged when the collection or item is disabled or missing.
 */
export const select = (state: State, value: string, props: Props): State => {
  if (!isEnabledItem(props, value)) {
    return state
  }

  if (!isMultipleOf(props)) {
    const nextValues: ReadonlyArray<string> = [value]
    if (
      state._tag === 'Selected' &&
      arraysEqual(state.selectedValues, nextValues) &&
      Option.contains(state.maybeAnchor, value) &&
      Option.isNone(state.maybeRangeEnd)
    ) {
      return state
    } else {
      return Selected({
        selectedValues: nextValues,
        maybeAnchor: Option.some(value),
        maybeRangeEnd: Option.none(),
      })
    }
  } else {
    const current = selectedOf(state)
    const nextValues = Array.contains(current, value)
      ? current
      : [...current, value]
    if (
      state._tag === 'Selected' &&
      arraysEqual(state.selectedValues, nextValues) &&
      Option.contains(state.maybeAnchor, value) &&
      Option.isNone(state.maybeRangeEnd)
    ) {
      return state
    } else {
      return Selected({
        selectedValues: nextValues,
        maybeAnchor: Option.some(value),
        maybeRangeEnd: Option.none(),
      })
    }
  }
}

/**
 * Deselects `value` when present and permitted by `isDeselectableOf(props)`.
 * When `deselectable` is `false`, refuses removing the final remaining
 * selected item. Returns `state` unchanged when disabled, absent, or refused.
 */
export const deselect = (state: State, value: string, props: Props): State => {
  if (isDisabledOf(props) || state._tag === 'Empty') {
    return state
  }
  if (!Array.contains(state.selectedValues, value)) {
    return state
  }

  const remaining = Array.filter(state.selectedValues, each => each !== value)
  if (Array.isReadonlyArrayEmpty(remaining)) {
    return isDeselectableOf(props) ? Empty() : state
  } else {
    const nextAnchor = Option.contains(state.maybeAnchor, value)
      ? Array.last(remaining)
      : state.maybeAnchor
    return Selected({
      selectedValues: remaining,
      maybeAnchor: nextAnchor,
      maybeRangeEnd: Option.none(),
    })
  }
}

/**
 * Toggles an enabled `value`: deselects it when already selected (subject to
 * `isDeselectableOf(props)`), otherwise selects it. Returns `state` unchanged
 * when the collection or item is disabled or missing.
 */
export const toggle = (state: State, value: string, props: Props): State => {
  if (!isEnabledItem(props, value)) {
    return state
  } else if (isSelected(state, value)) {
    return deselect(state, value, props)
  } else {
    return select(state, value, props)
  }
}

/**
 * Extends selection from the active anchor to `targetValue`, skipping disabled
 * items. In `Single` mode, behaves like {@link select}. In `Multiple` mode,
 * replaces the previous extended span (`[anchor .. rangeEnd]`) with the new
 * span (`[anchor .. targetValue]`) while preserving any earlier non-range
 * selections, so reversing Shift+Arrow direction cleanly shrinks the range.
 */
export const selectRange = (
  state: State,
  targetValue: string,
  props: Props,
  maybeAnchorOverride: Option.Option<string> = Option.none(),
): State => {
  if (!isEnabledItem(props, targetValue)) {
    return state
  }
  if (!isMultipleOf(props)) {
    return select(state, targetValue, props)
  }

  const validAnchor = Option.filter(anchorOf(state), value =>
    hasItem(props, value),
  )
  const validOverride = Option.filter(maybeAnchorOverride, value =>
    hasItem(props, value),
  )
  const anchor = Option.getOrElse(
    Option.orElse(validAnchor, () =>
      Option.orElse(validOverride, () => firstSelectedOf(state, props)),
    ),
    () => targetValue,
  )

  const previousRange = rangeEnabledValues(
    props,
    anchor,
    Option.getOrElse(rangeEndOf(state), () => anchor),
  )
  const baseValues = Array.filter(
    selectedOf(state),
    each => !Array.contains(previousRange, each),
  )
  const nextRange = rangeEnabledValues(props, anchor, targetValue)
  const nextValues = Array.dedupe([...baseValues, ...nextRange])

  if (Array.isReadonlyArrayEmpty(nextValues)) {
    return Empty()
  } else if (
    state._tag === 'Selected' &&
    arraysEqual(state.selectedValues, nextValues) &&
    Option.contains(state.maybeAnchor, anchor) &&
    Option.contains(state.maybeRangeEnd, targetValue)
  ) {
    return state
  } else {
    return Selected({
      selectedValues: nextValues,
      maybeAnchor: Option.some(anchor),
      maybeRangeEnd: Option.some(targetValue),
    })
  }
}

/**
 * Selects every enabled item in `props.items` when in `Multiple` mode and
 * select-all is allowed. Preserves an existing valid anchor or sets the anchor
 * to the first enabled item.
 */
export const selectAll = (state: State, props: Props): State => {
  if (!canSelectAllOf(props)) {
    return state
  }
  const enabled = enabledValuesOf(props)
  if (Array.isReadonlyArrayEmpty(enabled)) {
    return state
  }

  const nextAnchor = Option.orElse(
    Option.filter(anchorOf(state), value => Array.contains(enabled, value)),
    () => Array.head(enabled),
  )
  if (
    state._tag === 'Selected' &&
    arraysEqual(state.selectedValues, enabled) &&
    optionsEqual(state.maybeAnchor, nextAnchor) &&
    Option.isNone(state.maybeRangeEnd)
  ) {
    return state
  } else {
    return Selected({
      selectedValues: enabled,
      maybeAnchor: nextAnchor,
      maybeRangeEnd: Option.none(),
    })
  }
}

/**
 * Clears all selected items when the collection is enabled and
 * `isDeselectableOf(props)` is `true`. Returns `state` unchanged otherwise.
 */
export const clear = (state: State, props: Props): State => {
  if (
    isDisabledOf(props) ||
    state._tag === 'Empty' ||
    !isDeselectableOf(props)
  ) {
    return state
  } else {
    return Empty()
  }
}

/**
 * Replaces the selection with the enabled items from `values` (deduped; capped
 * to one item in `Single` mode). Returns `Empty()` when no valid values
 * remain. Returns `state` unchanged when disabled or identical.
 */
export const replace = (
  state: State,
  values: ReadonlyArray<string>,
  props: Props,
): State => {
  if (isDisabledOf(props)) {
    return state
  }

  const valid = pipe(
    values,
    Array.filter(value => isEnabledItem(props, value)),
    Array.dedupe,
  )
  const capped = isMultipleOf(props) ? valid : Array.take(valid, 1)

  if (Array.isReadonlyArrayEmpty(capped)) {
    return state._tag === 'Empty' ? state : Empty()
  } else {
    const nextAnchor = Array.last(capped)
    if (
      state._tag === 'Selected' &&
      arraysEqual(state.selectedValues, capped) &&
      optionsEqual(state.maybeAnchor, nextAnchor) &&
      Option.isNone(state.maybeRangeEnd)
    ) {
      return state
    } else {
      return Selected({
        selectedValues: capped,
        maybeAnchor: nextAnchor,
        maybeRangeEnd: Option.none(),
      })
    }
  }
}

/**
 * Reconciles `state` against an updated `props.items` list: drops values that
 * are no longer in `props.items`, caps to one value if switched to `Single`,
 * and clears stale `maybeAnchor` / `maybeRangeEnd`. Returns `state` unchanged
 * when nothing changed.
 */
export const reconcile = (state: State, props: Props): State => {
  if (state._tag === 'Empty') {
    return state
  }

  const retained = pipe(
    state.selectedValues,
    Array.filter(value => hasItem(props, value)),
    Array.dedupe,
  )
  const capped = isMultipleOf(props) ? retained : Array.take(retained, 1)

  if (Array.isReadonlyArrayEmpty(capped)) {
    return Empty()
  }

  const nextAnchor = Option.filter(state.maybeAnchor, value =>
    hasItem(props, value),
  )
  const nextRangeEnd = Option.isSome(nextAnchor)
    ? Option.filter(state.maybeRangeEnd, value => hasItem(props, value))
    : Option.none<string>()

  if (
    arraysEqual(state.selectedValues, capped) &&
    optionsEqual(state.maybeAnchor, nextAnchor) &&
    optionsEqual(state.maybeRangeEnd, nextRangeEnd)
  ) {
    return state
  } else {
    return Selected({
      selectedValues: capped,
      maybeAnchor: nextAnchor,
      maybeRangeEnd: nextRangeEnd,
    })
  }
}

// CHART HELPERS

const asEmpty = (next: State, previous: State): Option.Option<Empty> =>
  next._tag === 'Empty' && next !== previous ? Option.some(next) : Option.none()

const asSelected = (next: State, previous: State): Option.Option<Selected> =>
  next._tag === 'Selected' && next !== previous
    ? Option.some(next)
    : Option.none()

const transitionEdges = <S extends State, M extends Message>(
  compute: (state: S, message: M, context: Props) => State,
): ReadonlyArray<GuardedEdge<State, Message, S, M, never, Props>> => [
  when(
    (state: S, message: M, context: Props) =>
      asEmpty(compute(state, message, context), state),
    'Empty',
    ({ guardValue }) => guardValue,
  ),
  when(
    (state: S, message: M, context: Props) =>
      asSelected(compute(state, message, context), state),
    'Selected',
    ({ guardValue }) => guardValue,
  ),
  ignore(),
]

const selectOnlyEdges = <S extends State, M extends Message>(
  compute: (state: S, message: M, context: Props) => State,
): ReadonlyArray<GuardedEdge<State, Message, S, M, never, Props>> => [
  when(
    (state: S, message: M, context: Props) =>
      asSelected(compute(state, message, context), state),
    'Selected',
    ({ guardValue }) => guardValue,
  ),
  ignore(),
]

// CHART

/**
 * Builds the Selection Machine chart starting in `initialState`: single and
 * multiple selection modes, deselectable guards, Shift/extended range
 * selection with anchor tracking, select-all, clear, replace, and item-list
 * reconciliation.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Empty: {
        on: {
          SelectItem: selectOnlyEdges<Empty, typeof SelectItem.Type>(
            (state, message, context) => select(state, message.value, context),
          ),
          DeselectItem: [ignore()],
          ToggleItem: selectOnlyEdges<Empty, typeof ToggleItem.Type>(
            (state, message, context) => toggle(state, message.value, context),
          ),
          SelectRange: selectOnlyEdges<Empty, typeof SelectRange.Type>(
            (state, message, context) =>
              selectRange(state, message.value, context, message.maybeFrom),
          ),
          SelectAll: selectOnlyEdges<Empty, typeof SelectAll.Type>(
            (state, _message, context) => selectAll(state, context),
          ),
          ClearSelection: [ignore()],
          ReplaceSelection: selectOnlyEdges<
            Empty,
            typeof ReplaceSelection.Type
          >((state, message, context) =>
            replace(state, message.values, context),
          ),
          ReconcileSelection: [ignore()],
        },
      },
      Selected: {
        on: {
          SelectItem: selectOnlyEdges<Selected, typeof SelectItem.Type>(
            (state, message, context) => select(state, message.value, context),
          ),
          DeselectItem: transitionEdges<Selected, typeof DeselectItem.Type>(
            (state, message, context) =>
              deselect(state, message.value, context),
          ),
          ToggleItem: transitionEdges<Selected, typeof ToggleItem.Type>(
            (state, message, context) => toggle(state, message.value, context),
          ),
          SelectRange: transitionEdges<Selected, typeof SelectRange.Type>(
            (state, message, context) =>
              selectRange(state, message.value, context, message.maybeFrom),
          ),
          SelectAll: selectOnlyEdges<Selected, typeof SelectAll.Type>(
            (state, _message, context) => selectAll(state, context),
          ),
          ClearSelection: [
            when(
              (state, _message, context) =>
                asEmpty(clear(state, context), state),
              'Empty',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ReplaceSelection: transitionEdges<
            Selected,
            typeof ReplaceSelection.Type
          >((state, message, context) =>
            replace(state, message.values, context),
          ),
          ReconcileSelection: transitionEdges<
            Selected,
            typeof ReconcileSelection.Type
          >((state, _message, context) => reconcile(state, context)),
        },
      },
    },
  })

/** The default Selection Machine chart starting in `Empty()`. */
export const chart = chartOf(initial)

// SYNC & REST

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  SelectItem: pace,
  DeselectItem: pace,
  ToggleItem: pace,
  SelectRange: pace,
  SelectAll: pace,
  ClearSelection: pace,
  ReplaceSelection: pace,
  ReconcileSelection: pace,
})

/** Default synchronization: every Selection Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Selection kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

/** Default sync table when used as a standalone block. */
export const sync: Readonly<Record<Message['_tag'], Sync>> = synced

/**
 * What a restart opens Selection on: keeps the selected values and anchor
 * while clearing any transient extended range end.
 */
export const atRest = (state: State): State =>
  M.value(state).pipe(
    M.withReturnType<State>(),
    M.tagsExhaustive({
      Empty: () => Empty(),
      Selected: ({ selectedValues, maybeAnchor }) =>
        Selected({
          selectedValues,
          maybeAnchor,
          maybeRangeEnd: Option.none(),
        }),
    }),
  )

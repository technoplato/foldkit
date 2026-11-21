import { Array, Option, Order, Schema as S, String as Str } from 'effect'

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
import * as FieldDraft from './fieldDraft.js'
import * as Layers from './layers.js'
import * as ListFilter from './listFilter.js'
import {
  Device,
  type DeviceReason,
  Settled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import * as Placement from './placement.js'
import * as RovingFocus from './rovingFocus.js'
import * as Selection from './selection.js'
import type { SlotProps } from './slot.js'
import * as Typeahead from './typeahead.js'

// NOTE: this is the core Combobox Part (Widget #17 of 54, Scribe #2658).
// It composes `ListFilter`, `Placement`, `Layers`, `Selection`, `RovingFocus`,
// `Typeahead`, and `FieldDraft` into one framework-free Machine and Part
// declaration covering packages/ui Combobox (single + Multi) and Zag combobox.
// Its state (`Closed` | `Open`) lives in the Model, synced by default under
// `Domain` with `Pace.Settled({ afterMs: 200 })` on query typing and
// `Pace.Synced()` on discrete actions, plus `Combobox.make` and
// `Combobox.deviceOnly()`. It projects reference-stable SlotBindings (`Input`,
// `Trigger`, `Content`, `Option`, `Label`, `Description`, `Error`,
// `ClearButton`, `Backdrop`) rendered by HTML, React, and React Native generic
// hosts with zero Combobox-specific painter logic.

// CONSTANTS & SCHEMAS

/** Default typing-pause settle window in milliseconds (`200`), taken from `FieldDraft.defaultSettleMs`. */
export const defaultSettleMs: number = FieldDraft.defaultSettleMs

/** Whether one option (`Single`) or many options (`Multiple`) may be selected at once. */
export const SelectionMode = Selection.SelectionMode
/** Whether one option or many options may be selected at once. */
export type SelectionMode = Selection.SelectionMode

/** How the combobox filters options as the user types (`Contains` | `StartsWith` | `Fuzzy`). */
export const FilterMode = ListFilter.MatchMode
/** How the combobox filters options as the user types. */
export type FilterMode = ListFilter.MatchMode

/**
 * How typing and arrow navigation interact with highlighting and input text:
 * - `AutoHighlight`: automatically highlights the first enabled match as the user types (default).
 * - `AutoComplete`: auto-highlights and previews the highlighted option's label during arrow navigation.
 * - `None`: leaves highlight empty while typing until moved explicitly.
 */
export const InputBehavior = S.Literals([
  'AutoHighlight',
  'AutoComplete',
  'None',
])
/** How typing and arrow navigation interact with highlighting and input text. */
export type InputBehavior = typeof InputBehavior.Type

/**
 * What happens to the input text when an option is selected:
 * - `Replace`: replaces the input text with the selected option's resting label (default in `Single`).
 * - `Clear`: clears the input text to `''` (default in `Multiple`).
 * - `Preserve`: leaves the typed input text unchanged.
 */
export const SelectionBehavior = S.Literals(['Replace', 'Clear', 'Preserve'])
/** What happens to the input text when an option is selected. */
export type SelectionBehavior = typeof SelectionBehavior.Type

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

/** Optional placement spacing overrides for the Combobox popup panel. */
export const PlacementOptions = S.Struct({
  gapPx: S.optionalKey(S.Number),
  edgePx: S.optionalKey(S.Number),
})
/** Optional placement spacing overrides. */
export type PlacementOptions = typeof PlacementOptions.Type

/** One selectable option in a Combobox, as plain data. */
export const Item = S.Struct({
  value: S.String,
  label: S.String,
  searchText: S.optionalKey(S.String),
  keywords: S.optionalKey(S.Array(S.String)),
  isDisabled: S.optionalKey(S.Boolean),
})
/** One selectable option in a Combobox, as plain data. */
export type Item = typeof Item.Type

/**
 * Read-only props supplied to the Combobox chart and projection from the
 * Program's Model. Options, filter policies, layer stack, placement spacing,
 * and accessibility linkage stay out of the chart's state.
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
  nullable: S.optionalKey(S.Boolean),
  allowCustomValue: S.optionalKey(S.Boolean),
  closeOnSelect: S.optionalKey(S.Boolean),
  inputBehavior: S.optionalKey(InputBehavior),
  selectionBehavior: S.optionalKey(SelectionBehavior),
  filter: S.optionalKey(S.Boolean),
  filterMode: S.optionalKey(FilterMode),
  sortFilteredByScore: S.optionalKey(S.Boolean),
  isCaseSensitive: S.optionalKey(S.Boolean),
  stripDiacritics: S.optionalKey(S.Boolean),
  openOnInput: S.optionalKey(S.Boolean),
  openOnFocus: S.optionalKey(S.Boolean),
  openOnClick: S.optionalKey(S.Boolean),
  openOnKeyPress: S.optionalKey(S.Boolean),
  immediate: S.optionalKey(S.Boolean),
  isModal: S.optionalKey(S.Boolean),
  dismissOnEscape: S.optionalKey(S.Boolean),
  dismissOnOutsidePress: S.optionalKey(S.Boolean),
  loop: S.optionalKey(S.Boolean),
  pageKeys: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  defaultValue: S.optionalKey(S.Array(S.String)),
  defaultInputValue: S.optionalKey(S.String),
  settleMs: S.optionalKey(S.Number),
  name: S.optionalKey(S.String),
  form: S.optionalKey(S.String),
  layers: S.optionalKey(Layers.Stack),
  placement: S.optionalKey(PlacementOptions),
})
/** Read-only props supplied to the Combobox chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The combobox popup is closed while retaining its selection and input field state. */
export const Closed = ts('Closed', {
  selection: Selection.State,
  field: FieldDraft.State,
})
/** The combobox popup is closed. */
export type Closed = typeof Closed.Type

/**
 * The combobox popup is open, retaining its selection and live input draft
 * while tracking the active `ListFilter` state, highlighted option value,
 * activation trigger, and last pointer position.
 */
export const Open = ts('Open', {
  selection: Selection.State,
  field: FieldDraft.State,
  filter: ListFilter.State,
  maybeActiveValue: S.Option(S.String),
  activationTrigger: ActivationTrigger,
  maybeLastPointerPosition: S.Option(PointerPosition),
})
/** The combobox popup is open. */
export type Open = typeof Open.Type

/** Where a Combobox Part stands: `Closed` or `Open`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open])
/** Where a Combobox Part stands. */
export type State = typeof State.Type

/** Initial Combobox state: closed, empty selection, idle empty field draft. */
export const initial: State = Closed({
  selection: Selection.initial,
  field: FieldDraft.initial,
})

/** Creates an initial closed Combobox state with `values` pre-selected and optional resting `inputValue`. */
export const initialSelected = (
  values: ReadonlyArray<string>,
  inputValue: string = '',
): State =>
  Closed({
    selection: Selection.initialSelected(values),
    field: FieldDraft.initialValue(inputValue),
  })

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Opens the combobox options list. */
export const OpenCombobox = Catalog.action('OpenCombobox', {
  what: 'Opens the combobox options list',
  why: 'To browse and pick from the available choices',
  meta: { label: 'Open combobox', keys: [] },
})

/** Closes the open combobox options list unconditionally. */
export const CloseCombobox = Catalog.action('CloseCombobox', {
  what: 'Closes the open combobox options list',
  why: 'To hide the choices and keep the current selection',
  meta: { label: 'Close combobox', keys: [] },
})

/** Opens the combobox options list when closed or closes it when open. */
export const ToggleCombobox = Catalog.action('ToggleCombobox', {
  what: 'Opens the combobox options list or closes it when open',
  why: 'To reveal or hide the available choices',
  meta: { label: 'Toggle combobox', keys: [] },
})

/** Dismisses the open combobox list when it is the topmost dismissable layer. */
export const DismissCombobox = Catalog.action('DismissCombobox', {
  what: 'Dismisses the open combobox list when it is the topmost layer',
  why: 'To leave the choices without picking a new option',
  meta: { label: 'Dismiss combobox', keys: [] },
})

/** Updates the combobox filter input text immediately on this device; synced with `Pace.Settled`. */
export const ChangeComboboxInput = Catalog.action('ChangeComboboxInput', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'query',
    prompt: 'Filter choices by what text?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No filter text given',
  },
  what: 'Updates the combobox filter text',
  why: 'To narrow the options or enter a custom value',
  meta: { label: 'Filter options', keys: [] },
})

/** Selects or toggles an enabled option by its value. */
export const SelectComboboxOption = Catalog.action('SelectComboboxOption', {
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

/** Removes one selected value from the combobox selection (such as removing a multi-select tag). */
export const RemoveComboboxValue = Catalog.action('RemoveComboboxValue', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'value',
    prompt: 'Remove which selected value?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No selected value to remove',
  },
  what: 'Removes a selected value from the combobox',
  why: 'To drop one choice without clearing the others',
  meta: { label: 'Remove value', keys: [] },
})

/** Clears the combobox input and any deselectable selection. */
export const ClearCombobox = Catalog.action('ClearCombobox', {
  what: 'Clears the combobox input and selection',
  why: 'To start fresh with no chosen options',
  meta: { label: 'Clear combobox', keys: [] },
})

/** The Catalog Actions a Combobox Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenCombobox,
  CloseCombobox,
  ToggleCombobox,
  DismissCombobox,
  ChangeComboboxInput,
  SelectComboboxOption,
  RemoveComboboxValue,
  ClearCombobox,
]

// MESSAGES (Facts in addition to the Actions above)

/** Focus entered the combobox input; opens the popup when `props.openOnFocus` is true. */
export const FocusComboboxInput = m('FocusComboboxInput')

/** The combobox input was activated while interactive; opens the popup when `props.openOnClick` is true. */
export const ClickComboboxInput = m('ClickComboboxInput')

/** Focus left the combobox input; closes any open popup and settles or reverts the input text. */
export const BlurComboboxInput = m('BlurComboboxInput')

/** A keyboard key was pressed while interacting with the combobox input. */
export const PressedComboboxKey = m('PressedComboboxKey', {
  key: S.String,
  isAlt: S.optionalKey(S.Boolean),
  isMeta: S.optionalKey(S.Boolean),
  isControl: S.optionalKey(S.Boolean),
  isShift: S.optionalKey(S.Boolean),
  isComposing: S.optionalKey(S.Boolean),
})

/** A roving highlight move was requested while the combobox popup is open. */
export const MovedComboboxHighlight = m('MovedComboboxHighlight', {
  move: RovingFocus.Move,
})

/** A specific enabled visible option value was highlighted while open. */
export const HighlightedComboboxItem = m('HighlightedComboboxItem', {
  value: S.String,
  activationTrigger: ActivationTrigger,
})

/** The pointer moved over an option with `value` and screen coordinates. */
export const MovedPointerOverComboboxItem = m('MovedPointerOverComboboxItem', {
  value: S.String,
  screenX: S.Number,
  screenY: S.Number,
})

/** The pointer left the currently hovered option while open. */
export const LeftComboboxItem = m('LeftComboboxItem')

/** A pointer press landed outside the layers listed in `insideIds`. */
export const PressedOutsideCombobox = m('PressedOutsideCombobox', {
  insideIds: S.Array(S.String),
})

/** Replaces the selection programmatically with `values`. */
export const ReplaceComboboxValue = m('ReplaceComboboxValue', {
  values: S.Array(S.String),
})

/** Sets the combobox input value programmatically without forcing the popup open. */
export const SetComboboxInputValue = m('SetComboboxInputValue', {
  value: S.String,
})

/** Reconciles selection and active highlight against an updated `props.items` list. */
export const ReconcileComboboxItems = m('ReconcileComboboxItems')

/** Resets the combobox selection and input to configured defaults and closes the popup. */
export const ResetCombobox = m('ResetCombobox')

/** Every Message the Combobox chart handles. */
export const Message = S.Union([
  OpenCombobox,
  CloseCombobox,
  ToggleCombobox,
  DismissCombobox,
  ChangeComboboxInput,
  SelectComboboxOption,
  RemoveComboboxValue,
  ClearCombobox,
  FocusComboboxInput,
  ClickComboboxInput,
  BlurComboboxInput,
  PressedComboboxKey,
  MovedComboboxHighlight,
  HighlightedComboboxItem,
  MovedPointerOverComboboxItem,
  LeftComboboxItem,
  PressedOutsideCombobox,
  ReplaceComboboxValue,
  SetComboboxInputValue,
  ReconcileComboboxItems,
  ResetCombobox,
])
/** Every Message the Combobox chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Combobox Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS (shared by chart and thin painters such as @foldkit/ui Combobox)

/** Derives the root combobox wrapper element id from a base `id`. */
export const comboboxId = (id: string): string => `${id}-combobox`

/** Derives the combobox text input element id (`role="combobox"`) from a base `id`. */
export const inputId = (id: string): string => `${id}-input`

/** Derives the toggle trigger button element id from a base `id`. */
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

/** Derives a grouped options container element id from a base `id` and `groupKey`. */
export const groupId = (id: string, groupKey: string): string =>
  `${id}-group-${groupKey}`

/** Derives a group heading element id from a base `id` and `groupKey`. */
export const headingId = (id: string, groupKey: string): string =>
  `${id}-heading-${groupKey}`

// PURE RULES & CONFIG READERS

/** Resolved selection mode for `props` (`'Single'` by default). */
export const selectionModeOf = (
  props: Pick<Props, 'selectionMode'> = {},
): SelectionMode => props.selectionMode ?? 'Single'

/** True when the combobox allows selecting multiple options. */
export const isMultipleOf = (
  props: Pick<Props, 'selectionMode'> = {},
): boolean => selectionModeOf(props) === 'Multiple'

/** True when the combobox is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the combobox is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when the combobox is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'> = {}): boolean =>
  props.isRequired === true

/** True when the combobox is currently invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/**
 * True when the combobox accepts user interaction: neither disabled nor
 * read-only.
 *
 * @example
 * ```typescript
 * canInteract({}) // true
 * canInteract({ isDisabled: true }) // false
 * canInteract({ isReadOnly: true }) // false
 * ```
 */
export const canInteract = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => FieldDraft.canEdit(props)

/** True when emptying the input and closing/blurring clears the selection (`false` by default). */
export const isNullableOf = (props: Pick<Props, 'nullable'> = {}): boolean =>
  props.nullable === true

/**
 * True when the selection may be emptied by deselecting or clearing: explicit
 * `deselectable` wins, else `true` when `nullable` is true or in `Multiple`
 * mode, else `false`.
 */
export const isDeselectableOf = (
  props: Pick<Props, 'selectionMode' | 'deselectable' | 'nullable'> = {},
): boolean => {
  if (props.deselectable !== undefined) {
    return props.deselectable
  } else if (props.nullable === true) {
    return true
  } else {
    return isMultipleOf(props)
  }
}

/** True when the user may commit custom text not found in `props.items` (`false` by default). */
export const allowCustomValueOf = (
  props: Pick<Props, 'allowCustomValue'> = {},
): boolean => props.allowCustomValue === true

/**
 * True when selecting an option automatically closes the popup: defaults to
 * `true` in `Single` mode and `false` in `Multiple` mode.
 */
export const closeOnSelectOf = (
  props: Pick<Props, 'selectionMode' | 'closeOnSelect'> = {},
): boolean => props.closeOnSelect ?? !isMultipleOf(props)

/** Resolved auto-highlight / auto-complete behavior (`'AutoHighlight'` by default). */
export const inputBehaviorOf = (
  props: Pick<Props, 'inputBehavior'> = {},
): InputBehavior => props.inputBehavior ?? 'AutoHighlight'

/**
 * Resolved input update behavior after selecting an option: defaults to
 * `'Clear'` in `Multiple` mode and `'Replace'` in `Single` mode.
 */
export const selectionBehaviorOf = (
  props: Pick<Props, 'selectionMode' | 'selectionBehavior'> = {},
): SelectionBehavior =>
  props.selectionBehavior ?? (isMultipleOf(props) ? 'Clear' : 'Replace')

/** True when the combobox filters `props.items` live via `ListFilter` (`true` by default). */
export const filterEnabledOf = (props: Pick<Props, 'filter'> = {}): boolean =>
  props.filter ?? true

/** Resolved `ListFilter` match strategy (`'Contains'` by default). */
export const filterModeOf = (
  props: Pick<Props, 'filterMode'> = {},
): FilterMode => props.filterMode ?? ListFilter.defaultMatchMode

/** True when filtered options are reordered by `ListFilter` relevance score (`false` by default, preserving item order). */
export const sortFilteredByScoreOf = (
  props: Pick<Props, 'sortFilteredByScore'> = {},
): boolean => props.sortFilteredByScore === true

/** True when typing into a closed combobox automatically opens the popup (`true` by default). */
export const openOnInputOf = (
  props: Pick<Props, 'openOnInput'> = {},
): boolean => props.openOnInput ?? true

/** True when focusing the input automatically opens the popup (`false` by default). */
export const openOnFocusOf = (
  props: Pick<Props, 'openOnFocus'> = {},
): boolean => props.openOnFocus === true

/** True when clicking the input opens the popup (`false` by default). */
export const openOnClickOf = (
  props: Pick<Props, 'openOnClick'> = {},
): boolean => props.openOnClick === true

/** True when pressing ArrowDown/ArrowUp on a closed input opens the popup (`true` by default). */
export const openOnKeyPressOf = (
  props: Pick<Props, 'openOnKeyPress'> = {},
): boolean => props.openOnKeyPress ?? true

/** True when keyboard highlight moves immediately commit selection (`false` by default). */
export const immediateOf = (props: Pick<Props, 'immediate'> = {}): boolean =>
  props.immediate === true

/** True when roving navigation wraps at the ends (`true` by default, matching Zag and `@foldkit/ui`). */
export const loopOf = (props: Pick<Props, 'loop'> = {}): boolean =>
  props.loop ?? true

/** True when `PageUp`/`PageDown` act as First/Last roving keys (`true` by default). */
export const pageKeysOf = (props: Pick<Props, 'pageKeys'> = {}): boolean =>
  props.pageKeys ?? true

/** True when the combobox popup is modal (`false` by default). */
export const isModalOf = (props: Pick<Props, 'isModal'> = {}): boolean =>
  props.isModal === true

/** True when pressing Escape is allowed to dismiss this combobox (`true` by default). */
export const dismissesOnEscapeOf = (
  props: Pick<Props, 'dismissOnEscape'> = {},
): boolean => props.dismissOnEscape ?? true

/** True when pressing outside is allowed to dismiss this combobox (`true` by default). */
export const dismissesOnOutsidePressOf = (
  props: Pick<Props, 'dismissOnOutsidePress'> = {},
): boolean => props.dismissOnOutsidePress ?? true

/** Resolved typing-pause settle duration in milliseconds (`200` by default). */
export const settleMsOf = (props: Pick<Props, 'settleMs'> = {}): number =>
  FieldDraft.settleMsOf(props)

/**
 * True when `next` has the exact same screen coordinates as `maybeLast`, so
 * redundant pointer-move events caused by scrolling or layout shifts do not
 * steal keyboard highlight. Shared by thin painters such as `@foldkit/ui`.
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
 * highlights stay put. Shared by thin painters such as `@foldkit/ui`.
 */
export const shouldDeactivateOnLeave = (trigger: ActivationTrigger): boolean =>
  trigger === 'Pointer'

/**
 * True when closing a combobox with an empty input should clear selection
 * (`isNullable` is true and `inputValue` is `''`). Shared by thin painters
 * such as `@foldkit/ui`.
 */
export const shouldClearOnClose = (
  input: Readonly<{ isNullable: boolean; inputValue: string }>,
): boolean => input.isNullable && Str.isEmpty(input.inputValue)

/**
 * True when selecting an already-selected single-select item should deselect
 * it (`isNullable` is true and `wasSelected` is true). Shared by thin painters
 * such as `@foldkit/ui`.
 */
export const shouldDeselectOnSelect = (
  input: Readonly<{ isNullable: boolean; wasSelected: boolean }>,
): boolean => input.isNullable && input.wasSelected

/** Builds the {@link Layers.Layer} entry representing this Combobox popup. */
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

/** The active dismissable layer stack containing this Combobox popup. */
export const layersOf = (props: Props): Layers.Stack =>
  props.layers ?? [layerOf(props)]

/**
 * Places a Combobox popup panel by its input/control anchor using
 * `Placement.place`, applying any `gapPx` and `edgePx` configured in
 * `props.placement`.
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

const fieldPropsOf = (props: Props): FieldDraft.Props => ({
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.isReadOnly === undefined ? {} : { isReadOnly: props.isReadOnly }),
  ...(props.defaultInputValue === undefined
    ? {}
    : { defaultValue: props.defaultInputValue }),
  ...(props.settleMs === undefined ? {} : { settleMs: props.settleMs }),
})

const selectionPropsWithCustom = (
  props: Props,
  selection: Selection.State,
  extraCustomValues: ReadonlyArray<string> = [],
): Selection.Props => {
  const knownValues = Array.map(props.items, item => item.value)
  const customItems: ReadonlyArray<Selection.Item> = allowCustomValueOf(props)
    ? Array.map(
        Array.filter(
          Array.dedupe([
            ...Selection.selectedOf(selection),
            ...extraCustomValues,
          ]),
          value => !Array.contains(knownValues, value),
        ),
        value => ({ value }),
      )
    : []

  return {
    items: [...props.items, ...customItems],
    mode: selectionModeOf(props),
    deselectable: isDeselectableOf(props),
    ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  }
}

const itemCandidateTexts = (item: Item): ReadonlyArray<string> => [
  item.label,
  ...(item.searchText === undefined ? [] : [item.searchText]),
  ...(item.keywords ?? []),
]

const itemPrimarySearchText = (item: Item): string =>
  item.searchText ?? item.label

const listFilterOptionsOf = (props: Props): ListFilter.FilterOptions => ({
  mode: filterModeOf(props),
  ...(props.isCaseSensitive === undefined
    ? {}
    : { isCaseSensitive: props.isCaseSensitive }),
  ...(props.stripDiacritics === undefined
    ? {}
    : { stripDiacritics: props.stripDiacritics }),
})

const itemIndexByValue = (props: Props, value: string): Option.Option<number> =>
  Array.findFirstIndex(props.items, item => item.value === value)

const isItemDisabledByIndex =
  (items: ReadonlyArray<Item>, propsDisabled: boolean) =>
  (index: number): boolean =>
    propsDisabled ||
    Option.exists(Array.get(items, index), item => item.isDisabled === true)

const isEnabledInItems = (
  items: ReadonlyArray<Item>,
  props: Props,
  value: string,
): boolean =>
  !isDisabledOf(props) &&
  Array.some(items, item => item.value === value && item.isDisabled !== true)

const canDismissEscape = (props: Props): boolean =>
  Layers.canDismissOnEscape(layersOf(props), props.id)

const canDismissOutside = (
  props: Props,
  insideIds: ReadonlyArray<string>,
): boolean =>
  Layers.canDismissOnOutsidePress(layersOf(props), props.id, insideIds)

const labelForValue = (props: Pick<Props, 'items'>, value: string): string =>
  Option.match(
    Array.findFirst(props.items, item => item.value === value),
    {
      onNone: () => value,
      onSome: item => item.label,
    },
  )

/**
 * The text the input rests on when closed: empty in `Multiple` mode, or the
 * first selected option's label (or custom value) in `Single` mode.
 */
export const restingInputValueOf = (
  selection: Selection.State,
  props: Pick<Props, 'items' | 'selectionMode'>,
): string => {
  if (isMultipleOf(props)) {
    return ''
  }
  return Option.match(Selection.firstSelectedOf(selection, props), {
    onNone: () =>
      Option.match(Selection.firstSelectedOf(selection), {
        onNone: () => '',
        onSome: value => labelForValue(props, value),
      }),
    onSome: value => labelForValue(props, value),
  })
}

const originalIndexOrder: Order.Order<ListFilter.RankedItem<Item>> = (
  left,
  right,
) => (left.index < right.index ? -1 : left.index > right.index ? 1 : 0)

const rankedForFilter = (
  filter: ListFilter.State,
  props: Props,
): ReadonlyArray<ListFilter.RankedItem<Item>> => {
  const mode = filterModeOf(props)
  const filterOpts = listFilterOptionsOf(props)
  if (!filterEnabledOf(props) || !ListFilter.isFiltering(filter)) {
    return Array.map(props.items, (item, index) => ({
      item,
      index,
      match: {
        mode,
        score: 0,
        ranges: [],
        isExact: false,
      },
      matchedFieldIndex: 0,
    }))
  }

  const query = ListFilter.queryOf(filter)
  const ranked = ListFilter.rankItems({
    items: props.items,
    query,
    textOf: itemCandidateTexts,
    ...filterOpts,
  })
  if (sortFilteredByScoreOf(props)) {
    return ranked
  } else {
    return Array.sort(ranked, originalIndexOrder)
  }
}

const visibleItemsForFilter = (
  filter: ListFilter.State,
  props: Props,
): ReadonlyArray<Item> =>
  Array.map(rankedForFilter(filter, props), entry => entry.item)

const firstEnabledValueIn = (
  items: ReadonlyArray<Item>,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(
    RovingFocus.firstEnabled(
      items.length,
      isItemDisabledByIndex(items, isDisabledOf(props)),
    ),
    index => Option.map(Array.get(items, index), item => item.value),
  )

const lastEnabledValueIn = (
  items: ReadonlyArray<Item>,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(
    RovingFocus.lastEnabled(
      items.length,
      isItemDisabledByIndex(items, isDisabledOf(props)),
    ),
    index => Option.map(Array.get(items, index), item => item.value),
  )

const firstSelectedEnabledIn = (
  selection: Selection.State,
  items: ReadonlyArray<Item>,
  props: Props,
): Option.Option<string> =>
  Option.map(
    Array.findFirst(
      items,
      item =>
        Selection.isSelected(selection, item.value) &&
        !isDisabledOf(props) &&
        item.isDisabled !== true,
    ),
    item => item.value,
  )

const stepVisibleValue = (
  items: ReadonlyArray<Item>,
  props: Props,
  maybeCurrentValue: Option.Option<string>,
  move: RovingFocus.Move,
): Option.Option<string> => {
  const maybeCurrentIndex = Option.flatMap(maybeCurrentValue, value =>
    Array.findFirstIndex(items, item => item.value === value),
  )
  return Option.flatMap(
    RovingFocus.stepEnabled({
      count: items.length,
      current: maybeCurrentIndex,
      move,
      isDisabled: isItemDisabledByIndex(items, isDisabledOf(props)),
      loop: loopOf(props),
    }),
    index => Option.map(Array.get(items, index), item => item.value),
  )
}

const filterForOpening = (state: Closed, props: Props): ListFilter.State => {
  const mode = filterModeOf(props)
  const draft = FieldDraft.draftOf(state.field)
  const resting = restingInputValueOf(state.selection, props)
  if (FieldDraft.isDirty(state.field) && draft !== resting) {
    return ListFilter.initialWith({ query: draft, mode })
  } else {
    return ListFilter.Unfiltered({ mode })
  }
}

const activeValueForInput = (
  filter: ListFilter.State,
  props: Props,
  maybePreviousActive: Option.Option<string>,
): Option.Option<string> => {
  const visible = visibleItemsForFilter(filter, props)
  const behavior = inputBehaviorOf(props)
  if (behavior === 'None') {
    return Option.filter(maybePreviousActive, value =>
      isEnabledInItems(visible, props, value),
    )
  }

  if (filterEnabledOf(props)) {
    return firstEnabledValueIn(visible, props)
  } else {
    const query = ListFilter.queryOf(filter)
    if (Str.isEmpty(query)) {
      return Option.none()
    }
    return Option.flatMap(
      Typeahead.match({
        items: visible,
        query,
        maybeActiveIndex: Option.none(),
        isDisabled: isItemDisabledByIndex(visible, isDisabledOf(props)),
        textOf: itemPrimarySearchText,
        isRefinement: true,
      }),
      index => Option.map(Array.get(visible, index), item => item.value),
    )
  }
}

const exactEnabledMatchValue = (
  query: string,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(
    ListFilter.findExactMatch({
      items: props.items,
      query,
      textOf: itemCandidateTexts,
      ...(props.isCaseSensitive === undefined
        ? {}
        : { isCaseSensitive: props.isCaseSensitive }),
      ...(props.stripDiacritics === undefined
        ? {}
        : { stripDiacritics: props.stripDiacritics }),
    }),
    ({ item }) =>
      !isDisabledOf(props) && item.isDisabled !== true
        ? Option.some(item.value)
        : Option.none(),
  )

const transitionField = (
  field: FieldDraft.State,
  message: FieldDraft.Message,
  props: Props,
): FieldDraft.State =>
  FieldDraft.chart.transition(field, message, fieldPropsOf(props))[0]

type CloseReason = 'Escape' | 'Close' | 'Blur' | 'OutsidePress'

const closeWithReason = (
  state: State,
  props: Props,
  reason: CloseReason,
): Closed => {
  const draft = FieldDraft.draftOf(state.field)
  const isBlurLike = reason === 'Blur' || reason === 'OutsidePress'

  if (allowCustomValueOf(props) && isBlurLike) {
    if (Str.isEmpty(draft)) {
      const nextSelection = isNullableOf(props)
        ? Selection.clear(
            state.selection,
            selectionPropsWithCustom(props, state.selection),
          )
        : state.selection
      const nextText = isNullableOf(props)
        ? ''
        : restingInputValueOf(nextSelection, props)
      return Closed({
        selection: nextSelection,
        field: FieldDraft.Idle({ value: nextText }),
      })
    } else if (!isMultipleOf(props)) {
      const targetValue = Option.getOrElse(
        exactEnabledMatchValue(draft, props),
        () => draft,
      )
      const nextSelection = Selection.select(
        state.selection,
        targetValue,
        selectionPropsWithCustom(props, state.selection, [targetValue]),
      )
      return Closed({
        selection: nextSelection,
        field: FieldDraft.Idle({ value: labelForValue(props, targetValue) }),
      })
    } else {
      return Closed({
        selection: state.selection,
        field: FieldDraft.Idle({ value: draft }),
      })
    }
  }

  if (
    shouldClearOnClose({
      isNullable: isNullableOf(props),
      inputValue: draft,
    }) &&
    !Selection.isEmpty(state.selection)
  ) {
    return Closed({
      selection: Selection.clear(
        state.selection,
        selectionPropsWithCustom(props, state.selection),
      ),
      field: FieldDraft.Idle({ value: '' }),
    })
  }

  return Closed({
    selection: state.selection,
    field: FieldDraft.Idle({
      value: restingInputValueOf(state.selection, props),
    }),
  })
}

const applySelectionValue = (
  state: State,
  props: Props,
  value: string,
  options: Readonly<{
    isCustom?: boolean
    keepOpenWhenAlreadyOpen?: boolean
  }> = {},
): State => {
  const selProps = selectionPropsWithCustom(
    props,
    state.selection,
    options.isCustom === true ? [value] : [],
  )
  const nextSelection = Selection.toggle(state.selection, value, selProps)
  const behavior = selectionBehaviorOf(props)
  const shouldClose =
    state._tag === 'Closed' ||
    (options.keepOpenWhenAlreadyOpen !== true && closeOnSelectOf(props))

  const nextText =
    behavior === 'Clear'
      ? ''
      : behavior === 'Replace'
        ? restingInputValueOf(nextSelection, props)
        : FieldDraft.draftOf(state.field)

  if (shouldClose) {
    return Closed({
      selection: nextSelection,
      field: FieldDraft.Idle({ value: nextText }),
    })
  }

  const nextFilter =
    behavior === 'Preserve' && state._tag === 'Open'
      ? state.filter
      : ListFilter.Unfiltered({ mode: filterModeOf(props) })

  const nextField = FieldDraft.Editing({
    value: restingInputValueOf(nextSelection, props),
    draft: nextText,
  })

  return Open({
    selection: nextSelection,
    field: nextField,
    filter: nextFilter,
    maybeActiveValue: Option.some(value),
    activationTrigger:
      state._tag === 'Open' ? state.activationTrigger : 'Keyboard',
    maybeLastPointerPosition:
      state._tag === 'Open' ? state.maybeLastPointerPosition : Option.none(),
  })
}

const removeLastSelected = (
  state: State,
  props: Props,
): Option.Option<State> => {
  const values = Selection.selectedOf(state.selection)
  return Option.flatMap(Array.last(values), lastValue => {
    const nextSelection = Selection.deselect(
      state.selection,
      lastValue,
      selectionPropsWithCustom(props, state.selection),
    )
    if (nextSelection === state.selection) {
      return Option.none()
    }
    if (state._tag === 'Closed') {
      return Option.some(
        Closed({
          selection: nextSelection,
          field: state.field,
        }),
      )
    } else {
      return Option.some(
        Open({
          ...state,
          selection: nextSelection,
        }),
      )
    }
  })
}

const openRovingMoveOf = (
  props: Props,
  message: typeof PressedComboboxKey.Type,
): Option.Option<RovingFocus.Move> => {
  const hasModifier =
    message.isShift === true ||
    message.isMeta === true ||
    message.isControl === true
  if ((message.key === 'Home' || message.key === 'End') && hasModifier) {
    return Option.none()
  }
  return RovingFocus.moveOfKey(message.key, {
    orientation: 'Vertical',
    pageKeys: pageKeysOf(props),
  })
}

const openFrom = (
  state: Open,
  updates: Partial<
    Readonly<{
      selection: Selection.State
      field: FieldDraft.State
      filter: ListFilter.State
      maybeActiveValue: Option.Option<string>
      activationTrigger: ActivationTrigger
      maybeLastPointerPosition: Option.Option<PointerPosition>
    }>
  > = {},
): Open =>
  Open({
    selection: updates.selection ?? state.selection,
    field: updates.field ?? state.field,
    filter: updates.filter ?? state.filter,
    maybeActiveValue: updates.maybeActiveValue ?? state.maybeActiveValue,
    activationTrigger: updates.activationTrigger ?? state.activationTrigger,
    maybeLastPointerPosition:
      updates.maybeLastPointerPosition ?? state.maybeLastPointerPosition,
  })

const applyOpenHighlight = (
  state: Open,
  props: Props,
  nextValue: string,
): Open => {
  const nextField =
    inputBehaviorOf(props) === 'AutoComplete'
      ? FieldDraft.Editing({
          value: FieldDraft.valueOf(state.field),
          draft: labelForValue(props, nextValue),
        })
      : state.field
  const nextSelection = immediateOf(props)
    ? Selection.toggle(
        state.selection,
        nextValue,
        selectionPropsWithCustom(props, state.selection),
      )
    : state.selection
  return openFrom(state, {
    selection: nextSelection,
    field: nextField,
    maybeActiveValue: Option.some(nextValue),
    activationTrigger: 'Keyboard',
  })
}

// READINGS

/** True when the combobox popup is open. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** True when the combobox popup is closed. */
export const isClosed = (state: State): boolean => state._tag === 'Closed'

/** The live text currently displayed in the combobox input. */
export const inputValueOf = (state: State): string =>
  FieldDraft.draftOf(state.field)

/** The committed resting text held by the combobox input's `FieldDraft`. */
export const committedInputValueOf = (state: State): string =>
  FieldDraft.valueOf(state.field)

/** True when the displayed input text is empty (`''`). */
export const isInputEmpty = (state: State): boolean =>
  FieldDraft.isEmpty(state.field)

/** True when the input is actively being edited with text differing from its committed value. */
export const isInputDirty = (state: State): boolean =>
  FieldDraft.isDirty(state.field)

/** The active filter query while open (`''` while closed or unfiltered). */
export const filterQueryOf = (state: State): string =>
  state._tag === 'Open' ? ListFilter.queryOf(state.filter) : ''

/** True while the popup is open and actively filtering options by a non-empty query. */
export const isFiltering = (state: State): boolean =>
  state._tag === 'Open' && ListFilter.isFiltering(state.filter)

/** All currently selected option values in order. */
export const selectedValuesOf = (state: State): ReadonlyArray<string> =>
  Selection.selectedOf(state.selection)

/** The first selected option value (in `props.items` order when `props` is given), or none. */
export const firstSelectedValueOf = (
  state: State,
  props?: Pick<Props, 'items'>,
): Option.Option<string> =>
  Option.orElse(Selection.firstSelectedOf(state.selection, props), () =>
    Selection.firstSelectedOf(state.selection),
  )

/** All currently selected option items present in `props.items`, in `props.items` order. */
export const selectedOptionsOf = (
  state: State,
  props: Pick<Props, 'items'>,
): ReadonlyArray<Item> =>
  Array.filter(props.items, item =>
    Selection.isSelected(state.selection, item.value),
  )

/**
 * Human-readable label derived from the selected options (falling back to the
 * raw value for custom entries when `allowCustomValue` is used), joined by
 * `separator` (`', '` by default), or `props.placeholder ?? ''` when empty.
 */
export const displayLabelOf = (
  state: State,
  props: Pick<Props, 'items' | 'placeholder'>,
  separator: string = ', ',
): string => {
  const values = selectedValuesOf(state)
  if (Array.isReadonlyArrayEmpty(values)) {
    return props.placeholder ?? ''
  }
  const knownOrder = Array.getSomes(
    Array.map(props.items, item =>
      Selection.isSelected(state.selection, item.value)
        ? Option.some(item.label)
        : Option.none(),
    ),
  )
  const knownValues = Array.map(props.items, item => item.value)
  const customLabels = Array.filter(
    values,
    value => !Array.contains(knownValues, value),
  )
  return Array.join([...knownOrder, ...customLabels], separator)
}

/** Number of currently selected values. */
export const selectedCountOf = (state: State): number =>
  Selection.selectedCountOf(state.selection)

/** True when `value` is currently selected. */
export const isOptionSelected = (state: State, value: string): boolean =>
  Selection.isSelected(state.selection, value)

/** True when no options are currently selected. */
export const isSelectionEmpty = (state: State): boolean =>
  Selection.isEmpty(state.selection)

/** True when the live input text is non-empty and does not exactly match any item in `props.items`. */
export const isCustomValue = (state: State, props: Props): boolean => {
  const text = inputValueOf(state)
  if (
    Str.isEmpty(ListFilter.normalizeQuery(text, listFilterOptionsOf(props)))
  ) {
    return false
  }
  return Option.isNone(
    ListFilter.findExactMatch({
      items: props.items,
      query: text,
      textOf: itemCandidateTexts,
      ...(props.isCaseSensitive === undefined
        ? {}
        : { isCaseSensitive: props.isCaseSensitive }),
      ...(props.stripDiacritics === undefined
        ? {}
        : { stripDiacritics: props.stripDiacritics }),
    }),
  )
}

/**
 * Visible options with `ListFilter` match metadata (`score`, highlight
 * `ranges`, `isExact`, `matchedFieldIndex`). When closed or unfiltered,
 * returns all `props.items` with `score: 0` and empty ranges.
 */
export const rankedItemsOf = (
  state: State,
  props: Props,
): ReadonlyArray<ListFilter.RankedItem<Item>> =>
  state._tag === 'Open'
    ? rankedForFilter(state.filter, props)
    : rankedForFilter(
        ListFilter.Unfiltered({ mode: filterModeOf(props) }),
        props,
      )

/** The currently visible filtered option items. */
export const filteredItemsOf = (
  state: State,
  props: Props,
): ReadonlyArray<Item> =>
  Array.map(rankedItemsOf(state, props), entry => entry.item)

/** High-level `ListFilter.FilterSummary` of the current visible options. */
export const filterSummaryOf = (
  state: State,
  props: Props,
): ListFilter.FilterSummary =>
  ListFilter.summaryOf({
    totalCount: props.items.length,
    query: filterQueryOf(state),
    matches: rankedItemsOf(state, props),
    options: listFilterOptionsOf(props),
  })

/** True when the current filtered option list has zero matching items. */
export const isFilteredEmpty = (state: State, props: Props): boolean =>
  ListFilter.isEmptyResult(filteredItemsOf(state, props))

/** Highlight ranges in `item.label` for the option with `value` when matched against the active query. */
export const matchRangesOf = (
  state: State,
  props: Props,
  value: string,
): ReadonlyArray<ListFilter.MatchRange> =>
  Option.match(
    Array.findFirst(
      rankedItemsOf(state, props),
      entry => entry.item.value === value,
    ),
    {
      onNone: () => [],
      onSome: entry =>
        entry.matchedFieldIndex === 0 ? entry.match.ranges : [],
    },
  )

/** The currently highlighted enabled option's value while open, or none. */
export const activeValueOf = (
  state: State,
  props: Props,
): Option.Option<string> => {
  if (state._tag !== 'Open') {
    return Option.none()
  }
  const visible = filteredItemsOf(state, props)
  return Option.filter(state.maybeActiveValue, value =>
    isEnabledInItems(visible, props, value),
  )
}

/** The currently highlighted option's index inside `filteredItemsOf(state, props)` while open, or none. */
export const activeIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> => {
  const visible = filteredItemsOf(state, props)
  return Option.flatMap(activeValueOf(state, props), value =>
    Array.findFirstIndex(visible, item => item.value === value),
  )
}

/** The currently highlighted option item while open, or none. */
export const activeItemOf = (state: State, props: Props): Option.Option<Item> =>
  Option.flatMap(activeValueOf(state, props), value =>
    Array.findFirst(props.items, item => item.value === value),
  )

/** The element id of the currently highlighted option (`aria-activedescendant`) while open, or none. */
export const activeDescendantIdOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(activeValueOf(state, props), value =>
    Option.map(itemIndexByValue(props, value), index =>
      optionId(props.id, index),
    ),
  )

/** True when the option with `value` is currently highlighted while open. */
export const isOptionActive = (
  state: State,
  props: Props,
  value: string,
): boolean => Option.contains(activeValueOf(state, props), value)

/** True when the option with `value` is disabled (either on the option or via the combobox). */
export const isOptionDisabled = (props: Props, value: string): boolean =>
  isDisabledOf(props) ||
  Option.exists(
    Array.findFirst(props.items, item => item.value === value),
    item => item.isDisabled === true,
  )

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

const enterClosedSelectionEdges = (): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    Closed,
    typeof PressedComboboxKey.Type,
    never,
    Props
  >
> => [
  when(
    (_state, message, context) =>
      message.isComposing !== true &&
      canInteract(context) &&
      openOnKeyPressOf(context) &&
      message.key === 'ArrowDown',
    'Open',
    ({ state, message, context }) => {
      const nextFilter = filterForOpening(state, context)
      const visible = visibleItemsForFilter(nextFilter, context)
      const maybeActiveValue =
        message.isAlt === true
          ? firstSelectedEnabledIn(state.selection, visible, context)
          : Option.orElse(
              firstSelectedEnabledIn(state.selection, visible, context),
              () => firstEnabledValueIn(visible, context),
            )
      return Open({
        selection: state.selection,
        field: transitionField(state.field, FieldDraft.BeginEdit(), context),
        filter: nextFilter,
        maybeActiveValue,
        activationTrigger: 'Keyboard',
        maybeLastPointerPosition: Option.none(),
      })
    },
  ),
  when(
    (_state, message, context) =>
      message.isComposing !== true &&
      canInteract(context) &&
      openOnKeyPressOf(context) &&
      message.key === 'ArrowUp',
    'Open',
    ({ state, context }) => {
      const nextFilter = filterForOpening(state, context)
      const visible = visibleItemsForFilter(nextFilter, context)
      const maybeActiveValue = Option.orElse(
        firstSelectedEnabledIn(state.selection, visible, context),
        () => lastEnabledValueIn(visible, context),
      )
      return Open({
        selection: state.selection,
        field: transitionField(state.field, FieldDraft.BeginEdit(), context),
        filter: nextFilter,
        maybeActiveValue,
        activationTrigger: 'Keyboard',
        maybeLastPointerPosition: Option.none(),
      })
    },
  ),
  when(
    (state, message, context) =>
      message.isComposing !== true &&
      message.key === 'Escape' &&
      !allowCustomValueOf(context) &&
      inputValueOf(state) !== restingInputValueOf(state.selection, context),
    'Closed',
    ({ state, context }) =>
      Closed({
        selection: state.selection,
        field: FieldDraft.Idle({
          value: restingInputValueOf(state.selection, context),
        }),
      }),
  ),
  when(
    (state, message, context) => {
      if (
        message.isComposing === true ||
        !canInteract(context) ||
        message.key !== 'Enter'
      ) {
        return Option.none()
      }
      const draft = inputValueOf(state)
      const maybeExact = exactEnabledMatchValue(draft, context)
      if (Option.isSome(maybeExact)) {
        return Option.some(
          applySelectionValue(state, context, maybeExact.value),
        )
      } else if (allowCustomValueOf(context) && Str.isNonEmpty(draft)) {
        return Option.some(
          applySelectionValue(state, context, draft, { isCustom: true }),
        )
      } else if (
        isNullableOf(context) &&
        Str.isEmpty(draft) &&
        !Selection.isEmpty(state.selection)
      ) {
        return Option.some(
          Closed({
            selection: Selection.clear(
              state.selection,
              selectionPropsWithCustom(context, state.selection),
            ),
            field: FieldDraft.Idle({ value: '' }),
          }),
        )
      } else {
        return Option.none()
      }
    },
    'Closed',
    ({ guardValue }) =>
      guardValue._tag === 'Closed'
        ? guardValue
        : Closed({ selection: guardValue.selection, field: guardValue.field }),
  ),
  when(
    (state, message, context) =>
      message.isComposing !== true &&
      canInteract(context) &&
      message.key === 'Backspace' &&
      isMultipleOf(context) &&
      isInputEmpty(state) &&
      !Selection.isEmpty(state.selection)
        ? removeLastSelected(state, context)
        : Option.none(),
    'Closed',
    ({ guardValue }) =>
      guardValue._tag === 'Closed'
        ? guardValue
        : Closed({ selection: guardValue.selection, field: guardValue.field }),
  ),
  ignore(),
]

const openKeyEdges = (): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    Open,
    typeof PressedComboboxKey.Type,
    never,
    Props
  >
> => [
  when(
    (_state, message, context) =>
      message.isComposing !== true &&
      message.key === 'Escape' &&
      canDismissEscape(context),
    'Closed',
    ({ state, context }) => closeWithReason(state, context, 'Escape'),
  ),
  when(
    (_state, message) =>
      message.isComposing !== true &&
      (message.key === 'Tab' ||
        (message.key === 'ArrowUp' && message.isAlt === true)),
    'Closed',
    ({ state, message, context }) =>
      closeWithReason(state, context, message.key === 'Tab' ? 'Blur' : 'Close'),
  ),
  when(
    (state, message, context) => {
      if (
        message.isComposing === true ||
        !canInteract(context) ||
        message.key !== 'Enter'
      ) {
        return Option.none()
      }
      const maybeActive = activeValueOf(state, context)
      if (Option.isSome(maybeActive)) {
        const next = applySelectionValue(state, context, maybeActive.value)
        return next._tag === 'Closed' ? Option.some(next) : Option.none()
      }
      const draft = inputValueOf(state)
      const maybeExact = exactEnabledMatchValue(draft, context)
      if (Option.isSome(maybeExact)) {
        const next = applySelectionValue(state, context, maybeExact.value)
        return next._tag === 'Closed' ? Option.some(next) : Option.none()
      }
      if (allowCustomValueOf(context) && Str.isNonEmpty(draft)) {
        const next = applySelectionValue(state, context, draft, {
          isCustom: true,
        })
        return next._tag === 'Closed' ? Option.some(next) : Option.none()
      }
      return Option.some(closeWithReason(state, context, 'Blur'))
    },
    'Closed',
    ({ guardValue }) => guardValue,
  ),
  when(
    (state, message, context) => {
      if (
        message.isComposing === true ||
        !canInteract(context) ||
        message.key !== 'Enter'
      ) {
        return Option.none()
      }
      const maybeActive = activeValueOf(state, context)
      if (Option.isSome(maybeActive)) {
        const next = applySelectionValue(state, context, maybeActive.value)
        return next._tag === 'Open' ? Option.some(next) : Option.none()
      }
      const draft = inputValueOf(state)
      const maybeExact = exactEnabledMatchValue(draft, context)
      if (Option.isSome(maybeExact)) {
        const next = applySelectionValue(state, context, maybeExact.value)
        return next._tag === 'Open' ? Option.some(next) : Option.none()
      }
      if (allowCustomValueOf(context) && Str.isNonEmpty(draft)) {
        const next = applySelectionValue(state, context, draft, {
          isCustom: true,
        })
        return next._tag === 'Open' ? Option.some(next) : Option.none()
      }
      return Option.none()
    },
    'Open',
    ({ guardValue }) => guardValue,
  ),
  when(
    (state, message, context) =>
      message.isComposing !== true &&
      canInteract(context) &&
      message.key === 'Backspace' &&
      isMultipleOf(context) &&
      isInputEmpty(state) &&
      !Selection.isEmpty(state.selection)
        ? removeLastSelected(state, context)
        : Option.none(),
    'Open',
    ({ state, guardValue }) =>
      guardValue._tag === 'Open'
        ? guardValue
        : openFrom(state, { selection: guardValue.selection }),
  ),
  when(
    (state, message, context) =>
      message.isComposing === true || isDisabledOf(context)
        ? Option.none()
        : Option.flatMap(openRovingMoveOf(context, message), move =>
            stepVisibleValue(
              filteredItemsOf(state, context),
              context,
              activeValueOf(state, context),
              move,
            ),
          ),
    'Open',
    ({ state, guardValue, context }) =>
      applyOpenHighlight(state, context, guardValue),
  ),
  ignore(),
]

// CHART

/**
 * Builds the Combobox Machine chart starting in `initialState`: `Closed` and
 * `Open` popup states, live filtering via `ListFilter`, single and multiple
 * selection via `Selection`, input draft management via `FieldDraft`, roving
 * keyboard highlight via `RovingFocus`, non-filtering prefix matching via
 * `Typeahead`, outside and Escape dismissal via `Layers`, `allowCustomValue`
 * and `nullable` support, Backspace removal of the last selection in multiple
 * mode, pointer hover deduplication, disabled/readOnly guards, reconciliation,
 * and reset.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Closed: {
        on: {
          OpenCombobox: [
            when(
              (_state, _message, context) => canInteract(context),
              'Open',
              ({ state, context }) => {
                const nextFilter = filterForOpening(state, context)
                const visible = visibleItemsForFilter(nextFilter, context)
                return Open({
                  selection: state.selection,
                  field: transitionField(
                    state.field,
                    FieldDraft.BeginEdit(),
                    context,
                  ),
                  filter: nextFilter,
                  maybeActiveValue: firstSelectedEnabledIn(
                    state.selection,
                    visible,
                    context,
                  ),
                  activationTrigger: 'Pointer',
                  maybeLastPointerPosition: Option.none(),
                })
              },
            ),
            ignore(),
          ],
          ToggleCombobox: [
            when(
              (_state, _message, context) => canInteract(context),
              'Open',
              ({ state, context }) => {
                const nextFilter = filterForOpening(state, context)
                const visible = visibleItemsForFilter(nextFilter, context)
                return Open({
                  selection: state.selection,
                  field: transitionField(
                    state.field,
                    FieldDraft.BeginEdit(),
                    context,
                  ),
                  filter: nextFilter,
                  maybeActiveValue: firstSelectedEnabledIn(
                    state.selection,
                    visible,
                    context,
                  ),
                  activationTrigger: 'Pointer',
                  maybeLastPointerPosition: Option.none(),
                })
              },
            ),
            ignore(),
          ],
          FocusComboboxInput: [
            when(
              (_state, _message, context) =>
                canInteract(context) && openOnFocusOf(context),
              'Open',
              ({ state, context }) => {
                const nextFilter = filterForOpening(state, context)
                const visible = visibleItemsForFilter(nextFilter, context)
                return Open({
                  selection: state.selection,
                  field: transitionField(
                    state.field,
                    FieldDraft.BeginEdit(),
                    context,
                  ),
                  filter: nextFilter,
                  maybeActiveValue: firstSelectedEnabledIn(
                    state.selection,
                    visible,
                    context,
                  ),
                  activationTrigger: 'Keyboard',
                  maybeLastPointerPosition: Option.none(),
                })
              },
            ),
            when(
              (_state, _message, context) => canInteract(context),
              'Closed',
              ({ state, context }) =>
                Closed({
                  selection: state.selection,
                  field: transitionField(
                    state.field,
                    FieldDraft.BeginEdit(),
                    context,
                  ),
                }),
            ),
            ignore(),
          ],
          ClickComboboxInput: [
            when(
              (_state, _message, context) =>
                canInteract(context) && openOnClickOf(context),
              'Open',
              ({ state, context }) => {
                const nextFilter = filterForOpening(state, context)
                const visible = visibleItemsForFilter(nextFilter, context)
                return Open({
                  selection: state.selection,
                  field: transitionField(
                    state.field,
                    FieldDraft.BeginEdit(),
                    context,
                  ),
                  filter: nextFilter,
                  maybeActiveValue: firstSelectedEnabledIn(
                    state.selection,
                    visible,
                    context,
                  ),
                  activationTrigger: 'Pointer',
                  maybeLastPointerPosition: Option.none(),
                })
              },
            ),
            ignore(),
          ],
          BlurComboboxInput: [
            when(
              state => FieldDraft.isEditing(state.field),
              'Closed',
              ({ state, context }) => closeWithReason(state, context, 'Blur'),
            ),
            ignore(),
          ],
          ChangeComboboxInput: [
            when(
              (_state, _message, context) =>
                canInteract(context) && openOnInputOf(context),
              'Open',
              ({ state, message, context }) => {
                const nextField = transitionField(
                  state.field,
                  FieldDraft.ChangeDraft({ value: message.value }),
                  context,
                )
                const nextFilter = ListFilter.initialWith({
                  query: FieldDraft.draftOf(nextField),
                  mode: filterModeOf(context),
                })
                return Open({
                  selection: state.selection,
                  field: nextField,
                  filter: nextFilter,
                  maybeActiveValue: activeValueForInput(
                    nextFilter,
                    context,
                    Option.none(),
                  ),
                  activationTrigger: 'Keyboard',
                  maybeLastPointerPosition: Option.none(),
                })
              },
            ),
            when(
              (_state, _message, context) => canInteract(context),
              'Closed',
              ({ state, message, context }) =>
                Closed({
                  selection: state.selection,
                  field: transitionField(
                    state.field,
                    FieldDraft.ChangeDraft({ value: message.value }),
                    context,
                  ),
                }),
            ),
            ignore(),
          ],
          SelectComboboxOption: [
            when(
              (_state, message, context) =>
                canInteract(context) &&
                (isEnabledInItems(context.items, context, message.value) ||
                  allowCustomValueOf(context)),
              'Closed',
              ({ state, message, context }) => {
                const isCustom = !isEnabledInItems(
                  context.items,
                  context,
                  message.value,
                )
                const next = applySelectionValue(
                  state,
                  context,
                  message.value,
                  {
                    isCustom,
                  },
                )
                return next._tag === 'Closed'
                  ? next
                  : Closed({ selection: next.selection, field: next.field })
              },
            ),
            ignore(),
          ],
          RemoveComboboxValue: [
            when(
              (state, message, context) => {
                if (!canInteract(context)) {
                  return Option.none()
                }
                const next = Selection.deselect(
                  state.selection,
                  message.value,
                  selectionPropsWithCustom(context, state.selection),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Closed',
              ({ state, guardValue, context }) =>
                Closed({
                  selection: guardValue,
                  field: isMultipleOf(context)
                    ? state.field
                    : FieldDraft.Idle({
                        value: restingInputValueOf(guardValue, context),
                      }),
                }),
            ),
            ignore(),
          ],
          ClearCombobox: [
            when(
              (state, _message, context) =>
                canInteract(context) &&
                ((!Selection.isEmpty(state.selection) &&
                  isDeselectableOf(context)) ||
                  !isInputEmpty(state)),
              'Closed',
              ({ state, context }) =>
                Closed({
                  selection: Selection.clear(
                    state.selection,
                    selectionPropsWithCustom(context, state.selection),
                  ),
                  field: FieldDraft.Idle({ value: '' }),
                }),
            ),
            ignore(),
          ],
          PressedComboboxKey: enterClosedSelectionEdges(),
          ReplaceComboboxValue: [
            when(
              (state, message, context) => {
                const nextSelection = Selection.replace(
                  state.selection,
                  message.values,
                  selectionPropsWithCustom(
                    context,
                    state.selection,
                    message.values,
                  ),
                )
                return nextSelection === state.selection
                  ? Option.none()
                  : Option.some(nextSelection)
              },
              'Closed',
              ({ guardValue, context }) =>
                Closed({
                  selection: guardValue,
                  field: FieldDraft.Idle({
                    value: restingInputValueOf(guardValue, context),
                  }),
                }),
            ),
            ignore(),
          ],
          SetComboboxInputValue: to('Closed', ({ state, message, context }) =>
            Closed({
              selection: state.selection,
              field: transitionField(
                state.field,
                FieldDraft.SetFieldValue({ value: message.value, force: true }),
                context,
              ),
            }),
          ),
          ReconcileComboboxItems: [
            when(
              (state, _message, context) => {
                const nextSelection = Selection.reconcile(
                  state.selection,
                  selectionPropsWithCustom(context, state.selection),
                )
                return nextSelection === state.selection
                  ? Option.none()
                  : Option.some(nextSelection)
              },
              'Closed',
              ({ guardValue, context }) =>
                Closed({
                  selection: guardValue,
                  field: FieldDraft.Idle({
                    value: restingInputValueOf(guardValue, context),
                  }),
                }),
            ),
            ignore(),
          ],
          ResetCombobox: to('Closed', ({ state, context }) => {
            const defaults = context.defaultValue ?? []
            const nextSelection = Selection.replace(
              state.selection,
              defaults,
              selectionPropsWithCustom(context, state.selection, defaults),
            )
            const nextText =
              context.defaultInputValue ??
              restingInputValueOf(nextSelection, context)
            return Closed({
              selection: nextSelection,
              field: FieldDraft.Idle({ value: nextText }),
            })
          }),
        },
      },
      Open: {
        on: {
          CloseCombobox: to('Closed', ({ state, context }) =>
            closeWithReason(state, context, 'Close'),
          ),
          ToggleCombobox: to('Closed', ({ state, context }) =>
            closeWithReason(state, context, 'Close'),
          ),
          DismissCombobox: [
            when(
              (_state, _message, context) => canDismissOutside(context, []),
              'Closed',
              ({ state, context }) =>
                closeWithReason(state, context, 'OutsidePress'),
            ),
            ignore(),
          ],
          PressedOutsideCombobox: [
            when(
              (_state, message, context) =>
                canDismissOutside(context, message.insideIds),
              'Closed',
              ({ state, context }) =>
                closeWithReason(state, context, 'OutsidePress'),
            ),
            ignore(),
          ],
          BlurComboboxInput: to('Closed', ({ state, context }) =>
            closeWithReason(state, context, 'Blur'),
          ),
          ChangeComboboxInput: [
            when(
              (_state, _message, context) => canInteract(context),
              'Open',
              ({ state, message, context }) => {
                const nextField = transitionField(
                  state.field,
                  FieldDraft.ChangeDraft({ value: message.value }),
                  context,
                )
                const nextFilter = ListFilter.initialWith({
                  query: FieldDraft.draftOf(nextField),
                  mode: filterModeOf(context),
                })
                return openFrom(state, {
                  field: nextField,
                  filter: nextFilter,
                  maybeActiveValue: activeValueForInput(
                    nextFilter,
                    context,
                    state.maybeActiveValue,
                  ),
                  activationTrigger: 'Keyboard',
                })
              },
            ),
            ignore(),
          ],
          SelectComboboxOption: [
            when(
              (state, message, context) => {
                if (
                  !canInteract(context) ||
                  (!isEnabledInItems(context.items, context, message.value) &&
                    !allowCustomValueOf(context))
                ) {
                  return Option.none()
                }
                const isCustom = !isEnabledInItems(
                  context.items,
                  context,
                  message.value,
                )
                const next = applySelectionValue(
                  state,
                  context,
                  message.value,
                  {
                    isCustom,
                  },
                )
                return next._tag === 'Closed'
                  ? Option.some(next)
                  : Option.none()
              },
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) => {
                if (
                  !canInteract(context) ||
                  (!isEnabledInItems(context.items, context, message.value) &&
                    !allowCustomValueOf(context))
                ) {
                  return Option.none()
                }
                const isCustom = !isEnabledInItems(
                  context.items,
                  context,
                  message.value,
                )
                const next = applySelectionValue(
                  state,
                  context,
                  message.value,
                  {
                    isCustom,
                  },
                )
                return next._tag === 'Open' ? Option.some(next) : Option.none()
              },
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          RemoveComboboxValue: [
            when(
              (state, message, context) => {
                if (!canInteract(context)) {
                  return Option.none()
                }
                const next = Selection.deselect(
                  state.selection,
                  message.value,
                  selectionPropsWithCustom(context, state.selection),
                )
                return next === state.selection
                  ? Option.none()
                  : Option.some(next)
              },
              'Open',
              ({ state, guardValue, context }) =>
                openFrom(state, {
                  selection: guardValue,
                  field: isMultipleOf(context)
                    ? state.field
                    : FieldDraft.Editing({
                        value: restingInputValueOf(guardValue, context),
                        draft: restingInputValueOf(guardValue, context),
                      }),
                }),
            ),
            ignore(),
          ],
          ClearCombobox: [
            when(
              (state, _message, context) =>
                canInteract(context) &&
                ((!Selection.isEmpty(state.selection) &&
                  isDeselectableOf(context)) ||
                  !isInputEmpty(state)),
              'Open',
              ({ state, context }) =>
                openFrom(state, {
                  selection: Selection.clear(
                    state.selection,
                    selectionPropsWithCustom(context, state.selection),
                  ),
                  field: FieldDraft.Editing({ value: '', draft: '' }),
                  filter: ListFilter.Unfiltered({
                    mode: filterModeOf(context),
                  }),
                  maybeActiveValue: Option.none(),
                }),
            ),
            ignore(),
          ],
          PressedComboboxKey: openKeyEdges(),
          MovedComboboxHighlight: [
            when(
              (state, message, context) =>
                isDisabledOf(context)
                  ? Option.none()
                  : stepVisibleValue(
                      filteredItemsOf(state, context),
                      context,
                      activeValueOf(state, context),
                      message.move,
                    ),
              'Open',
              ({ state, guardValue, context }) =>
                applyOpenHighlight(state, context, guardValue),
            ),
            ignore(),
          ],
          HighlightedComboboxItem: [
            when(
              (state, message, context) =>
                isEnabledInItems(
                  filteredItemsOf(state, context),
                  context,
                  message.value,
                ),
              'Open',
              ({ state, message }) =>
                openFrom(state, {
                  maybeActiveValue: Option.some(message.value),
                  activationTrigger: message.activationTrigger,
                }),
            ),
            ignore(),
          ],
          MovedPointerOverComboboxItem: [
            when(
              (state, message, context) =>
                isEnabledInItems(
                  filteredItemsOf(state, context),
                  context,
                  message.value,
                ) &&
                !isSamePointerPosition(state.maybeLastPointerPosition, {
                  screenX: message.screenX,
                  screenY: message.screenY,
                }),
              'Open',
              ({ state, message }) =>
                openFrom(state, {
                  maybeActiveValue: Option.some(message.value),
                  activationTrigger: 'Pointer',
                  maybeLastPointerPosition: Option.some({
                    screenX: message.screenX,
                    screenY: message.screenY,
                  }),
                }),
            ),
            ignore(),
          ],
          LeftComboboxItem: [
            when(
              state =>
                shouldDeactivateOnLeave(state.activationTrigger) &&
                Option.isSome(state.maybeActiveValue),
              'Open',
              ({ state }) =>
                openFrom(state, { maybeActiveValue: Option.none() }),
            ),
            ignore(),
          ],
          ReplaceComboboxValue: [
            when(
              (state, message, context) => {
                const nextSelection = Selection.replace(
                  state.selection,
                  message.values,
                  selectionPropsWithCustom(
                    context,
                    state.selection,
                    message.values,
                  ),
                )
                return nextSelection === state.selection
                  ? Option.none()
                  : Option.some(nextSelection)
              },
              'Open',
              ({ state, guardValue }) =>
                openFrom(state, { selection: guardValue }),
            ),
            ignore(),
          ],
          SetComboboxInputValue: to('Open', ({ state, message, context }) => {
            const nextField = transitionField(
              state.field,
              FieldDraft.SetFieldValue({ value: message.value, force: true }),
              context,
            )
            const nextFilter = ListFilter.initialWith({
              query: FieldDraft.draftOf(nextField),
              mode: filterModeOf(context),
            })
            return openFrom(state, {
              field: nextField,
              filter: nextFilter,
              maybeActiveValue: activeValueForInput(
                nextFilter,
                context,
                state.maybeActiveValue,
              ),
            })
          }),
          ReconcileComboboxItems: [
            when(
              (state, _message, context) => {
                const nextSelection = Selection.reconcile(
                  state.selection,
                  selectionPropsWithCustom(context, state.selection),
                )
                const nextActiveValue = activeValueOf(state, context)
                const selectionChanged = nextSelection !== state.selection
                const activeChanged =
                  Option.getOrUndefined(nextActiveValue) !==
                  Option.getOrUndefined(state.maybeActiveValue)
                return selectionChanged || activeChanged
                  ? Option.some({ nextSelection, nextActiveValue })
                  : Option.none()
              },
              'Open',
              ({ state, guardValue }) =>
                openFrom(state, {
                  selection: guardValue.nextSelection,
                  maybeActiveValue: guardValue.nextActiveValue,
                }),
            ),
            ignore(),
          ],
          ResetCombobox: to('Closed', ({ state, context }) => {
            const defaults = context.defaultValue ?? []
            const nextSelection = Selection.replace(
              state.selection,
              defaults,
              selectionPropsWithCustom(context, state.selection, defaults),
            )
            const nextText =
              context.defaultInputValue ??
              restingInputValueOf(nextSelection, context)
            return Closed({
              selection: nextSelection,
              field: FieldDraft.Idle({ value: nextText }),
            })
          }),
        },
      },
    },
  })

/** The default Combobox Machine chart starting in `Closed` with empty selection and empty field. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the Combobox sync table using `Pace.Settled({ afterMs })` on
 * `ChangeComboboxInput` (typing syncs on pauses, never waiting for blur) and
 * `Pace.Synced()` on discrete actions and facts.
 *
 * @example
 * ```typescript
 * syncOf(200).ChangeComboboxInput // Settled({ afterMs: 200 })
 * syncOf(200).SelectComboboxOption // Synced()
 * ```
 */
export const syncOf = (
  settleMs: number = defaultSettleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenCombobox: Synced(),
  CloseCombobox: Synced(),
  ToggleCombobox: Synced(),
  DismissCombobox: Synced(),
  ChangeComboboxInput: Settled({ afterMs: settleMs }),
  SelectComboboxOption: Synced(),
  RemoveComboboxValue: Synced(),
  ClearCombobox: Synced(),
  FocusComboboxInput: Synced(),
  ClickComboboxInput: Synced(),
  BlurComboboxInput: Synced(),
  PressedComboboxKey: Synced(),
  MovedComboboxHighlight: Synced(),
  HighlightedComboboxItem: Synced(),
  MovedPointerOverComboboxItem: Synced(),
  LeftComboboxItem: Synced(),
  PressedOutsideCombobox: Synced(),
  ReplaceComboboxValue: Synced(),
  SetComboboxInputValue: Synced(),
  ReconcileComboboxItems: Synced(),
  ResetCombobox: Synced(),
})

/** Default synchronization: `ChangeComboboxInput` at `Pace.Settled({ afterMs: 200 })`, all discrete messages at `Pace.Synced()`. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a Combobox kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenCombobox: Device({ because }),
  CloseCombobox: Device({ because }),
  ToggleCombobox: Device({ because }),
  DismissCombobox: Device({ because }),
  ChangeComboboxInput: Device({ because }),
  SelectComboboxOption: Device({ because }),
  RemoveComboboxValue: Device({ because }),
  ClearCombobox: Device({ because }),
  FocusComboboxInput: Device({ because }),
  ClickComboboxInput: Device({ because }),
  BlurComboboxInput: Device({ because }),
  PressedComboboxKey: Device({ because }),
  MovedComboboxHighlight: Device({ because }),
  HighlightedComboboxItem: Device({ because }),
  MovedPointerOverComboboxItem: Device({ because }),
  LeftComboboxItem: Device({ because }),
  PressedOutsideCombobox: Device({ because }),
  ReplaceComboboxValue: Device({ because }),
  SetComboboxInputValue: Device({ because }),
  ReconcileComboboxItems: Device({ because }),
  ResetCombobox: Device({ because }),
})

/** Returns the {@link Sync} pace for one Combobox Message under `settleMs`. */
export const paceOf = (
  message: Message,
  settleMs: number = defaultSettleMs,
): Sync => syncOf(settleMs)[message._tag]

// SLOTS & PROJECTION

/**
 * The painted slots of a Combobox Part:
 * - `Input`: combobox text input (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-haspopup="listbox"`, disabled/readOnly/required/invalid/labelledBy/describedBy).
 * - `Trigger`: toggle button (`role="button"`, `aria-expanded`, `aria-controls`, `ToggleCombobox`).
 * - `Content`: popup listbox container (`role="listbox"`, `aria-multiselectable`, `hidden` when closed).
 * - `Option`: one selectable option (`role="option"`, `aria-selected`, `aria-current`, `aria-disabled`, `SelectComboboxOption`).
 * - `Label`: field label (`id: labelId(id)`).
 * - `Description`: helper text linked via `aria-describedby` (`id: descriptionId(id)`).
 * - `Error`: validation message linked via `aria-describedby` when invalid (`id: errorId(id)`).
 * - `ClearButton`: button that clears the input and deselectable selection (`ClearCombobox`).
 * - `Backdrop`: outside-dismiss surface (`DismissCombobox`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Input: {
    role: 'Combobox',
    focus: 'None',
    gestures: [],
  },
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleCombobox' }],
  },
  Content: {
    role: 'Listbox',
    focus: 'Container',
    gestures: [],
  },
  Option: {
    role: 'Option',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectComboboxOption' }],
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
  ClearButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ClearCombobox' }],
  },
  Backdrop: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'DismissCombobox' }],
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
  if (slot === 'Input') {
    const maybeActiveId = activeDescendantIdOf(state, props)
    return {
      id: inputId(props.id),
      hasPopup: 'listbox',
      isExpanded: isOpen(state),
      controls: contentId(props.id),
      tabIndex: isDisabledOf(props) ? -1 : 0,
      ...labelSlotPropsOf(props),
      ...descriptionSlotPropsOf(props),
      ...Option.match(maybeActiveId, {
        onNone: () => ({}),
        onSome: activeId => ({ activeId }),
      }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
      ...(isInvalidOf(props) ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Trigger') {
    return {
      id: triggerId(props.id),
      hasPopup: 'listbox',
      isExpanded: isOpen(state),
      controls: contentId(props.id),
      label: 'Toggle options',
      tabIndex: -1,
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'Content') {
    return {
      id: contentId(props.id),
      ...labelSlotPropsOf(props),
      ...(isMultipleOf(props) ? { isMultiselectable: true } : {}),
      ...(isOpen(state) ? {} : { isHidden: true }),
    }
  } else if (slot === 'Option') {
    return Option.match(
      Option.flatMap(maybeChoice, value =>
        Option.map(itemIndexByValue(props, value), index => ({ index, value })),
      ),
      {
        onNone: () => ({}),
        onSome: ({ index, value }) => {
          const isDisabled = isOptionDisabled(props, value)
          const isSelected = isOptionSelected(state, value)
          const isCurrent = isOptionActive(state, props, value)
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
  } else if (slot === 'ClearButton') {
    const hasNothingToClear =
      (!isDeselectableOf(props) || isSelectionEmpty(state)) &&
      isInputEmpty(state)
    return {
      id: clearButtonId(props.id),
      controls: inputId(props.id),
      label: 'Clear combobox',
      tabIndex: 0,
      ...(!canInteract(props) || hasNothingToClear ? { isHidden: true } : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'Backdrop') {
    return {
      ...(!isOpen(state) ? { isHidden: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a Combobox on: closes any open popup and settles the
 * field back to its committed resting value while preserving the committed
 * selection.
 *
 * @example
 * ```typescript
 * atRest(openWithSelection) // Closed({ selection: ..., field: Idle({ value: ... }) })
 * ```
 */
export const atRest = (state: State): State =>
  Closed({
    selection: Selection.atRest(state.selection),
    field: FieldDraft.Idle({ value: FieldDraft.valueOf(state.field) }),
  })

// PART FACTORY

/** Options for customizing a Combobox Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'` or `'OwnChoice'`) to keep this Combobox device-only. */
  sync?: 'Synced' | DeviceReason
  /** Typing-pause settle window in milliseconds for `ChangeComboboxInput` (`200` by default). */
  settleMs?: number
  /** Initial selected option values for the Part's chart (empty by default). */
  defaultValue?: ReadonlyArray<string>
  /** Initial resting input text for the Part's chart (`''` by default). */
  defaultInputValue?: string
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Combobox {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * `ChangeComboboxInput` at `Pace.Settled({ afterMs: settleMs ?? 200 })`,
 * discrete actions at `Pace.Synced()`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's Combobox local to one device.
 *
 * @example
 * ```typescript
 * const FruitCombobox = Combobox.make({ name: 'FruitCombobox' })
 * const LocalSearchCombobox = Combobox.deviceOnly({ name: 'LocalSearchCombobox' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const settleMs = options.settleMs ?? defaultSettleMs
  const initialState: State =
    options.defaultValue === undefined &&
    options.defaultInputValue === undefined
      ? initial
      : initialSelected(
          options.defaultValue ?? [],
          options.defaultInputValue ?? '',
        )

  return Part.define<State, Message, Props>({
    name: options.name ?? 'Combobox',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? syncOf(settleMs)
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
    slots,
    atRest,
    project: projectSlot,
    configuration: options.configuration ?? {
      base: {
        pace: {
          ...defaultPace,
          typingSettleMs: settleMs,
        },
      },
      presets: {},
    },
  })
}

/**
 * Shorthand for a Combobox Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalCombobox = Combobox.deviceOnly({ name: 'LocalCombobox' })
 * ```
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

/** The default synced Combobox Part (`name: 'Combobox'`, `category: 'Domain'`, `ChangeComboboxInput` at `Pace.Settled({ afterMs: 200 })`). */
export const part: Part.Part<State, Message, Props> = make()

import { Array, Option, Schema as S } from 'effect'

import type {
  ButtonNode,
  ListItem,
  TranscriptNode,
  UiNode,
} from '../renderers/types.js'
import { GestureKind, PointerKind } from './gesture.js'
import * as LongPress from './longPress.js'

// NOTE: a slot is one painted element of a part, and a binding is what the
// screen tree carries to a painter about it: its role, what the projection
// says of it, and the press each gesture sends. A painter's host reads a
// binding and nothing else of a part, so it never learns a part's name.

/** What a painted element is, for a screen reader: a menu's row is a `MenuItem`, a tab bar is a `TabList`. */
export const Role = S.Literals([
  'Menu',
  'MenuItem',
  'Listbox',
  'Option',
  'Combobox',
  'TabList',
  'Tab',
  'TabPanel',
  'Button',
  'Dialog',
  'AlertDialog',
  'Region',
  'Switch',
  'Checkbox',
  'RadioGroup',
  'Radio',
  'Status',
  'Alert',
  'TextBox',
  'Tooltip',
  'Group',
  'Grid',
  'GridCell',
  'Slider',
])
/** What a painted element is, for a screen reader. */
export type Role = typeof Role.Type

/** How urgently a live region announces updates to assistive technology. */
export const LivePoliteness = S.Literals(['Off', 'Polite', 'Assertive'])
/** How urgently a live region announces updates to assistive technology. */
export type LivePoliteness = typeof LivePoliteness.Type

/** Whether a checkable control (such as a switch, checkbox, or radio) is checked, unchecked, or mixed. */
export const CheckedState = S.Union([S.Boolean, S.Literal('mixed')])
/** Whether a checkable control is checked, unchecked, or mixed. */
export type CheckedState = typeof CheckedState.Type

/** Whether a toggle button is pressed, unpressed, or mixed. */
export const PressedState = S.Union([S.Boolean, S.Literal('mixed')])
/** Whether a toggle button is pressed, unpressed, or mixed. */
export type PressedState = typeof PressedState.Type

/** Which axis a composite slot (such as a tablist or toolbar) lays out along. */
export const SlotOrientation = S.Literals(['Horizontal', 'Vertical'])
/** Which axis a composite slot lays out along. */
export type SlotOrientation = typeof SlotOrientation.Type

/**
 * One gesture a slot listens for, and the press it sends:
 * `{ gesture: 'PressedSecondary', press: 'ShowTitleMenu:salt-road' }`.
 */
export const GesturePress = S.Struct({ gesture: GestureKind, press: S.String })
/** One gesture a slot listens for, and the press it sends. */
export type GesturePress = typeof GesturePress.Type

/**
 * What a platform with no hold of its own needs to tell core's rule: the
 * three presses for a finger going down, moving off the spot and lifting,
 * how far off the spot counts, and which pointers can hold at all.
 *
 * @example
 * ```typescript
 * const hold: HoldBinding = {
 *   down: 'fk-hold-down:ShowTitleMenu:salt-road',
 *   away: 'fk-hold-away',
 *   up: 'fk-hold-up',
 *   slackPx: 10,
 *   pointers: ['Touch', 'Pen'],
 * }
 * ```
 */
export const HoldBinding = S.Struct({
  down: S.String,
  away: S.String,
  up: S.String,
  slackPx: S.Number,
  pointers: S.Array(PointerKind),
})
/** What a platform with no hold of its own needs to tell core's rule. */
export type HoldBinding = typeof HoldBinding.Type

/**
 * What the screen tree carries to a painter for one painted element of a
 * part: its role, the presses its gestures send, and what the part's
 * projection says of it.
 *
 * @example
 * ```typescript
 * const row: SlotBinding = Slot.menuAsk('ShowTitleMenu:salt-road')
 * // gestures: HeldLong and PressedSecondary, both pressing ShowTitleMenu:salt-road
 * ```
 */
export const SlotBinding = S.Struct({
  role: S.optionalKey(Role),
  gestures: S.Array(GesturePress),
  maybeHold: S.Option(HoldBinding),
  isCurrent: S.optionalKey(S.Boolean),
  isSelected: S.optionalKey(S.Boolean),
  isMultiselectable: S.optionalKey(S.Boolean),
  isChecked: S.optionalKey(CheckedState),
  isPressed: S.optionalKey(PressedState),
  isExpanded: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  isMultiline: S.optionalKey(S.Boolean),
  isModal: S.optionalKey(S.Boolean),
  isHidden: S.optionalKey(S.Boolean),
  live: S.optionalKey(LivePoliteness),
  isAtomic: S.optionalKey(S.Boolean),
  orientation: S.optionalKey(SlotOrientation),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
  controls: S.optionalKey(S.String),
  hasPopup: S.optionalKey(S.String),
  keys: S.optionalKey(S.Array(S.String)),
  id: S.optionalKey(S.String),
  activeId: S.optionalKey(S.String),
  tabIndex: S.optionalKey(S.Number),
  valueMin: S.optionalKey(S.Number),
  valueMax: S.optionalKey(S.Number),
  valueNow: S.optionalKey(S.Number),
  valueText: S.optionalKey(S.String),
})
/** What the screen tree carries to a painter for one painted element of a part. */
export type SlotBinding = typeof SlotBinding.Type

/**
 * What a part's projection says of one slot, before its presses are
 * bound. `id` names the slot's element, and `activeId` is the id of the
 * slot a container's highlight is on, since focus stays on the container:
 * a menu says `activeId: 'title-menu-open'` and its row `id: 'title-menu-open'`.
 */
export const SlotProps = S.Struct({
  role: S.optionalKey(Role),
  isCurrent: S.optionalKey(S.Boolean),
  isSelected: S.optionalKey(S.Boolean),
  isMultiselectable: S.optionalKey(S.Boolean),
  isChecked: S.optionalKey(CheckedState),
  isPressed: S.optionalKey(PressedState),
  isExpanded: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  isMultiline: S.optionalKey(S.Boolean),
  isModal: S.optionalKey(S.Boolean),
  isHidden: S.optionalKey(S.Boolean),
  live: S.optionalKey(LivePoliteness),
  isAtomic: S.optionalKey(S.Boolean),
  orientation: S.optionalKey(SlotOrientation),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
  controls: S.optionalKey(S.String),
  hasPopup: S.optionalKey(S.String),
  keys: S.optionalKey(S.Array(S.String)),
  id: S.optionalKey(S.String),
  activeId: S.optionalKey(S.String),
  tabIndex: S.optionalKey(S.Number),
  valueMin: S.optionalKey(S.Number),
  valueMax: S.optionalKey(S.Number),
  valueNow: S.optionalKey(S.Number),
  valueText: S.optionalKey(S.String),
})
/** What a part's projection says of one slot. */
export type SlotProps = typeof SlotProps.Type

/** How far a finger may move from where it went down and still be holding. */
export const holdSlackPx = 10

/** The pointers that can hold: a mouse asks with its second button instead. */
export const holdPointers: ReadonlyArray<PointerKind> = ['Touch', 'Pen']

/**
 * The hold a platform without one tells for `press`, the press a hold
 * sends when it completes.
 *
 * @example
 * ```typescript
 * holdOf('ShowTitleMenu:salt-road').down // 'fk-hold-down:ShowTitleMenu:salt-road'
 * ```
 */
export const holdOf = (press: string): HoldBinding => ({
  down: LongPress.tokenOf(LongPress.PressedDown({ press })),
  away: LongPress.tokenOf(LongPress.MovedPointerAway()),
  up: LongPress.tokenOf(LongPress.ReleasedPointer()),
  slackPx: holdSlackPx,
  pointers: holdPointers,
})

/**
 * A binding from the presses a slot's gestures send. A slot that listens
 * for a hold also gets what a platform without one needs to tell it.
 *
 * @example
 * ```typescript
 * bound([{ gesture: 'HeldLong', press: 'Pin:salt-road' }], { isCurrent: true })
 * // { gestures: [...], maybeHold: Some({ down: 'fk-hold-down:Pin:salt-road', ... }), isCurrent: true }
 * ```
 */
export const bound = (
  gestures: ReadonlyArray<GesturePress>,
  props: SlotProps & Readonly<{ role?: Role }> = {},
): SlotBinding => ({
  ...props,
  gestures,
  maybeHold: Option.map(
    Array.findFirst(gestures, each => each.gesture === 'HeldLong'),
    held => holdOf(held.press),
  ),
})

/**
 * The binding of a part of the screen a person asks a menu of: a hold or
 * the second button, both sending `press`. This is the one place that
 * says which gestures ask for a menu.
 *
 * @example
 * ```typescript
 * menuAsk('ShowTitleMenu:salt-road').gestures
 * // [{ gesture: 'HeldLong', press: 'ShowTitleMenu:salt-road' },
 * //  { gesture: 'PressedSecondary', press: 'ShowTitleMenu:salt-road' }]
 * ```
 */
export const menuAsk = (press: string): SlotBinding =>
  bound([
    { gesture: 'HeldLong', press },
    { gesture: 'PressedSecondary', press },
  ])

const cached = <Key extends object>(
  build: (key: Key) => Option.Option<SlotBinding>,
): ((key: Key) => Option.Option<SlotBinding>) => {
  const bindings = new WeakMap<Key, Option.Option<SlotBinding>>()
  return key => {
    const maybeKnown = bindings.get(key)
    if (maybeKnown !== undefined) {
      return maybeKnown
    } else {
      const built = build(key)
      bindings.set(key, built)
      return built
    }
  }
}

/**
 * The binding of a list row: the one a part gave it as `slot`, else the
 * menu ask its `menuAction` means, else none. The same row object answers
 * the same binding object, so a painter that skips a row by reference
 * still skips it.
 *
 * @example
 * ```typescript
 * ofItem({ key: 'salt-road', title: 'Salt Road', menuAction: 'ShowTitleMenu:salt-road' })
 * // Some(menuAsk('ShowTitleMenu:salt-road'))
 * ```
 */
export const ofItem: (item: ListItem) => Option.Option<SlotBinding> = cached(
  (item: ListItem) =>
    Option.orElse(Option.fromNullishOr(item.slot), () =>
      Option.map(Option.fromNullishOr(item.menuAction), menuAsk),
    ),
)

/**
 * The binding every word of a Transcript shares: the one a part gave it
 * as `wordSlot`, else the menu ask its `wordMenuAction` means. Each press
 * in it is joined with the word's token by the painter, as a word's own
 * press is: `ShowWordMenu` becomes `ShowWordMenu:w4012`.
 *
 * @example
 * ```typescript
 * ofWords(transcript) // Some(menuAsk('ShowWordMenu'))
 * ```
 */
export const ofWords: (
  transcript: Pick<TranscriptNode, 'wordSlot' | 'wordMenuAction'>,
) => Option.Option<SlotBinding> = cached(
  (transcript: Pick<TranscriptNode, 'wordSlot' | 'wordMenuAction'>) =>
    Option.orElse(Option.fromNullishOr(transcript.wordSlot), () =>
      Option.map(Option.fromNullishOr(transcript.wordMenuAction), menuAsk),
    ),
)

/**
 * The binding of a button, when a part gave it one.
 *
 * @example
 * ```typescript
 * ofButton(Button({ label: 'Pin', action: 'Pin', slot })) // Some(slot)
 * ```
 */
export const ofButton = (button: ButtonNode): Option.Option<SlotBinding> =>
  Option.fromNullishOr(button.slot)

const roleNames: Readonly<Record<Role, string>> = {
  Menu: 'menu',
  MenuItem: 'menuitem',
  Listbox: 'listbox',
  Option: 'option',
  Combobox: 'combobox',
  TabList: 'tablist',
  Tab: 'tab',
  TabPanel: 'tabpanel',
  Button: 'button',
  Dialog: 'dialog',
  AlertDialog: 'alertdialog',
  Region: 'region',
  Switch: 'switch',
  Checkbox: 'checkbox',
  RadioGroup: 'radiogroup',
  Radio: 'radio',
  Status: 'status',
  Alert: 'alert',
  TextBox: 'textbox',
  Tooltip: 'tooltip',
  Group: 'group',
  Grid: 'grid',
  GridCell: 'gridcell',
  Slider: 'slider',
}

const liveNames: Readonly<Record<LivePoliteness, string>> = {
  Off: 'off',
  Polite: 'polite',
  Assertive: 'assertive',
}

/**
 * The ARIA a binding means, from its role and what the projection says:
 * the attributes a browser painter writes, and what a phone's painter
 * reads its accessibility state from.
 *
 * @example
 * ```typescript
 * ariaOf({ ...binding, role: 'Menu', activeId: 'title-menu-open' })
 * // { role: 'menu', 'aria-activedescendant': 'title-menu-open' }
 * ariaOf({ ...binding, role: 'MenuItem', id: 'title-menu-open' })
 * // { role: 'menuitem', id: 'title-menu-open' }
 * ```
 */
export const ariaOf = (
  binding: SlotBinding,
): Readonly<Record<string, string>> => ({
  ...(binding.role === undefined ? {} : { role: roleNames[binding.role] }),
  ...(binding.id === undefined ? {} : { id: binding.id }),
  ...(binding.activeId === undefined
    ? {}
    : { 'aria-activedescendant': binding.activeId }),
  ...(binding.controls === undefined
    ? {}
    : { 'aria-controls': binding.controls }),
  ...(binding.hasPopup === undefined
    ? {}
    : { 'aria-haspopup': binding.hasPopup }),
  ...(binding.isModal === undefined
    ? {}
    : { 'aria-modal': String(binding.isModal) }),
  ...(binding.live === undefined
    ? {}
    : { 'aria-live': liveNames[binding.live] }),
  ...(binding.isAtomic === undefined
    ? {}
    : { 'aria-atomic': String(binding.isAtomic) }),
  ...(binding.labelledBy === undefined
    ? {}
    : { 'aria-labelledby': binding.labelledBy }),
  ...(binding.describedBy === undefined
    ? {}
    : { 'aria-describedby': binding.describedBy }),
  ...(binding.orientation === undefined
    ? {}
    : {
        'aria-orientation':
          binding.orientation === 'Horizontal' ? 'horizontal' : 'vertical',
      }),
  ...(binding.isCurrent === undefined
    ? {}
    : { 'aria-current': String(binding.isCurrent) }),
  ...(binding.isSelected === undefined
    ? {}
    : { 'aria-selected': String(binding.isSelected) }),
  ...(binding.isMultiselectable === true
    ? { 'aria-multiselectable': 'true' }
    : {}),
  ...(binding.isChecked === undefined
    ? {}
    : { 'aria-checked': String(binding.isChecked) }),
  ...(binding.isPressed === undefined
    ? {}
    : { 'aria-pressed': String(binding.isPressed) }),
  ...(binding.isExpanded === undefined
    ? {}
    : { 'aria-expanded': String(binding.isExpanded) }),
  ...(binding.isDisabled === undefined
    ? {}
    : { 'aria-disabled': String(binding.isDisabled) }),
  ...(binding.isReadOnly === undefined
    ? {}
    : { 'aria-readonly': String(binding.isReadOnly) }),
  ...(binding.isRequired === undefined
    ? {}
    : { 'aria-required': String(binding.isRequired) }),
  ...(binding.isInvalid === undefined
    ? {}
    : { 'aria-invalid': String(binding.isInvalid) }),
  ...(binding.isMultiline === true ? { 'aria-multiline': 'true' } : {}),
  ...(binding.label === undefined ? {} : { 'aria-label': binding.label }),
  ...(binding.keys === undefined || Array.isReadonlyArrayEmpty(binding.keys)
    ? {}
    : { 'aria-keyshortcuts': Array.join(binding.keys, ' ') }),
  ...(binding.tabIndex === undefined
    ? {}
    : { tabindex: String(binding.tabIndex) }),
  ...(binding.valueMin === undefined
    ? {}
    : { 'aria-valuemin': String(binding.valueMin) }),
  ...(binding.valueMax === undefined
    ? {}
    : { 'aria-valuemax': String(binding.valueMax) }),
  ...(binding.valueNow === undefined
    ? {}
    : { 'aria-valuenow': String(binding.valueNow) }),
  ...(binding.valueText === undefined
    ? {}
    : { 'aria-valuetext': binding.valueText }),
  ...(binding.isHidden === true ? { hidden: '' } : {}),
})

/**
 * A screen tree with a completed hold said on everything a hold can ask
 * of: each List, each Transcript, and each Button a part bound. A painter
 * reads it there, sends the hold's press, and stops the tap that follows.
 * It is called only while a hold is completed, so a tree is walked for a
 * fraction of a second at a time and is otherwise the object it was.
 *
 * @example
 * ```typescript
 * withHold(List({ label: 'Library', items }), { press: 'ShowTitleMenu:salt-road', pressCount: 3 })
 * // { _tag: 'List', label: 'Library', items, hold: { press: 'ShowTitleMenu:salt-road', pressCount: 3 } }
 * ```
 */
export const withHold = (node: UiNode, signal: LongPress.Signal): UiNode => {
  if (node._tag === 'List') {
    return { ...node, hold: signal }
  } else if (node._tag === 'Transcript') {
    return {
      ...node,
      hold: signal,
      ...(node.items === undefined
        ? {}
        : {
            items: Array.map(node.items, item => ({
              ...item,
              node: withHold(item.node, signal),
            })),
          }),
    }
  } else if (node._tag === 'Button') {
    return node.slot === undefined ? node : { ...node, hold: signal }
  } else if (
    node._tag === 'Row' ||
    node._tag === 'Column' ||
    node._tag === 'Box' ||
    node._tag === 'DeviceShell'
  ) {
    return {
      ...node,
      children: Array.map(node.children, child => withHold(child, signal)),
    }
  } else if (node._tag === 'Lazy') {
    return {
      ...node,
      args: [...node.args, signal.pressCount, signal.press],
      build: () => withHold(node.build(), signal),
    }
  } else {
    return node
  }
}

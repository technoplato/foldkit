import { Array, Option, Schema as S, pipe } from 'effect'

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
import * as Menu from './menu.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type * as Placement from './placement.js'
import * as RovingFocus from './rovingFocus.js'
import type { SlotProps } from './slot.js'
import * as Typeahead from './typeahead.js'

// NOTE: this is the core Menubar Part (Widget #28 of 54, Scribe #2667). It
// composes the core `Menu` Part and `RovingFocus` into one framework-free
// Machine and Part declaration covering Radix menubar semantics: horizontal
// top-level menus with roving tabindex, Left/Right switching across open
// menus (respecting LTR/RTL and loop), hover-switch while a menu is open,
// Escape and outside-press dismissal via `Layers`, typeahead inside active
// dropdowns via `Menu`, and reference-stable `SlotBindings` (`Bar`, `Trigger`,
// `Content`, `Item`). Its state (`Idle` | `Open`) lives in the Model, synced
// by default (`Navigation` category, `Pace.Synced`) with `Menubar.make` and
// `Menubar.deviceOnly()`.

// SCHEMAS

/** One top-level menu in a Menubar, holding its dropdown `Menu.Item` entries. */
export const BarMenu = S.Struct({
  value: S.String,
  label: S.String,
  items: S.Array(Menu.Item),
  isDisabled: S.optionalKey(S.Boolean),
})
/** One top-level menu in a Menubar. */
export type BarMenu = typeof BarMenu.Type

/** The last item selected from a Menubar dropdown: its parent menu value, item value, and item index. */
export const SelectedRecord = S.Struct({
  menuValue: S.String,
  itemValue: S.String,
  itemIndex: S.Number,
})
/** The last item selected from a Menubar dropdown. */
export type SelectedRecord = typeof SelectedRecord.Type

/** Standard `data-state` attribute value for a top-level menu trigger (`'open' | 'closed'`). */
export const DataState = S.Literals(['open', 'closed'])
/** Standard `data-state` attribute value. */
export type DataState = typeof DataState.Type

/**
 * Read-only props supplied to the Menubar chart and projection from the
 * Program's Model. Top-level menus and their items stay out of the chart's
 * state.
 */
export const Props = S.Struct({
  id: S.String,
  menus: S.Array(BarMenu),
  direction: S.optionalKey(RovingFocus.Direction),
  loop: S.optionalKey(S.Boolean),
  closeOnSelect: S.optionalKey(S.Boolean),
  isModal: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  layers: S.optionalKey(Layers.Stack),
  searchResetMs: S.optionalKey(S.Number),
  placement: S.optionalKey(Menu.PlacementOptions),
})
/** Read-only props supplied to the Menubar chart and projection. */
export type Props = typeof Props.Type

// STATE

/** No top-level menu dropdown is open; roving focus remembers `maybeFocusedMenuValue`. */
export const Idle = ts('Idle', {
  maybeFocusedMenuValue: S.Option(S.String),
  maybeLastSelected: S.Option(SelectedRecord),
})
/** No top-level menu dropdown is open. */
export type Idle = typeof Idle.Type

/** The top-level menu named `openMenuValue` is open, delegating item highlight and typeahead to `Menu.Open`. */
export const Open = ts('Open', {
  openMenuValue: S.String,
  menu: Menu.Open,
  maybeLastSelected: S.Option(SelectedRecord),
})
/** A top-level menu dropdown is open. */
export type Open = typeof Open.Type

/** Where a Menubar Part stands: `Idle` or `Open`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Open])
/** Where a Menubar Part stands. */
export type State = typeof State.Type

/** Initial Menubar state: idle with no focused trigger override and no selection. */
export const initial: State = Idle({
  maybeFocusedMenuValue: Option.none(),
  maybeLastSelected: Option.none(),
})

// ACTIONS

/** Opens the chosen top-level menu, or closes it when that menu is already open. */
export const ToggleMenubarMenu = Catalog.action('ToggleMenubarMenu', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'menu',
    prompt: 'Toggle which top-level menu?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No top-level menu is available',
  },
  what: 'Opens the chosen top-level menu or closes it when open',
  why: 'To browse or hide that section’s entries',
  meta: { label: 'Toggle menu', keys: [] },
})

/** Opens the chosen top-level menu immediately. */
export const OpenMenubarMenu = Catalog.action('OpenMenubarMenu', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'menu',
    prompt: 'Open which top-level menu?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No top-level menu is available',
  },
  what: 'Opens the chosen top-level menu',
  why: 'To browse its entries',
  meta: { label: 'Open menu', keys: [] },
})

/** Closes the active top-level menu dropdown unconditionally. */
export const CloseMenubar = Catalog.action('CloseMenubar', {
  what: 'Closes the active menu in the bar',
  why: 'To return to the workspace beneath it',
  meta: { label: 'Close menubar', keys: [] },
})

/** Dismisses the active menu dropdown when the menubar is the topmost dismissable layer. */
export const DismissMenubar = Catalog.action('DismissMenubar', {
  what: 'Dismisses the active menu when it is the topmost layer',
  why: 'To leave the bar without choosing an entry',
  meta: { label: 'Dismiss menubar', keys: [] },
})

/** Selects an enabled item from the currently open top-level menu by its value. */
export const SelectMenubarItem = Catalog.action('SelectMenubarItem', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'item',
    prompt: 'Select which menu item?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No item is available',
  },
  what: 'Chooses an enabled item from the active menu',
  why: 'To carry out that entry’s action',
  meta: { label: 'Select menubar item', keys: [] },
})

/** The Catalog Actions a Menubar Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ToggleMenubarMenu,
  OpenMenubarMenu,
  CloseMenubar,
  DismissMenubar,
  SelectMenubarItem,
]

// MESSAGES

/** Focus moved onto the top-level trigger for `menuValue`. */
export const FocusMenubarTrigger = m('FocusMenubarTrigger', {
  menuValue: S.String,
})

/** Pointer hovered over the top-level trigger for `menuValue`; switches menus while already `Open`. */
export const HoverMenubarTrigger = m('HoverMenubarTrigger', {
  menuValue: S.String,
})

/** A key was pressed while interacting with the menubar or its open dropdown. */
export const PressedMenubarKey = m('PressedMenubarKey', { key: S.String })

/** Pointer moved over an item at `index` inside the active dropdown. */
export const MovedPointerOverMenubarItem = m('MovedPointerOverMenubarItem', {
  index: S.Number,
  screenX: S.Number,
  screenY: S.Number,
})

/** Pointer left the hovered item inside the active dropdown. */
export const LeftMenubarItem = m('LeftMenubarItem')

/** The debounced typeahead reset wait finished for `version`. */
export const ClearedMenubarSearch = m('ClearedMenubarSearch', {
  version: S.Number,
})

/** A pointer press landed outside the layers listed in `insideIds`. */
export const PressedOutsideMenubar = m('PressedOutsideMenubar', {
  insideIds: S.Array(S.String),
})

/** Every Message the Menubar chart handles. */
export const Message = S.Union([
  ToggleMenubarMenu,
  OpenMenubarMenu,
  CloseMenubar,
  DismissMenubar,
  SelectMenubarItem,
  FocusMenubarTrigger,
  HoverMenubarTrigger,
  PressedMenubarKey,
  MovedPointerOverMenubarItem,
  LeftMenubarItem,
  ClearedMenubarSearch,
  PressedOutsideMenubar,
])
/** Every Message the Menubar chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Menubar Part. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits out the typeahead debounce period inside an open dropdown and answers `ClearedMenubarSearch`. */
export const WaitToClearMenubarSearch = Command.define(
  'WaitToClearMenubarSearch',
  { version: S.Number, afterMs: S.Number },
  ClearedMenubarSearch,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ClearedMenubarSearch({ version })),
)

// ELEMENT IDS

/** Derives the menubar container element id from a base `id`. */
export const barId = (id: string): string => `${id}-bar`

/** Derives a top-level menu trigger element id from a base `id` and `menuValue`. */
export const triggerId = (id: string, menuValue: string): string =>
  `${id}-trigger-${menuValue}`

/** Derives a dropdown menu content element id from a base `id` and `menuValue`. */
export const contentId = (id: string, menuValue: string): string =>
  `${id}-content-${menuValue}`

/** Derives one dropdown menu item element id from a base `id`, `menuValue`, and `index`. */
export const itemId = (id: string, menuValue: string, index: number): string =>
  `${id}-menu-${menuValue}-item-${index.toString()}`

// PURE RULES & CONFIGURATION READERS

/** Resolved horizontal reading direction (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): RovingFocus.Direction => props.direction ?? 'Ltr'

/** True when horizontal roving across top-level menus wraps around edges (`true` by default). */
export const loopOf = (props: Pick<Props, 'loop'> = {}): boolean =>
  props.loop ?? true

/** True when selecting an item closes the open dropdown (`true` by default). */
export const closeOnSelectOf = (
  props: Pick<Props, 'closeOnSelect'> = {},
): boolean => props.closeOnSelect ?? true

/** True when the entire menubar is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** Places an open Menubar dropdown panel relative to its trigger via `Menu.placeFor`. */
export const placeFor = (
  props: Pick<Props, 'placement'>,
  geometry: Readonly<{
    anchor: Placement.Rect
    size: Placement.Size
    view: Placement.Size
  }>,
): Placement.Placed => Menu.placeFor(props, geometry)

const isMenuDisabledAt =
  (props: Props) =>
  (index: number): boolean =>
    isDisabledOf(props) ||
    Option.exists(
      Array.get(props.menus, index),
      menu => menu.isDisabled === true,
    )

const isEnabledMenuIndex = (props: Props, index: number): boolean =>
  index >= 0 && index < props.menus.length && !isMenuDisabledAt(props)(index)

const menuIndexByValue = (props: Props, value: string): Option.Option<number> =>
  Array.findFirstIndex(props.menus, menu => menu.value === value)

const enabledMenuByValue = (
  props: Props,
  value: string,
): Option.Option<BarMenu> =>
  Option.flatMap(menuIndexByValue(props, value), index =>
    isEnabledMenuIndex(props, index)
      ? Array.get(props.menus, index)
      : Option.none(),
  )

const layersOf = (props: Props): Layers.Stack =>
  props.layers ?? [Layers.layer(props.id, { isModal: props.isModal ?? false })]

const canDismissEscape = (props: Props): boolean =>
  Layers.canDismissOnEscape(layersOf(props), props.id)

const canDismissOutside = (
  props: Props,
  insideIds: ReadonlyArray<string>,
): boolean =>
  Layers.canDismissOnOutsidePress(layersOf(props), props.id, insideIds)

const childMenuPropsOf = (props: Props, barMenu: BarMenu): Menu.Props => ({
  id: `${props.id}-menu-${barMenu.value}`,
  items: barMenu.items,
  isModal: props.isModal ?? false,
  loop: loopOf(props),
  closeOnSelect: closeOnSelectOf(props),
  orientation: 'Vertical',
  direction: directionOf(props),
  layers: [
    Layers.layer(`${props.id}-menu-${barMenu.value}`, {
      isModal: props.isModal ?? false,
      dismissesOnEscape: canDismissEscape(props),
    }),
  ],
  ...(props.searchResetMs === undefined
    ? {}
    : { searchResetMs: props.searchResetMs }),
  ...(props.placement === undefined ? {} : { placement: props.placement }),
})

// READINGS

/** True when any top-level menu dropdown is currently open. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** The currently open top-level menu value, or none when idle. */
export const openMenuValueOf = (state: State): Option.Option<string> =>
  state._tag === 'Open' ? Option.some(state.openMenuValue) : Option.none()

/** True when the specific top-level menu named `menuValue` is open. */
export const isMenuOpen = (state: State, menuValue: string): boolean =>
  state._tag === 'Open' && state.openMenuValue === menuValue

/**
 * The top-level menu index currently holding the roving tab stop (`tabIndex: 0`).
 * Uses the open menu when `Open`, else `maybeFocusedMenuValue` when enabled,
 * else the first enabled top-level menu. Returns none when empty or all menus
 * are disabled.
 */
export const focusedMenuIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> => {
  if (isDisabledOf(props)) {
    return Option.none()
  }
  const maybeCandidate =
    state._tag === 'Open'
      ? menuIndexByValue(props, state.openMenuValue)
      : Option.flatMap(state.maybeFocusedMenuValue, value =>
          menuIndexByValue(props, value),
        )
  return Option.orElse(
    Option.filter(maybeCandidate, index => isEnabledMenuIndex(props, index)),
    () => RovingFocus.firstEnabled(props.menus.length, isMenuDisabledAt(props)),
  )
}

/** The top-level menu value holding the roving tab stop, or none. */
export const focusedMenuValueOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(focusedMenuIndexOf(state, props), index =>
    Option.map(Array.get(props.menus, index), menu => menu.value),
  )

/** True when the top-level menu named `menuValue` currently holds the roving tab stop. */
export const isTriggerFocused = (
  state: State,
  props: Props,
  menuValue: string,
): boolean => Option.contains(focusedMenuValueOf(state, props), menuValue)

/** The highlighted item index inside the currently open menu, or none. */
export const activeItemIndexOf = (state: State): Option.Option<number> =>
  state._tag === 'Open' ? Menu.activeIndexOf(state.menu) : Option.none()

/** The last item selected from any menu in this Menubar, or none. */
export const lastSelectedOf = (state: State): Option.Option<SelectedRecord> =>
  state.maybeLastSelected

/** The accumulated typeahead search query inside the active dropdown, or `''`. */
export const searchQueryOf = (state: State): string =>
  state._tag === 'Open' ? Menu.searchQueryOf(state.menu) : ''

/** Standard `data-state` attribute value for one top-level menu (`'open' | 'closed'`). */
export const menuDataStateOf = (state: State, menuValue: string): DataState =>
  isMenuOpen(state, menuValue) ? 'open' : 'closed'

// INTERNAL CHART HELPERS

const initialHighlightIndexOf = (
  barMenu: BarMenu,
  initialHighlight: 'None' | 'First' | 'Last',
): Option.Option<number> => {
  const isItemDisabled = (index: number): boolean =>
    Option.exists(
      Array.get(barMenu.items, index),
      item => item.isDisabled === true,
    )
  if (initialHighlight === 'First') {
    return RovingFocus.firstEnabled(barMenu.items.length, isItemDisabled)
  } else if (initialHighlight === 'Last') {
    return RovingFocus.lastEnabled(barMenu.items.length, isItemDisabled)
  } else {
    return Option.none<number>()
  }
}

const openChildMenu = (
  props: Props,
  barMenu: BarMenu,
  activationTrigger: Menu.ActivationTrigger,
  initialHighlight: 'None' | 'First' | 'Last',
  maybeLastSelected: Option.Option<SelectedRecord>,
): Open => {
  const maybeActiveIndex = initialHighlightIndexOf(barMenu, initialHighlight)
  const [openedMenu] = Menu.chart.transition(
    Menu.initial,
    Menu.OpenedMenu({
      maybeTarget: Option.some(barMenu.value),
      maybeActiveIndex,
      activationTrigger,
    }),
    childMenuPropsOf(props, barMenu),
  )
  const menuState: Menu.Open =
    openedMenu._tag === 'Open'
      ? openedMenu
      : Menu.Open({
          maybeTarget: Option.some(barMenu.value),
          maybeActiveIndex,
          activationTrigger,
          typeahead: Typeahead.initial,
          maybeLastPointerPosition: Option.none(),
          maybeLastSelected: Option.none(),
        })
  return Open({
    openMenuValue: barMenu.value,
    menu: menuState,
    maybeLastSelected,
  })
}

const translateMenuCommands = (
  menuState: Menu.Open,
  commands: ReadonlyArray<Command.Command<Menu.Message>>,
  props: Props,
): ReadonlyArray<Command.Command<Message>> =>
  Array.some(
    commands,
    command => command.name === Menu.WaitToClearMenuSearch.name,
  )
    ? [
        WaitToClearMenubarSearch({
          version: Typeahead.versionOf(menuState.typeahead),
          afterMs: props.searchResetMs ?? Typeahead.resetMs,
        }),
      ]
    : []

type ChildStepOutcome = Readonly<{
  model: State
  commands: ReadonlyArray<Command.Command<Message>>
}>

const stepChildMenu = (
  state: Open,
  props: Props,
  menuMessage: Menu.Message,
): Option.Option<ChildStepOutcome> =>
  Option.flatMap(enabledMenuByValue(props, state.openMenuValue), barMenu => {
    const stepped = Menu.chart.step(
      state.menu,
      menuMessage,
      childMenuPropsOf(props, barMenu),
    )
    if (stepped._tag !== 'Transitioned') {
      return Option.none()
    }
    const nextMenu = stepped.state
    const nextSelected: Option.Option<SelectedRecord> = Option.orElse(
      Option.map(Menu.lastSelectedOf(nextMenu), selected => ({
        menuValue: barMenu.value,
        itemValue: selected.value,
        itemIndex: selected.index,
      })),
      () => state.maybeLastSelected,
    )
    if (nextMenu._tag === 'Closed') {
      return Option.some({
        model: Idle({
          maybeFocusedMenuValue: Option.some(state.openMenuValue),
          maybeLastSelected: nextSelected,
        }),
        commands: [],
      })
    } else {
      return Option.some({
        model: Open({
          openMenuValue: state.openMenuValue,
          menu: nextMenu,
          maybeLastSelected: nextSelected,
        }),
        commands: translateMenuCommands(nextMenu, stepped.commands, props),
      })
    }
  })

const stepChildToOpen = (
  state: Open,
  props: Props,
  menuMessage: Menu.Message,
): Option.Option<
  Readonly<{ model: Open; commands: ReadonlyArray<Command.Command<Message>> }>
> =>
  Option.flatMap(stepChildMenu(state, props, menuMessage), outcome =>
    outcome.model._tag === 'Open'
      ? Option.some({ model: outcome.model, commands: outcome.commands })
      : Option.none(),
  )

const stepChildToIdle = (
  state: Open,
  props: Props,
  menuMessage: Menu.Message,
): Option.Option<Idle> =>
  Option.flatMap(stepChildMenu(state, props, menuMessage), outcome =>
    outcome.model._tag === 'Idle' ? Option.some(outcome.model) : Option.none(),
  )

const adjacentMenuForKey = (
  props: Props,
  currentMenuValue: string,
  key: string,
): Option.Option<BarMenu> =>
  pipe(
    RovingFocus.moveOfKey(key, {
      orientation: 'Horizontal',
      direction: directionOf(props),
      pageKeys: false,
    }),
    Option.filter(move => move === 'Next' || move === 'Previous'),
    Option.flatMap(move =>
      RovingFocus.stepEnabled({
        count: props.menus.length,
        current: menuIndexByValue(props, currentMenuValue),
        move,
        isDisabled: isMenuDisabledAt(props),
        loop: loopOf(props),
      }),
    ),
    Option.flatMap(index => Array.get(props.menus, index)),
  )

const idleBarKeyEdges = (): ReadonlyArray<
  GuardedEdge<State, Message, Idle, typeof PressedMenubarKey.Type, never, Props>
> => [
  when(
    (state: Idle, message: typeof PressedMenubarKey.Type, context: Props) =>
      message.key === 'ArrowDown' ||
      message.key === 'Enter' ||
      message.key === ' '
        ? Option.flatMap(focusedMenuValueOf(state, context), value =>
            enabledMenuByValue(context, value),
          )
        : Option.none(),
    'Open',
    ({ state, guardValue, context }) =>
      openChildMenu(
        context,
        guardValue,
        'Keyboard',
        'First',
        state.maybeLastSelected,
      ),
  ),
  when(
    (state: Idle, message: typeof PressedMenubarKey.Type, context: Props) =>
      message.key === 'ArrowUp'
        ? Option.flatMap(focusedMenuValueOf(state, context), value =>
            enabledMenuByValue(context, value),
          )
        : Option.none(),
    'Open',
    ({ state, guardValue, context }) =>
      openChildMenu(
        context,
        guardValue,
        'Keyboard',
        'Last',
        state.maybeLastSelected,
      ),
  ),
  when(
    (state: Idle, message: typeof PressedMenubarKey.Type, context: Props) =>
      isDisabledOf(context)
        ? Option.none()
        : Option.flatMap(
            RovingFocus.resolveKey({
              key: message.key,
              count: context.menus.length,
              current: focusedMenuIndexOf(state, context),
              isDisabled: isMenuDisabledAt(context),
              orientation: 'Horizontal',
              direction: directionOf(context),
              loop: loopOf(context),
              pageKeys: false,
            }),
            index =>
              Option.map(Array.get(context.menus, index), menu => menu.value),
          ),
    'Idle',
    ({ state, guardValue }) =>
      Idle({
        maybeFocusedMenuValue: Option.some(guardValue),
        maybeLastSelected: state.maybeLastSelected,
      }),
  ),
  ignore(),
]

// CHART

/**
 * The Menubar Machine chart: horizontal roving focus across top-level triggers,
 * keyboard and pointer opening, Left/Right switching across open menus,
 * hover-switch while open, item highlight/selection/typeahead delegated to
 * `Menu.chart`, and layer-aware Escape / outside-press dismissal.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Idle: {
        on: {
          ToggleMenubarMenu: [
            when(
              (_state, message, context) =>
                enabledMenuByValue(context, message.value),
              'Open',
              ({ state, guardValue, context }) =>
                openChildMenu(
                  context,
                  guardValue,
                  'Pointer',
                  'None',
                  state.maybeLastSelected,
                ),
            ),
            ignore(),
          ],
          OpenMenubarMenu: [
            when(
              (_state, message, context) =>
                enabledMenuByValue(context, message.value),
              'Open',
              ({ state, guardValue, context }) =>
                openChildMenu(
                  context,
                  guardValue,
                  'Pointer',
                  'None',
                  state.maybeLastSelected,
                ),
            ),
            ignore(),
          ],
          FocusMenubarTrigger: [
            when(
              (_state, message, context) =>
                enabledMenuByValue(context, message.menuValue),
              'Idle',
              ({ state, guardValue }) =>
                Idle({
                  maybeFocusedMenuValue: Option.some(guardValue.value),
                  maybeLastSelected: state.maybeLastSelected,
                }),
            ),
            ignore(),
          ],
          HoverMenubarTrigger: [ignore()],
          PressedMenubarKey: idleBarKeyEdges(),
        },
      },
      Open: {
        on: {
          ToggleMenubarMenu: [
            when(
              (state, message) => message.value === state.openMenuValue,
              'Idle',
              ({ state }) =>
                Idle({
                  maybeFocusedMenuValue: Option.some(state.openMenuValue),
                  maybeLastSelected: state.maybeLastSelected,
                }),
            ),
            when(
              (_state, message, context) =>
                enabledMenuByValue(context, message.value),
              'Open',
              ({ state, guardValue, context }) =>
                openChildMenu(
                  context,
                  guardValue,
                  'Pointer',
                  'None',
                  state.maybeLastSelected,
                ),
            ),
            ignore(),
          ],
          OpenMenubarMenu: [
            when(
              (_state, message, context) =>
                enabledMenuByValue(context, message.value),
              'Open',
              ({ state, guardValue, context }) =>
                openChildMenu(
                  context,
                  guardValue,
                  'Pointer',
                  'None',
                  state.maybeLastSelected,
                ),
            ),
            ignore(),
          ],
          CloseMenubar: to('Idle', ({ state }) =>
            Idle({
              maybeFocusedMenuValue: Option.some(state.openMenuValue),
              maybeLastSelected: state.maybeLastSelected,
            }),
          ),
          DismissMenubar: [
            when(
              (_state, _message, context) => canDismissEscape(context),
              'Idle',
              ({ state }) =>
                Idle({
                  maybeFocusedMenuValue: Option.some(state.openMenuValue),
                  maybeLastSelected: state.maybeLastSelected,
                }),
            ),
            ignore(),
          ],
          PressedOutsideMenubar: [
            when(
              (_state, message, context) =>
                canDismissOutside(context, message.insideIds),
              'Idle',
              ({ state }) =>
                Idle({
                  maybeFocusedMenuValue: Option.some(state.openMenuValue),
                  maybeLastSelected: state.maybeLastSelected,
                }),
            ),
            ignore(),
          ],
          FocusMenubarTrigger: [
            when(
              (state, message, context) =>
                message.menuValue !== state.openMenuValue
                  ? enabledMenuByValue(context, message.menuValue)
                  : Option.none(),
              'Open',
              ({ state, guardValue, context }) =>
                openChildMenu(
                  context,
                  guardValue,
                  'Keyboard',
                  'None',
                  state.maybeLastSelected,
                ),
            ),
            ignore(),
          ],
          HoverMenubarTrigger: [
            when(
              (state, message, context) =>
                message.menuValue !== state.openMenuValue
                  ? enabledMenuByValue(context, message.menuValue)
                  : Option.none(),
              'Open',
              ({ state, guardValue, context }) =>
                openChildMenu(
                  context,
                  guardValue,
                  'Pointer',
                  'None',
                  state.maybeLastSelected,
                ),
            ),
            ignore(),
          ],
          SelectMenubarItem: [
            when(
              (state, message, context) =>
                stepChildToIdle(
                  state,
                  context,
                  Menu.SelectMenuItem({ value: message.value }),
                ),
              'Idle',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                stepChildToOpen(
                  state,
                  context,
                  Menu.SelectMenuItem({ value: message.value }),
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          MovedPointerOverMenubarItem: [
            when(
              (state, message, context) =>
                stepChildToOpen(
                  state,
                  context,
                  Menu.MovedPointerOverItem({
                    index: message.index,
                    screenX: message.screenX,
                    screenY: message.screenY,
                  }),
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LeftMenubarItem: [
            when(
              (state, _message, context) =>
                stepChildToOpen(state, context, Menu.LeftItem()),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ClearedMenubarSearch: [
            when(
              (state, message, context) =>
                stepChildToOpen(
                  state,
                  context,
                  Menu.ClearedMenuSearch({ version: message.version }),
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          PressedMenubarKey: [
            when(
              (_state, message, context) =>
                message.key === 'Escape' && canDismissEscape(context),
              'Idle',
              ({ state }) =>
                Idle({
                  maybeFocusedMenuValue: Option.some(state.openMenuValue),
                  maybeLastSelected: state.maybeLastSelected,
                }),
            ),
            when(
              (state, message, context) =>
                adjacentMenuForKey(context, state.openMenuValue, message.key),
              'Open',
              ({ state, guardValue, context }) =>
                openChildMenu(
                  context,
                  guardValue,
                  'Keyboard',
                  'First',
                  state.maybeLastSelected,
                ),
            ),
            when(
              (state, message, context) =>
                stepChildToIdle(
                  state,
                  context,
                  Menu.PressedMenuKey({ key: message.key }),
                ),
              'Idle',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                stepChildToOpen(
                  state,
                  context,
                  Menu.PressedMenuKey({ key: message.key }),
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
        },
      },
    },
  },
)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  ToggleMenubarMenu: pace,
  OpenMenubarMenu: pace,
  CloseMenubar: pace,
  DismissMenubar: pace,
  SelectMenubarItem: pace,
  FocusMenubarTrigger: pace,
  HoverMenubarTrigger: pace,
  PressedMenubarKey: pace,
  MovedPointerOverMenubarItem: pace,
  LeftMenubarItem: pace,
  ClearedMenubarSearch: pace,
  PressedOutsideMenubar: pace,
})

/** Default synchronization: every Menubar Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Menubar kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The four painted slots of a Menubar Part: `Bar`, `Trigger`, `Content`, and
 * `Item`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Bar: {
    role: 'Menu',
    focus: 'None',
    gestures: [],
  },
  Trigger: {
    role: 'MenuItem',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleMenubarMenu' }],
  },
  Content: {
    role: 'Menu',
    focus: 'Container',
    gestures: [],
  },
  Item: {
    role: 'MenuItem',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectMenubarItem' }],
  },
}

const findItemAcrossMenus = (
  state: State,
  props: Props,
  itemValue: string,
): Option.Option<
  Readonly<{ menuValue: string; index: number; item: Menu.Item }>
> => {
  const inOpen =
    state._tag === 'Open'
      ? Option.flatMap(
          Array.findFirst(
            props.menus,
            menu => menu.value === state.openMenuValue,
          ),
          menu =>
            Option.flatMap(
              Array.findFirstIndex(
                menu.items,
                item => item.value === itemValue,
              ),
              index =>
                Option.map(Array.get(menu.items, index), item => ({
                  menuValue: menu.value,
                  index,
                  item,
                })),
            ),
        )
      : Option.none<
          Readonly<{ menuValue: string; index: number; item: Menu.Item }>
        >()
  return Option.orElse(inOpen, () =>
    Array.findFirst(
      Array.flatMap(props.menus, menu =>
        Array.map(menu.items, (item, index) => ({
          menuValue: menu.value,
          index,
          item,
        })),
      ),
      entry => entry.item.value === itemValue,
    ),
  )
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Bar') {
    return {
      id: barId(props.id),
      orientation: 'Horizontal',
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(props.labelledBy === undefined
        ? {}
        : { labelledBy: props.labelledBy }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Trigger') {
    return Option.match(
      Option.flatMap(maybeChoice, value =>
        Option.map(menuIndexByValue(props, value), index => ({ value, index })),
      ),
      {
        onNone: () => ({}),
        onSome: ({ value, index }) => {
          const isDisabled = isMenuDisabledAt(props)(index)
          const isExpanded = isMenuOpen(state, value)
          const isFocused = !isDisabled && isTriggerFocused(state, props, value)
          return {
            id: triggerId(props.id, value),
            hasPopup: 'menu',
            isExpanded,
            ...(isExpanded ? { controls: contentId(props.id, value) } : {}),
            tabIndex: isFocused ? 0 : -1,
            isCurrent: isFocused,
            ...(isDisabled ? { isDisabled: true } : {}),
          }
        },
      },
    )
  } else if (slot === 'Content') {
    const maybeMenuValue = Option.orElse(maybeChoice, () =>
      openMenuValueOf(state),
    )
    return Option.match(maybeMenuValue, {
      onNone: () => ({ isHidden: true }),
      onSome: menuValue => {
        const isOpenForMenu = isMenuOpen(state, menuValue)
        const maybeActiveId = isOpenForMenu
          ? Option.map(activeItemIndexOf(state), index =>
              itemId(props.id, menuValue, index),
            )
          : Option.none<string>()
        return {
          id: contentId(props.id, menuValue),
          labelledBy: triggerId(props.id, menuValue),
          orientation: 'Vertical',
          ...(Option.isSome(maybeActiveId)
            ? { activeId: maybeActiveId.value }
            : {}),
          ...(isOpenForMenu ? {} : { isHidden: true }),
        }
      },
    })
  } else if (slot === 'Item') {
    return Option.match(
      Option.flatMap(maybeChoice, value =>
        findItemAcrossMenus(state, props, value),
      ),
      {
        onNone: () => ({}),
        onSome: ({ menuValue, index, item }) => {
          const isDisabled = isDisabledOf(props) || item.isDisabled === true
          const isCurrent =
            isMenuOpen(state, menuValue) &&
            Option.contains(activeItemIndexOf(state), index)
          return {
            id: itemId(props.id, menuValue, index),
            isCurrent,
            ...(isDisabled ? { isDisabled: true } : {}),
          }
        },
      },
    )
  } else {
    return {}
  }
}

/** What a restart opens a Menubar on: idle with no open dropdown and no transient focus override. */
export const atRest = (_state: State): State => initial

// PART FACTORY

/** Options for customizing a Menubar Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Menubar device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Menubar {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's Menubar local to one device.
 *
 * @example
 * ```typescript
 * const AppMenubar = Menubar.make({ name: 'AppMenubar' })
 * const LocalMenubar = Menubar.deviceOnly({ name: 'LocalMenubar' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Menubar',
    State,
    Message,
    chart,
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? synced
        : deviceSync(options.sync),
    category: options.category ?? 'Navigation',
    slots,
    atRest,
    project: projectSlot,
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
  })

/** Default synced Menubar {@link Part.Part} (`name: 'Menubar'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

/** Creates a device-only Menubar {@link Part.Part} (`Device({ because })`, defaulting to `'OwnView'`). */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
    sync: options.because ?? 'OwnView',
  })

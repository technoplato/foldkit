import { Array, Match as M, Option, Result, Schema as S, pipe } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import * as Command from '../command/index.js'
import {
  type GuardedEdge,
  define,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import type { ItemMenu } from '../renderers/types.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as Layers from './layers.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as Placement from './placement.js'
import * as RovingFocus from './rovingFocus.js'
import * as Typeahead from './typeahead.js'

// NOTE: this is the core Menu Part (Widget #1 of 54, Scribe #2606). It
// composes `layers`, `rovingFocus`, `typeahead`, `placement`, and (through
// `Part.compose` and `Slot`) `longPress` into one framework-free Machine
// and Part declaration. Its state lives in the Model, synced by default
// with a device-only option, and projects reference-stable SlotBindings
// that the generic HTML, React, and React Native hosts render with zero
// Menu-specific painter logic.

// CONSTANTS

/** Minimum pointer hold duration (ms) before releasing on a menu item counts as drag-to-select. */
export const dragSelectHoldMs = 200

/** Minimum pointer movement (px) from press origin before releasing counts as drag-to-select. */
export const dragSelectMovementPx = 5

// SCHEMAS

/** Whether the active item was highlighted by a pointer or by the keyboard. */
export const ActivationTrigger = S.Literals(['Pointer', 'Keyboard'])
/** Whether the active item was highlighted by a pointer or by the keyboard. */
export type ActivationTrigger = typeof ActivationTrigger.Type

/** Screen-space pointer coordinates used to ignore redundant same-position hover events. */
export const PointerPosition = S.Struct({
  screenX: S.Number,
  screenY: S.Number,
})
/** Screen-space pointer coordinates. */
export type PointerPosition = typeof PointerPosition.Type

/** Pointer down origin used to decide whether a pointer release counts as drag-to-select. */
export const PointerOrigin = S.Struct({
  screenX: S.Number,
  screenY: S.Number,
  timeStamp: S.Number,
})
/** Pointer down origin. */
export type PointerOrigin = typeof PointerOrigin.Type

/** The last item selected from the menu: its value and index. */
export const SelectedRecord = S.Struct({
  value: S.String,
  index: S.Number,
})
/** The last item selected from the menu. */
export type SelectedRecord = typeof SelectedRecord.Type

/** One item in a Menu, as plain data. */
export const Item = S.Struct({
  value: S.String,
  label: S.String,
  searchText: S.optionalKey(S.String),
  isDisabled: S.optionalKey(S.Boolean),
})
/** One item in a Menu, as plain data. */
export type Item = typeof Item.Type

/** Optional placement spacing overrides for the Menu panel. */
export const PlacementOptions = S.Struct({
  gapPx: S.optionalKey(S.Number),
  edgePx: S.optionalKey(S.Number),
})
/** Optional placement spacing overrides. */
export type PlacementOptions = typeof PlacementOptions.Type

/**
 * Read-only props supplied to the Menu chart and projection from the
 * Program's Model. Items are plain data; the chart reads them without
 * copying them into its state.
 */
export const Props = S.Struct({
  id: S.String,
  items: S.Array(Item),
  isModal: S.optionalKey(S.Boolean),
  loop: S.optionalKey(S.Boolean),
  closeOnSelect: S.optionalKey(S.Boolean),
  orientation: S.optionalKey(RovingFocus.Orientation),
  direction: S.optionalKey(RovingFocus.Direction),
  layers: S.optionalKey(Layers.Stack),
  searchResetMs: S.optionalKey(S.Number),
  placement: S.optionalKey(PlacementOptions),
})
/** Read-only props supplied to the Menu chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The menu is closed, optionally remembering the last selected item. */
export const Closed = ts('Closed', {
  maybeLastSelected: S.Option(SelectedRecord),
})
/** The menu is closed. */
export type Closed = typeof Closed.Type

/** The menu is open, tracking its optional target, highlighted item, trigger, typeahead buffer, and last pointer position. */
export const Open = ts('Open', {
  maybeTarget: S.Option(S.String),
  maybeActiveIndex: S.Option(S.Number),
  activationTrigger: ActivationTrigger,
  typeahead: Typeahead.State,
  maybeLastPointerPosition: S.Option(PointerPosition),
  maybeLastSelected: S.Option(SelectedRecord),
})
/** The menu is open. */
export type Open = typeof Open.Type

/** Where a Menu stands. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open])
/** Where a Menu stands. */
export type State = typeof State.Type

/** Initial Menu state: closed with no selection. */
export const initial: State = Closed({ maybeLastSelected: Option.none() })

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Toggles the menu between closed and open. */
export const ToggleMenu = Catalog.action('ToggleMenu', {
  what: 'Opens the menu or closes it when open',
  why: 'To reveal or hide the menu items',
  meta: { label: 'Menu', keys: [] },
})

/** Opens the menu for a specific target (for example a row or word context menu). */
export const OpenMenuFor = Catalog.action('OpenMenuFor', {
  fields: { target: S.String },
  choose: {
    field: 'target',
    noun: 'target',
    prompt: 'Open the menu for which target?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No target is available',
  },
  what: 'Opens the menu for a chosen target',
  why: 'To see actions that apply to that target',
  meta: { label: 'Open menu', keys: [] },
})

/** Closes the open menu unconditionally. */
export const CloseMenu = Catalog.action('CloseMenu', {
  what: 'Closes the open menu',
  why: 'To return to the content beneath it',
  meta: { label: 'Close menu', keys: [] },
})

/** Dismisses the open menu when it is the topmost dismissable layer. */
export const DismissMenu = Catalog.action('DismissMenu', {
  what: 'Dismisses the open menu when it is the topmost layer',
  why: 'To leave the menu without choosing an item',
  meta: { label: 'Dismiss menu', keys: [] },
})

/** Selects an enabled item from the open menu by its value. */
export const SelectMenuItem = Catalog.action('SelectMenuItem', {
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
  what: 'Chooses an enabled item from the open menu',
  why: 'To carry out that item’s action',
  meta: { label: 'Select item', keys: [] },
})

/** The Catalog Actions a Menu Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ToggleMenu,
  OpenMenuFor,
  CloseMenu,
  DismissMenu,
  SelectMenuItem,
]

// MESSAGES (Facts in addition to the Actions above)

/** Opens the menu with an explicit target, initial active index, and activation trigger. */
export const OpenedMenu = m('OpenedMenu', {
  maybeTarget: S.Option(S.String),
  maybeActiveIndex: S.Option(S.Number),
  activationTrigger: ActivationTrigger,
})

/** A key was pressed while focus is on the trigger button. */
export const PressedTriggerKey = m('PressedTriggerKey', { key: S.String })

/** A key was pressed while the menu is open. */
export const PressedMenuKey = m('PressedMenuKey', { key: S.String })

/** A roving focus move was requested while the menu is open. */
export const MovedHighlight = m('MovedHighlight', { move: RovingFocus.Move })

/** A specific item index was highlighted. */
export const HighlightedItem = m('HighlightedItem', {
  index: S.Number,
  activationTrigger: ActivationTrigger,
})

/** The pointer moved over an item at `index` with screen coordinates. */
export const MovedPointerOverItem = m('MovedPointerOverItem', {
  index: S.Number,
  screenX: S.Number,
  screenY: S.Number,
})

/** The pointer left the currently hovered item. */
export const LeftItem = m('LeftItem')

/** A printable character was typed for typeahead search while open. */
export const SearchedMenu = m('SearchedMenu', { key: S.String })

/** The debounced typeahead reset wait finished for `version`. */
export const ClearedMenuSearch = m('ClearedMenuSearch', { version: S.Number })

/** A pointer press landed outside the layers listed in `insideIds`. */
export const PressedOutsideMenu = m('PressedOutsideMenu', {
  insideIds: S.Array(S.String),
})

/** Every Message the Menu chart handles. */
export const Message = S.Union([
  ToggleMenu,
  OpenMenuFor,
  CloseMenu,
  DismissMenu,
  SelectMenuItem,
  OpenedMenu,
  PressedTriggerKey,
  PressedMenuKey,
  MovedHighlight,
  HighlightedItem,
  MovedPointerOverItem,
  LeftItem,
  SearchedMenu,
  ClearedMenuSearch,
  PressedOutsideMenu,
])
/** Every Message the Menu chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Menu Part. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits out the typeahead debounce period and answers `ClearedMenuSearch` for `version`. */
export const WaitToClearMenuSearch = Command.define(
  'WaitToClearMenuSearch',
  { version: S.Number, afterMs: S.Number },
  ClearedMenuSearch,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ClearedMenuSearch({ version })),
)

// PURE RULES (shared by chart and thin painters such as @foldkit/ui Menu)

/** Derives the trigger button element id from a menu's base `id`. */
export const triggerId = (id: string): string => `${id}-button`

/** Derives the menu items container element id from a menu's base `id`. */
export const containerId = (id: string): string => `${id}-items`

/** Derives one menu item element id from a menu's base `id` and `index`. */
export const itemId = (id: string, index: number): string =>
  `${id}-item-${index}`

/**
 * True when `next` has the exact same screen coordinates as `maybeLast`,
 * so redundant pointer-move events caused by layout shifts or scrolling do
 * not steal keyboard highlight.
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
 * True when leaving an item with the pointer should clear the highlight:
 * pointer-activated highlights clear on leave, while keyboard-activated
 * highlights stay put.
 */
export const shouldDeactivateOnLeave = (trigger: ActivationTrigger): boolean =>
  trigger === 'Pointer'

/**
 * True when releasing the pointer over an active item after pressing on the
 * trigger button should select that item (drag-to-select): the pointer must
 * have an origin, an active item must be highlighted, movement must meet
 * {@link dragSelectMovementPx}, and elapsed time must meet
 * {@link dragSelectHoldMs}.
 */
export const shouldDragSelect = (
  input: Readonly<{
    maybeOrigin: Option.Option<PointerOrigin>
    maybeActiveIndex: Option.Option<number>
    screenX: number
    screenY: number
    timeStamp: number
  }>,
): boolean => {
  if (
    Option.isNone(input.maybeOrigin) ||
    Option.isNone(input.maybeActiveIndex)
  ) {
    return false
  }
  const origin = input.maybeOrigin.value
  const movedEnough =
    Math.abs(input.screenX - origin.screenX) >= dragSelectMovementPx ||
    Math.abs(input.screenY - origin.screenY) >= dragSelectMovementPx
  const heldEnough = input.timeStamp - origin.timeStamp >= dragSelectHoldMs
  return movedEnough && heldEnough
}

/**
 * Places a Menu panel by its anchor using `Placement.place`, applying any
 * `gapPx` and `edgePx` configured in `props.placement`.
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

// INTERNAL CHART HELPERS

const isItemDisabledAt =
  (props: Props) =>
  (index: number): boolean =>
    Option.exists(
      Array.get(props.items, index),
      item => item.isDisabled === true,
    )

const isEnabledIndex = (props: Props, index: number): boolean =>
  index >= 0 && index < props.items.length && !isItemDisabledAt(props)(index)

const itemSearchText = (item: Item): string => item.searchText ?? item.label

const layersOf = (props: Props): Layers.Stack =>
  props.layers ?? [Layers.layer(props.id, { isModal: props.isModal ?? false })]

const canDismissEscape = (props: Props): boolean =>
  Layers.canDismissOnEscape(layersOf(props), props.id)

const canDismissOutside = (
  props: Props,
  insideIds: ReadonlyArray<string>,
): boolean =>
  Layers.canDismissOnOutsidePress(layersOf(props), props.id, insideIds)

const rovingMoveOf = (
  props: Props,
  key: string,
): Option.Option<RovingFocus.Move> =>
  RovingFocus.moveOfKey(key, {
    ...(props.orientation === undefined
      ? {}
      : { orientation: props.orientation }),
    ...(props.direction === undefined ? {} : { direction: props.direction }),
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
    loop: props.loop ?? true,
  })

const enabledByValue = (
  props: Props,
  value: string,
): Option.Option<SelectedRecord> =>
  pipe(
    Array.findFirstIndex(props.items, item => item.value === value),
    Option.filter(index => isEnabledIndex(props, index)),
    Option.map(index => ({ value, index })),
  )

const enabledActiveRecord = (
  state: Open,
  props: Props,
): Option.Option<SelectedRecord> =>
  Option.flatMap(state.maybeActiveIndex, index =>
    pipe(
      Array.get(props.items, index),
      Option.filter(item => item.isDisabled !== true),
      Option.map(item => ({ value: item.value, index })),
    ),
  )

const shouldCloseOnSelect = (props: Props): boolean =>
  props.closeOnSelect ?? true

const openedState = (
  input: Readonly<{
    maybeTarget: Option.Option<string>
    maybeActiveIndex: Option.Option<number>
    activationTrigger: ActivationTrigger
  }>,
): Open =>
  Open({
    maybeTarget: input.maybeTarget,
    maybeActiveIndex: input.maybeActiveIndex,
    activationTrigger: input.activationTrigger,
    typeahead: Typeahead.initial,
    maybeLastPointerPosition: Option.none(),
    maybeLastSelected: Option.none(),
  })

const runTypeahead = (state: Open, props: Props, key: string) => {
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
    maybeActiveIndex: state.maybeActiveIndex,
    isDisabled: isItemDisabledAt(props),
    textOf: itemSearchText,
    isRefinement,
  })
  return {
    model: Open({
      ...state,
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
      WaitToClearMenuSearch({
        version: Typeahead.versionOf(nextTypeahead),
        afterMs: props.searchResetMs ?? Typeahead.resetMs,
      }),
    ],
  }
}

const isActivationKey = (state: Open, key: string): boolean =>
  key === 'Enter' || (key === ' ' && !Typeahead.isSearching(state.typeahead))

const openKeyEdges = <
  TriggerMessage extends
    | typeof PressedTriggerKey.Type
    | typeof PressedMenuKey.Type,
>(): ReadonlyArray<
  GuardedEdge<State, Message, Open, TriggerMessage, never, Props>
> => [
  when(
    (_state: Open, message: TriggerMessage, context: Props) =>
      message.key === 'Escape' && canDismissEscape(context),
    'Closed',
    ({ state }) => Closed({ maybeLastSelected: state.maybeLastSelected }),
  ),
  when(
    (state: Open, message: TriggerMessage, context: Props) =>
      isActivationKey(state, message.key) && shouldCloseOnSelect(context)
        ? enabledActiveRecord(state, context)
        : Option.none(),
    'Closed',
    ({ guardValue }) => Closed({ maybeLastSelected: Option.some(guardValue) }),
  ),
  when(
    (state: Open, message: TriggerMessage, context: Props) =>
      isActivationKey(state, message.key) && !shouldCloseOnSelect(context)
        ? enabledActiveRecord(state, context)
        : Option.none(),
    'Open',
    ({ state, guardValue }) =>
      Open({ ...state, maybeLastSelected: Option.some(guardValue) }),
  ),
  when(
    (_state: Open, message: TriggerMessage, context: Props) =>
      rovingMoveOf(context, message.key),
    'Open',
    ({ state, guardValue, context }) =>
      Open({
        ...state,
        maybeActiveIndex: stepHighlight(
          context,
          state.maybeActiveIndex,
          guardValue,
        ),
        activationTrigger: 'Keyboard',
      }),
  ),
  when(
    (state: Open, message: TriggerMessage) =>
      Typeahead.isSearchKey(
        message.key,
        Typeahead.isSearching(state.typeahead),
      ),
    'Open',
    ({ state, message, context }) => runTypeahead(state, context, message.key),
  ),
  ignore(),
]

// CHART

/**
 * The Menu Machine chart: every open/close path, roving highlight,
 * typeahead search and debounced reset, pointer hover deduplication, item
 * selection, and layer-aware Escape / outside-press dismissal.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Closed: {
        on: {
          ToggleMenu: to('Open', () =>
            openedState({
              maybeTarget: Option.none(),
              maybeActiveIndex: Option.none(),
              activationTrigger: 'Pointer',
            }),
          ),
          OpenMenuFor: to('Open', ({ message }) =>
            openedState({
              maybeTarget: Option.some(message.target),
              maybeActiveIndex: Option.none(),
              activationTrigger: 'Pointer',
            }),
          ),
          OpenedMenu: to('Open', ({ message }) =>
            openedState({
              maybeTarget: message.maybeTarget,
              maybeActiveIndex: message.maybeActiveIndex,
              activationTrigger: message.activationTrigger,
            }),
          ),
          PressedTriggerKey: [
            when(
              (_state, message) =>
                message.key === 'Enter' ||
                message.key === ' ' ||
                message.key === 'ArrowDown',
              'Open',
              ({ context }) =>
                openedState({
                  maybeTarget: Option.none(),
                  maybeActiveIndex: RovingFocus.firstEnabled(
                    context.items.length,
                    isItemDisabledAt(context),
                  ),
                  activationTrigger: 'Keyboard',
                }),
            ),
            when(
              (_state, message) => message.key === 'ArrowUp',
              'Open',
              ({ context }) =>
                openedState({
                  maybeTarget: Option.none(),
                  maybeActiveIndex: RovingFocus.lastEnabled(
                    context.items.length,
                    isItemDisabledAt(context),
                  ),
                  activationTrigger: 'Keyboard',
                }),
            ),
            ignore(),
          ],
        },
      },
      Open: {
        on: {
          ToggleMenu: to('Closed', ({ state }) =>
            Closed({ maybeLastSelected: state.maybeLastSelected }),
          ),
          OpenMenuFor: to('Open', ({ message }) =>
            openedState({
              maybeTarget: Option.some(message.target),
              maybeActiveIndex: Option.none(),
              activationTrigger: 'Pointer',
            }),
          ),
          OpenedMenu: to('Open', ({ message }) =>
            openedState({
              maybeTarget: message.maybeTarget,
              maybeActiveIndex: message.maybeActiveIndex,
              activationTrigger: message.activationTrigger,
            }),
          ),
          CloseMenu: to('Closed', ({ state }) =>
            Closed({ maybeLastSelected: state.maybeLastSelected }),
          ),
          DismissMenu: [
            when(
              (_state, _message, context) => canDismissEscape(context),
              'Closed',
              ({ state }) =>
                Closed({ maybeLastSelected: state.maybeLastSelected }),
            ),
            ignore(),
          ],
          PressedOutsideMenu: [
            when(
              (_state, message, context) =>
                canDismissOutside(context, message.insideIds),
              'Closed',
              ({ state }) =>
                Closed({ maybeLastSelected: state.maybeLastSelected }),
            ),
            ignore(),
          ],
          SelectMenuItem: [
            when(
              (_state, message, context) =>
                shouldCloseOnSelect(context)
                  ? enabledByValue(context, message.value)
                  : Option.none(),
              'Closed',
              ({ guardValue }) =>
                Closed({ maybeLastSelected: Option.some(guardValue) }),
            ),
            when(
              (_state, message, context) =>
                !shouldCloseOnSelect(context)
                  ? enabledByValue(context, message.value)
                  : Option.none(),
              'Open',
              ({ state, guardValue }) =>
                Open({
                  ...state,
                  maybeLastSelected: Option.some(guardValue),
                }),
            ),
            ignore(),
          ],
          MovedHighlight: to('Open', ({ state, message, context }) =>
            Open({
              ...state,
              maybeActiveIndex: stepHighlight(
                context,
                state.maybeActiveIndex,
                message.move,
              ),
              activationTrigger: 'Keyboard',
            }),
          ),
          HighlightedItem: [
            when(
              (_state, message, context) =>
                isEnabledIndex(context, message.index),
              'Open',
              ({ state, message }) =>
                Open({
                  ...state,
                  maybeActiveIndex: Option.some(message.index),
                  activationTrigger: message.activationTrigger,
                }),
            ),
            ignore(),
          ],
          MovedPointerOverItem: [
            when(
              (state, message, context) =>
                isEnabledIndex(context, message.index) &&
                !isSamePointerPosition(state.maybeLastPointerPosition, {
                  screenX: message.screenX,
                  screenY: message.screenY,
                }),
              'Open',
              ({ state, message }) =>
                Open({
                  ...state,
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
          LeftItem: [
            when(
              state => shouldDeactivateOnLeave(state.activationTrigger),
              'Open',
              ({ state }) =>
                Open({ ...state, maybeActiveIndex: Option.none() }),
            ),
            ignore(),
          ],
          SearchedMenu: to('Open', ({ state, message, context }) =>
            runTypeahead(state, context, message.key),
          ),
          ClearedMenuSearch: [
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
                return Open({ ...state, typeahead: nextTypeahead })
              },
            ),
            ignore(),
          ],
          PressedTriggerKey: openKeyEdges<typeof PressedTriggerKey.Type>(),
          PressedMenuKey: openKeyEdges<typeof PressedMenuKey.Type>(),
        },
      },
    },
  },
)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  ToggleMenu: pace,
  OpenMenuFor: pace,
  CloseMenu: pace,
  DismissMenu: pace,
  SelectMenuItem: pace,
  OpenedMenu: pace,
  PressedTriggerKey: pace,
  PressedMenuKey: pace,
  MovedHighlight: pace,
  HighlightedItem: pace,
  MovedPointerOverItem: pace,
  LeftItem: pace,
  SearchedMenu: pace,
  ClearedMenuSearch: pace,
  PressedOutsideMenu: pace,
})

/** Default synchronization: every Menu Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Menu kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The five painted slots of a Menu Part. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleMenu' }],
  },
  ContextTrigger: {
    focus: 'None',
    gestures: [
      { gesture: 'HeldLong', becomes: 'OpenMenuFor' },
      { gesture: 'PressedSecondary', becomes: 'OpenMenuFor' },
    ],
  },
  Container: {
    role: 'Menu',
    focus: 'Container',
    gestures: [],
  },
  Item: {
    role: 'MenuItem',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectMenuItem' }],
  },
  Backdrop: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'DismissMenu' }],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
) => {
  if (slot === 'Trigger') {
    return {
      id: triggerId(props.id),
      isExpanded: state._tag === 'Open',
    }
  } else if (slot === 'ContextTrigger') {
    return {
      isExpanded: Option.match(maybeChoice, {
        onNone: () => state._tag === 'Open',
        onSome: target =>
          state._tag === 'Open' && Option.contains(state.maybeTarget, target),
      }),
    }
  } else if (slot === 'Container') {
    const maybeActiveId =
      state._tag === 'Open'
        ? Option.map(state.maybeActiveIndex, index => itemId(props.id, index))
        : Option.none<string>()
    return {
      id: containerId(props.id),
      ...Option.match(maybeActiveId, {
        onNone: () => ({}),
        onSome: activeId => ({ activeId }),
      }),
    }
  } else if (slot === 'Item') {
    return Option.match(
      Option.flatMap(maybeChoice, value =>
        Array.findFirstIndex(props.items, item => item.value === value),
      ),
      {
        onNone: () => ({}),
        onSome: index => {
          const isDisabled = isItemDisabledAt(props)(index)
          const isCurrent =
            state._tag === 'Open' &&
            Option.contains(state.maybeActiveIndex, index)
          return {
            id: itemId(props.id, index),
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

/** What a restart opens a Menu on: closed with no selection. */
export const atRest = (_state: State): State => initial

// PART FACTORY

/** Options for customizing a Menu Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Menu device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Menu {@link Part.Part}. Synced by default (`category: 'Navigation'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Menu local to one device.
 *
 * @example
 * ```typescript
 * const ActionsMenu = Menu.make({ name: 'ActionsMenu' })
 * const LocalMenu = Menu.make({ name: 'LocalMenu', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Menu',
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

/**
 * Shorthand for a Menu Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalMenu = Menu.deviceOnly({ name: 'LocalMenu' })
 * ```
 */
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

/** The default synced Menu Part (`name: 'Menu'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

// READINGS & SCREEN HELPERS

/** True when the Menu is open. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** The currently highlighted item index when open, or none. */
export const activeIndexOf = (state: State): Option.Option<number> =>
  state._tag === 'Open' ? state.maybeActiveIndex : Option.none()

/** The currently highlighted item when open, or none. */
export const activeItemOf = (state: State, props: Props): Option.Option<Item> =>
  Option.flatMap(activeIndexOf(state), index => Array.get(props.items, index))

/** The target key the Menu opened on (for a context menu), or none. */
export const targetOf = (state: State): Option.Option<string> =>
  state._tag === 'Open' ? state.maybeTarget : Option.none()

/** The last selected item record, or none. */
export const lastSelectedOf = (state: State): Option.Option<SelectedRecord> =>
  state.maybeLastSelected

/** The current accumulated typeahead query while open, or `''`. */
export const searchQueryOf = (state: State): string =>
  state._tag === 'Open' ? Typeahead.queryOf(state.typeahead) : ''

/**
 * Projects an open Menu into the `ItemMenu` field a `List` node reads on
 * HTML, React, and React Native, or `{}` while closed.
 *
 * @example
 * ```typescript
 * List({ label: 'Library', items, ...Menu.itemMenuOf(views.Menu, props) })
 * ```
 */
export const itemMenuOf = (
  view: Part.View<State>,
  props: Props,
): Readonly<{ menu?: ItemMenu }> =>
  M.value(view.state).pipe(
    M.withReturnType<Readonly<{ menu?: ItemMenu }>>(),
    M.tagsExhaustive({
      Closed: () => ({}),
      Open: ({ maybeTarget }) => ({
        menu: {
          key: Option.getOrElse(maybeTarget, () => props.id),
          items: Array.filterMap(props.items, item =>
            item.isDisabled === true
              ? Result.failVoid
              : Result.succeed({
                  action: Part.pressOf(
                    SelectMenuItem.tag,
                    Option.some(item.value),
                  ),
                  label: item.label,
                }),
          ),
          dismissAction: DismissMenu.tag,
        },
      }),
    }),
  )

import { Array, Option, Schema as S, pipe } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import * as Command from '../command/index.js'
import {
  define,
  ignore,
  otherwise,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as HoverIntent from './hoverIntent.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as RovingFocus from './rovingFocus.js'
import { SlotOrientation, type SlotProps } from './slot.js'

// NOTE: this is the core Navigation Menu / Nav Part (Widget #21 of 54,
// Scribe #2659). It composes `RovingFocus` and `HoverIntent` in one
// framework-free Machine and Part declaration covering packages/ui Nav, Zag
// navigation-menu, and Radix navigation-menu. Its state (`Closed` | `Open`)
// lives in the Model, synced by default (`Navigation` category, `Pace.Synced`)
// with a device-only option, and projects reference-stable SlotBindings (`Nav`,
// `Trigger`, `Link`, `Content`) rendered by HTML, React, and React Native
// generic hosts with zero Nav-specific painter logic.

// CONSTANTS

/** Standard WAI-ARIA `aria-current` token marking the active page link (`'page'`). */
export const ariaCurrentPage = 'page'

/** Default hover-open delay for submenu triggers in milliseconds (`200`). */
export const defaultOpenDelayMs: number = HoverIntent.defaultOpenDelayMs

/** Default hover-close grace delay in milliseconds (`300`). */
export const defaultCloseDelayMs: number = HoverIntent.defaultCloseDelayMs

/** Default navigation bar orientation (`'Horizontal'`). */
export const defaultOrientation: Orientation = 'Horizontal'

/** Default horizontal reading direction (`'Ltr'`). */
export const defaultDirection: RovingFocus.Direction = 'Ltr'

// SCHEMAS

/** Layout axis of the navigation bar (`Horizontal` or `Vertical`). */
export const Orientation = SlotOrientation
/** Layout axis of the navigation bar. */
export type Orientation = typeof Orientation.Type

/** Reading direction for horizontal arrow navigation (`Ltr` or `Rtl`). */
export const Direction = RovingFocus.Direction
/** Reading direction for horizontal arrow navigation. */
export type Direction = typeof Direction.Type

/** Standard `data-state` attribute value (`'open' | 'closed'`). */
export const DataState = S.Literals(['open', 'closed'])
/** Standard `data-state` attribute value. */
export type DataState = typeof DataState.Type

/** One navigation item in the bar: either a direct link or a submenu trigger. */
export const Item = S.Struct({
  value: S.String,
  label: S.String,
  href: S.optionalKey(S.String),
  hasSubmenu: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
})
/** One navigation item in the bar. */
export type Item = typeof Item.Type

/**
 * Read-only configuration supplied to the Nav chart and projection from the
 * Program's Model. Items, current route value, orientation, reading direction,
 * hover delays, and disabled flags stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  items: S.Array(Item),
  currentValue: S.optionalKey(S.String),
  orientation: S.optionalKey(Orientation),
  direction: S.optionalKey(Direction),
  loop: S.optionalKey(S.Boolean),
  pageKeys: S.optionalKey(S.Boolean),
  openDelayMs: S.optionalKey(S.Number),
  closeDelayMs: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the Nav chart and projection. */
export type Props = typeof Props.Type

/** Keyboard outcome moving roving focus to the item with `value`. */
export const FocusItemOutcome = ts('FocusItemOutcome', { value: S.String })
/** Keyboard outcome moving roving focus to the item with `value`. */
export type FocusItemOutcome = typeof FocusItemOutcome.Type

/** Keyboard outcome opening the submenu for `value`. */
export const OpenSubmenuOutcome = ts('OpenSubmenuOutcome', { value: S.String })
/** Keyboard outcome opening the submenu for `value`. */
export type OpenSubmenuOutcome = typeof OpenSubmenuOutcome.Type

/** Keyboard outcome toggling the submenu for `value`. */
export const ToggleSubmenuOutcome = ts('ToggleSubmenuOutcome', {
  value: S.String,
})
/** Keyboard outcome toggling the submenu for `value`. */
export type ToggleSubmenuOutcome = typeof ToggleSubmenuOutcome.Type

/** Keyboard outcome closing any open submenu. */
export const CloseSubmenuOutcome = ts('CloseSubmenuOutcome')
/** Keyboard outcome closing any open submenu. */
export type CloseSubmenuOutcome = typeof CloseSubmenuOutcome.Type

/** Pure keyboard outcome resolved for a key press in a navigation bar. */
export const KeyOutcome = S.Union([
  FocusItemOutcome,
  OpenSubmenuOutcome,
  ToggleSubmenuOutcome,
  CloseSubmenuOutcome,
])
/** Pure keyboard outcome resolved for a key press in a navigation bar. */
export type KeyOutcome = typeof KeyOutcome.Type

// STATE

/** No navigation submenu is open (either idle or waiting for a hover open delay). */
export const Closed = ts('Closed', {
  maybeFocusedValue: S.Option(S.String),
  maybePendingValue: S.Option(S.String),
  intent: HoverIntent.State,
})
/** No navigation submenu is open. */
export type Closed = typeof Closed.Type

/** A navigation submenu is open on `openValue` (engaged or in its close grace period). */
export const Open = ts('Open', {
  openValue: S.String,
  maybePreviousValue: S.Option(S.String),
  maybeFocusedValue: S.Option(S.String),
  intent: HoverIntent.State,
})
/** A navigation submenu is open on `openValue`. */
export type Open = typeof Open.Type

/** Where a Nav Part stands: `Closed` or `Open`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open])
/** Where a Nav Part stands. */
export type State = typeof State.Type

/** Initial Nav state: closed, no explicit focus, fresh `HoverIntent`. */
export const initial: State = Closed({
  maybeFocusedValue: Option.none(),
  maybePendingValue: Option.none(),
  intent: HoverIntent.initial,
})

/** Creates an initial Nav state with submenu `value` open. */
export const initialOpen = (value: string): State =>
  Open({
    openValue: value,
    maybePreviousValue: Option.none(),
    maybeFocusedValue: Option.some(value),
    intent: HoverIntent.chart.transition(
      HoverIntent.initial,
      HoverIntent.ShowNow(),
      { openDelayMs: 0, closeDelayMs: 0, isInteractive: true },
    )[0],
  })

// ACTIONS

const chooseNavItem: Readonly<{
  field: 'value'
  noun: string
  prompt: string
  token: typeof S.String
  choicesOf: () => ReadonlyArray<never>
  accepts: () => ReturnType<typeof Catalog.Enabled>
  nothingToChoose: string
}> = {
  field: 'value',
  noun: 'section',
  prompt: 'Which navigation section?',
  token: S.String,
  choicesOf: () => [],
  accepts: () => Catalog.Enabled(),
  nothingToChoose: 'No navigation section is available',
}

/** Opens the submenu for the chosen navigation item. */
export const OpenNavItem = Catalog.action('OpenNavItem', {
  fields: { value: S.String },
  choose: chooseNavItem,
  what: 'Opens the submenu for the chosen navigation item',
  why: 'To browse the links inside that section',
  meta: { label: 'Open section', keys: [] },
})

/** Opens or closes the submenu for the chosen navigation item. */
export const ToggleNavItem = Catalog.action('ToggleNavItem', {
  fields: { value: S.String },
  choose: chooseNavItem,
  what: 'Opens or closes the submenu for the chosen navigation item',
  why: 'To reveal or hide the links inside that section',
  meta: { label: 'Toggle section', keys: [] },
})

/** Closes any open navigation submenu. */
export const CloseNav = Catalog.action('CloseNav', {
  what: 'Closes any open navigation submenu',
  why: 'To return attention to the primary bar',
  meta: { label: 'Close navigation', keys: ['Escape'] },
})

/** The Catalog Actions a Nav Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenNavItem,
  ToggleNavItem,
  CloseNav,
]

// MESSAGES

/** Pointer entered a submenu trigger item. */
export const EnterNavTrigger = m('EnterNavTrigger', { value: S.String })

/** Pointer left a submenu trigger item. */
export const LeaveNavTrigger = m('LeaveNavTrigger', { value: S.String })

/** Pointer entered the open submenu content panel. */
export const EnterNavContent = m('EnterNavContent')

/** Pointer left the open submenu content panel. */
export const LeaveNavContent = m('LeaveNavContent')

/** Focus moved onto a navigation bar item without opening its submenu. */
export const FocusNavItem = m('FocusNavItem', { value: S.String })

/** Focus left the navigation bar. */
export const BlurNav = m('BlurNav')

/** A roving focus move was requested across the navigation bar items. */
export const MoveNavFocus = m('MoveNavFocus', { move: RovingFocus.Move })

/** A keyboard key was pressed while focus is inside the navigation bar. */
export const PressedNavKey = m('PressedNavKey', { key: S.String })

/** A scheduled hover-open delay elapsed for `value` and `version`. */
export const ElapsedNavOpen = m('ElapsedNavOpen', {
  value: S.String,
  version: S.Number,
})

/** A scheduled hover-close grace period elapsed for `version`. */
export const ElapsedNavClose = m('ElapsedNavClose', { version: S.Number })

/** Every Message the Nav chart handles. */
export const Message = S.Union([
  OpenNavItem,
  ToggleNavItem,
  CloseNav,
  EnterNavTrigger,
  LeaveNavTrigger,
  EnterNavContent,
  LeaveNavContent,
  FocusNavItem,
  BlurNav,
  MoveNavFocus,
  PressedNavKey,
  ElapsedNavOpen,
  ElapsedNavClose,
])
/** Every Message the Nav chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Nav Part. */
export const isMessage = S.is(Message)

// COMMANDS

/** Waits `afterMs` milliseconds and answers `ElapsedNavOpen({ value, version })`. */
export const WaitForNavOpen = Command.define(
  'WaitForNavOpen',
  { value: S.String, version: S.Number, afterMs: S.Number },
  ElapsedNavOpen,
)(({ value, version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedNavOpen({ value, version })),
)

/** Waits `afterMs` milliseconds and answers `ElapsedNavClose({ version })`. */
export const WaitForNavClose = Command.define(
  'WaitForNavClose',
  { version: S.Number, afterMs: S.Number },
  ElapsedNavClose,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedNavClose({ version })),
)

// ELEMENT IDS

/** Derives the navigation landmark container element id from a base `id`. */
export const navId = (id: string): string => `${id}-nav`

/** Derives a submenu trigger button element id from a base `id` and item `value`. */
export const triggerId = (id: string, value: string): string =>
  `${id}-trigger-${value}`

/** Derives a navigation link element id from a base `id` and item `value`. */
export const linkId = (id: string, value: string): string =>
  `${id}-link-${value}`

/** Derives a submenu content panel element id from a base `id` and item `value`. */
export const contentId = (id: string, value: string): string =>
  `${id}-content-${value}`

// CONFIGURATION & PURE RULES

/** Resolved navigation bar orientation (`'Horizontal'` by default). */
export const orientationOf = (
  props: Pick<Props, 'orientation'> = {},
): Orientation => props.orientation ?? defaultOrientation

/** Resolved reading direction (`'Ltr'` by default). */
export const directionOf = (props: Pick<Props, 'direction'> = {}): Direction =>
  props.direction ?? defaultDirection

/** Resolved roving loop behavior (`true` by default). */
export const loopOf = (props: Pick<Props, 'loop'> = {}): boolean =>
  props.loop ?? true

/** Resolved `PageUp`/`PageDown` support (`false` by default). */
export const pageKeysOf = (props: Pick<Props, 'pageKeys'> = {}): boolean =>
  props.pageKeys ?? false

/** Resolved hover-open delay in milliseconds (`200` by default, clamped `>= 0`). */
export const openDelayMsOf = (props: Pick<Props, 'openDelayMs'> = {}): number =>
  Math.max(0, props.openDelayMs ?? defaultOpenDelayMs)

/** Resolved hover-close grace period in milliseconds (`300` by default, clamped `>= 0`). */
export const closeDelayMsOf = (
  props: Pick<Props, 'closeDelayMs'> = {},
): number => Math.max(0, props.closeDelayMs ?? defaultCloseDelayMs)

/** True when the entire navigation bar is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/**
 * True when `value` matches `currentValue` (the active page or section).
 *
 * @example
 * ```typescript
 * isCurrentItem('projects', 'projects') // true
 * isCurrentItem('dashboard', 'projects') // false
 * isCurrentItem('dashboard', undefined) // false
 * ```
 */
export const isCurrentItem = (
  value: string,
  currentValue: string | undefined,
): boolean => currentValue !== undefined && value === currentValue

/**
 * Returns `Option.some('page')` when `isCurrent` is true, else `Option.none()`.
 * Shared by thin HTML painters such as `@foldkit/ui` `Nav`.
 *
 * @example
 * ```typescript
 * ariaCurrentOf(true) // Some('page')
 * ariaCurrentOf(false) // None
 * ```
 */
export const ariaCurrentOf = (isCurrent: boolean): Option.Option<string> =>
  isCurrent ? Option.some(ariaCurrentPage) : Option.none()

/**
 * Key that opens the focused item's submenu according to orientation and
 * reading direction: `'ArrowDown'` for horizontal bars, `'ArrowRight'` for
 * vertical LTR bars, and `'ArrowLeft'` for vertical RTL bars.
 */
export const entryKeyOf = (
  props: Pick<Props, 'orientation' | 'direction'> = {},
): string => {
  if (orientationOf(props) === 'Horizontal') {
    return 'ArrowDown'
  } else {
    return directionOf(props) === 'Rtl' ? 'ArrowLeft' : 'ArrowRight'
  }
}

/** True when `key` activates or toggles a focused submenu trigger (`'Enter'` or `' '`). */
export const isActivationKey = (key: string): boolean =>
  key === 'Enter' || key === ' '

/** True when `key` is `'Escape'`. */
export const isEscapeKey = HoverIntent.isEscapeKey

/** Looks up one item in `props.items` by its `value`. */
export const itemByValue = (
  props: Pick<Props, 'items'>,
  value: string,
): Option.Option<Item> =>
  Array.findFirst(props.items, item => item.value === value)

/** True when item `value` is disabled (globally via `props.isDisabled` or on the item itself). */
export const isItemDisabled = (
  props: Pick<Props, 'items' | 'isDisabled'>,
  value: string,
): boolean =>
  isDisabledOf(props) ||
  Option.exists(itemByValue(props, value), item => item.isDisabled === true)

/** True when item `value` exists, is enabled, and declares `hasSubmenu: true`. */
export const isSubmenuItem = (
  props: Pick<Props, 'items' | 'isDisabled'>,
  value: string,
): boolean =>
  !isDisabledOf(props) &&
  Option.exists(
    itemByValue(props, value),
    item => item.isDisabled !== true && item.hasSubmenu === true,
  )

const isItemDisabledAt =
  (props: Pick<Props, 'items' | 'isDisabled'>) =>
  (index: number): boolean =>
    isDisabledOf(props) ||
    Option.exists(
      Array.get(props.items, index),
      item => item.isDisabled === true,
    )

const indexByValue = (
  props: Pick<Props, 'items'>,
  value: string,
): Option.Option<number> =>
  Array.findFirstIndex(props.items, item => item.value === value)

const enabledIndexByValue = (
  props: Pick<Props, 'items' | 'isDisabled'>,
  value: string,
): Option.Option<number> =>
  isDisabledOf(props)
    ? Option.none()
    : Option.filter(
        indexByValue(props, value),
        index => !isItemDisabledAt(props)(index),
      )

const enabledValueAt = (
  props: Pick<Props, 'items' | 'isDisabled'>,
  index: number,
): Option.Option<string> =>
  isDisabledOf(props)
    ? Option.none()
    : pipe(
        Array.get(props.items, index),
        Option.filter(item => item.isDisabled !== true),
        Option.map(item => item.value),
      )

// READINGS

/** True when any submenu is currently open. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** Currently open submenu item value, or `Option.none()` when closed. */
export const openValueOf = (state: State): Option.Option<string> =>
  state._tag === 'Open' ? Option.some(state.openValue) : Option.none()

/** Previously open submenu item value when switching between submenus, or `Option.none()`. */
export const previousValueOf = (state: State): Option.Option<string> =>
  state._tag === 'Open' ? state.maybePreviousValue : Option.none()

/** Submenu item value waiting on `openDelayMs` before opening, or `Option.none()`. */
export const pendingValueOf = (state: State): Option.Option<string> =>
  state._tag === 'Closed' ? state.maybePendingValue : Option.none()

/** True when the submenu for `value` is currently open. */
export const isItemOpen = (state: State, value: string): boolean =>
  state._tag === 'Open' && state.openValue === value

/** True while waiting for `openDelayMs` to elapse before opening a submenu. */
export const isOpening = (state: State): boolean =>
  state._tag === 'Closed' && HoverIntent.isOpening(state.intent)

/** True while an open submenu is counting down `closeDelayMs` after pointer departure. */
export const isClosing = (state: State): boolean =>
  state._tag === 'Open' && HoverIntent.isClosing(state.intent)

/** Standard `data-state` attribute value for the navigation menu (`'open' | 'closed'`). */
export const dataStateOf = (state: State): DataState =>
  isOpen(state) ? 'open' : 'closed'

/** Standard `data-state` attribute value for one navigation item (`'open' | 'closed'`). */
export const itemDataStateOf = (state: State, value: string): DataState =>
  isItemOpen(state, value) ? 'open' : 'closed'

/**
 * The currently roving-focused item's index in `props.items`, falling back to
 * the open submenu item, the `currentValue` item, or the first enabled item.
 * Returns `Option.none()` when disabled or no enabled item exists.
 */
export const focusedIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> => {
  if (isDisabledOf(props)) {
    return Option.none()
  }
  const fromFocused = Option.flatMap(state.maybeFocusedValue, value =>
    enabledIndexByValue(props, value),
  )
  const fromOpen =
    state._tag === 'Open'
      ? enabledIndexByValue(props, state.openValue)
      : Option.none<number>()
  const fromCurrent =
    props.currentValue === undefined
      ? Option.none<number>()
      : enabledIndexByValue(props, props.currentValue)
  return pipe(
    fromFocused,
    Option.orElse(() => fromOpen),
    Option.orElse(() => fromCurrent),
    Option.orElse(() =>
      RovingFocus.firstEnabled(props.items.length, isItemDisabledAt(props)),
    ),
  )
}

/** The currently roving-focused item's value, or `Option.none()`. */
export const focusedValueOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(focusedIndexOf(state, props), index =>
    enabledValueAt(props, index),
  )

/** True when item `value` currently holds roving focus (`tabIndex: 0`). */
export const isItemFocused = (
  state: State,
  props: Props,
  value: string,
): boolean => Option.contains(focusedValueOf(state, props), value)

/**
 * Resolves a key press in a navigation bar into a pure {@link KeyOutcome}.
 *
 * - `Escape` -> `CloseSubmenuOutcome`
 * - Entry key (`ArrowDown` horizontal, `ArrowRight` vertical LTR, `ArrowLeft`
 *   vertical RTL) on a focused submenu item -> `OpenSubmenuOutcome`
 * - `Enter` / `' '` on a focused submenu item -> `ToggleSubmenuOutcome`
 * - Arrow / `Home` / `End` keys -> `FocusItemOutcome` via `RovingFocus`
 */
export const resolveKeyOutcome = (
  state: State,
  props: Props,
  key: string,
): Option.Option<KeyOutcome> => {
  if (isDisabledOf(props)) {
    return Option.none()
  }
  if (isEscapeKey(key)) {
    return Option.some(CloseSubmenuOutcome())
  }
  const maybeFocused = focusedValueOf(state, props)
  if (
    key === entryKeyOf(props) &&
    Option.exists(maybeFocused, value => isSubmenuItem(props, value))
  ) {
    return Option.map(maybeFocused, value => OpenSubmenuOutcome({ value }))
  }
  if (
    isActivationKey(key) &&
    Option.exists(maybeFocused, value => isSubmenuItem(props, value))
  ) {
    return Option.map(maybeFocused, value => ToggleSubmenuOutcome({ value }))
  }
  return pipe(
    RovingFocus.resolveKey({
      key,
      count: props.items.length,
      current: focusedIndexOf(state, props),
      isDisabled: isItemDisabledAt(props),
      orientation: orientationOf(props),
      direction: directionOf(props),
      loop: loopOf(props),
      pageKeys: pageKeysOf(props),
    }),
    Option.flatMap(index => enabledValueAt(props, index)),
    Option.map(value => FocusItemOutcome({ value })),
  )
}

// INTERNAL TRANSITION HELPERS

type StepOpen = Readonly<{
  model: Open
  commands: ReadonlyArray<Command.Command<Message>>
}>

type StepClosed = Readonly<{
  model: Closed
  commands: ReadonlyArray<Command.Command<Message>>
}>

const hoverIntentPropsOf = (props: Props): HoverIntent.Props => ({
  openDelayMs: openDelayMsOf(props),
  closeDelayMs: closeDelayMsOf(props),
  isInteractive: true,
})

const openWaitCommandsOf = (
  value: string,
  nextIntent: HoverIntent.State,
  intentCommands: ReadonlyArray<Command.Command<HoverIntent.Message>>,
  props: Props,
): ReadonlyArray<Command.Command<Message>> =>
  Array.some(
    intentCommands,
    command => command.name === HoverIntent.WaitBeforeOpening.name,
  )
    ? [
        WaitForNavOpen({
          value,
          version: nextIntent.openVersion,
          afterMs: openDelayMsOf(props),
        }),
      ]
    : []

const closeWaitCommandsOf = (
  intentMessage: HoverIntent.Message,
  nextIntent: HoverIntent.State,
  intentCommands: ReadonlyArray<Command.Command<HoverIntent.Message>>,
  props: Props,
): ReadonlyArray<Command.Command<Message>> =>
  Array.some(
    intentCommands,
    command => command.name === HoverIntent.WaitBeforeClosing.name,
  )
    ? [
        WaitForNavClose({
          version: nextIntent.closeVersion,
          afterMs: HoverIntent.closeWaitDelayMsOf(
            intentMessage,
            hoverIntentPropsOf(props),
          ),
        }),
      ]
    : []

const showNowIntent = (
  intent: HoverIntent.State,
  props: Props,
): HoverIntent.State =>
  HoverIntent.chart.transition(
    intent,
    HoverIntent.ShowNow(),
    hoverIntentPropsOf(props),
  )[0]

const stepFocusMove = (
  state: State,
  props: Props,
  move: RovingFocus.Move,
): Option.Option<string> =>
  isDisabledOf(props)
    ? Option.none()
    : Option.flatMap(
        RovingFocus.stepEnabled({
          count: props.items.length,
          current: focusedIndexOf(state, props),
          move,
          isDisabled: isItemDisabledAt(props),
          loop: loopOf(props),
        }),
        index => enabledValueAt(props, index),
      )

const enterTriggerFromClosed = (
  state: Closed,
  value: string,
  props: Props,
): Option.Option<
  Readonly<{ model: State; commands: ReadonlyArray<Command.Command<Message>> }>
> => {
  if (!isSubmenuItem(props, value)) {
    return Option.none()
  }
  const stepped = HoverIntent.chart.step(
    state.intent,
    HoverIntent.EnteredTrigger(),
    hoverIntentPropsOf(props),
  )
  if (stepped._tag !== 'Transitioned') {
    return Option.none()
  }
  const nextIntent = stepped.state
  const commands = openWaitCommandsOf(
    value,
    nextIntent,
    stepped.commands,
    props,
  )
  if (HoverIntent.isOpen(nextIntent)) {
    return Option.some({
      model: Open({
        openValue: value,
        maybePreviousValue: Option.none(),
        maybeFocusedValue: state.maybeFocusedValue,
        intent: nextIntent,
      }),
      commands,
    })
  } else {
    return Option.some({
      model: Closed({
        maybeFocusedValue: state.maybeFocusedValue,
        maybePendingValue: HoverIntent.isOpening(nextIntent)
          ? Option.some(value)
          : Option.none(),
        intent: nextIntent,
      }),
      commands,
    })
  }
}

const leaveFromOpen = (
  state: Open,
  intentMessage:
    | typeof HoverIntent.LeftTrigger.Type
    | typeof HoverIntent.LeftPanel.Type,
  props: Props,
): Option.Option<
  Readonly<{ model: State; commands: ReadonlyArray<Command.Command<Message>> }>
> => {
  const stepped = HoverIntent.chart.step(
    state.intent,
    intentMessage,
    hoverIntentPropsOf(props),
  )
  if (stepped._tag !== 'Transitioned') {
    return Option.none()
  }
  const nextIntent = stepped.state
  const commands = closeWaitCommandsOf(
    intentMessage,
    nextIntent,
    stepped.commands,
    props,
  )
  if (HoverIntent.isOpen(nextIntent)) {
    return Option.some({
      model: Open({
        openValue: state.openValue,
        maybePreviousValue: state.maybePreviousValue,
        maybeFocusedValue: state.maybeFocusedValue,
        intent: nextIntent,
      }),
      commands,
    })
  } else {
    return Option.some({
      model: Closed({
        maybeFocusedValue: state.maybeFocusedValue,
        maybePendingValue: Option.none(),
        intent: nextIntent,
      }),
      commands,
    })
  }
}

const stepHoverOpen = (
  state: Closed,
  value: string,
  version: number,
  props: Props,
): Option.Option<Open> => {
  if (
    !Option.contains(state.maybePendingValue, value) ||
    !isSubmenuItem(props, value)
  ) {
    return Option.none()
  }
  const stepped = HoverIntent.chart.step(
    state.intent,
    HoverIntent.ElapsedOpen({ version }),
    hoverIntentPropsOf(props),
  )
  if (stepped._tag !== 'Transitioned' || !HoverIntent.isOpen(stepped.state)) {
    return Option.none()
  }
  return Option.some(
    Open({
      openValue: value,
      maybePreviousValue: Option.none(),
      maybeFocusedValue: state.maybeFocusedValue,
      intent: stepped.state,
    }),
  )
}

const stepHoverClose = (
  state: Open,
  version: number,
  props: Props,
): Option.Option<Closed> => {
  const stepped = HoverIntent.chart.step(
    state.intent,
    HoverIntent.ElapsedClose({ version }),
    hoverIntentPropsOf(props),
  )
  if (stepped._tag !== 'Transitioned' || HoverIntent.isOpen(stepped.state)) {
    return Option.none()
  }
  return Option.some(
    Closed({
      maybeFocusedValue: state.maybeFocusedValue,
      maybePendingValue: Option.none(),
      intent: stepped.state,
    }),
  )
}

// CHART

/**
 * The Nav Machine chart: composes `RovingFocus` for horizontal/vertical
 * LTR/RTL keyboard navigation and `HoverIntent` for delayed hover-open,
 * skip-delay across sibling submenu triggers, hover-close grace periods, and
 * Escape dismissal.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Closed: {
        on: {
          OpenNavItem: [
            when(
              (_state, message, context) =>
                isSubmenuItem(context, message.value),
              'Open',
              ({ state, message, context }) =>
                Open({
                  openValue: message.value,
                  maybePreviousValue: Option.none(),
                  maybeFocusedValue: Option.some(message.value),
                  intent: showNowIntent(state.intent, context),
                }),
            ),
            ignore(),
          ],
          ToggleNavItem: [
            when(
              (_state, message, context) =>
                isSubmenuItem(context, message.value),
              'Open',
              ({ state, message, context }) =>
                Open({
                  openValue: message.value,
                  maybePreviousValue: Option.none(),
                  maybeFocusedValue: Option.some(message.value),
                  intent: showNowIntent(state.intent, context),
                }),
            ),
            ignore(),
          ],
          CloseNav: [
            when(
              state =>
                Option.isSome(state.maybePendingValue) ||
                HoverIntent.isOpening(state.intent),
              'Closed',
              ({ state }) =>
                Closed({
                  maybeFocusedValue: state.maybeFocusedValue,
                  maybePendingValue: Option.none(),
                  intent: HoverIntent.atRest(state.intent),
                }),
            ),
            ignore(),
          ],
          EnterNavTrigger: [
            when(
              (state, message, context): Option.Option<StepOpen> =>
                Option.flatMap(
                  enterTriggerFromClosed(state, message.value, context),
                  result =>
                    result.model._tag === 'Open'
                      ? Option.some({
                          model: result.model,
                          commands: result.commands,
                        })
                      : Option.none(),
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context): Option.Option<StepClosed> =>
                Option.flatMap(
                  enterTriggerFromClosed(state, message.value, context),
                  result =>
                    result.model._tag === 'Closed'
                      ? Option.some({
                          model: result.model,
                          commands: result.commands,
                        })
                      : Option.none(),
                ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LeaveNavTrigger: [
            when(
              (state, message, context): Option.Option<Closed> => {
                const stepped = HoverIntent.chart.step(
                  state.intent,
                  HoverIntent.LeftTrigger(),
                  hoverIntentPropsOf(context),
                )
                if (stepped._tag !== 'Transitioned') {
                  return Option.none()
                }
                const nextPending = Option.contains(
                  state.maybePendingValue,
                  message.value,
                )
                  ? Option.none<string>()
                  : state.maybePendingValue
                return Option.some(
                  Closed({
                    maybeFocusedValue: state.maybeFocusedValue,
                    maybePendingValue: nextPending,
                    intent: stepped.state,
                  }),
                )
              },
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          EnterNavContent: [ignore()],
          LeaveNavContent: [ignore()],
          FocusNavItem: [
            when(
              (_state, message, context) =>
                Option.isSome(enabledIndexByValue(context, message.value)),
              'Closed',
              ({ state, message }) =>
                Closed({
                  maybeFocusedValue: Option.some(message.value),
                  maybePendingValue: state.maybePendingValue,
                  intent: state.intent,
                }),
            ),
            ignore(),
          ],
          BlurNav: [
            when(
              state => Option.isSome(state.maybeFocusedValue),
              'Closed',
              ({ state }) =>
                Closed({
                  maybeFocusedValue: Option.none(),
                  maybePendingValue: state.maybePendingValue,
                  intent: state.intent,
                }),
            ),
            ignore(),
          ],
          MoveNavFocus: [
            when(
              (state, message, context) =>
                stepFocusMove(state, context, message.move),
              'Closed',
              ({ state, guardValue }) =>
                Closed({
                  maybeFocusedValue: Option.some(guardValue),
                  maybePendingValue: state.maybePendingValue,
                  intent: state.intent,
                }),
            ),
            ignore(),
          ],
          PressedNavKey: [
            when(
              (state, message, context): Option.Option<Open> =>
                Option.flatMap(
                  resolveKeyOutcome(state, context, message.key),
                  outcome =>
                    outcome._tag === 'OpenSubmenuOutcome' ||
                    outcome._tag === 'ToggleSubmenuOutcome'
                      ? Option.some(
                          Open({
                            openValue: outcome.value,
                            maybePreviousValue: Option.none(),
                            maybeFocusedValue: Option.some(outcome.value),
                            intent: showNowIntent(state.intent, context),
                          }),
                        )
                      : Option.none(),
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context): Option.Option<Closed> =>
                Option.flatMap(
                  resolveKeyOutcome(state, context, message.key),
                  outcome => {
                    if (outcome._tag === 'FocusItemOutcome') {
                      return Option.some(
                        Closed({
                          maybeFocusedValue: Option.some(outcome.value),
                          maybePendingValue: state.maybePendingValue,
                          intent: state.intent,
                        }),
                      )
                    } else if (outcome._tag === 'CloseSubmenuOutcome') {
                      const [nextIntent] = HoverIntent.chart.transition(
                        state.intent,
                        HoverIntent.PressedEscape(),
                        hoverIntentPropsOf(context),
                      )
                      return Option.some(
                        Closed({
                          maybeFocusedValue: state.maybeFocusedValue,
                          maybePendingValue: Option.none(),
                          intent: nextIntent,
                        }),
                      )
                    } else {
                      return Option.none()
                    }
                  },
                ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ElapsedNavOpen: [
            when(
              (state, message, context) =>
                stepHoverOpen(state, message.value, message.version, context),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ElapsedNavClose: [ignore()],
        },
      },
      Open: {
        on: {
          OpenNavItem: [
            when(
              (state, message, context) =>
                isSubmenuItem(context, message.value) &&
                state.openValue !== message.value,
              'Open',
              ({ state, message, context }) =>
                Open({
                  openValue: message.value,
                  maybePreviousValue: Option.some(state.openValue),
                  maybeFocusedValue: Option.some(message.value),
                  intent: showNowIntent(state.intent, context),
                }),
            ),
            ignore(),
          ],
          ToggleNavItem: [
            when(
              (state, message, context) =>
                !isDisabledOf(context) && state.openValue === message.value,
              'Closed',
              ({ state }) =>
                Closed({
                  maybeFocusedValue: state.maybeFocusedValue,
                  maybePendingValue: Option.none(),
                  intent: HoverIntent.atRest(state.intent),
                }),
            ),
            when(
              (_state, message, context) =>
                isSubmenuItem(context, message.value),
              'Open',
              ({ state, message, context }) =>
                Open({
                  openValue: message.value,
                  maybePreviousValue: Option.some(state.openValue),
                  maybeFocusedValue: Option.some(message.value),
                  intent: showNowIntent(state.intent, context),
                }),
            ),
            ignore(),
          ],
          CloseNav: to('Closed', ({ state }) =>
            Closed({
              maybeFocusedValue: state.maybeFocusedValue,
              maybePendingValue: Option.none(),
              intent: HoverIntent.atRest(state.intent),
            }),
          ),
          EnterNavTrigger: [
            when(
              (_state, message, context) =>
                isSubmenuItem(context, message.value),
              'Open',
              ({ state, message, context }) => {
                const [nextIntent] = HoverIntent.chart.transition(
                  state.intent,
                  HoverIntent.EnteredTrigger(),
                  hoverIntentPropsOf(context),
                )
                const isSwitching = state.openValue !== message.value
                return Open({
                  openValue: message.value,
                  maybePreviousValue: isSwitching
                    ? Option.some(state.openValue)
                    : state.maybePreviousValue,
                  maybeFocusedValue: state.maybeFocusedValue,
                  intent: nextIntent,
                })
              },
            ),
            ignore(),
          ],
          LeaveNavTrigger: [
            when(
              (state, message, context): Option.Option<StepClosed> =>
                state.openValue !== message.value
                  ? Option.none()
                  : Option.flatMap(
                      leaveFromOpen(state, HoverIntent.LeftTrigger(), context),
                      result =>
                        result.model._tag === 'Closed'
                          ? Option.some({
                              model: result.model,
                              commands: result.commands,
                            })
                          : Option.none(),
                    ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context): Option.Option<StepOpen> =>
                state.openValue !== message.value
                  ? Option.none()
                  : Option.flatMap(
                      leaveFromOpen(state, HoverIntent.LeftTrigger(), context),
                      result =>
                        result.model._tag === 'Open'
                          ? Option.some({
                              model: result.model,
                              commands: result.commands,
                            })
                          : Option.none(),
                    ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          EnterNavContent: [
            when(
              (state, _message, context): Option.Option<Open> => {
                const stepped = HoverIntent.chart.step(
                  state.intent,
                  HoverIntent.EnteredPanel(),
                  hoverIntentPropsOf(context),
                )
                return stepped._tag === 'Transitioned'
                  ? Option.some(
                      Open({
                        openValue: state.openValue,
                        maybePreviousValue: state.maybePreviousValue,
                        maybeFocusedValue: state.maybeFocusedValue,
                        intent: stepped.state,
                      }),
                    )
                  : Option.none()
              },
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LeaveNavContent: [
            when(
              (state, _message, context): Option.Option<StepClosed> =>
                Option.flatMap(
                  leaveFromOpen(state, HoverIntent.LeftPanel(), context),
                  result =>
                    result.model._tag === 'Closed'
                      ? Option.some({
                          model: result.model,
                          commands: result.commands,
                        })
                      : Option.none(),
                ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, _message, context): Option.Option<StepOpen> =>
                Option.flatMap(
                  leaveFromOpen(state, HoverIntent.LeftPanel(), context),
                  result =>
                    result.model._tag === 'Open'
                      ? Option.some({
                          model: result.model,
                          commands: result.commands,
                        })
                      : Option.none(),
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          FocusNavItem: [
            when(
              (_state, message, context) =>
                Option.isSome(enabledIndexByValue(context, message.value)),
              'Open',
              ({ state, message }) =>
                Open({
                  openValue: state.openValue,
                  maybePreviousValue: state.maybePreviousValue,
                  maybeFocusedValue: Option.some(message.value),
                  intent: state.intent,
                }),
            ),
            ignore(),
          ],
          BlurNav: [
            when(
              state => !HoverIntent.isPointerOver(state.intent),
              'Closed',
              ({ state }) =>
                Closed({
                  maybeFocusedValue: Option.none(),
                  maybePendingValue: Option.none(),
                  intent: HoverIntent.atRest(state.intent),
                }),
            ),
            otherwise(
              to('Open', ({ state }) =>
                Open({
                  openValue: state.openValue,
                  maybePreviousValue: state.maybePreviousValue,
                  maybeFocusedValue: Option.none(),
                  intent: state.intent,
                }),
              ),
            ),
          ],
          MoveNavFocus: [
            when(
              (state, message, context) =>
                stepFocusMove(state, context, message.move),
              'Open',
              ({ state, guardValue }) =>
                Open({
                  openValue: state.openValue,
                  maybePreviousValue: state.maybePreviousValue,
                  maybeFocusedValue: Option.some(guardValue),
                  intent: state.intent,
                }),
            ),
            ignore(),
          ],
          PressedNavKey: [
            when(
              (state, message, context): Option.Option<Closed> =>
                Option.flatMap(
                  resolveKeyOutcome(state, context, message.key),
                  outcome => {
                    if (outcome._tag === 'CloseSubmenuOutcome') {
                      const [nextIntent] = HoverIntent.chart.transition(
                        state.intent,
                        HoverIntent.PressedEscape(),
                        hoverIntentPropsOf(context),
                      )
                      return Option.some(
                        Closed({
                          maybeFocusedValue: state.maybeFocusedValue,
                          maybePendingValue: Option.none(),
                          intent: nextIntent,
                        }),
                      )
                    } else if (
                      outcome._tag === 'ToggleSubmenuOutcome' &&
                      outcome.value === state.openValue
                    ) {
                      return Option.some(
                        Closed({
                          maybeFocusedValue: Option.some(outcome.value),
                          maybePendingValue: Option.none(),
                          intent: HoverIntent.atRest(state.intent),
                        }),
                      )
                    } else {
                      return Option.none()
                    }
                  },
                ),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context): Option.Option<Open> =>
                Option.flatMap(
                  resolveKeyOutcome(state, context, message.key),
                  outcome => {
                    if (
                      outcome._tag === 'OpenSubmenuOutcome' ||
                      outcome._tag === 'ToggleSubmenuOutcome'
                    ) {
                      const isSwitching = state.openValue !== outcome.value
                      return Option.some(
                        Open({
                          openValue: outcome.value,
                          maybePreviousValue: isSwitching
                            ? Option.some(state.openValue)
                            : state.maybePreviousValue,
                          maybeFocusedValue: Option.some(outcome.value),
                          intent: showNowIntent(state.intent, context),
                        }),
                      )
                    } else if (outcome._tag === 'FocusItemOutcome') {
                      return Option.some(
                        Open({
                          openValue: state.openValue,
                          maybePreviousValue: state.maybePreviousValue,
                          maybeFocusedValue: Option.some(outcome.value),
                          intent: state.intent,
                        }),
                      )
                    } else {
                      return Option.none()
                    }
                  },
                ),
              'Open',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ElapsedNavOpen: [ignore()],
          ElapsedNavClose: [
            when(
              (state, message, context) =>
                stepHoverClose(state, message.version, context),
              'Closed',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** Default Nav Machine chart starting in `Closed`. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenNavItem: pace,
  ToggleNavItem: pace,
  CloseNav: pace,
  EnterNavTrigger: pace,
  LeaveNavTrigger: pace,
  EnterNavContent: pace,
  LeaveNavContent: pace,
  FocusNavItem: pace,
  BlurNav: pace,
  MoveNavFocus: pace,
  PressedNavKey: pace,
  ElapsedNavOpen: pace,
  ElapsedNavClose: pace,
})

/** Default synchronization: every Nav Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Nav kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The four painted slots of a Nav Part:
 * - `Nav`: the navigation container (`role="region"`, `aria-orientation`, `aria-label`).
 * - `Trigger`: a submenu trigger button (`role="button"`, `aria-expanded`, `aria-controls`, `aria-haspopup="menu"`, `ToggleNavItem`).
 * - `Link`: a navigation link item (`role="menuitem"`, `aria-current`, roving `tabIndex`).
 * - `Content`: a submenu content panel (`role="menu"`, `aria-labelledby`, `hidden` when closed).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Nav: {
    role: 'Region',
    focus: 'Container',
    gestures: [],
  },
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleNavItem' }],
  },
  Link: {
    role: 'MenuItem',
    focus: 'None',
    gestures: [],
  },
  Content: {
    role: 'Menu',
    focus: 'None',
    gestures: [],
  },
}

const activeElementIdOf = (state: State, props: Props): Option.Option<string> =>
  Option.flatMap(focusedValueOf(state, props), value =>
    Option.map(itemByValue(props, value), item =>
      item.hasSubmenu === true
        ? triggerId(props.id, item.value)
        : linkId(props.id, item.value),
    ),
  )

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Nav') {
    const maybeActiveId = activeElementIdOf(state, props)
    return {
      id: navId(props.id),
      orientation: orientationOf(props),
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(props.labelledBy === undefined
        ? {}
        : { labelledBy: props.labelledBy }),
      ...(Option.isSome(maybeActiveId)
        ? { activeId: maybeActiveId.value }
        : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Trigger') {
    const value = Option.getOrElse(maybeChoice, () => '')
    const isDisabled = isItemDisabled(props, value)
    return {
      id: triggerId(props.id, value),
      isExpanded: isItemOpen(state, value),
      controls: contentId(props.id, value),
      hasPopup: 'menu',
      isCurrent: isCurrentItem(value, props.currentValue),
      tabIndex: !isDisabled && isItemFocused(state, props, value) ? 0 : -1,
      ...(isDisabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Link') {
    const value = Option.getOrElse(maybeChoice, () => '')
    const isDisabled = isItemDisabled(props, value)
    return {
      id: linkId(props.id, value),
      isCurrent: isCurrentItem(value, props.currentValue),
      tabIndex: !isDisabled && isItemFocused(state, props, value) ? 0 : -1,
      ...(isDisabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Content') {
    const value = Option.getOrElse(maybeChoice, () => '')
    return {
      id: contentId(props.id, value),
      labelledBy: triggerId(props.id, value),
      ...(isItemOpen(state, value) ? {} : { isHidden: true }),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens Nav on: closed with no explicit focus or pending hover
 * delay, preserving `HoverIntent`'s monotonic version counters.
 */
export const atRest = (state: State): State =>
  Closed({
    maybeFocusedValue: Option.none(),
    maybePendingValue: Option.none(),
    intent: HoverIntent.atRest(state.intent),
  })

// PART FACTORY

/** Options for customizing a Nav Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Nav device-only. */
  sync?: 'Synced' | DeviceReason
  /** Optional submenu item value open initially. */
  defaultOpenValue?: string
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Nav {@link Part.Part}. Synced by default (`category: 'Navigation'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's Nav
 * local to one device.
 *
 * @example
 * ```typescript
 * const PrimaryNav = Nav.make({ name: 'PrimaryNav' })
 * const LocalNav = Nav.deviceOnly({ name: 'LocalNav' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Nav',
    State,
    Message,
    chart:
      options.defaultOpenValue === undefined
        ? chart
        : chartOf(initialOpen(options.defaultOpenValue)),
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
 * Shorthand for a Nav Part whose state stays on the device and is omitted from
 * the synced log and encoded Model.
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.defaultOpenValue === undefined
      ? {}
      : { defaultOpenValue: options.defaultOpenValue }),
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
    sync: options.because ?? 'OwnView',
  })

/** The default synced Nav Part (`name: 'Nav'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

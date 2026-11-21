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
import { SlotOrientation, type SlotProps } from './slot.js'

// NOTE: this is the core Toolbar Part (Widget #29 of 54, Scribe #2668). It
// composes `RovingFocus` into one framework-free Machine and Part declaration
// covering Radix toolbar semantics: horizontal or vertical orientation, LTR/RTL
// reading direction, looping or clamped keyboard roving, disabled group and
// per-item guards, roving tabindex (`0` on the active stop, `-1` on others),
// and Enter/Space activation. Its state (`Idle` | `Focused`) lives in the
// Model, synced by default (`Navigation` category, `Pace.Synced`) with
// `Toolbar.make` and `Toolbar.deviceOnly()`, and projects reference-stable
// `SlotBindings` (`Root`, `Item`).

// SCHEMAS

/** Controls the toolbar layout direction and which arrow keys rove between controls. */
export const Orientation = SlotOrientation
/** Controls the toolbar layout direction and which arrow keys rove between controls. */
export type Orientation = typeof Orientation.Type

/** Default toolbar orientation (`'Horizontal'`). */
export const defaultOrientation: Orientation = 'Horizontal'

/** Default horizontal reading direction (`'Ltr'`). */
export const defaultDirection: RovingFocus.Direction = 'Ltr'

/** One interactive control inside a Toolbar, as plain data. */
export const Item = S.Struct({
  value: S.String,
  label: S.String,
  isDisabled: S.optionalKey(S.Boolean),
})
/** One interactive control inside a Toolbar. */
export type Item = typeof Item.Type

/**
 * Read-only props supplied to the Toolbar chart and projection from the
 * Program's Model. Items and layout options stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  items: S.Array(Item),
  orientation: S.optionalKey(Orientation),
  direction: S.optionalKey(RovingFocus.Direction),
  loop: S.optionalKey(S.Boolean),
  pageKeys: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
})
/** Read-only props supplied to the Toolbar chart and projection. */
export type Props = typeof Props.Type

// STATE

/** Focus is outside the toolbar while remembering any last activated control. */
export const Idle = ts('Idle', {
  maybeLastActivatedValue: S.Option(S.String),
})
/** Focus is outside the toolbar. */
export type Idle = typeof Idle.Type

/** Focus is on `focusedValue` inside the toolbar, driving roving keyboard navigation. */
export const Focused = ts('Focused', {
  focusedValue: S.String,
  maybeLastActivatedValue: S.Option(S.String),
})
/** Focus is inside the toolbar. */
export type Focused = typeof Focused.Type

/** Where a Toolbar Part stands: `Idle` or `Focused`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Focused])
/** Where a Toolbar Part stands. */
export type State = typeof State.Type

/** Initial Toolbar state: idle with no activated item. */
export const initial: State = Idle({ maybeLastActivatedValue: Option.none() })

// ACTIONS

/** Activates an enabled toolbar control by its value and focuses it. */
export const ActivateToolbarItem = Catalog.action('ActivateToolbarItem', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'item',
    prompt: 'Activate which toolbar item?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No toolbar item is available',
  },
  what: 'Activates the chosen toolbar control',
  why: 'To carry out that tool’s action',
  meta: { label: 'Activate toolbar item', keys: [] },
})

/** Moves focus onto an enabled toolbar control by its value without activating it. */
export const FocusToolbarItem = Catalog.action('FocusToolbarItem', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'item',
    prompt: 'Focus which toolbar item?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No toolbar item is available',
  },
  what: 'Moves focus onto the chosen toolbar control',
  why: 'To target that entry for subsequent adjustments',
  meta: { label: 'Focus toolbar item', keys: [] },
})

/** The Catalog Actions a Toolbar Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ActivateToolbarItem,
  FocusToolbarItem,
]

// MESSAGES

/** Focus left the toolbar, returning to `Idle`. */
export const BlurToolbar = m('BlurToolbar')

/** A roving focus movement (`Next`, `Previous`, `First`, `Last`) was requested. */
export const MovedToolbarFocus = m('MovedToolbarFocus', {
  move: RovingFocus.Move,
})

/** A key was pressed while interacting with the toolbar. */
export const PressedToolbarKey = m('PressedToolbarKey', { key: S.String })

/** Reconciles focus against an updated `props.items` list. */
export const ReconcileToolbarItems = m('ReconcileToolbarItems')

/** Every Message the Toolbar chart handles. */
export const Message = S.Union([
  ActivateToolbarItem,
  FocusToolbarItem,
  BlurToolbar,
  MovedToolbarFocus,
  PressedToolbarKey,
  ReconcileToolbarItems,
])
/** Every Message the Toolbar chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Toolbar Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the toolbar root container element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives one toolbar item element id from a base `id` and `index`. */
export const itemId = (id: string, index: number): string =>
  `${id}-item-${index.toString()}`

// PURE RULES & CONFIGURATION READERS

/** Resolved orientation for `props` (`'Horizontal'` by default). */
export const orientationOf = (
  props: Pick<Props, 'orientation'> = {},
): Orientation => props.orientation ?? defaultOrientation

/** Resolved horizontal reading direction for `props` (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): RovingFocus.Direction => props.direction ?? defaultDirection

/** True when roving navigation wraps around the toolbar edges (`true` by default). */
export const loopOf = (props: Pick<Props, 'loop'> = {}): boolean =>
  props.loop ?? true

/** True when `PageUp` / `PageDown` jump to first/last enabled items (`true` by default). */
export const pageKeysOf = (props: Pick<Props, 'pageKeys'> = {}): boolean =>
  props.pageKeys ?? true

/** True when the entire toolbar is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when `key` activates the currently focused toolbar control (`'Enter'` or `' '`). */
export const isActivationKey = (key: string): boolean =>
  key === 'Enter' || key === ' '

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

/** True when keyboard focus is explicitly inside the toolbar. */
export const isFocused = (state: State): boolean => state._tag === 'Focused'

/**
 * The toolbar item index currently holding the roving tab stop (`tabIndex: 0`).
 * Uses `focusedValue` when `Focused` and still enabled, otherwise falls back to
 * the first enabled item so Tab entry is never stranded.
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
  return Option.orElse(fromFocused, () =>
    RovingFocus.firstEnabled(props.items.length, isItemDisabledAt(props)),
  )
}

/** The toolbar item value holding the roving tab stop, or none when empty or all disabled. */
export const focusedValueOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(focusedIndexOf(state, props), index =>
    Option.map(Array.get(props.items, index), item => item.value),
  )

/** True when the item with `value` holds the roving tab stop. */
export const isItemFocused = (
  state: State,
  props: Props,
  value: string,
): boolean => Option.contains(focusedValueOf(state, props), value)

/** True when the item with `value` is disabled (either individually or via the toolbar). */
export const isItemDisabled = (props: Props, value: string): boolean =>
  isDisabledOf(props) ||
  Option.exists(indexByValue(props, value), isItemDisabledAt(props))

/** The value of the most recently activated toolbar control, or none. */
export const lastActivatedValueOf = (state: State): Option.Option<string> =>
  state.maybeLastActivatedValue

// INTERNAL CHART HELPERS

const activateEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof ActivateToolbarItem.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof ActivateToolbarItem.Type, context: Props) =>
      enabledValueByValue(context, message.value),
    'Focused',
    ({ guardValue }) =>
      Focused({
        focusedValue: guardValue,
        maybeLastActivatedValue: Option.some(guardValue),
      }),
  ),
  ignore(),
]

const focusEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof FocusToolbarItem.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof FocusToolbarItem.Type, context: Props) =>
      enabledValueByValue(context, message.value),
    'Focused',
    ({ state, guardValue }) =>
      Focused({
        focusedValue: guardValue,
        maybeLastActivatedValue: state.maybeLastActivatedValue,
      }),
  ),
  ignore(),
]

const movedFocusEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof MovedToolbarFocus.Type, never, Props>
> => [
  when(
    (state: S, message: typeof MovedToolbarFocus.Type, context: Props) =>
      isDisabledOf(context)
        ? Option.none()
        : Option.flatMap(
            RovingFocus.stepEnabled({
              count: context.items.length,
              current: focusedIndexOf(state, context),
              move: message.move,
              isDisabled: isItemDisabledAt(context),
              loop: loopOf(context),
            }),
            index => enabledValueAt(context, index),
          ),
    'Focused',
    ({ state, guardValue }) =>
      Focused({
        focusedValue: guardValue,
        maybeLastActivatedValue: state.maybeLastActivatedValue,
      }),
  ),
  ignore(),
]

const pressedKeyEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof PressedToolbarKey.Type, never, Props>
> => [
  when(
    (state: S, message: typeof PressedToolbarKey.Type, context: Props) =>
      !isDisabledOf(context) && isActivationKey(message.key)
        ? focusedValueOf(state, context)
        : Option.none(),
    'Focused',
    ({ guardValue }) =>
      Focused({
        focusedValue: guardValue,
        maybeLastActivatedValue: Option.some(guardValue),
      }),
  ),
  when(
    (state: S, message: typeof PressedToolbarKey.Type, context: Props) =>
      isDisabledOf(context)
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
        focusedValue: guardValue,
        maybeLastActivatedValue: state.maybeLastActivatedValue,
      }),
  ),
  ignore(),
]

// CHART

/**
 * The Toolbar Machine chart: horizontal/vertical roving focus, LTR/RTL arrow
 * direction, looping or edge clamping, disabled item skipping, Enter/Space
 * activation, item reconciliation, and blur returning to `Idle`.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Idle: {
        on: {
          ActivateToolbarItem: activateEdges<Idle>(),
          FocusToolbarItem: focusEdges<Idle>(),
          MovedToolbarFocus: movedFocusEdges<Idle>(),
          PressedToolbarKey: pressedKeyEdges<Idle>(),
          ReconcileToolbarItems: [ignore()],
        },
      },
      Focused: {
        on: {
          ActivateToolbarItem: activateEdges<Focused>(),
          FocusToolbarItem: focusEdges<Focused>(),
          BlurToolbar: to('Idle', ({ state }) =>
            Idle({ maybeLastActivatedValue: state.maybeLastActivatedValue }),
          ),
          MovedToolbarFocus: movedFocusEdges<Focused>(),
          PressedToolbarKey: pressedKeyEdges<Focused>(),
          ReconcileToolbarItems: [
            when(
              (state, _message, context) =>
                Option.isNone(
                  enabledValueByValue(context, state.focusedValue),
                ) && Option.isSome(focusedValueOf(state, context)),
              'Focused',
              ({ state, context }) =>
                Focused({
                  focusedValue: Option.getOrElse(
                    focusedValueOf(state, context),
                    () => state.focusedValue,
                  ),
                  maybeLastActivatedValue: state.maybeLastActivatedValue,
                }),
            ),
            when(
              (state, _message, context) =>
                Option.isNone(focusedValueOf(state, context)),
              'Idle',
              ({ state }) =>
                Idle({
                  maybeLastActivatedValue: state.maybeLastActivatedValue,
                }),
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
  ActivateToolbarItem: pace,
  FocusToolbarItem: pace,
  BlurToolbar: pace,
  MovedToolbarFocus: pace,
  PressedToolbarKey: pace,
  ReconcileToolbarItems: pace,
})

/** Default synchronization: every Toolbar Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Toolbar kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The two painted slots of a Toolbar Part: `Root` and `Item`. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Item: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ActivateToolbarItem' }],
  },
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
    }
  } else if (slot === 'Item') {
    return Option.match(
      Option.flatMap(maybeChoice, value => indexByValue(props, value)),
      {
        onNone: () => ({}),
        onSome: index => {
          const isDisabled = isItemDisabledAt(props)(index)
          const isRovingTarget =
            !isDisabled && Option.contains(focusedIndexOf(state, props), index)
          return {
            id: itemId(props.id, index),
            tabIndex: isRovingTarget ? 0 : -1,
            isCurrent: isFocused(state) && isRovingTarget,
            ...(isDisabled ? { isDisabled: true } : {}),
          }
        },
      },
    )
  } else {
    return {}
  }
}

/** What a restart opens a Toolbar on: idle while preserving the last activated value. */
export const atRest = (state: State): State =>
  Idle({ maybeLastActivatedValue: state.maybeLastActivatedValue })

// PART FACTORY

/** Options for customizing a Toolbar Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Toolbar device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Toolbar {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's Toolbar local to one device.
 *
 * @example
 * ```typescript
 * const EditorToolbar = Toolbar.make({ name: 'EditorToolbar' })
 * const LocalToolbar = Toolbar.deviceOnly({ name: 'LocalToolbar' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Toolbar',
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

/** Default synced Toolbar {@link Part.Part} (`name: 'Toolbar'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

/** Creates a device-only Toolbar {@link Part.Part} (`Device({ because })`, defaulting to `'OwnView'`). */
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

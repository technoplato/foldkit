import { Array, Match as M, Option, Schema as S, pipe } from 'effect'

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

// NOTE: this is the core Tabs Part (Widget #3 of 54, Scribe #2613). It
// reuses `rovingFocus` in one framework-free Machine and Part declaration.
// Its state lives in the Model, synced by default (`Navigation` category)
// with a device-only option, and projects reference-stable SlotBindings
// (tablist, tab, tabpanel) that the generic HTML, React, and React Native
// hosts render with zero Tabs-specific painter logic.

// SCHEMAS

/** Controls the tablist layout direction and which arrow keys navigate between tabs. */
export const Orientation = SlotOrientation
/** Controls the tablist layout direction and which arrow keys navigate between tabs. */
export type Orientation = typeof Orientation.Type

/**
 * Controls whether arrow navigation activates the newly focused tab
 * immediately (`Automatic`) or moves focus alone until confirmed with
 * `Enter`, `Space`, or a press (`Manual`).
 */
export const ActivationMode = S.Literals(['Automatic', 'Manual'])
/** Controls whether tabs activate on arrow focus or require confirmation. */
export type ActivationMode = typeof ActivationMode.Type

/** One tab item, as plain data. */
export const Item = S.Struct({
  value: S.String,
  label: S.String,
  isDisabled: S.optionalKey(S.Boolean),
})
/** One tab item, as plain data. */
export type Item = typeof Item.Type

/**
 * Read-only props supplied to the Tabs chart and projection from the
 * Program's Model. Items are plain data; the chart reads them without
 * copying them into its state.
 */
export const Props = S.Struct({
  id: S.String,
  items: S.Array(Item),
  label: S.optionalKey(S.String),
  defaultValue: S.optionalKey(S.String),
  orientation: S.optionalKey(Orientation),
  direction: S.optionalKey(RovingFocus.Direction),
  activationMode: S.optionalKey(ActivationMode),
  loop: S.optionalKey(S.Boolean),
  deselectable: S.optionalKey(S.Boolean),
  pageKeys: S.optionalKey(S.Boolean),
})
/** Read-only props supplied to the Tabs chart and projection. */
export type Props = typeof Props.Type

/** A keyboard key press that commits selection to the tab at `index`. */
export const SelectIndex = ts('SelectIndex', { index: S.Number })
/** A keyboard key press that commits selection to the tab at `index`. */
export type SelectIndex = typeof SelectIndex.Type

/** A keyboard key press that moves focus to `index` without changing selection. */
export const FocusIndex = ts('FocusIndex', { index: S.Number })
/** A keyboard key press that moves focus to `index` without changing selection. */
export type FocusIndex = typeof FocusIndex.Type

/** The pure outcome of a key press on a tablist, shared by the chart and thin painters. */
export const KeyOutcome = S.Union([SelectIndex, FocusIndex])
/** The pure outcome of a key press on a tablist. */
export type KeyOutcome = typeof KeyOutcome.Type

// STATE

/** No tab has explicit keyboard focus divergence; focus follows the active tab. */
export const Idle = ts('Idle', {
  maybeSelectedValue: S.Option(S.String),
})
/** No tab has explicit keyboard focus divergence. */
export type Idle = typeof Idle.Type

/** Keyboard focus is on `focusedValue`, which may differ from `maybeSelectedValue` in `Manual` mode. */
export const Focused = ts('Focused', {
  maybeSelectedValue: S.Option(S.String),
  focusedValue: S.String,
})
/** Keyboard focus is on `focusedValue`. */
export type Focused = typeof Focused.Type

/** Where a Tabs Part stands. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Focused])
/** Where a Tabs Part stands. */
export type State = typeof State.Type

/** Initial Tabs state: idle, deferring to `props.defaultValue` or the first enabled tab. */
export const initial: State = Idle({ maybeSelectedValue: Option.none() })

/** Creates an initial Tabs state with `value` pre-selected. */
export const initialSelected = (value: string): State =>
  Idle({ maybeSelectedValue: Option.some(value) })

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Activates an enabled tab by its value and shows its panel. */
export const SelectTab = Catalog.action('SelectTab', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'tab',
    prompt: 'Select which tab?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No tab is available',
  },
  what: 'Activates the chosen tab and shows its panel',
  why: 'To switch to that section of content',
  meta: { label: 'Select tab', keys: [] },
})

/** Advances selection to the next enabled tab. */
export const SelectNextTab = Catalog.action('SelectNextTab', {
  what: 'Advances selection to the next enabled tab',
  why: 'To view the following section in order',
  meta: { label: 'Next tab', keys: [] },
})

/** Moves selection to the previous enabled tab. */
export const SelectPreviousTab = Catalog.action('SelectPreviousTab', {
  what: 'Moves selection to the previous enabled tab',
  why: 'To return to an earlier section in order',
  meta: { label: 'Previous tab', keys: [] },
})

/** The Catalog Actions a Tabs Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SelectTab,
  SelectNextTab,
  SelectPreviousTab,
]

// MESSAGES (Facts in addition to the Actions above)

/** A tab received focus without changing selection. */
export const FocusedTab = m('FocusedTab', { value: S.String })

/** Focus left the tablist, clearing any manual focus divergence. */
export const BlurredTabs = m('BlurredTabs')

/** A roving focus move was requested on the tablist. */
export const MovedFocus = m('MovedFocus', { move: RovingFocus.Move })

/** A key was pressed while focus is on a tab or the tablist. */
export const PressedTabKey = m('PressedTabKey', { key: S.String })

/** The currently focused tab was explicitly activated (for example via Enter or Space). */
export const ActivatedFocusedTab = m('ActivatedFocusedTab')

/** Clears the active selection when `props.deselectable` is enabled. */
export const ClearedTabSelection = m('ClearedTabSelection')

/** Every Message the Tabs chart handles. */
export const Message = S.Union([
  SelectTab,
  SelectNextTab,
  SelectPreviousTab,
  FocusedTab,
  BlurredTabs,
  MovedFocus,
  PressedTabKey,
  ActivatedFocusedTab,
  ClearedTabSelection,
])
/** Every Message the Tabs chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Tabs Part. */
export const isMessage = S.is(Message)

// PURE RULES & ELEMENT IDS (shared by chart and thin painters such as @foldkit/ui Tabs)

/** Derives the tablist container element id from a Tabs base `id`. */
export const listId = (id: string): string => `${id}-list`

/** Derives one tab button element id from a Tabs base `id` and `index`. */
export const tabId = (id: string, index: number): string => `${id}-tab-${index}`

/** Derives one tabpanel element id from a Tabs base `id` and `index`. */
export const panelId = (id: string, index: number): string =>
  `${id}-panel-${index}`

/** Resolved orientation for `props` (defaults to `'Horizontal'`). */
export const orientationOf = (props: Pick<Props, 'orientation'>): Orientation =>
  props.orientation ?? 'Horizontal'

/** Resolved reading direction for `props` (defaults to `'Ltr'`). */
export const directionOf = (
  props: Pick<Props, 'direction'>,
): RovingFocus.Direction => props.direction ?? 'Ltr'

/** Resolved activation mode for `props` (defaults to `'Automatic'`). */
export const activationModeOf = (
  props: Pick<Props, 'activationMode'>,
): ActivationMode => props.activationMode ?? 'Automatic'

/**
 * Resolves a key press on a tablist into a focus or selection outcome using
 * `RovingFocus.resolveKey` and `activationMode`.
 *
 * - Roving keys (`ArrowLeft`/`ArrowRight` in `Horizontal` respecting `Ltr`/`Rtl`,
 *   `ArrowUp`/`ArrowDown` in `Vertical`, `Home`, `End`, and `PageUp`/`PageDown`
 *   when `pageKeys` is true) produce `SelectIndex` in `Automatic` mode and
 *   `FocusIndex` in `Manual` mode.
 * - `Enter` and `' '` produce `SelectIndex` for the currently focused enabled tab.
 * - Any other key, or when no enabled tab exists, produces `Option.none()`.
 *
 * @example
 * ```typescript
 * resolveKeyOutcome({ key: 'ArrowRight', count: 3, current: Option.some(0) })
 * // Some(SelectIndex({ index: 1 }))
 * resolveKeyOutcome({ key: 'ArrowRight', count: 3, current: Option.some(0), activationMode: 'Manual' })
 * // Some(FocusIndex({ index: 1 }))
 * ```
 */
export const resolveKeyOutcome = (
  input: Readonly<{
    key: string
    count: number
    current: Option.Option<number>
    isDisabled?: (index: number) => boolean
    orientation?: Orientation
    direction?: RovingFocus.Direction
    activationMode?: ActivationMode
    loop?: boolean
    pageKeys?: boolean
  }>,
): Option.Option<KeyOutcome> => {
  const isDisabled = input.isDisabled ?? (() => false)
  const orientation = input.orientation ?? 'Horizontal'
  const direction = input.direction ?? 'Ltr'
  const activationMode = input.activationMode ?? 'Automatic'
  const loop = input.loop ?? true
  const pageKeys = input.pageKeys ?? true

  if (input.key === 'Enter' || input.key === ' ') {
    return pipe(
      input.current,
      Option.filter(
        index => index >= 0 && index < input.count && !isDisabled(index),
      ),
      Option.map(index => SelectIndex({ index })),
    )
  }

  return Option.map(
    RovingFocus.resolveKey({
      key: input.key,
      count: input.count,
      current: input.current,
      isDisabled,
      orientation,
      direction,
      loop,
      pageKeys,
    }),
    index =>
      M.value(activationMode).pipe(
        M.withReturnType<KeyOutcome>(),
        M.when('Automatic', () => SelectIndex({ index })),
        M.when('Manual', () => FocusIndex({ index })),
        M.exhaustive,
      ),
  )
}

// INTERNAL HELPERS

const isItemDisabledAt =
  (props: Props) =>
  (index: number): boolean =>
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
  pipe(
    Array.get(props.items, index),
    Option.filter(item => item.isDisabled !== true),
    Option.map(item => item.value),
  )

const defaultActiveIndex = (props: Props): Option.Option<number> =>
  props.deselectable === true
    ? Option.none()
    : Option.orElse(
        Option.flatMap(Option.fromNullishOr(props.defaultValue), value =>
          enabledIndexByValue(props, value),
        ),
        () =>
          RovingFocus.firstEnabled(props.items.length, isItemDisabledAt(props)),
      )

// READINGS

/**
 * The active tab's index in `props.items`, or none when empty, all disabled,
 * or deselected (`props.deselectable: true`).
 */
export const activeIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> =>
  Option.match(state.maybeSelectedValue, {
    onSome: value =>
      Option.orElse(indexByValue(props, value), () =>
        defaultActiveIndex(props),
      ),
    onNone: () => defaultActiveIndex(props),
  })

/** The active tab's value, or none. */
export const activeValueOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(activeIndexOf(state, props), index =>
    Option.map(Array.get(props.items, index), item => item.value),
  )

/** The active tab item, or none. */
export const activeItemOf = (state: State, props: Props): Option.Option<Item> =>
  Option.flatMap(activeIndexOf(state, props), index =>
    Array.get(props.items, index),
  )

/**
 * The focused tab's index in `props.items` (driving roving `tabIndex: 0`),
 * falling back to the active tab or first enabled tab when `Idle` or when the
 * stored focused value is absent/disabled.
 */
export const focusedIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> => {
  const fromFocused =
    state._tag === 'Focused'
      ? enabledIndexByValue(props, state.focusedValue)
      : Option.none<number>()
  return Option.orElse(fromFocused, () =>
    Option.orElse(
      Option.filter(activeIndexOf(state, props), index =>
        isEnabledIndex(props, index),
      ),
      () =>
        RovingFocus.firstEnabled(props.items.length, isItemDisabledAt(props)),
    ),
  )
}

/** The focused tab's value, or none. */
export const focusedValueOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(focusedIndexOf(state, props), index =>
    Option.map(Array.get(props.items, index), item => item.value),
  )

/** True when keyboard focus is explicitly inside the tablist. */
export const isFocused = (state: State): boolean => state._tag === 'Focused'

/** True when the tab with `value` is currently selected. */
export const isTabSelected = (
  state: State,
  props: Props,
  value: string,
): boolean => Option.contains(activeValueOf(state, props), value)

/** True when the tab with `value` currently holds roving focus. */
export const isTabFocused = (
  state: State,
  props: Props,
  value: string,
): boolean => Option.contains(focusedValueOf(state, props), value)

// CHART TRANSITION HELPERS

const selectOrToggleValue = (
  state: State,
  props: Props,
  value: string,
): Focused => {
  const shouldDeselect =
    props.deselectable === true &&
    Option.contains(activeValueOf(state, props), value)
  return Focused({
    maybeSelectedValue: shouldDeselect ? Option.none() : Option.some(value),
    focusedValue: value,
  })
}

const stepTabValue = (
  props: Props,
  from: Option.Option<number>,
  move: RovingFocus.Move,
): Option.Option<string> =>
  Option.flatMap(
    RovingFocus.stepEnabled({
      count: props.items.length,
      current: from,
      move,
      isDisabled: isItemDisabledAt(props),
      loop: props.loop ?? true,
    }),
    index => enabledValueAt(props, index),
  )

const selectTabEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof SelectTab.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof SelectTab.Type, context: Props) =>
      Option.flatMap(enabledIndexByValue(context, message.value), index =>
        enabledValueAt(context, index),
      ),
    'Focused',
    ({ state, guardValue, context }) =>
      selectOrToggleValue(state, context, guardValue),
  ),
  ignore(),
]

const stepSelectEdges = <
  S extends State,
  TriggerMessage extends
    | typeof SelectNextTab.Type
    | typeof SelectPreviousTab.Type,
>(
  move: RovingFocus.Move,
): ReadonlyArray<
  GuardedEdge<State, Message, S, TriggerMessage, never, Props>
> => [
  when(
    (state: S, _message: TriggerMessage, context: Props) =>
      stepTabValue(
        context,
        Option.orElse(activeIndexOf(state, context), () =>
          focusedIndexOf(state, context),
        ),
        move,
      ),
    'Focused',
    ({ guardValue }) =>
      Focused({
        maybeSelectedValue: Option.some(guardValue),
        focusedValue: guardValue,
      }),
  ),
  ignore(),
]

const focusTabEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof FocusedTab.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof FocusedTab.Type, context: Props) =>
      Option.flatMap(enabledIndexByValue(context, message.value), index =>
        enabledValueAt(context, index),
      ),
    'Focused',
    ({ state, guardValue }) =>
      Focused({
        maybeSelectedValue: state.maybeSelectedValue,
        focusedValue: guardValue,
      }),
  ),
  ignore(),
]

const movedFocusEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof MovedFocus.Type, never, Props>
> => [
  when(
    (state: S, message: typeof MovedFocus.Type, context: Props) =>
      stepTabValue(context, focusedIndexOf(state, context), message.move),
    'Focused',
    ({ state, guardValue, context }) =>
      M.value(activationModeOf(context)).pipe(
        M.withReturnType<Focused>(),
        M.when('Automatic', () =>
          Focused({
            maybeSelectedValue: Option.some(guardValue),
            focusedValue: guardValue,
          }),
        ),
        M.when('Manual', () =>
          Focused({
            maybeSelectedValue: state.maybeSelectedValue,
            focusedValue: guardValue,
          }),
        ),
        M.exhaustive,
      ),
  ),
  ignore(),
]

const pressedKeyEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof PressedTabKey.Type, never, Props>
> => [
  when(
    (state: S, message: typeof PressedTabKey.Type, context: Props) =>
      Option.flatMap(
        resolveKeyOutcome({
          key: message.key,
          count: context.items.length,
          current: focusedIndexOf(state, context),
          isDisabled: isItemDisabledAt(context),
          orientation: orientationOf(context),
          direction: directionOf(context),
          activationMode: activationModeOf(context),
          loop: context.loop ?? true,
          pageKeys: context.pageKeys ?? true,
        }),
        outcome =>
          Option.map(enabledValueAt(context, outcome.index), value => ({
            outcome,
            value,
            isExplicitActivation:
              message.key === 'Enter' || message.key === ' ',
          })),
      ),
    'Focused',
    ({ state, guardValue, context }) =>
      M.value(guardValue.outcome).pipe(
        M.withReturnType<Focused>(),
        M.tagsExhaustive({
          SelectIndex: () =>
            guardValue.isExplicitActivation
              ? selectOrToggleValue(state, context, guardValue.value)
              : Focused({
                  maybeSelectedValue: Option.some(guardValue.value),
                  focusedValue: guardValue.value,
                }),
          FocusIndex: () =>
            Focused({
              maybeSelectedValue: state.maybeSelectedValue,
              focusedValue: guardValue.value,
            }),
        }),
      ),
  ),
  ignore(),
]

const activateFocusedEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof ActivatedFocusedTab.Type, never, Props>
> => [
  when(
    (state: S, _message: typeof ActivatedFocusedTab.Type, context: Props) =>
      focusedValueOf(state, context),
    'Focused',
    ({ state, guardValue, context }) =>
      selectOrToggleValue(state, context, guardValue),
  ),
  ignore(),
]

// CHART

/**
 * The Tabs Machine chart: automatic and manual activation modes, horizontal
 * and vertical orientation, LTR and RTL reading directions, looping or
 * clamped roving focus, disabled tab skipping, optional deselection, and
 * blur clearing focus divergence.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Idle: {
        on: {
          SelectTab: selectTabEdges<Idle>(),
          SelectNextTab: stepSelectEdges<Idle, typeof SelectNextTab.Type>(
            'Next',
          ),
          SelectPreviousTab: stepSelectEdges<
            Idle,
            typeof SelectPreviousTab.Type
          >('Previous'),
          FocusedTab: focusTabEdges<Idle>(),
          MovedFocus: movedFocusEdges<Idle>(),
          PressedTabKey: pressedKeyEdges<Idle>(),
          ActivatedFocusedTab: activateFocusedEdges<Idle>(),
          ClearedTabSelection: [
            when(
              (_state, _message, context) => context.deselectable === true,
              'Idle',
              () => Idle({ maybeSelectedValue: Option.none() }),
            ),
            ignore(),
          ],
        },
      },
      Focused: {
        on: {
          SelectTab: selectTabEdges<Focused>(),
          SelectNextTab: stepSelectEdges<Focused, typeof SelectNextTab.Type>(
            'Next',
          ),
          SelectPreviousTab: stepSelectEdges<
            Focused,
            typeof SelectPreviousTab.Type
          >('Previous'),
          FocusedTab: focusTabEdges<Focused>(),
          BlurredTabs: to('Idle', ({ state }) =>
            Idle({ maybeSelectedValue: state.maybeSelectedValue }),
          ),
          MovedFocus: movedFocusEdges<Focused>(),
          PressedTabKey: pressedKeyEdges<Focused>(),
          ActivatedFocusedTab: activateFocusedEdges<Focused>(),
          ClearedTabSelection: [
            when(
              (_state, _message, context) => context.deselectable === true,
              'Focused',
              ({ state }) =>
                Focused({
                  maybeSelectedValue: Option.none(),
                  focusedValue: state.focusedValue,
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
  SelectTab: pace,
  SelectNextTab: pace,
  SelectPreviousTab: pace,
  FocusedTab: pace,
  BlurredTabs: pace,
  MovedFocus: pace,
  PressedTabKey: pace,
  ActivatedFocusedTab: pace,
  ClearedTabSelection: pace,
})

/** Default synchronization: every Tabs Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for Tabs kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The three painted slots of a Tabs Part: `List`, `Tab`, and `Panel`. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  List: {
    role: 'TabList',
    focus: 'None',
    gestures: [],
  },
  Tab: {
    role: 'Tab',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectTab' }],
  },
  Panel: {
    role: 'TabPanel',
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
  if (slot === 'List') {
    return {
      id: listId(props.id),
      orientation: orientationOf(props),
      ...(props.label === undefined ? {} : { label: props.label }),
    }
  } else if (slot === 'Tab') {
    return Option.match(
      Option.flatMap(maybeChoice, value => indexByValue(props, value)),
      {
        onNone: () => ({}),
        onSome: index => {
          const isDisabled = isItemDisabledAt(props)(index)
          const isSelected = Option.contains(activeIndexOf(state, props), index)
          const isRovingTarget =
            !isDisabled && Option.contains(focusedIndexOf(state, props), index)
          return {
            id: tabId(props.id, index),
            isSelected,
            controls: panelId(props.id, index),
            tabIndex: isRovingTarget ? 0 : -1,
            ...(isDisabled ? { isDisabled: true } : {}),
          }
        },
      },
    )
  } else if (slot === 'Panel') {
    return Option.match(
      Option.flatMap(maybeChoice, value => indexByValue(props, value)),
      {
        onNone: () => ({}),
        onSome: index => {
          const isSelected = Option.contains(activeIndexOf(state, props), index)
          return {
            id: panelId(props.id, index),
            labelledBy: tabId(props.id, index),
            tabIndex: isSelected ? 0 : -1,
            isHidden: !isSelected,
          }
        },
      },
    )
  } else {
    return {}
  }
}

/** What a restart opens Tabs on: keeps the selected tab and clears transient focus divergence. */
export const atRest = (state: State): State =>
  Idle({ maybeSelectedValue: state.maybeSelectedValue })

// PART FACTORY

/** Options for customizing a Tabs Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep Tabs device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Tabs {@link Part.Part}. Synced by default (`category: 'Navigation'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Tabs local to one device.
 *
 * @example
 * ```typescript
 * const SettingsTabs = Tabs.make({ name: 'SettingsTabs' })
 * const LocalTabs = Tabs.make({ name: 'LocalTabs', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Tabs',
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
 * Shorthand for a Tabs Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalTabs = Tabs.deviceOnly({ name: 'LocalTabs' })
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

/** The default synced Tabs Part (`name: 'Tabs'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

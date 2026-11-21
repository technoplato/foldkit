import { Array, Match as M, Option, Record, Schema as S, pipe } from 'effect'

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
import * as Presence from './presence.js'
import * as RovingFocus from './rovingFocus.js'
import { SlotOrientation, type SlotProps } from './slot.js'

// NOTE: this is the core Disclosure / Accordion Part (Widget #5 of 54,
// Scribe #2617). It composes `Presence` and `RovingFocus` in one
// framework-free Machine and Part declaration covering both:
// 1. Single collapsible / disclosure (toggleable trigger + panel, disabled
//    guard, Enter/Space key rule, optional animated Presence lifecycle).
// 2. Multi-item accordion (single or multiple open sections, collapsible
//    flag, disabled sections, horizontal/vertical LTR/RTL keyboard roving
//    over headers, optional per-section animated Presence lifecycle).
// Its state lives in the Model, synced by default (`Navigation` category)
// with a device-only option, and projects reference-stable SlotBindings
// rendered by HTML, React, and React Native generic hosts with zero
// Disclosure-specific painter logic.

// INTERNAL CONSTANTS

const SINGLE_KEY = ''

// SCHEMAS

/** Controls accordion layout direction and which arrow keys rove between headers. */
export const Orientation = SlotOrientation
/** Controls accordion layout direction and which arrow keys rove between headers. */
export type Orientation = typeof Orientation.Type

/** One accordion section, as plain data. */
export const Item = S.Struct({
  value: S.String,
  label: S.String,
  isDisabled: S.optionalKey(S.Boolean),
})
/** One accordion section, as plain data. */
export type Item = typeof Item.Type

/**
 * Read-only props supplied to the Disclosure chart and projection from the
 * Program's Model. Omit `items` for a single collapsible / disclosure, or
 * provide `items` for a multi-item accordion.
 */
export const Props = S.Struct({
  id: S.String,
  items: S.optionalKey(S.Array(Item)),
  defaultOpen: S.optionalKey(S.Boolean),
  defaultOpenValues: S.optionalKey(S.Array(S.String)),
  isMultiple: S.optionalKey(S.Boolean),
  isCollapsible: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  isAnimated: S.optionalKey(S.Boolean),
  orientation: S.optionalKey(Orientation),
  direction: S.optionalKey(RovingFocus.Direction),
  loop: S.optionalKey(S.Boolean),
  pageKeys: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
})
/** Read-only props supplied to the Disclosure chart and projection. */
export type Props = typeof Props.Type

/** A keyboard key press on an accordion header that toggles the section at `index`. */
export const ToggleIndex = ts('ToggleIndex', { index: S.Number })
/** A keyboard key press on an accordion header that toggles the section at `index`. */
export type ToggleIndex = typeof ToggleIndex.Type

/** A keyboard key press on an accordion header that moves roving focus to `index`. */
export const FocusIndex = ts('FocusIndex', { index: S.Number })
/** A keyboard key press on an accordion header that moves roving focus to `index`. */
export type FocusIndex = typeof FocusIndex.Type

/** The pure outcome of a key press on an accordion header. */
export const AccordionKeyOutcome = S.Union([ToggleIndex, FocusIndex])
/** The pure outcome of a key press on an accordion header. */
export type AccordionKeyOutcome = typeof AccordionKeyOutcome.Type

// STATE

const PresenceRecord = S.Record(S.String, Presence.State)

/** No accordion header currently holds explicit keyboard focus. */
export const Idle = ts('Idle', {
  hasExplicitState: S.Boolean,
  presences: PresenceRecord,
})
/** No accordion header currently holds explicit keyboard focus. */
export type Idle = typeof Idle.Type

/** Keyboard focus is on the accordion header `focusedValue`. */
export const Focused = ts('Focused', {
  hasExplicitState: S.Boolean,
  presences: PresenceRecord,
  focusedValue: S.String,
})
/** Keyboard focus is on the accordion header `focusedValue`. */
export type Focused = typeof Focused.Type

/** Where a Disclosure or Accordion Part stands. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Focused])
/** Where a Disclosure or Accordion Part stands. */
export type State = typeof State.Type

/** Initial Disclosure state: idle, deferring to `props.defaultOpen` / `props.defaultOpenValues`. */
export const initial: State = Idle({
  hasExplicitState: false,
  presences: {},
})

/** Creates an initial single-disclosure state that starts open. */
export const initialOpen: State = Idle({
  hasExplicitState: true,
  presences: { [SINGLE_KEY]: Presence.Open() },
})

/** Creates an initial accordion state with `values` pre-opened. */
export const initialOpenValues = (values: ReadonlyArray<string>): State =>
  Idle({
    hasExplicitState: true,
    presences: Record.fromEntries(
      Array.map(Array.dedupe(values), value => [value, Presence.Open()]),
    ),
  })

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Expands a single disclosure section. */
export const OpenDisclosure = Catalog.action('OpenDisclosure', {
  what: 'Reveals the hidden disclosure section',
  why: 'To read the content inside it',
  meta: { label: 'Expand', keys: [] },
})

/** Collapses a single disclosure section. */
export const CloseDisclosure = Catalog.action('CloseDisclosure', {
  what: 'Hides the expanded disclosure section',
  why: 'To collapse the section and save space',
  meta: { label: 'Collapse', keys: [] },
})

/** Toggles a single disclosure section between expanded and collapsed. */
export const ToggleDisclosure = Catalog.action('ToggleDisclosure', {
  what: 'Expands the disclosure section or collapses it when open',
  why: 'To reveal or conceal its content',
  meta: { label: 'Toggle disclosure', keys: [] },
})

const chooseSection: Readonly<{
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
  prompt: 'Which section?',
  token: S.String,
  choicesOf: () => [],
  accepts: () => Catalog.Enabled(),
  nothingToChoose: 'No section is available',
}

/** Expands one accordion section by its value. */
export const OpenDisclosureItem = Catalog.action('OpenDisclosureItem', {
  fields: { value: S.String },
  choose: chooseSection,
  what: 'Expands the chosen accordion section',
  why: 'To inspect that section of content',
  meta: { label: 'Expand section', keys: [] },
})

/** Collapses one accordion section by its value when collapsing is permitted. */
export const CloseDisclosureItem = Catalog.action('CloseDisclosureItem', {
  fields: { value: S.String },
  choose: chooseSection,
  what: 'Collapses the chosen accordion section',
  why: 'To fold that section out of view',
  meta: { label: 'Collapse section', keys: [] },
})

/** Toggles one accordion section between expanded and collapsed. */
export const ToggleDisclosureItem = Catalog.action('ToggleDisclosureItem', {
  fields: { value: S.String },
  choose: chooseSection,
  what: 'Expands or collapses the chosen accordion section',
  why: 'To show or hide that section of content',
  meta: { label: 'Toggle section', keys: [] },
})

/** The Catalog Actions a Disclosure / Accordion Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenDisclosure,
  CloseDisclosure,
  ToggleDisclosure,
  OpenDisclosureItem,
  CloseDisclosureItem,
  ToggleDisclosureItem,
]

// MESSAGES (Facts in addition to the Actions above)

/** An accordion header received focus without toggling its section. */
export const FocusedDisclosureHeader = m('FocusedDisclosureHeader', {
  value: S.String,
})

/** Focus left the accordion headers, clearing explicit focus state. */
export const BlurredDisclosure = m('BlurredDisclosure')

/** A roving focus move was requested across accordion headers. */
export const MovedDisclosureFocus = m('MovedDisclosureFocus', {
  move: RovingFocus.Move,
})

/** A key was pressed on a disclosure button or an accordion header. */
export const PressedDisclosureKey = m('PressedDisclosureKey', {
  key: S.String,
})

/** Double-rAF completed for an animated disclosure (`value` omitted) or accordion section (`value` set). */
export const AdvancedDisclosureFrame = m('AdvancedDisclosureFrame', {
  value: S.optionalKey(S.String),
})

/** Enter or leave animation settled for an animated disclosure (`value` omitted) or accordion section (`value` set). */
export const EndedDisclosureAnimation = m('EndedDisclosureAnimation', {
  value: S.optionalKey(S.String),
})

/** Every Message the Disclosure / Accordion chart handles. */
export const Message = S.Union([
  OpenDisclosure,
  CloseDisclosure,
  ToggleDisclosure,
  OpenDisclosureItem,
  CloseDisclosureItem,
  ToggleDisclosureItem,
  FocusedDisclosureHeader,
  BlurredDisclosure,
  MovedDisclosureFocus,
  PressedDisclosureKey,
  AdvancedDisclosureFrame,
  EndedDisclosureAnimation,
])
/** Every Message the Disclosure / Accordion chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Disclosure / Accordion Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS & PURE RULES (shared by chart and thin painters such as @foldkit/ui Disclosure)

/** Derives the single disclosure button element id from a base `id`. */
export const buttonId = (id: string): string => `${id}-button`

/** Derives the single disclosure panel element id from a base `id`. */
export const panelId = (id: string): string => `${id}-panel`

/** Derives the accordion root container element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives one accordion header button element id from a base `id` and section `value`. */
export const itemButtonId = (id: string, value: string): string =>
  `${id}-button-${value}`

/** Derives one accordion content panel element id from a base `id` and section `value`. */
export const itemPanelId = (id: string, value: string): string =>
  `${id}-panel-${value}`

/** True when `props` configures multi-item accordion mode (`props.items` provided). */
export const isAccordion = (props: Pick<Props, 'items'>): boolean =>
  props.items !== undefined

/** Resolved `isDisabled` flag for `props` (defaults to `false`). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'>): boolean =>
  props.isDisabled === true

/** Resolved `isAnimated` flag for `props` (defaults to `false`). */
export const isAnimatedOf = (props: Pick<Props, 'isAnimated'>): boolean =>
  props.isAnimated === true

/** Resolved `isMultiple` flag for accordion mode (defaults to `false`). */
export const isMultipleOf = (props: Pick<Props, 'isMultiple'>): boolean =>
  props.isMultiple === true

/** Resolved `isCollapsible` flag for single-open accordion mode (defaults to `false`). */
export const isCollapsibleOf = (props: Pick<Props, 'isCollapsible'>): boolean =>
  props.isCollapsible === true

/**
 * True when an open accordion section is allowed to collapse (always `true`
 * when `isMultiple` is enabled, otherwise `isCollapsible`).
 */
export const canCollapseOf = (
  props: Pick<Props, 'isMultiple' | 'isCollapsible'>,
): boolean => isMultipleOf(props) || isCollapsibleOf(props)

/** Resolved orientation for accordion header roving focus (defaults to `'Vertical'`). */
export const orientationOf = (props: Pick<Props, 'orientation'>): Orientation =>
  props.orientation ?? 'Vertical'

/** Resolved reading direction for horizontal roving focus (defaults to `'Ltr'`). */
export const directionOf = (
  props: Pick<Props, 'direction'>,
): RovingFocus.Direction => props.direction ?? 'Ltr'

/** Resolved looping flag for accordion header roving focus (defaults to `true`). */
export const loopOf = (props: Pick<Props, 'loop'>): boolean =>
  props.loop ?? true

/** Resolved `PageUp`/`PageDown` flag for accordion header roving focus (defaults to `false`). */
export const pageKeysOf = (props: Pick<Props, 'pageKeys'>): boolean =>
  props.pageKeys ?? false

/** True when `key` activates/toggles a disclosure button (`'Enter'` or `' '`). */
export const isToggleKey = (key: string): boolean =>
  key === 'Enter' || key === ' '

/**
 * Pure single-disclosure key rule shared by the chart and thin painters such
 * as `@foldkit/ui` `Disclosure`: returns `Some(!isOpen)` on `Enter` or Space
 * when not disabled, else `None`.
 *
 * @example
 * ```typescript
 * resolveKeyToggle({ key: 'Enter', isOpen: false }) // Some(true)
 * resolveKeyToggle({ key: ' ', isOpen: true }) // Some(false)
 * resolveKeyToggle({ key: 'Enter', isOpen: false, isDisabled: true }) // None
 * resolveKeyToggle({ key: 'Escape', isOpen: false }) // None
 * ```
 */
export const resolveKeyToggle = (
  input: Readonly<{ key: string; isOpen: boolean; isDisabled?: boolean }>,
): Option.Option<boolean> =>
  input.isDisabled !== true && isToggleKey(input.key)
    ? Option.some(!input.isOpen)
    : Option.none()

/**
 * Resolves a key press on an accordion header into either `ToggleIndex`
 * (`Enter` / `' '`) or `FocusIndex` (arrow keys respecting `orientation` and
 * `direction`, `Home`, `End`, and optional `PageUp`/`PageDown`) via
 * `RovingFocus.resolveKey`.
 *
 * @example
 * ```typescript
 * resolveAccordionKeyOutcome({ key: 'ArrowDown', count: 3, current: Option.some(0) })
 * // Some(FocusIndex({ index: 1 }))
 * resolveAccordionKeyOutcome({ key: 'Enter', count: 3, current: Option.some(1) })
 * // Some(ToggleIndex({ index: 1 }))
 * ```
 */
export const resolveAccordionKeyOutcome = (
  input: Readonly<{
    key: string
    count: number
    current: Option.Option<number>
    isDisabled?: (index: number) => boolean
    orientation?: Orientation
    direction?: RovingFocus.Direction
    loop?: boolean
    pageKeys?: boolean
  }>,
): Option.Option<AccordionKeyOutcome> => {
  const isDisabled = input.isDisabled ?? (() => false)
  const orientation = input.orientation ?? 'Vertical'
  const direction = input.direction ?? 'Ltr'
  const loop = input.loop ?? true
  const pageKeys = input.pageKeys ?? false

  if (isToggleKey(input.key)) {
    return pipe(
      input.current,
      Option.filter(
        index => index >= 0 && index < input.count && !isDisabled(index),
      ),
      Option.map(index => ToggleIndex({ index })),
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
    index => FocusIndex({ index }),
  )
}

// INTERNAL HELPERS

const itemsOf = (props: Props): ReadonlyArray<Item> => props.items ?? []

const isItemDisabledAt =
  (props: Props) =>
  (index: number): boolean =>
    isDisabledOf(props) ||
    Option.exists(
      Array.get(itemsOf(props), index),
      item => item.isDisabled === true,
    )

const isEnabledIndex = (props: Props, index: number): boolean => {
  const items = itemsOf(props)
  return index >= 0 && index < items.length && !isItemDisabledAt(props)(index)
}

const indexByValue = (props: Props, value: string): Option.Option<number> =>
  Array.findFirstIndex(itemsOf(props), item => item.value === value)

const enabledIndexByValue = (
  props: Props,
  value: string,
): Option.Option<number> =>
  Option.filter(indexByValue(props, value), index =>
    isEnabledIndex(props, index),
  )

const enabledValueAt = (props: Props, index: number): Option.Option<string> =>
  isDisabledOf(props)
    ? Option.none()
    : pipe(
        Array.get(itemsOf(props), index),
        Option.filter(item => item.isDisabled !== true),
        Option.map(item => item.value),
      )

/** True when accordion section `value` is disabled (individually or via `props.isDisabled`). */
export const isItemDisabled = (props: Props, value: string): boolean =>
  isDisabledOf(props) ||
  Option.exists(
    Array.findFirst(itemsOf(props), item => item.value === value),
    item => item.isDisabled === true,
  )

const defaultPresencesOf = (
  props: Props,
): Readonly<Record<string, Presence.State>> => {
  if (!isAccordion(props)) {
    return props.defaultOpen === true ? { [SINGLE_KEY]: Presence.Open() } : {}
  }
  const items = itemsOf(props)
  const validDefaults = Array.filter(
    Array.dedupe(props.defaultOpenValues ?? []),
    value => Array.some(items, item => item.value === value),
  )
  const bounded = isMultipleOf(props)
    ? validDefaults
    : Array.take(validDefaults, 1)
  return Record.fromEntries(
    Array.map(bounded, value => [value, Presence.Open()]),
  )
}

const effectivePresencesOf = (
  state: State,
  props: Props,
): Readonly<Record<string, Presence.State>> =>
  state.hasExplicitState ? state.presences : defaultPresencesOf(props)

const presenceAtKey = (
  presences: Readonly<Record<string, Presence.State>>,
  key: string,
): Presence.State =>
  Option.getOrElse(Record.get(presences, key), () => Presence.Closed())

const stepPresence = (
  presence: Presence.State,
  message: Presence.Message,
  props: Props,
): Option.Option<Presence.State> => {
  const result = Presence.chart.step(presence, message, {
    isAnimated: isAnimatedOf(props),
  })
  return result._tag === 'Transitioned'
    ? Option.some(result.state)
    : Option.none()
}

const withPresence = (
  presences: Readonly<Record<string, Presence.State>>,
  key: string,
  next: Presence.State,
): Readonly<Record<string, Presence.State>> =>
  next._tag === 'Closed'
    ? Record.remove(presences, key)
    : Record.set(presences, key, next)

// READINGS

/** Current {@link Presence.State} for a single disclosure. */
export const presenceOf = (state: State, props: Props): Presence.State =>
  presenceAtKey(effectivePresencesOf(state, props), SINGLE_KEY)

/** True when a single disclosure is open (or entering). */
export const isOpen = (state: State, props: Props): boolean =>
  Presence.isShowing(presenceOf(state, props))

/** True when a single disclosure panel should remain mounted (entering, open, or leaving). */
export const isMounted = (state: State, props: Props): boolean =>
  Presence.isMounted(presenceOf(state, props))

/** True when a single disclosure is actively animating an enter or leave transition. */
export const isAnimating = (state: State, props: Props): boolean =>
  Presence.isAnimating(presenceOf(state, props))

/** Standard `data-state` (`'open' | 'closed'`) for a single disclosure. */
export const dataStateOf = (state: State, props: Props): Presence.DataState =>
  Presence.dataStateOf(presenceOf(state, props))

/** Current 5-phase {@link Presence.TransitionPhase} for a single disclosure. */
export const transitionPhaseOf = (
  state: State,
  props: Props,
): Presence.TransitionPhase =>
  Presence.transitionPhaseOf(presenceOf(state, props))

/** Current {@link Presence.State} for accordion section `value`. */
export const itemPresenceOf = (
  state: State,
  props: Props,
  value: string,
): Presence.State => presenceAtKey(effectivePresencesOf(state, props), value)

/** True when accordion section `value` is expanded (or entering). */
export const isItemOpen = (
  state: State,
  props: Props,
  value: string,
): boolean => Presence.isShowing(itemPresenceOf(state, props, value))

/** True when accordion section `value` panel should remain mounted (entering, open, or leaving). */
export const isItemMounted = (
  state: State,
  props: Props,
  value: string,
): boolean => Presence.isMounted(itemPresenceOf(state, props, value))

/** Standard `data-state` (`'open' | 'closed'`) for accordion section `value`. */
export const itemDataStateOf = (
  state: State,
  props: Props,
  value: string,
): Presence.DataState =>
  Presence.dataStateOf(itemPresenceOf(state, props, value))

/** Currently open (showing) accordion section values, in `props.items` order. */
export const openValuesOf = (
  state: State,
  props: Props,
): ReadonlyArray<string> =>
  Array.flatMap(itemsOf(props), item =>
    isItemOpen(state, props, item.value) ? [item.value] : [],
  )

/** Currently mounted accordion section values (including leaving sections), in `props.items` order. */
export const mountedValuesOf = (
  state: State,
  props: Props,
): ReadonlyArray<string> =>
  Array.flatMap(itemsOf(props), item =>
    isItemMounted(state, props, item.value) ? [item.value] : [],
  )

/**
 * The focused accordion header's index in `props.items` (driving roving
 * `tabIndex: 0`), falling back to the first enabled section when `Idle` or
 * when the stored focused value is absent/disabled. Returns `None` in single
 * disclosure mode or when every item is disabled.
 */
export const focusedIndexOf = (
  state: State,
  props: Props,
): Option.Option<number> => {
  if (!isAccordion(props) || isDisabledOf(props)) {
    return Option.none()
  }
  const fromFocused =
    state._tag === 'Focused'
      ? enabledIndexByValue(props, state.focusedValue)
      : Option.none<number>()
  return Option.orElse(fromFocused, () =>
    RovingFocus.firstEnabled(itemsOf(props).length, isItemDisabledAt(props)),
  )
}

/** The focused accordion header's value, or none. */
export const focusedValueOf = (
  state: State,
  props: Props,
): Option.Option<string> =>
  Option.flatMap(focusedIndexOf(state, props), index =>
    Option.map(Array.get(itemsOf(props), index), item => item.value),
  )

/** True when keyboard focus is explicitly inside the accordion headers. */
export const isFocused = (state: State): boolean => state._tag === 'Focused'

/** True when accordion section `value` currently holds roving focus. */
export const isItemFocused = (
  state: State,
  props: Props,
  value: string,
): boolean => Option.contains(focusedValueOf(state, props), value)

// CHART TRANSITION HELPERS

const transitionSinglePresence = (
  state: State,
  props: Props,
  message: Presence.Message,
): Option.Option<Readonly<Record<string, Presence.State>>> => {
  if (isAccordion(props) || isDisabledOf(props)) {
    return Option.none()
  }
  const presences = effectivePresencesOf(state, props)
  const current = presenceAtKey(presences, SINGLE_KEY)
  return Option.map(stepPresence(current, message, props), next =>
    withPresence(presences, SINGLE_KEY, next),
  )
}

const openItemPresences = (
  state: State,
  props: Props,
  value: string,
): Option.Option<Readonly<Record<string, Presence.State>>> => {
  if (!isAccordion(props) || Option.isNone(enabledIndexByValue(props, value))) {
    return Option.none()
  }
  const base = effectivePresencesOf(state, props)
  const current = presenceAtKey(base, value)
  return Option.map(stepPresence(current, Presence.Show(), props), next => {
    const withTarget = withPresence(base, value, next)
    if (isMultipleOf(props)) {
      return withTarget
    }
    return Array.reduce(
      Record.toEntries(withTarget),
      withTarget,
      (acc, [otherKey, otherPresence]) => {
        if (otherKey === value || !Presence.isShowing(otherPresence)) {
          return acc
        }
        return Option.match(
          stepPresence(otherPresence, Presence.Hide(), props),
          {
            onNone: () => acc,
            onSome: hidden => withPresence(acc, otherKey, hidden),
          },
        )
      },
    )
  })
}

const closeItemPresences = (
  state: State,
  props: Props,
  value: string,
): Option.Option<Readonly<Record<string, Presence.State>>> => {
  if (
    !isAccordion(props) ||
    Option.isNone(enabledIndexByValue(props, value)) ||
    !canCollapseOf(props)
  ) {
    return Option.none()
  }
  const base = effectivePresencesOf(state, props)
  const current = presenceAtKey(base, value)
  return Option.map(stepPresence(current, Presence.Hide(), props), next =>
    withPresence(base, value, next),
  )
}

const toggleItemPresences = (
  state: State,
  props: Props,
  value: string,
): Option.Option<Readonly<Record<string, Presence.State>>> =>
  isItemOpen(state, props, value)
    ? closeItemPresences(state, props, value)
    : openItemPresences(state, props, value)

const stepAnimationPresences = (
  state: State,
  props: Props,
  maybeValue: Option.Option<string>,
  presenceMessage:
    | typeof Presence.AdvanceFrame.Type
    | typeof Presence.EndAnimation.Type,
): Option.Option<Readonly<Record<string, Presence.State>>> => {
  const key = isAccordion(props)
    ? Option.getOrUndefined(maybeValue)
    : Option.getOrElse(maybeValue, () => SINGLE_KEY)
  if (key === undefined) {
    return Option.none()
  }
  const base = effectivePresencesOf(state, props)
  const current = presenceAtKey(base, key)
  return Option.map(stepPresence(current, presenceMessage, props), next =>
    withPresence(base, key, next),
  )
}

const stepAccordionFocus = (
  state: State,
  props: Props,
  move: RovingFocus.Move,
): Option.Option<string> =>
  !isAccordion(props) || isDisabledOf(props)
    ? Option.none()
    : Option.flatMap(
        RovingFocus.stepEnabled({
          count: itemsOf(props).length,
          current: focusedIndexOf(state, props),
          move,
          isDisabled: isItemDisabledAt(props),
          loop: loopOf(props),
        }),
        index => enabledValueAt(props, index),
      )

const openSingleEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof OpenDisclosure.Type, never, Props>
> => [
  when(
    (state: S, _message: typeof OpenDisclosure.Type, context: Props) =>
      transitionSinglePresence(state, context, Presence.Show()),
    'Idle',
    ({ guardValue }) => Idle({ hasExplicitState: true, presences: guardValue }),
  ),
  ignore(),
]

const closeSingleEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof CloseDisclosure.Type, never, Props>
> => [
  when(
    (state: S, _message: typeof CloseDisclosure.Type, context: Props) =>
      transitionSinglePresence(state, context, Presence.Hide()),
    'Idle',
    ({ guardValue }) => Idle({ hasExplicitState: true, presences: guardValue }),
  ),
  ignore(),
]

const toggleSingleEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof ToggleDisclosure.Type, never, Props>
> => [
  when(
    (state: S, _message: typeof ToggleDisclosure.Type, context: Props) =>
      transitionSinglePresence(
        state,
        context,
        isOpen(state, context) ? Presence.Hide() : Presence.Show(),
      ),
    'Idle',
    ({ guardValue }) => Idle({ hasExplicitState: true, presences: guardValue }),
  ),
  ignore(),
]

const openItemEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof OpenDisclosureItem.Type, never, Props>
> => [
  when(
    (state: S, message: typeof OpenDisclosureItem.Type, context: Props) =>
      Option.map(
        openItemPresences(state, context, message.value),
        presences => ({
          presences,
          value: message.value,
        }),
      ),
    'Focused',
    ({ guardValue }) =>
      Focused({
        hasExplicitState: true,
        presences: guardValue.presences,
        focusedValue: guardValue.value,
      }),
  ),
  ignore(),
]

const closeItemEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof CloseDisclosureItem.Type, never, Props>
> => [
  when(
    (state: S, message: typeof CloseDisclosureItem.Type, context: Props) =>
      Option.map(
        closeItemPresences(state, context, message.value),
        presences => ({
          presences,
          value: message.value,
        }),
      ),
    'Focused',
    ({ guardValue }) =>
      Focused({
        hasExplicitState: true,
        presences: guardValue.presences,
        focusedValue: guardValue.value,
      }),
  ),
  ignore(),
]

const toggleItemEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof ToggleDisclosureItem.Type, never, Props>
> => [
  when(
    (state: S, message: typeof ToggleDisclosureItem.Type, context: Props) =>
      Option.map(
        toggleItemPresences(state, context, message.value),
        presences => ({
          presences,
          value: message.value,
        }),
      ),
    'Focused',
    ({ guardValue }) =>
      Focused({
        hasExplicitState: true,
        presences: guardValue.presences,
        focusedValue: guardValue.value,
      }),
  ),
  ignore(),
]

const focusHeaderEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    S,
    typeof FocusedDisclosureHeader.Type,
    never,
    Props
  >
> => [
  when(
    (
      _state: S,
      message: typeof FocusedDisclosureHeader.Type,
      context: Props,
    ) =>
      isAccordion(context)
        ? Option.flatMap(enabledIndexByValue(context, message.value), index =>
            enabledValueAt(context, index),
          )
        : Option.none(),
    'Focused',
    ({ state, guardValue }) =>
      Focused({
        hasExplicitState: state.hasExplicitState,
        presences: state.presences,
        focusedValue: guardValue,
      }),
  ),
  ignore(),
]

const moveFocusEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof MovedDisclosureFocus.Type, never, Props>
> => [
  when(
    (state: S, message: typeof MovedDisclosureFocus.Type, context: Props) =>
      stepAccordionFocus(state, context, message.move),
    'Focused',
    ({ state, guardValue }) =>
      Focused({
        hasExplicitState: state.hasExplicitState,
        presences: state.presences,
        focusedValue: guardValue,
      }),
  ),
  ignore(),
]

const pressedKeyEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof PressedDisclosureKey.Type, never, Props>
> => [
  when(
    (state: S, message: typeof PressedDisclosureKey.Type, context: Props) =>
      !isAccordion(context) &&
      !isDisabledOf(context) &&
      isToggleKey(message.key)
        ? transitionSinglePresence(
            state,
            context,
            isOpen(state, context) ? Presence.Hide() : Presence.Show(),
          )
        : Option.none(),
    'Idle',
    ({ guardValue }) => Idle({ hasExplicitState: true, presences: guardValue }),
  ),
  when(
    (state: S, message: typeof PressedDisclosureKey.Type, context: Props) => {
      if (!isAccordion(context) || isDisabledOf(context)) {
        return Option.none()
      }
      return Option.flatMap(
        resolveAccordionKeyOutcome({
          key: message.key,
          count: itemsOf(context).length,
          current: focusedIndexOf(state, context),
          isDisabled: isItemDisabledAt(context),
          orientation: orientationOf(context),
          direction: directionOf(context),
          loop: loopOf(context),
          pageKeys: pageKeysOf(context),
        }),
        outcome =>
          Option.flatMap(enabledValueAt(context, outcome.index), value =>
            M.value(outcome).pipe(
              M.withReturnType<
                Option.Option<
                  Readonly<{
                    hasExplicitState: boolean
                    presences: Readonly<Record<string, Presence.State>>
                    focusedValue: string
                  }>
                >
              >(),
              M.tagsExhaustive({
                FocusIndex: () =>
                  Option.some({
                    hasExplicitState: state.hasExplicitState,
                    presences: state.presences,
                    focusedValue: value,
                  }),
                ToggleIndex: () =>
                  Option.map(
                    toggleItemPresences(state, context, value),
                    presences => ({
                      hasExplicitState: true,
                      presences,
                      focusedValue: value,
                    }),
                  ),
              }),
            ),
          ),
      )
    },
    'Focused',
    ({ guardValue }) => Focused(guardValue),
  ),
  ignore(),
]

const advanceFrameEdgesForIdle = (): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    Idle,
    typeof AdvancedDisclosureFrame.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: Idle,
      message: typeof AdvancedDisclosureFrame.Type,
      context: Props,
    ) =>
      stepAnimationPresences(
        state,
        context,
        Option.fromNullishOr(message.value),
        Presence.AdvanceFrame(),
      ),
    'Idle',
    ({ guardValue }) => Idle({ hasExplicitState: true, presences: guardValue }),
  ),
  ignore(),
]

const advanceFrameEdgesForFocused = (): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    Focused,
    typeof AdvancedDisclosureFrame.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: Focused,
      message: typeof AdvancedDisclosureFrame.Type,
      context: Props,
    ) =>
      stepAnimationPresences(
        state,
        context,
        Option.fromNullishOr(message.value),
        Presence.AdvanceFrame(),
      ),
    'Focused',
    ({ state, guardValue }) =>
      Focused({
        hasExplicitState: true,
        presences: guardValue,
        focusedValue: state.focusedValue,
      }),
  ),
  ignore(),
]

const endAnimationEdgesForIdle = (): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    Idle,
    typeof EndedDisclosureAnimation.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: Idle,
      message: typeof EndedDisclosureAnimation.Type,
      context: Props,
    ) =>
      stepAnimationPresences(
        state,
        context,
        Option.fromNullishOr(message.value),
        Presence.EndAnimation(),
      ),
    'Idle',
    ({ guardValue }) => Idle({ hasExplicitState: true, presences: guardValue }),
  ),
  ignore(),
]

const endAnimationEdgesForFocused = (): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    Focused,
    typeof EndedDisclosureAnimation.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: Focused,
      message: typeof EndedDisclosureAnimation.Type,
      context: Props,
    ) =>
      stepAnimationPresences(
        state,
        context,
        Option.fromNullishOr(message.value),
        Presence.EndAnimation(),
      ),
    'Focused',
    ({ state, guardValue }) =>
      Focused({
        hasExplicitState: true,
        presences: guardValue,
        focusedValue: state.focusedValue,
      }),
  ),
  ignore(),
]

// CHART

/**
 * The Disclosure / Accordion Machine chart: single collapsible open/close/toggle,
 * multi-item accordion single/multiple and collapsible rules, animated and
 * non-animated Presence lifecycle transitions, disabled guards, and horizontal
 * or vertical LTR/RTL roving focus across accordion headers.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Idle: {
        on: {
          OpenDisclosure: openSingleEdges<Idle>(),
          CloseDisclosure: closeSingleEdges<Idle>(),
          ToggleDisclosure: toggleSingleEdges<Idle>(),
          OpenDisclosureItem: openItemEdges<Idle>(),
          CloseDisclosureItem: closeItemEdges<Idle>(),
          ToggleDisclosureItem: toggleItemEdges<Idle>(),
          FocusedDisclosureHeader: focusHeaderEdges<Idle>(),
          MovedDisclosureFocus: moveFocusEdges<Idle>(),
          PressedDisclosureKey: pressedKeyEdges<Idle>(),
          AdvancedDisclosureFrame: advanceFrameEdgesForIdle(),
          EndedDisclosureAnimation: endAnimationEdgesForIdle(),
        },
      },
      Focused: {
        on: {
          OpenDisclosure: openSingleEdges<Focused>(),
          CloseDisclosure: closeSingleEdges<Focused>(),
          ToggleDisclosure: toggleSingleEdges<Focused>(),
          OpenDisclosureItem: openItemEdges<Focused>(),
          CloseDisclosureItem: closeItemEdges<Focused>(),
          ToggleDisclosureItem: toggleItemEdges<Focused>(),
          FocusedDisclosureHeader: focusHeaderEdges<Focused>(),
          BlurredDisclosure: to('Idle', ({ state }) =>
            Idle({
              hasExplicitState: state.hasExplicitState,
              presences: state.presences,
            }),
          ),
          MovedDisclosureFocus: moveFocusEdges<Focused>(),
          PressedDisclosureKey: pressedKeyEdges<Focused>(),
          AdvancedDisclosureFrame: advanceFrameEdgesForFocused(),
          EndedDisclosureAnimation: endAnimationEdgesForFocused(),
        },
      },
    },
  },
)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenDisclosure: pace,
  CloseDisclosure: pace,
  ToggleDisclosure: pace,
  OpenDisclosureItem: pace,
  CloseDisclosureItem: pace,
  ToggleDisclosureItem: pace,
  FocusedDisclosureHeader: pace,
  BlurredDisclosure: pace,
  MovedDisclosureFocus: pace,
  PressedDisclosureKey: pace,
  AdvancedDisclosureFrame: pace,
  EndedDisclosureAnimation: pace,
})

/** Default synchronization: every Disclosure / Accordion Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Disclosure / Accordion kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The four painted slots of a Disclosure / Accordion Part:
 * - `Root`: optional container for an accordion (`orientation`, `id`, `label`).
 * - `Button`: trigger for single disclosure mode (`ToggleDisclosure`).
 * - `Trigger`: per-section header button for accordion mode (`ToggleDisclosureItem`).
 * - `Panel`: content panel for either single disclosure (no choice) or an accordion section (choice = item `value`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    focus: 'None',
    gestures: [],
  },
  Button: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleDisclosure' }],
  },
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleDisclosureItem' }],
  },
  Panel: {
    role: 'Region',
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
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      orientation: orientationOf(props),
      ...(props.label === undefined ? {} : { label: props.label }),
    }
  } else if (slot === 'Button') {
    const disabled = isDisabledOf(props)
    return {
      id: buttonId(props.id),
      isExpanded: isOpen(state, props),
      controls: panelId(props.id),
      tabIndex: 0,
      ...(disabled ? { isDisabled: true } : {}),
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(props.labelledBy === undefined
        ? {}
        : { labelledBy: props.labelledBy }),
    }
  } else if (slot === 'Trigger') {
    return Option.match(
      Option.flatMap(maybeChoice, value =>
        Option.map(indexByValue(props, value), index => ({ index, value })),
      ),
      {
        onNone: () => ({}),
        onSome: ({ index, value }) => {
          const disabled = isItemDisabledAt(props)(index)
          const expanded = isItemOpen(state, props, value)
          const cannotCollapse = expanded && !canCollapseOf(props)
          const isRovingTarget =
            !disabled && Option.contains(focusedIndexOf(state, props), index)
          return {
            id: itemButtonId(props.id, value),
            isExpanded: expanded,
            controls: itemPanelId(props.id, value),
            tabIndex: isRovingTarget ? 0 : -1,
            ...(disabled || cannotCollapse ? { isDisabled: true } : {}),
          }
        },
      },
    )
  } else if (slot === 'Panel') {
    return Option.match(maybeChoice, {
      onNone: () => ({
        id: panelId(props.id),
        labelledBy: buttonId(props.id),
        isHidden: !isMounted(state, props),
      }),
      onSome: value =>
        Option.match(indexByValue(props, value), {
          onNone: () => ({}),
          onSome: () => ({
            id: itemPanelId(props.id, value),
            labelledBy: itemButtonId(props.id, value),
            isHidden: !isItemMounted(state, props, value),
          }),
        }),
    })
  } else {
    return {}
  }
}

/**
 * What a restart opens Disclosure / Accordion on: settles any in-flight
 * Presence animations (`Enter* -> Open`, `Leave* -> Closed`, pruning `Closed`
 * entries) and returns to `Idle` while keeping open/closed selections intact.
 */
export const atRest = (state: State): State => {
  const settledEntries: ReadonlyArray<readonly [string, Presence.State]> =
    Array.flatMap(Record.toEntries(state.presences), ([key, presence]) => {
      const rested = Presence.atRest(presence)
      if (rested._tag === 'Closed') {
        return []
      }
      const entry: readonly [string, Presence.State] = [key, rested]
      return [entry]
    })
  return Idle({
    hasExplicitState: state.hasExplicitState,
    presences: Record.fromEntries(settledEntries),
  })
}

// PART FACTORY

/** Options for customizing a Disclosure / Accordion Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep state device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Disclosure / Accordion {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's Disclosure local to one device.
 *
 * @example
 * ```typescript
 * const FaqAccordion = Disclosure.make({ name: 'FaqAccordion' })
 * const LocalDetails = Disclosure.make({ name: 'LocalDetails', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Disclosure',
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
 * Shorthand for a Disclosure / Accordion Part whose state stays on the device
 * and is omitted from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalDetails = Disclosure.deviceOnly({ name: 'LocalDetails' })
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

/** The default synced Disclosure / Accordion Part (`name: 'Disclosure'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()

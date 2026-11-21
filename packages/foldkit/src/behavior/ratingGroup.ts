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
import type { SlotProps } from './slot.js'

// NOTE: this is the core RatingGroup Part (Widget #31 of 54, Scribe #2670). It
// composes `RovingFocus` into one framework-free Machine and Part declaration
// covering Zag rating-group: configurable `count` (default 5), `allowHalf`
// (0.5 precision), hover preview value, pointer and keyboard selection (Arrow
// keys respecting LTR/RTL, Home, End, Space, and digit keys 0-9), disabled and
// read-only guards, and roving tabindex across radio items. Its state (`Idle` |
// `Hovering`) lives in the Model with no sentinel values (`Option.none()` for
// unrated), synced by default (`Domain` category, `Pace.Synced`) with
// `RatingGroup.make` and `RatingGroup.deviceOnly()`, and projects
// reference-stable `SlotBindings` (`Root`, `Item`, `Label`).

// CONSTANTS

/** Default number of rating items (`5`). */
export const defaultCount = 5

/** Rating increment when `allowHalf` is `true` (`0.5`). */
export const halfStep = 0.5

/** Rating increment when `allowHalf` is `false` (`1`). */
export const wholeStep = 1

/** Default horizontal reading direction (`'Ltr'`). */
export const defaultDirection: RovingFocus.Direction = 'Ltr'

// SCHEMAS

/**
 * Read-only configuration supplied to the RatingGroup chart and projection from
 * the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  count: S.optionalKey(S.Number),
  allowHalf: S.optionalKey(S.Boolean),
  direction: S.optionalKey(RovingFocus.Direction),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  defaultValue: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  name: S.optionalKey(S.String),
  form: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the RatingGroup chart and projection. */
export type Props = typeof Props.Type

/** Derived display and ARIA state for one 1-based rating item (`1..count`). */
export const ItemState = S.Struct({
  index: S.Number,
  isHighlighted: S.Boolean,
  isHalf: S.Boolean,
  isChecked: S.Boolean,
  isTabStop: S.Boolean,
})
/** Derived display and ARIA state for one 1-based rating item. */
export type ItemState = typeof ItemState.Type

// STATE

/** No pointer hover preview is active; `maybeValue` is `None` when unrated. */
export const Idle = ts('Idle', {
  maybeValue: S.Option(S.Number),
})
/** No pointer hover preview is active. */
export type Idle = typeof Idle.Type

/** Pointer is previewing `hoveredValue` over the rating items while committed `maybeValue` stays intact. */
export const Hovering = ts('Hovering', {
  maybeValue: S.Option(S.Number),
  hoveredValue: S.Number,
})
/** Pointer is previewing `hoveredValue`. */
export type Hovering = typeof Hovering.Type

/** Where a RatingGroup Part stands: `Idle` or `Hovering`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Hovering])
/** Where a RatingGroup Part stands. */
export type State = typeof State.Type

/** Initial RatingGroup state: idle and unrated. */
export const initial: State = Idle({ maybeValue: Option.none() })

/** Creates an initial idle RatingGroup state set to `value` (unrated when `value <= 0`). */
export const initialValue = (value: number): State =>
  Idle({
    maybeValue:
      Number.isFinite(value) && value > 0 ? Option.some(value) : Option.none(),
  })

// ACTIONS

/** Sets the rating to `value` (snapped to whole or half stars, or cleared when `<= 0`). */
export const SetRating = Catalog.action('SetRating', {
  fields: { value: S.Number },
  choose: {
    field: 'value',
    noun: 'rating',
    prompt: 'Set rating to which score?',
    token: S.FiniteFromString,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter a rating score',
  },
  what: 'Sets the rating to the chosen score',
  why: 'To record an evaluation of the subject',
  meta: { label: 'Set rating', keys: [] },
})

/** Clears the current rating so the subject is unrated. */
export const ClearRating = Catalog.action('ClearRating', {
  what: 'Clears the current rating value',
  why: 'To leave the subject unrated',
  meta: { label: 'Clear rating', keys: [] },
})

/** The Catalog Actions a RatingGroup Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SetRating,
  ClearRating,
]

// MESSAGES

/** Pointer hovered over the 1-based rating item `index` (with `isHalf: true` for the leading half when `allowHalf` is enabled). */
export const HoverRatingItem = m('HoverRatingItem', {
  index: S.Number,
  isHalf: S.optionalKey(S.Boolean),
})

/** Pointer left the rating group, clearing the hover preview and returning to `Idle`. */
export const LeaveRatingGroup = m('LeaveRatingGroup')

/** User activated the 1-based rating item `index` (using the active hover preview or `isHalf` when applicable). */
export const SelectRatingItem = m('SelectRatingItem', {
  index: S.Number,
  isHalf: S.optionalKey(S.Boolean),
})

/** A key was pressed while interacting with the rating group (`ArrowLeft/Right/Up/Down`, `Home`, `End`, ` `, `0`-`9`). */
export const PressedRatingKey = m('PressedRatingKey', { key: S.String })

/** Resets the rating to `props.defaultValue` (or unrated) and returns to `Idle`. */
export const ResetRating = m('ResetRating')

/** Every Message the RatingGroup chart handles. */
export const Message = S.Union([
  SetRating,
  ClearRating,
  HoverRatingItem,
  LeaveRatingGroup,
  SelectRatingItem,
  PressedRatingKey,
  ResetRating,
])
/** Every Message the RatingGroup chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the RatingGroup Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the rating group radiogroup container element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives one 1-based rating item element id from a base `id` and `index`. */
export const itemId = (id: string, index: number): string =>
  `${id}-item-${index.toString()}`

/** Derives the rating group label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

/** Derives the hidden form input element id from a base `id`. */
export const hiddenInputId = (id: string): string => `${id}-input`

// PURE RULES & CONFIGURATION READERS

/** Resolved star count (`5` by default, clamped to integer `>= 1`). */
export const countOf = (props: Pick<Props, 'count'> = {}): number => {
  const raw = props.count ?? defaultCount
  return Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : defaultCount
}

/** True when half-star (`0.5`) values are permitted (`false` by default). */
export const allowHalfOf = (props: Pick<Props, 'allowHalf'> = {}): boolean =>
  props.allowHalf === true

/** Rating step increment (`0.5` when `allowHalf`, otherwise `1`). */
export const stepOf = (props: Pick<Props, 'allowHalf'> = {}): number =>
  allowHalfOf(props) ? halfStep : wholeStep

/** Resolved horizontal reading direction (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): RovingFocus.Direction => props.direction ?? defaultDirection

/** True when the rating group is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the rating group is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when a rating is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'> = {}): boolean =>
  props.isRequired === true

/** True when user input may hover or change the rating (neither disabled nor read-only). */
export const isInteractiveOf = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/** Ordered 1-based star indices `[1, 2, ..., count]`. */
export const itemsOf = (
  props: Pick<Props, 'count'> = {},
): ReadonlyArray<number> => Array.makeBy(countOf(props), index => index + 1)

/** Ordered discrete selectable step values `[0, step, 2*step, ..., count]` used for keyboard roving. */
export const stepsOf = (
  props: Pick<Props, 'count' | 'allowHalf'> = {},
): ReadonlyArray<number> => {
  const step = stepOf(props)
  const totalSteps = Math.round(countOf(props) / step)
  return Array.makeBy(totalSteps + 1, index => index * step)
}

/**
 * Normalizes a numeric rating `raw` into `Option.Option<number>` honoring
 * `count` and `allowHalf`: returns `Option.none()` for non-positive or
 * non-finite values, and snaps positive values to `0.5` or `1` steps within
 * `[step, count]`.
 *
 * @example
 * ```typescript
 * normalizeRating(3.4, { count: 5, allowHalf: true }) // Some(3.5)
 * normalizeRating(3.4, { count: 5, allowHalf: false }) // Some(3)
 * normalizeRating(0, { count: 5 }) // None
 * ```
 */
export const normalizeRating = (
  raw: number,
  props: Pick<Props, 'count' | 'allowHalf'> = {},
): Option.Option<number> => {
  if (!Number.isFinite(raw) || raw <= 0) {
    return Option.none()
  }
  const step = stepOf(props)
  const max = countOf(props)
  const snapped = Math.round(raw / step) * step
  const clamped = Math.min(Math.max(snapped, step), max)
  return Option.some(clamped)
}

/** Resolves a hover/pointer target `(index, isHalf)` into a valid positive rating value. */
export const resolveItemValue = (
  index: number,
  isHalf: boolean | undefined,
  props: Pick<Props, 'count' | 'allowHalf'> = {},
): Option.Option<number> => {
  if (!Number.isFinite(index) || index < 1 || index > countOf(props)) {
    return Option.none()
  }
  const clampedIndex = Math.floor(index)
  const raw =
    allowHalfOf(props) && isHalf === true
      ? clampedIndex - halfStep
      : clampedIndex
  return normalizeRating(raw, props)
}

/** Default accessible label for a rating score (`'1 star'`, `'3 stars'`, `'3.5 stars'`). */
export const ratingValueTextOf = (score: number): string =>
  score === 1 ? '1 star' : `${score.toString()} stars`

const parseDigitKey = (key: string): Option.Option<number> => {
  if (key.length !== 1) {
    return Option.none()
  }
  const code = key.charCodeAt(0)
  const zeroCode = 48
  const nineCode = 57
  if (code >= zeroCode && code <= nineCode) {
    return Option.some(code - zeroCode)
  } else {
    return Option.none()
  }
}

/**
 * Resolves a keyboard `key` press on a RatingGroup into the next committed
 * `Option.Option<number>` rating (or `Option.none()` when the key is not
 * handled):
 * - `ArrowLeft` / `ArrowRight` / `ArrowUp` / `ArrowDown` step via `RovingFocus`
 *   respecting `direction` (`Ltr`/`Rtl`), decrementing down to unrated (`None`).
 * - `Home` jumps to the lowest positive rating (`1` for whole, `0.5` for half).
 * - `End` jumps to `count`.
 * - `' '` (Space) selects `1` when currently unrated.
 * - `'0'` clears the rating to unrated (`None`).
 * - `'1'`..`'9'` selects that integer score when `<= count`.
 */
export const resolveKeyRating = (
  state: State,
  key: string,
  props: Pick<
    Props,
    'count' | 'allowHalf' | 'direction' | 'isDisabled' | 'isReadOnly'
  > = {},
): Option.Option<Option.Option<number>> => {
  if (!isInteractiveOf(props)) {
    return Option.none()
  }

  const current = valueOf(state, props)
  const maybeDigit = parseDigitKey(key)
  if (Option.isSome(maybeDigit)) {
    const digit = maybeDigit.value
    if (digit === 0) {
      return Option.some(Option.none())
    } else if (digit <= countOf(props)) {
      return Option.some(normalizeRating(digit, props))
    } else {
      return Option.none()
    }
  }

  if (key === ' ') {
    return current <= 0 ? Option.some(normalizeRating(1, props)) : Option.none()
  }

  const maybeMove = RovingFocus.moveOfKey(key, {
    orientation: 'Both',
    direction: directionOf(props),
    pageKeys: false,
  })
  return Option.flatMap(maybeMove, move => {
    const steps = stepsOf(props)
    if (move === 'First') {
      return Option.some(Option.some(stepOf(props)))
    } else if (move === 'Last') {
      return Option.some(Option.some(countOf(props)))
    } else {
      const currentStepIndex = Array.findFirstIndex(
        steps,
        candidate => candidate === current,
      )
      return Option.flatMap(
        RovingFocus.stepEnabled({
          count: steps.length,
          current: Option.orElse(currentStepIndex, () => Option.some(0)),
          move,
          loop: false,
        }),
        nextIndex =>
          Option.map(Array.get(steps, nextIndex), nextValue =>
            nextValue <= 0 ? Option.none() : Option.some(nextValue),
          ),
      )
    }
  })
}

// READINGS

/** Committed rating as `Option.Option<number>` (`None` when unrated), normalized to `props` when given. */
export const maybeValueOf = (
  state: State,
  props?: Pick<Props, 'count' | 'allowHalf'>,
): Option.Option<number> =>
  props === undefined
    ? state.maybeValue
    : Option.flatMap(state.maybeValue, value => normalizeRating(value, props))

/** Committed numeric rating (`0` when unrated). */
export const valueOf = (
  state: State,
  props?: Pick<Props, 'count' | 'allowHalf'>,
): number => Option.getOrElse(maybeValueOf(state, props), () => 0)

/** True while a pointer hover preview is active. */
export const isHovering = (state: State): boolean => state._tag === 'Hovering'

/** Active hover preview value, or none when `Idle`. */
export const hoveredValueOf = (state: State): Option.Option<number> =>
  state._tag === 'Hovering' ? Option.some(state.hoveredValue) : Option.none()

/** Value currently displayed by the stars: `hoveredValue` while `Hovering`, else committed `valueOf`. */
export const displayValueOf = (
  state: State,
  props?: Pick<Props, 'count' | 'allowHalf'>,
): number =>
  state._tag === 'Hovering' ? state.hoveredValue : valueOf(state, props)

/** Derives visual highlight, half-star, checked, and roving tab-stop state for 1-based star `index`. */
export const itemStateOf = (
  state: State,
  props: Pick<Props, 'count' | 'allowHalf' | 'isDisabled'>,
  index: number,
): ItemState => {
  const committed = valueOf(state, props)
  const displayed = displayValueOf(state, props)
  const equalDisplayed = displayed > 0 && Math.ceil(displayed) === index
  const isHighlighted = displayed > 0 && (index <= displayed || equalDisplayed)
  const isHalf = equalDisplayed && Math.abs(displayed - index) === halfStep
  const isChecked = committed > 0 && Math.ceil(committed) === index
  const isTabStop =
    !isDisabledOf(props) && (isChecked || (committed <= 0 && index === 1))
  return {
    index,
    isHighlighted,
    isHalf,
    isChecked,
    isTabStop,
  }
}

/** Form submission payload when `props.name` is set. */
export const hiddenInputOf = (
  state: State,
  props: Props,
): Option.Option<
  Readonly<{ id: string; name: string; value: string; form?: string }>
> =>
  Option.map(Option.fromNullishOr(props.name), name => ({
    id: hiddenInputId(props.id),
    name,
    value: Option.match(maybeValueOf(state, props), {
      onNone: () => '',
      onSome: score => score.toString(),
    }),
    ...(props.form === undefined ? {} : { form: props.form }),
  }))

// INTERNAL CHART HELPERS

const setRatingEdges = <
  Target extends 'Idle' | 'Hovering',
  S extends Extract<State, { readonly _tag: Target }>,
>(
  target: Target,
  withValue: (state: S, maybeValue: Option.Option<number>) => S,
): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof SetRating.Type, never, Props>
> => [
  when(
    (_state: S, _message: typeof SetRating.Type, context: Props) =>
      isInteractiveOf(context),
    target,
    ({ state, message, context }) =>
      withValue(state, normalizeRating(message.value, context)),
  ),
  ignore(),
]

const clearRatingEdges = <
  Target extends 'Idle' | 'Hovering',
  S extends Extract<State, { readonly _tag: Target }>,
>(
  target: Target,
  withValue: (state: S, maybeValue: Option.Option<number>) => S,
): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof ClearRating.Type, never, Props>
> => [
  when(
    (state: S, _message: typeof ClearRating.Type, context: Props) =>
      isInteractiveOf(context) && Option.isSome(state.maybeValue),
    target,
    ({ state }) => withValue(state, Option.none()),
  ),
  ignore(),
]

const hoverItemEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof HoverRatingItem.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof HoverRatingItem.Type, context: Props) =>
      isInteractiveOf(context)
        ? resolveItemValue(message.index, message.isHalf, context)
        : Option.none(),
    'Hovering',
    ({ state, guardValue }) =>
      Hovering({
        maybeValue: state.maybeValue,
        hoveredValue: guardValue,
      }),
  ),
  ignore(),
]

const pressedKeyEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof PressedRatingKey.Type, never, Props>
> => [
  when(
    (state: S, message: typeof PressedRatingKey.Type, context: Props) =>
      resolveKeyRating(state, message.key, context),
    'Idle',
    ({ guardValue }) => Idle({ maybeValue: guardValue }),
  ),
  ignore(),
]

const resetToIdle = (props: Props): Idle =>
  Idle({
    maybeValue:
      props.defaultValue === undefined
        ? Option.none()
        : normalizeRating(props.defaultValue, props),
  })

// CHART

/**
 * Builds the RatingGroup Machine chart starting in `initialState`: whole and
 * half-star (`0.5`) precision, hover preview state, item click/select,
 * keyboard roving (`ArrowLeft/Right/Up/Down`, `Home`, `End`, `Space`, `0`-`9`)
 * via `RovingFocus`, disabled and read-only guards, and form reset.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          SetRating: setRatingEdges('Idle', (_state, maybeValue) =>
            Idle({ maybeValue }),
          ),
          ClearRating: clearRatingEdges('Idle', (_state, maybeValue) =>
            Idle({ maybeValue }),
          ),
          HoverRatingItem: hoverItemEdges<Idle>(),
          SelectRatingItem: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context)
                  ? resolveItemValue(message.index, message.isHalf, context)
                  : Option.none(),
              'Idle',
              ({ guardValue }) => Idle({ maybeValue: Option.some(guardValue) }),
            ),
            ignore(),
          ],
          PressedRatingKey: pressedKeyEdges<Idle>(),
          ResetRating: to('Idle', ({ context }) => resetToIdle(context)),
        },
      },
      Hovering: {
        on: {
          SetRating: setRatingEdges('Hovering', (state, maybeValue) =>
            Hovering({ maybeValue, hoveredValue: state.hoveredValue }),
          ),
          ClearRating: clearRatingEdges('Hovering', (state, maybeValue) =>
            Hovering({ maybeValue, hoveredValue: state.hoveredValue }),
          ),
          HoverRatingItem: hoverItemEdges<Hovering>(),
          LeaveRatingGroup: to('Idle', ({ state }) =>
            Idle({ maybeValue: state.maybeValue }),
          ),
          SelectRatingItem: [
            when(
              (state, message, context) =>
                isInteractiveOf(context)
                  ? Option.orElse(
                      message.isHalf === undefined
                        ? Option.some(state.hoveredValue)
                        : resolveItemValue(
                            message.index,
                            message.isHalf,
                            context,
                          ),
                      () =>
                        resolveItemValue(
                          message.index,
                          message.isHalf,
                          context,
                        ),
                    )
                  : Option.none(),
              'Hovering',
              ({ state, guardValue }) =>
                Hovering({
                  maybeValue: Option.some(guardValue),
                  hoveredValue: state.hoveredValue,
                }),
            ),
            ignore(),
          ],
          PressedRatingKey: pressedKeyEdges<Hovering>(),
          ResetRating: to('Idle', ({ context }) => resetToIdle(context)),
        },
      },
    },
  })

/** The default RatingGroup Machine chart starting in `Idle({ maybeValue: Option.none() })`. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  SetRating: pace,
  ClearRating: pace,
  HoverRatingItem: pace,
  LeaveRatingGroup: pace,
  SelectRatingItem: pace,
  PressedRatingKey: pace,
  ResetRating: pace,
})

/** Default synchronization: every RatingGroup Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a RatingGroup kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/** The three painted slots of a RatingGroup Part: `Root`, `Item`, and `Label`. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'RadioGroup',
    focus: 'None',
    gestures: [],
  },
  Item: {
    role: 'Radio',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SetRating' }],
  },
  Label: {
    focus: 'None',
    gestures: [],
  },
}

const parseItemIndex = (
  maybeChoice: Option.Option<string>,
  props: Props,
): Option.Option<number> =>
  Option.flatMap(maybeChoice, raw => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      return Option.none()
    }
    const index = Math.floor(parsed)
    return index >= 1 && index <= countOf(props)
      ? Option.some(index)
      : Option.none()
  })

const rootLabelPropsOf = (
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

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      orientation: 'Horizontal',
      ...rootLabelPropsOf(props),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
    }
  } else if (slot === 'Item') {
    return Option.match(parseItemIndex(maybeChoice, props), {
      onNone: () => ({}),
      onSome: index => {
        const item = itemStateOf(state, props, index)
        const labelScore = item.isChecked ? valueOf(state, props) : index
        return {
          id: itemId(props.id, index),
          isChecked: item.isChecked,
          label: ratingValueTextOf(labelScore),
          tabIndex: item.isTabStop ? 0 : -1,
          ...(isDisabledOf(props) ? { isDisabled: true } : {}),
          ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
        }
      },
    })
  } else if (slot === 'Label') {
    return {
      id: labelId(props.id),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else {
    return {}
  }
}

/** What a restart opens a RatingGroup on: keeps the committed rating and clears hover preview. */
export const atRest = (state: State): State =>
  Idle({ maybeValue: state.maybeValue })

// PART FACTORY

/** Options for customizing a RatingGroup Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this RatingGroup device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial rating value for the Part's chart (unrated by default). */
  defaultValue?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a RatingGroup {@link Part.Part}. Synced by default
 * (`category: 'Domain'`); pass `sync: 'OwnView'` (or use {@link deviceOnly})
 * to keep a Program's RatingGroup local to one device.
 *
 * @example
 * ```typescript
 * const BookRating = RatingGroup.make({ name: 'BookRating', defaultValue: 4 })
 * const LocalRating = RatingGroup.deviceOnly({ name: 'LocalRating' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'RatingGroup',
    State,
    Message,
    chart:
      options.defaultValue === undefined || options.defaultValue <= 0
        ? chart
        : chartOf(initialValue(options.defaultValue)),
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

/** Default synced RatingGroup {@link Part.Part} (`name: 'RatingGroup'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

/** Creates a device-only RatingGroup {@link Part.Part} (`Device({ because })`, defaulting to `'OwnView'`). */
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

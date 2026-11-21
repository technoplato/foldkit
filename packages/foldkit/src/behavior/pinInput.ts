import { Array, Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as FieldDraft from './fieldDraft.js'
import {
  Device,
  type DeviceReason,
  Settled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import * as RovingFocus from './rovingFocus.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core PinInput Part (Widget #33 of 54, Scribe #2672).
// It composes `FieldDraft` (`Pace.Settled` typing sync) and `RovingFocus`
// into one framework-free Machine and Part declaration covering Zag pin-input
// and Radix one-time-password-field semantics: N-slot OTP/PIN entry (default
// length 6), Numeric/Alphanumeric/Alphabetic validation, auto-advance on
// entry, Backspace clear and retreat, ArrowLeft/ArrowRight navigation,
// multi-char paste distribution across slots, `mask` / `PinInput.secret()`
// (`Device({ because: 'Secret' })`), completion detection (`isCompleteOf`),
// `valueOf`, `atRest`, and reference-stable SlotBindings (`Root`, `Input`,
// `Label`).

// CONSTANTS

/** Default number of PIN slots (`6`). */
export const defaultLength = 6

/** Default typing-pause settle window in milliseconds (`200`). */
export const defaultSettleMs: number = FieldDraft.defaultSettleMs

// SCHEMAS

/** Character class accepted by each PIN slot (`Numeric`, `Alphanumeric`, or `Alphabetic`). */
export const PinType = S.Literals(['Numeric', 'Alphanumeric', 'Alphabetic'])
/** Character class accepted by each PIN slot. */
export type PinType = typeof PinType.Type

/** Default PIN character class (`'Numeric'`). */
export const defaultPinType: PinType = 'Numeric'

/**
 * Read-only props supplied to the PinInput chart and projection from the
 * Program's Model. Slot count, validation class, masking, direction, and
 * accessibility linkage stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  length: S.optionalKey(S.Number),
  pinType: S.optionalKey(PinType),
  mask: S.optionalKey(S.Boolean),
  isOtp: S.optionalKey(S.Boolean),
  blurOnComplete: S.optionalKey(S.Boolean),
  direction: S.optionalKey(RovingFocus.Direction),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  defaultValue: S.optionalKey(S.String),
  settleMs: S.optionalKey(S.Number),
  placeholder: S.optionalKey(S.String),
  label: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
  name: S.optionalKey(S.String),
  form: S.optionalKey(S.String),
})
/** Read-only props supplied to the PinInput chart and projection. */
export type Props = typeof Props.Type

// VALIDATION & SLOT HELPERS

const numericCharPattern = /^[0-9]$/u
const alphanumericCharPattern = /^[a-zA-Z0-9]$/u
const alphabeticCharPattern = /^[a-zA-Z]$/u

const stripNonNumericPattern = /[^0-9]/gu
const stripNonAlphanumericPattern = /[^a-zA-Z0-9]/gu
const stripNonAlphabeticPattern = /[^a-zA-Z]/gu

/** Resolved number of PIN slots (`6` by default, at least `1`). */
export const lengthOf = (props: Pick<Props, 'length'> = {}): number =>
  props.length !== undefined && Number.isFinite(props.length)
    ? Math.max(1, Math.trunc(props.length))
    : defaultLength

/** Resolved character validation class (`'Numeric'` by default). */
export const pinTypeOf = (props: Pick<Props, 'pinType'> = {}): PinType =>
  props.pinType ?? defaultPinType

/** True when characters should be masked visually (`false` by default). */
export const isMaskedOf = (props: Pick<Props, 'mask'> = {}): boolean =>
  props.mask === true

/** True when the field is configured for one-time-code autofill (`false` by default). */
export const isOtpOf = (props: Pick<Props, 'isOtp'> = {}): boolean =>
  props.isOtp === true

/** True when completing the final slot exits edit mode automatically (`false` by default). */
export const blurOnCompleteOf = (
  props: Pick<Props, 'blurOnComplete'> = {},
): boolean => props.blurOnComplete === true

/** Resolved reading direction for horizontal arrow navigation (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): RovingFocus.Direction => props.direction ?? 'Ltr'

/** True when the PIN input is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the PIN input is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when the PIN input is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'> = {}): boolean =>
  props.isRequired === true

/** True when the PIN input is marked invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/** True when the PIN input accepts user edits (neither disabled nor read-only). */
export const canEdit = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => FieldDraft.canEdit(props)

/** Resolved typing-pause settle window in milliseconds (`200` by default). */
export const settleMsOf = (props: Pick<Props, 'settleMs'> = {}): number =>
  props.settleMs ?? defaultSettleMs

/** Effective HTML-style input type for each slot (`'password'`, `'tel'`, or `'text'`). */
export const effectiveInputTypeOf = (
  props: Pick<Props, 'mask' | 'pinType'> = {},
): 'password' | 'tel' | 'text' => {
  if (isMaskedOf(props)) {
    return 'password'
  } else if (pinTypeOf(props) === 'Numeric') {
    return 'tel'
  } else {
    return 'text'
  }
}

/**
 * True when `char` is a single character allowed by `pinType`.
 *
 * @example
 * ```typescript
 * isValidPinChar('7', 'Numeric') // true
 * isValidPinChar('a', 'Numeric') // false
 * isValidPinChar('a', 'Alphanumeric') // true
 * isValidPinChar('7', 'Alphabetic') // false
 * ```
 */
export const isValidPinChar = (
  char: string,
  pinType: PinType = defaultPinType,
): boolean =>
  M.value(pinType).pipe(
    M.withReturnType<boolean>(),
    M.when('Numeric', () => numericCharPattern.test(char)),
    M.when('Alphanumeric', () => alphanumericCharPattern.test(char)),
    M.when('Alphabetic', () => alphabeticCharPattern.test(char)),
    M.exhaustive,
  )

/**
 * Strips characters disallowed by `pinType` from `raw`.
 *
 * @example
 * ```typescript
 * sanitizePinText('12-34 56', 'Numeric') // '123456'
 * sanitizePinText('ab-12!', 'Alphanumeric') // 'ab12'
 * sanitizePinText('a1b2c3', 'Alphabetic') // 'abc'
 * ```
 */
export const sanitizePinText = (
  raw: string,
  pinType: PinType = defaultPinType,
): string =>
  M.value(pinType).pipe(
    M.withReturnType<string>(),
    M.when('Numeric', () => raw.replace(stripNonNumericPattern, '')),
    M.when('Alphanumeric', () => raw.replace(stripNonAlphanumericPattern, '')),
    M.when('Alphabetic', () => raw.replace(stripNonAlphabeticPattern, '')),
    M.exhaustive,
  )

const emptySlotsOf = (length: number): ReadonlyArray<string> =>
  Array.makeBy(length, () => '')

const normalizeSlots = (
  rawSlots: ReadonlyArray<string>,
  length: number,
): ReadonlyArray<string> =>
  Array.makeBy(length, index =>
    Option.getOrElse(Array.get(rawSlots, index), () => ''),
  )

const slotsFromString = (
  text: string,
  length: number,
  pinType: PinType = defaultPinType,
): ReadonlyArray<string> => {
  const clean = sanitizePinText(text, pinType)
  return Array.makeBy(length, index => clean.charAt(index))
}

const joinSlots = (slots: ReadonlyArray<string>): string =>
  Array.join(slots, '')

const clampSlotIndex = (index: number, length: number): number =>
  length <= 0 ? 0 : Math.min(Math.max(Math.trunc(index), 0), length - 1)

// STATE

/** The PIN input is at rest, holding its per-slot `slots` and idle `FieldDraft`. */
export const Idle = ts('Idle', {
  slots: S.Array(S.String),
  field: FieldDraft.Idle,
})
/** The PIN input is at rest. */
export type Idle = typeof Idle.Type

/** The PIN input is actively focused on `focusedIndex`, holding its per-slot `slots` and active `FieldDraft.Editing`. */
export const Editing = ts('Editing', {
  slots: S.Array(S.String),
  focusedIndex: S.Number,
  field: FieldDraft.Editing,
})
/** The PIN input is actively being edited. */
export type Editing = typeof Editing.Type

/** Where a PinInput Part stands: `Idle` or `Editing`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Editing])
/** Where a PinInput Part stands. */
export type State = typeof State.Type

/** Initial PinInput state: 6 empty slots, idle. */
export const initial: State = Idle({
  slots: emptySlotsOf(defaultLength),
  field: FieldDraft.Idle({ value: '' }),
})

/** Creates an initial idle PinInput state pre-populated from `value`. */
export const initialValue = (
  value: string,
  props: Pick<Props, 'length' | 'pinType'> = {},
): State => {
  const slots = slotsFromString(value, lengthOf(props), pinTypeOf(props))
  return Idle({
    slots,
    field: FieldDraft.Idle({ value: joinSlots(slots) }),
  })
}

// ACTIONS

/** Enters edit mode on the PIN input, focusing the first open slot. */
export const BeginPinEdit = Catalog.action('BeginPinEdit', {
  what: 'Starts editing the PIN slots',
  why: 'To enter a verification code',
  meta: { label: 'Begin PIN edit', keys: [] },
})

/** Moves focus to the PIN slot at `index`. */
export const FocusPinSlot = Catalog.action('FocusPinSlot', {
  fields: { index: S.Number },
  choose: {
    field: 'index',
    noun: 'slot',
    prompt: 'Focus which PIN slot?',
    token: S.FiniteFromString.pipe(S.decodeTo(S.Int)),
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No PIN slot is available',
  },
  what: 'Moves focus to a specific PIN slot',
  why: 'To inspect or edit a single character position',
  meta: { label: 'Focus slot', keys: [] },
})

/** Enters text into the slot at `index` (single character auto-advances; multi-char distributes across slots). */
export const ChangePinSlot = Catalog.action('ChangePinSlot', {
  fields: {
    index: S.Number,
    value: S.String,
  },
  what: 'Updates the character in a PIN slot',
  why: 'To fill or replace code digits as the user types',
  meta: { label: 'Change PIN slot', keys: [] },
})

/** Distributes a pasted string across PIN slots starting from `startIndex` (or the focused slot). */
export const PastePin = Catalog.action('PastePin', {
  fields: {
    value: S.String,
    startIndex: S.optionalKey(S.Number),
  },
  choose: {
    field: 'value',
    noun: 'code',
    prompt: 'Paste which PIN code?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No PIN code provided',
  },
  what: 'Distributes a pasted verification code across the PIN slots',
  why: 'To fill every slot at once without typing character by character',
  meta: { label: 'Paste PIN', keys: [] },
})

/** Sets the entire PIN code from `value` directly. */
export const SetPinValue = Catalog.action('SetPinValue', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'code',
    prompt: 'Set PIN code to what?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No PIN code provided',
  },
  what: 'Replaces the entire PIN value directly',
  why: 'To populate the verification code at once',
  meta: { label: 'Set PIN', keys: [] },
})

/** Clears every PIN slot to empty. */
export const ClearPin = Catalog.action('ClearPin', {
  what: 'Clears every PIN slot',
  why: 'To erase the entered code and start over',
  meta: { label: 'Clear PIN', keys: [] },
})

/** Restores the PIN slots to `props.defaultValue` (or empty) and returns to `Idle`. */
export const ResetPin = Catalog.action('ResetPin', {
  what: 'Restores the PIN slots to their starting code',
  why: 'To undo changes and return to the initial state',
  meta: { label: 'Reset PIN', keys: [] },
})

/** The Catalog Actions a PinInput Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  BeginPinEdit,
  FocusPinSlot,
  ChangePinSlot,
  PastePin,
  SetPinValue,
  ClearPin,
  ResetPin,
]

// MESSAGE

/** Focus left the PIN input group, settling the `FieldDraft` back to `Idle`. */
export const EndPinEdit = m('EndPinEdit')

/** A keyboard key was pressed while interacting with a PIN slot. */
export const PressedPinKey = m('PressedPinKey', {
  key: S.String,
  index: S.optionalKey(S.Number),
  isMeta: S.optionalKey(S.Boolean),
  isControl: S.optionalKey(S.Boolean),
  isComposing: S.optionalKey(S.Boolean),
})

/** Every Message the PinInput chart handles. */
export const Message = S.Union([
  BeginPinEdit,
  FocusPinSlot,
  ChangePinSlot,
  PastePin,
  SetPinValue,
  ClearPin,
  ResetPin,
  EndPinEdit,
  PressedPinKey,
])
/** Every Message the PinInput chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the PinInput Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the PIN group root element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives one PIN slot input element id from a base `id` and `index`. */
export const inputId = (id: string, index: number): string =>
  `${id}-input-${index.toString()}`

/** Derives the PIN label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

// SUB-BLOCK PROPS

/** Projects `PinInput.Props` onto the underlying {@link FieldDraft.Props}. */
export const fieldPropsOf = (props: Props): FieldDraft.Props => ({
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.isReadOnly === undefined ? {} : { isReadOnly: props.isReadOnly }),
  maxLength: lengthOf(props),
  ...(props.settleMs === undefined ? {} : { settleMs: props.settleMs }),
  ...(props.defaultValue === undefined
    ? {}
    : { defaultValue: props.defaultValue }),
})

// READINGS

/** Normalized per-slot character array matching `lengthOf(props)`. */
export const slotsOf = (
  state: State,
  props: Pick<Props, 'length'> = {},
): ReadonlyArray<string> =>
  props.length === undefined
    ? state.slots
    : normalizeSlots(state.slots, lengthOf(props))

/** Character at `index`, or `''` when empty or out of bounds. */
export const slotValueAt = (
  state: State,
  index: number,
  props: Pick<Props, 'length'> = {},
): string => Option.getOrElse(Array.get(slotsOf(state, props), index), () => '')

/** Joined string value of all filled PIN slots in order. */
export const valueOf = (
  state: State,
  props: Pick<Props, 'length'> = {},
): string => joinSlots(slotsOf(state, props))

/** Number of non-empty PIN slots. */
export const filledCountOf = (
  state: State,
  props: Pick<Props, 'length'> = {},
): number => Array.filter(slotsOf(state, props), char => char.length > 0).length

/** True when every slot up to `lengthOf(props)` contains a character. */
export const isCompleteOf = (
  state: State,
  props: Pick<Props, 'length'> = {},
): boolean => {
  const total = lengthOf(props)
  return total > 0 && filledCountOf(state, props) === total
}

/** True when every PIN slot is empty. */
export const isEmptyOf = (
  state: State,
  props: Pick<Props, 'length'> = {},
): boolean => filledCountOf(state, props) === 0

/** True while `state` is `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True while `state` is `Editing`. */
export const isEditing = (state: State): boolean => state._tag === 'Editing'

/** Currently focused slot index while `Editing`, or `Option.none()` while `Idle`. */
export const focusedIndexOf = (state: State): Option.Option<number> =>
  state._tag === 'Editing' ? Option.some(state.focusedIndex) : Option.none()

/** Slot index that holds roving `tabIndex={0}` (focused slot when editing, else next unfilled or last slot). */
export const tabbableIndexOf = (
  state: State,
  props: Pick<Props, 'length'> = {},
): number => {
  const total = lengthOf(props)
  if (state._tag === 'Editing') {
    return clampSlotIndex(state.focusedIndex, total)
  } else {
    return Math.min(filledCountOf(state, props), total - 1)
  }
}

// INTERNAL TRANSITION HELPERS

const setSlotAt = (
  slots: ReadonlyArray<string>,
  index: number,
  char: string,
): ReadonlyArray<string> =>
  Array.map(slots, (existing, current) => (current === index ? char : existing))

const editingFieldOf = (
  field: FieldDraft.State,
  message: FieldDraft.Message,
  props: Props,
): FieldDraft.Editing => {
  const [next] = FieldDraft.chart.transition(
    field,
    message,
    fieldPropsOf(props),
  )
  return next._tag === 'Editing'
    ? next
    : FieldDraft.Editing({ value: next.value, draft: next.value })
}

const idleFieldOf = (
  field: FieldDraft.State,
  message: FieldDraft.Message,
  props: Props,
): FieldDraft.Idle => {
  const [next] = FieldDraft.chart.transition(
    field,
    message,
    fieldPropsOf(props),
  )
  return next._tag === 'Idle' ? next : FieldDraft.Idle({ value: next.value })
}

const nextSlotAfter = (index: number, length: number): number =>
  Option.getOrElse(
    RovingFocus.stepEnabled({
      count: length,
      current: Option.some(index),
      move: 'Next',
      loop: false,
    }),
    () => clampSlotIndex(index, length),
  )

const prevSlotBefore = (index: number, length: number): number =>
  Option.getOrElse(
    RovingFocus.stepEnabled({
      count: length,
      current: Option.some(index),
      move: 'Previous',
      loop: false,
    }),
    () => 0,
  )

const distributeText = (
  currentSlots: ReadonlyArray<string>,
  startIndex: number,
  rawText: string,
  props: Props,
): Option.Option<
  Readonly<{ slots: ReadonlyArray<string>; nextFocusIndex: number }>
> => {
  const total = lengthOf(props)
  const clean = sanitizePinText(rawText, pinTypeOf(props))
  if (clean.length === 0) {
    return Option.none()
  }
  const baseSlots = normalizeSlots(currentSlots, total)
  const start = clampSlotIndex(startIndex, total)
  const chars = Array.makeBy(Math.min(clean.length, total - start), offset =>
    clean.charAt(offset),
  )
  const nextSlots = Array.map(baseSlots, (existing, slotIndex) => {
    const offset = slotIndex - start
    if (offset >= 0 && offset < chars.length) {
      return Option.getOrElse(Array.get(chars, offset), () => existing)
    } else {
      return existing
    }
  })
  const nextFocusIndex = Math.min(start + chars.length, total - 1)
  return Option.some({ slots: nextSlots, nextFocusIndex })
}

const applySlotEntry = (
  state: State,
  index: number,
  rawValue: string,
  props: Props,
): Option.Option<State> => {
  const total = lengthOf(props)
  const safeIndex = clampSlotIndex(index, total)
  const currentSlots = normalizeSlots(state.slots, total)

  if (rawValue.length === 0) {
    const nextSlots = setSlotAt(currentSlots, safeIndex, '')
    const joined = joinSlots(nextSlots)
    return Option.some(
      Editing({
        slots: nextSlots,
        focusedIndex: safeIndex,
        field: editingFieldOf(
          state.field,
          FieldDraft.ChangeDraft({ value: joined }),
          props,
        ),
      }),
    )
  }

  if (rawValue.length > 1) {
    return Option.map(
      distributeText(currentSlots, safeIndex, rawValue, props),
      distributed => {
        const joined = joinSlots(distributed.slots)
        const editedField = editingFieldOf(
          state.field,
          FieldDraft.ChangeDraft({ value: joined }),
          props,
        )
        const nextEditing = Editing({
          slots: distributed.slots,
          focusedIndex: distributed.nextFocusIndex,
          field: editedField,
        })
        if (blurOnCompleteOf(props) && isCompleteOf(nextEditing, props)) {
          return Idle({
            slots: distributed.slots,
            field: idleFieldOf(editedField, FieldDraft.CommitDraft(), props),
          })
        } else {
          return nextEditing
        }
      },
    )
  }

  const char = rawValue.charAt(0)
  if (!isValidPinChar(char, pinTypeOf(props))) {
    return Option.none()
  }
  const nextSlots = setSlotAt(currentSlots, safeIndex, char)
  const joined = joinSlots(nextSlots)
  const editedField = editingFieldOf(
    state.field,
    FieldDraft.ChangeDraft({ value: joined }),
    props,
  )
  const nextFocusIndex = nextSlotAfter(safeIndex, total)
  const nextEditing = Editing({
    slots: nextSlots,
    focusedIndex: nextFocusIndex,
    field: editedField,
  })
  if (blurOnCompleteOf(props) && isCompleteOf(nextEditing, props)) {
    return Option.some(
      Idle({
        slots: nextSlots,
        field: idleFieldOf(editedField, FieldDraft.CommitDraft(), props),
      }),
    )
  } else {
    return Option.some(nextEditing)
  }
}

const applyPaste = (
  state: State,
  rawValue: string,
  startIndex: number,
  props: Props,
): Option.Option<State> =>
  Option.map(
    distributeText(state.slots, startIndex, rawValue, props),
    distributed => {
      const joined = joinSlots(distributed.slots)
      const editedField = editingFieldOf(
        state.field,
        FieldDraft.ChangeDraft({ value: joined }),
        props,
      )
      const nextEditing = Editing({
        slots: distributed.slots,
        focusedIndex: distributed.nextFocusIndex,
        field: editedField,
      })
      if (blurOnCompleteOf(props) && isCompleteOf(nextEditing, props)) {
        return Idle({
          slots: distributed.slots,
          field: idleFieldOf(editedField, FieldDraft.CommitDraft(), props),
        })
      } else {
        return nextEditing
      }
    },
  )

const applyBackspace = (
  state: Editing,
  slotIndex: number,
  props: Props,
): Editing => {
  const total = lengthOf(props)
  const currentSlots = normalizeSlots(state.slots, total)
  const currentChar = Option.getOrElse(
    Array.get(currentSlots, slotIndex),
    () => '',
  )
  if (currentChar.length > 0) {
    const nextSlots = setSlotAt(currentSlots, slotIndex, '')
    const retreatedIndex = prevSlotBefore(slotIndex, total)
    return Editing({
      slots: nextSlots,
      focusedIndex: retreatedIndex,
      field: editingFieldOf(
        state.field,
        FieldDraft.ChangeDraft({ value: joinSlots(nextSlots) }),
        props,
      ),
    })
  } else {
    const retreatedIndex = prevSlotBefore(slotIndex, total)
    const nextSlots = setSlotAt(currentSlots, retreatedIndex, '')
    return Editing({
      slots: nextSlots,
      focusedIndex: retreatedIndex,
      field: editingFieldOf(
        state.field,
        FieldDraft.ChangeDraft({ value: joinSlots(nextSlots) }),
        props,
      ),
    })
  }
}

const resolveEditingKey = (
  state: Editing,
  message: typeof PressedPinKey.Type,
  props: Props,
): Option.Option<State> => {
  if (message.isComposing === true || !canEdit(props)) {
    return Option.none()
  }
  const total = lengthOf(props)
  const currentIndex = clampSlotIndex(
    message.index ?? state.focusedIndex,
    total,
  )

  if (message.key === 'Escape') {
    return Option.some(
      Idle({
        slots: normalizeSlots(state.slots, total),
        field: idleFieldOf(state.field, FieldDraft.CommitDraft(), props),
      }),
    )
  }

  if (message.key === 'Backspace') {
    return Option.some(applyBackspace(state, currentIndex, props))
  }

  if (message.key === 'Delete') {
    const currentSlots = normalizeSlots(state.slots, total)
    const nextSlots = setSlotAt(currentSlots, currentIndex, '')
    return Option.some(
      Editing({
        slots: nextSlots,
        focusedIndex: currentIndex,
        field: editingFieldOf(
          state.field,
          FieldDraft.ChangeDraft({ value: joinSlots(nextSlots) }),
          props,
        ),
      }),
    )
  }

  if (message.isMeta !== true && message.isControl !== true) {
    const maybeMoved = RovingFocus.resolveKey({
      key: message.key,
      count: total,
      current: Option.some(currentIndex),
      orientation: 'Horizontal',
      direction: directionOf(props),
      loop: false,
      pageKeys: false,
    })
    if (Option.isSome(maybeMoved)) {
      return Option.some(
        Editing({
          slots: normalizeSlots(state.slots, total),
          focusedIndex: maybeMoved.value,
          field: state.field,
        }),
      )
    }

    if (message.key.length === 1) {
      return applySlotEntry(state, currentIndex, message.key, props)
    }
  }

  return Option.none()
}

const canEditGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => canEdit(context)

const resetToIdle = (props: Props): Idle => {
  const slots = slotsFromString(
    props.defaultValue ?? '',
    lengthOf(props),
    pinTypeOf(props),
  )
  return Idle({
    slots,
    field: FieldDraft.Idle({ value: joinSlots(slots) }),
  })
}

const asIdle = (maybeNext: Option.Option<State>): Option.Option<Idle> =>
  Option.flatMap(maybeNext, next =>
    next._tag === 'Idle' ? Option.some(next) : Option.none(),
  )

const asEditing = (maybeNext: Option.Option<State>): Option.Option<Editing> =>
  Option.flatMap(maybeNext, next =>
    next._tag === 'Editing' ? Option.some(next) : Option.none(),
  )

// CHART

/**
 * Builds the PinInput Machine chart starting in `initialState`, composing
 * `FieldDraft` for typing settlement and `RovingFocus` for slot navigation.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          BeginPinEdit: [
            when(canEditGuard, 'Editing', ({ state, context }) => {
              const total = lengthOf(context)
              const slots = normalizeSlots(state.slots, total)
              return Editing({
                slots,
                focusedIndex: tabbableIndexOf(state, context),
                field: editingFieldOf(
                  state.field,
                  FieldDraft.BeginEdit(),
                  context,
                ),
              })
            }),
            ignore(),
          ],
          FocusPinSlot: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Editing',
              ({ state, message, context }) => {
                const total = lengthOf(context)
                const slots = normalizeSlots(state.slots, total)
                return Editing({
                  slots,
                  focusedIndex: clampSlotIndex(message.index, total),
                  field: FieldDraft.Editing({
                    value: state.field.value,
                    draft: joinSlots(slots),
                  }),
                })
              },
            ),
            ignore(),
          ],
          ChangePinSlot: [
            when(
              (state, message, context) =>
                canEdit(context)
                  ? asIdle(
                      applySlotEntry(
                        state,
                        message.index,
                        message.value,
                        context,
                      ),
                    )
                  : Option.none(),
              'Idle',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                canEdit(context)
                  ? asEditing(
                      applySlotEntry(
                        state,
                        message.index,
                        message.value,
                        context,
                      ),
                    )
                  : Option.none(),
              'Editing',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          PastePin: [
            when(
              (state, message, context) =>
                canEdit(context)
                  ? asIdle(
                      applyPaste(
                        state,
                        message.value,
                        message.startIndex ?? 0,
                        context,
                      ),
                    )
                  : Option.none(),
              'Idle',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                canEdit(context)
                  ? asEditing(
                      applyPaste(
                        state,
                        message.value,
                        message.startIndex ?? 0,
                        context,
                      ),
                    )
                  : Option.none(),
              'Editing',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          SetPinValue: [
            when(canEditGuard, 'Idle', ({ message, context }) => {
              const slots = slotsFromString(
                message.value,
                lengthOf(context),
                pinTypeOf(context),
              )
              return Idle({
                slots,
                field: FieldDraft.Idle({ value: joinSlots(slots) }),
              })
            }),
            ignore(),
          ],
          ClearPin: [
            when(canEditGuard, 'Idle', ({ context }) =>
              Idle({
                slots: emptySlotsOf(lengthOf(context)),
                field: FieldDraft.Idle({ value: '' }),
              }),
            ),
            ignore(),
          ],
          ResetPin: to('Idle', ({ context }) => resetToIdle(context)),
          EndPinEdit: [ignore()],
          PressedPinKey: [ignore()],
        },
      },
      Editing: {
        on: {
          BeginPinEdit: [ignore()],
          FocusPinSlot: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Editing',
              ({ state, message, context }) => {
                const total = lengthOf(context)
                return Editing({
                  slots: normalizeSlots(state.slots, total),
                  focusedIndex: clampSlotIndex(message.index, total),
                  field: state.field,
                })
              },
            ),
            ignore(),
          ],
          ChangePinSlot: [
            when(
              (state, message, context) =>
                canEdit(context)
                  ? asIdle(
                      applySlotEntry(
                        state,
                        message.index,
                        message.value,
                        context,
                      ),
                    )
                  : Option.none(),
              'Idle',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                canEdit(context)
                  ? asEditing(
                      applySlotEntry(
                        state,
                        message.index,
                        message.value,
                        context,
                      ),
                    )
                  : Option.none(),
              'Editing',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          PastePin: [
            when(
              (state, message, context) =>
                canEdit(context)
                  ? asIdle(
                      applyPaste(
                        state,
                        message.value,
                        message.startIndex ?? state.focusedIndex,
                        context,
                      ),
                    )
                  : Option.none(),
              'Idle',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                canEdit(context)
                  ? asEditing(
                      applyPaste(
                        state,
                        message.value,
                        message.startIndex ?? state.focusedIndex,
                        context,
                      ),
                    )
                  : Option.none(),
              'Editing',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          SetPinValue: [
            when(canEditGuard, 'Editing', ({ message, context }) => {
              const total = lengthOf(context)
              const slots = slotsFromString(
                message.value,
                total,
                pinTypeOf(context),
              )
              const joined = joinSlots(slots)
              return Editing({
                slots,
                focusedIndex: Math.min(joined.length, total - 1),
                field: FieldDraft.Editing({ value: joined, draft: joined }),
              })
            }),
            ignore(),
          ],
          ClearPin: [
            when(canEditGuard, 'Editing', ({ context }) =>
              Editing({
                slots: emptySlotsOf(lengthOf(context)),
                focusedIndex: 0,
                field: FieldDraft.Editing({ value: '', draft: '' }),
              }),
            ),
            ignore(),
          ],
          ResetPin: to('Idle', ({ context }) => resetToIdle(context)),
          EndPinEdit: to('Idle', ({ state, context }) =>
            Idle({
              slots: normalizeSlots(state.slots, lengthOf(context)),
              field: idleFieldOf(
                state.field,
                FieldDraft.CommitDraft(),
                context,
              ),
            }),
          ),
          PressedPinKey: [
            when(
              (state, message, context) =>
                asIdle(resolveEditingKey(state, message, context)),
              'Idle',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                asEditing(resolveEditingKey(state, message, context)),
              'Editing',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** The default PinInput Machine chart starting empty and idle. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the PinInput sync table using `Pace.Settled({ afterMs })` for
 * `ChangePinSlot` and `Pace.Synced()` for discrete focus, paste, clear, and reset.
 */
export const syncOf = (
  settleMs: number = defaultSettleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  BeginPinEdit: Synced(),
  FocusPinSlot: Synced(),
  ChangePinSlot: Settled({ afterMs: settleMs }),
  PastePin: Synced(),
  SetPinValue: Synced(),
  ClearPin: Synced(),
  ResetPin: Synced(),
  EndPinEdit: Synced(),
  PressedPinKey: Synced(),
})

/** Default synchronization table for PinInput. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a PinInput kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  BeginPinEdit: Device({ because }),
  FocusPinSlot: Device({ because }),
  ChangePinSlot: Device({ because }),
  PastePin: Device({ because }),
  SetPinValue: Device({ because }),
  ClearPin: Device({ because }),
  ResetPin: Device({ because }),
  EndPinEdit: Device({ because }),
  PressedPinKey: Device({ because }),
})

/** Device-only synchronization table for secret OTP / PIN codes (`Device({ because: 'Secret' })`). */
export const secretSync: Readonly<Record<Message['_tag'], Sync>> =
  deviceSync('Secret')

// SLOTS & PROJECTION

/**
 * The three painted slots of a PinInput Part:
 * - `Root`: grouping container (`role="group"`).
 * - `Input`: one character slot keyed by its zero-based index (`role="textbox"`).
 * - `Label`: clickable label linked via `aria-labelledby` (`BeginPinEdit`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Input: {
    role: 'TextBox',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'FocusPinSlot' }],
  },
  Label: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'BeginPinEdit' }],
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

const parseSlotChoice = (
  maybeChoice: Option.Option<string>,
  total: number,
): number =>
  Option.match(maybeChoice, {
    onNone: () => 0,
    onSome: raw => {
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? clampSlotIndex(parsed, total) : 0
    },
  })

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      ...labelSlotPropsOf(props),
      ...(props.describedBy === undefined
        ? {}
        : { describedBy: props.describedBy }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isInvalidOf(props) ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Input') {
    const total = lengthOf(props)
    const index = parseSlotChoice(maybeChoice, total)
    const tabbable = tabbableIndexOf(state, props)
    const isTabbable = !isDisabledOf(props) && index === tabbable
    return {
      id: inputId(props.id, index),
      label: `PIN character ${(index + 1).toString()} of ${total.toString()}`,
      tabIndex: isTabbable ? 0 : -1,
      isCurrent: Option.contains(focusedIndexOf(state), index),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
      ...(isInvalidOf(props) ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Label') {
    return {
      id: labelId(props.id),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a PinInput on: settles `FieldDraft` to `Idle` while
 * preserving the entered slots.
 */
export const atRest = (state: State): State =>
  Idle({
    slots: state.slots,
    field: FieldDraft.Idle({ value: joinSlots(state.slots) }),
  })

// PART FACTORY

/** Options for customizing a PinInput Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  sync?: 'Synced' | DeviceReason
  settleMs?: number
  length?: number
  pinType?: PinType
  defaultValue?: string
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a PinInput {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * `ChangePinSlot` at `Pace.Settled`). Use {@link secret} for OTP/PIN codes that
 * must stay on the device (`Device({ because: 'Secret' })`).
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const settleMs = options.settleMs ?? defaultSettleMs
  const initialState: State =
    options.defaultValue === undefined && options.length === undefined
      ? initial
      : initialValue(options.defaultValue ?? '', {
          ...(options.length === undefined ? {} : { length: options.length }),
          ...(options.pinType === undefined
            ? {}
            : { pinType: options.pinType }),
        })
  return Part.define<State, Message, Props>({
    name: options.name ?? 'PinInput',
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
 * Shorthand for a secret PinInput Part (OTP codes, security PINs) whose
 * Messages are all `Device({ because: 'Secret' })` so sensitive codes never
 * enter synced logs or snapshots.
 */
export const secret = (
  options: Omit<MakeOptions, 'sync'> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...options,
    sync: 'Secret',
  })

/** Shorthand for a PinInput Part whose state stays on the device. */
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

/** The default synced PinInput Part (`name: 'PinInput'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

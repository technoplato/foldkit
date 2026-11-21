import { Array, Option, Schema as S } from 'effect'

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
import type { SlotProps } from './slot.js'

// NOTE: this is the core Textarea Part (Widget #13 of 54, Scribe #2631).
// It composes `FieldDraft` into one framework-free Machine and Part
// declaration covering packages/ui Textarea and multiline text fields. Its
// state (`Idle` | `Editing`) lives in the Model, synced by default (`Domain`
// category) using `Pace.Settled` on keystrokes (200 ms default — never waiting
// for blur) and `Pace.Synced` on discrete actions, with `Textarea.deviceOnly()`
// for local-only fields. Reference-stable SlotBindings (`Textarea`, `Label`,
// `Description`, `Error`, `ClearButton`) project generic multiline TextBox
// ARIA (`aria-multiline="true"`) and render through HTML, React, and React
// Native generic hosts with zero Textarea-specific painter logic.

// SCHEMAS & CONSTANTS

/** Default typing-pause settle window in milliseconds (`200`). */
export const defaultSettleMs: number = FieldDraft.defaultSettleMs

/** Default visible row count when neither `minRows` nor `rows` is supplied (`3`). */
export const defaultRows: number = 3

/** Supported resize policies for a multiline text field (`'Vertical'` by default). */
export const ResizeMode = S.Literals([
  'None',
  'Vertical',
  'Horizontal',
  'Both',
  'Auto',
])
/** Supported resize policies for a multiline text field. */
export type ResizeMode = typeof ResizeMode.Type

/** Default resize policy when `resize` is omitted (`'Vertical'`). */
export const defaultResizeMode: ResizeMode = 'Vertical'

/** Pure outcome of a keyboard shortcut while editing a multiline textarea. */
export const TextareaKeyOutcome = S.Literals(['Commit', 'Cancel'])
/** Pure outcome of a keyboard shortcut while editing a multiline textarea. */
export type TextareaKeyOutcome = typeof TextareaKeyOutcome.Type

/**
 * Read-only props supplied to the Textarea chart and projection from the
 * Program's Model. Configuration, row bounds, and accessibility linkage stay
 * out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  placeholder: S.optionalKey(S.String),
  name: S.optionalKey(S.String),
  rows: S.optionalKey(S.Number),
  minRows: S.optionalKey(S.Number),
  maxRows: S.optionalKey(S.Number),
  autoGrow: S.optionalKey(S.Boolean),
  resize: S.optionalKey(ResizeMode),
  submitOnModEnter: S.optionalKey(S.Boolean),
  cancelOnEscape: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  maxLength: S.optionalKey(S.Number),
  trimOnCommit: S.optionalKey(S.Boolean),
  commitOnBlur: S.optionalKey(S.Boolean),
  blurBehavior: S.optionalKey(FieldDraft.BlurBehavior),
  defaultValue: S.optionalKey(S.String),
  settleMs: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  hasDescription: S.optionalKey(S.Boolean),
  hasError: S.optionalKey(S.Boolean),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
})
/** Read-only props supplied to the Textarea chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The textarea is at rest, holding its committed `field`. */
export const Idle = ts('Idle', {
  field: FieldDraft.Idle,
})
/** The textarea is at rest. */
export type Idle = typeof Idle.Type

/** The textarea is actively being edited, holding its live `field` draft. */
export const Editing = ts('Editing', {
  field: FieldDraft.Editing,
})
/** The textarea is actively being edited. */
export type Editing = typeof Editing.Type

/** Where a Textarea Part stands: `Idle` or `Editing`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Editing])
/** Where a Textarea Part stands. */
export type State = typeof State.Type

/** Initial Textarea state: idle with an empty string. */
export const initial: State = Idle({
  field: FieldDraft.Idle({ value: '' }),
})

/** Creates an initial idle Textarea state from a starting `value`. */
export const initialValue = (value: string): State =>
  Idle({
    field: FieldDraft.Idle({ value }),
  })

/** Creates an initial editing Textarea state with `value` and `draft` (defaulting to `value`). */
export const initialEditing = (value: string, draft: string = value): State =>
  Editing({
    field: FieldDraft.Editing({ value, draft }),
  })

// ACTIONS

/** Updates the textarea draft immediately on this device; synced via `Pace.Settled` on typing pauses. */
export const ChangeTextarea = Catalog.action('ChangeTextarea', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'text',
    prompt: 'Enter text',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No text to enter',
  },
  what: 'Updates the multiline draft with the entered text',
  why: 'To compose or edit multiline content',
  meta: { label: 'Change textarea', keys: [] },
})

/** Enters edit mode for the multiline text field. */
export const BeginEdit = Catalog.action('BeginEdit', {
  what: 'Starts editing the multiline text field',
  why: 'To modify the multiline content',
  meta: { label: 'Begin edit', keys: [] },
})

/** Commits the current multiline draft as the saved value and exits edit mode. */
export const CommitTextarea = Catalog.action('CommitTextarea', {
  what: 'Commits the multiline draft as the saved value',
  why: 'To keep the edited text',
  meta: { label: 'Commit textarea', keys: [] },
})

/** Reverts the multiline draft to the committed value and exits edit mode. */
export const CancelTextarea = Catalog.action('CancelTextarea', {
  what: 'Cancels editing and restores the committed value',
  why: 'To discard unsaved edits',
  meta: { label: 'Cancel textarea', keys: [] },
})

/** Clears the multiline value and active draft to empty text. */
export const ClearTextarea = Catalog.action('ClearTextarea', {
  what: 'Clears the multiline field value',
  why: 'To empty the field quickly',
  meta: { label: 'Clear textarea', keys: [] },
})

/** The Catalog Actions a Textarea Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ChangeTextarea,
  BeginEdit,
  CommitTextarea,
  CancelTextarea,
  ClearTextarea,
]

// MESSAGES

/** Focus left the textarea (blur): commits, cancels, or keeps draft per `blurBehavior` / `commitOnBlur`. */
export const EndEdit = m('EndEdit')

/** A keyboard key was pressed while editing the textarea. */
export const PressedTextareaKey = m('PressedTextareaKey', {
  key: S.String,
  isComposing: S.optionalKey(S.Boolean),
  isShift: S.optionalKey(S.Boolean),
  isMeta: S.optionalKey(S.Boolean),
  isControl: S.optionalKey(S.Boolean),
  isAlt: S.optionalKey(S.Boolean),
})

/** External or remote value update reconciled through `FieldDraft.SetFieldValue`. */
export const SetTextareaValue = m('SetTextareaValue', {
  value: S.String,
  force: S.optionalKey(S.Boolean),
})

/** Enclosing form reset: restores `props.defaultValue` (or `''`) and returns to `Idle`. */
export const ResetTextarea = m('ResetTextarea')

/** Every Message the Textarea chart handles. */
export const Message = S.Union([
  ChangeTextarea,
  BeginEdit,
  CommitTextarea,
  CancelTextarea,
  ClearTextarea,
  EndEdit,
  PressedTextareaKey,
  SetTextareaValue,
  ResetTextarea,
])
/** Every Message the Textarea chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Textarea Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the textarea control element id from a base `id`. */
export const textareaId = (id: string): string => `${id}-textarea`

/** Derives the textarea label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

/** Derives the textarea description element id from a base `id`. */
export const descriptionId = (id: string): string => `${id}-description`

/** Derives the textarea error message element id from a base `id`. */
export const errorId = (id: string): string => `${id}-error`

/** Derives the clear button id from a base `id`. */
export const clearButtonId = (id: string): string => `${id}-clear`

// PURE RULES & HELPERS

/** True when the textarea is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  FieldDraft.isDisabledOf(props)

/** True when the textarea is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  FieldDraft.isReadOnlyOf(props)

/** True when the textarea is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'> = {}): boolean =>
  props.isRequired === true

/** True when the textarea is currently invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/**
 * Resolved resize policy for the textarea (`'Auto'` when `autoGrow: true` and
 * `resize` is omitted, otherwise `props.resize ?? 'Vertical'`).
 *
 * @example
 * ```typescript
 * resizeModeOf({}) // 'Vertical'
 * resizeModeOf({ autoGrow: true }) // 'Auto'
 * resizeModeOf({ resize: 'None' }) // 'None'
 * ```
 */
export const resizeModeOf = (
  props: Pick<Props, 'resize' | 'autoGrow'> = {},
): ResizeMode =>
  props.resize ?? (props.autoGrow === true ? 'Auto' : defaultResizeMode)

/**
 * True when the textarea accepts user typing or mutations: neither disabled
 * nor read-only, and if `hasHandler` is specified, a handler exists. Shared by
 * thin painters such as `@foldkit/ui` `Textarea`.
 *
 * @example
 * ```typescript
 * canInput({}) // true
 * canInput({ isDisabled: true }) // false
 * canInput({ isReadOnly: true }) // false
 * canInput({ hasHandler: false }) // false
 * ```
 */
export const canInput = (
  input: Readonly<{
    isDisabled?: boolean
    isReadOnly?: boolean
    hasHandler?: boolean
  }> = {},
): boolean => FieldDraft.canEdit(input) && input.hasHandler !== false

/** Projects `Textarea.Props` onto the underlying {@link FieldDraft.Props}. */
export const fieldPropsOf = (props: Props): FieldDraft.Props => ({
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.isReadOnly === undefined ? {} : { isReadOnly: props.isReadOnly }),
  ...(props.maxLength === undefined ? {} : { maxLength: props.maxLength }),
  ...(props.trimOnCommit === undefined
    ? {}
    : { trimOnCommit: props.trimOnCommit }),
  ...(props.commitOnBlur === undefined
    ? {}
    : { commitOnBlur: props.commitOnBlur }),
  ...(props.blurBehavior === undefined
    ? {}
    : { blurBehavior: props.blurBehavior }),
  ...(props.defaultValue === undefined
    ? {}
    : { defaultValue: props.defaultValue }),
  ...(props.settleMs === undefined ? {} : { settleMs: props.settleMs }),
})

/**
 * Resolves a keyboard key while editing a multiline textarea:
 * - Plain `'Enter'` or `'Shift+Enter'` -> `None` (preserves newline insertion)
 * - `'Mod+Enter'` (`isMeta: true`) or `'Ctrl+Enter'` (`isControl: true`),
 *   without Alt, when `submitOnModEnter !== false` -> `Some('Commit')`
 * - `'Escape'` when `cancelOnEscape !== false` -> `Some('Cancel')`
 * - IME composition (`isComposing: true`) or any other key -> `None`
 *
 * @example
 * ```typescript
 * resolveTextareaKey({ key: 'Enter' }) // None (keeps newline)
 * resolveTextareaKey({ key: 'Enter', isMeta: true }) // Some('Commit')
 * resolveTextareaKey({ key: 'Enter', isControl: true }) // Some('Commit')
 * resolveTextareaKey({ key: 'Escape' }) // Some('Cancel')
 * resolveTextareaKey({ key: 'Enter', isMeta: true, isComposing: true }) // None
 * ```
 */
export const resolveTextareaKey = (
  input: Readonly<{
    key: string
    isComposing?: boolean
    isShift?: boolean
    isMeta?: boolean
    isControl?: boolean
    isAlt?: boolean
    submitOnModEnter?: boolean
    cancelOnEscape?: boolean
  }>,
): Option.Option<TextareaKeyOutcome> => {
  if (input.isComposing === true) {
    return Option.none()
  } else if (input.key === 'Escape' && input.cancelOnEscape !== false) {
    return Option.some('Cancel')
  } else if (
    input.key === 'Enter' &&
    input.submitOnModEnter !== false &&
    (input.isMeta === true || input.isControl === true) &&
    input.isAlt !== true
  ) {
    return Option.some('Commit')
  } else {
    return Option.none()
  }
}

// READINGS

/** The committed value held by `state`. */
export const valueOf = (state: State): string => FieldDraft.valueOf(state.field)

/** The live displayed text (`draft` while editing, else committed `value`). */
export const draftOf = (state: State): string => FieldDraft.draftOf(state.field)

const textOf = (input: State | string): string =>
  typeof input === 'string' ? input : draftOf(input)

/** True while `state` is `Editing`. */
export const isEditing = (state: State): boolean =>
  FieldDraft.isEditing(state.field)

/** True while `state` is `Idle`. */
export const isIdle = (state: State): boolean => FieldDraft.isIdle(state.field)

/** True when `state` is `Editing` and its draft differs from its committed value. */
export const isDirty = (state: State): boolean =>
  FieldDraft.isDirty(state.field)

/** True when the displayed text is empty (`''`). */
export const isEmpty = (state: State): boolean =>
  FieldDraft.isEmpty(state.field)

/** True when the displayed text is empty or whitespace-only. */
export const isBlank = (state: State): boolean =>
  FieldDraft.isBlank(state.field)

/** True when the textarea is interactive and currently editing. */
export const canSubmit = (
  state: State,
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => FieldDraft.canSubmit(state.field, props)

/**
 * Counts the number of lines in `input` (a `Textarea.State` or raw text),
 * normalizing `\r\n`, `\r`, and `\n` line breaks. Empty text counts as `1`
 * visible line.
 *
 * @example
 * ```typescript
 * lineCountOf('') // 1
 * lineCountOf('first\nsecond\nthird') // 3
 * lineCountOf('a\r\nb\n') // 3
 * ```
 */
export const lineCountOf = (input: State | string): number =>
  textOf(input).split(/\r\n|\r|\n/u).length

/**
 * Computes the visible row count for `input` (a `Textarea.State` or raw text),
 * clamping auto-grow rows between `minRows` / `rows` (default `3`, minimum
 * `1`) and optional `maxRows`. When `autoGrow` is explicitly `false`, returns
 * the fixed floor (`rows ?? minRows ?? 3`).
 *
 * @example
 * ```typescript
 * visibleRowsOf('one', { minRows: 2, maxRows: 5 }) // 2
 * visibleRowsOf('1\n2\n3\n4', { minRows: 2, maxRows: 5 }) // 4
 * visibleRowsOf('1\n2\n3\n4\n5\n6', { minRows: 2, maxRows: 5 }) // 5
 * visibleRowsOf('1\n2\n3\n4\n5', { rows: 3, autoGrow: false }) // 3
 * ```
 */
export const visibleRowsOf = (
  input: State | string,
  props: Pick<Props, 'rows' | 'minRows' | 'maxRows' | 'autoGrow'> = {},
): number => {
  if (props.autoGrow === false) {
    return Math.max(1, Math.floor(props.rows ?? props.minRows ?? defaultRows))
  }
  const lower = Math.max(
    1,
    Math.floor(props.minRows ?? props.rows ?? defaultRows),
  )
  const grown = Math.max(lower, lineCountOf(input))
  if (props.maxRows !== undefined) {
    const upper = Math.max(lower, Math.floor(props.maxRows))
    return Math.min(grown, upper)
  } else {
    return grown
  }
}

/**
 * Character length of the live text (`draftOf(state)` or raw string).
 *
 * @example
 * ```typescript
 * characterCountOf('hello\nworld') // 11
 * ```
 */
export const characterCountOf = (input: State | string): number =>
  textOf(input).length

/**
 * Remaining characters before reaching `props.maxLength` (clamped at `0`), or
 * `Option.none()` when no non-negative `maxLength` is configured.
 *
 * @example
 * ```typescript
 * remainingCharactersOf('hello', { maxLength: 10 }) // Some(5)
 * remainingCharactersOf('hello', { maxLength: 3 }) // Some(0)
 * remainingCharactersOf('hello', {}) // None
 * ```
 */
export const remainingCharactersOf = (
  input: State | string,
  props: Pick<Props, 'maxLength'> = {},
): Option.Option<number> =>
  props.maxLength !== undefined && props.maxLength >= 0
    ? Option.some(Math.max(0, props.maxLength - textOf(input).length))
    : Option.none()

/** True when a non-negative `maxLength` is configured and zero characters remain. */
export const isAtMaxLength = (
  input: State | string,
  props: Pick<Props, 'maxLength'> = {},
): boolean =>
  Option.exists(
    remainingCharactersOf(input, props),
    remaining => remaining === 0,
  )

// CHART

const canInputGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => canInput(context)

const idleFieldOf = (
  field: FieldDraft.State,
  message: FieldDraft.Message,
  context: Props,
): FieldDraft.Idle => {
  const [next] = FieldDraft.chart.transition(
    field,
    message,
    fieldPropsOf(context),
  )
  return next._tag === 'Idle' ? next : FieldDraft.Idle({ value: next.value })
}

const editingFieldOf = (
  field: FieldDraft.State,
  message: FieldDraft.Message,
  context: Props,
): FieldDraft.Editing => {
  const [next] = FieldDraft.chart.transition(
    field,
    message,
    fieldPropsOf(context),
  )
  return next._tag === 'Editing'
    ? next
    : FieldDraft.Editing({ value: next.value, draft: next.value })
}

const keyOutcomeOf = (
  message: typeof PressedTextareaKey.Type,
  context: Props,
): Option.Option<TextareaKeyOutcome> =>
  resolveTextareaKey({
    key: message.key,
    ...(message.isComposing === undefined
      ? {}
      : { isComposing: message.isComposing }),
    ...(message.isShift === undefined ? {} : { isShift: message.isShift }),
    ...(message.isMeta === undefined ? {} : { isMeta: message.isMeta }),
    ...(message.isControl === undefined
      ? {}
      : { isControl: message.isControl }),
    ...(message.isAlt === undefined ? {} : { isAlt: message.isAlt }),
    ...(context.submitOnModEnter === undefined
      ? {}
      : { submitOnModEnter: context.submitOnModEnter }),
    ...(context.cancelOnEscape === undefined
      ? {}
      : { cancelOnEscape: context.cancelOnEscape }),
  })

/**
 * Builds the Textarea Machine chart starting in `initialState`, delegating all
 * multiline draft transitions to `FieldDraft.chart` while layering Mod+Enter /
 * Ctrl+Enter commit and Escape cancel keyboard rules.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          BeginEdit: [
            when(canInputGuard, 'Editing', ({ state, context }) =>
              Editing({
                field: editingFieldOf(
                  state.field,
                  FieldDraft.BeginEdit(),
                  context,
                ),
              }),
            ),
            ignore(),
          ],
          ChangeTextarea: [
            when(canInputGuard, 'Editing', ({ state, message, context }) =>
              Editing({
                field: editingFieldOf(
                  state.field,
                  FieldDraft.ChangeDraft({ value: message.value }),
                  context,
                ),
              }),
            ),
            ignore(),
          ],
          CommitTextarea: [ignore()],
          CancelTextarea: [ignore()],
          ClearTextarea: [
            when(canInputGuard, 'Idle', ({ state, context }) =>
              Idle({
                field: idleFieldOf(
                  state.field,
                  FieldDraft.ClearDraft(),
                  context,
                ),
              }),
            ),
            ignore(),
          ],
          EndEdit: [ignore()],
          PressedTextareaKey: [ignore()],
          SetTextareaValue: to('Idle', ({ state, message, context }) =>
            Idle({
              field: idleFieldOf(
                state.field,
                FieldDraft.SetFieldValue({
                  value: message.value,
                  ...(message.force === undefined
                    ? {}
                    : { force: message.force }),
                }),
                context,
              ),
            }),
          ),
          ResetTextarea: to('Idle', ({ state, context }) =>
            Idle({
              field: idleFieldOf(state.field, FieldDraft.ResetField(), context),
            }),
          ),
        },
      },
      Editing: {
        on: {
          BeginEdit: [ignore()],
          ChangeTextarea: [
            when(canInputGuard, 'Editing', ({ state, message, context }) =>
              Editing({
                field: editingFieldOf(
                  state.field,
                  FieldDraft.ChangeDraft({ value: message.value }),
                  context,
                ),
              }),
            ),
            ignore(),
          ],
          CommitTextarea: [
            when(canInputGuard, 'Idle', ({ state, context }) =>
              Idle({
                field: idleFieldOf(
                  state.field,
                  FieldDraft.CommitDraft(),
                  context,
                ),
              }),
            ),
            ignore(),
          ],
          CancelTextarea: [
            when(canInputGuard, 'Idle', ({ state, context }) =>
              Idle({
                field: idleFieldOf(
                  state.field,
                  FieldDraft.CancelDraft(),
                  context,
                ),
              }),
            ),
            ignore(),
          ],
          ClearTextarea: [
            when(canInputGuard, 'Editing', ({ state, context }) =>
              Editing({
                field: editingFieldOf(
                  state.field,
                  FieldDraft.ClearDraft(),
                  context,
                ),
              }),
            ),
            ignore(),
          ],
          EndEdit: [
            when(
              (_state, _message, context) =>
                FieldDraft.blurBehaviorOf(context) === 'Commit' &&
                canInput(context),
              'Idle',
              ({ state, context }) =>
                Idle({
                  field: idleFieldOf(
                    state.field,
                    FieldDraft.EndEdit(),
                    context,
                  ),
                }),
            ),
            when(
              (_state, _message, context) =>
                FieldDraft.blurBehaviorOf(context) === 'Cancel',
              'Idle',
              ({ state, context }) =>
                Idle({
                  field: idleFieldOf(
                    state.field,
                    FieldDraft.EndEdit(),
                    context,
                  ),
                }),
            ),
            ignore(),
          ],
          PressedTextareaKey: [
            when(
              (_state, message, context) =>
                canInput(context) &&
                Option.contains(keyOutcomeOf(message, context), 'Commit'),
              'Idle',
              ({ state, context }) =>
                Idle({
                  field: idleFieldOf(
                    state.field,
                    FieldDraft.CommitDraft(),
                    context,
                  ),
                }),
            ),
            when(
              (_state, message, context) =>
                canInput(context) &&
                Option.contains(keyOutcomeOf(message, context), 'Cancel'),
              'Idle',
              ({ state, context }) =>
                Idle({
                  field: idleFieldOf(
                    state.field,
                    FieldDraft.CancelDraft(),
                    context,
                  ),
                }),
            ),
            ignore(),
          ],
          SetTextareaValue: to('Editing', ({ state, message, context }) =>
            Editing({
              field: editingFieldOf(
                state.field,
                FieldDraft.SetFieldValue({
                  value: message.value,
                  ...(message.force === undefined
                    ? {}
                    : { force: message.force }),
                }),
                context,
              ),
            }),
          ),
          ResetTextarea: to('Idle', ({ state, context }) =>
            Idle({
              field: idleFieldOf(state.field, FieldDraft.ResetField(), context),
            }),
          ),
        },
      },
    },
  })

/** The default Textarea Machine chart starting in `Idle({ field: Idle({ value: '' }) })`. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the Textarea sync table using `Pace.Settled({ afterMs })` on
 * `ChangeTextarea` (typing syncs on pauses, never waiting for blur) and
 * `Pace.Synced()` on discrete actions.
 *
 * @example
 * ```typescript
 * syncOf(200).ChangeTextarea // Settled({ afterMs: 200 })
 * syncOf(200).CommitTextarea // Synced()
 * ```
 */
export const syncOf = (
  settleMs: number = defaultSettleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  ChangeTextarea: Settled({ afterMs: settleMs }),
  BeginEdit: Synced(),
  CommitTextarea: Synced(),
  CancelTextarea: Synced(),
  ClearTextarea: Synced(),
  EndEdit: Synced(),
  PressedTextareaKey: Synced(),
  SetTextareaValue: Synced(),
  ResetTextarea: Synced(),
})

/** Default synchronization: `ChangeTextarea` uses `Pace.Settled({ afterMs: 200 })`, all discrete actions use `Pace.Synced()`. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a Textarea kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  ChangeTextarea: Device({ because }),
  BeginEdit: Device({ because }),
  CommitTextarea: Device({ because }),
  CancelTextarea: Device({ because }),
  ClearTextarea: Device({ because }),
  EndEdit: Device({ because }),
  PressedTextareaKey: Device({ because }),
  SetTextareaValue: Device({ because }),
  ResetTextarea: Device({ because }),
})

/** Returns the {@link Sync} pace for one Textarea Message under `settleMs`. */
export const paceOf = (
  message: Message,
  settleMs: number = defaultSettleMs,
): Sync => syncOf(settleMs)[message._tag]

// SLOTS & PROJECTION

/**
 * The painted slots of a Textarea Part:
 * - `Textarea`: the multiline text control (`role="textbox"`, `aria-multiline="true"`, ARIA state & linkage).
 * - `Label`: the clickable label linked via `aria-labelledby` (`BeginEdit`).
 * - `Description`: the helper text linked via `aria-describedby`.
 * - `Error`: the validation error message linked via `aria-describedby` when invalid.
 * - `ClearButton`: button that clears the field (`role="button"`, `aria-controls`, `ClearTextarea`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Textarea: {
    role: 'TextBox',
    focus: 'None',
    gestures: [],
  },
  Label: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'BeginEdit' }],
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
    gestures: [{ gesture: 'Pressed', becomes: 'ClearTextarea' }],
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
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Textarea') {
    return {
      id: textareaId(props.id),
      isMultiline: true,
      tabIndex: isDisabledOf(props) ? -1 : 0,
      ...labelSlotPropsOf(props),
      ...descriptionSlotPropsOf(props),
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
    return {
      id: clearButtonId(props.id),
      controls: textareaId(props.id),
      label: 'Clear textarea',
      tabIndex: 0,
      ...(isEmpty(state) || !canInput(props) ? { isHidden: true } : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a Textarea on: settles the underlying `FieldDraft` to
 * `Idle` preserving the latest typed value so settled multiline text is never
 * discarded on reload.
 *
 * @example
 * ```typescript
 * atRest(initialEditing('old', 'line 1\nline 2'))
 * // Idle({ field: Idle({ value: 'line 1\nline 2' }) })
 * ```
 */
export const atRest = (state: State): State =>
  Idle({
    field: FieldDraft.Idle({ value: FieldDraft.draftOf(state.field) }),
  })

// PART FACTORY

/** Options for customizing a Textarea Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (such as `'OwnView'`) to keep this Textarea device-only. */
  sync?: 'Synced' | DeviceReason
  /** Typing-pause settle window in milliseconds for `ChangeTextarea` (`200` by default). */
  settleMs?: number
  /** Initial committed value for the Part's chart (`''` by default). */
  defaultValue?: string
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Textarea {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * `ChangeTextarea` with `Pace.Settled({ afterMs: settleMs ?? 200 })`, discrete
 * actions with `Pace.Synced()`). Use {@link deviceOnly} for local-only fields.
 *
 * @example
 * ```typescript
 * const NotesTextarea = Textarea.make({ name: 'NotesTextarea' })
 * const FastNotes = Textarea.make({ name: 'FastNotes', settleMs: 120 })
 * const Scratchpad = Textarea.deviceOnly({ name: 'Scratchpad' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const settleMs = options.settleMs ?? defaultSettleMs
  const initialState: State =
    options.defaultValue === undefined
      ? initial
      : initialValue(options.defaultValue)
  return Part.define<State, Message, Props>({
    name: options.name ?? 'Textarea',
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
 * Shorthand for a Textarea Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalScratchpad = Textarea.deviceOnly({ name: 'LocalScratchpad' })
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

/** The default synced Textarea Part (`name: 'Textarea'`, `category: 'Domain'`, `ChangeTextarea` at `Pace.Settled({ afterMs: 200 })`). */
export const part: Part.Part<State, Message, Props> = make()

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

// NOTE: this is the core Input Part (Widget #12 of 54, Scribe #2627).
// It composes `FieldDraft` into one framework-free Machine and Part
// declaration covering packages/ui Input, Zag editable & password-input, and
// Radix label & password-toggle-field. Its state (`Idle` | `Editing`) lives in
// the Model, synced by default (`Domain` category) using `Pace.Settled` on
// keystrokes (200 ms default — never waiting for blur) and `Pace.Synced` on
// discrete actions, with `Input.secret()` (`Device({ because: 'Secret' })`)
// and `Input.deviceOnly()` options. Reference-stable SlotBindings (`Input`,
// `Label`, `Description`, `Error`, `VisibilityToggle`, `ClearButton`,
// `Preview`) render through HTML, React, and React Native generic hosts with
// zero Input-specific painter logic.

// SCHEMAS & CONSTANTS

/** Supported text-like input types (`'text'` by default). */
export const InputType = S.Literals([
  'text',
  'email',
  'password',
  'search',
  'tel',
  'url',
  'number',
])
/** Supported text-like input types. */
export type InputType = typeof InputType.Type

/** Default input type when `type` is omitted (`'text'`). */
export const defaultInputType: InputType = 'text'

/** Default typing-pause settle window in milliseconds (`200`). */
export const defaultSettleMs: number = FieldDraft.defaultSettleMs

/** Standard `data-state` marker for password visibility (`'visible' | 'hidden'`). */
export const VisibilityState = S.Literals(['visible', 'hidden'])
/** Standard `data-state` marker for password visibility. */
export type VisibilityState = typeof VisibilityState.Type

/** Inline editable mode marker (`'preview' | 'edit'`), matching Zag `editable`. */
export const EditMode = S.Literals(['preview', 'edit'])
/** Inline editable mode marker. */
export type EditMode = typeof EditMode.Type

/** Pure outcome of a keyboard key while editing an inline editable input. */
export const EditableKeyOutcome = S.Literals(['Commit', 'Cancel'])
/** Pure outcome of a keyboard key while editing an inline editable input. */
export type EditableKeyOutcome = typeof EditableKeyOutcome.Type

/**
 * Read-only props supplied to the Input chart and projection from the
 * Program's Model. Configuration and accessibility linkage stay out of the
 * chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  type: S.optionalKey(InputType),
  placeholder: S.optionalKey(S.String),
  name: S.optionalKey(S.String),
  autoComplete: S.optionalKey(S.String),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  isEditable: S.optionalKey(S.Boolean),
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
/** Read-only props supplied to the Input chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The input is at rest, holding its committed `field` and `isPasswordVisible`. */
export const Idle = ts('Idle', {
  field: FieldDraft.Idle,
  isPasswordVisible: S.Boolean,
})
/** The input is at rest. */
export type Idle = typeof Idle.Type

/** The input is actively being edited, holding its live `field` draft and `isPasswordVisible`. */
export const Editing = ts('Editing', {
  field: FieldDraft.Editing,
  isPasswordVisible: S.Boolean,
})
/** The input is actively being edited. */
export type Editing = typeof Editing.Type

/** Where an Input Part stands: `Idle` or `Editing`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Editing])
/** Where an Input Part stands. */
export type State = typeof State.Type

/** Initial Input state: idle, empty string, password hidden. */
export const initial: State = Idle({
  field: FieldDraft.Idle({ value: '' }),
  isPasswordVisible: false,
})

/** Creates an initial idle Input state from a starting `value` and optional `isPasswordVisible`. */
export const initialValue = (
  value: string,
  isPasswordVisible: boolean = false,
): State =>
  Idle({
    field: FieldDraft.Idle({ value }),
    isPasswordVisible,
  })

/** Creates an initial editing Input state with `value`, `draft`, and optional `isPasswordVisible`. */
export const initialEditing = (
  value: string,
  draft: string = value,
  isPasswordVisible: boolean = false,
): State =>
  Editing({
    field: FieldDraft.Editing({ value, draft }),
    isPasswordVisible,
  })

// ACTIONS

/** Updates the input draft immediately on this device; synced via `Pace.Settled` on typing pauses. */
export const ChangeInput = Catalog.action('ChangeInput', {
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
  what: 'Updates the input draft with the entered text',
  why: 'To type or edit the field value',
  meta: { label: 'Change input', keys: [] },
})

/** Enters edit mode for the input field (focus or inline edit activation). */
export const BeginEdit = Catalog.action('BeginEdit', {
  what: 'Starts editing the input field',
  why: 'To modify the field value',
  meta: { label: 'Begin edit', keys: [] },
})

/** Commits the current input draft as the field value and exits edit mode. */
export const CommitInput = Catalog.action('CommitInput', {
  what: 'Commits the input draft as the field value',
  why: 'To save the edited text',
  meta: { label: 'Commit input', keys: [] },
})

/** Reverts the input draft to the committed value and exits edit mode. */
export const CancelInput = Catalog.action('CancelInput', {
  what: 'Cancels editing and restores the committed value',
  why: 'To discard unsaved edits',
  meta: { label: 'Cancel input', keys: [] },
})

/** Clears the input value and active draft to empty text. */
export const ClearInput = Catalog.action('ClearInput', {
  what: 'Clears the input value',
  why: 'To empty the field quickly',
  meta: { label: 'Clear input', keys: [] },
})

/** Toggles whether a password input reveals plain text or masks characters. */
export const TogglePasswordVisibility = Catalog.action(
  'TogglePasswordVisibility',
  {
    what: 'Toggles password visibility between hidden and shown',
    why: 'To inspect or hide a sensitive value',
    meta: { label: 'Toggle password visibility', keys: [] },
  },
)

/** Sets whether a password input reveals plain text or masks characters. */
export const SetPasswordVisible = Catalog.action('SetPasswordVisible', {
  fields: { isVisible: S.Boolean },
  what: 'Sets whether password characters are visible',
  why: 'To show or mask the password explicitly',
  meta: { label: 'Set password visible', keys: [] },
})

/** The Catalog Actions an Input Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  ChangeInput,
  BeginEdit,
  CommitInput,
  CancelInput,
  ClearInput,
  TogglePasswordVisibility,
  SetPasswordVisible,
]

// MESSAGES

/** Focus left the input field (blur): commits, cancels, or keeps draft per `blurBehavior` / `commitOnBlur`. */
export const EndEdit = m('EndEdit')

/** A keyboard key was pressed while interacting with the input or its editable preview. */
export const PressedInputKey = m('PressedInputKey', {
  key: S.String,
  isComposing: S.optionalKey(S.Boolean),
  isShift: S.optionalKey(S.Boolean),
  isMeta: S.optionalKey(S.Boolean),
  isControl: S.optionalKey(S.Boolean),
})

/** External or remote value update reconciled through `FieldDraft.SetFieldValue`. */
export const SetInputValue = m('SetInputValue', {
  value: S.String,
  force: S.optionalKey(S.Boolean),
})

/** Enclosing form reset: restores `props.defaultValue` (or `''`), returns to `Idle`, and hides any visible password. */
export const ResetInput = m('ResetInput')

/** Every Message the Input chart handles. */
export const Message = S.Union([
  ChangeInput,
  BeginEdit,
  CommitInput,
  CancelInput,
  ClearInput,
  TogglePasswordVisibility,
  SetPasswordVisible,
  EndEdit,
  PressedInputKey,
  SetInputValue,
  ResetInput,
])
/** Every Message the Input chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Input Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the input control element id from a base `id`. */
export const inputId = (id: string): string => `${id}-input`

/** Derives the input label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

/** Derives the input description element id from a base `id`. */
export const descriptionId = (id: string): string => `${id}-description`

/** Derives the input error message element id from a base `id`. */
export const errorId = (id: string): string => `${id}-error`

/** Derives the password visibility toggle button id from a base `id`. */
export const visibilityButtonId = (id: string): string => `${id}-visibility`

/** Derives the clear button id from a base `id`. */
export const clearButtonId = (id: string): string => `${id}-clear`

/** Derives the inline editable preview element id from a base `id`. */
export const previewId = (id: string): string => `${id}-preview`

// PURE RULES & HELPERS

/** True when the input is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  FieldDraft.isDisabledOf(props)

/** True when the input is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  FieldDraft.isReadOnlyOf(props)

/** True when the input is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'> = {}): boolean =>
  props.isRequired === true

/** True when the input is currently invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/** True when the input uses inline editable preview-vs-edit presentation (`false` by default). */
export const isEditableOf = (props: Pick<Props, 'isEditable'> = {}): boolean =>
  props.isEditable === true

/**
 * Resolved configured input type (`'text'` when `props.type` is omitted).
 *
 * @example
 * ```typescript
 * inputTypeOf({}) // 'text'
 * inputTypeOf({ type: 'email' }) // 'email'
 * ```
 */
export const inputTypeOf = (props: Pick<Props, 'type'> = {}): InputType =>
  props.type ?? defaultInputType

/** True when the input is configured as a password field (`type === 'password'`). */
export const isPasswordInput = (props: Pick<Props, 'type'> = {}): boolean =>
  inputTypeOf(props) === 'password'

/**
 * True when the input accepts user typing or mutations: neither disabled nor
 * read-only, and if `hasHandler` is specified, a handler exists. Shared by
 * thin painters such as `@foldkit/ui` `Input`.
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

/** Projects `Input.Props` onto the underlying {@link FieldDraft.Props}. */
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
 * Resolves a keyboard key while editing an inline editable input:
 * - `'Escape'` -> `Some('Cancel')`
 * - `'Enter'` (without Shift, Meta, or Control, unless `submitOnEnter: false`) -> `Some('Commit')`
 * - IME composition (`isComposing: true`) or any other key -> `None`
 *
 * @example
 * ```typescript
 * resolveEditableKey({ key: 'Enter' }) // Some('Commit')
 * resolveEditableKey({ key: 'Escape' }) // Some('Cancel')
 * resolveEditableKey({ key: 'Enter', isComposing: true }) // None
 * ```
 */
export const resolveEditableKey = (
  input: Readonly<{
    key: string
    isComposing?: boolean
    isShift?: boolean
    isMeta?: boolean
    isControl?: boolean
    submitOnEnter?: boolean
  }>,
): Option.Option<EditableKeyOutcome> => {
  if (input.isComposing === true) {
    return Option.none()
  } else if (input.key === 'Escape') {
    return Option.some('Cancel')
  } else if (
    input.key === 'Enter' &&
    input.submitOnEnter !== false &&
    input.isShift !== true &&
    input.isMeta !== true &&
    input.isControl !== true
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

/** True when the input is interactive and currently editing. */
export const canSubmit = (
  state: State,
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => FieldDraft.canSubmit(state.field, props)

/** True when password visibility is currently toggled on. */
export const isPasswordVisible = (state: State): boolean =>
  state.isPasswordVisible

/**
 * Effective native input type for painters: `'text'` when `props.type` is
 * `'password'` and `state.isPasswordVisible` is `true`, otherwise
 * `inputTypeOf(props)`.
 *
 * @example
 * ```typescript
 * effectiveInputTypeOf(initialValue('pw', false), { type: 'password' }) // 'password'
 * effectiveInputTypeOf(initialValue('pw', true), { type: 'password' }) // 'text'
 * effectiveInputTypeOf(initialValue('a@b.c', true), { type: 'email' }) // 'email'
 * ```
 */
export const effectiveInputTypeOf = (
  state: State,
  props: Pick<Props, 'type'> = {},
): InputType =>
  isPasswordInput(props) && state.isPasswordVisible
    ? 'text'
    : inputTypeOf(props)

/** Standard `data-state` marker for password visibility (`'visible'` or `'hidden'`). */
export const visibilityStateOf = (state: State): VisibilityState =>
  state.isPasswordVisible ? 'visible' : 'hidden'

/** Accessible label for the password visibility toggle (`'Hide password'` or `'Show password'`). */
export const visibilityLabelOf = (state: State): string =>
  state.isPasswordVisible ? 'Hide password' : 'Show password'

/** Inline editable mode (`'edit'` while `Editing`, `'preview'` while `Idle`). */
export const editModeOf = (state: State): EditMode =>
  isEditing(state) ? 'edit' : 'preview'

// CHART

const canInputGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => canInput(context)

const canTogglePasswordGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => isPasswordInput(context) && canInput(context)

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

/**
 * Builds the Input Machine chart starting in `initialState`, delegating all
 * draft transitions to `FieldDraft.chart` while layering password visibility
 * toggle and inline editable keyboard semantics.
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
                isPasswordVisible: state.isPasswordVisible,
              }),
            ),
            ignore(),
          ],
          ChangeInput: [
            when(canInputGuard, 'Editing', ({ state, message, context }) =>
              Editing({
                field: editingFieldOf(
                  state.field,
                  FieldDraft.ChangeDraft({ value: message.value }),
                  context,
                ),
                isPasswordVisible: state.isPasswordVisible,
              }),
            ),
            ignore(),
          ],
          CommitInput: [ignore()],
          CancelInput: [ignore()],
          ClearInput: [
            when(canInputGuard, 'Idle', ({ state, context }) =>
              Idle({
                field: idleFieldOf(
                  state.field,
                  FieldDraft.ClearDraft(),
                  context,
                ),
                isPasswordVisible: state.isPasswordVisible,
              }),
            ),
            ignore(),
          ],
          TogglePasswordVisibility: [
            when(canTogglePasswordGuard, 'Idle', ({ state }) =>
              Idle({
                field: state.field,
                isPasswordVisible: !state.isPasswordVisible,
              }),
            ),
            ignore(),
          ],
          SetPasswordVisible: [
            when(canTogglePasswordGuard, 'Idle', ({ state, message }) =>
              Idle({
                field: state.field,
                isPasswordVisible: message.isVisible,
              }),
            ),
            ignore(),
          ],
          EndEdit: [ignore()],
          PressedInputKey: [
            when(
              (_state, message, context) =>
                isEditableOf(context) &&
                canInput(context) &&
                message.isComposing !== true &&
                message.key === 'Enter',
              'Editing',
              ({ state, context }) =>
                Editing({
                  field: editingFieldOf(
                    state.field,
                    FieldDraft.BeginEdit(),
                    context,
                  ),
                  isPasswordVisible: state.isPasswordVisible,
                }),
            ),
            ignore(),
          ],
          SetInputValue: to('Idle', ({ state, message, context }) =>
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
              isPasswordVisible: state.isPasswordVisible,
            }),
          ),
          ResetInput: to('Idle', ({ state, context }) =>
            Idle({
              field: idleFieldOf(state.field, FieldDraft.ResetField(), context),
              isPasswordVisible: false,
            }),
          ),
        },
      },
      Editing: {
        on: {
          BeginEdit: [ignore()],
          ChangeInput: [
            when(canInputGuard, 'Editing', ({ state, message, context }) =>
              Editing({
                field: editingFieldOf(
                  state.field,
                  FieldDraft.ChangeDraft({ value: message.value }),
                  context,
                ),
                isPasswordVisible: state.isPasswordVisible,
              }),
            ),
            ignore(),
          ],
          CommitInput: [
            when(canInputGuard, 'Idle', ({ state, context }) =>
              Idle({
                field: idleFieldOf(
                  state.field,
                  FieldDraft.CommitDraft(),
                  context,
                ),
                isPasswordVisible: state.isPasswordVisible,
              }),
            ),
            ignore(),
          ],
          CancelInput: [
            when(canInputGuard, 'Idle', ({ state, context }) =>
              Idle({
                field: idleFieldOf(
                  state.field,
                  FieldDraft.CancelDraft(),
                  context,
                ),
                isPasswordVisible: state.isPasswordVisible,
              }),
            ),
            ignore(),
          ],
          ClearInput: [
            when(canInputGuard, 'Editing', ({ state, context }) =>
              Editing({
                field: editingFieldOf(
                  state.field,
                  FieldDraft.ClearDraft(),
                  context,
                ),
                isPasswordVisible: state.isPasswordVisible,
              }),
            ),
            ignore(),
          ],
          TogglePasswordVisibility: [
            when(canTogglePasswordGuard, 'Editing', ({ state }) =>
              Editing({
                field: state.field,
                isPasswordVisible: !state.isPasswordVisible,
              }),
            ),
            ignore(),
          ],
          SetPasswordVisible: [
            when(canTogglePasswordGuard, 'Editing', ({ state, message }) =>
              Editing({
                field: state.field,
                isPasswordVisible: message.isVisible,
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
                  isPasswordVisible: state.isPasswordVisible,
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
                  isPasswordVisible: state.isPasswordVisible,
                }),
            ),
            ignore(),
          ],
          PressedInputKey: [
            when(
              (_state, message, context) =>
                canInput(context) &&
                Option.contains(resolveEditableKey(message), 'Commit'),
              'Idle',
              ({ state, context }) =>
                Idle({
                  field: idleFieldOf(
                    state.field,
                    FieldDraft.CommitDraft(),
                    context,
                  ),
                  isPasswordVisible: state.isPasswordVisible,
                }),
            ),
            when(
              (_state, message, context) =>
                canInput(context) &&
                Option.contains(resolveEditableKey(message), 'Cancel'),
              'Idle',
              ({ state, context }) =>
                Idle({
                  field: idleFieldOf(
                    state.field,
                    FieldDraft.CancelDraft(),
                    context,
                  ),
                  isPasswordVisible: state.isPasswordVisible,
                }),
            ),
            ignore(),
          ],
          SetInputValue: to('Editing', ({ state, message, context }) =>
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
              isPasswordVisible: state.isPasswordVisible,
            }),
          ),
          ResetInput: to('Idle', ({ state, context }) =>
            Idle({
              field: idleFieldOf(state.field, FieldDraft.ResetField(), context),
              isPasswordVisible: false,
            }),
          ),
        },
      },
    },
  })

/** The default Input Machine chart starting in `Idle({ field: Idle({ value: '' }), isPasswordVisible: false })`. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the Input sync table using `Pace.Settled({ afterMs })` on
 * `ChangeInput` (typing syncs on pauses, never waiting for blur) and
 * `Pace.Synced()` on discrete actions. Every Message is synced, so
 * `Part.problemsOf` succeeds with zero mixed-sync issues.
 *
 * @example
 * ```typescript
 * syncOf(200).ChangeInput // Settled({ afterMs: 200 })
 * syncOf(200).CommitInput // Synced()
 * ```
 */
export const syncOf = (
  settleMs: number = defaultSettleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  ChangeInput: Settled({ afterMs: settleMs }),
  BeginEdit: Synced(),
  CommitInput: Synced(),
  CancelInput: Synced(),
  ClearInput: Synced(),
  TogglePasswordVisibility: Synced(),
  SetPasswordVisible: Synced(),
  EndEdit: Synced(),
  PressedInputKey: Synced(),
  SetInputValue: Synced(),
  ResetInput: Synced(),
})

/** Default synchronization: `ChangeInput` uses `Pace.Settled({ afterMs: 200 })`, all discrete actions use `Pace.Synced()`. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for an Input kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  ChangeInput: Device({ because }),
  BeginEdit: Device({ because }),
  CommitInput: Device({ because }),
  CancelInput: Device({ because }),
  ClearInput: Device({ because }),
  TogglePasswordVisibility: Device({ because }),
  SetPasswordVisible: Device({ because }),
  EndEdit: Device({ because }),
  PressedInputKey: Device({ because }),
  SetInputValue: Device({ because }),
  ResetInput: Device({ because }),
})

/** Device-only synchronization table for secrets (`Device({ because: 'Secret' })`). */
export const secretSync: Readonly<Record<Message['_tag'], Sync>> =
  deviceSync('Secret')

/** Returns the {@link Sync} pace for one Input Message under `settleMs`. */
export const paceOf = (
  message: Message,
  settleMs: number = defaultSettleMs,
): Sync => syncOf(settleMs)[message._tag]

// SLOTS & PROJECTION

/**
 * The painted slots of an Input Part:
 * - `Input`: the text input control (`role="textbox"`, ARIA state & linkage).
 * - `Label`: the clickable label linked via `aria-labelledby` (`BeginEdit`).
 * - `Description`: the helper text linked via `aria-describedby`.
 * - `Error`: the validation error message linked via `aria-describedby` when invalid.
 * - `VisibilityToggle`: password show/hide button (`role="button"`, `aria-pressed`, `aria-controls`, `TogglePasswordVisibility`).
 * - `ClearButton`: button that clears the field (`role="button"`, `aria-controls`, `ClearInput`).
 * - `Preview`: inline editable preview text shown while `Idle` (`BeginEdit`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Input: {
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
  VisibilityToggle: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'TogglePasswordVisibility' }],
  },
  ClearButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ClearInput' }],
  },
  Preview: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'BeginEdit' }],
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
  if (slot === 'Input') {
    return {
      id: inputId(props.id),
      tabIndex: isDisabledOf(props) ? -1 : 0,
      ...labelSlotPropsOf(props),
      ...descriptionSlotPropsOf(props),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
      ...(isInvalidOf(props) ? { isInvalid: true } : {}),
      ...(isEditableOf(props) && !isEditing(state) ? { isHidden: true } : {}),
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
  } else if (slot === 'VisibilityToggle') {
    return {
      id: visibilityButtonId(props.id),
      controls: inputId(props.id),
      isPressed: state.isPasswordVisible,
      label: visibilityLabelOf(state),
      tabIndex: 0,
      ...(!isPasswordInput(props) ? { isHidden: true } : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'ClearButton') {
    return {
      id: clearButtonId(props.id),
      controls: inputId(props.id),
      label: 'Clear input',
      tabIndex: 0,
      ...(isEmpty(state) || !canInput(props) ? { isHidden: true } : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'Preview') {
    return {
      id: previewId(props.id),
      ...(canInput(props) ? { tabIndex: 0 } : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isInvalidOf(props) ? { isInvalid: true } : {}),
      ...(isEditableOf(props) && isEditing(state) ? { isHidden: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens an Input on: settles the underlying `FieldDraft` to
 * `Idle` preserving the latest typed value, and masks password visibility so a
 * restored page never reopens with a password revealed.
 *
 * @example
 * ```typescript
 * atRest(initialEditing('old', 'typed', true))
 * // Idle({ field: Idle({ value: 'typed' }), isPasswordVisible: false })
 * ```
 */
export const atRest = (state: State): State =>
  Idle({
    field: FieldDraft.Idle({ value: FieldDraft.draftOf(state.field) }),
    isPasswordVisible: false,
  })

// PART FACTORY

/** Options for customizing an Input Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (such as `'Secret'` or `'OwnView'`) to keep this Input device-only. */
  sync?: 'Synced' | DeviceReason
  /** Typing-pause settle window in milliseconds for `ChangeInput` (`200` by default). */
  settleMs?: number
  /** Initial committed value for the Part's chart (`''` by default). */
  defaultValue?: string
  /** Initial password visibility state (`false` by default). */
  defaultPasswordVisible?: boolean
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates an Input {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * `ChangeInput` with `Pace.Settled({ afterMs: settleMs ?? 200 })`, discrete
 * actions with `Pace.Synced()`). Use {@link secret} for passwords/tokens or
 * {@link deviceOnly} for local-only fields.
 *
 * @example
 * ```typescript
 * const DisplayNameInput = Input.make({ name: 'DisplayNameInput' })
 * const FastSearchInput = Input.make({ name: 'FastSearchInput', settleMs: 100 })
 * const PasswordInput = Input.secret({ name: 'PasswordInput' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const settleMs = options.settleMs ?? defaultSettleMs
  const initialState: State =
    options.defaultValue === undefined &&
    options.defaultPasswordVisible !== true
      ? initial
      : initialValue(
          options.defaultValue ?? '',
          options.defaultPasswordVisible === true,
        )
  return Part.define<State, Message, Props>({
    name: options.name ?? 'Input',
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
 * Shorthand for a secret Input Part (passwords, API keys, tokens) whose
 * Messages are all `Device({ because: 'Secret' })` so sensitive values NEVER
 * leave the device or enter synced logs or snapshots.
 *
 * @example
 * ```typescript
 * const PasswordInput = Input.secret({ name: 'PasswordInput' })
 * ```
 */
export const secret = (
  options: Omit<MakeOptions, 'sync'> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...options,
    sync: 'Secret',
  })

/**
 * Shorthand for an Input Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalFilterInput = Input.deviceOnly({ name: 'LocalFilterInput' })
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

/** The default synced Input Part (`name: 'Input'`, `category: 'Domain'`, `ChangeInput` at `Pace.Settled({ afterMs: 200 })`). */
export const part: Part.Part<State, Message, Props> = make()

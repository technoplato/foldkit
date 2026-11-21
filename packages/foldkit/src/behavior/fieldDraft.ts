import { Match as M, Schema as S } from 'effect'

import {
  define,
  ignore,
  otherwise,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import {
  Device,
  type DeviceReason,
  Settled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'

// NOTE: this is the reusable framework-free `fieldDraft` block (Scribe #2627).
// It models text field editing as a pure Machine whose state (`Idle` |
// `Editing`) lives in the Model and syncs keystrokes via `Pace.Settled`
// (200 ms typing-pause default, NEVER waiting for blur). Reused by Input (#12),
// Textarea (#13), Combobox (#17), Number input (#32), Pin input (#33), and
// Tags input (#34) without touching the DOM, timers, or any UI framework.

// SCHEMAS & CONSTANTS

/** Default typing-pause settle window in milliseconds (`200`), taken from `Pace.defaultPace`. */
export const defaultSettleMs: number = defaultPace.typingSettleMs

/**
 * What `EndEdit` (blur) does when a field is currently in `Editing`:
 * - `Commit`: normalizes and commits the draft into `Idle` (the default).
 * - `Cancel`: discards the draft and reverts to the committed value in `Idle`.
 * - `Keep`: preserves the active draft in `Editing` until an explicit commit or cancel.
 */
export const BlurBehavior = S.Literals(['Commit', 'Cancel', 'Keep'])
/** What `EndEdit` (blur) does when a field is currently in `Editing`. */
export type BlurBehavior = typeof BlurBehavior.Type

/**
 * Read-only configuration supplied to the FieldDraft chart as its context.
 * Configuration stays out of the chart's state.
 */
export const Props = S.Struct({
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  maxLength: S.optionalKey(S.Number),
  trimOnCommit: S.optionalKey(S.Boolean),
  commitOnBlur: S.optionalKey(S.Boolean),
  blurBehavior: S.optionalKey(BlurBehavior),
  defaultValue: S.optionalKey(S.String),
  settleMs: S.optionalKey(S.Number),
})
/** Read-only configuration supplied to the FieldDraft chart. */
export type Props = typeof Props.Type

// STATE

/** The field is at rest, holding its committed `value`. */
export const Idle = ts('Idle', {
  value: S.String,
})
/** The field is at rest, holding its committed `value`. */
export type Idle = typeof Idle.Type

/**
 * The field is actively being edited: `value` is the committed baseline and
 * `draft` is the live text on this device (synced on typing pauses via
 * `Pace.Settled`).
 */
export const Editing = ts('Editing', {
  value: S.String,
  draft: S.String,
})
/** The field is actively being edited. */
export type Editing = typeof Editing.Type

/** Where a FieldDraft stands: `Idle` or `Editing`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Editing])
/** Where a FieldDraft stands. */
export type State = typeof State.Type

/** Initial FieldDraft state: idle with an empty string. */
export const initial: State = Idle({ value: '' })

/** Creates an initial idle FieldDraft state holding `value`. */
export const initialValue = (value: string): State => Idle({ value })

/** Creates an initial editing FieldDraft state with `value` and `draft` (defaulting to `value`). */
export const initialEditing = (value: string, draft: string = value): State =>
  Editing({ value, draft })

// MESSAGE

/** Enters edit mode (for example on focus or inline edit activation). */
export const BeginEdit = m('BeginEdit')

/** Updates the active draft immediately on this device; synced with `Pace.Settled` on typing pauses. */
export const ChangeDraft = m('ChangeDraft', { value: S.String })

/** Commits the active draft (applying optional trim and maxLength normalization) and returns to `Idle`. */
export const CommitDraft = m('CommitDraft')

/** Reverts the active draft back to the committed `value` and returns to `Idle`. */
export const CancelDraft = m('CancelDraft')

/** Clears both committed value and active draft to `''`. */
export const ClearDraft = m('ClearDraft')

/**
 * Applies an external or remote value update: adopts it cleanly when idle or
 * clean-editing, updates only the committed baseline without clobbering an
 * active dirty local draft, or overwrites the draft too when `force: true`.
 */
export const SetFieldValue = m('SetFieldValue', {
  value: S.String,
  force: S.optionalKey(S.Boolean),
})

/** Leaves edit mode (blur): commits, cancels, or keeps the draft according to `blurBehavior` / `commitOnBlur`. */
export const EndEdit = m('EndEdit')

/** Resets the field to `props.defaultValue` (or `''`) and returns to `Idle`. */
export const ResetField = m('ResetField')

/** Every Message the FieldDraft chart handles. */
export const Message = S.Union([
  BeginEdit,
  ChangeDraft,
  CommitDraft,
  CancelDraft,
  ClearDraft,
  SetFieldValue,
  EndEdit,
  ResetField,
])
/** Every Message the FieldDraft chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the FieldDraft block. */
export const isMessage = S.is(Message)

// PURE HELPERS & READINGS

/** True when the field is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the field is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/**
 * True when the field accepts user edits (neither disabled nor read-only).
 *
 * @example
 * ```typescript
 * canEdit({}) // true
 * canEdit({ isDisabled: true }) // false
 * canEdit({ isReadOnly: true }) // false
 * ```
 */
export const canEdit = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/** Resolved typing-pause settle duration in milliseconds (`200` by default). */
export const settleMsOf = (props: Pick<Props, 'settleMs'> = {}): number =>
  props.settleMs ?? defaultSettleMs

/**
 * Resolves what `EndEdit` (blur) should do from `props.blurBehavior` and
 * `props.commitOnBlur`: explicit `blurBehavior` wins; otherwise
 * `commitOnBlur: false` yields `'Keep'` and the default is `'Commit'`.
 *
 * @example
 * ```typescript
 * blurBehaviorOf({}) // 'Commit'
 * blurBehaviorOf({ commitOnBlur: false }) // 'Keep'
 * blurBehaviorOf({ blurBehavior: 'Cancel' }) // 'Cancel'
 * ```
 */
export const blurBehaviorOf = (
  props: Pick<Props, 'blurBehavior' | 'commitOnBlur'> = {},
): BlurBehavior => {
  if (props.blurBehavior !== undefined) {
    return props.blurBehavior
  } else if (props.commitOnBlur === false) {
    return 'Keep'
  } else {
    return 'Commit'
  }
}

/**
 * Clamps `text` to `props.maxLength` when a non-negative `maxLength` is set.
 *
 * @example
 * ```typescript
 * normalizeDraft('hello', { maxLength: 3 }) // 'hel'
 * normalizeDraft('hello', {}) // 'hello'
 * ```
 */
export const normalizeDraft = (
  text: string,
  props: Pick<Props, 'maxLength'> = {},
): string =>
  props.maxLength !== undefined && props.maxLength >= 0
    ? text.slice(0, props.maxLength)
    : text

/**
 * Normalizes `text` when committing: trims leading/trailing whitespace when
 * `props.trimOnCommit` is `true`, then enforces `props.maxLength`.
 *
 * @example
 * ```typescript
 * normalizeCommit('  hello  ', { trimOnCommit: true }) // 'hello'
 * normalizeCommit('  hello  ', { trimOnCommit: true, maxLength: 3 }) // 'hel'
 * ```
 */
export const normalizeCommit = (
  text: string,
  props: Pick<Props, 'maxLength' | 'trimOnCommit'> = {},
): string => {
  const trimmed = props.trimOnCommit === true ? text.trim() : text
  return normalizeDraft(trimmed, props)
}

/** The committed value held by `state`. */
export const valueOf = (state: State): string => state.value

/**
 * The text currently shown in the field: `state.draft` while `Editing`, or
 * `state.value` while `Idle`.
 *
 * @example
 * ```typescript
 * draftOf(Idle({ value: 'saved' })) // 'saved'
 * draftOf(Editing({ value: 'saved', draft: 'typing' })) // 'typing'
 * ```
 */
export const draftOf = (state: State): string =>
  M.value(state).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Idle: ({ value }) => value,
      Editing: ({ draft }) => draft,
    }),
  )

/** True while `state` is `Editing`. */
export const isEditing = (state: State): boolean => state._tag === 'Editing'

/** True while `state` is `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/**
 * True when `state` is `Editing` and its `draft` differs from its committed
 * `value`.
 *
 * @example
 * ```typescript
 * isDirty(Editing({ value: 'a', draft: 'ab' })) // true
 * isDirty(Editing({ value: 'a', draft: 'a' })) // false
 * isDirty(Idle({ value: 'a' })) // false
 * ```
 */
export const isDirty = (state: State): boolean =>
  state._tag === 'Editing' && state.draft !== state.value

/** True when the displayed text (`draftOf(state)`) is empty (`''`). */
export const isEmpty = (state: State): boolean => draftOf(state).length === 0

/** True when the displayed text (`draftOf(state)`) is empty or whitespace-only. */
export const isBlank = (state: State): boolean =>
  draftOf(state).trim().length === 0

/**
 * True when the field can commit its active edit right now: it is interactive
 * (neither disabled nor read-only) and currently in `Editing`.
 *
 * @example
 * ```typescript
 * canSubmit(Editing({ value: 'a', draft: 'ab' }), {}) // true
 * canSubmit(Idle({ value: 'a' }), {}) // false
 * canSubmit(Editing({ value: 'a', draft: 'ab' }), { isDisabled: true }) // false
 * ```
 */
export const canSubmit = (
  state: State,
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => canEdit(props) && isEditing(state)

// SYNC & REST

/**
 * Builds the FieldDraft sync table using `Pace.Settled({ afterMs })` for
 * `ChangeDraft` (so keystrokes sync on typing pauses and never wait for blur)
 * and `Pace.Synced()` for discrete edit transitions.
 *
 * @example
 * ```typescript
 * syncOf(200).ChangeDraft // Settled({ afterMs: 200 })
 * syncOf(200).CommitDraft // Synced()
 * ```
 */
export const syncOf = (
  settleMs: number = defaultSettleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  BeginEdit: Synced(),
  ChangeDraft: Settled({ afterMs: settleMs }),
  CommitDraft: Synced(),
  CancelDraft: Synced(),
  ClearDraft: Synced(),
  SetFieldValue: Synced(),
  EndEdit: Synced(),
  ResetField: Synced(),
})

/** Default FieldDraft sync table (`ChangeDraft` at `Settled({ afterMs: 200 })`). */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only sync table for a field kept local to one device (for example `'Secret'` or `'OwnView'`). */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  BeginEdit: Device({ because }),
  ChangeDraft: Device({ because }),
  CommitDraft: Device({ because }),
  CancelDraft: Device({ because }),
  ClearDraft: Device({ because }),
  SetFieldValue: Device({ because }),
  EndEdit: Device({ because }),
  ResetField: Device({ because }),
})

/** Shorthand device-only sync table for secret fields (`Device({ because: 'Secret' })`). */
export const secretSync: Readonly<Record<Message['_tag'], Sync>> =
  deviceSync('Secret')

/**
 * Returns the {@link Sync} pace for one FieldDraft Message under `props`
 * (using `Pace.Settled({ afterMs })` on `ChangeDraft`, `Pace.Synced()` on
 * discrete actions).
 *
 * @example
 * ```typescript
 * paceOf(ChangeDraft({ value: 'hi' })) // Settled({ afterMs: 200 })
 * paceOf(ChangeDraft({ value: 'hi' }), { settleMs: 120 }) // Settled({ afterMs: 120 })
 * paceOf(CommitDraft()) // Synced()
 * ```
 */
export const paceOf = (
  message: Message,
  props: Pick<Props, 'settleMs'> = {},
): Sync => syncOf(settleMsOf(props))[message._tag]

/**
 * What a restart opens FieldDraft on: returns to `Idle` while preserving the
 * latest settled text (`draftOf(state)`) so typing that synced on a pause is
 * never discarded on reload.
 *
 * @example
 * ```typescript
 * atRest(Editing({ value: 'old', draft: 'new' })) // Idle({ value: 'new' })
 * ```
 */
export const atRest = (state: State): State => Idle({ value: draftOf(state) })

// CHART

const canEditGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => canEdit(context)

/**
 * Builds the FieldDraft Machine chart starting at `initialState`:
 * - `BeginEdit`: enters `Editing` when interactive.
 * - `ChangeDraft`: updates `draft` immediately (entering `Editing` if idle)
 *   with `maxLength` clamping when interactive; synced with `Pace.Settled`.
 * - `CommitDraft`: commits normalized `draft` to `Idle` when interactive.
 * - `CancelDraft`: reverts `draft` to committed `value` in `Idle` when interactive.
 * - `ClearDraft`: clears value and draft to `''` when interactive.
 * - `SetFieldValue`: adopts remote/external value cleanly when idle, clean-editing,
 *   or `force: true`, or updates only the committed baseline when dirty-editing.
 * - `EndEdit`: commits, cancels, or keeps draft per `blurBehavior` / `commitOnBlur`.
 * - `ResetField`: resets to `props.defaultValue` (or `''`) in `Idle`.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          BeginEdit: [
            when(canEditGuard, 'Editing', ({ state }) =>
              Editing({ value: state.value, draft: state.value }),
            ),
            ignore(),
          ],
          ChangeDraft: [
            when(canEditGuard, 'Editing', ({ state, message, context }) =>
              Editing({
                value: state.value,
                draft: normalizeDraft(message.value, context),
              }),
            ),
            ignore(),
          ],
          CommitDraft: [ignore()],
          CancelDraft: [ignore()],
          ClearDraft: [
            when(canEditGuard, 'Idle', () => Idle({ value: '' })),
            ignore(),
          ],
          SetFieldValue: to('Idle', ({ message, context }) =>
            Idle({ value: normalizeDraft(message.value, context) }),
          ),
          EndEdit: [ignore()],
          ResetField: to('Idle', ({ context }) =>
            Idle({
              value: normalizeDraft(context.defaultValue ?? '', context),
            }),
          ),
        },
      },
      Editing: {
        on: {
          BeginEdit: [ignore()],
          ChangeDraft: [
            when(canEditGuard, 'Editing', ({ state, message, context }) =>
              Editing({
                value: state.value,
                draft: normalizeDraft(message.value, context),
              }),
            ),
            ignore(),
          ],
          CommitDraft: [
            when(canEditGuard, 'Idle', ({ state, context }) =>
              Idle({ value: normalizeCommit(state.draft, context) }),
            ),
            ignore(),
          ],
          CancelDraft: [
            when(canEditGuard, 'Idle', ({ state }) =>
              Idle({ value: state.value }),
            ),
            ignore(),
          ],
          ClearDraft: [
            when(canEditGuard, 'Editing', () =>
              Editing({ value: '', draft: '' }),
            ),
            ignore(),
          ],
          SetFieldValue: [
            when(
              (state, message) =>
                message.force === true || state.draft === state.value,
              'Editing',
              ({ message, context }) => {
                const next = normalizeDraft(message.value, context)
                return Editing({ value: next, draft: next })
              },
            ),
            otherwise(
              to('Editing', ({ state, message, context }) =>
                Editing({
                  value: normalizeDraft(message.value, context),
                  draft: state.draft,
                }),
              ),
            ),
          ],
          EndEdit: [
            when(
              (_state, _message, context) =>
                blurBehaviorOf(context) === 'Commit' && canEdit(context),
              'Idle',
              ({ state, context }) =>
                Idle({ value: normalizeCommit(state.draft, context) }),
            ),
            when(
              (_state, _message, context) =>
                blurBehaviorOf(context) === 'Cancel',
              'Idle',
              ({ state }) => Idle({ value: state.value }),
            ),
            ignore(),
          ],
          ResetField: to('Idle', ({ context }) =>
            Idle({
              value: normalizeDraft(context.defaultValue ?? '', context),
            }),
          ),
        },
      },
    },
  })

/** The default FieldDraft Machine chart starting in `Idle({ value: '' })`. */
export const chart = chartOf(initial)

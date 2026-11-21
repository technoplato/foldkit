import { Array, Option, Record, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core Fieldset Part (Widget #14 of 54, Scribe #2632).
// It models a form fieldset group in one framework-free Machine and Part
// declaration covering packages/ui Fieldset and Radix form semantics: group
// disabled state propagating to contained fields, legend/description/error
// ARIA linkage, per-field client/custom and server validation error maps,
// Radix form submission-attempt / clear-server-errors / reset lifecycle, and
// reference-stable SlotBindings (`Fieldset`, `Legend`, `Description`,
// `SubmitButton`, `ResetButton`, `FieldError`) rendered by HTML, React, and
// React Native generic hosts with zero Fieldset-specific painter logic.

// SCHEMAS

/** Per-field validation error map keyed by field name (for example `{ email: 'Enter a valid email' }`). */
export const ErrorMap = S.Record(S.String, S.String)
/** Per-field validation error map keyed by field name. */
export type ErrorMap = typeof ErrorMap.Type

/** Lifecycle phase of a Fieldset submission (`'Idle' | 'Submitting' | 'Submitted' | 'Failed'`). */
export const SubmissionState = S.Literals([
  'Idle',
  'Submitting',
  'Submitted',
  'Failed',
])
/** Lifecycle phase of a Fieldset submission. */
export type SubmissionState = typeof SubmissionState.Type

/** Validity marker for an individual field (`'valid' | 'invalid'`), matching Radix Form `data-valid` / `data-invalid`. */
export const FieldDataState = S.Literals(['valid', 'invalid'])
/** Validity marker for an individual field. */
export type FieldDataState = typeof FieldDataState.Type

/**
 * Read-only props supplied to the Fieldset chart and projection from the
 * Program's Model. Static configuration, field ordering, and accessibility
 * linkage stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  isDisabled: S.optionalKey(S.Boolean),
  fieldOrder: S.optionalKey(S.Array(S.String)),
  label: S.optionalKey(S.String),
  hasLegend: S.optionalKey(S.Boolean),
  hasDescription: S.optionalKey(S.Boolean),
  hasError: S.optionalKey(S.Boolean),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
})
/** Read-only props supplied to the Fieldset chart and projection. */
export type Props = typeof Props.Type

// STATE

const sharedFields = {
  isDisabled: S.Boolean,
  fieldErrors: ErrorMap,
  serverErrors: ErrorMap,
  submitAttemptCount: S.Number,
}

/** The fieldset is at rest: before submission, after validation blocked a submit, or after reset. */
export const Idle = ts('Idle', sharedFields)
/** The fieldset is at rest. */
export type Idle = typeof Idle.Type

/** The fieldset passed client validation and a submission is currently in flight. */
export const Submitting = ts('Submitting', sharedFields)
/** The fieldset has a submission in flight. */
export type Submitting = typeof Submitting.Type

/** The fieldset's most recent submission succeeded. */
export const Submitted = ts('Submitted', sharedFields)
/** The fieldset's most recent submission succeeded. */
export type Submitted = typeof Submitted.Type

/** The fieldset's most recent submission failed, carrying optional server errors and a form-level error message. */
export const Failed = ts('Failed', {
  ...sharedFields,
  maybeError: S.Option(S.String),
})
/** The fieldset's most recent submission failed. */
export type Failed = typeof Failed.Type

/** Where a Fieldset Part stands: `Idle`, `Submitting`, `Submitted`, or `Failed`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Submitting, Submitted, Failed])
/** Where a Fieldset Part stands. */
export type State = typeof State.Type

/** Initial Fieldset state: idle, enabled, with no field or server errors and zero submit attempts. */
export const initial: State = Idle({
  isDisabled: false,
  fieldErrors: {},
  serverErrors: {},
  submitAttemptCount: 0,
})

/** Creates an initial idle Fieldset state with an explicit group `isDisabled` flag (`true` by default). */
export const initialDisabled = (isDisabled: boolean = true): State =>
  Idle({
    isDisabled,
    fieldErrors: {},
    serverErrors: {},
    submitAttemptCount: 0,
  })

// ACTIONS

/** Enables or disables every control in the fieldset together. */
export const SetDisabled = Catalog.action('SetDisabled', {
  fields: { isDisabled: S.Boolean },
  what: 'Enables or disables every control in the fieldset',
  why: 'To lock or unlock the group of fields together',
  meta: { label: 'Set fieldset disabled', keys: [] },
})

/** Records a client or custom validation error for one field (an empty message clears it). */
export const SetFieldError = Catalog.action('SetFieldError', {
  fields: { field: S.String, message: S.String },
  what: 'Records a validation error message for a field',
  why: 'To explain why the entered value cannot be accepted',
  meta: { label: 'Set field error', keys: [] },
})

/** Clears the client or custom validation error for one field. */
export const ClearFieldError = Catalog.action('ClearFieldError', {
  fields: { field: S.String },
  what: 'Clears the validation error for a field',
  why: 'To mark the field valid again after edits',
  meta: { label: 'Clear field error', keys: [] },
})

/** Records server validation errors keyed by field name. */
export const SetServerErrors = Catalog.action('SetServerErrors', {
  fields: { errors: ErrorMap },
  what: 'Records server validation errors across fields',
  why: 'To show field problems reported after submission',
  meta: { label: 'Set server errors', keys: [] },
})

/** Clears all server validation errors on the fieldset. */
export const ClearServerErrors = Catalog.action('ClearServerErrors', {
  what: 'Clears all server validation errors on the fieldset',
  why: 'To dismiss stale server problems before trying again',
  meta: { label: 'Clear server errors', keys: [] },
})

/** Attempts to submit the fieldset: clears server errors, increments attempts, and enters `Submitting` when valid and enabled. */
export const AttemptSubmit = Catalog.action('AttemptSubmit', {
  what: 'Attempts to submit the fieldset',
  why: 'To validate and send the entered values',
  meta: { label: 'Submit', keys: [] },
})

/** Resets field errors, server errors, and submission progress back to `Idle` while preserving group disabled state. */
export const ResetFieldset = Catalog.action('ResetFieldset', {
  what: 'Resets validation errors and submission progress',
  why: 'To return the group of fields to a clean starting point',
  meta: { label: 'Reset', keys: [] },
})

/** The Catalog Actions a Fieldset Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SetDisabled,
  SetFieldError,
  ClearFieldError,
  SetServerErrors,
  ClearServerErrors,
  AttemptSubmit,
  ResetFieldset,
]

// MESSAGES

/** Reports that the in-flight submission succeeded. */
export const SucceededSubmit = m('SucceededSubmit')

/** Reports that the in-flight submission failed, with an optional summary error and per-field server errors. */
export const FailedSubmit = m('FailedSubmit', {
  error: S.optionalKey(S.String),
  serverErrors: S.optionalKey(ErrorMap),
})

/** Every Message the Fieldset chart handles. */
export const Message = S.Union([
  SetDisabled,
  SetFieldError,
  ClearFieldError,
  SetServerErrors,
  ClearServerErrors,
  AttemptSubmit,
  SucceededSubmit,
  FailedSubmit,
  ResetFieldset,
])
/** Every Message the Fieldset chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Fieldset Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the fieldset group container element id from a base `id`. */
export const fieldsetId = (id: string): string => `${id}-fieldset`

/** Derives the fieldset legend element id from a base `id`. */
export const legendId = (id: string): string => `${id}-legend`

/** Derives the fieldset description element id from a base `id`. */
export const descriptionId = (id: string): string => `${id}-description`

/** Derives the fieldset form-level error element id from a base `id`. */
export const errorId = (id: string): string => `${id}-error`

/** Derives a per-field validation message element id from a base `id` and `fieldName`. */
export const fieldMessageId = (id: string, fieldName: string): string =>
  `${id}-field-${fieldName}-message`

/** Derives the fieldset submit button element id from a base `id`. */
export const submitButtonId = (id: string): string => `${id}-submit`

/** Derives the fieldset reset button element id from a base `id`. */
export const resetButtonId = (id: string): string => `${id}-reset`

// PURE RULES & READINGS

/** True when `props.isDisabled` is `true` (`false` by default). Shared by thin painters such as `@foldkit/ui` `Fieldset`. */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/**
 * True when the fieldset is disabled, either through its own Model state
 * (`SetDisabled`) or through an external `props.isDisabled` prop.
 *
 * @example
 * ```typescript
 * isDisabled(Fieldset.initial) // false
 * isDisabled(Fieldset.initialDisabled(true)) // true
 * isDisabled(Fieldset.initial, { isDisabled: true }) // true
 * ```
 */
export const isDisabled = (
  state: State,
  props: Pick<Props, 'isDisabled'> = {},
): boolean => state.isDisabled || isDisabledOf(props)

/**
 * Resolves whether a field inside the fieldset is disabled: `true` if the
 * enclosing fieldset is disabled OR the field itself is disabled.
 *
 * @example
 * ```typescript
 * isFieldDisabled(Fieldset.initialDisabled(true), false) // true
 * isFieldDisabled(Fieldset.initial, true) // true
 * isFieldDisabled(Fieldset.initial, false) // false
 * ```
 */
export const isFieldDisabled = (
  state: State,
  fieldDisabled: boolean = false,
  props: Pick<Props, 'isDisabled'> = {},
): boolean => isDisabled(state, props) || fieldDisabled

/**
 * Combined active validation error map across server and client/custom
 * errors. Client/custom `fieldErrors` take precedence over `serverErrors`
 * for the same field, matching Radix Form's built-in-before-server order.
 *
 * @example
 * ```typescript
 * errorsOf(state) // { email: 'Enter a valid email', username: 'Already taken' }
 * ```
 */
export const errorsOf = (state: State): ErrorMap => ({
  ...state.serverErrors,
  ...state.fieldErrors,
})

/** Client and custom validation errors currently recorded on `state`. */
export const fieldErrorsOf = (state: State): ErrorMap => state.fieldErrors

/** Server validation errors currently recorded on `state`. */
export const serverErrorsOf = (state: State): ErrorMap => state.serverErrors

/**
 * The active validation error message for `field`, preferring a client
 * `fieldErrors` entry over a `serverErrors` entry, or `Option.none()` when
 * the field has no error.
 *
 * @example
 * ```typescript
 * fieldErrorOf(state, 'email') // Option.some('Enter a valid email')
 * fieldErrorOf(state, 'name') // Option.none()
 * ```
 */
export const fieldErrorOf = (
  state: State,
  field: string,
): Option.Option<string> =>
  Option.fromNullishOr(state.fieldErrors[field] ?? state.serverErrors[field])

/** True when `field` currently has a client or server validation error. */
export const isFieldInvalidOf = (state: State, field: string): boolean =>
  Option.isSome(fieldErrorOf(state, field))

/** True when `field` currently has a server validation error. */
export const isFieldServerInvalidOf = (state: State, field: string): boolean =>
  Object.hasOwn(state.serverErrors, field)

/**
 * True when the fieldset has no active client or server field errors.
 *
 * @example
 * ```typescript
 * isValidOf(Fieldset.initial) // true
 * ```
 */
export const isValidOf = (state: State): boolean =>
  Record.isEmptyRecord(state.fieldErrors) &&
  Record.isEmptyRecord(state.serverErrors)

/**
 * The first invalid field name, following `props.fieldOrder` when supplied
 * and falling back to the first key in `errorsOf(state)`, or `Option.none()`
 * when every field is valid. Mirrors Radix Form's first-invalid-control
 * focus rule without touching the DOM.
 *
 * @example
 * ```typescript
 * firstInvalidFieldOf(state, { fieldOrder: ['name', 'email', 'bio'] })
 * // Option.some('email')
 * ```
 */
export const firstInvalidFieldOf = (
  state: State,
  props: Pick<Props, 'fieldOrder'> = {},
): Option.Option<string> => {
  const active = errorsOf(state)
  const fromOrder =
    props.fieldOrder === undefined
      ? Option.none<string>()
      : Array.findFirst(props.fieldOrder, name => Object.hasOwn(active, name))
  return Option.orElse(fromOrder, () => Array.head(Object.keys(active)))
}

/** Current submission phase (`'Idle' | 'Submitting' | 'Submitted' | 'Failed'`). */
export const submissionStateOf = (state: State): SubmissionState => state._tag

/** True while a submission is in flight (`state._tag === 'Submitting'`). */
export const isSubmitting = (state: State): boolean =>
  state._tag === 'Submitting'

/** True when the most recent submission succeeded (`state._tag === 'Submitted'`). */
export const isSubmitted = (state: State): boolean => state._tag === 'Submitted'

/** True when the most recent submission failed (`state._tag === 'Failed'`). */
export const isFailed = (state: State): boolean => state._tag === 'Failed'

/** True after at least one `AttemptSubmit` has occurred since init or the last `ResetFieldset`. */
export const hasAttemptedSubmit = (state: State): boolean =>
  state.submitAttemptCount > 0

/** Total number of `AttemptSubmit` attempts since init or the last `ResetFieldset`. */
export const submitAttemptCountOf = (state: State): number =>
  state.submitAttemptCount

/** Optional form-level error message from `FailedSubmit`, or `Option.none()`. */
export const maybeFormErrorOf = (state: State): Option.Option<string> =>
  state._tag === 'Failed' ? state.maybeError : Option.none()

/** True when the fieldset may accept a submit attempt (neither disabled nor already submitting). */
export const canSubmit = (
  state: State,
  props: Pick<Props, 'isDisabled'> = {},
): boolean => !isDisabled(state, props) && !isSubmitting(state)

/**
 * Validity marker for `field` matching Radix Form `data-valid` / `data-invalid`:
 * `Option.some('invalid')` when the field has an error, `Option.some('valid')`
 * once the user has attempted submission and the field is clean, else `Option.none()`.
 */
export const fieldDataStateOf = (
  state: State,
  field: string,
): Option.Option<FieldDataState> => {
  if (isFieldInvalidOf(state, field)) {
    return Option.some('invalid')
  } else if (hasAttemptedSubmit(state)) {
    return Option.some('valid')
  } else {
    return Option.none()
  }
}

// CHART HELPERS

const withFieldError = (
  errors: ErrorMap,
  field: string,
  message: string,
): ErrorMap =>
  message === ''
    ? Record.remove(errors, field)
    : { ...errors, [field]: message }

const withoutFieldError = (errors: ErrorMap, field: string): ErrorMap =>
  Record.remove(errors, field)

const normalizeErrors = (errors: ErrorMap): ErrorMap =>
  Record.filter(errors, message => message !== '')

const hasClientErrors = (state: State): boolean =>
  !Record.isEmptyRecord(state.fieldErrors)

const canSubmitValidGuard = (
  state: State,
  _message: Message,
  context: Props,
): boolean => !isDisabled(state, context) && !hasClientErrors(state)

const canSubmitInvalidGuard = (
  state: State,
  _message: Message,
  context: Props,
): boolean => !isDisabled(state, context) && hasClientErrors(state)

const resetToIdle = (state: State): Idle =>
  Idle({
    isDisabled: state.isDisabled,
    fieldErrors: {},
    serverErrors: {},
    submitAttemptCount: 0,
  })

const submitAttemptValid = (state: State): Submitting =>
  Submitting({
    isDisabled: state.isDisabled,
    fieldErrors: state.fieldErrors,
    serverErrors: {},
    submitAttemptCount: state.submitAttemptCount + 1,
  })

const submitAttemptBlocked = (state: State): Idle =>
  Idle({
    isDisabled: state.isDisabled,
    fieldErrors: state.fieldErrors,
    serverErrors: {},
    submitAttemptCount: state.submitAttemptCount + 1,
  })

// CHART

/**
 * Builds the Fieldset Machine chart starting in `initialState`: group
 * disabled state, per-field client and server error management, Radix Form
 * submit/clear-server-errors/reset semantics, and submission outcome tracking.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          SetDisabled: to('Idle', ({ state, message }) =>
            Idle({ ...state, isDisabled: message.isDisabled }),
          ),
          SetFieldError: to('Idle', ({ state, message }) =>
            Idle({
              ...state,
              fieldErrors: withFieldError(
                state.fieldErrors,
                message.field,
                message.message,
              ),
            }),
          ),
          ClearFieldError: to('Idle', ({ state, message }) =>
            Idle({
              ...state,
              fieldErrors: withoutFieldError(state.fieldErrors, message.field),
            }),
          ),
          SetServerErrors: to('Idle', ({ state, message }) =>
            Idle({
              ...state,
              serverErrors: normalizeErrors(message.errors),
            }),
          ),
          ClearServerErrors: to('Idle', ({ state }) =>
            Idle({ ...state, serverErrors: {} }),
          ),
          AttemptSubmit: [
            when(canSubmitValidGuard, 'Submitting', ({ state }) =>
              submitAttemptValid(state),
            ),
            when(canSubmitInvalidGuard, 'Idle', ({ state }) =>
              submitAttemptBlocked(state),
            ),
            ignore(),
          ],
          SucceededSubmit: [ignore()],
          FailedSubmit: [ignore()],
          ResetFieldset: to('Idle', ({ state }) => resetToIdle(state)),
        },
      },
      Submitting: {
        on: {
          SetDisabled: to('Submitting', ({ state, message }) =>
            Submitting({ ...state, isDisabled: message.isDisabled }),
          ),
          SetFieldError: to('Submitting', ({ state, message }) =>
            Submitting({
              ...state,
              fieldErrors: withFieldError(
                state.fieldErrors,
                message.field,
                message.message,
              ),
            }),
          ),
          ClearFieldError: to('Submitting', ({ state, message }) =>
            Submitting({
              ...state,
              fieldErrors: withoutFieldError(state.fieldErrors, message.field),
            }),
          ),
          SetServerErrors: to('Submitting', ({ state, message }) =>
            Submitting({
              ...state,
              serverErrors: normalizeErrors(message.errors),
            }),
          ),
          ClearServerErrors: to('Submitting', ({ state }) =>
            Submitting({ ...state, serverErrors: {} }),
          ),
          AttemptSubmit: [ignore()],
          SucceededSubmit: to('Submitted', ({ state }) =>
            Submitted({
              isDisabled: state.isDisabled,
              fieldErrors: {},
              serverErrors: {},
              submitAttemptCount: state.submitAttemptCount,
            }),
          ),
          FailedSubmit: to('Failed', ({ state, message }) =>
            Failed({
              isDisabled: state.isDisabled,
              fieldErrors: state.fieldErrors,
              serverErrors:
                message.serverErrors === undefined
                  ? state.serverErrors
                  : normalizeErrors(message.serverErrors),
              submitAttemptCount: state.submitAttemptCount,
              maybeError: Option.filter(
                Option.fromNullishOr(message.error),
                text => text !== '',
              ),
            }),
          ),
          ResetFieldset: to('Idle', ({ state }) => resetToIdle(state)),
        },
      },
      Submitted: {
        on: {
          SetDisabled: to('Submitted', ({ state, message }) =>
            Submitted({ ...state, isDisabled: message.isDisabled }),
          ),
          SetFieldError: to('Idle', ({ state, message }) =>
            Idle({
              isDisabled: state.isDisabled,
              fieldErrors: withFieldError(
                state.fieldErrors,
                message.field,
                message.message,
              ),
              serverErrors: state.serverErrors,
              submitAttemptCount: state.submitAttemptCount,
            }),
          ),
          ClearFieldError: to('Submitted', ({ state, message }) =>
            Submitted({
              ...state,
              fieldErrors: withoutFieldError(state.fieldErrors, message.field),
            }),
          ),
          SetServerErrors: to('Submitted', ({ state, message }) =>
            Submitted({
              ...state,
              serverErrors: normalizeErrors(message.errors),
            }),
          ),
          ClearServerErrors: to('Submitted', ({ state }) =>
            Submitted({ ...state, serverErrors: {} }),
          ),
          AttemptSubmit: [
            when(canSubmitValidGuard, 'Submitting', ({ state }) =>
              submitAttemptValid(state),
            ),
            when(canSubmitInvalidGuard, 'Idle', ({ state }) =>
              submitAttemptBlocked(state),
            ),
            ignore(),
          ],
          SucceededSubmit: [ignore()],
          FailedSubmit: [ignore()],
          ResetFieldset: to('Idle', ({ state }) => resetToIdle(state)),
        },
      },
      Failed: {
        on: {
          SetDisabled: to('Failed', ({ state, message }) =>
            Failed({ ...state, isDisabled: message.isDisabled }),
          ),
          SetFieldError: to('Failed', ({ state, message }) =>
            Failed({
              ...state,
              fieldErrors: withFieldError(
                state.fieldErrors,
                message.field,
                message.message,
              ),
            }),
          ),
          ClearFieldError: to('Failed', ({ state, message }) =>
            Failed({
              ...state,
              fieldErrors: withoutFieldError(state.fieldErrors, message.field),
            }),
          ),
          SetServerErrors: to('Failed', ({ state, message }) =>
            Failed({
              ...state,
              serverErrors: normalizeErrors(message.errors),
            }),
          ),
          ClearServerErrors: to('Failed', ({ state }) =>
            Failed({ ...state, serverErrors: {} }),
          ),
          AttemptSubmit: [
            when(canSubmitValidGuard, 'Submitting', ({ state }) =>
              submitAttemptValid(state),
            ),
            when(canSubmitInvalidGuard, 'Idle', ({ state }) =>
              submitAttemptBlocked(state),
            ),
            ignore(),
          ],
          SucceededSubmit: [ignore()],
          FailedSubmit: [ignore()],
          ResetFieldset: to('Idle', ({ state }) => resetToIdle(state)),
        },
      },
    },
  })

/** The default Fieldset Machine chart starting in `Idle({ isDisabled: false, fieldErrors: {}, serverErrors: {}, submitAttemptCount: 0 })`. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  SetDisabled: pace,
  SetFieldError: pace,
  ClearFieldError: pace,
  SetServerErrors: pace,
  ClearServerErrors: pace,
  AttemptSubmit: pace,
  SucceededSubmit: pace,
  FailedSubmit: pace,
  ResetFieldset: pace,
})

/** Default synchronization: every Fieldset Message syncs via `Pace.Synced()`. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Fieldset kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The six painted slots of a Fieldset Part:
 * - `Fieldset`: group container (`role="group"`, `aria-labelledby`, `aria-describedby`, `aria-disabled`, `aria-invalid`).
 * - `Legend`: heading identifying the group (`id: legendId(id)`).
 * - `Description`: helper text linked via `aria-describedby` (`id: descriptionId(id)`).
 * - `SubmitButton`: submits the fieldset (`role="button"`, `AttemptSubmit`).
 * - `ResetButton`: resets errors and submission state (`role="button"`, `ResetFieldset`).
 * - `FieldError`: live alert region for a named field (`view.slot('FieldError', 'email')`) or the fieldset summary (`view.slot('FieldError')`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Fieldset: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Legend: {
    focus: 'None',
    gestures: [],
  },
  Description: {
    focus: 'None',
    gestures: [],
  },
  SubmitButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'AttemptSubmit' }],
  },
  ResetButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ResetFieldset' }],
  },
  FieldError: {
    role: 'Alert',
    focus: 'None',
    gestures: [],
  },
}

const legendSlotPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.labelledBy !== undefined) {
    return { labelledBy: props.labelledBy }
  } else if (props.hasLegend === false) {
    return props.label === undefined ? {} : { label: props.label }
  } else if (props.label !== undefined && props.hasLegend !== true) {
    return { label: props.label }
  } else {
    return { labelledBy: legendId(props.id) }
  }
}

const hasAnyError = (state: State): boolean =>
  !isValidOf(state) || Option.isSome(maybeFormErrorOf(state))

const descriptionSlotPropsOf = (
  state: State,
  props: Props,
): Pick<SlotProps, 'describedBy'> => {
  if (props.describedBy !== undefined) {
    return { describedBy: props.describedBy }
  }
  const ids: ReadonlyArray<string> = [
    ...(props.hasDescription === false ? [] : [descriptionId(props.id)]),
    ...(props.hasError === true && hasAnyError(state)
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
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Fieldset') {
    const groupDisabled = isDisabled(state, props)
    return {
      id: fieldsetId(props.id),
      ...legendSlotPropsOf(props),
      ...descriptionSlotPropsOf(state, props),
      ...(groupDisabled ? { isDisabled: true } : {}),
      ...(hasAnyError(state) ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Legend') {
    return {
      id: legendId(props.id),
      ...(isDisabled(state, props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Description') {
    return {
      id: descriptionId(props.id),
    }
  } else if (slot === 'SubmitButton') {
    return {
      id: submitButtonId(props.id),
      controls: fieldsetId(props.id),
      tabIndex: 0,
      ...(isDisabled(state, props) || isSubmitting(state)
        ? { isDisabled: true }
        : {}),
    }
  } else if (slot === 'ResetButton') {
    return {
      id: resetButtonId(props.id),
      controls: fieldsetId(props.id),
      tabIndex: 0,
      ...(isDisabled(state, props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'FieldError') {
    return Option.match(maybeChoice, {
      onNone: () => ({
        id: errorId(props.id),
        live: 'Polite',
        isAtomic: true,
        ...(!hasAnyError(state) ? { isHidden: true } : {}),
      }),
      onSome: fieldName => ({
        id: fieldMessageId(props.id, fieldName),
        live: 'Polite',
        isAtomic: true,
        ...(!isFieldInvalidOf(state, fieldName) ? { isHidden: true } : {}),
      }),
    })
  } else {
    return {}
  }
}

/**
 * What a restart opens a Fieldset on: an in-flight `Submitting` settles back
 * to `Idle` so a restored session is never wedged waiting for a dead request;
 * `Idle`, `Submitted`, and `Failed` stay as they are.
 *
 * @example
 * ```typescript
 * atRest(Submitting({ isDisabled: false, fieldErrors: {}, serverErrors: {}, submitAttemptCount: 1 }))
 * // Idle({ isDisabled: false, fieldErrors: {}, serverErrors: {}, submitAttemptCount: 1 })
 * ```
 */
export const atRest = (state: State): State =>
  state._tag === 'Submitting'
    ? Idle({
        isDisabled: state.isDisabled,
        fieldErrors: state.fieldErrors,
        serverErrors: state.serverErrors,
        submitAttemptCount: state.submitAttemptCount,
      })
    : state

// PART FACTORY

/** Options for customizing a Fieldset Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep Fieldset state device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial group disabled state for the Part's chart (`false` by default). */
  defaultDisabled?: boolean
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Fieldset {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * `Pace.Synced()`); pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep
 * a Program's Fieldset local to one device.
 *
 * @example
 * ```typescript
 * const AccountFieldset = Fieldset.make({ name: 'AccountFieldset' })
 * const LocalFieldset = Fieldset.deviceOnly({ name: 'LocalFieldset' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Fieldset',
    State,
    Message,
    chart:
      options.defaultDisabled === true ? chartOf(initialDisabled(true)) : chart,
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

/**
 * Shorthand for a Fieldset Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalFieldset = Fieldset.deviceOnly({ name: 'LocalFieldset' })
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

/** The default synced Fieldset Part (`name: 'Fieldset'`, `category: 'Domain'`, `Pace.Synced()`). */
export const part: Part.Part<State, Message, Props> = make()

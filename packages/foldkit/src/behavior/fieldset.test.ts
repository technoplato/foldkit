import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Fieldset from './fieldset.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const defaultProps: Fieldset.Props = {
  id: 'account',
  fieldOrder: ['name', 'email', 'bio'],
  hasLegend: true,
  hasDescription: true,
  hasError: true,
}

const fold = (
  messages: ReadonlyArray<Fieldset.Message>,
  props: Fieldset.Props = defaultProps,
  from: Fieldset.State = Fieldset.initial,
): Fieldset.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Fieldset.chart.transition(state, message, props)[0],
  )

describe('core Fieldset Part', () => {
  describe('declaration and chart integrity', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Fieldset.part)).toEqual([])
      expect(Part.problemsOf(Fieldset.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Fieldset.make({ sync: 'OwnView' }))).toEqual([])
      expect(Part.problemsOf(Fieldset.make({ defaultDisabled: true }))).toEqual(
        [],
      )

      expect(
        Block.problemsOf({ name: 'Fieldset', chart: Fieldset.chart }),
      ).toEqual([])
      expect(
        Block.problemsOf({
          name: 'DisabledFieldset',
          chart: Fieldset.make({ defaultDisabled: true }).chart,
        }),
      ).toEqual([])

      for (const action of Fieldset.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })
  })

  describe('element IDs', () => {
    it('derives deterministic element IDs for fieldset, legend, description, errors, and buttons', () => {
      expect(Fieldset.fieldsetId('account')).toBe('account-fieldset')
      expect(Fieldset.legendId('account')).toBe('account-legend')
      expect(Fieldset.descriptionId('account')).toBe('account-description')
      expect(Fieldset.errorId('account')).toBe('account-error')
      expect(Fieldset.fieldMessageId('account', 'email')).toBe(
        'account-field-email-message',
      )
      expect(Fieldset.submitButtonId('account')).toBe('account-submit')
      expect(Fieldset.resetButtonId('account')).toBe('account-reset')
    })
  })

  describe('group disabled state', () => {
    it('tracks group disabled via SetDisabled and propagates it to fields', () => {
      expect(Fieldset.isDisabled(Fieldset.initial)).toBe(false)
      expect(Fieldset.isFieldDisabled(Fieldset.initial, false)).toBe(false)
      expect(Fieldset.isFieldDisabled(Fieldset.initial, true)).toBe(true)

      const disabled = fold([Fieldset.SetDisabled({ isDisabled: true })])
      expect(Fieldset.isDisabled(disabled)).toBe(true)
      expect(Fieldset.isFieldDisabled(disabled, false)).toBe(true)
      expect(Fieldset.isFieldDisabled(disabled, true)).toBe(true)

      const reenabled = fold(
        [Fieldset.SetDisabled({ isDisabled: false })],
        defaultProps,
        disabled,
      )
      expect(Fieldset.isDisabled(reenabled)).toBe(false)
      expect(Fieldset.isFieldDisabled(reenabled, false)).toBe(false)
    })

    it('honors external props.isDisabled alongside Model state', () => {
      expect(Fieldset.isDisabledOf({})).toBe(false)
      expect(Fieldset.isDisabledOf({ isDisabled: true })).toBe(true)
      expect(Fieldset.isDisabled(Fieldset.initial, { isDisabled: true })).toBe(
        true,
      )
      expect(
        Fieldset.isFieldDisabled(Fieldset.initial, false, { isDisabled: true }),
      ).toBe(true)
    })
  })

  describe('per-field client and server validation errors', () => {
    it('sets, merges, prioritizes, and clears client and server field errors', () => {
      expect(Fieldset.isValidOf(Fieldset.initial)).toBe(true)
      expect(Fieldset.errorsOf(Fieldset.initial)).toEqual({})
      expect(Fieldset.fieldErrorOf(Fieldset.initial, 'email')).toEqual(
        Option.none(),
      )
      expect(
        Fieldset.firstInvalidFieldOf(Fieldset.initial, defaultProps),
      ).toEqual(Option.none())

      const withServer = fold([
        Fieldset.SetServerErrors({
          errors: {
            email: 'Email already registered',
            bio: 'Bio contains disallowed link',
            ignored: '',
          },
        }),
      ])
      expect(Fieldset.isValidOf(withServer)).toBe(false)
      expect(Fieldset.isFieldInvalidOf(withServer, 'email')).toBe(true)
      expect(Fieldset.isFieldServerInvalidOf(withServer, 'email')).toBe(true)
      expect(Fieldset.isFieldInvalidOf(withServer, 'ignored')).toBe(false)
      expect(Fieldset.fieldErrorOf(withServer, 'email')).toEqual(
        Option.some('Email already registered'),
      )

      // Client error takes precedence over server error for the same field
      const withBoth = fold(
        [
          Fieldset.SetFieldError({
            field: 'email',
            message: 'Enter a valid email address',
          }),
        ],
        defaultProps,
        withServer,
      )
      expect(Fieldset.fieldErrorOf(withBoth, 'email')).toEqual(
        Option.some('Enter a valid email address'),
      )
      expect(Fieldset.errorsOf(withBoth)).toEqual({
        email: 'Enter a valid email address',
        bio: 'Bio contains disallowed link',
      })

      // Clearing client error falls back to server error if still present
      const clearedClient = fold(
        [Fieldset.ClearFieldError({ field: 'email' })],
        defaultProps,
        withBoth,
      )
      expect(Fieldset.fieldErrorOf(clearedClient, 'email')).toEqual(
        Option.some('Email already registered'),
      )

      // Setting empty string removes the client error
      const setEmpty = fold(
        [
          Fieldset.SetFieldError({
            field: 'name',
            message: 'Name is required',
          }),
          Fieldset.SetFieldError({ field: 'name', message: '' }),
        ],
        defaultProps,
        clearedClient,
      )
      expect(Fieldset.isFieldInvalidOf(setEmpty, 'name')).toBe(false)

      // ClearServerErrors removes only server errors, leaving client errors intact
      const mixed = fold(
        [
          Fieldset.SetFieldError({
            field: 'name',
            message: 'Name is required',
          }),
        ],
        defaultProps,
        setEmpty,
      )
      const clearedServer = fold(
        [Fieldset.ClearServerErrors()],
        defaultProps,
        mixed,
      )
      expect(Fieldset.serverErrorsOf(clearedServer)).toEqual({})
      expect(Fieldset.fieldErrorsOf(clearedServer)).toEqual({
        name: 'Name is required',
      })
      expect(Fieldset.isFieldInvalidOf(clearedServer, 'email')).toBe(false)
      expect(Fieldset.isFieldInvalidOf(clearedServer, 'name')).toBe(true)
    })

    it('finds the first invalid field using props.fieldOrder or key fallback', () => {
      const state = fold([
        Fieldset.SetFieldError({ field: 'bio', message: 'Too long' }),
        Fieldset.SetFieldError({ field: 'email', message: 'Invalid email' }),
      ])

      // Respects fieldOrder ['name', 'email', 'bio'] over insertion order
      expect(Fieldset.firstInvalidFieldOf(state, defaultProps)).toEqual(
        Option.some('email'),
      )

      // Falls back to error map keys when fieldOrder is absent
      expect(Fieldset.firstInvalidFieldOf(state)).toEqual(Option.some('bio'))
    })
  })

  describe('submission lifecycle and Radix Form semantics', () => {
    it('submits valid fieldset, blocks double submits, and reaches Submitted', () => {
      const submitting = fold([Fieldset.AttemptSubmit()])
      expect(Fieldset.submissionStateOf(submitting)).toBe('Submitting')
      expect(Fieldset.isSubmitting(submitting)).toBe(true)
      expect(Fieldset.hasAttemptedSubmit(submitting)).toBe(true)
      expect(Fieldset.submitAttemptCountOf(submitting)).toBe(1)
      expect(Fieldset.canSubmit(submitting)).toBe(false)

      // Second AttemptSubmit while Submitting is ignored
      const duplicate = Fieldset.chart.step(
        submitting,
        Fieldset.AttemptSubmit(),
        defaultProps,
      )
      expect(duplicate._tag).toBe('Ignored')

      const submitted = fold(
        [Fieldset.SucceededSubmit()],
        defaultProps,
        submitting,
      )
      expect(Fieldset.submissionStateOf(submitted)).toBe('Submitted')
      expect(Fieldset.isSubmitted(submitted)).toBe(true)
      expect(Fieldset.isValidOf(submitted)).toBe(true)
      expect(Fieldset.fieldDataStateOf(submitted, 'email')).toEqual(
        Option.some('valid'),
      )
    })

    it('clears server errors on re-submit and blocks entering Submitting when client errors exist', () => {
      const afterServerFailure = fold([
        Fieldset.AttemptSubmit(),
        Fieldset.FailedSubmit({
          error: 'Please fix the highlighted fields',
          serverErrors: { email: 'Already taken' },
        }),
      ])
      expect(Fieldset.submissionStateOf(afterServerFailure)).toBe('Failed')
      expect(Fieldset.isFailed(afterServerFailure)).toBe(true)
      expect(Fieldset.maybeFormErrorOf(afterServerFailure)).toEqual(
        Option.some('Please fix the highlighted fields'),
      )
      expect(Fieldset.fieldErrorOf(afterServerFailure, 'email')).toEqual(
        Option.some('Already taken'),
      )

      // Re-submitting with no client errors clears stale server errors and submits
      const retried = fold(
        [Fieldset.AttemptSubmit()],
        defaultProps,
        afterServerFailure,
      )
      expect(Fieldset.submissionStateOf(retried)).toBe('Submitting')
      expect(Fieldset.serverErrorsOf(retried)).toEqual({})
      expect(Fieldset.submitAttemptCountOf(retried)).toBe(2)

      // Client error prevents entering Submitting, while still recording the attempt and clearing stale server errors
      const withClientError = fold([
        Fieldset.SetServerErrors({ errors: { bio: 'Old server error' } }),
        Fieldset.SetFieldError({ field: 'name', message: 'Required' }),
        Fieldset.AttemptSubmit(),
      ])
      expect(Fieldset.submissionStateOf(withClientError)).toBe('Idle')
      expect(Fieldset.hasAttemptedSubmit(withClientError)).toBe(true)
      expect(Fieldset.submitAttemptCountOf(withClientError)).toBe(1)
      expect(Fieldset.serverErrorsOf(withClientError)).toEqual({})
      expect(Fieldset.fieldErrorsOf(withClientError)).toEqual({
        name: 'Required',
      })
      expect(Fieldset.fieldDataStateOf(withClientError, 'name')).toEqual(
        Option.some('invalid'),
      )
      expect(Fieldset.fieldDataStateOf(withClientError, 'email')).toEqual(
        Option.some('valid'),
      )
    })

    it('ignores AttemptSubmit when disabled via state or props', () => {
      const disabledState = Fieldset.initialDisabled(true)
      expect(
        Fieldset.chart.step(
          disabledState,
          Fieldset.AttemptSubmit(),
          defaultProps,
        )._tag,
      ).toBe('Ignored')

      expect(
        Fieldset.chart.step(Fieldset.initial, Fieldset.AttemptSubmit(), {
          ...defaultProps,
          isDisabled: true,
        })._tag,
      ).toBe('Ignored')
    })

    it('ignores SucceededSubmit and FailedSubmit outside Submitting', () => {
      for (const state of [
        Fieldset.initial,
        fold([Fieldset.AttemptSubmit(), Fieldset.SucceededSubmit()]),
        fold([Fieldset.AttemptSubmit(), Fieldset.FailedSubmit({})]),
      ]) {
        expect(
          Fieldset.chart.step(state, Fieldset.SucceededSubmit(), defaultProps)
            ._tag,
        ).toBe('Ignored')
        expect(
          Fieldset.chart.step(state, Fieldset.FailedSubmit({}), defaultProps)
            ._tag,
        ).toBe('Ignored')
      }
    })

    it('resets errors and submission state on ResetFieldset while preserving disabled state', () => {
      const failed = fold([
        Fieldset.SetDisabled({ isDisabled: false }),
        Fieldset.AttemptSubmit(),
        Fieldset.FailedSubmit({
          error: 'Server rejected',
          serverErrors: { email: 'Taken' },
        }),
        Fieldset.SetFieldError({ field: 'name', message: 'Required' }),
        Fieldset.SetDisabled({ isDisabled: true }),
      ])

      const reset = fold([Fieldset.ResetFieldset()], defaultProps, failed)
      expect(Fieldset.submissionStateOf(reset)).toBe('Idle')
      expect(Fieldset.isValidOf(reset)).toBe(true)
      expect(Fieldset.hasAttemptedSubmit(reset)).toBe(false)
      expect(Fieldset.submitAttemptCountOf(reset)).toBe(0)
      expect(Fieldset.maybeFormErrorOf(reset)).toEqual(Option.none())
      expect(Fieldset.isDisabled(reset)).toBe(true)
    })

    it('returns Submitted to Idle when SetFieldError records a new error', () => {
      const submitted = fold([
        Fieldset.AttemptSubmit(),
        Fieldset.SucceededSubmit(),
      ])
      const invalidated = fold(
        [Fieldset.SetFieldError({ field: 'email', message: 'Invalid' })],
        defaultProps,
        submitted,
      )
      expect(Fieldset.submissionStateOf(invalidated)).toBe('Idle')
      expect(Fieldset.isFieldInvalidOf(invalidated, 'email')).toBe(true)
    })
  })

  describe('atRest and Schema round-trip', () => {
    it('settles in-flight Submitting to Idle on restart while preserving Idle, Submitted, and Failed', () => {
      const submitting = fold([Fieldset.AttemptSubmit()])
      const rested = Fieldset.atRest(submitting)
      expect(Fieldset.submissionStateOf(rested)).toBe('Idle')
      expect(Fieldset.submitAttemptCountOf(rested)).toBe(1)

      const submitted = fold(
        [Fieldset.SucceededSubmit()],
        defaultProps,
        submitting,
      )
      expect(Fieldset.atRest(submitted)).toEqual(submitted)

      const failed = fold(
        [
          Fieldset.FailedSubmit({
            error: 'Try again',
            serverErrors: { email: 'Taken' },
          }),
        ],
        defaultProps,
        submitting,
      )
      expect(Fieldset.atRest(failed)).toEqual(failed)
    })

    it('round-trips every State variant cleanly through Schema JSON encoding', () => {
      const states: ReadonlyArray<Fieldset.State> = [
        Fieldset.initial,
        fold([Fieldset.AttemptSubmit()]),
        fold([Fieldset.AttemptSubmit(), Fieldset.SucceededSubmit()]),
        fold([
          Fieldset.AttemptSubmit(),
          Fieldset.FailedSubmit({
            error: 'Conflict',
            serverErrors: { email: 'Taken' },
          }),
        ]),
      ]
      for (const state of states) {
        const encoded = S.encodeSync(Fieldset.State)(state)
        const decoded = S.decodeUnknownSync(Fieldset.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('reference-stable SlotBinding projections and ARIA', () => {
    it('projects group ARIA, legend, description, submit/reset controls, and per-field errors', () => {
      const view = Part.view(Fieldset.part, Fieldset.initial, defaultProps)

      const fieldset = view.slot('Fieldset')
      expect(Slot.ariaOf(fieldset)).toEqual({
        role: 'group',
        id: 'account-fieldset',
        'aria-labelledby': 'account-legend',
        'aria-describedby': 'account-description',
      })

      expect(Slot.ariaOf(view.slot('Legend'))).toEqual({
        id: 'account-legend',
      })
      expect(Slot.ariaOf(view.slot('Description'))).toEqual({
        id: 'account-description',
      })

      const submit = view.slot('SubmitButton')
      expect(submit.gestures).toEqual([
        { gesture: 'Pressed', press: 'AttemptSubmit' },
      ])
      expect(Slot.ariaOf(submit)).toEqual({
        role: 'button',
        id: 'account-submit',
        'aria-controls': 'account-fieldset',
        tabindex: '0',
      })

      const reset = view.slot('ResetButton')
      expect(reset.gestures).toEqual([
        { gesture: 'Pressed', press: 'ResetFieldset' },
      ])
      expect(Slot.ariaOf(reset)).toEqual({
        role: 'button',
        id: 'account-reset',
        'aria-controls': 'account-fieldset',
        tabindex: '0',
      })

      expect(Slot.ariaOf(view.slot('FieldError', 'email'))).toEqual({
        role: 'alert',
        id: 'account-field-email-message',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        hidden: '',
      })
      expect(Slot.ariaOf(view.slot('FieldError'))).toEqual({
        role: 'alert',
        id: 'account-error',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        hidden: '',
      })
    })

    it('updates invalid/disabled ARIA and keeps unchanged slot bindings reference-stable', () => {
      const part = Fieldset.make({ name: 'StableFieldset' })
      const viewBefore = Part.view(part, Fieldset.initial, defaultProps)
      const descriptionBefore = viewBefore.slot('Description')
      const nameErrorBefore = viewBefore.slot('FieldError', 'name')
      const emailErrorBefore = viewBefore.slot('FieldError', 'email')

      // Unchanged state and props return the exact same view
      expect(Part.view(part, Fieldset.initial, defaultProps)).toBe(viewBefore)

      // Setting an error on email updates email's FieldError and Fieldset, while leaving name & Description identical
      const invalidEmail = fold([
        Fieldset.SetFieldError({ field: 'email', message: 'Invalid email' }),
      ])
      const viewInvalid = Part.view(part, invalidEmail, defaultProps)
      expect(viewInvalid.slot('Description')).toBe(descriptionBefore)
      expect(viewInvalid.slot('FieldError', 'name')).toBe(nameErrorBefore)
      expect(viewInvalid.slot('FieldError', 'email')).not.toBe(emailErrorBefore)
      expect(
        Slot.ariaOf(viewInvalid.slot('FieldError', 'email'))['hidden'],
      ).toBe(undefined)
      expect(Slot.ariaOf(viewInvalid.slot('Fieldset'))).toMatchObject({
        'aria-invalid': 'true',
        'aria-describedby': 'account-description account-error',
      })

      // Disabling marks Fieldset, Legend, SubmitButton, and ResetButton disabled
      const disabled = fold([Fieldset.SetDisabled({ isDisabled: true })])
      const viewDisabled = Part.view(part, disabled, defaultProps)
      expect(Slot.ariaOf(viewDisabled.slot('Fieldset'))['aria-disabled']).toBe(
        'true',
      )
      expect(Slot.ariaOf(viewDisabled.slot('Legend'))['aria-disabled']).toBe(
        'true',
      )
      expect(
        Slot.ariaOf(viewDisabled.slot('SubmitButton'))['aria-disabled'],
      ).toBe('true')
      expect(
        Slot.ariaOf(viewDisabled.slot('ResetButton'))['aria-disabled'],
      ).toBe('true')

      // Submitting disables SubmitButton while leaving ResetButton enabled
      const submitting = fold([Fieldset.AttemptSubmit()])
      const viewSubmitting = Part.view(part, submitting, defaultProps)
      expect(
        Slot.ariaOf(viewSubmitting.slot('SubmitButton'))['aria-disabled'],
      ).toBe('true')
      expect(
        Slot.ariaOf(viewSubmitting.slot('ResetButton'))['aria-disabled'],
      ).toBe(undefined)
    })
  })

  describe('Part.compose and synchronization', () => {
    const HostModel = S.Struct({ title: S.String })
    const Rename = Catalog.action('Rename', {
      fields: { title: S.String },
      what: 'Renames the settings page',
      why: 'To identify the form section',
      meta: { label: 'Rename', keys: [] },
    })
    const hostCatalog = Catalog.make([Rename])
    const Host = makeProgram({
      id: 'fieldset-sync-host',
      version: 1,
      Model: HostModel,
      Message: hostCatalog.Message,
      init: () => [{ title: 'Settings' }, []],
      update: (
        model: typeof HostModel.Type,
        message: typeof hostCatalog.Message.Type,
      ) => [{ ...model, title: message.title }, []],
      catalog: hostCatalog,
    })

    it('syncs under Domain by default and settles Submitting in projectLocal', () => {
      const Composed = Part.compose({
        of: Host,
        parts: [Part.given(Fieldset.part, () => defaultProps)],
      })
      const [initialModel] = Composed.init()
      expect(
        Composed.synchronization?.messageCategory(Fieldset.AttemptSubmit()),
      ).toBe('Domain')
      expect(
        Composed.synchronization?.paceOf?.(Fieldset.AttemptSubmit()),
      ).toEqual(Synced())

      const [submitting] = Composed.update(
        initialModel,
        Fieldset.AttemptSubmit(),
      )
      expect(Fieldset.isSubmitting(submitting.parts['Fieldset'])).toBe(true)

      const encoded = S.encodeSync(Composed.Model)(submitting)
      expect(encoded).toHaveProperty('parts.Fieldset._tag', 'Submitting')

      const projected = Composed.synchronization?.projectLocal?.(submitting)
      expect(projected).toBeDefined()
      if (projected !== undefined) {
        expect(Fieldset.submissionStateOf(projected.parts['Fieldset'])).toBe(
          'Idle',
        )
      }
    })

    it('supports deviceOnly() keeping Fieldset local and omitted from encoded Model', () => {
      const LocalFieldset = Fieldset.deviceOnly({ name: 'LocalFieldset' })
      expect(LocalFieldset.sync.AttemptSubmit).toEqual(
        Device({ because: 'OwnView' }),
      )

      const Composed = Part.compose({
        of: Host,
        parts: [Part.given(LocalFieldset, () => defaultProps)],
      })
      const [initialModel] = Composed.init()
      expect(
        Composed.synchronization?.isLocalOnly?.(Fieldset.AttemptSubmit()),
      ).toBe(true)

      const [next] = Composed.update(
        initialModel,
        Fieldset.SetFieldError({ field: 'email', message: 'Invalid' }),
      )
      const encoded = S.encodeSync(Composed.Model)(next)
      expect(encoded).not.toHaveProperty('parts')
    })
  })
})

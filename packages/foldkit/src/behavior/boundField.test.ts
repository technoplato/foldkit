import { Option, Schema as S } from 'effect'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { described } from '../declaration/declare.js'
import * as ModelPath from '../declaration/modelPath.js'
import { paintCli, renderPlainCli } from '../renderers/cliPaint.js'
import { paintHtml } from '../renderers/html.js'
import * as BoundField from './boundField.js'
import * as FieldDraft from './fieldDraft.js'
import * as Fieldset from './fieldset.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const Profile = S.Struct({
  displayName: S.String,
  bio: S.String,
  email: S.String,
  ageText: S.String,
})

const Auth = S.Struct({
  password: S.String,
})

const Model = S.Struct({
  count: S.Number,
  profile: Profile,
  auth: Auth,
  maybeOptionalProfile: S.Option(S.Struct({ nickname: S.String })),
})
type Model = typeof Model.Type

const at = ModelPath.of(Model)

const BioSchema = S.String.pipe(
  S.check(S.isMinLength(3)),
  S.check(S.isMaxLength(160)),
).annotate({
  title: 'Short Bio',
  ...described({
    what: 'A short introduction shown on the profile',
    why: 'To help others recognize the person',
  }),
})

const DisplayNameSchema = S.String.pipe(
  S.check(S.isMinLength(1, { message: 'Please enter your display name' })),
)

const EmailSchema = S.String.pipe(
  S.check(
    S.isPattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u, {
      message: 'Enter a valid email address',
    }),
  ),
)

const PasswordSchema = S.String.pipe(S.check(S.isMinLength(8)))

const baseModel: Model = {
  count: 42,
  profile: {
    displayName: 'Ada Lovelace',
    bio: 'Analytical Engine notes',
    email: 'ada@example.com',
    ageText: '36',
  },
  auth: {
    password: '',
  },
  maybeOptionalProfile: Option.some({ nickname: 'ada' }),
}

describe('BoundField', () => {
  describe('path and Schema metadata derivation', () => {
    it('derives stable field name, element IDs, label, description, why, requiredness, and maxLength from ModelPath and Schema', () => {
      const bio = BoundField.textarea(at.profile.bio, BioSchema, {
        placeholder: 'Write a short bio',
        minRows: 3,
        maxRows: 8,
      })

      expect(bio.segments).toEqual(['profile', 'bio'])
      expect(bio.name).toBe('profile.bio')
      expect(bio.id).toBe('profile-bio')
      expect(bio.ids).toEqual({
        field: 'profile-bio',
        control: 'profile-bio-textarea',
        input: 'profile-bio-input',
        textarea: 'profile-bio-textarea',
        label: 'profile-bio-label',
        description: 'profile-bio-description',
        error: 'profile-bio-error',
        visibilityToggle: 'profile-bio-visibility',
        clearButton: 'profile-bio-clear',
      })
      expect(bio.label).toBe('Short Bio')
      expect(bio.maybeDescription).toEqual(
        Option.some('A short introduction shown on the profile'),
      )
      expect(bio.maybeWhy).toEqual(
        Option.some('To help others recognize the person'),
      )
      expect(bio.isRequired).toBe(true)
      expect(bio.maxLength).toBe(160)
      expect(bio.settleMs).toBe(200)
      expect(bio.pace).toEqual(Pace.Settled({ afterMs: 200 }))
      expect(bio.validateOn).toBe('Blur')
      expect(bio.minRows).toBe(3)
      expect(bio.maxRows).toBe(8)
    })

    it('title-cases the final path segment when Schema has no title annotation', () => {
      const displayName = BoundField.text(
        at.profile.displayName,
        DisplayNameSchema,
      )
      const plainBio = BoundField.text(at.profile.bio, S.String)

      expect(displayName.label).toBe('Display Name')
      expect(displayName.id).toBe('profile-display-name')
      expect(displayName.ids.input).toBe('profile-display-name-input')
      expect(plainBio.label).toBe('Bio')
      expect(plainBio.isRequired).toBe(false)
      expect(BoundField.labelFromSegment('first_name')).toBe('First Name')
      expect(BoundField.labelFromSegment('email-address')).toBe('Email Address')
    })

    it('enforces ModelPath<string> at compile time', () => {
      expectTypeOf(at.profile.bio).toMatchTypeOf<ModelPath.ModelPath<string>>()
      if (false) {
        // @ts-expect-error `at.count` is ModelPath<number>, not ModelPath<string>
        BoundField.text(at.count, S.String)
      }
      expect(ModelPath.segmentsOf(at.count)).toEqual(['count'])
    })
  })

  describe('pure immutable ModelPath lenses (readAt / writeAt)', () => {
    it('reads and writes nested struct fields and Option submodels immutably', () => {
      expect(BoundField.readAt(baseModel, at.profile.bio)).toEqual(
        Option.some('Analytical Engine notes'),
      )
      expect(BoundField.readAt(baseModel, at.count, S.Number)).toEqual(
        Option.some(42),
      )
      expect(
        BoundField.readAt(baseModel, at.maybeOptionalProfile.nickname),
      ).toEqual(Option.some('ada'))

      const updated = BoundField.writeAt(
        baseModel,
        at.profile.bio,
        'Updated bio',
      )
      expect(updated.profile.bio).toBe('Updated bio')
      expect(updated.profile.displayName).toBe('Ada Lovelace')
      expect(baseModel.profile.bio).toBe('Analytical Engine notes')

      const updatedOptional = BoundField.writeAt(
        baseModel,
        at.maybeOptionalProfile.nickname,
        'countess',
      )
      expect(
        BoundField.readAt(updatedOptional, at.maybeOptionalProfile.nickname),
      ).toEqual(Option.some('countess'))

      const noneModel: Model = {
        ...baseModel,
        maybeOptionalProfile: Option.none(),
      }
      expect(
        BoundField.readAt(noneModel, at.maybeOptionalProfile.nickname),
      ).toEqual(Option.none())
      expect(
        BoundField.writeAt(
          noneModel,
          at.maybeOptionalProfile.nickname,
          'ignored',
        ),
      ).toEqual(noneModel)
    })
  })

  describe('Effect Schema validation and timing policies', () => {
    it('produces clean human errors for minLength, maxLength, pattern, custom messages, and transforms', () => {
      const bio = BoundField.textarea(at.profile.bio, BioSchema)
      const displayName = BoundField.text(
        at.profile.displayName,
        DisplayNameSchema,
      )
      const email = BoundField.text(at.profile.email, EmailSchema, {
        inputType: 'email',
      })
      const age = BoundField.text(at.profile.ageText, S.FiniteFromString, {
        label: 'Age',
      })

      expect(BoundField.validate(bio, 'hi')).toEqual({
        _tag: 'Invalid',
        message: 'Short Bio must be at least 3 characters',
        issues: ['Short Bio must be at least 3 characters'],
      })
      expect(BoundField.validate(bio, 'Valid bio text')).toEqual({
        _tag: 'Valid',
        value: 'Valid bio text',
      })
      expect(BoundField.validate(bio, 'x'.repeat(161))).toEqual({
        _tag: 'Invalid',
        message: 'Short Bio must be at most 160 characters',
        issues: ['Short Bio must be at most 160 characters'],
      })

      expect(BoundField.validate(displayName, '')).toEqual({
        _tag: 'Invalid',
        message: 'Please enter your display name',
        issues: ['Please enter your display name'],
      })

      expect(BoundField.validate(email, 'not-an-email')).toEqual({
        _tag: 'Invalid',
        message: 'Enter a valid email address',
        issues: ['Enter a valid email address'],
      })
      expect(BoundField.validate(email, 'ada@example.com')).toEqual({
        _tag: 'Valid',
        value: 'ada@example.com',
      })

      const validAge = BoundField.validate(age, '36')
      expect(validAge).toEqual({ _tag: 'Valid', value: 36 })
      const invalidAge = BoundField.validate(age, 'nope')
      expect(invalidAge._tag).toBe('Invalid')
    })

    it('never leaks raw secret input values in validation messages and syncs secrets as Device Secret', () => {
      const password = BoundField.secret(at.auth.password, PasswordSchema)

      expect(password.sync).toBe('Secret')
      expect(password.inputType).toBe('password')
      expect(password.pace).toEqual(Pace.Device({ because: 'Secret' }))
      expect(
        BoundField.paceOf(
          password,
          BoundField.ChangeFieldDraft({ value: '123' }),
        ),
      ).toEqual(Pace.Device({ because: 'Secret' }))

      const invalid = BoundField.validate(password, 'shhh')
      expect(invalid._tag).toBe('Invalid')
      if (invalid._tag === 'Invalid') {
        expect(invalid.message).toBe('Password must be at least 8 characters')
        expect(invalid.message).not.toContain('shhh')
      }
    })

    it('gates client error visibility on Blur, Change, Submit, and Fieldset submit attempt', () => {
      const onBlurField = BoundField.text(at.profile.bio, BioSchema, {
        validateOn: 'Blur',
      })
      const onChangeField = BoundField.text(at.profile.bio, BioSchema, {
        validateOn: 'Change',
      })
      const onSubmitField = BoundField.text(at.profile.bio, BioSchema, {
        validateOn: 'Submit',
      })

      const fresh = BoundField.initial('')
      expect(BoundField.errorOf(onBlurField, fresh)).toEqual(Option.none())
      expect(BoundField.errorOf(onChangeField, fresh)).toEqual(Option.none())
      expect(BoundField.errorOf(onSubmitField, fresh)).toEqual(Option.none())

      const typed = BoundField.transition(
        onBlurField,
        fresh,
        BoundField.ChangeFieldDraft({ value: 'ab' }),
      )
      expect(BoundField.errorOf(onBlurField, typed)).toEqual(Option.none())
      expect(BoundField.errorOf(onChangeField, typed)).toEqual(
        Option.some('Short Bio must be at least 3 characters'),
      )
      expect(BoundField.errorOf(onSubmitField, typed)).toEqual(Option.none())

      const blurred = BoundField.transition(
        onBlurField,
        typed,
        BoundField.BlurField(),
      )
      expect(BoundField.errorOf(onBlurField, blurred)).toEqual(
        Option.some('Short Bio must be at least 3 characters'),
      )
      expect(BoundField.errorOf(onSubmitField, blurred)).toEqual(Option.none())

      const attemptedFieldset = Fieldset.chart.transition(
        Fieldset.initial,
        Fieldset.AttemptSubmit(),
        { id: 'profile' },
      )[0]
      expect(
        BoundField.errorOf(onSubmitField, blurred, {
          fieldset: attemptedFieldset,
        }),
      ).toEqual(Option.some('Short Bio must be at least 3 characters'))
    })
  })

  describe('FieldDraft lifecycle, Pace.Settled sync, and model application', () => {
    it('supports editing, dirty tracking, trimOnCommit, cancel, blur, remote sync, reset, and atRest', () => {
      const bio = BoundField.textarea(at.profile.bio, BioSchema, {
        trimOnCommit: true,
        settleMs: 150,
        defaultValue: 'Default bio',
      })

      expect(
        BoundField.paceOf(bio, BoundField.ChangeFieldDraft({ value: 'hello' })),
      ).toEqual(Pace.Settled({ afterMs: 150 }))
      expect(BoundField.paceOf(bio, BoundField.CommitFieldDraft())).toEqual(
        Pace.Synced(),
      )

      const start = BoundField.initialFromModel(baseModel, bio)
      expect(BoundField.valueOf(start)).toBe('Analytical Engine notes')
      expect(BoundField.isDirty(start)).toBe(false)

      const edited = BoundField.transition(
        bio,
        start,
        BoundField.ChangeFieldDraft({ value: '   New notes   ' }),
      )
      expect(BoundField.isEditing(edited)).toBe(true)
      expect(BoundField.isDirty(edited)).toBe(true)
      expect(BoundField.draftOf(edited)).toBe('   New notes   ')
      expect(BoundField.valueOf(edited)).toBe('Analytical Engine notes')

      const remoteWhileDirty = BoundField.syncFromModel(
        bio,
        BoundField.writeField(baseModel, bio, 'Remote baseline'),
        edited,
      )
      expect(BoundField.valueOf(remoteWhileDirty)).toBe('Remote baseline')
      expect(BoundField.draftOf(remoteWhileDirty)).toBe('   New notes   ')

      const applied = BoundField.applyToModel(
        bio,
        baseModel,
        edited,
        BoundField.BlurField(),
      )
      expect(BoundField.isIdle(applied.state)).toBe(true)
      expect(BoundField.valueOf(applied.state)).toBe('New notes')
      expect(applied.model.profile.bio).toBe('New notes')

      const cancelled = BoundField.transition(
        bio,
        BoundField.transition(
          bio,
          applied.state,
          BoundField.ChangeFieldDraft({ value: 'discard' }),
        ),
        BoundField.CancelFieldDraft(),
      )
      expect(BoundField.valueOf(cancelled)).toBe('New notes')
      expect(BoundField.draftOf(cancelled)).toBe('New notes')

      const reset = BoundField.transition(
        bio,
        cancelled,
        BoundField.ResetBoundField(),
      )
      expect(BoundField.valueOf(reset)).toBe('Default bio')
      expect(BoundField.isTouched(reset)).toBe(false)
      expect(BoundField.hasChanged(reset)).toBe(false)

      const password = BoundField.secret(at.auth.password, PasswordSchema)
      const revealed = BoundField.transition(
        password,
        BoundField.transition(
          password,
          BoundField.initial(''),
          BoundField.ChangeFieldDraft({ value: 'hunter22' }),
        ),
        BoundField.ToggleFieldVisibility(),
      )
      expect(BoundField.isPasswordVisible(revealed)).toBe(true)
      expect(BoundField.effectiveInputTypeOf(password, revealed)).toBe('text')

      const rested = BoundField.atRest(revealed)
      expect(FieldDraft.isIdle(rested.draft)).toBe(true)
      expect(BoundField.valueOf(rested)).toBe('hunter22')
      expect(BoundField.isPasswordVisible(rested)).toBe(false)
    })

    it('derives a valid core Part via toPart', () => {
      const textPart = BoundField.toPart(
        BoundField.text(at.profile.displayName, DisplayNameSchema),
      )
      const textareaPart = BoundField.toPart(
        BoundField.textarea(at.profile.bio, BioSchema),
      )
      const secretPart = BoundField.toPart(
        BoundField.secret(at.auth.password, PasswordSchema),
      )

      expect(Part.problemsOf(textPart)).toEqual([])
      expect(Part.problemsOf(textareaPart)).toEqual([])
      expect(Part.problemsOf(secretPart)).toEqual([])
    })
  })

  describe('Fieldset and BoundField.form integration', () => {
    const displayName = BoundField.text(
      at.profile.displayName,
      DisplayNameSchema,
    )
    const email = BoundField.text(at.profile.email, EmailSchema, {
      inputType: 'email',
    })
    const bio = BoundField.textarea(at.profile.bio, BioSchema)
    const profileForm = BoundField.form(
      'profile',
      { displayName, email, bio },
      { label: 'Profile settings', description: 'Public account details' },
    )

    it('validates all fields, computes firstInvalidFieldOf in declaration order, and updates Fieldset', () => {
      const invalidStates = {
        displayName: BoundField.initial('Ada'),
        email: BoundField.initial('bad-email'),
        bio: BoundField.initial('hi'),
      }

      const checked = BoundField.validateForm(profileForm, invalidStates)
      expect(checked._tag).toBe('Invalid')
      expect(checked.fieldErrors).toEqual({
        'profile.email': 'Enter a valid email address',
        'profile.bio': 'Short Bio must be at least 3 characters',
      })
      expect(checked.maybeFirstInvalidField).toEqual(
        Option.some('profile.email'),
      )
      expect(
        BoundField.firstInvalidFieldOf(profileForm, invalidStates),
      ).toEqual(Option.some('profile.email'))

      const appliedBlocked = BoundField.applyFormValidation(
        profileForm,
        invalidStates,
        Fieldset.initial,
      )
      expect(appliedBlocked.validation._tag).toBe('Invalid')
      expect(appliedBlocked.fieldset._tag).toBe('Idle')
      expect(Fieldset.submitAttemptCountOf(appliedBlocked.fieldset)).toBe(1)
      expect(
        Fieldset.fieldErrorOf(appliedBlocked.fieldset, 'profile.email'),
      ).toEqual(Option.some('Enter a valid email address'))

      const validStates = {
        displayName: BoundField.initial('Ada Lovelace'),
        email: BoundField.initial('ada@example.com'),
        bio: BoundField.initial('Mathematician and writer'),
      }
      const appliedValid = BoundField.applyFormValidation(
        profileForm,
        validStates,
        appliedBlocked.fieldset,
      )
      expect(appliedValid.validation._tag).toBe('Valid')
      if (appliedValid.validation._tag === 'Valid') {
        expect(appliedValid.validation.values).toEqual({
          displayName: 'Ada Lovelace',
          email: 'ada@example.com',
          bio: 'Mathematician and writer',
        })
      }
      expect(appliedValid.fieldset._tag).toBe('Submitting')
    })

    it('propagates Fieldset group disabled and merges server errors cleanly', () => {
      const disabledFieldset = Fieldset.initialDisabled(true)
      expect(
        BoundField.isDisabledOf(email, { fieldset: disabledFieldset }),
      ).toBe(true)

      const unchangedWhenDisabled = BoundField.transition(
        email,
        BoundField.initial('ada@example.com'),
        BoundField.ChangeFieldDraft({ value: 'blocked@example.com' }),
        { fieldset: disabledFieldset },
      )
      expect(BoundField.draftOf(unchangedWhenDisabled)).toBe('ada@example.com')

      const withServerError = Fieldset.chart.transition(
        Fieldset.initial,
        Fieldset.SetServerErrors({
          errors: { 'profile.email': 'Email already registered' },
        }),
        BoundField.toFieldsetProps(profileForm),
      )[0]

      const invalidEmailState = BoundField.transition(
        email,
        BoundField.transition(
          email,
          BoundField.initial(''),
          BoundField.ChangeFieldDraft({ value: 'nope' }),
        ),
        BoundField.BlurField(),
      )

      expect(
        BoundField.errorOf(email, invalidEmailState, {
          fieldset: withServerError,
          errorPriority: 'ServerFirst',
        }),
      ).toEqual(Option.some('Email already registered'))

      expect(
        BoundField.errorOf(email, invalidEmailState, {
          fieldset: withServerError,
          errorPriority: 'ClientFirst',
        }),
      ).toEqual(Option.some('Enter a valid email address'))
    })
  })

  describe('zero-manual-props UiNode & Slot projections', () => {
    it('projects toTextInput, toTextarea, toSlots, toField, and toForm with automatic WAI-ARIA and clean HTML + CLI painting', () => {
      const bio = BoundField.textarea(at.profile.bio, BioSchema, {
        placeholder: 'Tell your story',
      })
      const email = BoundField.text(at.profile.email, EmailSchema, {
        inputType: 'email',
        placeholder: 'ada@example.com',
      })
      const blurredInvalidBio = BoundField.transition(
        bio,
        BoundField.transition(
          bio,
          BoundField.initial(''),
          BoundField.ChangeFieldDraft({ value: 'hi' }),
        ),
        BoundField.BlurField(),
      )

      const slots = BoundField.toSlots(bio, blurredInvalidBio)
      const aria = Slot.ariaOf(slots.control)
      expect(aria['role']).toBe('textbox')
      expect(aria['id']).toBe('profile-bio-textarea')
      expect(aria['aria-multiline']).toBe('true')
      expect(aria['aria-required']).toBe('true')
      expect(aria['aria-invalid']).toBe('true')
      expect(aria['aria-labelledby']).toBe('profile-bio-label')
      expect(aria['aria-describedby']).toBe(
        'profile-bio-description profile-bio-error',
      )
      expect(slots.error.isHidden).toBeUndefined()

      const textareaNode = BoundField.toTextarea(bio, blurredInvalidBio)
      expect(textareaNode._tag).toBe('TextInput')
      expect(textareaNode.value).toBe('hi')
      expect(textareaNode.placeholder).toBe('Tell your story')
      expect(textareaNode.token).toBe('profile.bio:ChangeFieldDraft:')
      expect(textareaNode.blurToken).toBe('profile.bio:BlurField')
      expect(textareaNode.slot?.isMultiline).toBe(true)
      expect(textareaNode.slot?.isInvalid).toBe(true)

      const textInputNode = BoundField.toTextInput(
        email,
        BoundField.initial('ada@example.com'),
      )
      expect(textInputNode._tag).toBe('TextInput')
      expect(textInputNode.value).toBe('ada@example.com')
      expect(textInputNode.slot?.role).toBe('TextBox')
      expect(textInputNode.slot?.isInvalid).toBeUndefined()

      const profileForm = BoundField.form(
        'profile',
        { email, bio },
        { label: 'Profile' },
      )
      const formNode = BoundField.toForm(
        profileForm,
        {
          email: BoundField.initial('ada@example.com'),
          bio: blurredInvalidBio,
        },
        { submitLabel: 'Save', resetLabel: 'Reset' },
      )

      const htmlPainted = JSON.stringify(paintHtml(formNode, tag => tag))
      expect(htmlPainted).toContain('aria-invalid')
      expect(htmlPainted).toContain('profile-bio-description profile-bio-error')
      expect(htmlPainted).toContain('Short Bio must be at least 3 characters')

      const cliPlain = renderPlainCli(formNode, { width: 64 })
      expect(cliPlain).toContain('Profile')
      expect(cliPlain).toContain('ada@example.com')
      expect(cliPlain).toContain('Short Bio must be at least 3 characters')
      expect(cliPlain).toContain('[ Save ]')

      const cliAnsi = paintCli(formNode, {
        width: 64,
        color: true,
        ground: 'Dark',
      })
      expect(cliAnsi.text).toContain('\u001b[')
    })
  })
})

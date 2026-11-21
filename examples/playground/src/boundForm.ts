import { Schema as S } from 'effect'
import { BoundField } from 'foldkit/behavior'
import { ModelPath } from 'foldkit/declaration'

export const ProfileModel = S.Struct({
  profile: S.Struct({
    displayName: S.String,
    bio: S.String,
    apiToken: S.String,
  }),
})
export type ProfileModel = typeof ProfileModel.Type

export const initialProfile: ProfileModel = {
  profile: {
    displayName: 'Michael',
    bio: 'Building cross-surface Foldkit apps with one pure Model and zero painter rules.',
    apiToken: 'fk_live_demo_secret_90210',
  },
}

const at = ModelPath.of(ProfileModel)

const DisplayNameSchema = S.String.check(
  S.isMinLength(2, {
    message: 'Display name must be at least 2 characters.',
  }),
  S.isMaxLength(32, {
    message: 'Display name must be at most 32 characters.',
  }),
)

const BioSchema = S.String.check(
  S.isMinLength(10, {
    message: 'Bio must be at least 10 characters.',
  }),
  S.isMaxLength(160, {
    message: 'Bio must stay under 160 characters.',
  }),
)

const ApiTokenSchema = S.String.check(
  S.isMinLength(12, {
    message: 'Secret token must be at least 12 characters.',
  }),
)

export const displayNameField = BoundField.text(
  at.profile.displayName,
  DisplayNameSchema,
  {
    label: 'Display Name',
    description: 'Synced via Pace.Settled (200ms after typing pauses).',
    placeholder: 'Your name',
    validateOn: 'Change',
  },
)

export const bioField = BoundField.textarea(at.profile.bio, BioSchema, {
  label: 'Architecture Bio',
  description: 'Multiline FieldDraft bound directly to at.profile.bio.',
  placeholder: 'Describe your app…',
  minRows: 2,
  maxRows: 4,
  validateOn: 'Change',
})

export const apiTokenField = BoundField.secret(
  at.profile.apiToken,
  ApiTokenSchema,
  {
    label: 'API Secret Token',
    description:
      'Pace.Device({ because: "Secret" }) — never written to sync log.',
    placeholder: 'fk_live_…',
    validateOn: 'Change',
  },
)

export const profileForm = BoundField.form(
  'playground-profile',
  {
    displayName: displayNameField,
    bio: bioField,
    apiToken: apiTokenField,
  },
  {
    label: 'Model-Bound Profile Form',
    description:
      'Zero manual value/onChange/onBlur/ARIA props — derived from ModelPath + Effect Schema.',
  },
)

export const ProfileFieldKeySchema = S.Literals([
  'displayName',
  'bio',
  'apiToken',
])
export type ProfileFieldKey = typeof ProfileFieldKeySchema.Type

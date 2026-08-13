import { Match as M, Option, Schema as S } from 'effect'

/** Snapshot of Instant `$users` extraFields. Never holds credentials. */
export const ExtraFields = S.Record(S.String, S.Unknown)

/** Snapshot of Instant `$users` extraFields. Never holds credentials. */
export type ExtraFields = typeof ExtraFields.Type

/** Instant `$users` id. */
export const UserId = S.String.check(S.isUUID())

/** Instant `$users` id. */
export type UserId = typeof UserId.Type

/** Instant authentication has not produced a first observation yet. */
export const UnknownIdentity = S.TaggedStruct('UnknownIdentity', {})

/** Instant authentication has not produced a first observation yet. */
export type UnknownIdentity = typeof UnknownIdentity.Type

/** No Instant `$users` row is signed in. */
export const NoneIdentity = S.TaggedStruct('NoneIdentity', {})

/** No Instant `$users` row is signed in. */
export type NoneIdentity = typeof NoneIdentity.Type

/**
 * An anonymous Instant `$users` row. Guests never carry an email; extra is a
 * credential-free `$users` extraFields snapshot and may be empty.
 */
export const GuestIdentity = S.TaggedStruct('GuestIdentity', {
  id: UserId,
  extra: ExtraFields,
})

/**
 * An anonymous Instant `$users` row. Guests never carry an email; extra is a
 * credential-free `$users` extraFields snapshot and may be empty.
 */
export type GuestIdentity = typeof GuestIdentity.Type

/**
 * A named Instant `$users` row. Members always carry an email; extra is a
 * credential-free `$users` extraFields snapshot and may be empty.
 */
export const MemberIdentity = S.TaggedStruct('MemberIdentity', {
  id: UserId,
  email: S.String,
  extra: ExtraFields,
  linkedGuestIds: S.Array(S.String),
})

/**
 * A named Instant `$users` row. Members always carry an email; extra is a
 * credential-free `$users` extraFields snapshot and may be empty.
 */
export type MemberIdentity = typeof MemberIdentity.Type

/** Instant authentication failed while restoring or observing `$users`. */
export const FailedIdentity = S.TaggedStruct('FailedIdentity', {
  reason: S.String,
})

/** Instant authentication failed while restoring or observing `$users`. */
export type FailedIdentity = typeof FailedIdentity.Type

/** Every credential-free Instant `$users` identity. */
export const Identity = S.Union([
  UnknownIdentity,
  NoneIdentity,
  GuestIdentity,
  MemberIdentity,
  FailedIdentity,
])

/** Every credential-free Instant `$users` identity. */
export type Identity = typeof Identity.Type

/** The Instant `$users` id when one signed-in identity is present. */
export const identityId = (identity: Identity): Option.Option<string> =>
  M.value(identity).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      FailedIdentity: () => Option.none(),
      GuestIdentity: guest => Option.some(guest.id),
      MemberIdentity: member => Option.some(member.id),
      NoneIdentity: () => Option.none(),
      UnknownIdentity: () => Option.none(),
    }),
  )

/** The credential-free `$users` extraFields snapshot when one is present. */
export const identityExtra = (identity: Identity): ExtraFields =>
  M.value(identity).pipe(
    M.withReturnType<ExtraFields>(),
    M.tagsExhaustive({
      FailedIdentity: () => ({}),
      GuestIdentity: guest => guest.extra,
      MemberIdentity: member => member.extra,
      NoneIdentity: () => ({}),
      UnknownIdentity: () => ({}),
    }),
  )

/**
 * Replaces linked guest ids on a member identity. Other identities are
 * returned unchanged so a later `$users` query can fill the snapshot.
 */
export const withIdentityLinkedGuestIds = (
  identity: Identity,
  linkedGuestIds: ReadonlyArray<string>,
): Identity => {
  if (identity._tag !== 'MemberIdentity') {
    return identity
  } else {
    return MemberIdentity.make({
      email: identity.email,
      extra: identity.extra,
      id: identity.id,
      linkedGuestIds,
    })
  }
}

/**
 * Replaces the `$users` extraFields snapshot on a guest or member identity.
 * Other identities are returned unchanged.
 */
export const withExtraFields = (
  identity: Identity,
  extra: ExtraFields,
): Identity =>
  M.value(identity).pipe(
    M.withReturnType<Identity>(),
    M.tagsExhaustive({
      FailedIdentity: () => identity,
      GuestIdentity: guest =>
        GuestIdentity.make({
          extra,
          id: guest.id,
        }),
      MemberIdentity: member =>
        MemberIdentity.make({
          email: member.email,
          extra,
          id: member.id,
          linkedGuestIds: member.linkedGuestIds,
        }),
      NoneIdentity: () => identity,
      UnknownIdentity: () => identity,
    }),
  )

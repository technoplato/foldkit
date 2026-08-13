import { Match as M, Option, Schema as S } from 'effect'

import { Flow, IdleFlow } from './flow.js'
import {
  GuestIdentity,
  Identity,
  MemberIdentity,
  NoneIdentity,
  UnknownIdentity,
  identityExtra,
  identityId,
  withIdentityLinkedGuestIds,
} from './identity.js'

/** Instant `$users` identity together with the in-flight authentication method. */
export const Auth = S.Struct({
  flow: Flow,
  identity: Identity,
})

/** Instant `$users` identity together with the in-flight authentication method. */
export type Auth = typeof Auth.Type

/** Auth before Instant `subscribeAuth` has fired. */
export const unknownAuth: Auth = Auth.make({
  flow: IdleFlow.make({}),
  identity: UnknownIdentity.make({}),
})

/** Auth after Instant reports that no `$users` row is signed in. */
export const signedOutAuth: Auth = Auth.make({
  flow: IdleFlow.make({}),
  identity: NoneIdentity.make({}),
})

/**
 * Fills `MemberIdentity.linkedGuestIds` from a later `$users` query. Other
 * identities are left unchanged.
 */
export const withLinkedGuestIds = (
  auth: Auth,
  linkedGuestIds: ReadonlyArray<string>,
): Auth =>
  Auth.make({
    flow: auth.flow,
    identity: withIdentityLinkedGuestIds(auth.identity, linkedGuestIds),
  })

const preserveMemberLinkedGuestIds = (
  current: Auth,
  observedIdentity: Identity,
): Identity => {
  if (
    current.identity._tag !== 'MemberIdentity' ||
    observedIdentity._tag !== 'MemberIdentity'
  ) {
    return observedIdentity
  } else {
    return MemberIdentity.make({
      email: observedIdentity.email,
      extra: current.identity.extra,
      id: observedIdentity.id,
      linkedGuestIds: current.identity.linkedGuestIds,
    })
  }
}

const preserveExtraFields = (
  current: Auth,
  observedIdentity: Identity,
): Identity =>
  M.value(observedIdentity).pipe(
    M.withReturnType<Identity>(),
    M.tagsExhaustive({
      FailedIdentity: () => observedIdentity,
      GuestIdentity: guest =>
        GuestIdentity.make({
          extra: identityExtra(current.identity),
          id: guest.id,
        }),
      MemberIdentity: member =>
        MemberIdentity.make({
          email: member.email,
          extra: identityExtra(current.identity),
          id: member.id,
          linkedGuestIds: member.linkedGuestIds,
        }),
      NoneIdentity: () => observedIdentity,
      UnknownIdentity: () => observedIdentity,
    }),
  )

/**
 * Merges an Instant observation into Program Auth. Identity comes from Instant;
 * in-flight Flow is kept when the same `$users` row is still signed in so a
 * magic-code wait is not erased by a guest re-observation.
 */
export const mergeObservedAuth = (current: Auth, observed: Auth): Auth => {
  const observedTag = observed.identity._tag
  if (
    observedTag === 'FailedIdentity' ||
    observedTag === 'NoneIdentity' ||
    observedTag === 'UnknownIdentity'
  ) {
    return observed
  }

  const currentId = identityId(current.identity)
  const observedId = identityId(observed.identity)
  const isSameSubject =
    Option.isSome(currentId) &&
    Option.isSome(observedId) &&
    currentId.value === observedId.value
  const nextIdentity = preserveMemberLinkedGuestIds(
    current,
    preserveExtraFields(current, observed.identity),
  )

  if (isSameSubject && current.identity._tag === observed.identity._tag) {
    return Auth.make({
      flow: current.flow,
      identity: nextIdentity,
    })
  } else {
    return Auth.make({
      flow: IdleFlow.make({}),
      identity: nextIdentity,
    })
  }
}

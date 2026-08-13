import { Effect, Option, Schema as S } from 'effect'

import { type InstantFailure, instantFailureFromUnknown } from './error.js'
import { IdleFlow } from './flow.js'
import {
  type ExtraFields,
  FailedIdentity,
  GuestIdentity,
  type Identity,
  MemberIdentity,
  NoneIdentity,
  UserId,
} from './identity.js'
import { Auth } from './model.js'

/** Instant `$users` row fields this package reads. Refresh tokens are omitted. */
export type InstantAuthUser = Readonly<{
  email?: string | null
  id: string
  isGuest?: boolean
}>

/** Instant `subscribeAuth` payload this package reads. */
export type InstantAuthResult = Readonly<{
  error?: Readonly<{ message?: string }>
  user?: InstantAuthUser
}>

/** Instant `signInWithMagicCode` payload this package reads. */
export type InstantMagicCodeSignInResult = Readonly<{
  created?: boolean
  user?: InstantAuthUser
}>

/**
 * Host Instant authentication surface used by Auth helpers. Do not import a
 * concrete Instant database type; adapt the host client to this port.
 */
export type InstantAuthClient = Readonly<{
  createAuthorizationURL: (
    params: Readonly<{
      clientName: string
      redirectURL: string
    }>,
  ) => string
  getAuth: () => Promise<InstantAuthUser | null>
  sendMagicCode: (params: Readonly<{ email: string }>) => Promise<unknown>
  signInAsGuest: (
    opts?: Readonly<{ extraFields: ExtraFields }>,
  ) => Promise<unknown>
  signInWithIdToken: (
    params: Readonly<{
      clientName: string
      extraFields?: ExtraFields
      idToken: string
      nonce?: string
    }>,
  ) => Promise<unknown>
  signInWithMagicCode: (
    params: Readonly<{
      code: string
      email: string
      extraFields?: ExtraFields
    }>,
  ) => Promise<InstantMagicCodeSignInResult>
  signOut: () => Promise<unknown>
  subscribeAuth: (listener: (result: InstantAuthResult) => void) => () => void
}>

const InstantAuthUserSchema = S.Struct({
  email: S.optionalKey(S.NullOr(S.String)),
  id: S.String,
  isGuest: S.optionalKey(S.Boolean),
})

const InstantAuthResultSchema = S.Struct({
  error: S.optionalKey(
    S.Struct({
      message: S.optionalKey(S.String),
    }),
  ),
  user: S.optionalKey(InstantAuthUserSchema),
})

const InstantUserEnvelopeSchema = S.Struct({
  created: S.optionalKey(S.Boolean),
  user: S.optionalKey(InstantAuthUserSchema),
})

const emptyExtra: ExtraFields = {}

const isGuestUser = (user: InstantAuthUser): boolean => {
  if (user.isGuest === true) {
    return true
  }
  const email = user.email
  return email === undefined || email === null || email === ''
}

const unusableSubjectAuth = (): Auth =>
  Auth.make({
    flow: IdleFlow.make({}),
    identity: FailedIdentity.make({
      reason: 'Instant returned an unusable authenticated subject.',
    }),
  })

const noneAuth = (): Auth =>
  Auth.make({
    flow: IdleFlow.make({}),
    identity: NoneIdentity.make({}),
  })

const failedAuth = (reason: string): Auth =>
  Auth.make({
    flow: IdleFlow.make({}),
    identity: FailedIdentity.make({ reason }),
  })

/** Maps a token-redacted Instant user onto GuestIdentity or MemberIdentity. */
export const identityFromInstantUser = (
  user: InstantAuthUser,
): Option.Option<Identity> => {
  const maybeId = S.decodeUnknownOption(UserId)(user.id)
  if (Option.isNone(maybeId)) {
    return Option.none()
  }
  if (isGuestUser(user)) {
    return Option.some(
      GuestIdentity.make({
        extra: emptyExtra,
        id: maybeId.value,
      }),
    )
  }
  const email = user.email
  if (email === undefined || email === null || email === '') {
    return Option.none()
  } else {
    return Option.some(
      MemberIdentity.make({
        email,
        extra: emptyExtra,
        id: maybeId.value,
        linkedGuestIds: [],
      }),
    )
  }
}

/** Maps an unknown Instant method result onto GuestIdentity or MemberIdentity. */
export const identityFromInstantResult = (
  result: unknown,
): Option.Option<Identity> => {
  const maybeEnvelope = S.decodeUnknownOption(InstantUserEnvelopeSchema)(result)
  if (Option.isNone(maybeEnvelope) || maybeEnvelope.value.user === undefined) {
    const maybeUser = S.decodeUnknownOption(InstantAuthUserSchema)(result)
    if (Option.isNone(maybeUser)) {
      return Option.none()
    } else {
      return identityFromInstantUser(maybeUser.value)
    }
  } else {
    return identityFromInstantUser(maybeEnvelope.value.user)
  }
}

/** Maps an Instant `subscribeAuth` payload onto Auth. Observations are IdleFlow. */
export const authFromInstantResult = (result: InstantAuthResult): Auth => {
  if (result.error !== undefined) {
    const message = result.error.message
    if (message === undefined || message === '') {
      return failedAuth(
        'Instant could not restore authentication. Reconnect and try again.',
      )
    } else {
      return failedAuth(message)
    }
  }
  if (result.user === undefined) {
    return noneAuth()
  }
  const maybeIdentity = identityFromInstantUser(result.user)
  if (Option.isNone(maybeIdentity)) {
    return unusableSubjectAuth()
  } else {
    return Auth.make({
      flow: IdleFlow.make({}),
      identity: maybeIdentity.value,
    })
  }
}

/** Maps a decoded Instant `subscribeAuth` unknown payload onto Auth. */
export const authFromUnknownInstantResult = (result: unknown): Auth => {
  const maybeResult = S.decodeUnknownOption(InstantAuthResultSchema)(result)
  if (Option.isNone(maybeResult)) {
    return failedAuth('Instant returned an unusable authentication payload.')
  } else {
    return authFromInstantResult(maybeResult.value)
  }
}

/**
 * Subscribes to token-redacted Instant authentication. Each observation is a
 * complete Auth with IdleFlow; Programs should `mergeObservedAuth` to keep an
 * in-flight method.
 */
export const observeAuth = (
  client: InstantAuthClient,
  listener: (auth: Auth) => void,
): (() => void) =>
  client.subscribeAuth(result => {
    listener(authFromInstantResult(result))
  })

/** Reads the current Instant `$users` row without retaining a refresh token. */
export const readAuth = (
  client: InstantAuthClient,
): Effect.Effect<Auth, InstantFailure> =>
  Effect.tryPromise({
    try: () => client.getAuth(),
    catch: instantFailureFromUnknown,
  }).pipe(
    Effect.map(user => {
      if (user === null) {
        return noneAuth()
      }
      const maybeIdentity = identityFromInstantUser(user)
      if (Option.isNone(maybeIdentity)) {
        return unusableSubjectAuth()
      } else {
        return Auth.make({
          flow: IdleFlow.make({}),
          identity: maybeIdentity.value,
        })
      }
    }),
  )

import { Effect, Match as M, Option, Schema as S } from 'effect'

import {
  type InstantFailure,
  WrongState,
  instantFailureFromUnknown,
} from './error.js'
import {
  AuthProvider,
  AwaitingMagicCode,
  ExchangingOAuth,
  IdleFlow,
  RedirectingOAuth,
  SigningInGuest,
  VerifyingMagicCode,
} from './flow.js'
import { type ExtraFields, NoneIdentity } from './identity.js'
import { Auth } from './model.js'
import { type InstantAuthClient, identityFromInstantResult } from './observe.js'

/** An OAuth redirect URL together with the in-flight Auth snapshot. */
export const AuthorizationRedirect = S.TaggedStruct('AuthorizationRedirect', {
  auth: Auth,
  url: S.String,
})

/** An OAuth redirect URL together with the in-flight Auth snapshot. */
export type AuthorizationRedirect = typeof AuthorizationRedirect.Type

const tryInstant = <A>(
  run: () => Promise<A>,
): Effect.Effect<A, InstantFailure> =>
  Effect.tryPromise({
    try: run,
    catch: instantFailureFromUnknown,
  })

const isIdle = (auth: Auth): boolean => auth.flow._tag === 'IdleFlow'

const isNoneOrGuest = (auth: Auth): boolean =>
  auth.identity._tag === 'NoneIdentity' ||
  auth.identity._tag === 'GuestIdentity'

/** Maps an Instant clientName onto AuthProvider. Unknown names become custom. */
export const authProviderFromClientName = (
  clientName: string,
): AuthProvider => {
  const maybeProvider = S.decodeUnknownOption(AuthProvider)(clientName)
  if (Option.isSome(maybeProvider)) {
    return maybeProvider.value
  } else {
    return 'custom'
  }
}

const completedAuth = (auth: Auth, result: unknown): Auth => {
  const maybeIdentity = identityFromInstantResult(result)
  if (Option.isSome(maybeIdentity)) {
    return Auth.make({
      flow: IdleFlow.make({}),
      identity: maybeIdentity.value,
    })
  } else {
    return auth
  }
}

const wrongStateForSignInAsGuest = (auth: Auth): Option.Option<WrongState> => {
  if (!isIdle(auth)) {
    return Option.some(
      new WrongState({
        action: 'signInAsGuest',
        message:
          "Can't sign in as guest while another authentication method is in progress.",
      }),
    )
  }
  return M.value(auth.identity).pipe(
    M.withReturnType<Option.Option<WrongState>>(),
    M.tagsExhaustive({
      FailedIdentity: () =>
        Option.some(
          new WrongState({
            action: 'signInAsGuest',
            message:
              "Can't sign in as guest until authentication has been observed as signed out.",
          }),
        ),
      GuestIdentity: () =>
        Option.some(
          new WrongState({
            action: 'signInAsGuest',
            message: "Can't sign in as guest while already signed in as guest.",
          }),
        ),
      MemberIdentity: () =>
        Option.some(
          new WrongState({
            action: 'signInAsGuest',
            message:
              "Can't sign in as guest while already signed in as member.",
          }),
        ),
      NoneIdentity: () => Option.none(),
      UnknownIdentity: () =>
        Option.some(
          new WrongState({
            action: 'signInAsGuest',
            message:
              "Can't sign in as guest until authentication has been observed as signed out.",
          }),
        ),
    }),
  )
}

const wrongStateForSendMagicCode = (auth: Auth): Option.Option<WrongState> => {
  if (auth.identity._tag === 'MemberIdentity') {
    return Option.some(
      new WrongState({
        action: 'sendMagicCode',
        message: "Can't send a magic code while already signed in as member.",
      }),
    )
  }
  if (!isIdle(auth)) {
    return Option.some(
      new WrongState({
        action: 'sendMagicCode',
        message:
          "Can't send a magic code while another authentication method is in progress.",
      }),
    )
  }
  if (!isNoneOrGuest(auth)) {
    return Option.some(
      new WrongState({
        action: 'sendMagicCode',
        message:
          "Can't send a magic code until authentication is signed out or a guest.",
      }),
    )
  } else {
    return Option.none()
  }
}

const wrongStateForMagicCodeVerification = (
  auth: Auth,
  email: string,
): Option.Option<WrongState> => {
  if (auth.flow._tag !== 'AwaitingMagicCode' || auth.flow.email !== email) {
    return Option.some(
      new WrongState({
        action: 'signInWithMagicCode',
        message: 'No magic code is awaiting for that email.',
      }),
    )
  } else {
    return Option.none()
  }
}

const wrongStateForOAuth = (
  action: 'signInWithIdToken' | 'createAuthorizationURL',
  auth: Auth,
): Option.Option<WrongState> => {
  const method =
    action === 'signInWithIdToken'
      ? 'sign in with an identity token'
      : 'start OAuth'
  if (auth.identity._tag === 'MemberIdentity') {
    return Option.some(
      new WrongState({
        action,
        message: `Can't ${method} while already signed in as member.`,
      }),
    )
  }
  if (!isIdle(auth)) {
    return Option.some(
      new WrongState({
        action,
        message: `Can't ${method} while another authentication method is in progress.`,
      }),
    )
  }
  if (!isNoneOrGuest(auth)) {
    return Option.some(
      new WrongState({
        action,
        message: `Can't ${method} until authentication is signed out or a guest.`,
      }),
    )
  } else {
    return Option.none()
  }
}

const wrongStateForSignOut = (auth: Auth): Option.Option<WrongState> =>
  M.value(auth.identity).pipe(
    M.withReturnType<Option.Option<WrongState>>(),
    M.tagsExhaustive({
      FailedIdentity: () =>
        Option.some(
          new WrongState({
            action: 'signOut',
            message: "Can't sign out while authentication is failed.",
          }),
        ),
      GuestIdentity: () => Option.none(),
      MemberIdentity: () => Option.none(),
      NoneIdentity: () =>
        Option.some(
          new WrongState({
            action: 'signOut',
            message: 'Already signed out.',
          }),
        ),
      UnknownIdentity: () =>
        Option.some(
          new WrongState({
            action: 'signOut',
            message: "Can't sign out before authentication has been observed.",
          }),
        ),
    }),
  )

const makeSignInWithIdTokenRequest = (
  params: Readonly<{
    clientName: string
    extraFields?: ExtraFields
    idToken: string
    nonce?: string
  }>,
): Readonly<{
  clientName: string
  extraFields?: ExtraFields
  idToken: string
  nonce?: string
}> => {
  const extraFields = extraFieldsArgument(params.extraFields)
  if (extraFields === undefined) {
    if (params.nonce === undefined) {
      return {
        clientName: params.clientName,
        idToken: params.idToken,
      }
    } else {
      return {
        clientName: params.clientName,
        idToken: params.idToken,
        nonce: params.nonce,
      }
    }
  } else if (params.nonce === undefined) {
    return {
      clientName: params.clientName,
      extraFields: extraFields.extraFields,
      idToken: params.idToken,
    }
  } else {
    return {
      clientName: params.clientName,
      extraFields: extraFields.extraFields,
      idToken: params.idToken,
      nonce: params.nonce,
    }
  }
}

const extraFieldsArgument = (
  extraFields: ExtraFields | undefined,
): Readonly<{ extraFields: ExtraFields }> | undefined => {
  if (extraFields === undefined) {
    return undefined
  } else {
    return { extraFields }
  }
}

/**
 * Creates an anonymous Instant `$users` row. Requires NoneIdentity and IdleFlow.
 * extraFields are forwarded to Instant and never stored on Auth.
 */
export const signInAsGuest = (
  client: InstantAuthClient,
  auth: Auth,
  extraFields?: ExtraFields,
): Effect.Effect<Auth, InstantFailure | WrongState> =>
  Effect.gen(function* () {
    const maybeWrongState = wrongStateForSignInAsGuest(auth)
    if (Option.isSome(maybeWrongState)) {
      return yield* Effect.fail(maybeWrongState.value)
    }
    const opts = extraFieldsArgument(extraFields)
    const result =
      opts === undefined
        ? yield* tryInstant(() => client.signInAsGuest())
        : yield* tryInstant(() => client.signInAsGuest(opts))
    return completedAuth(
      Auth.make({
        flow: SigningInGuest.make({}),
        identity: auth.identity,
      }),
      result,
    )
  })

/**
 * Sends an Instant magic code. Requires NoneIdentity or GuestIdentity and
 * IdleFlow. Rejects MemberIdentity.
 */
export const sendMagicCode = (
  client: InstantAuthClient,
  auth: Auth,
  email: string,
): Effect.Effect<Auth, InstantFailure | WrongState> =>
  Effect.gen(function* () {
    const maybeWrongState = wrongStateForSendMagicCode(auth)
    if (Option.isSome(maybeWrongState)) {
      return yield* Effect.fail(maybeWrongState.value)
    }
    yield* tryInstant(() => client.sendMagicCode({ email }))
    return Auth.make({
      flow: AwaitingMagicCode.make({ email }),
      identity: auth.identity,
    })
  })

/**
 * Verifies an Instant magic code. Requires AwaitingMagicCode for the same email.
 * extraFields are forwarded to Instant and never stored on Auth.
 */
export const signInWithMagicCode = (
  client: InstantAuthClient,
  auth: Auth,
  params: Readonly<{
    code: string
    email: string
    extraFields?: ExtraFields
  }>,
): Effect.Effect<Auth, InstantFailure | WrongState> =>
  Effect.gen(function* () {
    const maybeWrongState = wrongStateForMagicCodeVerification(
      auth,
      params.email,
    )
    if (Option.isSome(maybeWrongState)) {
      return yield* Effect.fail(maybeWrongState.value)
    }
    const extraFields = extraFieldsArgument(params.extraFields)
    const result =
      extraFields === undefined
        ? yield* tryInstant(() =>
            client.signInWithMagicCode({
              code: params.code,
              email: params.email,
            }),
          )
        : yield* tryInstant(() =>
            client.signInWithMagicCode({
              code: params.code,
              email: params.email,
              extraFields: extraFields.extraFields,
            }),
          )
    return completedAuth(
      Auth.make({
        flow: VerifyingMagicCode.make({ email: params.email }),
        identity: auth.identity,
      }),
      result,
    )
  })

/**
 * Exchanges an OAuth identity token. Requires NoneIdentity or GuestIdentity.
 * extraFields are forwarded to Instant and never stored on Auth.
 */
export const signInWithIdToken = (
  client: InstantAuthClient,
  auth: Auth,
  params: Readonly<{
    clientName: string
    extraFields?: ExtraFields
    idToken: string
    nonce?: string
  }>,
): Effect.Effect<Auth, InstantFailure | WrongState> =>
  Effect.gen(function* () {
    const maybeWrongState = wrongStateForOAuth('signInWithIdToken', auth)
    if (Option.isSome(maybeWrongState)) {
      return yield* Effect.fail(maybeWrongState.value)
    }
    const provider = authProviderFromClientName(params.clientName)
    const nonce = Option.fromNullishOr(params.nonce)
    const request = makeSignInWithIdTokenRequest(params)
    const result = yield* tryInstant(() => client.signInWithIdToken(request))
    return completedAuth(
      Auth.make({
        flow: ExchangingOAuth.make({
          nonce,
          provider,
        }),
        identity: auth.identity,
      }),
      result,
    )
  })

/**
 * Builds an Instant OAuth redirect URL. Requires NoneIdentity or GuestIdentity.
 * Returns the URL together with RedirectingOAuth Auth.
 */
export const createAuthorizationURL = (
  client: InstantAuthClient,
  auth: Auth,
  params: Readonly<{
    clientName: string
    redirectURL: string
  }>,
): Effect.Effect<AuthorizationRedirect, InstantFailure | WrongState> =>
  Effect.gen(function* () {
    const maybeWrongState = wrongStateForOAuth('createAuthorizationURL', auth)
    if (Option.isSome(maybeWrongState)) {
      return yield* Effect.fail(maybeWrongState.value)
    }
    const url = yield* Effect.try({
      try: () =>
        client.createAuthorizationURL({
          clientName: params.clientName,
          redirectURL: params.redirectURL,
        }),
      catch: instantFailureFromUnknown,
    })
    return AuthorizationRedirect.make({
      auth: Auth.make({
        flow: RedirectingOAuth.make({
          nonce: Option.none(),
          provider: authProviderFromClientName(params.clientName),
        }),
        identity: auth.identity,
      }),
      url,
    })
  })

/**
 * Signs out a GuestIdentity or MemberIdentity session. Rejects NoneIdentity
 * with "Already signed out."
 */
export const signOut = (
  client: InstantAuthClient,
  auth: Auth,
): Effect.Effect<Auth, InstantFailure | WrongState> =>
  Effect.gen(function* () {
    const maybeWrongState = wrongStateForSignOut(auth)
    if (Option.isSome(maybeWrongState)) {
      return yield* Effect.fail(maybeWrongState.value)
    }
    yield* tryInstant(() => client.signOut())
    return Auth.make({
      flow: IdleFlow.make({}),
      identity: NoneIdentity.make({}),
    })
  })

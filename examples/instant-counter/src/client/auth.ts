import { Option, Schema as S } from 'effect'

import type { InstantCounterDatabase } from '../../instant.schema.js'
import { googleClientName } from '../shared/identity.js'

/** Instant is restoring its persisted authentication state. */
export const LoadingAuthentication = S.TaggedStruct('LoadingAuthentication', {})

/** No authenticated subject is available. */
export const SignedOut = S.TaggedStruct('SignedOut', {})

/** One authenticated subject is available without exposing its refresh token. */
export const SignedIn = S.TaggedStruct('SignedIn', {
  maybeEmail: S.OptionFromNullOr(S.String),
  subjectId: S.String,
})

/** Restoring or observing authentication failed. */
export const FailedAuthentication = S.TaggedStruct('FailedAuthentication', {
  reason: S.String,
})

/** Every authentication state safe to expose to the Client renderer. */
export const Authentication = S.Union([
  LoadingAuthentication,
  SignedOut,
  SignedIn,
  FailedAuthentication,
])

/** Every authentication state safe to expose to the Client renderer. */
export type Authentication = typeof Authentication.Type

/** Subscribes to token-redacted Instant authentication state. */
export const observeAuthentication = (
  database: InstantCounterDatabase,
  listener: (authentication: Authentication) => void,
): (() => void) =>
  database.subscribeAuth(result => {
    if (result.error !== undefined) {
      listener(
        FailedAuthentication.make({
          reason:
            'Instant could not restore authentication. Reconnect and try again.',
        }),
      )
    } else if (result.user === undefined) {
      listener(SignedOut.make({}))
    } else {
      listener(
        SignedIn.make({
          maybeEmail: Option.fromNullishOr(result.user.email),
          subjectId: result.user.id,
        }),
      )
    }
  })

/** Sends an Instant magic code without retaining the code or a credential. */
export const sendMagicCode = (
  database: InstantCounterDatabase,
  email: string,
): Promise<void> => database.auth.sendMagicCode({ email }).then(() => undefined)

/** Verifies an Instant magic code supplied by the user. */
export const signInWithMagicCode = (
  database: InstantCounterDatabase,
  email: string,
  code: string,
): Promise<void> =>
  database.auth.signInWithMagicCode({ code, email }).then(() => undefined)

/** Starts the configured Google redirect flow without adding Program state to the URL. */
export const signInWithGoogle = (database: InstantCounterDatabase): void => {
  const redirectURL = new URL(window.location.href)
  redirectURL.hash = ''
  redirectURL.search = ''
  window.location.assign(
    database.auth.createAuthorizationURL({
      clientName: googleClientName,
      redirectURL: redirectURL.toString(),
    }),
  )
}

/** Signs out and invalidates the locally persisted Instant session. */
export const signOut = (database: InstantCounterDatabase): Promise<void> =>
  database.auth.signOut()

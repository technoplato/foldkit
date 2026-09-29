import { Match as M, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { AccessIdentity, OriginFeatures } from '../origin.js'

// MODEL

/** Asking the origin who Cloudflare Access says the listener is. */
export const CheckingAccount = ts('CheckingAccount')
/** No Cloudflare Access identity reached the origin, as in a bare local preview. */
export const NoAccessIdentity = ts('NoAccessIdentity')
/** The origin could not check the account; the check repeats. */
export const FailedAccountCheck = ts('FailedAccountCheck', {
  reason: S.String,
})
/**
 * Cloudflare Access knows the listener, but Scribe has no account for that
 * email yet. The iPhone signs in first (ADR 0012), and the page checks again
 * every few seconds until it has.
 */
export const AwaitingIPhone = ts('AwaitingIPhone', { access: AccessIdentity })
/** Scribe has the account; the browser is signing in to it. */
export const ConnectingAccount = ts('ConnectingAccount', {
  access: AccessIdentity,
})
/** The browser is signed in to the Scribe account for the Access email. */
export const ConnectedAccount = ts('ConnectedAccount', {
  access: AccessIdentity,
})
/** Signing in to the existing Scribe account failed; the check repeats. */
export const FailedConnect = ts('FailedConnect', {
  access: AccessIdentity,
  reason: S.String,
})
/** The listener signed out of Scribe here; nothing signs in again until they ask. */
export const SignedOutAccount = ts('SignedOutAccount', {
  access: AccessIdentity,
})

/** How the Cloudflare Access identity and the Scribe account connect. */
export const Connection = S.Union([
  CheckingAccount,
  NoAccessIdentity,
  FailedAccountCheck,
  AwaitingIPhone,
  ConnectingAccount,
  ConnectedAccount,
  FailedConnect,
  SignedOutAccount,
])
/** How the Cloudflare Access identity and the Scribe account connect. */
export type Connection = typeof Connection.Type

/** The account Submodel: the connection, and what the origin turns on. */
export const Model = S.Struct({
  connection: Connection,
  features: OriginFeatures,
})
/** The account Submodel. */
export type Model = typeof Model.Type

// INIT

/** The account before the first check; sharing waits until the origin says otherwise. */
export const init = (): Model => ({
  connection: CheckingAccount(),
  features: { sharing: 'AwaitingSchema' },
})

// SELECTOR

/** Who Cloudflare Access says the listener is, once the origin has answered. */
export const accessOf = (model: Model): Option.Option<AccessIdentity> =>
  M.value(model.connection).pipe(
    M.withReturnType<Option.Option<AccessIdentity>>(),
    M.tagsExhaustive({
      CheckingAccount: () => Option.none(),
      NoAccessIdentity: () => Option.none(),
      FailedAccountCheck: () => Option.none(),
      AwaitingIPhone: ({ access }) => Option.some(access),
      ConnectingAccount: ({ access }) => Option.some(access),
      ConnectedAccount: ({ access }) => Option.some(access),
      FailedConnect: ({ access }) => Option.some(access),
      SignedOutAccount: ({ access }) => Option.some(access),
    }),
  )

/** Whether the page checks the account again on a timer. */
export const isRechecking = (model: Model): boolean =>
  M.value(model.connection).pipe(
    M.withReturnType<boolean>(),
    M.tags({
      AwaitingIPhone: () => true,
      FailedAccountCheck: () => true,
      FailedConnect: () => true,
    }),
    M.orElse(() => false),
  )

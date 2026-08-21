import { Schema as S } from 'effect'

/** Instant OAuth client names this package recognizes. Unknown names map to custom. */
export const AuthProvider = S.Literals([
  'google',
  'apple',
  'github',
  'linkedin',
  'clerk',
  'firebase',
  'custom',
])

/** Instant OAuth client names this package recognizes. Unknown names map to custom. */
export type AuthProvider = typeof AuthProvider.Type

/** No authentication method is in flight. */
export const IdleFlow = S.TaggedStruct('IdleFlow', {})

/** No authentication method is in flight. */
export type IdleFlow = typeof IdleFlow.Type

/** Instant is sending a magic code to an email. */
export const SendingMagicCode = S.TaggedStruct('SendingMagicCode', {
  email: S.String,
})

/** Instant is sending a magic code to an email. */
export type SendingMagicCode = typeof SendingMagicCode.Type

/** A magic code was sent and Instant is waiting for the user to verify it. */
export const AwaitingMagicCode = S.TaggedStruct('AwaitingMagicCode', {
  email: S.String,
})

/** A magic code was sent and Instant is waiting for the user to verify it. */
export type AwaitingMagicCode = typeof AwaitingMagicCode.Type

/** Instant is verifying a magic code supplied by the user. */
export const VerifyingMagicCode = S.TaggedStruct('VerifyingMagicCode', {
  email: S.String,
})

/** Instant is verifying a magic code supplied by the user. */
export type VerifyingMagicCode = typeof VerifyingMagicCode.Type

/** Instant is creating an anonymous `$users` row. */
export const SigningInGuest = S.TaggedStruct('SigningInGuest', {})

/** Instant is creating an anonymous `$users` row. */
export type SigningInGuest = typeof SigningInGuest.Type

/** The Client is redirecting through an Instant OAuth provider. */
export const RedirectingOAuth = S.TaggedStruct('RedirectingOAuth', {
  nonce: S.Option(S.String),
  provider: AuthProvider,
})

/** The Client is redirecting through an Instant OAuth provider. */
export type RedirectingOAuth = typeof RedirectingOAuth.Type

/** Instant is exchanging an OAuth identity token for a `$users` row. */
export const ExchangingOAuth = S.TaggedStruct('ExchangingOAuth', {
  nonce: S.Option(S.String),
  provider: AuthProvider,
})

/** Instant is exchanging an OAuth identity token for a `$users` row. */
export type ExchangingOAuth = typeof ExchangingOAuth.Type

/** Instant is exchanging an Access-minted refresh token for a `$users` row. */
export const SigningInHostedIdentity = S.TaggedStruct(
  'SigningInHostedIdentity',
  {},
)

/** Instant is exchanging an Access-minted refresh token for a `$users` row. */
export type SigningInHostedIdentity = typeof SigningInHostedIdentity.Type

/** Instant is invalidating the local `$users` session. */
export const SigningOut = S.TaggedStruct('SigningOut', {})

/** Instant is invalidating the local `$users` session. */
export type SigningOut = typeof SigningOut.Type

/** Every in-flight Instant authentication method. Independent of Identity. */
export const Flow = S.Union([
  IdleFlow,
  SendingMagicCode,
  AwaitingMagicCode,
  VerifyingMagicCode,
  SigningInGuest,
  RedirectingOAuth,
  ExchangingOAuth,
  SigningInHostedIdentity,
  SigningOut,
])

/** Every in-flight Instant authentication method. Independent of Identity. */
export type Flow = typeof Flow.Type

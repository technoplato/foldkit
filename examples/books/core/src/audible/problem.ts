import { Match as M, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

// PROBLEM

/** The Books server could not tell who is asking: no Access login reached it. */
export const NotSignedIn = ts('NotSignedIn')
/** The Books server has no Audible login saved for this family member. */
export const NotConnected = ts('NotConnected')
/**
 * Audible no longer accepts the login Books saved, such as after the
 * device was removed under Amazon's "Manage Your Content and Devices".
 */
export const LoginExpired = ts('LoginExpired')
/**
 * The pasted text is not the address Amazon shows after signing in, the
 * one with `openid.oa2.authorization_code` in it.
 */
export const AddressMismatch = ts('AddressMismatch')
/**
 * The sign-in the pasted address belongs to is gone: it ran past its
 * time, or the server started again in between.
 */
export const SignInExpired = ts('SignInExpired')
/**
 * Amazon refused a request, and why in plain words, such as `it did not
 * accept the sign-in`.
 */
export const AmazonRefused = ts('AmazonRefused', { reason: S.String })
/**
 * Books could not do it on its own side, and why in plain words, such as
 * `the Keychain did not give Books its key`.
 */
export const Unavailable = ts('Unavailable', { reason: S.String })

/**
 * Everything that can stop an Audible import, each with a sentence a
 * person can act on. None of them carries a token or a pasted address.
 */
export const AudibleProblem = S.Union([
  NotSignedIn,
  NotConnected,
  LoginExpired,
  AddressMismatch,
  SignInExpired,
  AmazonRefused,
  Unavailable,
])
/** Everything that can stop an Audible import. */
export type AudibleProblem = typeof AudibleProblem.Type

/**
 * The sentence a screen shows for a problem.
 *
 * @example
 * ```typescript
 * sentenceOf(LoginExpired()) // 'Your Audible login stopped working. Connect again to read your library.'
 * sentenceOf(AmazonRefused({ reason: 'it did not accept the sign-in' })) // 'Amazon refused: it did not accept the sign-in.'
 * ```
 */
export const sentenceOf = (problem: AudibleProblem): string =>
  M.value(problem).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      NotSignedIn: () =>
        'Books could not tell who you are. Reload the page to sign in again.',
      NotConnected: () => 'Connect your Audible account to see your books.',
      LoginExpired: () =>
        'Your Audible login stopped working. Connect again to read your library.',
      AddressMismatch: () =>
        'That is not the address Amazon showed after you signed in. Copy the whole address of the page that looks broken, then paste it here.',
      SignInExpired: () =>
        'That sign-in expired before it was finished. Open Amazon sign-in again, then paste the new address.',
      AmazonRefused: ({ reason }) => `Amazon refused: ${reason}.`,
      Unavailable: ({ reason }) => `Books could not do that: ${reason}.`,
    }),
  )

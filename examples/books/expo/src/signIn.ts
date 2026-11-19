import { Option } from 'effect'

import { accessTokenFromCallbackUrl } from '@foldkit/instant/browser'

// SIGN IN

/** The path of the app's own link the sign-in session comes back to. */
export const signInCallbackPath = 'callback'

/**
 * What the system's sign-in session came back with: a session for the
 * signed-in person, nothing because they closed the sheet, or a link with
 * no session in it.
 */
export type SignInOutcome =
  | Readonly<{ _tag: 'SignedIn'; accessToken: string }>
  | Readonly<{ _tag: 'Left' }>
  | Readonly<{ _tag: 'NoSession' }>

/**
 * Reads the result of the system's authentication session. Only a
 * success carries a link, and only a link with a session in it signs a
 * person in.
 *
 * @example
 * ```typescript
 * outcomeOfSession({ type: 'cancel' }) // { _tag: 'Left' }
 * ```
 */
export const outcomeOfSession = (
  result: Readonly<{ type: string; url?: string }>,
): SignInOutcome => {
  if (result.type !== 'success' || result.url === undefined) {
    return { _tag: 'Left' }
  } else {
    return Option.match(accessTokenFromCallbackUrl(result.url), {
      onNone: (): SignInOutcome => ({ _tag: 'NoSession' }),
      onSome: (accessToken): SignInOutcome => ({
        _tag: 'SignedIn',
        accessToken,
      }),
    })
  }
}

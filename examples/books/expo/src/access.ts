import * as Linking from 'expo-linking'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'

import { knophyAccessStartUrl } from '@foldkit/instant/browser'

import {
  type SignInOutcome,
  outcomeOfSession,
  signInCallbackPath,
} from './signIn'

const sessionKey = 'cf_authorization'

WebBrowser.maybeCompleteAuthSession()

/**
 * The sign-in session the phone kept from the last sign-in, if any. It
 * lives in the device's secure store and nowhere else.
 */
export const loadKeptSession = async (): Promise<string | undefined> => {
  const kept = await SecureStore.getItemAsync(sessionKey)
  return kept === null || kept === '' ? undefined : kept
}

/**
 * Signs a person in through the system's own authentication session: the
 * system's sheet opens the same sign-in the web uses, where Google and
 * passkeys work and Safari's session is shared, and comes back to the app
 * through the app's link. A session that comes back is kept in the
 * device's secure store.
 *
 * @example
 * ```typescript
 * const outcome = await signInThroughTheSystem()
 * // { _tag: 'SignedIn', accessToken } | { _tag: 'Left' } | { _tag: 'NoSession' }
 * ```
 */
export const signInThroughTheSystem = async (): Promise<SignInOutcome> => {
  const comesBackTo = Linking.createURL(signInCallbackPath)
  const outcome = outcomeOfSession(
    await WebBrowser.openAuthSessionAsync(
      knophyAccessStartUrl(comesBackTo),
      comesBackTo,
      { preferEphemeralSession: false },
    ),
  )
  if (outcome._tag === 'SignedIn') {
    await SecureStore.setItemAsync(sessionKey, outcome.accessToken)
  }
  return outcome
}

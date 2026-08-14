import { Option } from 'effect'
import * as Linking from 'expo-linking'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'

import {
  accessTokenFromCallbackUrl,
  knophyAccessStartUrl,
} from '@foldkit/instant'

const TOKEN_KEY = 'cf_authorization'

WebBrowser.maybeCompleteAuthSession()

/** Loads the stored Knophy Access JWT, if one exists. */
export const loadStoredAccessToken = async (): Promise<string | undefined> => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY)
  if (token === null || token === '') {
    return undefined
  } else {
    return token
  }
}

/** Forgets the stored Knophy Access JWT. */
export const clearStoredAccessToken = (): Promise<void> =>
  SecureStore.deleteItemAsync(TOKEN_KEY)

/** Opens Knophy Access and stores the returned JWT. */
export const requestKnophyAccessToken = async (): Promise<
  string | undefined
> => {
  const redirectUri = Linking.createURL('callback')
  const result = await WebBrowser.openAuthSessionAsync(
    knophyAccessStartUrl(redirectUri),
    redirectUri,
    { preferEphemeralSession: false },
  )
  if (result.type !== 'success') {
    return undefined
  }
  const maybeToken = accessTokenFromCallbackUrl(result.url)
  if (Option.isNone(maybeToken)) {
    return undefined
  }
  await SecureStore.setItemAsync(TOKEN_KEY, maybeToken.value)
  return maybeToken.value
}

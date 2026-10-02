import { Option } from 'effect'
import { Navigation } from 'foldkit'
import { useEffect } from 'react'
import { Linking } from 'react-native'

import { useBound } from '@foldkit/react/interaction'

// DEEP LINKS

/**
 * Sends the app's deep links to the bound Program. The link the app opened
 * with launches once the Program is Ready, so a session that mirrors
 * navigation keeps the newcomer on the shared screen; a link that arrives
 * while running opens as a `DeepLink`.
 *
 * @example
 * ```tsx
 * const App = () => {
 *   useDeepLinks()
 *   return <FoldkitStack />
 * }
 * // foldkit-counter://counter/session opens /counter/session
 * ```
 */
export const useDeepLinks = (): void => {
  const bound = useBound()
  useEffect(() => {
    let maybeLaunchUri: Option.Option<string> = Option.none()
    let isStopped = false

    const launchWhenReady = (): void => {
      if (Option.isSome(maybeLaunchUri) && Option.isSome(bound.navigation())) {
        const launchUri = maybeLaunchUri.value
        maybeLaunchUri = Option.none()
        Navigation.launch(bound, launchUri)
      }
    }

    const stopWatching = bound.subscribe(launchWhenReady)
    void Linking.getInitialURL().then(url => {
      if (!isStopped && url !== null) {
        maybeLaunchUri = Option.some(Navigation.uriOfDeepLink(url))
        launchWhenReady()
      }
    })
    const subscription = Linking.addEventListener('url', ({ url }) => {
      bound.openUri(Navigation.uriOfDeepLink(url), Navigation.DeepLink())
    })
    return () => {
      isStopped = true
      stopWatching()
      subscription.remove()
    }
  }, [bound])
}

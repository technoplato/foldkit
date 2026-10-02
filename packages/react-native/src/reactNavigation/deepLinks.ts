import { Navigation } from 'foldkit'
import { useEffect } from 'react'
import { Linking } from 'react-native'

import { useBound } from '@foldkit/react/interaction'

// LINKS

/**
 * Sends the app's deep links to the bound Program through
 * `Navigation.openWhenReady`. The link the app opened with launches, so a
 * session that mirrors navigation keeps the newcomer on the shared screen;
 * a link that arrives later opens as a `DeepLink`, even if it arrives
 * while the Program is still Starting. While Starting, the latest link
 * replaces any link still waiting.
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
    let isStopped = false
    let cancelWaiting = (): void => {}
    const openSoon = (url: string, via: Navigation.UriVia): void => {
      cancelWaiting()
      cancelWaiting = Navigation.openWhenReady(
        bound,
        Navigation.uriOfDeepLink(url),
        via,
      )
    }
    void Linking.getInitialURL().then(url => {
      if (!isStopped && url !== null) {
        openSoon(url, Navigation.Launch())
      }
    })
    const subscription = Linking.addEventListener('url', ({ url }) => {
      openSoon(url, Navigation.DeepLink())
    })
    return () => {
      isStopped = true
      cancelWaiting()
      subscription.remove()
    }
  }, [bound])
}

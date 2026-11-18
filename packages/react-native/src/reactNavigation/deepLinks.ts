import { Option, String } from 'effect'
import { Navigation } from 'foldkit'
import { useEffect } from 'react'
import { Linking } from 'react-native'

import { useBound } from '@foldkit/react/interaction'

// LINKS

const expoDelimiter = '/--/'

const expoSchemes = /^exps?(\+[^:]+)?:\/\//

/**
 * The in-app URI a link a phone opened names. A link through Expo Go or a
 * development build carries the address after `/--/`, behind the dev
 * server's own host, `exp://192.168.1.4:8081/--/counter/session`; one
 * with no `/--/` only opens the project and names no address. Any other
 * link reads as `Navigation.uriOfDeepLink` says.
 *
 * @example
 * ```typescript
 * uriOfNativeLink('exp://127.0.0.1:8081/--/counter/session') // Some('/counter/session')
 * uriOfNativeLink('exp://127.0.0.1:8081') // None
 * uriOfNativeLink('foldkit-counter://counter/session') // Some('/counter/session')
 * ```
 */
export const uriOfNativeLink = (url: string): Option.Option<string> => {
  if (expoSchemes.test(url)) {
    return Option.map(
      String.indexOf(expoDelimiter)(url),
      index => `/${url.slice(index + expoDelimiter.length)}`,
    )
  } else {
    return Option.some(Navigation.uriOfDeepLink(url))
  }
}

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
      Option.map(uriOfNativeLink(url), uri => {
        cancelWaiting()
        cancelWaiting = Navigation.openWhenReady(bound, uri, via)
      })
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

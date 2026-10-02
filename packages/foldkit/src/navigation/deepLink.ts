import { Option, String } from 'effect'

// LINK

const webSchemes: ReadonlySet<string> = new Set(['http', 'https'])

const schemeSeparator = '://'

const pathAfterHost = (afterScheme: string): string =>
  Option.match(String.search(/[/?#]/)(afterScheme), {
    onNone: () => '/',
    onSome: index => {
      const path = afterScheme.slice(index)
      return String.startsWith('/')(path) ? path : `/${path}`
    },
  })

/**
 * The in-app URI a deep link names. A custom scheme's host is the first
 * path segment, as React Native reports it; a web link keeps its path; a
 * bare path is already a URI.
 *
 * @example
 * ```typescript
 * uriOfDeepLink('foldkit-counter://counter/session') // '/counter/session'
 * uriOfDeepLink('https://counter.example/counter/menu?menu.q=re') // '/counter/menu?menu.q=re'
 * uriOfDeepLink('/counter') // '/counter'
 * ```
 */
export const uriOfDeepLink = (url: string): string =>
  Option.match(String.indexOf(schemeSeparator)(url), {
    onNone: () => url,
    onSome: separatorIndex => {
      const scheme = String.toLowerCase(url.slice(0, separatorIndex))
      const afterScheme = url.slice(separatorIndex + schemeSeparator.length)
      return webSchemes.has(scheme)
        ? pathAfterHost(afterScheme)
        : `/${afterScheme}`
    },
  })

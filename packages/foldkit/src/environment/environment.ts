import { Option } from 'effect'

/** The browser page a painter draws into: its window and its document. */
export type Page = Readonly<{
  window: Window
  document: Document
}>

const isReactNative = (): boolean =>
  typeof navigator !== 'undefined' && navigator.product === 'ReactNative'

/**
 * The page this code runs in, or None anywhere that isn't one: Node, a
 * server render, React Native, or a terminal. A page is a `window` that
 * takes event listeners together with a `document`. Checking that `window`
 * exists is not enough: @foldkit/instant's Node client defines an empty
 * `window` so @instantdb/core runs in a terminal, and React Native defines
 * `window`, names itself in `navigator.product`, and may carry a stand-in
 * `document`.
 *
 * @example
 * ```typescript
 * Environment.maybePage() // Some({ window, document }) in a browser tab
 * Environment.maybePage() // None in `books listen a-new-earth`, even with Instant's window shim
 * ```
 */
export const maybePage = (): Option.Option<Page> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Option.none()
  } else if (typeof window.addEventListener !== 'function') {
    return Option.none()
  } else if (isReactNative()) {
    return Option.none()
  } else {
    return Option.some({ window, document })
  }
}

/**
 * True when this code runs in a browser page. See {@link maybePage}.
 *
 * @example
 * ```typescript
 * Environment.isPage() // true in a browser tab, false in Node, React Native, and terminals
 * ```
 */
export const isPage = (): boolean => Option.isSome(maybePage())

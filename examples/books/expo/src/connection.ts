import { Option } from 'effect'

// CONNECTION

/**
 * Where the phone finds a person's library and their sign-in: the Instant
 * app that holds the library, and the site whose mint turns a signed-in
 * visitor into an Instant session, the same one the web uses.
 */
export type PhoneConnection = Readonly<{
  appId: string
  sessionOrigin: string
}>

/**
 * The connection the app was built with: `EXPO_PUBLIC_BOOKS_INSTANT_APP_ID`
 * names the Instant app, and the site that signs people in is Books' own.
 * None without an app, or when `EXPO_PUBLIC_BOOKS_MADE_UP` asks for the
 * made-up library: the phone then opens three titles nobody wrote.
 *
 * @example
 * ```typescript
 * connectionFrom({ EXPO_PUBLIC_BOOKS_INSTANT_APP_ID: 'app-1' }, booksOrigin)
 * // Some({ appId: 'app-1', sessionOrigin: 'https://books.…' })
 * ```
 */
export const connectionFrom = (
  env: Readonly<Record<string, string | undefined>>,
  sessionOrigin: string,
): Option.Option<PhoneConnection> => {
  const isMadeUpAsked = (env['EXPO_PUBLIC_BOOKS_MADE_UP'] ?? '').trim() !== ''
  return Option.map(
    Option.filter(
      Option.fromNullishOr(env['EXPO_PUBLIC_BOOKS_INSTANT_APP_ID']),
      appId => appId.trim() !== '' && !isMadeUpAsked,
    ),
    appId => ({ appId: appId.trim(), sessionOrigin }),
  )
}

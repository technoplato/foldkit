/**
 * Where a terminal Books command finds its player. This module must not
 * import Effect, Instant, or the Program, so a command starts fast.
 *
 * - `BOOKS_INSTANT_APP_ID` names the Instant app that holds the library.
 *   The `books` launcher reads it from
 *   `~/.config/knophy-host/books/books.env`.
 * - Each app has its own player on this machine, so the dev app and
 *   production never share one.
 */
import { cliDaemonSocketPath } from 'foldkit/cli/view'

/** The word every command starts with, `books pause`. */
export const booksCommandName = 'books'

/**
 * The name of the made-up library the environment asks for with
 * `BOOKS_MADE_UP`, such as `1` or a test's own name, or undefined. With
 * it set, `books` opens three made-up titles with made-up words that play
 * without a sound: nobody is signed in and no real library is read, so a
 * person can try a command and a test can run the command a person types.
 * Each name has its own player, apart from every real one.
 */
export const madeUpNameOf = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined => {
  const name = env['BOOKS_MADE_UP']?.trim() ?? ''
  return name === '' ? undefined : name
}

/** The Instant app the environment names, `bd40c50a-…`, or empty. */
export const booksAppIdOf = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): string => env['BOOKS_INSTANT_APP_ID']?.trim() ?? ''

/**
 * What tells one player on this machine from another: the made-up
 * library's name when one is asked for, else the Instant app, so a
 * made-up player never answers for a real library.
 */
export const playerKeyOf = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): string => {
  const madeUp = madeUpNameOf(env)
  return madeUp === undefined ? booksAppIdOf(env) : `made-up-${madeUp}`
}

/**
 * The socket of this machine's player for the environment's app, such as
 * `/tmp/fkc-3f9a1c2b7d4e.sock`.
 *
 * @example
 * ```typescript
 * booksPlayerSocketPath({ BOOKS_INSTANT_APP_ID: 'bd40c50a-23a1-4500-af9b-fe12492014d8' })
 * ```
 */
export const booksPlayerSocketPath = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): string =>
  cliDaemonSocketPath({
    programId: booksCommandName,
    isolationKey: playerKeyOf(env),
  })

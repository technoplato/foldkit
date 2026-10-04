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

/** The Instant app the environment names, `bd40c50a-…`, or empty. */
export const booksAppIdOf = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): string => env['BOOKS_INSTANT_APP_ID']?.trim() ?? ''

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
    isolationKey: booksAppIdOf(env),
  })

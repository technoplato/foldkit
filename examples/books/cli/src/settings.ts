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
import { statSync } from 'node:fs'

/** The word every command starts with, `books pause`. */
export const booksCommandName = 'books'

/** The default Books web origin for sign-in and full page URLs. */
export const hostedOrigin = 'https://books.pisspoursoftware.xyz'

/**
 * The web origin used for full page URLs in terminal views: `BOOKS_WEB_ORIGIN`
 * when set and non-empty (trailing slashes trimmed), else {@link hostedOrigin}.
 */
export const booksWebOriginOf = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): string => {
  const configured = env['BOOKS_WEB_ORIGIN']?.trim() ?? ''
  const origin = configured === '' ? hostedOrigin : configured
  return origin.replace(/\/+$/u, '')
}

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

/**
 * The contrast the made-up library's made-up system asks for, from
 * `BOOKS_MADE_UP_CONTRAST`: `More`, or the usual one. A made-up player
 * never reads this machine's own setting, so a test says which it is.
 *
 * @example
 * ```typescript
 * madeUpContrastOf({ BOOKS_MADE_UP_CONTRAST: 'More' }) // 'More'
 * ```
 */
export const madeUpContrastOf = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): 'Standard' | 'More' =>
  env['BOOKS_MADE_UP_CONTRAST']?.trim() === 'More' ? 'More' : 'Standard'

/**
 * How long the made-up shelf is, from `BOOKS_MADE_UP_SHELF`: `Long`, 65
 * titles with one of about 16 hours in 134 chapters and one whose words
 * run past the first hour, for seeing a terminal at a real library's size,
 * or the usual three short titles.
 *
 * @example
 * ```typescript
 * madeUpShelfOf({ BOOKS_MADE_UP_SHELF: 'Long' }) // 'Long'
 * madeUpShelfOf({}) // 'Three'
 * ```
 */
export const madeUpShelfOf = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): 'Three' | 'Long' | 'Demo' => {
  const shelf = env['BOOKS_MADE_UP_SHELF']?.trim()
  if (shelf === 'Long') {
    return 'Long'
  } else if (shelf === 'Demo') {
    return 'Demo'
  } else {
    return 'Three'
  }
}

/**
 * Whether the made-up library is the one session every device shares,
 * from `BOOKS_MADE_UP_SESSION=shared`: a terminal, a browser tab and a
 * phone that all ask for it can be watched moving together. Without it a
 * made-up player keeps its session to itself.
 *
 * @example
 * ```typescript
 * isMadeUpSessionShared({ BOOKS_MADE_UP_SESSION: 'shared' }) // true
 * ```
 */
export const isMadeUpSessionShared = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean => env['BOOKS_MADE_UP_SESSION']?.trim() === 'shared'

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

/** The word a command asks a player what it was built from with. */
export const playerBuildWord = 'player-build'

/**
 * What a built script was built from, as a word that changes with every
 * build: the time the file was written. Empty when it cannot be read.
 */
export const buildOf = (scriptPath: string): string => {
  try {
    return Math.round(statSync(scriptPath).mtimeMs).toString()
  } catch {
    return ''
  }
}

/**
 * Short readable app/build version for log row metadata: `BOOKS_APP_VERSION`
 * when set, else a UTC stamp `vYYYYMMDD-HHmm` from the built script's mtime.
 */
export const appVersionOf = (
  scriptPath: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string => {
  const fromEnv = env['BOOKS_APP_VERSION']?.trim() ?? ''
  if (fromEnv !== '') {
    return fromEnv
  }
  try {
    const [datePart = '', timePart = ''] = statSync(scriptPath)
      .mtime.toISOString()
      .split('T')
    const [hour = '', minute = ''] = timePart.split(':')
    return datePart === '' || hour === '' || minute === ''
      ? ''
      : `v${datePart.replaceAll('-', '')}-${hour}${minute}`
  } catch {
    return ''
  }
}

/**
 * Optional email stamped on made-up library rows from `BOOKS_MADE_UP_EMAIL`,
 * so tail captures and tests can exercise user email metadata without signing in.
 */
export const madeUpEmailOf = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined => {
  const email = env['BOOKS_MADE_UP_EMAIL']?.trim() ?? ''
  return email === '' ? undefined : email
}

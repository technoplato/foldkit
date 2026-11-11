import { Effect, Option } from 'effect'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { maybeEnv } from './env.js'

// HELD LIST

const privateFileMode = 0o600
const privateFolderMode = 0o700

/**
 * Where this Mac lists the accounts Scribe holds for people, one line
 * each: `<networkId>\t<address>\t<holder>`. The claims worker pays only
 * from an account on this list, for the person it names, so a database
 * row alone can never make it spend from another key of this Mac.
 * `BRANDON_HELD_ACCOUNTS` names another file.
 *
 * @example
 * ```typescript
 * heldListPath() // '/Users/laptop/.config/scribe-private/brandon-dot/held-accounts.tsv'
 * ```
 */
export const heldListPath = (): string =>
  Option.getOrElse(maybeEnv('BRANDON_HELD_ACCOUNTS'), () =>
    join(homedir(), '.config', 'scribe-private', 'brandon-dot', 'held-accounts.tsv'),
  )

/** The held list as a file: read whole, or one line added. */
export type HeldListFile = Readonly<{
  read: Effect.Effect<string, Error>
  append: (line: string) => Effect.Effect<void, Error>
}>

const failure = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause))

/**
 * The held list at `path`, readable and writable by this Mac's user
 * alone. A file not made yet reads as empty; the first line makes it, and
 * its folder, private.
 */
export const heldListFileAt = (path: string): HeldListFile => ({
  read: Effect.try({
    try: () => (existsSync(path) ? readFileSync(path, 'utf8') : ''),
    catch: failure,
  }),
  append: line =>
    Effect.try({
      try: () => {
        mkdirSync(dirname(path), { recursive: true, mode: privateFolderMode })
        appendFileSync(path, `${line}\n`, { mode: privateFileMode })
        chmodSync(path, privateFileMode)
      },
      catch: failure,
    }),
})

/**
 * The held list as the worker reads it: a file that is missing or cannot
 * be read fails, so a claim waits for it rather than being refused.
 */
export const readHeldListAt = (path: string): Effect.Effect<string, Error> =>
  Effect.try({
    try: () => readFileSync(path, 'utf8'),
    catch: cause =>
      new Error(`the held list ${path} could not be read: ${failure(cause).message}`),
  })

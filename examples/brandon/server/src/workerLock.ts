import { Option } from 'effect'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// WORKER LOCK

const privateFileMode = 0o600
const privateFolderMode = 0o700
const decimal = 10

/**
 * Where the claims worker's lock is: beside the held list it pays from.
 *
 * @example
 * ```typescript
 * workerLockPathBeside('/Users/laptop/.config/scribe-private/brandon-dot/held-accounts.tsv')
 * // '/Users/laptop/.config/scribe-private/brandon-dot/held-claims.lock'
 * ```
 */
export const workerLockPathBeside = (heldListPath: string): string =>
  join(dirname(heldListPath), 'held-claims.lock')

const isAlreadyThere = (cause: unknown): boolean =>
  cause instanceof Error && 'code' in cause && cause.code === 'EEXIST'

const createLock = (path: string, pid: number): boolean => {
  try {
    writeFileSync(path, `${pid.toString()}\n`, {
      flag: 'wx',
      mode: privateFileMode,
    })
    return true
  } catch (cause) {
    if (isAlreadyThere(cause)) {
      return false
    } else {
      throw cause
    }
  }
}

const lockHolderAt = (path: string): Option.Option<number> =>
  Option.filter(
    Option.liftThrowable(() =>
      Number.parseInt(readFileSync(path, 'utf8').trim(), decimal),
    )(),
    holder => Number.isInteger(holder) && holder > 0,
  )

/**
 * Takes the claims worker's lock for the process `pid`, so one worker on
 * this Mac pays at a time: two would each write how the same claim ended.
 * None means this process holds it now; a process id means that live
 * worker does, and this one must stop. A lock whose worker is gone, or
 * that names no process, is taken over.
 *
 * @example
 * ```typescript
 * takeWorkerLock({ path, pid: process.pid, isAlive: isClaimsWorkerAlive }) // Option.none(): go on
 * ```
 */
export const takeWorkerLock = ({
  path,
  pid,
  isAlive,
}: Readonly<{
  path: string
  pid: number
  isAlive: (pid: number) => boolean
}>): Option.Option<number> => {
  mkdirSync(dirname(path), { recursive: true, mode: privateFolderMode })
  if (createLock(path, pid)) {
    return Option.none()
  }
  const maybeHolder = lockHolderAt(path)
  if (Option.exists(maybeHolder, holder => holder === pid)) {
    return Option.none()
  } else if (Option.exists(maybeHolder, isAlive)) {
    return maybeHolder
  } else {
    rmSync(path, { force: true })
    return createLock(path, pid) ? Option.none() : lockHolderAt(path)
  }
}

/**
 * True when the process `pid` is running and is a claims worker: its
 * command names `claims`. A process id the system gave to something else
 * since is not one, so a stale lock never keeps the worker out.
 */
export const isClaimsWorkerAlive = (pid: number): boolean =>
  Option.exists(
    Option.liftThrowable(() =>
      execFileSync('/bin/ps', ['-p', pid.toString(), '-o', 'command='], {
        encoding: 'utf8',
      }),
    )(),
    command => command.includes('claims'),
  )

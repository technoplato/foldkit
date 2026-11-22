/// <reference types="node" />
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const digestOf = (programId: string, isolationKey: string): string =>
  createHash('sha1')
    .update(`${programId}\0${isolationKey}`)
    .digest('hex')
    .slice(0, 12)

/** Unix socket or Windows pipe for one Program daemon. */
export const cliDaemonSocketPath = (options: {
  readonly programId: string
  readonly isolationKey?: string
}): string => {
  const isolationKey =
    options.isolationKey === undefined || options.isolationKey === ''
      ? 'default'
      : options.isolationKey
  const digest = digestOf(options.programId, isolationKey)
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\fkc-${digest}`
  }
  return join('/tmp', `fkc-${digest}.sock`)
}

const sidecarPath = (socketPath: string, suffix: string): string => {
  if (process.platform === 'win32') {
    return join(tmpdir(), `fkc-${digestOf('pipe', socketPath)}${suffix}`)
  }
  return `${socketPath}${suffix}`
}

/** PID file next to the daemon socket. */
export const cliDaemonPidPath = (socketPath: string): string =>
  sidecarPath(socketPath, '.pid')

/** Exclusive spawn lock so two CLIs do not start two daemons. */
export const cliDaemonLockPath = (socketPath: string): string =>
  sidecarPath(socketPath, '.lock')

/** Writes the daemon pid after the socket is listening. */
export const writeCliDaemonPid = (socketPath: string, pid: number): void => {
  writeFileSync(cliDaemonPidPath(socketPath), `${pid.toString()}\n`, 'utf8')
}

/** True when this process created the spawn lock. */
export const tryAcquireCliDaemonLock = (socketPath: string): boolean => {
  try {
    writeFileSync(
      cliDaemonLockPath(socketPath),
      `${process.pid.toString()}\n`,
      {
        flag: 'wx',
      },
    )
    return true
  } catch {
    return false
  }
}

const unlinkIfPresent = (path: string): void => {
  if (existsSync(path)) {
    unlinkSync(path)
  }
}

/** Removes a stale socket and pid. Keeps the spawn lock. */
export const removeCliDaemonSocketAndPid = (socketPath: string): void => {
  if (process.platform !== 'win32') {
    unlinkIfPresent(socketPath)
  }
  unlinkIfPresent(cliDaemonPidPath(socketPath))
}

/** Removes a stale socket, pid, and lock after a dead daemon. */
export const removeCliDaemonFiles = (socketPath: string): void => {
  removeCliDaemonSocketAndPid(socketPath)
  unlinkIfPresent(cliDaemonLockPath(socketPath))
}

/**
 * Names, in the spawn lock, the Background Processor a command just
 * started, in place of the command that started it. The command is gone
 * in a moment and the Processor may take a while to listen; a lock that
 * named the command would read as left behind, and a second command
 * would start a second Processor beside the first.
 *
 * @example
 * ```typescript
 * const child = spawn()
 * holdCliDaemonLockFor(socketPath, child.pid)
 * ```
 */
export const holdCliDaemonLockFor = (
  socketPath: string,
  pid: number | undefined,
): void => {
  if (pid !== undefined) {
    writeFileSync(cliDaemonLockPath(socketPath), `${pid.toString()}\n`, 'utf8')
  }
}

const pidIn = (path: string): number | undefined => {
  try {
    const pid = Number(readFileSync(path, 'utf8').trim())
    return Number.isFinite(pid) && pid > 0 ? pid : undefined
  } catch {
    return undefined
  }
}

/** The pid of the Background Processor listening on a socket, when its file says. */
export const cliDaemonPidOf = (socketPath: string): number | undefined =>
  pidIn(cliDaemonPidPath(socketPath))

/**
 * True when the socket's pid file names this process. A Background
 * Processor that is leaving asks before it removes the socket, since a
 * newer one may have taken the socket while it was saving.
 */
export const ownsCliDaemonFiles = (
  socketPath: string,
  pid: number = process.pid,
): boolean => cliDaemonPidOf(socketPath) === pid

/**
 * Removes the socket, pid, and lock when they are this process's own, and
 * leaves them when another Background Processor has taken the socket.
 *
 * @example
 * ```typescript
 * removeOwnCliDaemonFiles(socketPath) // on the way out
 * ```
 */
export const removeOwnCliDaemonFiles = (
  socketPath: string,
  pid: number = process.pid,
): void => {
  if (ownsCliDaemonFiles(socketPath, pid)) {
    removeCliDaemonFiles(socketPath)
  }
}

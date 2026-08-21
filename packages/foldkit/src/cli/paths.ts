/// <reference types="node" />
import { createHash } from 'node:crypto'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
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

import { Option, String } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { makeFileSnapshotLogTransport } from '../snapshotLog/file.js'
import { type InstantApp } from './fromTransport.js'
import { Instant } from './nodeInstant.js'

const demoEnvFilePath = (): string => {
  const override = process.env['FOLDKIT_INSTANT_DEMO_ENV_FILE']
  if (override !== undefined && override !== '') {
    return override
  }
  return join(homedir(), '.config', 'foldkit-instant-demo', 'counter-v01.env')
}

const unquote = (value: string): string => {
  const isWrapped =
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  if (isWrapped) {
    return value.slice(1, -1)
  }
  return value
}

const applyLine = (line: string): void => {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) {
    return
  }
  const maybeSeparator = String.indexOf('=')(trimmed)
  if (Option.isNone(maybeSeparator)) {
    return
  }
  const key = trimmed.slice(0, maybeSeparator.value)
  const value = unquote(trimmed.slice(maybeSeparator.value + 1))
  if (key === '' || process.env[key] !== undefined) {
    return
  }
  process.env[key] = value
}

/**
 * Fills missing Instant demo credentials from the local env file.
 *
 * Reads FOLDKIT_INSTANT_DEMO_ENV_FILE or the default demo file and
 * sets only keys the process does not already define. A key set to
 * the empty string stays empty, so tests that blank a credential
 * keep their failure.
 */
export const loadInstantDemoEnv = (): void => {
  const path = demoEnvFilePath()
  if (!existsSync(path)) {
    return
  }
  const lines = readFileSync(path, 'utf8').split('\n')
  for (const line of lines) {
    applyLine(line)
  }
}

/** Instant() arguments for a Node demo SyncEngine. */
export type ResolveInstantSyncEngineOptions = Readonly<{
  app: InstantApp
  processor: Processor.Host.Host
  instance?: string
}>

/**
 * Resolves the demo SyncEngine for a Node Instant Client.
 *
 * The default is the shared live Instant tape. COUNTER_TAPE=memory
 * isolates the process instead. COUNTER_TAPE_PATH syncs on a local
 * file tape. `instance` disambiguates two Processors on one Host.
 */
export const resolveInstantSyncEngine = (
  options: ResolveInstantSyncEngineOptions,
): Runtime.SyncEngine => {
  const instance =
    options.instance === undefined ? {} : { instance: options.instance }
  if (process.env['COUNTER_TAPE'] === 'memory') {
    return Runtime.Memory({ processor: options.processor })
  }
  const tapePath = process.env['COUNTER_TAPE_PATH']
  if (tapePath !== undefined && tapePath !== '') {
    return Instant({
      app: options.app,
      processor: options.processor,
      transport: makeFileSnapshotLogTransport(tapePath),
      ...instance,
    })
  }
  loadInstantDemoEnv()
  return Instant({
    app: options.app,
    processor: options.processor,
    ...instance,
  })
}

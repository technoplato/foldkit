import { Layer } from 'effect'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { NodeServices } from '@effect/platform-node'

import { makeFileCounterStorageLayer } from './fileCounterStorage.js'

const STATE_FILE_ENVIRONMENT_VARIABLE = 'FOLDKIT_COUNTER_STATE_FILE'

/** Resolves the one implicit Counter state file for the current process. */
export const counterStateFilePath = (): string => {
  const configuredPath = process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
  if (configuredPath !== undefined) {
    return configuredPath
  } else {
    return join(homedir(), '.local', 'state', 'foldkit', 'counter.json')
  }
}

/** Provides the Node file-backed CounterStorage for the implicit state file. */
export const counterStorageLayer = () =>
  makeFileCounterStorageLayer(counterStateFilePath()).pipe(
    Layer.provide(NodeServices.layer),
  )

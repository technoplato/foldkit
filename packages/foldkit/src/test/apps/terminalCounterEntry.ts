/**
 * A whole terminal host, for the tests of `terminal`: the navigable
 * Counter on a handle that lives in the Background Processor. The tests
 * run this file as a command, the way a person runs `counter`.
 */
import { existsSync, writeFileSync } from 'node:fs'

import { terminal } from '../../cli/host.js'

const idleMs = process.env['FOLDKIT_FIXTURE_IDLE_MS']

const savedPath = process.env['FOLDKIT_FIXTURE_SAVED_PATH']

const socketKey = process.env['FOLDKIT_FIXTURE_SOCKET_KEY']

const busyPath = process.env['FOLDKIT_FIXTURE_BUSY_PATH']

const isBusy = (): boolean =>
  process.env['FOLDKIT_FIXTURE_BUSY'] === '1' ||
  (busyPath !== undefined && existsSync(busyPath))

await terminal({
  name: 'fixture-counter',
  entry: import.meta.url,
  ...(socketKey === undefined ? {} : { socketKey }),
  ...(idleMs === undefined ? {} : { idleMs: Number(idleMs) }),
  processor: async () => {
    const { App, handleOf } = await import('./navigableCounter.js')
    return {
      program: App,
      start: () => handleOf(App),
      keepsAlive: () => (isBusy() ? ['a job is running'] : []),
      ...(savedPath === undefined
        ? {}
        : {
            beforeStop: async () => {
              writeFileSync(savedPath, 'saved')
              return 'Saved the count, then stopped.'
            },
          }),
    }
  },
})

/**
 * A whole terminal host, for the tests of `terminal`: the navigable
 * Counter on a handle that lives in the Background Processor. The tests
 * run this file as a command, the way a person runs `counter`.
 */
import { spawn } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { backgroundProcessorFlag, terminal } from '../../cli/host.js'
import type { LoginItems } from '../../cli/loginItem.js'

const idleMs = process.env['FOLDKIT_FIXTURE_IDLE_MS']

const savedPath = process.env['FOLDKIT_FIXTURE_SAVED_PATH']

const socketKey = process.env['FOLDKIT_FIXTURE_SOCKET_KEY']

const busyPath = process.env['FOLDKIT_FIXTURE_BUSY_PATH']

const isBusy = (): boolean =>
  process.env['FOLDKIT_FIXTURE_BUSY'] === '1' ||
  (busyPath !== undefined && existsSync(busyPath))

const launcher = process.env['FOLDKIT_FIXTURE_LAUNCHER']

const loginItemsHome = process.env['FOLDKIT_FIXTURE_LOGIN_ITEMS']

const startedByLaunchd = new Set(['bootstrap', 'kickstart'])

// NOTE: A launchd that keeps its files under a folder the test names and
// starts the Processor the way the real one does, so no test adds a
// login item to the person's own.
const loginItemsIn = (home: string): LoginItems => ({
  platform: 'darwin',
  userId: 501,
  home,
  exists: existsSync,
  write: (path, text) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  },
  remove: path => {
    rmSync(path, { force: true })
  },
  launchctl: words => {
    appendFileSync(join(home, 'launchctl.log'), `${words.join(' ')}\n`)
    const [firstWord = ''] = words
    if (startedByLaunchd.has(firstWord)) {
      spawn(
        process.execPath,
        [
          ...process.execArgv,
          fileURLToPath(import.meta.url),
          backgroundProcessorFlag,
        ],
        { detached: true, stdio: 'ignore', env: process.env },
      ).unref()
    }
    return { exitCode: 0, said: '' }
  },
})

await terminal(
  {
    name: 'fixture-counter',
    entry: import.meta.url,
    ...(socketKey === undefined ? {} : { socketKey }),
    ...(idleMs === undefined ? {} : { idleMs: Number(idleMs) }),
    ...(process.env['FOLDKIT_FIXTURE_LIFETIME'] === 'AlwaysOn'
      ? { lifetime: 'AlwaysOn' }
      : {}),
    ...(launcher === undefined ? {} : { launcher }),
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
  },
  process,
  loginItemsHome === undefined ? undefined : loginItemsIn(loginItemsHome),
)

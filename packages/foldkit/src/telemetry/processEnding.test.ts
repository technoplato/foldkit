/// <reference types="node" />
import { Array, Effect, Option } from 'effect'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { readTelemetryFiles } from './fileSink.js'
import {
  type EndingSignal,
  type SignalingProcess,
  makeProcessEnding,
} from './processEnding.js'

const fakePid = 4242

const fakeProcess = () => {
  const emitter = new EventEmitter()
  const kills: Array<string> = []
  const process: SignalingProcess = {
    pid: fakePid,
    on: (signal, listener) => emitter.on(signal, listener),
    off: (signal, listener) => emitter.off(signal, listener),
    listenerCount: signal => emitter.listenerCount(signal),
    kill: (pid, signal) => {
      kills.push(`${pid} ${signal}`)
    },
  }
  return { process, emitter, kills }
}

const listenersOn = (emitter: EventEmitter): ReadonlyArray<number> =>
  Array.map(['SIGINT', 'SIGTERM'], signal => emitter.listenerCount(signal))

describe('makeProcessEnding', () => {
  it('ends every watched session, then lets the signal end the process, when nothing else listens', async () => {
    const { process, emitter, kills } = fakeProcess()
    const ending = makeProcessEnding(process)
    const ended: Array<string> = []
    ending.watch(async () => {
      ended.push('player')
    })
    ending.watch(async () => {
      ended.push('watch')
    })
    expect(listenersOn(emitter)).toStrictEqual([1, 1])

    emitter.emit('SIGINT')

    await vi.waitFor(() => {
      expect(kills).toStrictEqual([`${fakePid} SIGINT`])
    })
    expect(ended).toStrictEqual(['player', 'watch'])
    expect(listenersOn(emitter)).toStrictEqual([0, 0])
  })

  it('leaves the signal to a host that listens for it', async () => {
    const { process, emitter, kills } = fakeProcess()
    const ending = makeProcessEnding(process)
    const ended: Array<string> = []
    const heardByHost: Array<string> = []
    emitter.on('SIGTERM', () => {
      heardByHost.push('SIGTERM')
    })
    ending.watch(async () => {
      ended.push('daemon')
    })

    emitter.emit('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(heardByHost).toStrictEqual(['SIGTERM'])
    expect(ended).toStrictEqual([])
    expect(kills).toStrictEqual([])
  })

  it('stops listening once no session is watched', () => {
    const { process, emitter } = fakeProcess()
    const ending = makeProcessEnding(process)
    const stopFirst = ending.watch(async () => {})
    const stopSecond = ending.watch(async () => {})
    stopFirst()
    expect(listenersOn(emitter)).toStrictEqual([1, 1])
    stopSecond()
    expect(listenersOn(emitter)).toStrictEqual([0, 0])
  })

  it('lets the signal end the process once a session takes too long to write', async () => {
    const { process, emitter, kills } = fakeProcess()
    const ending = makeProcessEnding(process, 20)
    ending.watch(() => new Promise(() => {}))

    emitter.emit('SIGTERM')

    await vi.waitFor(() => {
      expect(kills).toStrictEqual([`${fakePid} SIGTERM`])
    })
  })
})

const packageDirectory = process.cwd()

const sourceDirectory = join(packageDirectory, 'src')

const tsxLoader = join(
  packageDirectory,
  '..',
  '..',
  'node_modules',
  'tsx',
  'dist',
  'loader.mjs',
)

const sourceOf = (path: string): string =>
  JSON.stringify(join(sourceDirectory, path))

const sessionScriptFor = (directory: string): string => `
import { Effect, Layer, Schema as S } from 'effect'
import { observer } from ${sourceOf('telemetry/attach.ts')}
import { fileSink } from ${sourceOf('telemetry/fileSink.ts')}
import { Cli } from ${sourceOf('processor/host.ts')}
import { make } from ${sourceOf('program/program.ts')}
import { makeProgramRuntime } from ${sourceOf('runtime/programRuntime.ts')}
import { m } from ${sourceOf('message/index.ts')}

const Ticked = m('Ticked')
const Ticker = make({
  id: 'signal-ticker',
  version: 1,
  Model: S.Struct({ ticks: S.Number }),
  Message: S.Union([Ticked]),
  init: () => [{ ticks: 0 }, []],
  update: model => [{ ticks: model.ticks + 1 }, []],
})

await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* makeProgramRuntime({
        program: Ticker,
        resources: Layer.empty,
        observers: [
          observer({
            app: 'ticker',
            host: Cli(),
            sink: fileSink({ directory: ${JSON.stringify(directory)} }),
          }),
        ],
      })
      yield* runtime.run(Ticked())
      setInterval(() => {}, 1_000)
      process.stdout.write('ready\\n')
      yield* Effect.never
    }),
  ),
)
`

const sessionStartupTimeoutMs = 60_000

type Ended = Readonly<{
  code: number | null
  signal: NodeJS.Signals | null
}>

const runSessionUntil = (
  directory: string,
  signal: EndingSignal,
): Promise<Ended> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        tsxLoader,
        '--input-type=module',
        '--eval',
        sessionScriptFor(directory),
      ],
      { cwd: packageDirectory, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const output: Array<string> = []
    child.stdout.on('data', chunk => {
      output.push(String(chunk))
      if (output.join('').includes('ready')) {
        child.kill(signal)
      }
    })
    child.stderr.on('data', chunk => {
      output.push(String(chunk))
    })
    child.on('error', reject)
    child.on('exit', (code, endedBy) => {
      if (endedBy === null && code !== 0) {
        reject(new Error(output.join('')))
      } else {
        resolve({ code, signal: endedBy })
      }
    })
  })

describe.skipIf(process.platform === 'win32' || !existsSync(tsxLoader))(
  'a Node process told to stop',
  () => {
    it.each(['SIGINT', 'SIGTERM'] satisfies ReadonlyArray<EndingSignal>)(
      'writes SessionStopped and its last lines before %s ends it',
      async signal => {
        const directory = await mkdtemp(
          join(tmpdir(), 'foldkit-telemetry-signal-'),
        )
        try {
          const ended = await runSessionUntil(directory, signal)
          expect(ended).toStrictEqual({ code: null, signal })
          const { events } = await Effect.runPromise(
            readTelemetryFiles([join(directory, 'ticker-terminal-cli.ndjson')]),
          )
          expect(Array.map(events, event => event._tag)).toStrictEqual([
            'SessionStarted',
            'Transition',
            'SessionStopped',
          ])
          expect(
            Option.map(Array.last(events), event => event.surface),
          ).toStrictEqual(Option.some('terminal-cli'))
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      },
      sessionStartupTimeoutMs,
    )
  },
)

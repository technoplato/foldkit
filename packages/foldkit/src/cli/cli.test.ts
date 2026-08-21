/// <reference types="node" />
import { Effect, Match as M, Schema as S } from 'effect'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { m } from '../message/index.js'
import {
  CliDaemonRead,
  askCliDaemon,
  cliDaemonSocketPath,
  ensureCliDaemon,
  isCliDaemonListening,
  spawnCliDaemon,
  startCliDaemonServer,
  stopCliDaemon,
} from './index.js'

const Incremented = m('Incremented')
const Message = S.Union([Incremented])
type Message = typeof Message.Type

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

describe('foldkit CLI adapter', () => {
  it('keeps foldkit/cli/view free of Effect and the foldkit barrel', () => {
    const source = readFileSync(join(process.cwd(), 'src/cli/view.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"]effect['"]/)
    expect(source).not.toMatch(/from ['"]foldkit['"]/)
    expect(source).not.toMatch(/from ['"]\.\.\/program/)
  })

  it.effect('prints a socket path for one Program', () =>
    Effect.sync(() => {
      const path = cliDaemonSocketPath({
        programId: 'FoldkitCounterV01',
        isolationKey: 'memory',
      })
      expect(path).toContain('fkc-')
      const other = cliDaemonSocketPath({
        programId: 'FoldkitCounterV01',
        isolationKey: 'instant',
      })
      expect(other).not.toBe(path)
    }),
  )

  it.effect('reads and runs against a live daemon Processor', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const socketPath = cliDaemonSocketPath({
          programId: 'cli-adapter-test',
          isolationKey: `read-run-${Date.now().toString()}`,
        })
        let count = 0
        yield* startCliDaemonServer({
          socketPath,
          Model,
          Message,
          surface: {
            read: () => Effect.succeed(Model.make({ count })),
            run: message =>
              Effect.sync(() => {
                const previous = Model.make({ count })
                M.value(message).pipe(
                  M.tagsExhaustive({
                    Incremented: () => {
                      count += 1
                    },
                  }),
                )
                return {
                  previous,
                  model: Model.make({ count }),
                }
              }),
          },
        })

        const shown = yield* askCliDaemon({
          socketPath,
          Model,
          Message,
          request: CliDaemonRead(),
        })
        expect(shown.model).toEqual({ count: 0 })
        expect(shown.previous).toBeUndefined()

        const ran = yield* askCliDaemon({
          socketPath,
          Model,
          Message,
          request: { _tag: 'Run', message: Incremented() },
        })
        expect(ran.previous).toEqual({ count: 0 })
        expect(ran.model).toEqual({ count: 1 })

        const after = yield* askCliDaemon({
          socketPath,
          Model,
          Message,
          request: CliDaemonRead(),
        })
        expect(after.model).toEqual({ count: 1 })
      }),
    ),
  )

  it.effect('paints Show and Do without sending Model to the view', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const socketPath = cliDaemonSocketPath({
          programId: 'cli-adapter-paint',
          isolationKey: `show-do-${Date.now().toString()}`,
        })
        let count = 0
        yield* startCliDaemonServer({
          socketPath,
          Model,
          Message,
          surface: {
            read: () => Effect.succeed(Model.make({ count })),
            run: message =>
              Effect.sync(() => {
                const previous = Model.make({ count })
                M.value(message).pipe(
                  M.tagsExhaustive({
                    Incremented: () => {
                      count += 1
                    },
                  }),
                )
                return {
                  previous,
                  model: Model.make({ count }),
                }
              }),
            show: flags =>
              Effect.succeed({
                stdout: `count ${count.toString()} device ${flags['device'] ?? 'none'}`,
                exitCode: 0,
              }),
            do: token =>
              Effect.sync(() => {
                if (token !== 'increment') {
                  return {
                    stdout: '',
                    stderr: `Unknown action "${token}"`,
                    exitCode: 1,
                  }
                }
                count += 1
                return {
                  stdout: `sent ${token} count ${count.toString()}`,
                  exitCode: 0,
                }
              }),
          },
        })

        const { runCliView } = yield* Effect.promise(() => import('./view.js'))
        const shown = yield* Effect.promise(() =>
          runCliView({
            socketPath,
            spawn: () => {
              throw new Error('daemon already listening')
            },
            request: { _tag: 'Show', flags: { device: 'phone' } },
          }),
        )
        expect(shown.stdout).toBe('count 0 device phone')
        expect(shown.exitCode).toBe(0)

        const ran = yield* Effect.promise(() =>
          runCliView({
            socketPath,
            spawn: () => {
              throw new Error('daemon already listening')
            },
            request: { _tag: 'Do', token: 'increment' },
          }),
        )
        expect(ran.stdout).toBe('sent increment count 1')
        expect(ran.exitCode).toBe(0)
      }),
    ),
  )

  it('starts a daemon on first invoke', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'foldkit-cli-spawn-'))
    const socketPath = join('/tmp', `fkc-spawn-${Date.now().toString(36)}.sock`)
    const scriptPath = join(directory, 'daemon.mjs')
    writeFileSync(
      scriptPath,
      [
        "import { createServer } from 'node:net'",
        'const server = createServer(socket => socket.end())',
        `server.listen(${JSON.stringify(socketPath)})`,
      ].join('\n'),
      'utf8',
    )

    let childPid: number | undefined
    await Effect.runPromise(
      ensureCliDaemon({
        socketPath,
        timeoutMs: 8_000,
        spawn: () => {
          const child = spawnCliDaemon({ scriptPath })
          childPid = child.pid
          return child
        },
      }),
    )

    expect(await Effect.runPromise(isCliDaemonListening(socketPath))).toBe(true)
    if (childPid !== undefined) {
      process.kill(childPid, 'SIGTERM')
    }
    await Effect.runPromise(stopCliDaemon(socketPath))
  }, 15_000)
})

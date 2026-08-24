import { Effect, Layer, Option, Queue, Terminal } from 'effect'
import { Processor } from 'foldkit'
import {
  GuessedYes,
  emptyModel,
  hangingSyncedEngine,
  memorySyncedEngine,
  readyPuzzle,
  startSyncedPuzzleHandle,
  update,
  waitForSyncedHandle,
} from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

import { renderPuzzleScreen, runPuzzleTui } from './client.js'

const [afterYes] = update(emptyModel(), GuessedYes())

const keyInput = (name: string): Terminal.UserInput => ({
  input: Option.some(name),
  key: {
    name,
    ctrl: false,
    meta: false,
    shift: false,
  },
})

describe('Puzzle TUI Client', () => {
  it('paints Failed when Instant subscribe never settles', async () => {
    const handle = startSyncedPuzzleHandle(
      hangingSyncedEngine(Processor.Host.Tui()),
      { settleMs: 50 },
    )
    const screens: Array<string> = []
    const layer = Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        rows: Effect.succeed(24),
        readInput: Effect.gen(function* () {
          const queue = yield* Queue.unbounded<Terminal.UserInput>()
          yield* Queue.offer(queue, keyInput('q'))
          return queue
        }),
        readLine: Effect.succeed(''),
        display: text =>
          Effect.sync(() => {
            screens.push(text)
          }),
      }),
    )

    await Effect.runPromise(runPuzzleTui(handle).pipe(Effect.provide(layer)))

    const painted = screens.join('\n')
    expect(painted).toContain('This Processor never became Ready.')
    expect(painted).toContain('start did not settle')
    expect(painted).not.toContain('TransportFailed')
  })

  it('subscribes and sends Starting, Failed, and Ready through the handle', async () => {
    const handle = startSyncedPuzzleHandle(
      memorySyncedEngine(Processor.Host.Tui()),
    )
    await waitForSyncedHandle(handle)
    const screens: Array<string> = []
    const layer = Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        rows: Effect.succeed(24),
        readInput: Effect.gen(function* () {
          const queue = yield* Queue.unbounded<Terminal.UserInput>()
          yield* Queue.offer(queue, keyInput('r'))
          yield* Queue.offer(queue, keyInput('y'))
          yield* Queue.offer(queue, keyInput('q'))
          return queue
        }),
        readLine: Effect.succeed(''),
        display: text =>
          Effect.sync(() => {
            screens.push(text)
          }),
      }),
    )

    await Effect.runPromise(runPuzzleTui(handle).pipe(Effect.provide(layer)))

    expect(screens).toContain(renderPuzzleScreen(readyPuzzle()))
    expect(screens).toContain(renderPuzzleScreen(readyPuzzle(emptyModel())))
    expect(screens).toContain(renderPuzzleScreen(readyPuzzle(afterYes)))
  })

  it('selects the focused Action menu row on Enter', async () => {
    const handle = startSyncedPuzzleHandle(
      memorySyncedEngine(Processor.Host.Tui()),
    )
    await waitForSyncedHandle(handle)
    const screens: Array<string> = []
    const layer = Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        rows: Effect.succeed(24),
        readInput: Effect.gen(function* () {
          const queue = yield* Queue.unbounded<Terminal.UserInput>()
          yield* Queue.offer(queue, keyInput('r'))
          yield* Queue.offer(queue, keyInput('?'))
          yield* Queue.offer(queue, {
            input: Option.some('\r'),
            key: {
              name: 'enter',
              ctrl: false,
              meta: false,
              shift: false,
            },
          })
          yield* Queue.offer(queue, keyInput('q'))
          return queue
        }),
        readLine: Effect.succeed(''),
        display: text =>
          Effect.sync(() => {
            screens.push(text)
          }),
      }),
    )

    await Effect.runPromise(runPuzzleTui(handle).pipe(Effect.provide(layer)))

    expect(screens).toContain(renderPuzzleScreen(readyPuzzle(afterYes)))
  })
})

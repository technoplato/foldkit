/// <reference types="node" />
import { Deferred, Effect, Fiber, Option } from 'effect'
import { existsSync } from 'node:fs'
import { PassThrough, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { Link } from '../navigation/message.js'
import { ChapterApp, bindChapters } from '../test/apps/chapterContents.js'
import { isCliDaemonListening } from './client.js'
import { listenCliDaemon, startCliDaemonServer } from './listen.js'
import { cliDaemonPidPath, cliDaemonSocketPath } from './paths.js'
import { programCliSurface } from './surface.js'
import { runCliTuiView } from './view.js'

const size = { view: 'tui', rows: '24', columns: '80' }

const uriOf = (bound: ReturnType<typeof bindChapters>): string =>
  Option.match(bound.navigation(), {
    onNone: () => 'no plan',
    onSome: plan => plan.uri,
  })

const socketPathFor = (name: string): string =>
  cliDaemonSocketPath({
    programId: 'cli-surface-test',
    isolationKey: `${name}-${Date.now().toString(36)}`,
  })

const fakeTerminal = () => {
  const keyboard = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode: () => keyboard,
  })
  const written: Array<string> = []
  const screen = Object.assign(
    new Writable({
      write: (chunk, _encoding, done) => {
        written.push(String(chunk))
        done()
      },
    }),
    { rows: 24, columns: 80 },
  )
  return { keyboard, screen, written }
}

const eventually = async (isDone: () => boolean): Promise<void> => {
  const startedAt = Date.now()
  while (!isDone()) {
    if (Date.now() - startedAt > 4_000) {
      throw new Error('never happened')
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

describe('programCliSurface for a terminal UI view', () => {
  it('paints the frame a view asks for, presses its keys, and says when it quits', () => {
    const bound = bindChapters()
    bound.openUri('/chapters/contents', Link())
    const surface = programCliSurface(bound, 'chapters')
    const show = Option.getOrThrow(Option.fromNullishOr(surface.show))
    const press = Option.getOrThrow(Option.fromNullishOr(surface.do))
    const first = Effect.runSync(show(size))
    expect(first.stdout.split('\n')).toHaveLength(24)
    expect(first.stdout).toContain('› Chapter 2')
    const moved = Effect.runSync(
      press('key', { ...size, name: 'down', sequence: '\u001b[B' }),
    )
    expect(moved.stdout).toContain('› Chapter 3')
    expect(moved.flags).toEqual({ outcome: 'Handled' })
    Effect.runSync(
      press('key', { ...size, name: 'escape', sequence: '\u001b', meta: '1' }),
    )
    expect(uriOf(bound)).toBe('/chapters')
    const quit = Effect.runSync(
      press('key', { ...size, name: 'q', sequence: 'q' }),
    )
    expect(quit.flags).toEqual({ outcome: 'Quit' })
  })
})

describe('a daemon a terminal UI view talks to', () => {
  it('serves until it is told to stop, then removes its socket and pid', async () => {
    const socketPath = socketPathFor('until')
    await Effect.runPromise(
      Effect.gen(function* () {
        const stopped = yield* Deferred.make<void>()
        const serving = yield* Effect.forkChild(
          listenCliDaemon({
            socketPath,
            Model: ChapterApp.Model,
            Message: ChapterApp.Message,
            surface: programCliSurface(bindChapters(), 'chapters'),
            until: Deferred.await(stopped),
          }),
        )
        yield* Effect.promise(() =>
          eventually(() => existsSync(cliDaemonPidPath(socketPath))),
        )
        expect(yield* isCliDaemonListening(socketPath)).toBe(true)
        yield* Deferred.succeed(stopped, undefined)
        yield* Fiber.join(serving)
        expect(yield* isCliDaemonListening(socketPath)).toBe(false)
        expect(existsSync(cliDaemonPidPath(socketPath))).toBe(false)
      }),
    )
  })

  it('runs a remote terminal UI that keeps up with keys and quits on q', async () => {
    const socketPath = socketPathFor('tui')
    const bound = bindChapters()
    bound.openUri('/chapters/contents', Link())
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* startCliDaemonServer({
            socketPath,
            Model: ChapterApp.Model,
            Message: ChapterApp.Message,
            surface: programCliSurface(bound, 'chapters'),
          })
          const terminal = fakeTerminal()
          const ending = runCliTuiView({
            socketPath,
            spawn: () => {
              throw new Error('the daemon is already listening')
            },
            refreshMs: 50,
            input: terminal.keyboard,
            output: terminal.screen,
          })
          yield* Effect.promise(() =>
            eventually(() =>
              terminal.written.some(text => text.includes('› Chapter 2')),
            ),
          )
          terminal.keyboard.write('\u001b[B')
          yield* Effect.promise(() =>
            eventually(() =>
              terminal.written.some(text => text.includes('› Chapter 3')),
            ),
          )
          terminal.keyboard.write('q')
          const end = yield* Effect.promise(() => ending)
          expect(end).toEqual({ _tag: 'Quit' })
          expect(
            terminal.written.some(text => text.includes('\u001b[?1049l')),
          ).toBe(true)
        }),
      ),
    )
  })
})

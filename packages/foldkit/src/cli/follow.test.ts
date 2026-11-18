/// <reference types="node" />
import { Effect, Schema as S, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { follow } from '../interaction/follow.js'
import { Cli } from '../processor/host.js'
import { Ticked, bindChapters } from '../test/apps/chapterContents.js'
import { startCliDaemonServer } from './listen.js'
import { cliDaemonSocketPath } from './paths.js'
import { CliDaemonError, type CliDaemonSurface } from './protocol.js'
import { followTopicOf, programCliSurface } from './surface.js'
import {
  type CliFollowRuntime,
  askCliView,
  followCliView,
  writeCliFollow,
} from './view.js'

const socketPathFor = (name: string): string =>
  cliDaemonSocketPath({
    programId: 'cli-follow-test',
    isolationKey: `${name}-${Date.now().toString(36)}`,
  })

const settleMs = 10

const settled = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, settleMs)
  })

const unused = Effect.fail(new CliDaemonError({ message: 'unused' }))

const surfaceFollowing = (
  followed: NonNullable<CliDaemonSurface<unknown, never>['follow']>,
): CliDaemonSurface<unknown, never> => ({
  read: () => unused,
  run: () => unused,
  show: () => Effect.succeed({ stdout: 'shown', exitCode: 0 }),
  follow: followed,
})

const serving = <A>(
  socketPath: string,
  surface: CliDaemonSurface<unknown, never>,
  use: () => Promise<A>,
): Promise<A> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.andThen(
        startCliDaemonServer({
          socketPath,
          Model: S.Unknown,
          Message: S.Never,
          surface,
        }),
        Effect.promise(use),
      ),
    ),
  )

describe('following a CLI daemon', () => {
  it('sends each text the topic emits, then says it ended', async () => {
    const socketPath = socketPathFor('ends')
    const heard: Array<string> = []
    const end = await serving(
      socketPath,
      surfaceFollowing(() => Stream.make('first', 'second\nline')),
      () =>
        followCliView(socketPath, { topic: 'words' }, text => {
          heard.push(text)
        }),
    )
    expect(heard).toEqual(['first', 'second\nline'])
    expect(end).toEqual({ _tag: 'Ended' })
  })

  it('hears the topic, its flags, and the client that follows', async () => {
    const socketPath = socketPathFor('flags')
    const asked: Array<string> = []
    await serving(
      socketPath,
      surfaceFollowing((topic, flags, client) => {
        asked.push(`${topic} ${flags['json'] ?? ''} ${client._tag}`)
        return Stream.empty
      }),
      () =>
        followCliView(
          socketPath,
          { topic: 'words', flags: { json: '1' } },
          () => {},
        ),
    )
    expect(asked).toEqual(['words 1 Cli'])
  })

  it('answers other commands while a follow stays open, and stops the topic when the follower leaves', async () => {
    const socketPath = socketPathFor('open')
    const state = { isReleased: false }
    const leaving = new AbortController()
    const heard: Array<string> = []
    const result = await serving(
      socketPath,
      surfaceFollowing(() =>
        Stream.concat(Stream.make('now'), Stream.never).pipe(
          Stream.ensuring(
            Effect.sync(() => {
              state.isReleased = true
            }),
          ),
        ),
      ),
      async () => {
        const following = followCliView(
          socketPath,
          { topic: 'words' },
          text => {
            heard.push(text)
          },
          { signal: leaving.signal },
        )
        const shown = await askCliView(socketPath, { _tag: 'Show' })
        leaving.abort()
        const end = await following
        await settled()
        return { shown: shown.stdout, end }
      },
    )
    expect(heard).toEqual(['now'])
    expect(result).toEqual({ shown: 'shown', end: { _tag: 'Stopped' } })
    expect(state.isReleased).toBe(true)
  })

  it('says why when the topic cannot be followed', async () => {
    const socketPath = socketPathFor('refused')
    const end = await serving(
      socketPath,
      surfaceFollowing(() =>
        Stream.fail(new CliDaemonError({ message: 'Nothing to follow.' })),
      ),
      () => followCliView(socketPath, { topic: 'nothing' }, () => {}),
    )
    expect(end).toEqual({ _tag: 'Lost', reason: 'Nothing to follow.' })
  })
})

const eventually = async (isDone: () => boolean): Promise<void> => {
  const startedAt = Date.now()
  while (!isDone()) {
    if (Date.now() - startedAt > 4_000) {
      throw new Error('never happened')
    }
    await settled()
  }
}

const fakeRuntime = (
  screen: Partial<Omit<CliFollowRuntime['stdout'], 'write' | 'once'>> = {},
) => {
  const written = { stdout: '', stderr: '' }
  const runtime: CliFollowRuntime = {
    stdout: {
      write: text => {
        written.stdout = `${written.stdout}${text}`
        return true
      },
      once: () => undefined,
      ...screen,
    },
    stderr: {
      write: text => {
        written.stderr = `${written.stderr}${text}`
        return true
      },
    },
    once: () => undefined,
  }
  return { runtime, written }
}

describe('following to a pipe', () => {
  it('writes each text on its own lines and exits 0 when the topic ends', async () => {
    const socketPath = socketPathFor('pipe')
    const { runtime, written } = fakeRuntime()
    await serving(
      socketPath,
      surfaceFollowing(() => Stream.make('# one', '# two\n> line')),
      () =>
        writeCliFollow({ socketPath, request: { topic: 'words' } }, runtime),
    )
    expect(written.stdout).toBe('# one\n# two\n> line\n')
    expect(written.stderr).toBe('')
    expect(runtime.exitCode).toBe(0)
  })

  it('rewrites a topic in place on a terminal: each text over the last, as many rows as the last took', async () => {
    const socketPath = socketPathFor('in-place')
    const { runtime, written } = fakeRuntime()
    await serving(
      socketPath,
      surfaceFollowing(() =>
        Stream.make(
          '# one\n> The [keeper] climbed',
          '# one\n> The keeper [climbed]',
          '# two',
        ),
      ),
      () =>
        writeCliFollow(
          { socketPath, request: { topic: 'words' }, inPlace: true },
          runtime,
        ),
    )
    expect(written.stdout).toBe(
      [
        '# one\n> The [keeper] climbed\n',
        '\u001b[2A\r\u001b[J# one\n> The keeper [climbed]\n',
        '\u001b[2A\r\u001b[J# two\n',
      ].join(''),
    )
  })

  it('counts the rows a line wraps over, by what shows and not by its color codes', async () => {
    const socketPath = socketPathFor('in-place-wrap')
    const { runtime, written } = fakeRuntime({ columns: 10 })
    const inked = '\u001b[2m0123456789\u001b[22m'
    await serving(
      socketPath,
      surfaceFollowing(() => Stream.make(`${inked}\n0123456789ab`, 'next')),
      () =>
        writeCliFollow(
          { socketPath, request: { topic: 'words' }, inPlace: true },
          runtime,
        ),
    )
    expect(written.stdout).toBe(
      `${inked}\n0123456789ab\n\u001b[3A\r\u001b[Jnext\n`,
    )
  })

  it('tells the topic it rewrites in place, and its size as facts, and asks again with the new size when the terminal is resized', async () => {
    const socketPath = socketPathFor('in-place-size')
    const asked: Array<Record<string, string>> = []
    const resizing: Array<() => void> = []
    const { runtime } = fakeRuntime({
      columns: 60,
      rows: 20,
      on: (_event: 'resize', listener: () => void) => {
        resizing.push(listener)
      },
      off: () => undefined,
    })
    const screen = runtime.stdout as { columns?: number; rows?: number }
    await serving(
      socketPath,
      surfaceFollowing((_topic, flags) => {
        asked.push({ ...flags })
        return asked.length === 1
          ? Stream.concat(Stream.make('first'), Stream.never)
          : Stream.make('second')
      }),
      async () => {
        const following = writeCliFollow(
          { socketPath, request: { topic: 'words' }, inPlace: true },
          runtime,
        )
        await eventually(() => asked.length === 1)
        screen.columns = 100
        screen.rows = 30
        resizing.forEach(listener => {
          listener()
        })
        await following
      },
    )
    expect(asked).toEqual([
      { 'in-place': '1', columns: '60', rows: '20' },
      { 'in-place': '1', columns: '100', rows: '30' },
    ])
  })

  it('sends a pipe’s request as it was given, with no size', async () => {
    const socketPath = socketPathFor('pipe-no-size')
    const asked: Array<Record<string, string>> = []
    const { runtime } = fakeRuntime({ columns: 60, rows: 20 })
    await serving(
      socketPath,
      surfaceFollowing((_topic, flags) => {
        asked.push({ ...flags })
        return Stream.make('once')
      }),
      () =>
        writeCliFollow(
          { socketPath, request: { topic: 'words', flags: { json: '1' } } },
          runtime,
        ),
    )
    expect(asked).toEqual([{ json: '1' }])
  })

  it('says why on stderr and exits 1 when the topic is refused', async () => {
    const socketPath = socketPathFor('pipe-refused')
    const { runtime, written } = fakeRuntime()
    await serving(
      socketPath,
      surfaceFollowing(() =>
        Stream.fail(new CliDaemonError({ message: 'Nothing to follow.' })),
      ),
      () =>
        writeCliFollow({ socketPath, request: { topic: 'nothing' } }, runtime),
    )
    expect(written.stdout).toBe('')
    expect(written.stderr).toBe('Nothing to follow.\n')
    expect(runtime.exitCode).toBe(1)
  })
})

describe('following a reading of a bound Program', () => {
  it('emits the reading now, then each time it differs from the last', async () => {
    const bound = bindChapters()
    const heard = Effect.runPromise(
      Stream.runCollect(
        Stream.take(
          follow(bound, () => bound.readModel().playing),
          3,
        ),
      ),
    )
    await settled()
    bound.press('NextChapter')
    bound.send(Ticked())
    bound.press('NextChapter')
    expect(await heard).toEqual([1, 2, 3])
  })
})

describe('the topics every Program has', () => {
  it('follows the screen: the paint now, then each new paint', async () => {
    const bound = bindChapters()
    const surface = programCliSurface(bound, 'chapters')
    const paints = Effect.runPromise(
      Stream.runCollect(
        Stream.take(surface.follow?.('screen', {}, Cli()) ?? Stream.empty, 2),
      ),
    )
    await settled()
    bound.press('NextChapter')
    const [first = '', second = ''] = await paints
    expect(first).toContain('at /chapters')
    expect(first).toContain('Chapter 1 is playing')
    expect(second).toContain('Chapter 2 is playing')
  })

  it('refuses a topic it does not have, and names the ones it has', async () => {
    const refusal = await Effect.runPromise(
      Effect.flip(
        Stream.runCollect(
          followTopicOf({ screen: () => Stream.empty }, 'wrods', {}, Cli()),
        ),
      ),
    )
    expect(refusal.message).toBe(
      'Nothing here is called "wrods" to follow. Follow one of: screen.',
    )
  })

  it('follows the only topic there is when none is named', async () => {
    const heard = await Effect.runPromise(
      Stream.runCollect(
        followTopicOf({ screen: () => Stream.make('painted') }, '', {}, Cli()),
      ),
    )
    expect(heard).toEqual(['painted'])
  })

  it('asks which topic when none is named and there are several', async () => {
    const refusal = await Effect.runPromise(
      Effect.flip(
        Stream.runCollect(
          followTopicOf(
            { screen: () => Stream.empty, words: () => Stream.empty },
            '',
            {},
            Cli(),
          ),
        ),
      ),
    )
    expect(refusal.message).toBe(
      'Follow what? Name one of: screen, words. For example: follow screen',
    )
  })
})

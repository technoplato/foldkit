/// <reference types="node" />
import { Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { follow } from '../interaction/follow.js'
import { Cli } from '../processor/host.js'
import { Ticked, bindChapters } from '../test/apps/chapterContents.js'
import { startCliDaemonServer } from './listen.js'
import { cliDaemonSocketPath } from './paths.js'
import { CliDaemonError, type CliDaemonSurface } from './protocol.js'
import { followTopicOf, programCliSurface } from './surface.js'
import { askCliView, followCliView } from './view.js'

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
          Model: undefined as never,
          Message: undefined as never,
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
})

import { Array, Deferred, Effect, Option } from 'effect'
import { Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { makeMemorySnapshotLogTransport } from '../snapshotLog/memory.js'
import {
  InstantCountSnapshotRecord,
  InstantLogMessageRecord,
  countSnapshotId,
} from '../snapshotLog/snapshotLog.js'
import {
  fromTransport,
  instantLinksOf,
  instantRoomOf,
  isNamedShareInstantFrom,
  isOwnedInstantFrom,
  linkOfInstantStatus,
  messageBelongsToInstantRoom,
} from './fromTransport.js'
import {
  makeNodeInstantDatabase,
  stateDirectoryOf,
} from '../nodeDatabase/nodeDatabase.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const burstSize = 200

describe('fromTransport occupancy', () => {
  it('keeps device and path through write and read', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* makeMemorySnapshotLogTransport()
        const engine = fromTransport(transport, 'cli')
        yield* engine.write({
          message: InstantLogMessageRecord.make({
            createdAtMs: 1,
            from: 'cli',
            id: 'nav-1',
            tag: 'OpenedNavigation:{"device":"phone"}',
          }),
          snapshot: InstantCountSnapshotRecord.make({
            asOf: 'cli',
            at: 1,
            id: countSnapshotId,
            value: 0,
            device: 'phone',
            path: 'counter.increment',
          }),
        })
        const state = yield* engine.read()
        expect(state.snapshot).toEqual(
          expect.objectContaining({
            device: 'phone',
            path: 'counter.increment',
            value: 0,
          }),
        )
      }),
    )
  })
})

describe('fromTransport subscribe', () => {
  it('enqueues each Message once across a 200-write burst, not the triangular replay', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const transport = yield* makeMemorySnapshotLogTransport()
          const events: Array<Runtime.SyncEvent> = []
          const gotBurst = yield* Deferred.make<void>()
          const engine = fromTransport(transport, 'react')
          yield* engine.subscribe(event => {
            events.push(event)
            const messages = Array.filter(
              events,
              next => next._tag === 'Message',
            )
            if (messages.length === burstSize) {
              Effect.runFork(Deferred.succeed(gotBurst, undefined))
            }
          })

          for (const index of Array.range(1, burstSize)) {
            const id = `burst-${index.toString()}`
            yield* transport.write({
              message: InstantLogMessageRecord.make({
                createdAtMs: index,
                from: 'tui',
                id,
                tag: 'Increment',
              }),
              snapshot: InstantCountSnapshotRecord.make({
                asOf: id,
                at: index,
                id: countSnapshotId,
                value: index,
              }),
            })
          }

          yield* Deferred.await(gotBurst).pipe(Effect.timeout('2 seconds'))

          const messages = Array.filter(
            events,
            event => event._tag === 'Message',
          )
          expect(messages.length).toBe(burstSize)
          expect(messages.length).toBeLessThan(
            (burstSize * (burstSize + 1)) / 2,
          )
        }),
      ),
    )
  })
})

describe('messageBelongsToInstantRoom', () => {
  it('keeps public rows off owned rooms and owned rows off the public room', () => {
    expect(isOwnedInstantFrom('cli-mine-alice')).toBe(true)
    expect(isOwnedInstantFrom('cli')).toBe(false)
    expect(messageBelongsToInstantRoom('cli', 'tui')).toBe(true)
    expect(messageBelongsToInstantRoom('cli-mine-alice', 'tui')).toBe(false)
    expect(
      messageBelongsToInstantRoom('cli-mine-alice', 'tui-mine-alice'),
    ).toBe(true)
    expect(messageBelongsToInstantRoom('cli-mine-bob', 'tui-mine-alice')).toBe(
      false,
    )
  })

  it('keeps public rows off named-share rooms and share rows off public', () => {
    expect(isNamedShareInstantFrom('cli-share-kitchen')).toBe(true)
    expect(isNamedShareInstantFrom('cli')).toBe(false)
    expect(messageBelongsToInstantRoom('cli-share-kitchen', 'tui')).toBe(false)
    expect(
      messageBelongsToInstantRoom('cli-share-kitchen', 'tui-share-kitchen'),
    ).toBe(true)
    expect(
      messageBelongsToInstantRoom(
        'cli-share-kitchen-denied-carol',
        'tui-share-kitchen',
      ),
    ).toBe(false)
    expect(
      messageBelongsToInstantRoom(
        'cli-share-kitchen-denied-carol',
        'tui-share-kitchen-denied-carol',
      ),
    ).toBe(true)
    expect(
      messageBelongsToInstantRoom('cli-mine-alice', 'tui-share-kitchen'),
    ).toBe(false)
  })

  it('derives a stable room key stripped of random Processor instance suffixes', () => {
    expect(instantRoomOf('react-4f2a9c1e')).toBe('public')
    expect(instantRoomOf('cli')).toBe('public')
    expect(instantRoomOf('react-mine-alice')).toBe('mine-alice')
    expect(instantRoomOf('tui-mine-alice-deadbeef')).toBe('mine-alice-deadbeef')
    expect(instantRoomOf('cli-share-kitchen')).toBe('share-kitchen')
  })

  it('records stateDirectory on Node Instant databases and returns None for fakes', () => {
    expect(stateDirectoryOf({})).toEqual(Option.none())
    const dir = mkdtempSync(join(tmpdir(), 'foldkit-node-db-'))
    const database = makeNodeInstantDatabase(
      globalThis.crypto.randomUUID(),
      dir,
    )
    try {
      expect(stateDirectoryOf(database)).toEqual(Option.some(dir))
    } finally {
      database.shutdown()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// NOTE: The store's own word for its connection is what a device's trace
// says of its link, so "was the phone connected when the terminal wrote"
// is read from the phone's file.
describe('an Instant engine’s link', () => {
  it('reads each of the store’s connection words as where the link stands', () => {
    expect(
      Array.map(
        ['connecting', 'opened', 'authenticated', 'closed', 'errored'],
        linkOfInstantStatus,
      ),
    ).toEqual(
      Array.map(
        ['Connecting', 'Connected', 'SignedIn', 'Offline', 'Offline'],
        Option.some,
      ),
    )
    expect(linkOfInstantStatus('something-new')).toEqual(Option.none())
  })

  it('tells its link as the store says it, each change once, until its scope closes', async () => {
    const listeners = new Set<(status: string) => void>()
    const database = {
      subscribeConnectionStatus: (listener: (status: string) => void) => {
        listeners.add(listener)
        listener('connecting')
        return () => {
          listeners.delete(listener)
        }
      },
    }
    const said = (status: string): void => {
      for (const listener of listeners) {
        listener(status)
      }
    }
    const heard: Array<Runtime.SyncLinkState> = []
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const transport = yield* makeMemorySnapshotLogTransport()
          const engine = fromTransport(
            transport,
            'cli',
            instantLinksOf(database),
          )
          yield* engine.links?.(link => heard.push(link)) ?? Effect.void
          said('opened')
          said('authenticated')
          said('authenticated')
          said('closed')
          said('opened')
          expect(listeners.size).toBe(1)
        }),
      ),
    )
    expect(heard).toEqual([
      'Connecting',
      'Connected',
      'SignedIn',
      'Offline',
      'Connected',
    ])
    expect(listeners.size).toBe(0)
  })

  it('has no link to tell when it was given no store to ask', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* makeMemorySnapshotLogTransport()
        expect(fromTransport(transport, 'cli').links).toBeUndefined()
      }),
    )
  })
})

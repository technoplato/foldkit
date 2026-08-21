import { Array, Deferred, Effect } from 'effect'
import { Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { makeMemorySnapshotLogTransport } from '../snapshotLog/memory.js'
import {
  InstantCountSnapshotRecord,
  InstantLogMessageRecord,
  countSnapshotId,
} from '../snapshotLog/snapshotLog.js'
import { fromTransport } from './fromTransport.js'

const burstSize = 200

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

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { InstantLogMessageRecord } from '@foldkit/instant'

import {
  makeMemoryPuzzleSnapshotLogTransport,
  makeMemorySnapshotLogTransport,
} from './instantMemory.js'
import { emptyPuzzleSnapshotLogState } from './instantSchema.js'
import { emptyModel } from './model.js'
import { TAPE_UUID, TapeRow } from './wire.js'

const emptyTapeRow = (): TapeRow =>
  TapeRow.make({
    id: TAPE_UUID,
    asOf: 'foldkit',
    at: 1,
    steps: [],
    prompt: emptyModel().prompt,
  })

const testMessage = InstantLogMessageRecord.make({
  createdAtMs: 1,
  from: 'test',
  id: '11111111-1111-4111-8111-111111111111',
  tag: 'ResetTape',
})

describe('makeMemoryPuzzleSnapshotLogTransport', () => {
  it('starts empty and stores a tape snapshot', async () => {
    const transport = await Effect.runPromise(
      makeMemoryPuzzleSnapshotLogTransport(),
    )
    const before = await Effect.runPromise(transport.read())
    expect(before).toEqual(emptyPuzzleSnapshotLogState)

    await Effect.runPromise(
      transport.write({
        message: testMessage,
        snapshot: emptyTapeRow(),
      }),
    )
    const after = await Effect.runPromise(transport.read())
    expect(after.snapshot?.steps).toEqual([])
    expect(after.messages).toEqual([testMessage])
  })

  it('aliases the Counter-shaped factory', () => {
    expect(makeMemorySnapshotLogTransport).toBe(
      makeMemoryPuzzleSnapshotLogTransport,
    )
  })
})

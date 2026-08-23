import { Effect } from 'effect'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { InstantLogMessageRecord } from '@foldkit/instant'

import { makeFilePuzzleSnapshotLogTransport } from './instantFile.js'
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

describe('makeFilePuzzleSnapshotLogTransport', () => {
  it('starts empty and stores a tape snapshot on disk', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'puzzle-file-tape-'))
    const path = join(directory, 'tape.json')
    try {
      const transport = makeFilePuzzleSnapshotLogTransport(path)
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
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })
})

import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  FoldkitPuzzleV01,
  InstantPuzzleSnapshotLogEntities,
  decodeTapeRow,
  emptyInstantPuzzleSnapshot,
} from './instantSchema.js'
import { emptyModel } from './model.js'
import { defaultReplicateStep } from './replicate.js'
import { TAPE_UUID, TapeProjection } from './wire.js'

describe('Instant Puzzle snapshot schema', () => {
  it('has tape and message entities, not count', () => {
    expect(Object.keys(InstantPuzzleSnapshotLogEntities).sort()).toEqual([
      'message',
      'tape',
    ])
    expect(FoldkitPuzzleV01.id).not.toBe('5417c2e3-c6b9-476d-a962-2e11c83492aa')
  })

  it('decodes a tape ADT row and refuses a count row', () => {
    const prompt = defaultReplicateStep()
    const decoded = decodeTapeRow({
      id: TAPE_UUID,
      asOf: 'foldkit',
      at: 1,
      steps: [],
      prompt,
    })
    expect(Option.isSome(decoded)).toBe(true)
    if (Option.isSome(decoded)) {
      expect(decoded.value.prompt._tag).toBe('ReplicateStep')
    }
    expect(
      Option.isNone(
        decodeTapeRow({
          id: 'c0a7c001-0000-4000-8000-000000000001',
          asOf: '',
          at: 0,
          value: 0,
        }),
      ),
    ).toBe(true)
  })

  it('decodes empty Instant snapshot to emptyModel, not demoModel', () => {
    const decoded = S.decodeSync(TapeProjection)(emptyInstantPuzzleSnapshot)
    expect(decoded.product).toEqual(emptyModel())
    expect(emptyInstantPuzzleSnapshot.id).toBe(TAPE_UUID)
    expect(emptyInstantPuzzleSnapshot.asOf).toBe('')
    expect(emptyInstantPuzzleSnapshot.at).toBe(0)
  })
})

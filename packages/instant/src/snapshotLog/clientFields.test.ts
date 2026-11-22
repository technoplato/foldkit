import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  decodeProgramMessageRow,
  programMessageFieldsOf,
} from '../programLog/programLog.js'
import { InstantLogMessageRecord, clientFieldsOf } from './snapshotLog.js'

const record = InstantLogMessageRecord.make({
  id: 'row-1',
  from: 'cli-4f2a9c1e',
  createdAtMs: 1_795_400_000_000,
  tag: 'Increment:{"counterId":17}',
  programVersion: 1,
  client: 'tui',
  terminal: 'Ghostty',
})

describe('what a row says about the Client that sent its Message', () => {
  it('keeps only the fields a row holds', () => {
    expect(
      clientFieldsOf({
        client: 'tui',
        browser: null,
        windowLabel: '',
        tag: 'x',
      }),
    ).toEqual({ client: 'tui' })
    expect(clientFieldsOf({ tag: 'x' })).toEqual({})
  })

  it('survives the runtime handing a row to the engine', () => {
    expect(
      S.decodeUnknownSync(InstantLogMessageRecord)({
        ...record,
        userEmail: 'left out',
      }),
    ).toEqual(record)
  })

  it('is written to the shared program log, and read back from it', () => {
    const fields = programMessageFieldsOf('multiple-counters', record)
    expect(fields).toMatchObject({
      app: 'multiple-counters',
      tag: 'Increment',
      client: 'tui',
      terminal: 'Ghostty',
    })
    expect(
      decodeProgramMessageRow('multiple-counters')({ id: 'row-1', ...fields }),
    ).toEqual(record)
  })

  it('reads a row from before the fields were kept, and one Instant filled with nulls', () => {
    const { client: _client, terminal: _terminal, ...older } = record
    const fields = programMessageFieldsOf('multiple-counters', older)
    const read = decodeProgramMessageRow('multiple-counters')({
      id: 'row-1',
      ...fields,
      client: null,
      terminal: null,
    })
    expect(read.client).toBeUndefined()
    expect(read.terminal).toBeUndefined()
  })
})

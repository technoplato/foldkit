import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { applyAdminSubscribePayload } from '../snapshotLog/admin.js'
import { snapshotLogMessageWire } from '../snapshotLog/messageWire.js'
import {
  decodeProgramLogState,
  programLogEnvelope,
  programLogPageQuery,
  programMessageFieldsOf,
} from './programLog.js'

const Decrement = S.TaggedStruct('Decrement', { counterId: S.Int })
const AddCounter = S.TaggedStruct('AddCounter', {})
const Message = S.Union([Decrement, AddCounter])
const MessageWire = snapshotLogMessageWire(Message)

const row = {
  id: 'r1',
  app: 'multiple-counters',
  programVersion: 1,
  tag: 'Decrement',
  payload: { counterId: 2 },
  from: 'react-4f2a9c1e',
  createdAtMs: 1000,
}

describe('programLogEnvelope', () => {
  it('reads one app row as a log record its Message Schema accepts', () => {
    const record = S.decodeUnknownSync(programLogEnvelope('multiple-counters'))(
      row,
    )
    expect(record).toEqual({
      id: 'r1',
      from: 'react-4f2a9c1e',
      createdAtMs: 1000,
      tag: 'Decrement:{"counterId":2}',
      programVersion: 1,
    })
    expect(S.decodeUnknownSync(MessageWire)(record)).toEqual({
      _tag: 'Decrement',
      counterId: 2,
    })
  })

  it('refuses a row another app wrote', () => {
    expect(() =>
      S.decodeUnknownSync(programLogEnvelope('counter'))(row),
    ).toThrow()
  })

  it('refuses a row without a Program version or with a payload that is not an object', () => {
    const envelope = programLogEnvelope('multiple-counters')
    const { programVersion: _version, ...withoutVersion } = row
    expect(() => S.decodeUnknownSync(envelope)(withoutVersion)).toThrow()
    expect(() =>
      S.decodeUnknownSync(envelope)({ ...row, payload: 'counterId=2' }),
    ).toThrow()
  })

  it('writes a record back as tag, payload, app, and version', () => {
    expect(
      programMessageFieldsOf('multiple-counters', {
        id: 'r2',
        from: 'cli-1',
        createdAtMs: 2000,
        tag: 'AddCounter',
        programVersion: 1,
      }),
    ).toEqual({
      app: 'multiple-counters',
      programVersion: 1,
      tag: 'AddCounter',
      payload: {},
      from: 'cli-1',
      createdAtMs: 2000,
    })
  })
})

describe('program log queries', () => {
  it('reads only one app, in the order Instant received its rows', () => {
    expect(programLogPageQuery('multiple-counters', 40)).toEqual({
      programMessage: {
        $: {
          where: { app: 'multiple-counters' },
          limit: 5000,
          offset: 40,
          order: { serverCreatedAt: 'asc' },
        },
      },
    })
    expect(
      decodeProgramLogState('multiple-counters')({
        programMessage: [
          { ...row, id: 'b', createdAtMs: 2 },
          { ...row, id: 'a', createdAtMs: 1 },
        ],
      }).messages.map(message => message.id),
    ).toEqual(['a', 'b'])
  })
})

describe('admin pushes', () => {
  it('keep the program log rows a subscription returns', () => {
    const states: Array<ReadonlyArray<string>> = []
    applyAdminSubscribePayload(
      { data: { programMessage: [row] } },
      decodeProgramLogState('multiple-counters'),
      state => {
        states.push(state.messages.map(message => message.id))
      },
      () => {},
    )
    expect(states).toEqual([['r1']])
  })
})

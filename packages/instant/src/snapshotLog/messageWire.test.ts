import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  encodedOfTagColumn,
  snapshotLogMessageWire,
  tagColumnOf,
} from './messageWire.js'

const Increment = S.TaggedStruct('Increment', {})
const ChangedQuery = S.TaggedStruct('ChangedQuery', { query: S.String })
const Message = S.Union([Increment, ChangedQuery])
const Wire = snapshotLogMessageWire(Message)

const row = (tag: string) => ({ id: 'm1', tag, from: 'laptop', createdAtMs: 1 })

describe('tagColumnOf', () => {
  it('prints payload-free Messages as their bare tag', () => {
    expect(tagColumnOf({ _tag: 'Increment' })).toBe('Increment')
  })

  it('appends fields as JSON', () => {
    expect(tagColumnOf({ _tag: 'ChangedQuery', query: 're' })).toBe(
      'ChangedQuery:{"query":"re"}',
    )
  })
})

describe('encodedOfTagColumn', () => {
  it('reads bare tags and JSON payloads', () => {
    expect(encodedOfTagColumn('Increment')).toEqual(
      Option.some({ _tag: 'Increment' }),
    )
    expect(encodedOfTagColumn('ChangedQuery:{"query":"re"}')).toEqual(
      Option.some({ _tag: 'ChangedQuery', query: 're' }),
    )
  })

  it('refuses a payload that is not a JSON object', () => {
    expect(encodedOfTagColumn('ChangedQuery:not json')).toEqual(Option.none())
    expect(encodedOfTagColumn('ChangedQuery:[1]')).toEqual(Option.none())
  })
})

describe('snapshotLogMessageWire', () => {
  it('round-trips Messages through the tag column', () => {
    const encoded = S.encodeSync(Wire)(ChangedQuery.make({ query: 'rst' }))
    expect(encoded.tag).toBe('ChangedQuery:{"query":"rst"}')
    expect(S.decodeUnknownSync(Wire)(row(encoded.tag))).toEqual({
      _tag: 'ChangedQuery',
      query: 'rst',
    })
  })

  it('fails closed on unknown tags instead of guessing', () => {
    expect(S.decodeUnknownOption(Wire)(row('SharedNamedCounter'))).toEqual(
      Option.none(),
    )
    expect(S.decodeUnknownOption(Wire)(row('ChangedQuery:{}'))).toEqual(
      Option.none(),
    )
  })
})

import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { type LogRowOrder, isRowOrderAfter } from './syncEngine.js'
import { maxRowOrder } from './syncEngine.js'
import { rowOrderOf } from './syncEngine.js'

const row = (fields: {
  readonly createdAtMs: number
  readonly id: string
  readonly from?: string
  readonly seq?: number
}): unknown => ({ ...fields })

const orderOf = (row: unknown): LogRowOrder =>
  Option.getOrThrow(rowOrderOf(row))

describe('rowOrderOf', () => {
  it('reads actor and seq stamps when present', () => {
    expect(orderOf(row({ createdAtMs: 5, id: 'a', from: 'cli', seq: 3 }))).toEqual({
      createdAtMs: 5,
      id: 'a',
      from: 'cli',
      seq: 3,
    })
  })

  it('returns None for rows missing the log position', () => {
    expect(Option.isNone(rowOrderOf({ id: 'a' }))).toBe(true)
  })

  it('omits stamps on legacy rows', () => {
    expect(orderOf(row({ createdAtMs: 1, id: 'legacy' }))).toEqual({
      createdAtMs: 1,
      id: 'legacy',
    })
  })
})

describe('isRowOrderAfter', () => {
  it('same actor, same millisecond: seq decides, not the UUID', () => {
    // Write order was increment then reset; UUIDs sort the other way.
    const increment = orderOf(
      row({ createdAtMs: 10, id: 'aaa', from: 'cli', seq: 0 }),
    )
    const reset = orderOf(
      row({ createdAtMs: 10, id: 'zzz', from: 'cli', seq: 1 }),
    )
    expect(isRowOrderAfter(reset, increment)).toBe(true)
    expect(isRowOrderAfter(increment, reset)).toBe(false)
  })

  it('cross-actor same-millisecond ties stay deterministic by actor', () => {
    const fromCli = orderOf(
      row({ createdAtMs: 10, id: 'aaa', from: 'cli', seq: 9 }),
    )
    const fromReact = orderOf(
      row({ createdAtMs: 10, id: 'zzz', from: 'react', seq: 2 }),
    )
    expect(isRowOrderAfter(fromReact, fromCli)).toBe(true)
    expect(isRowOrderAfter(fromCli, fromReact)).toBe(false)
  })

  it('millisecond always dominates stamps and UUIDs', () => {
    const early = orderOf(
      row({ createdAtMs: 9, id: '\u{10FFFF}', from: '\u{10FFFF}', seq: 99 }),
    )
    const late = orderOf(row({ createdAtMs: 10, id: 'a', from: 'a', seq: 0 }))
    expect(isRowOrderAfter(late, early)).toBe(true)
  })

  it('legacy rows without stamps keep the old ms-then-id order', () => {
    const legacyA = orderOf(row({ createdAtMs: 10, id: 'aaa' }))
    const legacyB = orderOf(row({ createdAtMs: 10, id: 'zzz' }))
    expect(isRowOrderAfter(legacyB, legacyA)).toBe(true)
  })
})

describe('maxRowOrder', () => {
  it('picks the causally newest row, not the lexicographically biggest id', () => {
    const newest = maxRowOrder([
      row({ createdAtMs: 10, id: 'zzz', from: 'cli', seq: 0 }),
      row({ createdAtMs: 10, id: 'aaa', from: 'cli', seq: 4 }),
    ])
    expect(newest).toMatchObject({ value: { id: 'aaa', seq: 4 } })
  })
})

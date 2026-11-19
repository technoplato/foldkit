import { Effect, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  appliedRowChanges,
  changedRows,
  hasRowChanges,
  rowChangesBetween,
} from './rows.js'

// NOTE: A store that follows a live list hands the whole list over each
// time one row of it changes. What a Client needs is the change: the rows
// that are new or different, and the keys of the ones that are gone.

type Place = Readonly<{
  slug: string
  placeMs: number
  maybeNote: Option.Option<string>
}>

const place = (slug: string, placeMs: number, note?: string): Place => ({
  slug,
  placeMs,
  maybeNote: Option.fromNullishOr(note),
})

const keyOf = (row: Place): string => row.slug

describe('what changed between two lists of rows', () => {
  it('is nothing when every row reads the same, though each is another object', () => {
    const changes = rowChangesBetween(
      [place('a', 1), place('b', 2, 'note')],
      [place('a', 1), place('b', 2, 'note')],
      keyOf,
    )
    expect(changes).toEqual({ changed: [], removed: [] })
    expect(hasRowChanges(changes)).toBe(false)
  })

  it('is the one row whose place moved, not the list it is in', () => {
    const changes = rowChangesBetween(
      [place('a', 1), place('b', 2), place('c', 3)],
      [place('a', 1), place('b', 20), place('c', 3)],
      keyOf,
    )
    expect(changes).toEqual({ changed: [place('b', 20)], removed: [] })
    expect(hasRowChanges(changes)).toBe(true)
  })

  it('names a new row as changed and a missing one as removed, by its key', () => {
    expect(
      rowChangesBetween(
        [place('a', 1), place('b', 2)],
        [place('b', 2), place('c', 3)],
        keyOf,
      ),
    ).toEqual({ changed: [place('c', 3)], removed: ['a'] })
  })

  it('takes the Client’s own way of telling two rows apart', () => {
    expect(
      rowChangesBetween(
        [place('a', 1, 'old')],
        [place('a', 1, 'new')],
        keyOf,
        (self, that) => self.placeMs === that.placeMs,
      ),
    ).toEqual({ changed: [], removed: [] })
  })
})

describe('a list with its changes applied', () => {
  const rows = [place('a', 1), place('b', 2), place('c', 3)]

  it('is the very same list when nothing changed', () => {
    expect(appliedRowChanges(rows, { changed: [], removed: [] }, keyOf)).toBe(
      rows,
    )
  })

  it('keeps each row’s place in the list, puts new rows last, and drops the removed', () => {
    expect(
      appliedRowChanges(
        rows,
        { changed: [place('b', 20), place('d', 4)], removed: ['a'] },
        keyOf,
      ),
    ).toEqual([place('b', 20), place('c', 3), place('d', 4)])
  })

  it('leaves the rows that did not change as the same objects', () => {
    const applied = appliedRowChanges(
      rows,
      { changed: [place('b', 20)], removed: [] },
      keyOf,
    )
    expect(applied[0]).toBe(rows[0])
    expect(applied[2]).toBe(rows[2])
  })

  it('brings one list to the other', () => {
    const next = [place('c', 30), place('d', 4)]
    expect(
      appliedRowChanges(rows, rowChangesBetween(rows, next, keyOf), keyOf),
    ).toEqual(next)
  })
})

describe('a stream of whole lists, as what changed in each', () => {
  it('sends every row of the first list, then only what changed, and nothing for a list that reads the same', async () => {
    const sent = await Effect.runPromise(
      Stream.runCollect(
        changedRows(
          Stream.make(
            [place('a', 1), place('b', 2)],
            [place('a', 1), place('b', 2)],
            [place('a', 1), place('b', 20)],
            [place('b', 20)],
          ),
          keyOf,
        ),
      ),
    )
    expect([...sent]).toEqual([
      { changed: [place('a', 1), place('b', 2)], removed: [] },
      { changed: [place('b', 20)], removed: [] },
      { changed: [], removed: ['a'] },
    ])
  })

  it('sends an empty first list, so a Client knows there are no rows', async () => {
    const sent = await Effect.runPromise(
      Stream.runCollect(changedRows(Stream.make([] as Array<Place>), keyOf)),
    )
    expect([...sent]).toEqual([{ changed: [], removed: [] }])
  })
})

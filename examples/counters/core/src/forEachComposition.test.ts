import * as Counter from 'counter-core-example'
import { Array, Option } from 'effect'
import { Program } from 'foldkit'
import { describe, expect, it } from 'vitest'

const CounterRows = Program.compose.forEach({
  of: Counter.CounterProgram,
})

type RowsModel = typeof CounterRows.Model.Type
type RowsMessage = Parameters<typeof CounterRows.update>[1]

const send = (model: RowsModel, message: RowsMessage): RowsModel =>
  CounterRows.update(model, message)[0]

const countOf = (model: RowsModel, id: string): Option.Option<number> =>
  Option.map(
    Array.findFirst(model.rows, row => row.id === id),
    row => row.child.count,
  )

describe('compose.forEach over the imported Counter Program', () => {
  it('adds identified rows, each starting the real counter core', () => {
    const [empty] = CounterRows.init()
    const one = send(empty, CounterRows.addRow)
    const two = send(one, CounterRows.addRow)

    expect(two.nextId).toBe(2)
    expect(two.rows.map(row => row.id)).toEqual(['0', '1'])
    expect(countOf(two, '0')).toEqual(Option.some(Counter.initialCount))
    expect(countOf(two, '1')).toEqual(Option.some(Counter.initialCount))
  })

  it('routes child Messages by identity', () => {
    const [empty] = CounterRows.init()
    const seeded = send(send(empty, CounterRows.addRow), CounterRows.addRow)

    const bumped = send(
      seeded,
      CounterRows.childMessage('1', Counter.Increment()),
    )

    expect(countOf(bumped, '0')).toEqual(Option.some(Counter.initialCount))
    expect(countOf(bumped, '1')).toEqual(Option.some(Counter.initialCount + 1))
  })

  it('removes one row while preserving the rest', () => {
    const [empty] = CounterRows.init()
    const seeded = send(
      send(send(empty, CounterRows.addRow), CounterRows.addRow),
      CounterRows.childMessage('1', Counter.Increment()),
    )

    const removed = send(seeded, CounterRows.removeRow('0'))

    expect(removed.rows.map(row => row.id)).toEqual(['1'])
    expect(countOf(removed, '1')).toEqual(Option.some(Counter.initialCount + 1))
  })

  it('ignores child Messages for retired identities', () => {
    const [empty] = CounterRows.init()
    expect(send(empty, CounterRows.childMessage('9', Counter.Reset()))).toEqual(
      empty,
    )
  })

  it('wraps child Messages into the parent vocabulary', () => {
    expect(CounterRows.childMessage('1', Counter.Decrement())).toEqual({
      _tag: 'GotChild',
      id: '1',
      message: { _tag: 'Decrement' },
    })
  })
})

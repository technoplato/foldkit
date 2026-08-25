import { Effect, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { m } from '../message/public.js'
import { compose, forEach, ForEachReservedFieldError } from './compose.js'
import { make } from './program.js'

const ClickedIncrement = m('ClickedIncrement')
const ClickedDecrement = m('ClickedDecrement')
const CounterMessage = S.Union([ClickedIncrement, ClickedDecrement])
type CounterMessage = typeof CounterMessage.Type

const CounterModel = S.Struct({ count: S.Number })
type CounterModel = typeof CounterModel.Type

const Counter = make({
  id: 'test-counter',
  version: 1,
  Model: CounterModel,
  Message: CounterMessage,
  init: () => [{ count: 0 }, []],
  update: (model, message) => {
    switch (message._tag) {
      case 'ClickedIncrement':
        return [{ count: model.count + 1 }, []]
      case 'ClickedDecrement':
        return [{ count: model.count - 1 }, []]
      default:
        return [model, []]
    }
  },
})

const PressedClear = m('PressedClear')
const PressedPlus = m('PressedPlus')
const CalcMessage = S.Union([PressedClear, PressedPlus])
type CalcMessage = typeof CalcMessage.Type

const CalcModel = S.Struct({ display: S.String })
type CalcModel = typeof CalcModel.Type

const Calculator = make({
  id: 'test-calculator',
  version: 1,
  Model: CalcModel,
  Message: CalcMessage,
  init: () => [{ display: '0' }, []],
  update: (model, message) => {
    switch (message._tag) {
      case 'PressedClear':
        return [{ display: '0' }, []]
      case 'PressedPlus':
        return [{ display: model.display + '+' }, []]
      default:
        return [model, []]
    }
  },
})

describe('Program.compose', () => {
  it('derives Model, Message, init, and update from children', () => {
    const Showcase = compose(
      {
        single: Counter,
        calc: Calculator,
      },
      { id: 'test-showcase' },
    )

    expect(Showcase.id).toBe('test-showcase')
    expect(Showcase.keys).toEqual(['single', 'calc'])

    const [model, initCommands] = Showcase.init()
    expect(initCommands).toEqual([])
    expect(model.single.count).toBe(0)
    expect(model.calc.display).toBe('0')

    const [afterInc] = Showcase.update(
      model,
      Showcase.message.single(ClickedIncrement()),
    )
    expect(afterInc.single.count).toBe(1)
    expect(afterInc.calc.display).toBe('0')

    const [afterPlus] = Showcase.update(
      afterInc,
      Showcase.message.calc(PressedPlus()),
    )
    expect(afterPlus.single.count).toBe(1)
    expect(afterPlus.calc.display).toBe('0+')
  })

  it('nests composed Programs as children', () => {
    const Demos = compose({ single: Counter, calc: Calculator })
    const Shell = compose({ demos: Demos }, { id: 'shell' })

    const [model] = Shell.init()
    expect(model.demos.single.count).toBe(0)

    const [next] = Shell.update(
      model,
      Shell.message.demos(Demos.message.single(ClickedIncrement())),
    )
    expect(next.demos.single.count).toBe(1)
  })

  it('forEach adds rows and routes GotChild', () => {
    const List = forEach({ of: Counter, initialCount: 1, id: 'counter-list' })

    const [model] = List.init()
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0]?.child.count).toBe(0)

    const id = model.rows[0]!.id
    const [afterInc] = List.update(
      model,
      List.childMessage(id, ClickedIncrement()),
    )
    expect(afterInc.rows[0]?.child.count).toBe(1)

    const [afterAdd] = List.update(afterInc, List.addRow)
    expect(afterAdd.rows).toHaveLength(2)

    const [afterRemove] = List.update(afterAdd, List.removeRow(id))
    expect(afterRemove.rows).toHaveLength(1)
    expect(afterRemove.rows[0]?.id).not.toBe(id)
  })
})

const ClickedSortAscending = m('ClickedSortAscending')
const ClickedSortDescending = m('ClickedSortDescending')
const SortOrder = S.Union([ClickedSortAscending, ClickedSortDescending])
type SortOrder = typeof SortOrder.Type

describe('Program.compose.forEach fields', () => {
  const makeSortedList = () =>
    forEach({
      of: Counter,
      id: 'sorted-counter-list',
      fields: { sortOrder: SortOrder },
      initialFields: { sortOrder: ClickedSortAscending() },
      messages: [SortOrder],
      updateFields: (model, message) => {
        if (message._tag === 'ClickedSortDescending') {
          return [
            { ...model, sortOrder: ClickedSortDescending() },
            [
              {
                name: 'SortedRows',
                effect: Effect.succeed(ClickedSortAscending()),
              },
            ],
          ]
        }
        if (message._tag === 'ClickedSortAscending') {
          return [{ ...model, sortOrder: ClickedSortAscending() }, []]
        }
        return [model, []]
      },
    })

  it('composes field schemas beside nextId and rows', () => {
    const SortedList = makeSortedList()
    const fields = (SortedList.Model as unknown as {
      readonly fields: Record<string, unknown>
    }).fields
    expect(Object.keys(fields)).toEqual(['sortOrder', 'nextId', 'rows'])
  })

  it('preserves sibling fields across row updates', () => {
    const SortedList = makeSortedList()
    const [model] = SortedList.init()
    expect(model.sortOrder).toEqual(ClickedSortAscending())

    const [afterAdd] = SortedList.update(model, SortedList.addRow)
    expect(afterAdd.rows.map(row => row.id)).toEqual([String(model.nextId)])
    expect(afterAdd.sortOrder).toEqual(ClickedSortAscending())
    expect(afterAdd.nextId).toBe(1)

    const [afterRemove] = SortedList.update(
      afterAdd,
      SortedList.removeRow(String(model.nextId)),
    )
    expect(afterRemove.rows).toHaveLength(0)
    expect(afterRemove.sortOrder).toEqual(ClickedSortAscending())
  })

  it('routes field-owner Messages through updateFields and passes Commands through', () => {
    const SortedList = makeSortedList()
    const [model] = SortedList.init()

    const decoded = S.decodeUnknownSync(SortedList.Message)({
      _tag: 'ClickedSortDescending',
    })
    const [descended, commands] = SortedList.update(model, decoded)
    expect(descended.sortOrder).toEqual(ClickedSortDescending())
    expect(commands).toEqual([{ name: 'SortedRows', effect: expect.anything() }])

    const [ascended] = SortedList.update(descended, ClickedSortAscending())
    expect(ascended.sortOrder).toEqual(ClickedSortAscending())
    expect(ascended.rows).toHaveLength(0)
  })

  it('throws a tagged error when fields declare reserved keys', () => {
    try {
      forEach({
        of: Counter,
        fields: { rows: S.Number },
        initialFields: { rows: 0 },
      })
      expect.unreachable('expected ForEachReservedFieldError for rows')
    } catch (error) {
      expect((error as { readonly _tag: string })._tag).toBe(
        'ForEachReservedFieldError',
      )
    }

    expect(() =>
      forEach({
        of: Counter,
        fields: { nextId: S.String },
        initialFields: { nextId: '' },
      }),
    ).toThrowError(ForEachReservedFieldError)
  })

  it('round trips the composed Model through encode and decode', () => {
    const SortedList = makeSortedList()
    const [model] = SortedList.init()
    const [afterAdd] = SortedList.update(model, SortedList.addRow)
    const [descended] = SortedList.update(afterAdd, ClickedSortDescending())

    const encoded = S.encodeSync(SortedList.Model)(descended)
    const decoded = S.decodeSync(SortedList.Model)(encoded)

    expect(decoded).toEqual(descended)
    expect(decoded.sortOrder).toEqual(ClickedSortDescending())
    expect(decoded.rows.map(row => row.child)).toEqual(
      descended.rows.map(row => row.child),
    )
  })
})

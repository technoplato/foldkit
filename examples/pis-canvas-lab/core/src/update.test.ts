import * as Calculator from 'calculator-core-example'
import * as Counter from 'counter-core-example'
import * as Counters from 'counters-core-example'
import { describe, expect, it } from 'vitest'

import { CounterListProgram, DemoCatalog, ShowcaseShell } from './catalog.js'
import { init } from './init.js'
import {
  CanvasChanged,
  GotCalculatorMessage,
  GotMultiCountersMessage,
  GotSingleCounterMessage,
  ToggledShowSingle,
} from './message.js'
import { update } from './update.js'

describe('PisCanvasLab composed catalog', () => {
  it('delegates single counter increment via compose', () => {
    const [model] = init()
    const [next, commands] = update(
      model,
      GotSingleCounterMessage({ message: Counter.ClickedIncrement() }),
    )
    expect(next.demos.single.count).toBe(1)
    expect(next.chrome.scale).toBe(model.chrome.scale)
    expect(commands).toEqual([])
  })

  it('updates chrome without touching product models', () => {
    const [model] = init()
    const [next] = update(model, CanvasChanged({ x: 10, y: 20, scale: 1 }))
    expect(next.chrome.x).toBe(10)
    expect(next.chrome.y).toBe(20)
    expect(next.chrome.scale).toBe(1)
    expect(next.demos.single.count).toBe(model.demos.single.count)
    expect(next.demos.multi.rows.length).toBe(model.demos.multi.rows.length)
  })

  it('toggles domain visibility (map chrome)', () => {
    const [model] = init()
    expect(model.chrome.showSingle).toBe(true)
    const [next] = update(model, ToggledShowSingle())
    expect(next.chrome.showSingle).toBe(false)
  })

  it('delegates multi-counter child Messages', () => {
    const [model] = init()
    const firstId = model.demos.multi.rows[0]!.id
    const [next] = update(
      model,
      GotMultiCountersMessage({
        message: Counters.GotCounterMessage({
          counterId: firstId,
          message: Counter.ClickedIncrement(),
        }),
      }),
    )
    const row = next.demos.multi.rows.find(r => r.id === firstId)
    expect(row?.counter.count).toBe(1)
    expect(next.demos.single.count).toBe(0)
  })

  it('delegates calculator Messages from the catalog', () => {
    const [model] = init()
    const [next] = update(
      model,
      GotCalculatorMessage({
        message: Calculator.PressedDigit({ digit: 'Seven' }),
      }),
    )
    // Calculator display changes; exact string depends on core, but model moves.
    expect(next.demos.calc).not.toEqual(model.demos.calc)
  })

  it('uses derived helpers without Got* names', () => {
    const [model] = init()
    const [next] = ShowcaseShell.update(
      model,
      ShowcaseShell.message.demos(
        DemoCatalog.message.single(Counter.ClickedIncrement()),
      ),
    )
    expect(next.demos.single.count).toBe(1)
  })

  it('forEach list rows increment via compose.forEach', () => {
    const [model] = init()
    expect(model.demos.list.rows.length).toBe(2)
    const rowId = model.demos.list.rows[0]!.id
    const [next] = ShowcaseShell.update(
      model,
      ShowcaseShell.message.demos(
        DemoCatalog.message.list(
          CounterListProgram.childMessage(rowId, Counter.ClickedIncrement()),
        ),
      ),
    )
    expect(next.demos.list.rows[0]?.child.count).toBe(1)
  })
})

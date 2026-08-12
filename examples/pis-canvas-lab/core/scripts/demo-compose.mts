/**
 * Live demo: Program.compose catalog works end-to-end (no browser).
 * Run from this package: pnpm exec tsx scripts/demo-compose.mts
 */
import * as Calculator from 'calculator-core-example'
import * as Counter from 'counter-core-example'
import * as Counters from 'counters-core-example'

import {
  CounterListProgram,
  DemoCatalog,
  ShowcaseShell,
} from '../src/catalog.js'
import { init } from '../src/init.js'
import {
  CanvasChanged,
  GotCalculatorMessage,
  GotMultiCountersMessage,
  GotSingleCounterMessage,
} from '../src/message.js'
import { update } from '../src/update.js'

const log = (label: string, value: unknown) => {
  console.log(`\n=== ${label} ===`)
  console.log(
    typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  )
}

let [model] = init()
log('init chrome', model.chrome)
log('init demos keys', Object.keys(model.demos))
log('init single.count', model.demos.single.count)
log('init multi.rows', model.demos.multi.rows.length)
log(
  'init list.rows',
  model.demos.list.rows.map(r => ({ id: r.id, count: r.child.count })),
)

// single increment via compat Got*
;[model] = update(
  model,
  GotSingleCounterMessage({ message: Counter.ClickedIncrement() }),
)
log('after single increment', model.demos.single.count)

// multi via nested message
const firstId = model.demos.multi.rows[0]!.id
;[model] = update(
  model,
  GotMultiCountersMessage({
    message: Counters.GotCounterMessage({
      counterId: firstId,
      message: Counter.ClickedIncrement(),
    }),
  }),
)
const row = model.demos.multi.rows.find(r => r.id === firstId)!
log('after multi row increment', { id: firstId, count: row.counter.count })

// calculator
;[model] = update(
  model,
  GotCalculatorMessage({
    message: Calculator.PressedDigit({ digit: 'Seven' }),
  }),
)
log('after calc PressedDigit Seven (model moved)', {
  sameAsInit: false,
  calcTag: (model.demos.calc as { _tag?: string })._tag,
})

// forEach list via derived helpers (no Got* ceremony)
const listId = model.demos.list.rows[0]!.id
;[model] = ShowcaseShell.update(
  model,
  ShowcaseShell.message.demos(
    DemoCatalog.message.list(
      CounterListProgram.childMessage(listId, Counter.ClickedIncrement()),
    ),
  ),
)
log(
  'after list child increment',
  model.demos.list.rows.map(r => ({ id: r.id, count: r.child.count })),
)

// chrome only — product counts stay
const singleBefore = model.demos.single.count
;[model] = update(model, CanvasChanged({ x: 99, y: 11, scale: 1.5 }))
log('after chrome canvas', {
  x: model.chrome.x,
  y: model.chrome.y,
  scale: model.chrome.scale,
  singleStill: model.demos.single.count,
  singleUnchanged: model.demos.single.count === singleBefore,
})

console.log(
  '\nOK — compose catalog works (chrome + single + multi + calc + list)\n',
)

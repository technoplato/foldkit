/**
 * Monorepo showcase catalog — one-line register per demo (ADR 0007 Q6).
 * Program.compose derives Model, Message, init, and update.
 */
import type { Message as CalculatorMessage } from 'calculator-core-example'
import { CalculatorProgram } from 'calculator-core-example'
import type { Message as CounterMessage } from 'counter-core-example'
import { CounterProgram } from 'counter-core-example'
import type { Message as CountersMessage } from 'counters-core-example'
import { MultipleCountersProgram } from 'counters-core-example'
import * as Program from 'foldkit/program'

import { ChromeProgram } from './chrome.js'

/**
 * Identified list of Counter Programs (compose.forEach — same rule as Scope list).
 */
export const CounterListProgram = Program.compose.forEach({
  of: CounterProgram,
  id: 'pis-counter-list',
  initialCount: 2,
})

/**
 * Product demos only (no chrome). Nested under the shell as `demos`.
 *
 * Add a monorepo Program with one line in the object below.
 */
export const DemoCatalog = Program.compose(
  {
    single: CounterProgram,
    multi: MultipleCountersProgram,
    calc: CalculatorProgram,
    list: CounterListProgram,
  },
  { id: 'pis-demo-catalog', version: 1 },
)

/**
 * Full lab shell: map chrome + demo catalog.
 * Model = { chrome, demos: { single, multi, calc } }
 * Message tags = chrome | demos (demos further tags single | multi | calc)
 */
export const ShowcaseShell = Program.compose(
  {
    chrome: ChromeProgram,
    demos: DemoCatalog,
  },
  { id: 'pis-canvas-lab', version: 2 },
)

/** Convenience: wrap a single-counter Message for the shell tape. */
export const singleMessage = (message: CounterMessage) =>
  ShowcaseShell.message.demos(DemoCatalog.message.single(message))

/** Convenience: wrap a multi-counters Message for the shell tape. */
export const multiMessage = (message: CountersMessage) =>
  ShowcaseShell.message.demos(DemoCatalog.message.multi(message))

/** Convenience: wrap a calculator Message for the shell tape. */
export const calcMessage = (message: CalculatorMessage) =>
  ShowcaseShell.message.demos(DemoCatalog.message.calc(message))

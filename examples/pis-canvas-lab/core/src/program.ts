import type * as Calculator from 'calculator-core-example'
import type * as Counter from 'counter-core-example'
import type * as Counters from 'counters-core-example'
import type * as Program from 'foldkit/program'

import type * as Chrome from './chrome.js'
import { ShowcaseShell, type CounterListProgram } from './catalog.js'

/**
 * Explicit Model (compose Schema erases field names for tsc noPropertyAccessFromIndexSignature).
 */
export type Model = {
  readonly chrome: Chrome.Model
  readonly demos: {
    readonly single: Counter.Model
    readonly multi: Counters.Model
    readonly calc: Calculator.Model
    readonly list: Program.ForEachModel<Counter.Model>
  }
}

export type Message = Program.MessageOf<typeof ShowcaseShell>

/**
 * Portable PIS canvas lab Program — composed catalog (chrome + demos).
 * See `catalog.ts` for one-line registration of monorepo Programs.
 */
export const PisCanvasLabProgram = ShowcaseShell as unknown as Program.Program<
  Model,
  Message
>

export type { CounterListProgram }

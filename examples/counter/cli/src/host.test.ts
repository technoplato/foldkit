import {
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  Model,
} from 'counter-core-example'
import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { executeCliOperation } from './host.js'

describe('Counter state commands', () => {
  it('shows the imported initial Model without a Message', async () => {
    const execution = await Effect.runPromise(executeCliOperation('Show'))

    expect(execution.initialModel).toEqual(Model.make({ count: 0 }))
    expect(execution.maybeMessage).toEqual(Option.none())
    expect(execution.finalModel).toBe(execution.initialModel)
  })

  it('runs each imported Message constructor through the imported update', async () => {
    const increment = await Effect.runPromise(executeCliOperation('Increment'))
    const decrement = await Effect.runPromise(executeCliOperation('Decrement'))
    const reset = await Effect.runPromise(executeCliOperation('Reset'))

    expect(increment.maybeMessage).toEqual(Option.some(ClickedIncrement()))
    expect(increment.finalModel).toEqual(Model.make({ count: 1 }))
    expect(decrement.maybeMessage).toEqual(Option.some(ClickedDecrement()))
    expect(decrement.finalModel).toEqual(Model.make({ count: -1 }))
    expect(reset.maybeMessage).toEqual(Option.some(ClickedReset()))
    expect(reset.finalModel).toEqual(Model.make({ count: 0 }))
  })
})

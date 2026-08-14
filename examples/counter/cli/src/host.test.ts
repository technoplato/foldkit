import { Decrement, Increment, Model, Reset } from 'counter-core-example'
import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { executeDo, executeShow } from './host.js'

describe('Counter CLI host', () => {
  it('shows the imported initial Model without a Message', async () => {
    const execution = await Effect.runPromise(executeShow(undefined, undefined))

    expect(execution.initialModel).toEqual(Model.make({ count: 0 }))
    expect(execution.maybeMessage).toEqual(Option.none())
    expect(execution.finalModel).toBe(execution.initialModel)
    expect(execution.stdout).toContain('uri      /counter')
    expect(execution.stdout).toContain('count    0')
    expect(execution.stdout).toContain('valid          false')
    expect(execution.stdout).toContain('│ [-]     [+]  │')
  })

  it('sends increment and auto-shows the new count', async () => {
    const execution = await Effect.runPromise(executeDo('increment'))

    expect(execution.maybeMessage).toEqual(Option.some(Increment()))
    expect(execution.finalModel).toEqual(Model.make({ count: 1 }))
    expect(execution.stdout).toContain('increment sent')
    expect(execution.stdout).toContain('from           cli')
    expect(execution.stdout).toContain('via            argv')
    expect(execution.stdout).toContain('tape           appended')
    expect(execution.stdout).toContain('link           offline')
    expect(execution.stdout).toContain('count    1')
    expect(execution.stdout).toContain('│ [-] [r] [+]  │')
  })

  it('starts decrement from count 0', async () => {
    const execution = await Effect.runPromise(executeDo('decrement'))

    expect(execution.maybeMessage).toEqual(Option.some(Decrement()))
    expect(execution.finalModel).toEqual(Model.make({ count: -1 }))
    expect(execution.stdout).toContain('decrement sent')
  })

  it('logs an invalid reset at 0 and does not send Reset', async () => {
    const execution = await Effect.runPromise(executeDo('reset'))

    expect(execution.maybeMessage).toEqual(Option.none())
    expect(execution.finalModel).toEqual(Model.make({ count: 0 }))
    expect(execution.stdout).toContain(
      'log  attempted to invoke invalid action reset',
    )
    expect(execution.stdout).toContain('state  count 0')
  })

  it('does not persist count into the next process', async () => {
    await Effect.runPromise(executeDo('increment'))
    const shown = await Effect.runPromise(executeShow(undefined, undefined))

    expect(shown.finalModel).toEqual(Model.make({ count: 0 }))
    expect(shown.stdout).toContain('count    0')
    expect(Reset.valid(shown.finalModel, {})).toBe(false)
  })
})

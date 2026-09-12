import { Array, Option } from 'effect'
import { buttonsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { Model } from './model.js'
import { CounterProgram, counterScreen, counterValid } from './program.js'

describe('CounterProgram', () => {
  it('owns valid and screen on Program.make', () => {
    const atZero = Model.make({ count: 0 })
    const atTwo = Model.make({ count: 2 })

    expect(CounterProgram.valid).toBe(counterValid)
    expect(CounterProgram.screen).toBe(counterScreen)
    expect(
      Array.map(counterValid(atZero), item => [item.token, item.valid]),
    ).toEqual([
      ['increment', true],
      ['decrement', true],
      ['reset', false],
    ])
    expect(
      Array.map(buttonsOf(counterScreen(atZero)), button => button.token),
    ).toEqual(['increment', 'decrement'])
    expect(
      Array.map(buttonsOf(counterScreen(atTwo)), button => button.token),
    ).toEqual(['increment', 'decrement', 'reset'])
    expect(Option.getOrUndefined(Array.get(counterValid(atZero), 2))).toEqual({
      token: 'reset',
      keys: ['r'],
      spoken: ['reset', 'start over'],
      valid: false,
      hidden: 'count is already 0',
    })
  })
})

import { Catalog, Interaction } from 'foldkit'
import { buttonsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { Decrement, Increment, Reset, catalog } from './message.js'
import { CounterProgram } from './program.js'
import { counterScreen } from './screen.js'
import { update } from './update.js'

const interactionOf = () => {
  const interaction = CounterProgram.interaction
  if (interaction === undefined) {
    throw new Error('CounterProgram must derive an interaction')
  }
  return interaction
}

describe('update', () => {
  it('raises, lowers, and resets the count', () => {
    expect(update({ count: 2 }, Increment())[0]).toEqual({ count: 3 })
    expect(update({ count: 2 }, Decrement())[0]).toEqual({ count: 1 })
    expect(update({ count: 2 }, Reset())[0]).toEqual({ count: 0 })
  })

  it('leaves a zero count at zero on Reset', () => {
    expect(update({ count: 0 }, Reset())[0]).toEqual({ count: 0 })
  })
})

describe('catalog', () => {
  it('lists every Action with its label and keys', () => {
    expect(
      Catalog.entries(catalog, { count: 1 }).map(entry => [
        entry.tag,
        entry.label,
        entry.keys,
      ]),
    ).toEqual([
      ['Increment', '+', ['+', '=']],
      ['Decrement', '-', ['-']],
      ['Reset', 'Reset', ['r']],
    ])
  })

  it('disables Reset at zero with one sentence', () => {
    const reset = Catalog.entries(catalog, { count: 0 }).find(
      entry => entry.tag === 'Reset',
    )
    expect(reset?.availability).toEqual(
      Catalog.Disabled({ because: 'count is already 0' }),
    )
  })
})

describe('interaction', () => {
  it('presses Enabled Actions and refuses Reset at zero', () => {
    const interaction = interactionOf()
    expect(interaction.press({ count: 0 }, 'Increment')).toEqual([Increment()])
    expect(interaction.press({ count: 0 }, 'Reset')).toEqual([])
    expect(interaction.press({ count: 4 }, 'Reset')).toEqual([Reset()])
  })

  it('maps the declared keys', () => {
    const interaction = interactionOf()
    expect(
      interaction.pressKey({ count: 0 }, Interaction.keyInput('=')),
    ).toEqual([Increment()])
    expect(
      interaction.pressKey({ count: 0 }, Interaction.keyInput('-')),
    ).toEqual([Decrement()])
  })
})

describe('counterScreen', () => {
  it('paints the count and one button per Action', () => {
    expect(buttonsOf(counterScreen({ count: 0 }))).toEqual([
      { _tag: 'Button', label: '+', action: 'Increment' },
      { _tag: 'Button', label: '-', action: 'Decrement' },
      {
        _tag: 'Button',
        label: 'Reset',
        action: 'Reset',
        because: 'count is already 0',
        disabled: true,
      },
    ])
  })
})

describe('synchronization', () => {
  it('shares every Counter Message as Domain', () => {
    expect(CounterProgram.synchronization?.messageCategory(Increment())).toBe(
      'Domain',
    )
  })
})

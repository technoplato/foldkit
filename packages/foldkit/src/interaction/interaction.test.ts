import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Interaction from './interaction.js'

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+', '='] },
})

const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'The person wants to start over',
  enabled: (model: Model) =>
    model.count === 0
      ? Catalog.Disabled({ because: 'count is already 0' })
      : Catalog.Enabled(),
  meta: { label: 'Reset', keys: ['r'] },
})

const interaction = Interaction.fromCatalog(Catalog.make([Increment, Reset]))

describe('Interaction.fromCatalog', () => {
  it('is always Ready and has no menu', () => {
    expect(interaction.status({ count: 0 })).toEqual(Interaction.Ready())
    expect(interaction.menu({ count: 0 })).toEqual(Option.none())
    expect(interaction.openMenu({ count: 0 })).toEqual([])
  })

  it('presses Enabled Actions and refuses Disabled ones', () => {
    expect(interaction.press({ count: 0 }, 'Increment')).toEqual([Increment()])
    expect(interaction.press({ count: 0 }, 'Reset')).toEqual([])
    expect(interaction.press({ count: 2 }, 'Reset')).toEqual([Reset()])
  })

  it('maps declared keys and ignores chords', () => {
    expect(
      interaction.pressKey({ count: 0 }, Interaction.keyInput('=')),
    ).toEqual([Increment()])
    expect(
      interaction.pressKey(
        { count: 0 },
        Interaction.keyInput('r', { isControl: true }),
      ),
    ).toEqual([])
    expect(
      interaction.pressKey({ count: 0 }, Interaction.keyInput('x')),
    ).toEqual([])
  })
})

describe('Interaction.normalizeKey', () => {
  it('translates terminal names to browser spelling', () => {
    expect(Interaction.normalizeKey('return')).toBe('Enter')
    expect(Interaction.normalizeKey('\r')).toBe('Enter')
    expect(Interaction.normalizeKey('up')).toBe('ArrowUp')
    expect(Interaction.normalizeKey('escape')).toBe('Escape')
    expect(Interaction.normalizeKey('+')).toBe('+')
  })
})

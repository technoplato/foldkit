import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import { Button, Column, Row, Text } from './elements.js'
import { padOf } from './pad.js'

const increment = { token: 'increment', keys: ['+', '='] }
const decrement = { token: 'decrement', keys: ['-'] }
const reset = { token: 'reset', keys: ['r'] }
const actions = [increment, decrement, reset]

const screenOf = (...tokens: ReadonlyArray<string>) =>
  Column(
    {},
    Text('count'),
    Row(
      {},
      ...Array.map(tokens, token =>
        Button({
          token,
          label: token === 'reset' ? 'reset' : token,
        }),
      ),
    ),
  )

describe('padOf', () => {
  it('derives keys from Action keys on the current screen', () => {
    const pad = padOf(screenOf('increment', 'decrement'), actions)

    expect(pad.keys).toEqual([
      { key: '+', token: 'increment' },
      { key: '=', token: 'increment' },
      { key: '-', token: 'decrement' },
    ])
    expect(Array.map(pad.buttons, button => button.token)).toEqual([
      'increment',
      'decrement',
    ])
    expect(Array.map(pad.keys, key => key.key)).not.toEqual(['+', '-', '×'])
  })

  it('omits a Button that is absent from the screen', () => {
    const pad = padOf(screenOf('increment', 'decrement'), actions)

    expect(Array.map(pad.buttons, button => button.token)).not.toContain(
      'reset',
    )
    expect(Array.map(pad.keys, key => key.key)).not.toContain('r')
  })

  it('includes reset only when that Button is on the screen', () => {
    const pad = padOf(screenOf('increment', 'decrement', 'reset'), actions)

    expect(Array.map(pad.buttons, button => button.token)).toEqual([
      'increment',
      'decrement',
      'reset',
    ])
    expect(pad.keys).toContainEqual({ key: 'r', token: 'reset' })
  })

  it('cannot press a key with no token or a Button with no token', () => {
    const screen = Column(
      {},
      Button({ label: 'ghost' }),
      Button({ token: 'increment', label: '+', disabled: true }),
    )
    const pad = padOf(screen, [
      { token: 'increment', keys: ['+', ''] },
      { token: '', keys: ['x'] },
    ])

    expect(pad.keys).toEqual([])
    expect(pad.buttons).toEqual([])
  })
})

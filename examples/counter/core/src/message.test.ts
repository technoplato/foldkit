import { describe, expect, test } from 'vitest'

import {
  Decrement,
  Increment,
  Message,
  Reset,
  actionByToken,
  actions,
} from './index.js'

const emptyContext = {}

describe('actions', () => {
  test('Increment is always valid and uses + and =', () => {
    expect(Increment()).toEqual({ _tag: 'Increment' })
    expect(Increment.doc.what).toBe('Increments the count by one')
    expect(Increment.keys).toEqual(['+', '='])
    expect(Increment.tokens).toEqual(['increment'])
    expect(Increment.spoken).toEqual(['increment'])
    expect(Increment.command).toBe('increment')
    expect(Increment.event).toBe('incremented')
    expect(Increment.mutate).toBe('count = count + 1')
    expect(Increment.sideEffects).toBe('(none)')
    expect(Increment.valid({ count: 0 }, emptyContext)).toBe(true)
    expect(Increment.valid({ count: 4 }, emptyContext)).toBe(true)
  })

  test('Decrement is always valid', () => {
    expect(Decrement()).toEqual({ _tag: 'Decrement' })
    expect(Decrement.keys).toEqual(['-'])
    expect(Decrement.tokens).toEqual(['decrement'])
    expect(Decrement.valid({ count: 0 }, emptyContext)).toBe(true)
  })

  test('Reset is invalid when the count is already 0', () => {
    expect(Reset()).toEqual({ _tag: 'Reset' })
    expect(Reset.keys).toEqual(['r'])
    expect(Reset.tokens).toEqual(['reset'])
    expect(Reset.valid({ count: 0 }, emptyContext)).toBe(false)
    expect(Reset.hiddenBecause?.({ count: 0 })).toBe('count is already 0')
    expect(Reset.valid({ count: 1 }, emptyContext)).toBe(true)
    expect(Reset.hiddenBecause?.({ count: 1 })).toBeUndefined()
  })

  test('show walks the Message constructors, not a second valid tree', () => {
    expect(actions).toEqual([Increment, Decrement, Reset])
    expect(Message.make(Increment())).toEqual(Increment())
    expect(actionByToken('increment')).toBe(Increment)
    expect(actionByToken('decrement')).toBe(Decrement)
    expect(actionByToken('reset')).toBe(Reset)
    expect(actionByToken('ClickedIncrement')).toBeUndefined()
  })
})

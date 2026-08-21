import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  actionMenuRowLabel,
  filterListedActions,
  listActions,
} from './listActions.js'
import { Model } from './model.js'
import { CounterProgram } from './program.js'

describe('listActions', () => {
  it('lists increment as valid and reset as hidden at 0', () => {
    const rows = listActions(CounterProgram, Model.make({ count: 0 }))
    const increment = rows.find(row => row.token === 'increment')
    const reset = rows.find(row => row.token === 'reset')
    expect(increment).toEqual({
      token: 'increment',
      keys: ['+', '='],
      valid: true,
      disabled: false,
      hiddenBecause: undefined,
      payload: {},
    })
    expect(reset).toEqual({
      token: 'reset',
      keys: ['r'],
      valid: false,
      disabled: true,
      hiddenBecause: 'count is already 0',
      payload: {},
    })
  })

  it('lists reset as valid above 0', () => {
    const rows = listActions(CounterProgram, Model.make({ count: 2 }))
    const reset = rows.find(row => row.token === 'reset')
    expect(reset?.valid).toBe(true)
    expect(reset?.disabled).toBe(false)
    expect(reset?.hiddenBecause).toBeUndefined()
  })

  it('filters reset and names Empty when nothing matches', () => {
    const rows = listActions(CounterProgram, Model.make({ count: 2 }))
    const reset = filterListedActions(rows, Option.some('reset'))
    expect(reset._tag).toBe('Matches')
    if (reset._tag === 'Matches') {
      expect(reset.rows.map(row => row.token)).toEqual(['reset'])
    }
    const empty = filterListedActions(rows, Option.some('zzz'))
    expect(empty).toEqual({ _tag: 'Empty' })
  })

  it('prints the first Action key on each row', () => {
    const rows = listActions(CounterProgram, Model.make({ count: 0 }))
    const increment = rows.find(row => row.token === 'increment')
    const reset = rows.find(row => row.token === 'reset')
    expect(increment !== undefined).toBe(true)
    expect(reset !== undefined).toBe(true)
    if (increment !== undefined) {
      expect(actionMenuRowLabel(increment)).toBe('[ + ] increment')
    }
    if (reset !== undefined) {
      expect(actionMenuRowLabel(reset)).toBe('[ r ] reset: count is already 0')
    }
  })
})

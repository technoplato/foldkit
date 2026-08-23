import { describe, expect, test } from 'vitest'

import {
  GuessedNo,
  GuessedYes,
  PostedOperator,
  ResetTape,
  actionByToken,
  actions,
} from './index.js'
import { emptyModel } from './model.js'

const emptyContext = {}

describe('actions', () => {
  test('GuessedYes is valid on a label prompt', () => {
    expect(GuessedYes()).toEqual({ _tag: 'GuessedYes' })
    expect(GuessedYes.tokens).toEqual(['yes'])
    expect(GuessedYes.valid(emptyModel(), emptyContext)).toBe(true)
  })

  test('GuessedNo is valid on a label prompt', () => {
    expect(GuessedNo()).toEqual({ _tag: 'GuessedNo' })
    expect(GuessedNo.tokens).toEqual(['no'])
  })

  test('PostedOperator starts the grok.knophy.com flow', () => {
    expect(PostedOperator()).toEqual({ _tag: 'PostedOperator' })
    expect(PostedOperator.tokens).toEqual(['operator'])
  })

  test('ResetTape is hidden on an empty tape', () => {
    expect(ResetTape.valid(emptyModel(), emptyContext)).toBe(false)
    expect(actionByToken('yes')).toBe(GuessedYes)
    expect(actions.length).toBeGreaterThan(3)
  })
})

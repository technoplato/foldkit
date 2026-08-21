import { describe, expect, test } from 'vitest'

import { foldCounterMessages } from './fold.js'
import { Decrement, Increment, Model, Reset } from './index.js'

describe('foldCounterMessages', () => {
  test('starts at the init Model', () => {
    expect(foldCounterMessages([])).toEqual(Model.make({ count: 0 }))
  })

  test('folds accepted Messages through update', () => {
    expect(
      foldCounterMessages([Increment(), Increment(), Decrement()]),
    ).toEqual(Model.make({ count: 1 }))
  })

  test('folds Reset after a non-zero count', () => {
    expect(foldCounterMessages([Increment(), Reset()])).toEqual(
      Model.make({ count: 0 }),
    )
  })
})

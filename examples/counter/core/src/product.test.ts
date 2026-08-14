import { Array, Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { Model } from './model.js'
import { productView } from './product.js'
import { buttonsOf, textsOf } from './tree.js'

describe('productView', () => {
  test('offers increment and decrement at count 0', () => {
    const tree = productView(Model.make({ count: 0 }))
    const tokens = Array.map(buttonsOf(tree), button => button.token)
    const maybeCount = Array.head(textsOf(tree))

    expect(Option.isSome(maybeCount) && maybeCount.value.content === '0').toBe(
      true,
    )
    expect(tokens).toEqual(['increment', 'decrement'])
  })

  test('offers reset when the count is not 0', () => {
    const tree = productView(Model.make({ count: 2 }))
    const tokens = Array.map(buttonsOf(tree), button => button.token)

    expect(tokens).toEqual(['increment', 'decrement', 'reset'])
  })
})

import { Array } from 'effect'
import { buttonsOf } from 'foldkit/renderers'
import { describe, expect, test } from 'vitest'

import { renderChrome } from './chrome.js'
import { Model } from './model.js'
import { productView } from './product.js'

describe('renderChrome', () => {
  test('wraps the product tree and does not invent buttons', () => {
    const model = Model.make({ count: 0 })
    const screen = renderChrome(model, 'watch')

    expect(
      Array.map(buttonsOf(productView(model)), button => button.token),
    ).toEqual(['increment', 'decrement'])
    expect(screen).toContain('[ + ]')
    expect(screen).toContain('[ - ]')
    expect(screen).not.toContain('[ reset ]')
    expect(screen).not.toContain('laptop')
  })

  test('computer chrome uses the product reset button', () => {
    const screen = renderChrome(Model.make({ count: 2 }), 'computer')

    expect(screen).toContain('/counter')
    expect(screen).toContain('[ reset ]')
  })
})

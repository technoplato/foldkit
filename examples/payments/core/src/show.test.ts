import { describe, expect, it } from 'vitest'

import { ConnectedWallet } from './message.js'
import { initialModel } from './model.js'
import { displayForModel } from './show.js'
import { update } from './update.js'

describe('payments show', () => {
  it('prints every rail and the idle x402 selection', () => {
    const text = displayForModel(initialModel)
    expect(text).toContain('PAYMENTS')
    expect(text).toContain('x402')
    expect(text).toContain('stripe-checkout')
    expect(text).toContain('apple-pay')
    expect(text).toContain('wait')
  })

  it('marks x402 ready after the wallet connects', () => {
    const [model] = update(initialModel, ConnectedWallet())
    const text = displayForModel(model)
    expect(text).toContain('x402               ready')
  })
})

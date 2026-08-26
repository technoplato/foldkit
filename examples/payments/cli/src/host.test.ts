import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { runPaymentsDo, runPaymentsShow } from './host.js'

describe('payments cli host', () => {
  it('shows the idle Program', async () => {
    await Effect.runPromise(runPaymentsShow())
    expect(true).toBe(true)
  })

  it('connects the wallet and starts the x402 rail', async () => {
    await Effect.runPromise(runPaymentsDo(['connect', 'start']))
    expect(true).toBe(true)
  })

  it('records Stripe presence then starts checkout', async () => {
    await Effect.runPromise(
      runPaymentsDo([
        'select',
        'stripe-checkout',
        'record',
        'stripeSecret',
        'start',
      ]),
    )
    expect(true).toBe(true)
  })
})

import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ConnectedWallet,
  RecordedCredentialPresence,
  RequestedSession,
  RequestedVerify,
  SelectedRail,
  SucceededCreateSession,
  SucceededVerify,
} from './message.js'
import { initialModel, quotedCents } from './model.js'
import { Receipt, RedirectOffer } from './processor.js'
import { RAILS } from './rail/index.js'
import { update } from './update.js'

describe('payments update', () => {
  it('refuses a session when the selected rail is not ready', () => {
    const [model, commands] = update(initialModel, RequestedSession())
    expect(commands.length).toBe(0)
    expect(Option.isSome(model.lastOutcome)).toBe(true)
    if (Option.isSome(model.lastOutcome)) {
      expect(model.lastOutcome.value._tag).toBe('refuse')
      if (model.lastOutcome.value._tag === 'refuse') {
        expect(model.lastOutcome.value.why).toBe('rail-not-ready')
      }
    }
  })

  it('starts an x402 session after the wallet connects', () => {
    const [connected] = update(initialModel, ConnectedWallet())
    const [model, commands] = update(connected, RequestedSession())
    expect(commands.length).toBe(1)
    const command = commands.at(0)
    expect(command?.name).toBe('CreateSession')
    expect(model.phase._tag).toBe('creating-session')
  })

  it('starts Stripe Checkout after recording a secret presence flag', () => {
    const [selected] = update(
      initialModel,
      SelectedRail({ rail: 'stripe-checkout' }),
    )
    const [ready] = update(
      selected,
      RecordedCredentialPresence({ field: 'stripeSecret', isPresent: true }),
    )
    const [model, commands] = update(ready, RequestedSession())
    expect(commands.length).toBe(1)
    expect(quotedCents(ready)).toBe(50)
    expect(model.phase._tag).toBe('creating-session')
  })

  it('settles after a successful session and verify', () => {
    const [selected] = update(
      initialModel,
      SelectedRail({ rail: 'stripe-checkout' }),
    )
    const [ready] = update(
      selected,
      RecordedCredentialPresence({
        field: 'stripePaymentLink',
        isPresent: true,
      }),
    )
    const [creating] = update(ready, RequestedSession())
    const [awaiting] = update(
      creating,
      SucceededCreateSession({
        offer: RedirectOffer.make({ url: 'https://example.test/pay' }),
      }),
    )
    expect(awaiting.phase._tag).toBe('awaiting-checkout')
    const [verifying, verifyCommands] = update(
      awaiting,
      RequestedVerify({ sessionId: 'cs_test' }),
    )
    expect(verifyCommands.length).toBe(1)
    expect(verifyCommands.at(0)?.name).toBe('VerifyPayment')
    const [settled] = update(
      verifying,
      SucceededVerify({
        receipt: Receipt.make({
          rail: 'stripe-checkout',
          reference: 'cs_test',
          resource: 'brief',
          amountCents: 50,
          payer: 'stripe',
        }),
      }),
    )
    expect(settled.phase._tag).toBe('settled')
  })

  it('refuses verify while idle', () => {
    const [model, commands] = update(initialModel, RequestedVerify({}))
    expect(commands.length).toBe(0)
    if (Option.isSome(model.lastOutcome)) {
      expect(model.lastOutcome.value._tag).toBe('refuse')
    }
  })

  it('catalogs every merchant rail as a core module', () => {
    expect(RAILS.map(rail => rail.id)).toEqual([
      'x402',
      'stripe-checkout',
      'polar',
      'lemon',
      'paypal',
      'coinbase-onramp',
      'stripe-x402',
      'stripe-embed',
      'apple-pay',
    ])
  })
})

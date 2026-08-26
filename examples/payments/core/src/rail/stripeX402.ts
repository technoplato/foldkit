import {
  Exact402,
  type RailModule,
  SetupLink,
  X402DepositKind,
} from './spec.js'

/** Stripe crypto deposit address on Base, then x402 transfer. */
export const module: RailModule = {
  id: 'stripe-x402',
  title: 'Stripe x402',
  blurb: 'USDC on Base into a Stripe deposit address. Fiat lands in Stripe.',
  setup: [
    SetupLink.make({
      label: 'Enable stablecoins',
      href: 'https://dashboard.stripe.com/settings/payment_methods',
    }),
    SetupLink.make({
      label: 'Stripe x402 docs',
      href: 'https://docs.stripe.com/payments/machine/x402',
    }),
  ],
  fields: ['stripeSecret'],
  quotePolicy: Exact402.make({}),
  sessionKind: X402DepositKind.make({}),
  isReady: presence => presence.stripeSecret,
}

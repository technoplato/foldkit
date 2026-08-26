import {
  ONRAMP_MIN_CENTS,
  OnrampFloor,
  OnrampKind,
  type RailModule,
  SetupLink,
} from './spec.js'

/** Coinbase Onramp buys USDC, then the Program settles x402. */
export const module: RailModule = {
  id: 'coinbase-onramp',
  title: 'Coinbase Onramp',
  blurb: 'Buy USDC with Apple Pay or debit, then settle the 402 in USDC.',
  setup: [
    SetupLink.make({
      label: 'CDP portal',
      href: 'https://portal.cdp.coinbase.com/',
    }),
    SetupLink.make({
      label: 'Onramp product',
      href: 'https://portal.cdp.coinbase.com/products/onramp',
    }),
  ],
  fields: ['coinbaseProjectId'],
  quotePolicy: OnrampFloor.make({ minCents: ONRAMP_MIN_CENTS }),
  sessionKind: OnrampKind.make({}),
  isReady: presence => presence.coinbaseProjectId,
}

import {
  Exact402,
  OnchainExactKind,
  type RailModule,
  SetupLink,
} from './spec.js'

/** Exact USDC on Base through HTTP 402. */
export const module: RailModule = {
  id: 'x402',
  title: 'USDC x402',
  blurb: 'On-chain exact scheme. Wallet pays USDC on Base.',
  setup: [
    SetupLink.make({
      label: 'Coinbase Wallet',
      href: 'https://www.coinbase.com/wallet',
    }),
    SetupLink.make({
      label: 'Base Account',
      href: 'https://keys.coinbase.com/',
    }),
  ],
  fields: [],
  quotePolicy: Exact402.make({}),
  sessionKind: OnchainExactKind.make({}),
  isReady: (_presence, wallet) => wallet._tag === 'Connected',
}

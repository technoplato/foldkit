import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  EthereumSepoliaTransport,
  SolanaDevnetTransport,
} from './chainTransport.js'
import {
  EthereumSepoliaNodeConfigFromEnv,
  SolanaDevnetNodeConfigFromEnv,
} from './config.js'
import { EthereumSepoliaTransportLive } from './ethereumSepolia.js'
import { SolanaDevnetTransportLive } from './solanaDevnet.js'

describe('live test-network smoke checks', () => {
  it.skipIf(process.env['WALLET_ETHEREUM_SEPOLIA_LIVE_SMOKE'] !== '1')(
    'loads Sepolia balances without signing or transferring',
    async () => {
      const portfolio = await Effect.runPromise(
        EthereumSepoliaTransport.pipe(
          Effect.flatMap(transport => transport.loadPortfolio),
          Effect.provide(
            EthereumSepoliaTransportLive.pipe(
              Layer.provide(EthereumSepoliaNodeConfigFromEnv),
            ),
          ),
        ),
      )
      expect(portfolio.account.network._tag).toBe('EthereumSepolia')
      expect(portfolio.balances).toHaveLength(2)
    },
  )

  it.skipIf(process.env['WALLET_SOLANA_DEVNET_LIVE_SMOKE'] !== '1')(
    'loads Devnet balances without signing or transferring',
    async () => {
      const portfolio = await Effect.runPromise(
        SolanaDevnetTransport.pipe(
          Effect.flatMap(transport => transport.loadPortfolio),
          Effect.provide(
            SolanaDevnetTransportLive.pipe(
              Layer.provide(SolanaDevnetNodeConfigFromEnv),
            ),
          ),
        ),
      )
      expect(portfolio.account.network._tag).toBe('SolanaDevnet')
      expect(portfolio.balances).toHaveLength(2)
    },
  )
})

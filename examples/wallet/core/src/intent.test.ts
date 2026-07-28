import { Effect, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  SendEthIntent,
  SendSolIntent,
  SendUsdIntent,
  WalletIntentCapability,
  capabilityForWalletIntent,
  walletIntentRouter,
} from './intent.js'

const ethereumDestination = '0xF0135cBe737572885131c6831B1E061e679E7933'
const solanaDestination = '7Z9vR1KxMPdQxFj8BkzjMLJFWhe8BngUz6jZb1YkZP8n'

describe('Wallet intent router', () => {
  it('round-trips ETH, SOL, and USD through canonical portable paths', async () => {
    const intents = [
      SendEthIntent.make({
        mode: 'Testnet',
        atomicUnits: '1000000000000000',
        destinationAddress: ethereumDestination,
      }),
      SendSolIntent.make({
        mode: 'Devnet',
        atomicUnits: '1000000',
        destinationAddress: solanaDestination,
      }),
      SendUsdIntent.make({
        mode: 'Testnet',
        rail: 'Ethereum',
        atomicUnits: '1000000',
        destinationAddress: ethereumDestination,
      }),
    ]

    const paths = await Effect.runPromise(
      Effect.forEach(intents, intent => walletIntentRouter.print(intent)),
    )

    expect(paths).toStrictEqual([
      `/wallet/intent/send/eth?mode=testnet&amount=1000000000000000&to=${ethereumDestination}`,
      `/wallet/intent/send/sol?mode=devnet&amount=1000000&to=${solanaDestination}`,
      `/wallet/intent/send/usd?mode=testnet&amount=1000000&to=${ethereumDestination}&rail=ethereum`,
    ])

    await expect(
      Effect.runPromise(
        Effect.forEach(paths, path => walletIntentRouter.parse(path)),
      ),
    ).resolves.toStrictEqual(intents)
  })

  it('canonicalizes aliases in query ordering and rejects unknown modes', async () => {
    await expect(
      Effect.runPromise(
        walletIntentRouter.canonicalize(
          `/wallet/intent/send/eth?to=${ethereumDestination}&amount=5&mode=testnet`,
        ),
      ),
    ).resolves.toBe(
      `/wallet/intent/send/eth?mode=testnet&amount=5&to=${ethereumDestination}`,
    )

    await expect(
      Effect.runPromise(
        walletIntentRouter.parse(
          `/wallet/intent/send/eth?mode=production&amount=5&to=${ethereumDestination}`,
        ),
      ),
    ).rejects.toMatchObject({ _tag: 'WalletIntentRouteError' })
  })

  it('reports Layer availability without silently substituting networks', () => {
    expect(
      capabilityForWalletIntent(
        SendEthIntent.make({
          mode: 'Testnet',
          atomicUnits: '1',
          destinationAddress: ethereumDestination,
        }),
      ),
    ).toMatchObject({
      _tag: 'ImplementedWalletIntentCapability',
      support: 'Implemented',
      network: 'Ethereum Sepolia',
      intent: { _tag: 'SepoliaEthTransferIntent' },
    })

    expect(
      capabilityForWalletIntent(
        SendEthIntent.make({
          mode: 'Live',
          atomicUnits: '1',
          destinationAddress: ethereumDestination,
        }),
      ),
    ).toMatchObject({
      _tag: 'UnsupportedWalletIntentCapability',
      support: 'TypedUnsupported',
      request: { _tag: 'SendEthIntent' },
    })
  })

  it('does not allow a request to masquerade as an executable intent', () => {
    expect(() =>
      S.decodeUnknownSync(WalletIntentCapability)({
        _tag: 'ImplementedWalletIntentCapability',
        support: 'Implemented',
        network: 'Ethereum Sepolia',
        reason: 'Invalid fixture',
        intent: SendEthIntent.make({
          mode: 'Devnet',
          atomicUnits: '1',
          destinationAddress: ethereumDestination,
        }),
      }),
    ).toThrow()
  })
})

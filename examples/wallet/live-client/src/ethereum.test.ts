import { Effect, Option } from 'effect'
import { getAddress } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TransferRequest,
  WalletAccount,
  WalletProfileAccount,
} from 'wallet-core-example'

import { LiveNetworkAccount } from './adapter.js'
import { liveWalletNetworkForId } from './catalog.js'
import { makeEthereumLiveAdapter } from './ethereum.js'

const ethereumTransport = vi.hoisted(() => ({
  balance: 2n,
  estimateGasMode: 'Ok',
  estimateGasCalls: 0,
}))

vi.mock('viem', async importOriginal => {
  const actual = await importOriginal<typeof import('viem')>()
  return {
    ...actual,
    createPublicClient: () => ({
      getBalance: async () => ethereumTransport.balance,
      estimateFeesPerGas: async () => ({
        maxFeePerGas: 1n,
        maxPriorityFeePerGas: 1n,
      }),
      estimateGas: async () => {
        ethereumTransport.estimateGasCalls += 1
        if (ethereumTransport.estimateGasMode === 'InsufficientFunds') {
          throw new actual.EstimateGasExecutionError(
            new actual.InsufficientFundsError(),
            {
              to: recipientAddress,
              value: 1n,
            },
          )
        } else if (ethereumTransport.estimateGasMode === 'Unavailable') {
          throw new Error('RPC unavailable')
        } else {
          return 21_000n
        }
      },
    }),
  }
})

const accountAddress = getAddress(`0x${'11'.repeat(20)}`)
const recipientAddress = getAddress(`0x${'22'.repeat(20)}`)

const ethereumSepoliaConfiguration = (() => {
  const maybeConfiguration = liveWalletNetworkForId('ethereum:sepolia')
  if (
    Option.isNone(maybeConfiguration) ||
    maybeConfiguration.value._tag !== 'EthereumLiveNetwork'
  ) {
    throw new Error('Missing Ethereum Sepolia configuration')
  }
  return maybeConfiguration.value
})()

const profile = WalletProfileAccount.make({
  accountId: 'wallet-1:ethereum:sepolia',
  chainId: 'ethereum',
  networkId: 'ethereum:sepolia',
  address: accountAddress,
  displayName: 'Wallet 1 Ethereum Sepolia',
})
const account = LiveNetworkAccount.make({
  profile,
  account: WalletAccount.make(profile),
  configuration: ethereumSepoliaConfiguration,
})
const request = TransferRequest.make({
  transferId: 'ethereum-preview',
  accountId: account.account.accountId,
  assetId: ethereumSepoliaConfiguration.asset.assetId,
  destinationAddress: recipientAddress,
  atomicUnits:
    ethereumSepoliaConfiguration.asset.suggestedTestTransferAtomicUnits,
  maybeMessage: Option.none(),
})

const previewFailure = async () => {
  const adapter = makeEthereumLiveAdapter(ethereumSepoliaConfiguration)
  const validation = await Effect.runPromise(
    adapter.validateTransfer(account, request),
  )
  if (validation._tag === 'RejectedTransfer') {
    throw new Error('Expected the Ethereum recipient to validate')
  }
  return Effect.runPromise(
    adapter.previewTransfer(account, validation).pipe(Effect.flip),
  )
}

afterEach(() => {
  ethereumTransport.balance = 2n
  ethereumTransport.estimateGasMode = 'Ok'
  ethereumTransport.estimateGasCalls = 0
})

describe('Ethereum live adapter transfer failures', () => {
  it('rejects an obviously insufficient balance before estimating gas', async () => {
    ethereumTransport.balance = 0n

    const failure = await previewFailure()

    expect(failure.code).toBe('Rejected')
    expect(ethereumTransport.estimateGasCalls).toBe(0)
  })

  it('preserves viem insufficient-funds failures as rejected transfers', async () => {
    ethereumTransport.estimateGasMode = 'InsufficientFunds'

    const failure = await previewFailure()

    expect(failure.code).toBe('Rejected')
    expect(ethereumTransport.estimateGasCalls).toBe(1)
  })

  it('keeps ordinary transport failures unavailable', async () => {
    ethereumTransport.estimateGasMode = 'Unavailable'

    const failure = await previewFailure()

    expect(failure.code).toBe('Unavailable')
    expect(ethereumTransport.estimateGasCalls).toBe(1)
  })
})

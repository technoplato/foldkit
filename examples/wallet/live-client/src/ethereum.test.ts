import { Effect, Option, Redacted, Schema as S } from 'effect'
import { getAddress } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AssetAmount,
  AtomicUnits,
  FirstTransactionWithRecipient,
  TransactionPreview,
  TransferRequest,
  UnfamiliarAddress,
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
  maxFeePerGas: 1n,
  maxPriorityFeePerGas: 1n,
}))

vi.mock('viem', async importOriginal => {
  const actual = await importOriginal<typeof import('viem')>()
  return {
    ...actual,
    createPublicClient: () => ({
      getBalance: async () => ethereumTransport.balance,
      estimateFeesPerGas: async () => ({
        maxFeePerGas: ethereumTransport.maxFeePerGas,
        maxPriorityFeePerGas: ethereumTransport.maxPriorityFeePerGas,
      }),
      getTransactionCount: async () => 7,
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
  ethereumTransport.maxFeePerGas = 1n
  ethereumTransport.maxPriorityFeePerGas = 1n
})

const previewedGwei = 10n
const gasForTransfer = 21_000n
const previewedFee = previewedGwei * gasForTransfer

/** A preview whose fee was quoted at 10 per gas, for 21,000 gas. */
const previewAtTenPerGas = TransactionPreview.make({
  previewId: 'ethereum-preview-1',
  transfer: {
    _tag: 'ValidatedTransfer',
    request,
    recipient: {
      networkId: ethereumSepoliaConfiguration.network.networkId,
      address: recipientAddress,
      normalizedAddress: recipientAddress,
      displayAddress: recipientAddress,
    },
  },
  estimatedFee: AssetAmount.make({
    assetId: ethereumSepoliaConfiguration.asset.assetId,
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(previewedFee.toString()),
    observedAt: 1,
  }),
  resultingBalance: AssetAmount.make({
    assetId: ethereumSepoliaConfiguration.asset.assetId,
    atomicUnits: '1',
    observedAt: 1,
  }),
  expiresAt: Number.MAX_SAFE_INTEGER,
  recipientFamiliarity: UnfamiliarAddress.make({}),
  recipientHistory: FirstTransactionWithRecipient.make({}),
})

const preparedFees = (
  payload: Redacted.Redacted<string>,
): Readonly<{ gas: bigint; maxFeePerGas: bigint }> => {
  const prepared: unknown = JSON.parse(Redacted.value(payload))
  if (
    typeof prepared !== 'object' ||
    prepared === null ||
    !('gas' in prepared) ||
    !('maxFeePerGas' in prepared)
  ) {
    throw new Error('Expected a prepared Ethereum payload')
  }
  return {
    gas: BigInt(String(prepared.gas)),
    maxFeePerGas: BigInt(String(prepared.maxFeePerGas)),
  }
}

describe('Ethereum live adapter fee binding', () => {
  it('refuses to sign when the fee rose above what the preview showed', async () => {
    ethereumTransport.maxFeePerGas = 50n
    ethereumTransport.maxPriorityFeePerGas = 2n
    const adapter = makeEthereumLiveAdapter(ethereumSepoliaConfiguration)

    const failure = await Effect.runPromise(
      adapter
        .buildTransferPayload(account, previewAtTenPerGas)
        .pipe(Effect.flip),
    )

    expect(failure.code).toBe('Rejected')
    expect(failure.guidance?.summary).toBe(
      'The network fee rose since the preview, so nothing was signed.',
    )
  })

  it('never lets the signed maximum fee pass the previewed fee', async () => {
    ethereumTransport.maxFeePerGas = 4n
    ethereumTransport.maxPriorityFeePerGas = 9n
    const adapter = makeEthereumLiveAdapter(ethereumSepoliaConfiguration)

    const payload = await Effect.runPromise(
      adapter.buildTransferPayload(account, previewAtTenPerGas),
    )
    const fees = preparedFees(payload.payload)

    expect(fees.gas * fees.maxFeePerGas <= previewedFee).toBe(true)
    expect(fees.maxFeePerGas).toBe(4n)
  })
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

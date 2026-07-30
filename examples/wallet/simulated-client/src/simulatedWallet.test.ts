import { Array, Effect, Fiber, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  FirstTransactionWithRecipient,
  TransferRequest,
  UnfamiliarAddress,
  WalletClient,
  WalletSigner,
  availableSendNetworkSelections,
  transactionPreviewFromQuote,
} from 'wallet-core-example'

import {
  SimulatedWalletResources,
  simulatedPortfolio,
} from './simulatedWallet.js'

const distinctRecipientAddress = (
  chainId: string,
  networkId: string,
): string => {
  if (chainId === 'bitcoin') {
    if (networkId === 'bitcoin:regtest') {
      return 'bcrt1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'
    } else if (networkId === 'bitcoin:mainnet') {
      return 'bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'
    } else {
      return 'tb1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'
    }
  } else if (chainId === 'ethereum') {
    return '0x2222222222222222222222222222222222222222'
  } else if (chainId === 'solana') {
    return '8XSg97qfSE6n2J1aVfxyTLZgcV7R4sr1kPnCVTLMriYJ'
  } else {
    return `0x${'44'.repeat(32)}`
  }
}

describe('SimulatedWalletResources', () => {
  it('identifies every simulated account and balance as fixture data', () => {
    expect(simulatedPortfolio.dataSource).toBe('Fixture')
  })

  it('loads normalized chains, networks, assets, and accounts', async () => {
    const portfolio = await Effect.runPromise(
      WalletClient.pipe(
        Effect.flatMap(client => client.loadPortfolio([])),
        Effect.provide(SimulatedWalletResources),
      ),
    )

    expect(portfolio).toEqual(simulatedPortfolio)
    expect(portfolio.chains).toHaveLength(4)
    expect(portfolio.networks).toHaveLength(12)
    expect(portfolio.assets).toHaveLength(12)
    expect(portfolio.accounts).toHaveLength(12)
    expect(availableSendNetworkSelections(portfolio, 'Devnet')).toHaveLength(4)
    expect(availableSendNetworkSelections(portfolio, 'Testnet')).toHaveLength(4)
    expect(availableSendNetworkSelections(portfolio, 'Live')).toHaveLength(4)
    expect(
      Array.map(
        availableSendNetworkSelections(portfolio, 'Devnet'),
        selection => selection.networkId,
      ),
    ).toStrictEqual([
      'bitcoin:regtest',
      'ethereum:localnet',
      'solana:devnet',
      'sui:devnet',
    ])
    expect(
      Array.map(
        availableSendNetworkSelections(portfolio, 'Testnet'),
        selection => selection.networkId,
      ),
    ).toStrictEqual([
      'bitcoin:testnet',
      'ethereum:sepolia',
      'solana:testnet',
      'sui:testnet',
    ])
    expect(
      Array.map(
        availableSendNetworkSelections(portfolio, 'Live'),
        selection => selection.networkId,
      ),
    ).toStrictEqual([
      'bitcoin:mainnet',
      'ethereum:mainnet',
      'solana:mainnet-beta',
      'sui:mainnet',
    ])
  })

  it('makes test funding unavailable by contract on every simulated Live rail', () => {
    const liveNetworks = Array.filter(
      simulatedPortfolio.networks,
      network => network.environment === 'Mainnet',
    )

    expect(liveNetworks).toHaveLength(4)
    Array.forEach(liveNetworks, network => {
      expect(network.testFundingMethod._tag).toBe(
        'UnavailableTestFundingMethod',
      )
      expect(Array.contains(network.capabilities, 'TestFunding')).toBe(false)
    })
  })

  it('executes the generic transfer workflow without chain-specific drafts', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* WalletClient
        const signer = yield* WalletSigner
        const request = TransferRequest.make({
          transferId: 'transfer-1',
          accountId: 'simulated-solana-account',
          assetId: 'solana:devnet:sol',
          destinationAddress: '11111111111111111111111111111111',
          atomicUnits: '1000',
          maybeMessage: Option.none(),
        })
        const validation = yield* client.validateTransfer(request)
        if (validation._tag !== 'ValidatedTransfer') {
          return yield* Effect.die('Expected a validated transfer')
        }
        const quote = yield* client.previewTransfer(validation)
        const maybePreview = transactionPreviewFromQuote(
          simulatedPortfolio,
          validation,
          quote,
          UnfamiliarAddress.make({}),
          FirstTransactionWithRecipient.make({}),
        )
        if (Option.isNone(maybePreview)) {
          return yield* Effect.die('Expected a normalized preview')
        }
        const payload = yield* client.buildTransferPayload(maybePreview.value)
        const signed = yield* signer.signTransaction(payload)
        return yield* client.submitTransaction(signed)
      }).pipe(Effect.provide(SimulatedWalletResources)),
    )

    expect(result.previewId).toContain('preview-')
    expect(result.transactionId).toContain('simulated-')
  })

  it('rejects a Bitcoin address whose prefix belongs to another network mode', async () => {
    const validation = await Effect.runPromise(
      WalletClient.pipe(
        Effect.flatMap(client =>
          client.validateTransfer(
            TransferRequest.make({
              transferId: 'cross-network-bitcoin-transfer',
              accountId: 'simulated-bitcoin-mainnet-account',
              assetId: 'bitcoin:mainnet:btc',
              destinationAddress: 'tb1q2n0r7w3x8k9m4p6s5t2v7y9z3c8d4f6g0h2j5k',
              atomicUnits: '1000',
              maybeMessage: Option.none(),
            }),
          ),
        ),
        Effect.provide(SimulatedWalletResources),
      ),
    )

    expect(validation._tag).toBe('RejectedTransfer')
    if (validation._tag === 'RejectedTransfer') {
      expect(validation.guidance.summary).toBe(
        'That is not a valid Bitcoin address for this network mode.',
      )
    }
  })

  it('validates, previews, signs, submits, observes, and reloads history for all 12 simulated rails', async () => {
    const selections = [
      ...availableSendNetworkSelections(simulatedPortfolio, 'Devnet'),
      ...availableSendNetworkSelections(simulatedPortfolio, 'Testnet'),
      ...availableSendNetworkSelections(simulatedPortfolio, 'Live'),
    ]
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* WalletClient
        const signer = yield* WalletSigner
        return yield* Effect.forEach(selections, selection =>
          Effect.gen(function* () {
            const account = Option.getOrThrow(
              Array.findFirst(
                simulatedPortfolio.accounts,
                candidate => candidate.accountId === selection.accountId,
              ),
            )
            const destinationAddress = distinctRecipientAddress(
              selection.chainId,
              selection.networkId,
            )
            expect(destinationAddress).not.toBe(account.address)
            const request = TransferRequest.make({
              transferId: `transfer-${selection.networkId}`,
              accountId: selection.accountId,
              assetId: selection.assetId,
              destinationAddress,
              atomicUnits: '1000',
              maybeMessage: Option.none(),
            })
            const validation = yield* client.validateTransfer(request)
            if (validation._tag !== 'ValidatedTransfer') {
              return yield* Effect.die(
                `Expected ${selection.networkId} validation`,
              )
            }
            const quote = yield* client.previewTransfer(validation)
            const preview = Option.getOrThrow(
              transactionPreviewFromQuote(
                simulatedPortfolio,
                validation,
                quote,
                UnfamiliarAddress.make({}),
                FirstTransactionWithRecipient.make({}),
              ),
            )
            const payload = yield* client.buildTransferPayload(preview)
            const signed = yield* signer.signTransaction(payload)
            const observedFiber = yield* Effect.forkChild(
              Stream.runHead(client.observeTransactions([selection.accountId])),
            )
            yield* Effect.yieldNow
            const submission = yield* client.submitTransaction(signed)
            const maybeObserved = yield* Fiber.join(observedFiber)
            const history = yield* client.loadTransactionHistory({
              accountId: selection.accountId,
              networkId: selection.networkId,
              maybeCursor: Option.none(),
              limit: 2,
            })
            return {
              selection,
              signed,
              submission,
              maybeObserved,
              history,
            }
          }),
        )
      }).pipe(Effect.provide(SimulatedWalletResources)),
    )

    expect(results).toHaveLength(12)
    Array.forEach(results, result => {
      expect(result.signed.accountId).toBe(result.selection.accountId)
      expect(result.signed.networkId).toBe(result.selection.networkId)
      expect(result.submission.transactionId).toMatch(/^simulated-/)
      expect(Option.getOrThrow(result.maybeObserved).transactionId).toBe(
        result.submission.transactionId,
      )
      expect(result.history.records).toHaveLength(2)
      expect(
        Option.getOrThrow(Array.head(result.history.records)).transactionId,
      ).toBe(result.submission.transactionId)
    })
  })

  it('loads a finite page of normalized transaction history', async () => {
    const page = await Effect.runPromise(
      WalletClient.pipe(
        Effect.flatMap(client =>
          client.loadTransactionHistory({
            accountId: 'simulated-solana-account',
            networkId: 'solana:devnet',
            maybeCursor: Option.none(),
            limit: 1,
          }),
        ),
        Effect.provide(SimulatedWalletResources),
      ),
    )

    expect(page.records).toHaveLength(1)
    expect(Option.isNone(page.maybeNextCursor)).toBe(true)
  })

  it('records explicit test funding in observation and history', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* WalletClient
        const receipt = yield* client.requestTestFunding({
          requestId: 'funding-1',
          accountId: 'simulated-solana-account',
          chainId: 'solana',
          networkId: 'solana:devnet',
          environment: 'Development',
          assetId: 'solana:devnet:sol',
          atomicUnits: '1000000000',
        })
        const history = yield* client.loadTransactionHistory({
          accountId: 'simulated-solana-account',
          networkId: 'solana:devnet',
          maybeCursor: Option.none(),
          limit: 2,
        })
        return { receipt, history }
      }).pipe(Effect.provide(SimulatedWalletResources)),
    )

    expect(result.receipt.fundingId).toContain('simulated-funding-')
    expect(result.history.records).toHaveLength(2)
    expect(
      Option.getOrThrow(Array.head(result.history.records)).transactionId,
    ).toBe(result.receipt.fundingId)
  })
})

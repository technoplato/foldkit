import { Array, Effect, Option } from 'effect'
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
    expect(portfolio.networks).toHaveLength(8)
    expect(portfolio.assets).toHaveLength(8)
    expect(availableSendNetworkSelections(portfolio, 'Devnet')).toHaveLength(4)
    expect(availableSendNetworkSelections(portfolio, 'Testnet')).toHaveLength(4)
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

  it('previews, signs, and submits every chain in both network modes', async () => {
    const selections = [
      ...availableSendNetworkSelections(simulatedPortfolio, 'Devnet'),
      ...availableSendNetworkSelections(simulatedPortfolio, 'Testnet'),
    ]
    const transactionIds = await Effect.runPromise(
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
            const request = TransferRequest.make({
              transferId: `transfer-${selection.networkId}`,
              accountId: selection.accountId,
              assetId: selection.assetId,
              destinationAddress: account.address,
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
            const submission = yield* client.submitTransaction(signed)
            return submission.transactionId
          }),
        )
      }).pipe(Effect.provide(SimulatedWalletResources)),
    )

    expect(transactionIds).toHaveLength(8)
    expect(Array.every(transactionIds, id => id.startsWith('simulated-'))).toBe(
      true,
    )
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

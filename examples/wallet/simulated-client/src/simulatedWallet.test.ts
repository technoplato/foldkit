import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  FirstTransactionWithRecipient,
  TransferRequest,
  UnfamiliarAddress,
  WalletClient,
  WalletSigner,
  transactionPreviewFromQuote,
} from 'wallet-core-example'

import {
  SimulatedWalletResources,
  simulatedPortfolio,
} from './simulatedWallet.js'

describe('SimulatedWalletResources', () => {
  it('loads normalized chains, networks, assets, and accounts', async () => {
    const portfolio = await Effect.runPromise(
      WalletClient.pipe(
        Effect.flatMap(client => client.loadPortfolio),
        Effect.provide(SimulatedWalletResources),
      ),
    )

    expect(portfolio).toEqual(simulatedPortfolio)
    expect(portfolio.chains).toHaveLength(2)
    expect(portfolio.assets).toHaveLength(4)
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

  it('loads a finite page of normalized transaction history', async () => {
    const page = await Effect.runPromise(
      WalletClient.pipe(
        Effect.flatMap(client =>
          client.loadTransactionHistory({
            accountIds: [
              'simulated-ethereum-account',
              'simulated-solana-account',
            ],
            maybeCursor: Option.none(),
            limit: 2,
          }),
        ),
        Effect.provide(SimulatedWalletResources),
      ),
    )

    expect(page.records).toHaveLength(2)
    expect(Option.isSome(page.maybeNextCursor)).toBe(true)
  })
})

import {
  Config,
  Duration,
  Effect,
  Fiber,
  Layer,
  Option,
  Schema as S,
  Stream,
} from 'effect'
import { describe, expect, it } from 'vitest'
import {
  AtomicUnits,
  CurrencyValue,
  FirstTransactionWithRecipient,
  Sol,
  SolanaDevnet,
  TransactionPreview,
  TransferDraft,
  UnfamiliarAddress,
} from 'wallet-core-example'

import { SolanaDevnetCustody, SolanaDevnetTransport } from './chainTransport.js'
import {
  SolanaDevnetKeyConfigFromEnv,
  SolanaDevnetNodeConfig,
  SolanaDevnetNodeConfigFromEnv,
} from './config.js'
import {
  SolanaDevnetLocalCustodyLive,
  SolanaDevnetTransportLive,
} from './solanaDevnet.js'

const transferAtomicUnits = S.decodeUnknownSync(AtomicUnits)('1000000')
const observationStartupDelay = Duration.seconds(2)
const observationTimeout = Duration.seconds(45)

const SenderLive = Layer.merge(
  SolanaDevnetTransportLive,
  SolanaDevnetLocalCustodyLive,
).pipe(
  Layer.provide(
    Layer.merge(SolanaDevnetNodeConfigFromEnv, SolanaDevnetKeyConfigFromEnv),
  ),
)

describe('live Solana Devnet transfer', () => {
  it.skipIf(process.env['WALLET_SOLANA_DEVNET_LIVE_TRANSFER'] !== '1')(
    'observes a submitted transfer at the receiver through logsSubscribe',
    async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const senderAddress = yield* Config.string(
            'WALLET_SOLANA_DEVNET_ACCOUNT_ADDRESS',
          )
          const receiverAddress = yield* Config.string(
            'WALLET_SOLANA_DEVNET_LIVE_RECEIVER_ADDRESS',
          )
          const httpRpcUrl = yield* Config.redacted(
            'WALLET_SOLANA_DEVNET_HTTP_RPC_URL',
          )
          const webSocketRpcUrl = yield* Config.redacted(
            'WALLET_SOLANA_DEVNET_WS_RPC_URL',
          )
          const receiverConfig = Layer.succeed(SolanaDevnetNodeConfig, {
            accountId: 'solana-live-receiver',
            address: receiverAddress,
            displayName: 'Disposable live receiver',
            httpRpcUrl,
            webSocketRpcUrl,
          })
          const receiverLive = SolanaDevnetTransportLive.pipe(
            Layer.provide(receiverConfig),
          )
          const observedFiber = yield* SolanaDevnetTransport.pipe(
            Effect.flatMap(transport =>
              transport.observeTransactions.pipe(
                Stream.filter(
                  record =>
                    record.direction === 'Incoming' &&
                    record.value.currency._tag === 'Sol' &&
                    record.value.atomicUnits === transferAtomicUnits,
                ),
                Stream.runHead,
              ),
            ),
            Effect.provide(receiverLive),
            Effect.timeout(observationTimeout),
            Effect.forkChild,
          )

          yield* Effect.sleep(observationStartupDelay)

          const submission = yield* Effect.gen(function* () {
            const transport = yield* SolanaDevnetTransport
            const custody = yield* SolanaDevnetCustody
            const observedAt = Date.now()
            const network = SolanaDevnet.make({})
            const draft = TransferDraft.make({
              transferId: `solana-live-transfer-${observedAt}`,
              accountId: transport.account.accountId,
              network,
              destinationAddress: receiverAddress,
              value: CurrencyValue.make({
                currency: Sol.make({ network }),
                atomicUnits: transferAtomicUnits,
                decimalPlaces: 9,
                observedAt,
              }),
              maybeMessage: Option.none(),
            })
            const quote = yield* transport.previewTransaction(draft)
            const preview = TransactionPreview.make({
              previewId: quote.quoteId,
              draft,
              estimatedFee: quote.estimatedFee,
              resultingBalance: quote.resultingBalance,
              expiresAt: quote.expiresAt,
              recipientFamiliarity: UnfamiliarAddress.make({}),
              recipientHistory: FirstTransactionWithRecipient.make({}),
            })
            const prepared = yield* transport.prepareTransaction(preview)
            const digest = yield* transport.digestTransaction(prepared)
            const signed = yield* custody.signTransaction(prepared, digest)
            return yield* transport.submitTransaction(signed)
          }).pipe(Effect.provide(SenderLive))

          const maybeObserved = yield* Fiber.join(observedFiber)
          expect(Option.isSome(maybeObserved)).toBe(true)
          if (Option.isSome(maybeObserved)) {
            expect(maybeObserved.value.transactionId).toBe(
              `${submission.transactionId}:0`,
            )
            expect(maybeObserved.value.accountId).toBe('solana-live-receiver')
            expect(maybeObserved.value.counterpartyAddress).toBe(senderAddress)
            yield* Effect.sync(() =>
              process.stdout.write(
                `\nSubmitted ${submission.transactionId}\nObserved ${maybeObserved.value.transactionId} through Solana logsSubscribe\n`,
              ),
            )
          }
        }).pipe(Effect.scoped),
      )
    },
    60_000,
  )
})

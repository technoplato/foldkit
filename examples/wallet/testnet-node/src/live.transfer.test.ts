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
  Eth,
  EthereumSepolia,
  EthereumSepoliaEthTransferDraft,
  EthereumSepoliaEthValue,
  FirstTransactionWithRecipient,
  SolanaDevnet,
  SolanaDevnetSol,
  SolanaDevnetSolTransferDraft,
  SolanaDevnetSolValue,
  UnfamiliarAddress,
  transactionPreviewFromQuote,
} from 'wallet-core-example'

import {
  EthereumSepoliaCustody,
  EthereumSepoliaTransport,
  SolanaDevnetCustody,
  SolanaDevnetTransport,
} from './chainTransport.js'
import {
  EthereumSepoliaKeyConfigFromEnv,
  EthereumSepoliaNodeConfig,
  EthereumSepoliaNodeConfigFromEnv,
  SolanaDevnetKeyConfigFromEnv,
  SolanaDevnetNodeConfig,
  SolanaDevnetNodeConfigFromEnv,
} from './config.js'
import {
  EthereumSepoliaLocalCustodyLive,
  EthereumSepoliaTransportLive,
} from './ethereumSepolia.js'
import {
  SolanaDevnetLocalCustodyLive,
  SolanaDevnetTransportLive,
} from './solanaDevnet.js'

const transferAtomicUnits = S.decodeUnknownSync(AtomicUnits)('1000000')
const ethereumTransferAtomicUnits =
  S.decodeUnknownSync(AtomicUnits)('1000000000000000')
const observationStartupDelay = Duration.seconds(2)
const observationTimeout = Duration.seconds(45)
const ethereumObservationTimeout = Duration.seconds(90)

const SolanaSenderLive = Layer.merge(
  SolanaDevnetTransportLive,
  SolanaDevnetLocalCustodyLive,
).pipe(
  Layer.provide(
    Layer.merge(SolanaDevnetNodeConfigFromEnv, SolanaDevnetKeyConfigFromEnv),
  ),
)

const EthereumSenderLive = Layer.merge(
  EthereumSepoliaTransportLive,
  EthereumSepoliaLocalCustodyLive,
).pipe(
  Layer.provide(
    Layer.merge(
      EthereumSepoliaNodeConfigFromEnv,
      EthereumSepoliaKeyConfigFromEnv,
    ),
  ),
)

describe('live Ethereum Sepolia transfer', () => {
  it.skipIf(process.env['WALLET_ETHEREUM_SEPOLIA_LIVE_TRANSFER'] !== '1')(
    'observes a submitted transfer at the receiver through newHeads',
    async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const senderAddress = yield* Config.string(
            'WALLET_ETHEREUM_SEPOLIA_ACCOUNT_ADDRESS',
          )
          const receiverAddress = yield* Config.string(
            'WALLET_ETHEREUM_SEPOLIA_LIVE_RECEIVER_ADDRESS',
          )
          const httpRpcUrl = yield* Config.redacted(
            'WALLET_ETHEREUM_SEPOLIA_HTTP_RPC_URL',
          )
          const webSocketRpcUrl = yield* Config.redacted(
            'WALLET_ETHEREUM_SEPOLIA_WS_RPC_URL',
          )
          const receiverConfig = Layer.succeed(EthereumSepoliaNodeConfig, {
            accountId: 'ethereum-live-receiver',
            address: receiverAddress,
            displayName: 'Disposable live receiver',
            httpRpcUrl,
            webSocketRpcUrl,
          })
          const receiverLive = EthereumSepoliaTransportLive.pipe(
            Layer.provide(receiverConfig),
          )
          const observedFiber = yield* EthereumSepoliaTransport.pipe(
            Effect.flatMap(transport =>
              transport.observeTransactions.pipe(
                Stream.filter(
                  record =>
                    record.direction === 'Incoming' &&
                    record.value.currency._tag === 'Eth' &&
                    record.value.atomicUnits === ethereumTransferAtomicUnits &&
                    record.counterpartyAddress.toLowerCase() ===
                      senderAddress.toLowerCase(),
                ),
                Stream.runHead,
              ),
            ),
            Effect.provide(receiverLive),
            Effect.timeout(ethereumObservationTimeout),
            Effect.forkChild,
          )

          yield* Effect.sleep(observationStartupDelay)

          const submission = yield* Effect.gen(function* () {
            const transport = yield* EthereumSepoliaTransport
            const custody = yield* EthereumSepoliaCustody
            const observedAt = Date.now()
            const network = EthereumSepolia.make({})
            const draft = EthereumSepoliaEthTransferDraft.make({
              transferId: `ethereum-live-transfer-${observedAt}`,
              accountId: transport.account.accountId,
              network,
              destinationAddress: receiverAddress,
              value: EthereumSepoliaEthValue.make({
                currency: Eth.make({ network }),
                atomicUnits: ethereumTransferAtomicUnits,
                decimalPlaces: 18,
                observedAt,
              }),
              maybeMessage: Option.none(),
            })
            const quote = yield* transport.previewTransaction(draft)
            const maybePreview = transactionPreviewFromQuote(
              draft,
              quote,
              UnfamiliarAddress.make({}),
              FirstTransactionWithRecipient.make({}),
            )
            if (Option.isNone(maybePreview)) {
              return yield* Effect.die(
                'Expected an executable Ethereum transaction preview',
              )
            }
            const preview = maybePreview.value
            const prepared = yield* transport.prepareTransaction(preview)
            const digest = yield* transport.digestTransaction(prepared)
            const signed = yield* custody.signTransaction(prepared, digest)
            return yield* transport.submitTransaction(signed)
          }).pipe(Effect.provide(EthereumSenderLive))

          const maybeObserved = yield* Fiber.join(observedFiber)
          expect(Option.isSome(maybeObserved)).toBe(true)
          if (Option.isSome(maybeObserved)) {
            expect(maybeObserved.value.transactionId).toBe(
              submission.transactionId,
            )
            expect(maybeObserved.value.accountId).toBe('ethereum-live-receiver')
            yield* Effect.sync(() =>
              process.stdout.write(
                `\nSubmitted ${submission.transactionId}\nObserved ${maybeObserved.value.transactionId} through Ethereum newHeads\n`,
              ),
            )
          }
        }).pipe(Effect.scoped),
      )
    },
    120_000,
  )
})

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
            const draft = SolanaDevnetSolTransferDraft.make({
              transferId: `solana-live-transfer-${observedAt}`,
              accountId: transport.account.accountId,
              network,
              destinationAddress: receiverAddress,
              value: SolanaDevnetSolValue.make({
                currency: SolanaDevnetSol.make({ network }),
                atomicUnits: transferAtomicUnits,
                decimalPlaces: 9,
                observedAt,
              }),
              maybeMessage: Option.none(),
            })
            const quote = yield* transport.previewTransaction(draft)
            const maybePreview = transactionPreviewFromQuote(
              draft,
              quote,
              UnfamiliarAddress.make({}),
              FirstTransactionWithRecipient.make({}),
            )
            if (Option.isNone(maybePreview)) {
              return yield* Effect.die(
                'Expected an executable Solana transaction preview',
              )
            }
            const preview = maybePreview.value
            const prepared = yield* transport.prepareTransaction(preview)
            const digest = yield* transport.digestTransaction(prepared)
            const signed = yield* custody.signTransaction(prepared, digest)
            return yield* transport.submitTransaction(signed)
          }).pipe(Effect.provide(SolanaSenderLive))

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

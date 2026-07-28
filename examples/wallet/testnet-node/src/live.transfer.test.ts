import {
  Array,
  Config,
  Duration,
  Effect,
  Fiber,
  Layer,
  Option,
  Stream,
} from 'effect'
import { describe, expect, it } from 'vitest'
import {
  type AtomicUnits,
  BalanceSnapshot,
  FirstTransactionWithRecipient,
  PortfolioSnapshot,
  TransferRequest,
  UnfamiliarAddress,
  transactionPreviewFromQuote,
} from 'wallet-core-example'

import {
  type ChainCustodyService,
  type ChainTransportService,
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

const solanaTransferAtomicUnits = '1000000'
const ethereumTransferAtomicUnits = '1000000000000000'
const observationStartupDelay = Duration.seconds(2)
const solanaObservationTimeout = Duration.seconds(45)
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

const submitNativeTransfer = (
  transport: ChainTransportService,
  custody: ChainCustodyService,
  destinationAddress: string,
  atomicUnits: AtomicUnits,
) =>
  Effect.gen(function* () {
    const chainPortfolio = yield* transport.loadPortfolio
    const maybeAsset = Array.findFirst(
      chainPortfolio.assets,
      asset => asset.kind._tag === 'NativeAsset',
    )
    if (Option.isNone(maybeAsset)) {
      return yield* Effect.die('Expected a native asset')
    }
    const portfolio = PortfolioSnapshot.make({
      dataSource: 'Testnet',
      chains: [chainPortfolio.chain],
      networks: [chainPortfolio.network],
      assets: chainPortfolio.assets,
      accounts: [chainPortfolio.account],
      balanceSnapshot: BalanceSnapshot.make({
        observedAt: chainPortfolio.observedAt,
        balances: chainPortfolio.balances,
      }),
      receivingInstructions: chainPortfolio.receivingInstructions,
    })
    const request = TransferRequest.make({
      transferId: `live-transfer-${Date.now()}`,
      accountId: transport.account.accountId,
      assetId: maybeAsset.value.assetId,
      destinationAddress,
      atomicUnits,
      maybeMessage: Option.none(),
    })
    const validation = yield* transport.validateTransfer(request)
    if (validation._tag !== 'ValidatedTransfer') {
      return yield* Effect.die('Expected a validated transfer')
    }
    const quote = yield* transport.previewTransfer(validation)
    const maybePreview = transactionPreviewFromQuote(
      portfolio,
      validation,
      quote,
      UnfamiliarAddress.make({}),
      FirstTransactionWithRecipient.make({}),
    )
    if (Option.isNone(maybePreview)) {
      return yield* Effect.die('Expected an executable transaction preview')
    }
    const payload = yield* transport.buildTransferPayload(maybePreview.value)
    const signed = yield* custody.signTransaction(payload)
    return yield* transport.submitTransaction(signed)
  })

describe('live Ethereum Sepolia transfer', () => {
  it.skipIf(process.env['WALLET_ETHEREUM_SEPOLIA_LIVE_TRANSFER'] !== '1')(
    'observes a generic submitted transfer at the receiver',
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
          const receiverLive = EthereumSepoliaTransportLive.pipe(
            Layer.provide(
              Layer.succeed(EthereumSepoliaNodeConfig, {
                accountId: 'ethereum-live-receiver',
                address: receiverAddress,
                displayName: 'Disposable live receiver',
                httpRpcUrl,
                webSocketRpcUrl,
              }),
            ),
          )
          const observedFiber = yield* EthereumSepoliaTransport.pipe(
            Effect.flatMap(transport =>
              transport.observeTransactions.pipe(
                Stream.filter(
                  record =>
                    record.direction === 'Incoming' &&
                    record.amount.assetId === 'ethereum:sepolia:eth' &&
                    record.amount.atomicUnits === ethereumTransferAtomicUnits &&
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
            return yield* submitNativeTransfer(
              transport,
              custody,
              receiverAddress,
              ethereumTransferAtomicUnits,
            )
          }).pipe(Effect.provide(EthereumSenderLive))

          const maybeObserved = yield* Fiber.join(observedFiber)
          expect(Option.isSome(maybeObserved)).toBe(true)
          if (Option.isSome(maybeObserved)) {
            expect(maybeObserved.value.transactionId).toBe(
              submission.transactionId,
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
    'observes a generic submitted transfer at the receiver',
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
          const receiverLive = SolanaDevnetTransportLive.pipe(
            Layer.provide(
              Layer.succeed(SolanaDevnetNodeConfig, {
                accountId: 'solana-live-receiver',
                address: receiverAddress,
                displayName: 'Disposable live receiver',
                httpRpcUrl,
                webSocketRpcUrl,
              }),
            ),
          )
          const observedFiber = yield* SolanaDevnetTransport.pipe(
            Effect.flatMap(transport =>
              transport.observeTransactions.pipe(
                Stream.filter(
                  record =>
                    record.direction === 'Incoming' &&
                    record.amount.assetId === 'solana:devnet:sol' &&
                    record.amount.atomicUnits === solanaTransferAtomicUnits,
                ),
                Stream.runHead,
              ),
            ),
            Effect.provide(receiverLive),
            Effect.timeout(solanaObservationTimeout),
            Effect.forkChild,
          )

          yield* Effect.sleep(observationStartupDelay)

          const submission = yield* Effect.gen(function* () {
            const transport = yield* SolanaDevnetTransport
            const custody = yield* SolanaDevnetCustody
            return yield* submitNativeTransfer(
              transport,
              custody,
              receiverAddress,
              solanaTransferAtomicUnits,
            )
          }).pipe(Effect.provide(SolanaSenderLive))

          const maybeObserved = yield* Fiber.join(observedFiber)
          expect(Option.isSome(maybeObserved)).toBe(true)
          if (Option.isSome(maybeObserved)) {
            expect(maybeObserved.value.transactionId).toBe(
              `${submission.transactionId}:0`,
            )
            expect(maybeObserved.value.counterpartyAddress).toBe(senderAddress)
          }
        }).pipe(Effect.scoped),
      )
    },
    60_000,
  )
})

import {
  Array as Array_,
  Effect,
  Match as M,
  Option,
  Redacted,
  Schema as S,
  Stream,
} from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FirstTransactionWithRecipient,
  TestFundingRequest,
  TransactionHistoryQuery,
  type TransactionPayload,
  TransactionPreview,
  TransferRequest,
  UnfamiliarAddress,
  WalletAccount,
  WalletCreationRequest,
  WalletSigner,
  WalletVault,
  isNetworkEnvironmentInWalletMode,
  isTransactionSubmissionConsistent,
  makeSignedTransaction,
} from 'wallet-core-example'
import {
  BitcoinPreparedPayloadJson,
  EthereumPreparedPayloadJson,
  LiveNetworkAccount,
  type LiveWalletNetwork,
  SolanaPreparedPayloadJson,
  SuiPreparedPayloadJson,
  liveWalletNetworkDescriptors,
  liveWalletNetworkForId,
  liveWalletNetworks,
  makeLiveNetworkAdapter,
} from 'wallet-live-client-example'

import { bcs } from '@mysten/sui/bcs'
import { base64, hex } from '@scure/base'
import * as Bitcoin from '@scure/btc-signer'

import { makeLocalWalletResources } from './localWalletVault.js'

const fakeTransport = vi.hoisted(() => ({
  accountAddress: '',
  chainId: '',
  destinationAddress: '',
  fundingCalls: 0,
  submittedTransactionId: '',
}))

vi.mock('viem', async importOriginal => {
  const actual = await importOriginal<typeof import('viem')>()
  const ethereumTransactionId = `0x${'ab'.repeat(32)}`
  return {
    ...actual,
    createPublicClient: () => ({
      getBalance: async () => 1_000_000_000_000_000_000n,
      estimateFeesPerGas: async () => ({
        maxFeePerGas: 1n,
        maxPriorityFeePerGas: 1n,
      }),
      estimateGas: async () => 21_000n,
      getTransactionCount: async () => 0,
      sendRawTransaction: async () => {
        fakeTransport.submittedTransactionId = ethereumTransactionId
        return ethereumTransactionId
      },
      getBlockNumber: async () => 1n,
      getBlock: async ({ blockNumber }: Readonly<{ blockNumber: bigint }>) => ({
        timestamp: 1_750_000_000n,
        transactions:
          blockNumber === 0n
            ? []
            : [
                {
                  hash: fakeTransport.submittedTransactionId,
                  from: fakeTransport.accountAddress,
                  to: fakeTransport.destinationAddress,
                  value: 1n,
                },
              ],
      }),
      getTransactionReceipt: async () => ({ status: 'success' }),
      watchBlockNumber: ({
        onBlockNumber,
      }: Readonly<{ onBlockNumber: (blockNumber: bigint) => void }>) => {
        queueMicrotask(() => onBlockNumber(1n))
        return () => undefined
      },
    }),
  }
})

vi.mock('@mysten/sui/grpc', async importOriginal => {
  const actual = await importOriginal<typeof import('@mysten/sui/grpc')>()
  class FakeSuiGrpcClient {
    readonly core = {
      resolveTransactionPlugin:
        () =>
        async (
          transactionData: {
            gasData: {
              budget?: string
              payment?: ReadonlyArray<{
                objectId: string
                version: string
                digest: string
              }>
              price?: string
            }
          },
          _options: unknown,
          next: () => Promise<void>,
        ) => {
          transactionData.gasData.budget = '1000000'
          transactionData.gasData.payment = [
            {
              objectId: `0x${'01'.repeat(32)}`,
              version: '1',
              digest: '11111111111111111111111111111111',
            },
          ]
          transactionData.gasData.price = '1000'
          await next()
        },
    }

    async getBalance() {
      return { balance: { balance: '1000000000' } }
    }

    async simulateTransaction() {
      return {
        $kind: 'Transaction',
        Transaction: {
          effects: {
            gasUsed: {
              computationCost: '100',
              storageCost: '100',
              storageRebate: '0',
            },
          },
        },
      }
    }

    async executeTransaction() {
      fakeTransport.submittedTransactionId = 'sui-submitted-transaction'
      return {
        $kind: 'Transaction',
        Transaction: { digest: fakeTransport.submittedTransactionId },
      }
    }
  }
  return { ...actual, SuiGrpcClient: FakeSuiGrpcClient }
})

vi.mock('@mysten/sui/faucet', async importOriginal => {
  const actual = await importOriginal<typeof import('@mysten/sui/faucet')>()
  return {
    ...actual,
    requestSuiFromFaucetV2: async () => {
      fakeTransport.fundingCalls += 1
      return {
        coins_sent: [
          {
            amount: 1_000_000,
            id: 'sui-funded-coin',
            transferTxDigest: 'sui-funding-transaction',
          },
        ],
      }
    },
  }
})

const JsonRpcRequest = S.Struct({ method: S.String })
const JsonRpcRequestJson = S.fromJsonString(JsonRpcRequest)
const observedAtIso = '2026-07-30T12:00:00.000Z'
const solanaTransactionId = 'solana-transaction-signature'

const ConformanceRow = S.Struct({
  chainId: S.String,
  mode: S.Literals(['Devnet', 'Testnet', 'Live']),
  networkId: S.String,
  fundingMethod: S.Literals([
    'AdapterTestFundingMethod',
    'ExternalTestFundingMethod',
    'UnavailableTestFundingMethod',
  ]),
})

const conformanceRows: ReadonlyArray<typeof ConformanceRow.Type> = [
  ConformanceRow.make({
    chainId: 'bitcoin',
    mode: 'Devnet',
    networkId: 'bitcoin:signet',
    fundingMethod: 'ExternalTestFundingMethod',
  }),
  ConformanceRow.make({
    chainId: 'bitcoin',
    mode: 'Testnet',
    networkId: 'bitcoin:testnet4',
    fundingMethod: 'ExternalTestFundingMethod',
  }),
  ConformanceRow.make({
    chainId: 'bitcoin',
    mode: 'Live',
    networkId: 'bitcoin:mainnet',
    fundingMethod: 'UnavailableTestFundingMethod',
  }),
  ConformanceRow.make({
    chainId: 'ethereum',
    mode: 'Devnet',
    networkId: 'ethereum:anvil',
    fundingMethod: 'AdapterTestFundingMethod',
  }),
  ConformanceRow.make({
    chainId: 'ethereum',
    mode: 'Testnet',
    networkId: 'ethereum:sepolia',
    fundingMethod: 'ExternalTestFundingMethod',
  }),
  ConformanceRow.make({
    chainId: 'ethereum',
    mode: 'Live',
    networkId: 'ethereum:mainnet',
    fundingMethod: 'UnavailableTestFundingMethod',
  }),
  ConformanceRow.make({
    chainId: 'solana',
    mode: 'Devnet',
    networkId: 'solana:devnet',
    fundingMethod: 'AdapterTestFundingMethod',
  }),
  ConformanceRow.make({
    chainId: 'solana',
    mode: 'Testnet',
    networkId: 'solana:testnet',
    fundingMethod: 'AdapterTestFundingMethod',
  }),
  ConformanceRow.make({
    chainId: 'solana',
    mode: 'Live',
    networkId: 'solana:mainnet-beta',
    fundingMethod: 'UnavailableTestFundingMethod',
  }),
  ConformanceRow.make({
    chainId: 'sui',
    mode: 'Devnet',
    networkId: 'sui:devnet',
    fundingMethod: 'AdapterTestFundingMethod',
  }),
  ConformanceRow.make({
    chainId: 'sui',
    mode: 'Testnet',
    networkId: 'sui:testnet',
    fundingMethod: 'AdapterTestFundingMethod',
  }),
  ConformanceRow.make({
    chainId: 'sui',
    mode: 'Live',
    networkId: 'sui:mainnet',
    fundingMethod: 'UnavailableTestFundingMethod',
  }),
]

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const bitcoinHistoryTransaction = () => ({
  txid: fakeTransport.submittedTransactionId,
  vin: [
    {
      prevout: {
        scriptpubkey_address: fakeTransport.accountAddress,
        value: 2_000,
      },
    },
  ],
  vout: [
    {
      scriptpubkey_address: fakeTransport.destinationAddress,
      value: 1_000,
    },
  ],
  status: { confirmed: true, block_time: 1_750_000_000 },
})

const solanaTransaction = () => ({
  blockTime: 1_750_000_000,
  meta: { err: null, innerInstructions: [] },
  transaction: {
    message: {
      instructions: [
        {
          program: 'system',
          parsed: {
            type: 'transfer',
            info: {
              source: fakeTransport.accountAddress,
              destination: fakeTransport.destinationAddress,
              lamports: 1,
            },
          },
        },
      ],
    },
  },
})

const suiHistoryResponse = (isNextPage: boolean) => ({
  data: {
    transactions: {
      pageInfo: {
        hasPreviousPage: !isNextPage,
        startCursor: isNextPage ? null : 'sui-next-page',
      },
      nodes: isNextPage
        ? []
        : [
            {
              digest: fakeTransport.submittedTransactionId,
              sender: { address: fakeTransport.accountAddress },
              effects: {
                timestamp: observedAtIso,
                status: 'SUCCESS',
                balanceChanges: {
                  pageInfo: { hasNextPage: false },
                  nodes: [
                    {
                      amount: '-1',
                      coinType: { repr: '0x2::sui::SUI' },
                      owner: { address: fakeTransport.accountAddress },
                    },
                    {
                      amount: '1',
                      coinType: { repr: '0x2::sui::SUI' },
                      owner: { address: fakeTransport.destinationAddress },
                    },
                  ],
                },
              },
            },
          ],
    },
  },
})

const fakeFetch = vi.fn(
  async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    const body = String(init?.body ?? '')

    if (fakeTransport.chainId === 'bitcoin') {
      if (url.endsWith('/v1/fees/recommended')) {
        return jsonResponse({
          fastestFee: 1,
          halfHourFee: 1,
          hourFee: 1,
          economyFee: 1,
          minimumFee: 1,
        })
      }
      if (url.includes('/utxo')) {
        return jsonResponse([
          {
            txid: '01'.repeat(32),
            vout: 0,
            value: 100_000,
            status: { confirmed: true, block_time: 1_750_000_000 },
          },
        ])
      }
      if (url.endsWith('/tx') && init?.method === 'POST') {
        const transactionId = Bitcoin.Transaction.fromRaw(hex.decode(body)).id
        fakeTransport.submittedTransactionId = transactionId
        return new Response(transactionId, { status: 200 })
      }
      if (url.includes('/txs/chain/')) {
        return jsonResponse([])
      }
      if (url.includes('/txs')) {
        return jsonResponse([bitcoinHistoryTransaction()])
      }
    }

    if (fakeTransport.chainId === 'ethereum') {
      if (url.includes('/addresses/') && url.includes('/transactions')) {
        const isNextPage = url.includes('?')
        return jsonResponse({
          items: isNextPage
            ? []
            : [
                {
                  timestamp: observedAtIso,
                  status: 'ok',
                  hash: fakeTransport.submittedTransactionId,
                  from: { hash: fakeTransport.accountAddress },
                  to: { hash: fakeTransport.accountAddress },
                  value: '1',
                },
              ],
          next_page_params: isNextPage
            ? null
            : { block_number: 1, index: 0, items_count: 1 },
        })
      }
      const request = S.decodeUnknownSync(JsonRpcRequestJson)(body)
      if (request.method === 'anvil_setBalance') {
        fakeTransport.fundingCalls += 1
        return jsonResponse({ result: true })
      }
    }

    if (fakeTransport.chainId === 'solana') {
      const request = S.decodeUnknownSync(JsonRpcRequestJson)(body)
      if (request.method === 'getBalance') {
        return jsonResponse({ result: { value: 1_000_000_000 } })
      }
      if (request.method === 'getLatestBlockhash') {
        return jsonResponse({
          result: {
            value: {
              blockhash: '11111111111111111111111111111111',
              lastValidBlockHeight: 1,
            },
          },
        })
      }
      if (request.method === 'getFeeForMessage') {
        return jsonResponse({ result: { value: 5_000 } })
      }
      if (request.method === 'sendTransaction') {
        fakeTransport.submittedTransactionId = solanaTransactionId
        return jsonResponse({ result: solanaTransactionId })
      }
      if (request.method === 'getSignaturesForAddress') {
        return jsonResponse({
          result: body.includes('"before"')
            ? []
            : [
                {
                  signature: solanaTransactionId,
                  blockTime: 1_750_000_000,
                },
              ],
        })
      }
      if (request.method === 'getTransaction') {
        return jsonResponse({ result: solanaTransaction() })
      }
      if (request.method === 'requestAirdrop') {
        fakeTransport.fundingCalls += 1
        return jsonResponse({ result: 'solana-funding-transaction' })
      }
    }

    if (fakeTransport.chainId === 'sui' && init?.method === 'POST') {
      return jsonResponse(suiHistoryResponse(body.includes('sui-next-page')))
    }

    throw new Error(`Unexpected external request for ${url}`)
  },
)

type FakeWebSocketListener = (event: Readonly<{ data: string }>) => void

class FakeWebSocket {
  private readonly listeners = new Map<string, Set<FakeWebSocketListener>>()

  constructor(_url: string) {
    queueMicrotask(() => this.emit('open'))
  }

  addEventListener(type: string, listener: FakeWebSocketListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  send(_message: string) {
    if (fakeTransport.chainId === 'bitcoin') {
      queueMicrotask(() =>
        this.emit(
          'message',
          JSON.stringify({
            'address-transactions': [bitcoinHistoryTransaction()],
          }),
        ),
      )
    } else if (fakeTransport.chainId === 'solana') {
      queueMicrotask(() =>
        this.emit(
          'message',
          JSON.stringify({
            params: {
              result: {
                value: { signature: solanaTransactionId },
              },
            },
          }),
        ),
      )
    }
  }

  close() {}

  private emit(type: string, data = '') {
    const listeners = this.listeners.get(type)
    if (listeners !== undefined) {
      for (const listener of listeners) {
        listener({ data })
      }
    }
  }
}

const walletCreationRequest = WalletCreationRequest.make({
  requestId: 'conformance-wallet',
  displayName: 'Conformance Wallet',
  networks: liveWalletNetworkDescriptors,
})
const recipientWalletCreationRequest = WalletCreationRequest.make({
  requestId: 'conformance-recipient-wallet',
  displayName: 'Conformance Recipient Wallet',
  networks: liveWalletNetworkDescriptors,
})

const makeDeterministicRandomBytes = () => {
  let nextByte = 1
  return (byteCount: number): Uint8Array => {
    const bytes = new Uint8Array(byteCount)
    bytes.fill(nextByte)
    nextByte += 1
    return bytes
  }
}

const configurationForRow = (
  row: typeof ConformanceRow.Type,
): LiveWalletNetwork => {
  const maybeConfiguration = liveWalletNetworkForId(row.networkId)
  if (Option.isNone(maybeConfiguration)) {
    throw new Error(`Missing ${row.networkId} from the live Wallet catalog`)
  } else {
    return maybeConfiguration.value
  }
}

const assertPreparedPayload = (
  configuration: LiveWalletNetwork,
  account: typeof LiveNetworkAccount.Type,
  preview: typeof TransactionPreview.Type,
  payload: TransactionPayload,
) => {
  expect(payload.accountId).toBe(account.account.accountId)
  expect(payload.networkId).toBe(configuration.network.networkId)
  M.value(configuration).pipe(
    M.tagsExhaustive({
      BitcoinLiveNetwork: bitcoinConfiguration => {
        const prepared = S.decodeUnknownSync(BitcoinPreparedPayloadJson)(
          Redacted.value(payload.payload),
        )
        const transaction = Bitcoin.Transaction.fromPSBT(
          hex.decode(prepared.psbtHex),
        )
        expect(transaction.outputsLength).toBeGreaterThan(0)
        if (transaction.outputsLength === 0) {
          throw new Error('Expected a Bitcoin transfer output')
        }
        const outputIndexes = Array_.range(0, transaction.outputsLength - 1)
        const hasExactTransferOutput = Array_.some(
          outputIndexes,
          outputIndex => {
            const output = transaction.getOutput(outputIndex)
            return (
              output.amount === BigInt(preview.transfer.request.atomicUnits) &&
              transaction.getOutputAddress(outputIndex, {
                bech32: bitcoinConfiguration.bech32,
                pubKeyHash: bitcoinConfiguration.pubKeyHash,
                scriptHash: bitcoinConfiguration.scriptHash,
                wif: bitcoinConfiguration.wif,
              }) === preview.transfer.recipient.address
            )
          },
        )
        expect(prepared.previewId).toBe(preview.previewId)
        expect(hasExactTransferOutput).toBe(true)
      },
      EthereumLiveNetwork: ethereumConfiguration => {
        const prepared = S.decodeUnknownSync(EthereumPreparedPayloadJson)(
          Redacted.value(payload.payload),
        )
        expect(prepared.previewId).toBe(preview.previewId)
        expect(prepared.chainId).toBe(ethereumConfiguration.numericChainId)
        expect(prepared.to).toBe(preview.transfer.recipient.address)
        expect(prepared.value).toBe(preview.transfer.request.atomicUnits)
      },
      SolanaLiveNetwork: () => {
        const prepared = S.decodeUnknownSync(SolanaPreparedPayloadJson)(
          Redacted.value(payload.payload),
        )
        expect(prepared.previewId).toBe(preview.previewId)
        expect(prepared.sourceAddress).toBe(account.account.address)
        expect(prepared.destinationAddress).toBe(
          preview.transfer.recipient.address,
        )
        expect(prepared.atomicUnits).toBe(preview.transfer.request.atomicUnits)
      },
      SuiLiveNetwork: () => {
        const prepared = S.decodeUnknownSync(SuiPreparedPayloadJson)(
          Redacted.value(payload.payload),
        )
        const transactionData = bcs.TransactionData.parse(
          base64.decode(prepared.transactionBytesBase64),
        )
        if (
          transactionData.V1 === null ||
          transactionData.V1.kind.$kind !== 'ProgrammableTransaction'
        ) {
          throw new Error('Expected a Sui programmable transaction')
        }
        const inputs = transactionData.V1.kind.ProgrammableTransaction.inputs
        const containsTransferAmount = Array_.some(inputs, input => {
          if (input.$kind !== 'Pure') {
            return false
          }
          try {
            return (
              bcs.U64.parse(base64.decode(input.Pure.bytes)) ===
              preview.transfer.request.atomicUnits
            )
          } catch {
            return false
          }
        })
        const containsDestination = Array_.some(inputs, input => {
          if (input.$kind !== 'Pure') {
            return false
          }
          try {
            return (
              bcs.Address.parse(base64.decode(input.Pure.bytes)) ===
              preview.transfer.recipient.address
            )
          } catch {
            return false
          }
        })
        expect(prepared.previewId).toBe(preview.previewId)
        expect(transactionData.V1.sender).toBe(account.account.address)
        expect(containsTransferAmount).toBe(true)
        expect(containsDestination).toBe(true)
      },
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  fakeTransport.accountAddress = ''
  fakeTransport.chainId = ''
  fakeTransport.destinationAddress = ''
  fakeTransport.fundingCalls = 0
  fakeTransport.submittedTransactionId = ''
  fakeFetch.mockClear()
})

describe.sequential('live Wallet adapter conformance', () => {
  it('declares the exact supported chain, mode, network, and funding matrix', () => {
    expect(
      Array_.map(liveWalletNetworks, configuration => ({
        chainId: configuration.chain.chainId,
        networkId: configuration.network.networkId,
        fundingMethod: configuration.network.testFundingMethod._tag,
      })),
    ).toStrictEqual(
      Array_.map(conformanceRows, row => ({
        chainId: row.chainId,
        networkId: row.networkId,
        fundingMethod: row.fundingMethod,
      })),
    )
    Array_.forEach(conformanceRows, row => {
      const configuration = configurationForRow(row)
      expect(
        isNetworkEnvironmentInWalletMode(
          configuration.network.environment,
          row.mode,
        ),
      ).toBe(true)
    })
  })

  it.each(conformanceRows)(
    '$networkId executes its fail-closed Wallet lifecycle',
    async row => {
      const configuration = configurationForRow(row)
      vi.stubGlobal('fetch', fakeFetch)
      vi.stubGlobal('WebSocket', FakeWebSocket)

      await Effect.runPromise(
        Effect.gen(function* () {
          const vault = yield* WalletVault
          const signer = yield* WalletSigner
          const wallet = yield* vault.createWallet(walletCreationRequest)
          const recipientWallet = yield* vault.createWallet(
            recipientWalletCreationRequest,
          )
          const maybeProfile = Array_.findFirst(
            wallet.accounts,
            account => account.networkId === configuration.network.networkId,
          )
          const maybeRecipientProfile = Array_.findFirst(
            recipientWallet.accounts,
            account => account.networkId === configuration.network.networkId,
          )
          if (Option.isNone(maybeProfile)) {
            throw new Error(`Missing ${row.networkId} Wallet account`)
          } else if (Option.isNone(maybeRecipientProfile)) {
            throw new Error(`Missing ${row.networkId} recipient Wallet account`)
          }
          const profile = maybeProfile.value
          const recipientProfile = maybeRecipientProfile.value
          const account = LiveNetworkAccount.make({
            profile,
            account: WalletAccount.make(profile),
            configuration,
          })
          expect(recipientProfile.address).not.toBe(account.account.address)
          fakeTransport.accountAddress = account.account.address
          fakeTransport.chainId = configuration.chain.chainId
          fakeTransport.destinationAddress = recipientProfile.address
          const adapter = makeLiveNetworkAdapter(configuration)
          const request = TransferRequest.make({
            transferId: `transfer:${row.networkId}`,
            accountId: account.account.accountId,
            assetId: configuration.asset.assetId,
            destinationAddress: recipientProfile.address,
            atomicUnits: configuration.asset.suggestedTestTransferAtomicUnits,
            maybeMessage: Option.none(),
          })
          const invalidRequest = TransferRequest.make({
            ...request,
            assetId: `${configuration.asset.assetId}:wrong`,
          })
          const invalidFailure = yield* adapter
            .validateTransfer(account, invalidRequest)
            .pipe(Effect.flip)
          expect(invalidFailure.code).toBe('InvalidResponse')

          const validation = yield* adapter.validateTransfer(account, request)
          expect(validation._tag).toBe('ValidatedTransfer')
          if (validation._tag !== 'ValidatedTransfer') {
            throw new Error(
              `${row.networkId} rejected its exact account address`,
            )
          }
          const quote = yield* adapter.previewTransfer(account, validation)
          const preview = TransactionPreview.make({
            previewId: quote.quoteId,
            transfer: validation,
            estimatedFee: quote.estimatedFee,
            resultingBalance: quote.resultingBalance,
            expiresAt: quote.expiresAt,
            recipientFamiliarity: UnfamiliarAddress.make({}),
            recipientHistory: FirstTransactionWithRecipient.make({}),
          })
          const payload = yield* adapter.buildTransferPayload(account, preview)
          assertPreparedPayload(configuration, account, preview, payload)
          const signed = yield* signer.signTransaction(payload)
          expect(signed.accountId).toBe(account.account.accountId)
          expect(signed.networkId).toBe(row.networkId)
          const mismatchedSubmission = yield* adapter
            .submitTransaction(
              account,
              makeSignedTransaction(
                signed.accountId,
                `${row.networkId}:wrong`,
                'not-a-signed-transaction',
              ),
            )
            .pipe(Effect.flip)
          expect(mismatchedSubmission.code).toBe('InvalidResponse')
          const submission = yield* adapter.submitTransaction(account, signed)
          expect(isTransactionSubmissionConsistent(preview, submission)).toBe(
            true,
          )
          expect(fakeTransport.submittedTransactionId).toBe(
            submission.transactionId,
          )

          const firstPage = yield* adapter.loadTransactionHistory(
            account,
            TransactionHistoryQuery.make({
              accountId: account.account.accountId,
              networkId: configuration.network.networkId,
              maybeCursor: Option.none(),
              limit: 1,
            }),
          )
          expect(firstPage.records).toHaveLength(1)
          const maybeFirstRecord = Array_.head(firstPage.records)
          expect(Option.isSome(maybeFirstRecord)).toBe(true)
          if (Option.isSome(maybeFirstRecord)) {
            expect(maybeFirstRecord.value.accountId).toBe(
              account.account.accountId,
            )
            expect(maybeFirstRecord.value.transactionId).toBe(
              submission.transactionId,
            )
          }
          expect(Option.isSome(firstPage.maybeNextCursor)).toBe(true)
          if (Option.isNone(firstPage.maybeNextCursor)) {
            throw new Error(`${row.networkId} did not expose a history cursor`)
          }
          const secondPage = yield* adapter.loadTransactionHistory(
            account,
            TransactionHistoryQuery.make({
              accountId: account.account.accountId,
              networkId: configuration.network.networkId,
              maybeCursor: firstPage.maybeNextCursor,
              limit: 1,
            }),
          )
          expect(secondPage.records).toStrictEqual([])
          expect(Option.isNone(secondPage.maybeNextCursor)).toBe(true)

          const maybeObserved = yield* Stream.runHead(
            adapter.observeTransactions(account),
          )
          expect(Option.isSome(maybeObserved)).toBe(true)
          if (Option.isSome(maybeObserved)) {
            expect(maybeObserved.value.accountId).toBe(
              account.account.accountId,
            )
            expect(maybeObserved.value.networkId).toBe(row.networkId)
            expect(maybeObserved.value.transactionId).toBe(
              submission.transactionId,
            )
          }

          const fundingMethod = configuration.network.testFundingMethod._tag
          expect(fundingMethod).toBe(row.fundingMethod)
          const hasAdapterFunding =
            configuration.network.capabilities.includes('TestFunding')
          const hasExternalFunding =
            configuration.network.capabilities.includes('ExternalTestFunding')
          expect(hasAdapterFunding).toBe(
            fundingMethod === 'AdapterTestFundingMethod',
          )
          expect(hasExternalFunding).toBe(
            fundingMethod === 'ExternalTestFundingMethod',
          )
          const fundingCallsBeforeRequest = fakeTransport.fundingCalls
          if (configuration.network.environment === 'Mainnet') {
            expect(
              Option.isNone(
                S.decodeUnknownOption(TestFundingRequest)({
                  requestId: `funding:${row.networkId}`,
                  accountId: account.account.accountId,
                  chainId: configuration.chain.chainId,
                  networkId: configuration.network.networkId,
                  environment: configuration.network.environment,
                  assetId: configuration.asset.assetId,
                  atomicUnits: '1',
                }),
              ),
            ).toBe(true)
            expect(fundingMethod).toBe('UnavailableTestFundingMethod')
            const failure = yield* adapter
              .requestTestFunding(
                account,
                TestFundingRequest.make({
                  requestId: `funding:${row.networkId}`,
                  accountId: account.account.accountId,
                  chainId: configuration.chain.chainId,
                  networkId: configuration.network.networkId,
                  environment: 'Testnet',
                  assetId: configuration.asset.assetId,
                  atomicUnits: '1',
                }),
              )
              .pipe(Effect.flip)
            expect(failure.code).toBe('UnsupportedCapability')
            expect(fakeTransport.fundingCalls).toBe(fundingCallsBeforeRequest)
          } else {
            const fundingRequest = TestFundingRequest.make({
              requestId: `funding:${row.networkId}`,
              accountId: account.account.accountId,
              chainId: configuration.chain.chainId,
              networkId: configuration.network.networkId,
              environment: configuration.network.environment,
              assetId: configuration.asset.assetId,
              atomicUnits: '1',
            })
            if (fundingMethod === 'AdapterTestFundingMethod') {
              const receipt = yield* adapter.requestTestFunding(
                account,
                fundingRequest,
              )
              expect(receipt.requestId).toBe(fundingRequest.requestId)
              expect(BigInt(receipt.amount.atomicUnits)).toBeGreaterThan(0n)
              expect(fakeTransport.fundingCalls).toBe(
                fundingCallsBeforeRequest + 1,
              )
            } else {
              const failure = yield* adapter
                .requestTestFunding(account, fundingRequest)
                .pipe(Effect.flip)
              expect(failure.code).toBe('UnsupportedCapability')
              expect(fakeTransport.fundingCalls).toBe(fundingCallsBeforeRequest)
            }
          }
        }).pipe(
          Effect.provide(
            makeLocalWalletResources(makeDeterministicRandomBytes()),
          ),
        ),
      )
      expect(fakeFetch).toHaveBeenCalled()
    },
  )
})

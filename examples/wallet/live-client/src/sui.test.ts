import { Array, Effect, Option, Schema as S, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TransactionHistoryQuery,
  TransferRequest,
  WalletAccount,
  WalletProfileAccount,
} from 'wallet-core-example'

import { LiveNetworkAccount } from './adapter.js'
import { liveWalletNetworkForId } from './catalog.js'
import { makeSuiLiveAdapter } from './sui.js'

const suiTransport = vi.hoisted(() => ({
  balance: 10_000n,
  simulationCalls: 0,
  simulationMode: 'Success',
}))

vi.mock('@mysten/sui/grpc', async importOriginal => {
  const actual = await importOriginal<typeof import('@mysten/sui/grpc')>()
  class FakeSuiGrpcClient {
    async getBalance() {
      return { balance: { balance: suiTransport.balance.toString() } }
    }

    async simulateTransaction() {
      suiTransport.simulationCalls += 1
      return {
        $kind: 'Transaction',
        Transaction: {
          effects: {
            status:
              suiTransport.simulationMode === 'Success'
                ? { success: true, error: null }
                : {
                    success: false,
                    error: { $kind: 'InsufficientGas' },
                  },
            gasUsed: {
              computationCost: '100',
              storageCost: '100',
              storageRebate: '0',
              nonRefundableStorageFee: '0',
            },
          },
        },
      }
    }
  }
  return { ...actual, SuiGrpcClient: FakeSuiGrpcClient }
})

const accountAddress = `0x${'11'.repeat(32)}`
const recipientAddress = `0x${'22'.repeat(32)}`
const transactionId = 'sui-transaction-digest'
const GraphQlRequest = S.Struct({ query: S.String })
const GraphQlRequestJson = S.fromJsonString(GraphQlRequest)

const suiDevnetConfiguration = (() => {
  const maybeConfiguration = liveWalletNetworkForId('sui:devnet')
  if (
    Option.isNone(maybeConfiguration) ||
    maybeConfiguration.value._tag !== 'SuiLiveNetwork'
  ) {
    throw new Error('Missing Sui Devnet configuration')
  }
  return maybeConfiguration.value
})()

const profile = WalletProfileAccount.make({
  accountId: 'wallet-1:sui:devnet',
  chainId: 'sui',
  networkId: 'sui:devnet',
  address: accountAddress,
  displayName: 'Wallet 1 Sui Devnet',
})
const account = LiveNetworkAccount.make({
  profile,
  account: WalletAccount.make(profile),
  configuration: suiDevnetConfiguration,
})
const request = TransferRequest.make({
  transferId: 'sui-preview',
  accountId: account.account.accountId,
  assetId: suiDevnetConfiguration.asset.assetId,
  destinationAddress: recipientAddress,
  atomicUnits: suiDevnetConfiguration.asset.suggestedTestTransferAtomicUnits,
  maybeMessage: Option.none(),
})

const previewFailure = async () => {
  const adapter = makeSuiLiveAdapter(suiDevnetConfiguration)
  const validation = await Effect.runPromise(
    adapter.validateTransfer(account, request),
  )
  if (validation._tag === 'RejectedTransfer') {
    throw new Error('Expected the Sui recipient to validate')
  }
  return Effect.runPromise(
    adapter.previewTransfer(account, validation).pipe(Effect.flip),
  )
}

const graphQlResponse = {
  data: {
    transactions: {
      pageInfo: { hasPreviousPage: false, startCursor: null },
      nodes: [
        {
          digest: transactionId,
          sender: { address: accountAddress },
          effects: {
            timestamp: '2026-07-30T12:00:00.000Z',
            status: 'SUCCESS',
            balanceChanges: {
              pageInfo: { hasNextPage: false },
              nodes: [
                {
                  amount: '-1000',
                  coinType: { repr: '0x2::sui::SUI' },
                  owner: { address: accountAddress },
                },
                {
                  amount: '1000',
                  coinType: { repr: '0x2::sui::SUI' },
                  owner: { address: recipientAddress },
                },
              ],
            },
          },
        },
      ],
    },
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
  suiTransport.balance = 10_000n
  suiTransport.simulationCalls = 0
  suiTransport.simulationMode = 'Success'
})

describe('Sui live adapter history and observation', () => {
  it('rejects an obviously insufficient balance before simulation', async () => {
    suiTransport.balance = 0n

    const failure = await previewFailure()

    expect(failure.code).toBe('Rejected')
    expect(suiTransport.simulationCalls).toBe(0)
  })

  it('rejects a failed simulation instead of presenting a quote', async () => {
    suiTransport.simulationMode = 'Failed'

    const failure = await previewFailure()

    expect(failure.code).toBe('Rejected')
    expect(suiTransport.simulationCalls).toBe(1)
  })

  it('uses the public GraphQL page limit and normalizes paginated history', async () => {
    const requestBodies: Array<string> = []
    const fetchRequest = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        requestBodies.push(String(init?.body))
        return new Response(JSON.stringify(graphQlResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    )
    vi.stubGlobal('fetch', fetchRequest)
    const adapter = makeSuiLiveAdapter(suiDevnetConfiguration)
    const page = await Effect.runPromise(
      adapter.loadTransactionHistory(
        account,
        TransactionHistoryQuery.make({
          accountId: account.account.accountId,
          networkId: account.account.networkId,
          maybeCursor: Option.none(),
          limit: 50,
        }),
      ),
    )
    const maybeRequestBody = Array.head(requestBodies)
    if (Option.isNone(maybeRequestBody)) {
      throw new Error('Missing Sui GraphQL request')
    }
    const body = S.decodeUnknownSync(GraphQlRequestJson)(maybeRequestBody.value)
    const record = Option.getOrThrow(Array.head(page.records))

    expect(body.query).toContain('balanceChanges(first: 50)')
    expect(body.query).not.toContain('balanceChanges(first: 100)')
    expect(page.records).toHaveLength(1)
    expect(record.transactionId).toBe(transactionId)
    expect(record.direction).toBe('Outgoing')
  })

  it('observes browser-compatible transaction updates through GraphQL polling', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response(JSON.stringify(graphQlResponse), { status: 200 }),
        ),
      ),
    )
    const adapter = makeSuiLiveAdapter(suiDevnetConfiguration)
    const maybeRecord = await Effect.runPromise(
      Stream.runHead(adapter.observeTransactions(account)),
    )

    expect(Option.isSome(maybeRecord)).toBe(true)
    if (Option.isSome(maybeRecord)) {
      expect(maybeRecord.value.transactionId).toBe(transactionId)
      expect(maybeRecord.value.status).toBe('Confirmed')
    }
  })
})

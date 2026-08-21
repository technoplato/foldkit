import { Effect, Option, Schema as S } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AtomicUnits,
  TestFundingRequest,
  TransactionHistoryQuery,
  TransferRequest,
  ValidatedRecipient,
  ValidatedTransfer,
  WalletAccount,
  WalletProfileAccount,
  makeSignedTransaction,
} from 'wallet-core-example'

import { LiveNetworkAccount } from './adapter.js'
import { liveWalletNetworkForId } from './catalog.js'
import {
  SolanaSignedPayload,
  SolanaSignedPayloadJson,
  makeSolanaLiveAdapter,
} from './solana.js'

const solanaDevnetConfiguration = (() => {
  const maybeConfiguration = liveWalletNetworkForId('solana:devnet')
  if (
    Option.isNone(maybeConfiguration) ||
    maybeConfiguration.value._tag !== 'SolanaLiveNetwork'
  ) {
    throw new Error('Missing Solana Devnet configuration')
  }
  return maybeConfiguration.value
})()

const profile = WalletProfileAccount.make({
  accountId: 'wallet-1:solana:devnet',
  chainId: 'solana',
  networkId: 'solana:devnet',
  address: '11111111111111111111111111111111',
  displayName: 'Wallet 1 Solana Devnet',
})
const account = LiveNetworkAccount.make({
  profile,
  account: WalletAccount.make(profile),
  configuration: solanaDevnetConfiguration,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Solana live adapter numeric boundaries', () => {
  it('loads exact safe-integer lamports', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response(JSON.stringify({ result: { value: 1_000_000_000 } }), {
            status: 200,
          }),
        ),
      ),
    )
    const adapter = makeSolanaLiveAdapter(solanaDevnetConfiguration)
    const balance = await Effect.runPromise(adapter.loadBalance(account))

    expect(balance.amount.atomicUnits).toBe('1000000000')
  })

  it('rejects imprecise numeric lamports from JSON-RPC', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ result: { value: Number.MAX_SAFE_INTEGER + 1 } }),
            { status: 200 },
          ),
        ),
      ),
    )
    const adapter = makeSolanaLiveAdapter(solanaDevnetConfiguration)
    const failure = await Effect.runPromise(
      adapter.loadBalance(account).pipe(Effect.flip),
    )

    expect(failure.code).toBe('InvalidResponse')
  })

  it('rejects invalid history limits and unsafe faucet amounts before I/O', async () => {
    const fetchRequest = vi.fn()
    vi.stubGlobal('fetch', fetchRequest)
    const adapter = makeSolanaLiveAdapter(solanaDevnetConfiguration)
    expect(() =>
      TransactionHistoryQuery.make({
        accountId: account.account.accountId,
        networkId: account.account.networkId,
        maybeCursor: Option.none(),
        limit: 0,
      }),
    ).toThrow()
    const fundingFailure = await Effect.runPromise(
      adapter
        .requestTestFunding(
          account,
          TestFundingRequest.make({
            requestId: 'funding-unsafe',
            accountId: account.account.accountId,
            chainId: account.account.chainId,
            networkId: account.account.networkId,
            environment: 'Development',
            assetId: solanaDevnetConfiguration.asset.assetId,
            atomicUnits: S.decodeUnknownSync(AtomicUnits)(
              (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(),
            ),
          }),
        )
        .pipe(Effect.flip),
    )

    expect(fundingFailure.code).toBe('Rejected')
    expect(fetchRequest).not.toHaveBeenCalled()
  })
})

const missingDestinationAddress = '9MyppxqWYUi8e5jpzbuu5rtA8DVp4SD7f9nYbZaJFyjs'
const previewSourceAddress = 'BVxByx6utoGMfHC3ZEr6Coux8awYvJo84MjYmAAQ1kiM'
const previewProfile = WalletProfileAccount.make({
  ...profile,
  address: previewSourceAddress,
})
const previewAccount = LiveNetworkAccount.make({
  profile: previewProfile,
  account: WalletAccount.make(previewProfile),
  configuration: solanaDevnetConfiguration,
})

const JsonRpcMethodRequest = S.Struct({ method: S.String })

const jsonRpcFetch = (
  handlers: Record<
    string,
    unknown | ((init: RequestInit | undefined) => unknown)
  >,
) =>
  vi.fn(async (_url: string, init?: RequestInit) => {
    const payload = S.decodeUnknownSync(JsonRpcMethodRequest)(
      JSON.parse(String(init?.body)),
    )
    const handler = handlers[payload.method]
    if (handler === undefined) {
      throw new Error(`Unexpected Solana JSON-RPC method: ${payload.method}`)
    }
    const body = typeof handler === 'function' ? handler(init) : handler
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  })

const previewTransfer = (destinationAddress: string, atomicUnits: string) => {
  const adapter = makeSolanaLiveAdapter(solanaDevnetConfiguration)
  const request = TransferRequest.make({
    transferId: 'solana-preview',
    accountId: previewAccount.account.accountId,
    assetId: solanaDevnetConfiguration.asset.assetId,
    destinationAddress,
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(atomicUnits),
    maybeMessage: Option.none(),
  })
  const transfer = ValidatedTransfer.make({
    request,
    recipient: ValidatedRecipient.make({
      networkId: solanaDevnetConfiguration.network.networkId,
      address: destinationAddress,
      normalizedAddress: destinationAddress,
      displayAddress: destinationAddress,
    }),
  })
  return adapter.previewTransfer(previewAccount, transfer)
}

const previewRpcHandlers = (overrides: Record<string, unknown> = {}) => ({
  getLatestBlockhash: {
    result: {
      value: {
        blockhash: '11111111111111111111111111111111',
        lastValidBlockHeight: 100,
      },
    },
  },
  getBalance: { result: { value: 500_000_000 } },
  getFeeForMessage: { result: { value: 5_000 } },
  getAccountInfo: { result: { value: null } },
  getMinimumBalanceForRentExemption: { result: 890_880 },
  ...overrides,
})

describe('Solana live adapter transfer rejections', () => {
  it('rejects a 1-lamport preview to a missing destination with rent guidance', async () => {
    vi.stubGlobal('fetch', jsonRpcFetch(previewRpcHandlers()))
    const failure = await Effect.runPromise(
      previewTransfer(missingDestinationAddress, '1').pipe(Effect.flip),
    )

    expect(failure.code).toBe('Rejected')
    expect(failure.guidance?.summary).toContain(
      'too small to create the destination account',
    )
    expect(failure.guidance?.details).toEqual(
      expect.arrayContaining([expect.stringContaining('890880')]),
    )
  })

  it('previews 1 lamport to an account that already exists', async () => {
    vi.stubGlobal(
      'fetch',
      jsonRpcFetch(
        previewRpcHandlers({
          getAccountInfo: {
            result: {
              value: {
                lamports: 1,
                owner: '11111111111111111111111111111111',
              },
            },
          },
        }),
      ),
    )
    const quote = await Effect.runPromise(
      previewTransfer(missingDestinationAddress, '1'),
    )

    expect(quote.resultingBalance.atomicUnits).toBe('499994999')
  })

  it('surfaces sendTransaction rent simulation failures as rejected transfers', async () => {
    vi.stubGlobal(
      'fetch',
      jsonRpcFetch({
        sendTransaction: {
          error: {
            code: -32002,
            message:
              'Transaction simulation failed: Error processing Instruction 0: insufficient funds for rent',
            data: {
              err: { InsufficientFundsForRent: { account_index: 1 } },
            },
          },
        },
      }),
    )
    const adapter = makeSolanaLiveAdapter(solanaDevnetConfiguration)
    const signed = makeSignedTransaction(
      account.account.accountId,
      account.account.networkId,
      S.encodeSync(SolanaSignedPayloadJson)(
        SolanaSignedPayload.make({
          previewId: 'solana-preview',
          wireTransactionBase64: 'AA==',
        }),
      ),
    )
    const failure = await Effect.runPromise(
      adapter.submitTransaction(account, signed).pipe(Effect.flip),
    )

    expect(failure.code).toBe('Rejected')
    expect(failure.guidance?.summary).toContain(
      'too small to create the destination account',
    )
  })

  it('keeps ordinary sendTransaction transport failures unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.resolve(new Response('nope', { status: 500 }))),
    )
    const adapter = makeSolanaLiveAdapter(solanaDevnetConfiguration)
    const signed = makeSignedTransaction(
      account.account.accountId,
      account.account.networkId,
      S.encodeSync(SolanaSignedPayloadJson)(
        SolanaSignedPayload.make({
          previewId: 'solana-preview',
          wireTransactionBase64: 'AA==',
        }),
      ),
    )
    const failure = await Effect.runPromise(
      adapter.submitTransaction(account, signed).pipe(Effect.flip),
    )

    expect(failure.code).toBe('Unavailable')
    expect(failure.guidance).toBeUndefined()
  })
})

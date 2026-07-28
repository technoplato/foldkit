import { Effect, Layer, Option, Redacted, Schema as S, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  AccountBalance,
  type Currency,
  type CurrencyDecimalPlaces,
  CurrencyValue,
  Eth,
  EthereumSepolia,
  ReceivingInstruction,
  Sol,
  SolanaDevnet,
  SolanaDevnetUsdc,
  SolanaDevnetUsdcTransferDraft,
  SolanaDevnetUsdcValue,
  SolanaTestnet,
  TransactionQuote,
  TransactionRecord,
  TransactionSubmission,
  TransferDraft,
  Usdc,
  WalletAccount,
  WalletClient,
  WalletCrypto,
  WalletSigner,
  makePreparedTransaction,
  makeSignedTransaction,
  makeSigningDigest,
} from 'wallet-core-example'

import { capabilityForNetwork } from './capability.js'
import {
  type ChainCustodyService,
  type ChainPortfolio,
  type ChainTransportService,
  EthereumSepoliaCustody,
  EthereumSepoliaTransport,
  SolanaDevnetCustody,
  SolanaDevnetTransport,
} from './chainTransport.js'
import { WalletServicesLive } from './walletServices.js'

const ethereumNetwork = EthereumSepolia.make({})
const solanaNetwork = SolanaDevnet.make({})
const ethereumCurrency = Eth.make({ network: ethereumNetwork })
const solanaCurrency = Sol.make({ network: solanaNetwork })
const ethereumUsdc = Usdc.make({
  network: ethereumNetwork,
  tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
})
const solanaUsdc = Usdc.make({
  network: solanaNetwork,
  tokenAddress: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
})
const ethereumAccount = WalletAccount.make({
  accountId: 'ethereum-account',
  network: ethereumNetwork,
  address: '0x1111111111111111111111111111111111111111',
  displayName: 'Sepolia',
})
const solanaAccount = WalletAccount.make({
  accountId: 'solana-account',
  network: solanaNetwork,
  address: '7XSg97qfSE6n2J1aVfxyTLZgcV7R4sr1kPnCVTLMriYJ',
  displayName: 'Devnet',
})

const value = (
  currency: Currency,
  atomicUnits: `${bigint}`,
  decimalPlaces: CurrencyDecimalPlaces,
  observedAt: number,
) =>
  CurrencyValue.make({
    currency,
    atomicUnits,
    decimalPlaces,
    observedAt,
  })

const ethereumPortfolio: ChainPortfolio = {
  account: ethereumAccount,
  observedAt: 1_000,
  balances: [
    AccountBalance.make({
      accountId: ethereumAccount.accountId,
      value: value(ethereumCurrency, '1230000000000000000', 18, 1_000),
    }),
    AccountBalance.make({
      accountId: ethereumAccount.accountId,
      value: value(ethereumUsdc, '42000001', 6, 1_000),
    }),
  ],
  receivingInstructions: [
    ReceivingInstruction.make({
      accountId: ethereumAccount.accountId,
      network: ethereumNetwork,
      currency: ethereumCurrency,
      destinationAddress: ethereumAccount.address,
      maybeMemo: Option.none(),
      portableUri: 'ethereum:test',
    }),
  ],
}

const solanaPortfolio: ChainPortfolio = {
  account: solanaAccount,
  observedAt: 2_000,
  balances: [
    AccountBalance.make({
      accountId: solanaAccount.accountId,
      value: value(solanaCurrency, '9876543210', 9, 2_000),
    }),
    AccountBalance.make({
      accountId: solanaAccount.accountId,
      value: value(solanaUsdc, '90000007', 6, 2_000),
    }),
  ],
  receivingInstructions: [
    ReceivingInstruction.make({
      accountId: solanaAccount.accountId,
      network: solanaNetwork,
      currency: solanaCurrency,
      destinationAddress: solanaAccount.address,
      maybeMemo: Option.none(),
      portableUri: 'solana:test',
    }),
  ],
}

const ethereumRecord = TransactionRecord.make({
  transactionId: '0xabc',
  accountId: ethereumAccount.accountId,
  network: ethereumNetwork,
  direction: 'Incoming',
  status: 'Confirmed',
  value: value(ethereumCurrency, '1000000000000000', 18, 3_000),
  counterpartyAddress: '0x2222222222222222222222222222222222222222',
  observedAt: 3_000,
})
const solanaRecord = TransactionRecord.make({
  transactionId: 'solana-signature:0',
  accountId: solanaAccount.accountId,
  network: solanaNetwork,
  direction: 'Outgoing',
  status: 'Confirmed',
  value: value(solanaUsdc, '7000001', 6, 4_000),
  counterpartyAddress: '4Nd1mY9oLJ9v9JfCw6X2RibpGqfWzpQ7bY9dRsqV8SFD',
  observedAt: 4_000,
})

const makeTransport = (
  portfolio: ChainPortfolio,
  record: typeof TransactionRecord.Type,
  quoteFee: typeof CurrencyValue.Type,
): ChainTransportService => ({
  network: portfolio.account.network,
  account: portfolio.account,
  loadPortfolio: Effect.succeed(portfolio),
  previewTransaction: draft =>
    Effect.succeed(
      TransactionQuote.make({
        quoteId: `quote:${draft.transferId}`,
        estimatedFee: quoteFee,
        resultingBalance: draft.value,
        expiresAt: 5_000,
      }),
    ),
  prepareTransaction: preview =>
    Effect.succeed(
      makePreparedTransaction(
        preview.draft.accountId,
        preview.draft.network,
        preview.previewId,
      ),
    ),
  submitTransaction: signed =>
    Effect.succeed(
      TransactionSubmission.make({
        previewId: 'preview',
        transactionId: `submitted:${signed.accountId}`,
        submittedAt: 6_000,
        maybeExplorerConfirmation: Option.none(),
      }),
    ),
  observeTransactions: Stream.make(record),
  digestTransaction: prepared =>
    Effect.succeed(makeSigningDigest(`digest:${prepared.accountId}`)),
  verifySignatureProof: () => Effect.succeed(true),
})

const makeCustody = (accountId: string): ChainCustodyService => ({
  accountId,
  signTransaction: (prepared, digest) =>
    Effect.succeed(
      makeSignedTransaction(
        prepared.accountId,
        prepared.network,
        Redacted.value(digest),
      ),
    ),
  signChallenge: challenge =>
    Effect.succeed({
      _tag: 'EthereumSignatureProof',
      challengeId: challenge.challengeId,
      accountId: challenge.accountId,
      address: ethereumAccount.address,
      signatureHex: '0x01',
    }),
})

const fakeDependencies = Layer.mergeAll(
  Layer.succeed(
    EthereumSepoliaTransport,
    makeTransport(
      ethereumPortfolio,
      ethereumRecord,
      value(ethereumCurrency, '21000000000000', 18, 1_000),
    ),
  ),
  Layer.succeed(
    SolanaDevnetTransport,
    makeTransport(
      solanaPortfolio,
      solanaRecord,
      value(solanaCurrency, '5000', 9, 2_000),
    ),
  ),
  Layer.succeed(EthereumSepoliaCustody, makeCustody(ethereumAccount.accountId)),
  Layer.succeed(SolanaDevnetCustody, makeCustody(solanaAccount.accountId)),
)

const FakeWallet = WalletServicesLive.pipe(Layer.provide(fakeDependencies))

describe('WalletServicesLive', () => {
  it('preserves exact atomic units and the latest observed timestamp', async () => {
    const portfolio = await Effect.runPromise(
      WalletClient.pipe(
        Effect.flatMap(client => client.loadPortfolio),
        Effect.provide(FakeWallet),
      ),
    )
    expect(portfolio.balanceSnapshot.observedAt).toBe(2_000)
    expect(
      portfolio.balanceSnapshot.balances.map(
        balance => balance.value.atomicUnits,
      ),
    ).toEqual(['1230000000000000000', '42000001', '9876543210', '90000007'])
  })

  it('routes previews and signing by the network and account', async () => {
    const draft = SolanaDevnetUsdcTransferDraft.make({
      transferId: 'solana-transfer',
      accountId: solanaAccount.accountId,
      network: solanaNetwork,
      destinationAddress: solanaRecord.counterpartyAddress,
      value: SolanaDevnetUsdcValue.make({
        currency: SolanaDevnetUsdc.make({
          network: solanaNetwork,
          tokenAddress: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
        }),
        atomicUnits: '1000001',
        decimalPlaces: 6,
        observedAt: 4_500,
      }),
      maybeMessage: Option.none(),
    })
    const quote = await Effect.runPromise(
      WalletClient.pipe(
        Effect.flatMap(client => client.previewTransaction(draft)),
        Effect.provide(FakeWallet),
      ),
    )
    expect(quote.estimatedFee.atomicUnits).toBe('5000')

    const signed = await Effect.runPromise(
      WalletSigner.pipe(
        Effect.flatMap(signer =>
          signer.signTransaction(
            makePreparedTransaction(
              solanaAccount.accountId,
              solanaNetwork,
              'prepared',
            ),
            makeSigningDigest('digest'),
          ),
        ),
        Effect.provide(FakeWallet),
      ),
    )
    expect(signed.accountId).toBe(solanaAccount.accountId)
  })

  it('merges subscription records without changing observed timestamps', async () => {
    const records = await Effect.runPromise(
      WalletClient.pipe(
        Effect.flatMap(client =>
          client
            .observeTransactions([ethereumAccount, solanaAccount])
            .pipe(Stream.runCollect),
        ),
        Effect.provide(FakeWallet),
      ),
    )
    expect(records.map(record => record.observedAt).sort()).toEqual([
      3_000, 4_000,
    ])
  })

  it('keeps Solana Testnet typed but outside executable drafts', () => {
    const unsupportedNetwork = SolanaTestnet.make({})
    expect(capabilityForNetwork(unsupportedNetwork)).toEqual({
      _tag: 'UnsupportedCapability',
      reason: 'SolanaTestnetIsNotSolanaDevnet',
    })
    expect(() =>
      S.decodeUnknownSync(TransferDraft)({
        _tag: 'SolanaDevnetSolTransferDraft',
        transferId: 'unsupported',
        accountId: solanaAccount.accountId,
        network: unsupportedNetwork,
        destinationAddress: solanaAccount.address,
        value: value(Sol.make({ network: unsupportedNetwork }), '1', 9, 5_000),
        maybeMessage: Option.none(),
      }),
    ).toThrow()
  })

  it('routes public cryptography independently from custody', async () => {
    const digest = await Effect.runPromise(
      WalletCrypto.pipe(
        Effect.flatMap(crypto =>
          crypto.digestTransaction(
            makePreparedTransaction(
              ethereumAccount.accountId,
              ethereumNetwork,
              'prepared',
            ),
          ),
        ),
        Effect.provide(FakeWallet),
      ),
    )
    expect(Redacted.value(digest)).toBe('digest:ethereum-account')
  })
})

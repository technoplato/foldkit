import {
  Array as Array_,
  Context,
  Effect,
  Layer,
  Match as M,
  Stream,
} from 'effect'
import {
  BalanceSnapshot,
  PortfolioSnapshot,
  type PreparedTransaction,
  type SignatureProof,
  type SignedTransaction,
  type SigningChallenge,
  type TransactionPreview,
  type TransferDraft,
  type WalletAccount,
  WalletClient,
  WalletClientError,
  WalletCrypto,
  WalletCryptoError,
  type WalletResources,
  WalletSigner,
  WalletSignerError,
} from 'wallet-core-example'

import {
  type ChainTransportService,
  EthereumSepoliaCustody,
  EthereumSepoliaTransport,
  SolanaDevnetCustody,
  SolanaDevnetTransport,
} from './chainTransport.js'

const unsupportedNetworkError = () =>
  new WalletClientError({ code: 'Rejected' })

const clientForDraft = (
  draft: TransferDraft,
  ethereum: ChainTransportService,
  solana: ChainTransportService,
) =>
  M.value(draft.network).pipe(
    M.withReturnType<Effect.Effect<ChainTransportService, WalletClientError>>(),
    M.tagsExhaustive({
      EthereumSepolia: () => Effect.succeed(ethereum),
      SolanaDevnet: () => Effect.succeed(solana),
      SolanaTestnet: () => Effect.fail(unsupportedNetworkError()),
    }),
  )

const clientForPreview = (
  preview: TransactionPreview,
  ethereum: ChainTransportService,
  solana: ChainTransportService,
) => clientForDraft(preview.draft, ethereum, solana)

const clientForPrepared = (
  prepared: PreparedTransaction,
  ethereum: ChainTransportService,
  solana: ChainTransportService,
) =>
  M.value(prepared.network).pipe(
    M.withReturnType<Effect.Effect<ChainTransportService, WalletClientError>>(),
    M.tagsExhaustive({
      EthereumSepolia: () => Effect.succeed(ethereum),
      SolanaDevnet: () => Effect.succeed(solana),
      SolanaTestnet: () => Effect.fail(unsupportedNetworkError()),
    }),
  )

const clientForSigned = (
  signed: SignedTransaction,
  ethereum: ChainTransportService,
  solana: ChainTransportService,
) =>
  M.value(signed.network).pipe(
    M.withReturnType<Effect.Effect<ChainTransportService, WalletClientError>>(),
    M.tagsExhaustive({
      EthereumSepolia: () => Effect.succeed(ethereum),
      SolanaDevnet: () => Effect.succeed(solana),
      SolanaTestnet: () => Effect.fail(unsupportedNetworkError()),
    }),
  )

const isRequestedAccount = (
  accounts: ReadonlyArray<WalletAccount>,
  accountId: string,
): boolean => Array_.some(accounts, account => account.accountId === accountId)

const hasUnsupportedAccount = (
  accounts: ReadonlyArray<WalletAccount>,
): boolean =>
  Array_.some(accounts, account => account.network._tag === 'SolanaTestnet')

const observationStream = (
  accounts: ReadonlyArray<WalletAccount>,
  ethereum: ChainTransportService,
  solana: ChainTransportService,
) => {
  if (hasUnsupportedAccount(accounts)) {
    return Stream.fail(unsupportedNetworkError())
  }
  const streams = [
    isRequestedAccount(accounts, ethereum.account.accountId)
      ? ethereum.observeTransactions
      : Stream.empty,
    isRequestedAccount(accounts, solana.account.accountId)
      ? solana.observeTransactions
      : Stream.empty,
  ]
  return Stream.mergeAll(streams, { concurrency: 'unbounded' })
}

const makeWalletNetworkServices = Effect.gen(function* () {
  const ethereum = yield* EthereumSepoliaTransport
  const solana = yield* SolanaDevnetTransport

  const client = WalletClient.of({
    loadPortfolio: Effect.zip(ethereum.loadPortfolio, solana.loadPortfolio, {
      concurrent: true,
    }).pipe(
      Effect.map(([ethereumPortfolio, solanaPortfolio]) => {
        const observedAt = Math.max(
          ethereumPortfolio.observedAt,
          solanaPortfolio.observedAt,
        )
        return PortfolioSnapshot.make({
          accounts: [ethereumPortfolio.account, solanaPortfolio.account],
          balanceSnapshot: BalanceSnapshot.make({
            observedAt,
            balances: Array_.appendAll(
              ethereumPortfolio.balances,
              solanaPortfolio.balances,
            ),
          }),
          receivingInstructions: Array_.appendAll(
            ethereumPortfolio.receivingInstructions,
            solanaPortfolio.receivingInstructions,
          ),
        })
      }),
    ),
    previewTransaction: draft =>
      clientForDraft(draft, ethereum, solana).pipe(
        Effect.flatMap(chain => chain.previewTransaction(draft)),
      ),
    prepareTransaction: preview =>
      clientForPreview(preview, ethereum, solana).pipe(
        Effect.flatMap(chain => chain.prepareTransaction(preview)),
      ),
    submitTransaction: signed =>
      clientForSigned(signed, ethereum, solana).pipe(
        Effect.flatMap(chain => chain.submitTransaction(signed)),
      ),
    observeTransactions: accounts =>
      observationStream(accounts, ethereum, solana),
  })

  const crypto = WalletCrypto.of({
    digestTransaction: prepared =>
      clientForPrepared(prepared, ethereum, solana).pipe(
        Effect.mapError(
          () => new WalletCryptoError({ code: 'InvalidPayload' }),
        ),
        Effect.flatMap(chain => chain.digestTransaction(prepared)),
      ),
    verifySignatureProof: (
      challenge: SigningChallenge,
      proof: SignatureProof,
    ) => {
      if (challenge.accountId === ethereum.account.accountId) {
        return ethereum.verifySignatureProof(challenge, proof)
      } else if (challenge.accountId === solana.account.accountId) {
        return solana.verifySignatureProof(challenge, proof)
      } else {
        return Effect.fail(new WalletCryptoError({ code: 'InvalidPayload' }))
      }
    },
  })

  return Context.make(WalletClient, client).pipe(
    Context.add(WalletCrypto, crypto),
  )
})

const makeWalletSigner = Effect.gen(function* () {
  const ethereumCustody = yield* EthereumSepoliaCustody
  const solanaCustody = yield* SolanaDevnetCustody

  return WalletSigner.of({
    signTransaction: (prepared, digest) =>
      M.value(prepared.network).pipe(
        M.withReturnType<Effect.Effect<SignedTransaction, WalletSignerError>>(),
        M.tagsExhaustive({
          EthereumSepolia: () =>
            ethereumCustody.signTransaction(prepared, digest),
          SolanaDevnet: () => solanaCustody.signTransaction(prepared, digest),
          SolanaTestnet: () =>
            Effect.fail(new WalletSignerError({ code: 'UnsupportedAccount' })),
        }),
      ),
    signChallenge: challenge => {
      if (challenge.accountId === ethereumCustody.accountId) {
        return ethereumCustody.signChallenge(challenge)
      } else if (challenge.accountId === solanaCustody.accountId) {
        return solanaCustody.signChallenge(challenge)
      } else {
        return Effect.fail(
          new WalletSignerError({ code: 'UnsupportedAccount' }),
        )
      }
    },
  })
})

/** WalletClient and WalletCrypto backed by injected Sepolia and Devnet transports. */
export const WalletNetworkServicesLive: Layer.Layer<
  WalletClient | WalletCrypto,
  never,
  EthereumSepoliaTransport | SolanaDevnetTransport
> = Layer.effectContext(makeWalletNetworkServices)

/** WalletSigner backed by injected Sepolia and Devnet custody. */
export const WalletSignerLive: Layer.Layer<
  WalletSigner,
  never,
  EthereumSepoliaCustody | SolanaDevnetCustody
> = Layer.effect(WalletSigner, makeWalletSigner)

/** Complete wallet-core services backed by injected test-network adapters. */
export const WalletServicesLive: Layer.Layer<
  WalletResources,
  never,
  | EthereumSepoliaTransport
  | SolanaDevnetTransport
  | EthereumSepoliaCustody
  | SolanaDevnetCustody
> = Layer.merge(WalletNetworkServicesLive, WalletSignerLive)

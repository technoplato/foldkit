import { Array, Context, Effect, Layer, Match as M, Stream } from 'effect'
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
  EthereumSepoliaCustody,
  EthereumSepoliaTransport,
} from './chainTransport.js'

const unsupportedClient = () => new WalletClientError({ code: 'Rejected' })

const requireEthereumDraft = (
  draft: TransferDraft,
): Effect.Effect<void, WalletClientError> =>
  M.value(draft.network).pipe(
    M.withReturnType<Effect.Effect<void, WalletClientError>>(),
    M.tagsExhaustive({
      EthereumSepolia: () => Effect.void,
      SolanaDevnet: () => Effect.fail(unsupportedClient()),
    }),
  )

const requireEthereumPreview = (
  preview: TransactionPreview,
): Effect.Effect<void, WalletClientError> => requireEthereumDraft(preview.draft)

const requireEthereumPrepared = (
  prepared: PreparedTransaction,
): Effect.Effect<void, WalletCryptoError> =>
  M.value(prepared.network).pipe(
    M.withReturnType<Effect.Effect<void, WalletCryptoError>>(),
    M.tagsExhaustive({
      EthereumSepolia: () => Effect.void,
      SolanaDevnet: () =>
        Effect.fail(new WalletCryptoError({ code: 'InvalidPayload' })),
      SolanaTestnet: () =>
        Effect.fail(new WalletCryptoError({ code: 'InvalidPayload' })),
    }),
  )

const requireEthereumSigned = (
  signed: SignedTransaction,
): Effect.Effect<void, WalletClientError> =>
  M.value(signed.network).pipe(
    M.withReturnType<Effect.Effect<void, WalletClientError>>(),
    M.tagsExhaustive({
      EthereumSepolia: () => Effect.void,
      SolanaDevnet: () => Effect.fail(unsupportedClient()),
      SolanaTestnet: () => Effect.fail(unsupportedClient()),
    }),
  )

const includesOnlyEthereumAccount = (
  accounts: ReadonlyArray<WalletAccount>,
): boolean =>
  Array.every(accounts, account => account.network._tag === 'EthereumSepolia')

const makeEthereumWalletNetworkServices = Effect.gen(function* () {
  const ethereum = yield* EthereumSepoliaTransport

  const client = WalletClient.of({
    loadPortfolio: ethereum.loadPortfolio.pipe(
      Effect.map(portfolio =>
        PortfolioSnapshot.make({
          accounts: [portfolio.account],
          balanceSnapshot: BalanceSnapshot.make({
            observedAt: portfolio.observedAt,
            balances: portfolio.balances,
          }),
          receivingInstructions: portfolio.receivingInstructions,
        }),
      ),
    ),
    previewTransaction: draft =>
      requireEthereumDraft(draft).pipe(
        Effect.flatMap(() => ethereum.previewTransaction(draft)),
      ),
    prepareTransaction: preview =>
      requireEthereumPreview(preview).pipe(
        Effect.flatMap(() => ethereum.prepareTransaction(preview)),
      ),
    submitTransaction: signed =>
      requireEthereumSigned(signed).pipe(
        Effect.flatMap(() => ethereum.submitTransaction(signed)),
      ),
    observeTransactions: accounts => {
      if (!includesOnlyEthereumAccount(accounts)) {
        return Stream.fail(unsupportedClient())
      }
      const isObserved = Array.some(
        accounts,
        account => account.accountId === ethereum.account.accountId,
      )
      return isObserved ? ethereum.observeTransactions : Stream.empty
    },
  })

  const crypto = WalletCrypto.of({
    digestTransaction: prepared =>
      requireEthereumPrepared(prepared).pipe(
        Effect.flatMap(() => ethereum.digestTransaction(prepared)),
      ),
    verifySignatureProof: (
      challenge: SigningChallenge,
      proof: SignatureProof,
    ) => ethereum.verifySignatureProof(challenge, proof),
  })

  return Context.make(WalletClient, client).pipe(
    Context.add(WalletCrypto, crypto),
  )
})

const makeEthereumWalletSigner = Effect.gen(function* () {
  const custody = yield* EthereumSepoliaCustody
  return WalletSigner.of({
    signTransaction: (prepared, digest) =>
      M.value(prepared.network).pipe(
        M.withReturnType<Effect.Effect<SignedTransaction, WalletSignerError>>(),
        M.tagsExhaustive({
          EthereumSepolia: () => custody.signTransaction(prepared, digest),
          SolanaDevnet: () =>
            Effect.fail(new WalletSignerError({ code: 'UnsupportedAccount' })),
          SolanaTestnet: () =>
            Effect.fail(new WalletSignerError({ code: 'UnsupportedAccount' })),
        }),
      ),
    signChallenge: challenge => custody.signChallenge(challenge),
  })
})

/** WalletClient and WalletCrypto backed only by one Ethereum Sepolia transport. */
export const EthereumSepoliaWalletNetworkServicesLive: Layer.Layer<
  WalletClient | WalletCrypto,
  never,
  EthereumSepoliaTransport
> = Layer.effectContext(makeEthereumWalletNetworkServices)

/** WalletSigner backed only by one Ethereum Sepolia custody implementation. */
export const EthereumSepoliaWalletSignerLive: Layer.Layer<
  WalletSigner,
  never,
  EthereumSepoliaCustody
> = Layer.effect(WalletSigner, makeEthereumWalletSigner)

/** Complete wallet-core services backed only by Ethereum Sepolia. */
export const EthereumSepoliaWalletServicesLive: Layer.Layer<
  WalletResources,
  never,
  EthereumSepoliaTransport | EthereumSepoliaCustody
> = Layer.merge(
  EthereumSepoliaWalletNetworkServicesLive,
  EthereumSepoliaWalletSignerLive,
)

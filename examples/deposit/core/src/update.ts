import { Effect, Match as M, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { evo } from 'foldkit/struct'
import {
  NetworkFailure,
  TestFundingRequest,
  WalletClient,
  WalletClientError,
  WalletClipboard,
  WalletCreationRequest,
  WalletFailure,
  WalletProfile,
  type WalletResources,
  WalletVault,
  clipboardCopyRequestForAddress,
  nextWalletCreationRequest,
  type PortfolioSnapshot,
} from 'wallet-core-example'

import {
  FailedCopyAddress,
  FailedCreateWallet,
  FailedLoadPortfolio,
  FailedLoadProfiles,
  FailedTestFunding,
  type Message,
  SucceededCopyAddress,
  SucceededCreateWallet,
  SucceededLoadPortfolio,
  SucceededLoadProfiles,
  SucceededTestFunding,
} from './message.js'
import {
  CopiedAddress,
  CreatingWallet,
  FailedClipboard,
  FailedFunding,
  FailedWallet,
  LoadingPortfolio,
  type Model,
  OkEffect,
  ReadyReceive,
  ReceivedFunding,
  RefuseEffect,
  RequestingFunding,
  capabilitiesUnlockedBy,
  defaultAssetId,
  defaultChainId,
  defaultNetworkId,
  depositFromIncoming,
  incomingFromRecord,
  selectCryptoRail,
  solDevnetReceive,
  solanaDevnetNetwork,
  tinyAirdropLamports,
} from './model.js'

const toNetworkFailure = (
  operation:
    | 'LoadPortfolio'
    | 'RequestTestFunding'
    | 'ObserveTransactions',
  error: WalletClientError,
): WalletFailure => NetworkFailure.make({ operation, code: error.code })

/** Restores public Wallet profiles from the injected vault. */
export const LoadProfiles = Command.define(
  'LoadProfiles',
  SucceededLoadProfiles,
  FailedLoadProfiles,
)(
  WalletVault.pipe(
    Effect.flatMap(vault => vault.loadWallets),
    Effect.map(wallets => SucceededLoadProfiles.make({ wallets })),
    Effect.catch(error =>
      Effect.succeed(FailedLoadProfiles.make({ code: error.code })),
    ),
  ),
)

/** Creates one Wallet profile for Solana Devnet receive. */
export const CreateDepositWallet = Command.define(
  'CreateDepositWallet',
  { request: WalletCreationRequest },
  SucceededCreateWallet,
  FailedCreateWallet,
)(({ request }) =>
  WalletVault.pipe(
    Effect.flatMap(vault => vault.createWallet(request)),
    Effect.map(wallet => SucceededCreateWallet.make({ wallet })),
    Effect.catch(error =>
      Effect.succeed(FailedCreateWallet.make({ code: error.code })),
    ),
  ),
)

/** Loads a public portfolio through the injected Wallet client. */
export const LoadPortfolio = Command.define(
  'LoadPortfolio',
  { wallets: S.Array(WalletProfile) },
  SucceededLoadPortfolio,
  FailedLoadPortfolio,
)(({ wallets }) =>
  WalletClient.pipe(
    Effect.flatMap(client => client.loadPortfolio(wallets)),
    Effect.map(portfolio =>
      SucceededLoadPortfolio.make({ wallets, portfolio }),
    ),
    Effect.catch(error =>
      Effect.succeed(
        FailedLoadPortfolio.make({
          failure: toNetworkFailure('LoadPortfolio', error),
        }),
      ),
    ),
  ),
)

/** Copies the public receive address through the injected clipboard. */
export const CopyAddress = Command.define(
  'CopyAddress',
  { address: S.String },
  SucceededCopyAddress,
  FailedCopyAddress,
)(({ address }) =>
  WalletClipboard.pipe(
    Effect.flatMap(clipboard =>
      clipboard.writeText(clipboardCopyRequestForAddress(address).value),
    ),
    Effect.map(() => SucceededCopyAddress.make({ address })),
    Effect.catch(error =>
      Effect.succeed(FailedCopyAddress.make({ code: error.code })),
    ),
  ),
)

/** Requests a tiny Solana Devnet airdrop. Never constructed for mainnet. */
export const RequestAirdrop = Command.define(
  'RequestAirdrop',
  { request: TestFundingRequest },
  SucceededTestFunding,
  FailedTestFunding,
)(({ request }) =>
  WalletClient.pipe(
    Effect.flatMap(client => client.requestTestFunding(request)),
    Effect.map(receipt => SucceededTestFunding.make({ request, receipt })),
    Effect.catch(error =>
      Effect.succeed(
        FailedTestFunding.make({
          request,
          failure: toNetworkFailure('RequestTestFunding', error),
        }),
      ),
    ),
  ),
)

const commitOk = (model: Model, line: string): Model =>
  evo(model, {
    lastOutcome: () => Option.some(OkEffect.make({ line })),
  })

const commitRefuse = (model: Model, why: string): Model =>
  evo(model, {
    lastOutcome: () => Option.some(RefuseEffect.make({ why })),
  })

const createRequestFor = (
  wallets: ReadonlyArray<WalletProfile>,
): WalletCreationRequest =>
  nextWalletCreationRequest(wallets, [solanaDevnetNetwork])

const loadOrCreate = (
  wallets: ReadonlyArray<WalletProfile>,
): readonly [
  Model['wallet'],
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => {
  if (wallets.length === 0) {
    return [
      CreatingWallet.make({}),
      [CreateDepositWallet({ request: createRequestFor(wallets) })],
    ]
  }
  return [
    LoadingPortfolio.make({ wallets }),
    [LoadPortfolio({ wallets })],
  ]
}

const readyFromPortfolio = (
  wallets: ReadonlyArray<WalletProfile>,
  portfolio: PortfolioSnapshot,
): typeof ReadyReceive.Type | typeof FailedWallet.Type => {
  const receive = solDevnetReceive(portfolio)
  if (receive === undefined) {
    return FailedWallet.make({ code: 'Unavailable' })
  }
  return ReadyReceive.make({
    wallets,
    portfolio,
    accountId: receive.accountId,
    address: receive.address,
  })
}

const applyIncoming = (model: Model, incoming: ReturnType<
  typeof incomingFromRecord
>): Model => {
  if (incoming === undefined) {
    return model
  }
  if (model.incoming.some(item => item.transactionId === incoming.transactionId)) {
    return model
  }
  const nextIncoming = [...model.incoming, incoming]
  if (incoming.status !== 'Confirmed') {
    return evo(model, { incoming: () => nextIncoming })
  }
  const deposits = [...model.sender.deposits, depositFromIncoming(incoming)]
  return evo(model, {
    incoming: () => nextIncoming,
    sender: sender => ({
      ...sender,
      deposits,
      unlocked: capabilitiesUnlockedBy(deposits),
    }),
    lastOutcome: () =>
      Option.some(
        OkEffect.make({
          line: `settled ${incoming.lamports} lamports`,
        }),
      ),
  })
}

type UpdateResult = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
]

/** Applies one Deposit Message to the current Model. */
export const update = (model: Model, message: Message): UpdateResult =>
  M.value(message).pipe(
    M.withReturnType<UpdateResult>(),
    M.tagsExhaustive({
      SelectedCryptoRail: ({ chain, network }) => [
        evo(model, {
          selectedChain: () => chain,
          selectedNetwork: () => network,
        }),
        [],
      ],
      RequestedCryptoDeposit: ({ chain, network }) => {
        const rail = selectCryptoRail(chain, network)
        if (rail._tag === 'unsupported') {
          return [commitRefuse(model, 'unsupported-rail'), []]
        }
        return [
          commitOk(model, 'sol-devnet receive is live'),
          [],
        ]
      },
      RequestedFiatDeposit: () => [
        commitRefuse(model, 'stripe-unconfigured'),
        [],
      ],
      RequestedTestFunding: () => {
        if (model.wallet._tag !== 'ready') {
          return [commitRefuse(model, 'wallet-unavailable'), []]
        }
        const request = TestFundingRequest.make({
          requestId: `airdrop-${String(Date.now())}`,
          accountId: model.wallet.accountId,
          chainId: defaultChainId,
          networkId: defaultNetworkId,
          environment: 'Development',
          assetId: defaultAssetId,
          atomicUnits: tinyAirdropLamports,
        })
        return [
          evo(commitOk(model, 'requesting sol-devnet airdrop'), {
            funding: () =>
              RequestingFunding.make({ requestId: request.requestId }),
          }),
          [RequestAirdrop({ request })],
        ]
      },
      RequestedCopyAddress: () => {
        if (model.wallet._tag !== 'ready') {
          return [commitRefuse(model, 'wallet-unavailable'), []]
        }
        return [model, [CopyAddress({ address: model.wallet.address })]]
      },
      RequestedWalletCreation: () => {
        const wallets =
          model.wallet._tag === 'ready' ||
          model.wallet._tag === 'loading-portfolio'
            ? model.wallet.wallets
            : []
        const [phase, commands] = loadOrCreate(wallets)
        return [evo(model, { wallet: () => phase }), commands]
      },
      SucceededLoadProfiles: ({ wallets }) => {
        const [phase, commands] = loadOrCreate(wallets)
        return [evo(model, { wallet: () => phase }), commands]
      },
      FailedLoadProfiles: ({ code }) => [
        evo(model, { wallet: () => FailedWallet.make({ code }) }),
        [],
      ],
      SucceededCreateWallet: ({ wallet }) => {
        const wallets = [wallet]
        return [
          evo(model, {
            wallet: () => LoadingPortfolio.make({ wallets }),
          }),
          [LoadPortfolio({ wallets })],
        ]
      },
      FailedCreateWallet: ({ code }) => [
        evo(model, { wallet: () => FailedWallet.make({ code }) }),
        [],
      ],
      SucceededLoadPortfolio: ({ wallets, portfolio }) => [
        evo(model, {
          wallet: () => readyFromPortfolio(wallets, portfolio),
        }),
        [],
      ],
      FailedLoadPortfolio: () => [
        evo(model, {
          wallet: () => FailedWallet.make({ code: 'Unavailable' }),
        }),
        [],
      ],
      ObservedIncoming: ({ transaction }) => [
        applyIncoming(model, incomingFromRecord(transaction)),
        [],
      ],
      FailedObserveIncoming: () => [model, []],
      SucceededTestFunding: ({ request, receipt }) => [
        evo(commitOk(model, 'sol-devnet airdrop accepted'), {
          funding: () =>
            ReceivedFunding.make({
              requestId: request.requestId,
              fundingId: receipt.fundingId,
              lamports: receipt.amount.atomicUnits,
            }),
        }),
        [],
      ],
      FailedTestFunding: ({ request, failure }) => [
        evo(commitRefuse(model, failure.code), {
          funding: () =>
            FailedFunding.make({
              requestId: request.requestId,
              code: failure.code,
            }),
        }),
        [],
      ],
      SucceededCopyAddress: ({ address }) => [
        evo(commitOk(model, 'copied receive address'), {
          clipboard: () => CopiedAddress.make({ address }),
        }),
        [],
      ],
      FailedCopyAddress: ({ code }) => [
        evo(model, {
          clipboard: () => FailedClipboard.make({ code }),
        }),
        [],
      ],
    }),
  )

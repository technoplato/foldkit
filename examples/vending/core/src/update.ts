import { Effect, Match as M, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { evo } from 'foldkit/struct'
import {
  NetworkFailure,
  type PortfolioSnapshot,
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
  AwaitingPayment,
  ClearControl,
  CopiedAddress,
  CreatingWallet,
  DialedSelection,
  type Digit,
  DigitControl,
  DispensedVend,
  EnterControl,
  FailedClipboard,
  FailedFunding,
  FailedWallet,
  IdleClipPlayback,
  IdleSelection,
  IdleVend,
  LoadingPortfolio,
  LockedSelection,
  type Model,
  PlayingClipPlayback,
  ReadyReceive,
  ReceivedFunding,
  RequestingFunding,
  TimedOutVend,
  WrongCodeVend,
  defaultAssetId,
  defaultChainId,
  defaultNetworkId,
  incomingFromRecord,
  maximumKeypadLength,
  meetsSettleThreshold,
  playbackAtElapsed,
  skuForCode,
  solDevnetReceive,
  solanaDevnetNetwork,
  tinyAirdropLamports,
} from './model.js'
import { solanaPayUriForAddress } from './presentation.js'

const toNetworkFailure = (
  operation: 'LoadPortfolio' | 'RequestTestFunding' | 'ObserveTransactions',
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
      clipboard.writeText(
        clipboardCopyRequestForAddress(solanaPayUriForAddress(address)).value,
      ),
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
  return [LoadingPortfolio.make({ wallets }), [LoadPortfolio({ wallets })]]
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

const lockIfAwaiting = (model: Model, address: string): Model => {
  if (model.vendPhase._tag !== 'AwaitingPayment') {
    return model
  }
  if (model.selection._tag === 'Locked') {
    return model
  }
  const code =
    model.selection._tag === 'Dialed'
      ? model.selection.code
      : model.keypadBuffer
  const sku = skuForCode(model.catalog, code)
  if (sku === undefined) {
    return model
  }
  return evo(model, {
    selection: () => LockedSelection.make({ sku, address }),
  })
}

const pressDigit = (model: Model, digit: Digit): Model => {
  const lastControl = DigitControl.make({ digit })
  if (
    model.vendPhase._tag === 'AwaitingPayment' &&
    model.selection._tag === 'Locked'
  ) {
    return evo(model, { lastControl: () => lastControl })
  }
  const resetCycle =
    model.vendPhase._tag === 'Dispensed' ||
    model.vendPhase._tag === 'TimedOut' ||
    model.vendPhase._tag === 'WrongCode'
  const baseBuffer = resetCycle ? '' : model.keypadBuffer
  if (baseBuffer.length >= maximumKeypadLength) {
    return evo(model, { lastControl: () => lastControl })
  }
  const nextBuffer = `${baseBuffer}${digit}`
  return evo(model, {
    keypadBuffer: () => nextBuffer,
    lastControl: () => lastControl,
    selection: () => DialedSelection.make({ code: nextBuffer }),
    vendPhase: () => (resetCycle ? IdleVend.make({}) : model.vendPhase),
    clipPlayback: () =>
      resetCycle ? IdleClipPlayback.make({}) : model.clipPlayback,
  })
}

const pressClear = (model: Model): Model =>
  evo(model, {
    keypadBuffer: () => '',
    lastControl: () => ClearControl.make({}),
    selection: () => IdleSelection.make({}),
    vendPhase: () =>
      model.vendPhase._tag === 'Dispensed' ||
      model.vendPhase._tag === 'AwaitingPayment'
        ? model.vendPhase
        : IdleVend.make({}),
  })

const pressEnter = (model: Model): Model => {
  const lastControl = EnterControl.make({})
  if (
    model.vendPhase._tag === 'AwaitingPayment' ||
    model.vendPhase._tag === 'Dispensed' ||
    model.vendPhase._tag === 'Received' ||
    model.vendPhase._tag === 'Vending'
  ) {
    return evo(model, { lastControl: () => lastControl })
  }
  const sku = skuForCode(model.catalog, model.keypadBuffer)
  if (sku === undefined) {
    return evo(model, {
      lastControl: () => lastControl,
      selection: () => DialedSelection.make({ code: model.keypadBuffer }),
      vendPhase: () => WrongCodeVend.make({}),
    })
  }
  if (model.wallet._tag === 'ready') {
    const address = model.wallet.address
    return evo(model, {
      lastControl: () => lastControl,
      selection: () => LockedSelection.make({ sku, address }),
      vendPhase: () => AwaitingPayment.make({}),
    })
  }
  return evo(model, {
    lastControl: () => lastControl,
    selection: () => DialedSelection.make({ code: sku.code }),
    vendPhase: () => AwaitingPayment.make({}),
  })
}

const applyIncoming = (
  model: Model,
  incoming: ReturnType<typeof incomingFromRecord>,
): Model => {
  if (incoming === undefined) {
    return model
  }
  if (
    model.incoming.some(item => item.transactionId === incoming.transactionId)
  ) {
    return model
  }
  const nextIncoming = [...model.incoming, incoming]
  const withIncoming = evo(model, { incoming: () => nextIncoming })
  if (
    incoming.status !== 'Confirmed' ||
    model.vendPhase._tag !== 'AwaitingPayment' ||
    !meetsSettleThreshold(incoming.lamports, model.settleLamports)
  ) {
    return withIncoming
  }
  return evo(withIncoming, {
    vendPhase: () => DispensedVend.make({}),
    clipPlayback: () => PlayingClipPlayback.make({ elapsedMs: 0 }),
  })
}

type UpdateResult = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
]

/** Applies one Vending Message to the current Model. 3JS does not live here. */
export const update = (model: Model, message: Message): UpdateResult =>
  M.value(message).pipe(
    M.withReturnType<UpdateResult>(),
    M.tagsExhaustive({
      PressedDigit: ({ digit }) => [pressDigit(model, digit), []],
      PressedEnter: () => [pressEnter(model), []],
      PressedClear: () => [pressClear(model), []],
      AdvancedClipPlayback: ({ elapsedMs }) => {
        if (model.vendPhase._tag !== 'Dispensed') {
          return [model, []]
        }
        if (model.clipPlayback._tag === 'Idle') {
          return [model, []]
        }
        return [
          evo(model, {
            clipPlayback: () => playbackAtElapsed(elapsedMs),
          }),
          [],
        ]
      },
      ReportedVendTimeout: () => [
        model.vendPhase._tag === 'AwaitingPayment'
          ? evo(model, { vendPhase: () => TimedOutVend.make({}) })
          : model,
        [],
      ],
      RequestedCopyAddress: () => {
        const address =
          model.selection._tag === 'Locked'
            ? model.selection.address
            : model.wallet._tag === 'ready'
              ? model.wallet.address
              : undefined
        if (address === undefined) {
          return [model, []]
        }
        return [model, [CopyAddress({ address })]]
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
      RequestedTestFunding: () => {
        if (model.wallet._tag !== 'ready') {
          return [model, []]
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
          evo(model, {
            funding: () =>
              RequestingFunding.make({ requestId: request.requestId }),
          }),
          [RequestAirdrop({ request })],
        ]
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
      SucceededLoadPortfolio: ({ wallets, portfolio }) => {
        const wallet = readyFromPortfolio(wallets, portfolio)
        const next = evo(model, { wallet: () => wallet })
        if (wallet._tag !== 'ready') {
          return [next, []]
        }
        return [lockIfAwaiting(next, wallet.address), []]
      },
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
        evo(model, {
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
        evo(model, {
          funding: () =>
            FailedFunding.make({
              requestId: request.requestId,
              code: failure.code,
            }),
        }),
        [],
      ],
      SucceededCopyAddress: ({ address }) => [
        evo(model, {
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

import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  type ClipboardCopyRequest,
  type ClipboardCopyState,
  isSameClipboardCopyRequest,
} from './clipboard.js'
import {
  type AssetAmount,
  type AssetDescriptor,
  type NetworkDescriptor,
  type TestFundingMethod,
  WalletCapability,
  assetForId,
  displayAmountFromAtomicUnits,
  networkForId,
} from './currency.js'
import type {
  AccountBalance,
  Model,
  ReceivingInstruction,
  TransactionPreview,
  WalletAccount,
  WalletDataSource,
  WalletFailure,
} from './model.js'
import { sendNetworkSelectionLabel } from './sendNetworkSelection.js'
import {
  WalletNetworkMode,
  isNetworkEnvironmentInWalletMode,
} from './walletProfile.js'

/**
 * A network mode as people say it: Live is Mainnet.
 *
 * @example
 * ```typescript
 * walletNetworkModeLabel('Live') // 'Mainnet'
 * ```
 */
export const walletNetworkModeLabel = (
  networkMode: WalletNetworkMode,
): string =>
  M.value(networkMode).pipe(
    M.withReturnType<string>(),
    M.when('Devnet', () => 'Devnet'),
    M.when('Testnet', () => 'Testnet'),
    M.when('Live', () => 'Mainnet'),
    M.exhaustive,
  )

/**
 * The modes this host has at least one network for, in the order Devnet,
 * Testnet, Mainnet. Before the portfolio loads, only the current mode.
 *
 * @example
 * ```typescript
 * availableWalletNetworkModes(model) // ['Devnet', 'Live'] for Solana Devnet and Mainnet only
 * ```
 */
export const availableWalletNetworkModes = (
  model: Model,
): ReadonlyArray<WalletNetworkMode> => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return [model.walletNetworkMode]
  }
  const networks = model.portfolio.snapshot.networks
  return Array.filter(WalletNetworkMode.literals, networkMode =>
    Array.some(networks, network =>
      isNetworkEnvironmentInWalletMode(network.environment, networkMode),
    ),
  )
}

/** What the confirm step shows: exactly what will be signed. */
export const TransferConfirmation = S.Struct({
  amountLabel: S.String,
  recipientAddress: S.String,
  networkName: S.String,
  feeLabel: S.String,
  balanceAfterLabel: S.String,
  isRealMoney: S.Boolean,
})
/** What the confirm step shows: exactly what will be signed. */
export type TransferConfirmation = typeof TransferConfirmation.Type

/**
 * The confirm step of one preview, read from the preview itself, so the
 * words are what the signer receives: the amount, the full recipient
 * address, the network, the fee and the balance after. `isRealMoney` is
 * true on a Mainnet network.
 *
 * @example
 * ```typescript
 * transferConfirmation(model, preview)
 * // Option.some({ amountLabel: '0.5 SOL', networkName: 'Solana Mainnet Beta', isRealMoney: true, ... })
 * ```
 */
export const transferConfirmation = (
  model: Model,
  preview: TransactionPreview,
): Option.Option<TransferConfirmation> => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return Option.none()
  }
  const { request, recipient } = preview.transfer
  const portfolio = model.portfolio.snapshot
  return Option.map(
    networkForId(portfolio.networks, recipient.networkId),
    network =>
      TransferConfirmation.make({
        amountLabel: assetAmountLabelForModel(model, {
          assetId: request.assetId,
          atomicUnits: request.atomicUnits,
          observedAt: preview.estimatedFee.observedAt,
        }),
        recipientAddress: recipient.address,
        networkName: network.displayName,
        feeLabel: assetAmountLabelForModel(model, preview.estimatedFee),
        balanceAfterLabel: assetAmountLabelForModel(
          model,
          preview.resultingBalance,
        ),
        isRealMoney: network.environment === 'Mainnet',
      }),
  )
}

/** Labels the single source behind every account and amount on the screen. */
export const walletDataSourceLabel = (dataSource: WalletDataSource): string =>
  M.value(dataSource).pipe(
    M.withReturnType<string>(),
    M.when('Fixture', () => 'Fixture data'),
    M.when('Testnet', () => 'Live testnet data'),
    M.when('Live', () => 'Live network data'),
    M.exhaustive,
  )

/** Explains whether the current portfolio came from fixtures or real networks. */
export const walletDataSourceDetail = (dataSource: WalletDataSource): string =>
  M.value(dataSource).pipe(
    M.withReturnType<string>(),
    M.when(
      'Fixture',
      () => 'Deterministic test values. No network was contacted.',
    ),
    M.when(
      'Testnet',
      () =>
        'Balances and activity loaded from configured public test networks for the persisted Wallet accounts.',
    ),
    M.when(
      'Live',
      () =>
        'Balances and activity loaded from configured network adapters for the persisted Wallet accounts.',
    ),
    M.exhaustive,
  )

/** Formats exact atomic units as a human-readable normalized asset amount. */
export const assetAmountLabel = (
  amount: AssetAmount,
  asset: AssetDescriptor,
): string => {
  const isNegative = amount.atomicUnits.startsWith('-')
  const unsignedAtomicUnits = isNegative
    ? amount.atomicUnits.slice(1)
    : amount.atomicUnits
  const paddedAtomicUnits = unsignedAtomicUnits.padStart(
    asset.decimalPlaces + 1,
    '0',
  )
  const wholeUnits =
    asset.decimalPlaces === 0
      ? paddedAtomicUnits
      : paddedAtomicUnits.slice(0, -asset.decimalPlaces)
  const fractionalUnits =
    asset.decimalPlaces === 0
      ? ''
      : paddedAtomicUnits.slice(-asset.decimalPlaces).replace(/0+$/, '')
  const decimalValue =
    fractionalUnits === '' ? wholeUnits : `${wholeUnits}.${fractionalUnits}`
  return `${isNegative ? '-' : ''}${decimalValue} ${asset.symbol}`
}

/** Formats an amount through the normalized descriptors loaded in Model. */
export const assetAmountLabelForModel = (
  model: Model,
  amount: AssetAmount,
): string => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return `${amount.atomicUnits} ${amount.assetId}`
  }
  const maybeAsset = assetForId(model.portfolio.snapshot.assets, amount.assetId)
  return Option.isSome(maybeAsset)
    ? assetAmountLabel(amount, maybeAsset.value)
    : `${amount.atomicUnits} ${amount.assetId}`
}

/** Labels every balance loaded for one public Wallet account. */
export const walletAccountBalanceLabel = (
  model: Model,
  accountId: string,
): string => {
  if (model.portfolio._tag === 'LoadingPortfolio') {
    return 'Loading…'
  }
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return 'Unavailable'
  }
  if (model.balanceFreshness._tag === 'RefreshingBalances') {
    return 'Checking…'
  }
  if (model.balanceFreshness._tag === 'FailedBalanceRefresh') {
    return 'Unavailable'
  }
  const balances = Array.filter(
    model.portfolio.snapshot.balanceSnapshot.balances,
    balance => balance.accountId === accountId,
  )
  if (Array.isReadonlyArrayNonEmpty(balances)) {
    return Array.join(
      Array.map(balances, balance =>
        assetAmountLabelForModel(model, balance.amount),
      ),
      ' · ',
    )
  }
  if (
    Array.contains(
      model.portfolio.snapshot.balanceSnapshot.unavailableAccountIds,
      accountId,
    )
  ) {
    return 'Unavailable'
  }
  return '—'
}

/** Shortens a public address while preserving both identifying ends. */
export const shortenedAddress = (address: string): string =>
  address.length <= 18
    ? address
    : `${address.slice(0, 10)}…${address.slice(-6)}`

/** Labels the currently selected Wallet, cryptocurrency, and network. */
export const selectedSendNetworkLabel = (model: Model): string => {
  if (
    model.portfolio._tag !== 'LoadedPortfolio' ||
    Option.isNone(model.maybeSendNetworkSelection)
  ) {
    return 'unavailable'
  }
  return sendNetworkSelectionLabel(
    model.portfolio.snapshot,
    model.wallets,
    model.maybeSendNetworkSelection.value,
  )
}

/** Labels one address copy control from the shared clipboard state. */
export const clipboardCopyLabel = (
  clipboardCopy: ClipboardCopyState,
  request: ClipboardCopyRequest,
): string => {
  if (
    clipboardCopy._tag === 'CopyingToClipboard' &&
    isSameClipboardCopyRequest(clipboardCopy.request, request)
  ) {
    return 'Copying…'
  } else if (
    clipboardCopy._tag === 'CopiedToClipboard' &&
    isSameClipboardCopyRequest(clipboardCopy.request, request)
  ) {
    return 'Copied'
  } else if (
    clipboardCopy._tag === 'FailedClipboardCopy' &&
    isSameClipboardCopyRequest(clipboardCopy.request, request)
  ) {
    return 'Try copy again'
  } else {
    return 'Copy address'
  }
}

/** Selects actionable feedback for one failed address copy control. */
export const clipboardCopyFailureMessage = (
  clipboardCopy: ClipboardCopyState,
  request: ClipboardCopyRequest,
): Option.Option<string> => {
  if (
    clipboardCopy._tag !== 'FailedClipboardCopy' ||
    !isSameClipboardCopyRequest(clipboardCopy.request, request)
  ) {
    return Option.none()
  }
  if (clipboardCopy.code === 'Denied') {
    return Option.some(
      'Clipboard access was denied. Check your browser or device settings, then try again.',
    )
  } else if (clipboardCopy.code === 'Unavailable') {
    return Option.some(
      'Clipboard access is unavailable here. Select and copy the address manually.',
    )
  } else {
    return Option.some(
      'The address could not be copied. Select and copy it manually.',
    )
  }
}

/** Selects the account chosen by the current send-network selection. */
export const primaryWalletAccount = (
  model: Model,
): Option.Option<WalletAccount> => {
  if (
    model.portfolio._tag !== 'LoadedPortfolio' ||
    Option.isNone(model.maybeSendNetworkSelection)
  ) {
    return Option.none()
  }
  const selection = model.maybeSendNetworkSelection.value
  return Array.findFirst(
    model.portfolio.snapshot.accounts,
    account => account.accountId === selection.accountId,
  )
}

/** Selects the balance chosen by the current send-network selection. */
export const primaryWalletBalance = (
  model: Model,
): Option.Option<AccountBalance> =>
  Option.flatMap(primaryWalletAccount(model), account =>
    model.portfolio._tag === 'LoadedPortfolio'
      ? Array.findFirst(
          model.portfolio.snapshot.balanceSnapshot.balances,
          balance =>
            balance.accountId === account.accountId &&
            Option.isSome(model.maybeSendNetworkSelection) &&
            balance.amount.assetId ===
              model.maybeSendNetworkSelection.value.assetId,
        )
      : Option.none(),
  )

/**
 * The selected account's balance as words, never a number the chains have
 * not just confirmed: while fresh balances are on their way it says it is
 * checking, and after a failed refresh it says the balance could not be
 * read.
 *
 * @example
 * ```typescript
 * primaryWalletBalanceLabel(model) // 'Checking the Solana Mainnet Beta balance…'
 * ```
 */
export const primaryWalletBalanceLabel = (model: Model): string => {
  if (model.portfolio._tag === 'LoadingPortfolio') {
    return 'Loading…'
  }
  const networkName = Option.match(primaryWalletNetwork(model), {
    onNone: () => 'selected network',
    onSome: network => network.displayName,
  })
  return M.value(model.balanceFreshness).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      RefreshingBalances: () => `Checking the ${networkName} balance…`,
      FailedBalanceRefresh: () =>
        `The ${networkName} balance could not be read. Refresh to try again.`,
      CurrentBalances: () =>
        Option.match(primaryWalletBalance(model), {
          onNone: () =>
            isPrimaryWalletBalanceUnavailable(model)
              ? 'Unavailable. Refresh to retry.'
              : '—',
          onSome: balance => assetAmountLabelForModel(model, balance.amount),
        }),
    }),
  )
}

/** Reports whether the selected account's live balance request failed. */
export const isPrimaryWalletBalanceUnavailable = (model: Model): boolean =>
  model.portfolio._tag === 'LoadedPortfolio' &&
  Option.isSome(model.maybeSendNetworkSelection) &&
  Array.contains(
    model.portfolio.snapshot.balanceSnapshot.unavailableAccountIds,
    model.maybeSendNetworkSelection.value.accountId,
  )

/** Selects the normalized network descriptor for the primary account. */
export const primaryWalletNetwork = (
  model: Model,
): Option.Option<NetworkDescriptor> =>
  Option.flatMap(primaryWalletAccount(model), account =>
    model.portfolio._tag === 'LoadedPortfolio'
      ? networkForId(model.portfolio.snapshot.networks, account.networkId)
      : Option.none(),
  )

/** Reports whether the selected send network supports one portable capability. */
export const selectedNetworkHasCapability = (
  model: Model,
  capability: typeof WalletCapability.Type,
): boolean => {
  const maybeNetwork = primaryWalletNetwork(model)
  return (
    Option.isSome(maybeNetwork) &&
    Array.contains(maybeNetwork.value.capabilities, capability)
  )
}

/** Selects the real test-funding path for the primary network. */
export const primaryWalletTestFundingMethod = (
  model: Model,
): Option.Option<TestFundingMethod> =>
  Option.map(primaryWalletNetwork(model), network => network.testFundingMethod)

/** Selects the normalized asset descriptor for the primary balance. */
export const primaryWalletAsset = (
  model: Model,
): Option.Option<AssetDescriptor> =>
  model.portfolio._tag === 'LoadedPortfolio' &&
  Option.isSome(model.maybeSendNetworkSelection)
    ? assetForId(
        model.portfolio.snapshot.assets,
        model.maybeSendNetworkSelection.value.assetId,
      )
    : Option.none()

const isSelectedNetworkMainnet = (model: Model): boolean =>
  model.portfolio._tag === 'LoadedPortfolio' &&
  Option.isSome(model.maybeSendNetworkSelection) &&
  Option.exists(
    networkForId(
      model.portfolio.snapshot.networks,
      model.maybeSendNetworkSelection.value.networkId,
    ),
    network => network.environment === 'Mainnet',
  )

const primaryWalletTestAsset = (model: Model) =>
  isSelectedNetworkMainnet(model) ? Option.none() : primaryWalletAsset(model)

/**
 * Selects the adapter-suggested display amount for a small test transfer.
 * Mainnet has none: nothing sent there is a test.
 */
export const primaryWalletSuggestedTestTransferAmount = (
  model: Model,
): Option.Option<string> =>
  Option.map(primaryWalletTestAsset(model), asset =>
    displayAmountFromAtomicUnits(
      asset.suggestedTestTransferAtomicUnits,
      asset.decimalPlaces,
    ),
  )

/** Labels the selected asset's adapter-suggested small test transfer. */
export const primaryWalletSuggestedTestTransferLabel = (
  model: Model,
): Option.Option<string> =>
  Option.map(primaryWalletTestAsset(model), asset => {
    const amount = displayAmountFromAtomicUnits(
      asset.suggestedTestTransferAtomicUnits,
      asset.decimalPlaces,
    )
    return `${amount} ${asset.symbol} · ${asset.suggestedTestTransferAtomicUnits} ${asset.atomicUnitName}`
  })

/** The portfolio is not yet available for a transfer preview. */
export const WaitingForTransferPortfolio = S.TaggedStruct(
  'WaitingForTransferPortfolio',
  {},
)
/** No exact cryptocurrency, network, Wallet, account, and asset are selected. */
export const MissingTransferNetwork = S.TaggedStruct(
  'MissingTransferNetwork',
  {},
)
/** The selected account balance request failed. */
export const UnavailableTransferBalance = S.TaggedStruct(
  'UnavailableTransferBalance',
  {},
)
/** The selected account balance has not arrived yet. */
export const WaitingForTransferBalance = S.TaggedStruct(
  'WaitingForTransferBalance',
  {},
)
/** A transfer amount has not been entered. */
export const MissingTransferAmount = S.TaggedStruct('MissingTransferAmount', {})
/** The entered transfer amount cannot be represented by the selected asset. */
export const InvalidPreviewTransferAmount = S.TaggedStruct(
  'InvalidPreviewTransferAmount',
  {},
)
/** A recipient address has not been entered. */
export const MissingTransferRecipient = S.TaggedStruct(
  'MissingTransferRecipient',
  {},
)
/** The selected adapter rejected the entered recipient address. */
export const InvalidPreviewTransferRecipient = S.TaggedStruct(
  'InvalidPreviewTransferRecipient',
  {},
)
/** The selected adapter is validating the recipient address. */
export const ValidatingPreviewTransfer = S.TaggedStruct(
  'ValidatingPreviewTransfer',
  {},
)
/** The selected adapter is preparing a transaction preview. */
export const PreparingTransferPreview = S.TaggedStruct(
  'PreparingTransferPreview',
  {},
)
/** The signer and adapter are submitting the confirmed preview. */
export const SubmittingPreviewedTransfer = S.TaggedStruct(
  'SubmittingPreviewedTransfer',
  {},
)
/** The transfer inputs are ready for adapter validation and preview. */
export const ReadyToPreviewTransfer = S.TaggedStruct(
  'ReadyToPreviewTransfer',
  {},
)
/** The exact preview is ready for explicit signing and submission. */
export const ReadyToSendPreviewedTransfer = S.TaggedStruct(
  'ReadyToSendPreviewedTransfer',
  {},
)
/** Derived readiness for the single transfer action rendered by every host. */
export const TransferPreviewReadiness = S.Union([
  WaitingForTransferPortfolio,
  MissingTransferNetwork,
  UnavailableTransferBalance,
  WaitingForTransferBalance,
  MissingTransferAmount,
  InvalidPreviewTransferAmount,
  MissingTransferRecipient,
  InvalidPreviewTransferRecipient,
  ValidatingPreviewTransfer,
  PreparingTransferPreview,
  SubmittingPreviewedTransfer,
  ReadyToPreviewTransfer,
  ReadyToSendPreviewedTransfer,
])
/** Derived readiness for the single transfer action rendered by every host. */
export type TransferPreviewReadiness = typeof TransferPreviewReadiness.Type

/** Derives the exact reason the shared transfer action is enabled or blocked. */
export const transferPreviewReadiness = (
  model: Model,
): TransferPreviewReadiness => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return WaitingForTransferPortfolio.make({})
  }
  if (Option.isNone(model.maybeSendNetworkSelection)) {
    return MissingTransferNetwork.make({})
  }
  if (Option.isNone(primaryWalletBalance(model))) {
    return isPrimaryWalletBalanceUnavailable(model)
      ? UnavailableTransferBalance.make({})
      : WaitingForTransferBalance.make({})
  }
  if (model.transferAmount._tag === 'EmptyTransferAmount') {
    return MissingTransferAmount.make({})
  }
  if (model.transferAmount._tag !== 'ValidTransferAmount') {
    return InvalidPreviewTransferAmount.make({})
  }
  if (model.transferRecipient._tag === 'EmptyTransferRecipient') {
    return MissingTransferRecipient.make({})
  }
  if (model.transferRecipient._tag === 'InvalidTransferRecipient') {
    return InvalidPreviewTransferRecipient.make({})
  }
  if (model.transaction._tag === 'ValidatingTransfer') {
    return ValidatingPreviewTransfer.make({})
  }
  if (model.transaction._tag === 'PreviewingTransaction') {
    return PreparingTransferPreview.make({})
  }
  if (model.transaction._tag === 'SubmittingTransaction') {
    return SubmittingPreviewedTransfer.make({})
  }
  if (model.transaction._tag === 'PreviewedTransaction') {
    return ReadyToSendPreviewedTransfer.make({})
  }
  return ReadyToPreviewTransfer.make({})
}

/** Reports whether the current preview or send action can run. */
export const isTransferPreviewActionEnabled = (model: Model): boolean => {
  const readiness = transferPreviewReadiness(model)
  return (
    readiness._tag === 'ReadyToPreviewTransfer' ||
    readiness._tag === 'ReadyToSendPreviewedTransfer'
  )
}

/** Explains why the current transfer can or cannot be previewed. */
export const transferPreviewReadinessLabel = (model: Model): string =>
  M.value(transferPreviewReadiness(model)).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      WaitingForTransferPortfolio: () => 'Loading balances before preview.',
      MissingTransferNetwork: () => 'Select a cryptocurrency and network.',
      UnavailableTransferBalance: () =>
        'Balance unavailable. Refresh the portfolio to retry.',
      WaitingForTransferBalance: () =>
        'Waiting for the selected account balance.',
      MissingTransferAmount: () =>
        Option.isSome(primaryWalletSuggestedTestTransferAmount(model))
          ? 'Enter an amount or use the small test amount.'
          : 'Enter an amount.',
      InvalidPreviewTransferAmount: () => 'Enter a valid positive amount.',
      MissingTransferRecipient: () => 'Enter a recipient address.',
      InvalidPreviewTransferRecipient: () =>
        'Edit the recipient address before retrying.',
      ValidatingPreviewTransfer: () => 'Validating the recipient.',
      PreparingTransferPreview: () => 'Preparing the network preview.',
      SubmittingPreviewedTransfer: () => 'Submitting the signed transaction.',
      ReadyToPreviewTransfer: () => 'Ready to preview.',
      ReadyToSendPreviewedTransfer: () =>
        'Preview ready. Confirm to sign and send.',
    }),
  )

const walletFailureCode = (failure: WalletFailure): string =>
  `${failure.operation}/${failure.code}`

const walletFailureWords = (failure: WalletFailure): string => {
  const isRefused = failure.code === 'Rejected'
  return M.value(failure.operation).pipe(
    M.withReturnType<string>(),
    M.when(
      'ValidateTransfer',
      () => 'This recipient could not be checked. Nothing was sent. Try again.',
    ),
    M.when('PreviewTransfer', () =>
      isRefused
        ? 'This send cannot go through: check the amount against your balance and the fee. Nothing was sent.'
        : 'The network did not answer with a fee. Nothing was sent. Try the preview again.',
    ),
    M.when(
      'BuildTransferPayload',
      () =>
        'This preview can no longer be sent. Nothing was sent. Preview the send again.',
    ),
    M.when(
      'SignTransaction',
      () => 'This wallet could not sign. Nothing was sent.',
    ),
    M.when('SubmitTransaction', () =>
      isRefused
        ? 'The network refused this send. Nothing was sent.'
        : 'The network did not answer, so this send may still land. Check your activity before you send it again.',
    ),
    M.orElse(() => walletFailureCode(failure)),
  )
}

/**
 * Public lines for one sanitized Wallet failure, including adapter guidance.
 * A failed send says in words whether anything was sent, since that is what
 * a person needs before they try again.
 */
export const walletFailureLines = (
  failure: WalletFailure,
): ReadonlyArray<string> => {
  const headline = walletFailureWords(failure)
  if (
    failure._tag !== 'NetworkFailure' ||
    Option.isNone(failure.maybeGuidance)
  ) {
    return [headline]
  }
  const guidance = failure.maybeGuidance.value
  return [
    headline,
    guidance.summary,
    ...Array.map(guidance.details, detail => `- ${detail}`),
  ]
}

/** Formats one sanitized Wallet failure for a CLI or alert string. */
export const walletFailureMessage = (failure: WalletFailure): string =>
  Array.join([walletFailureCode(failure), ...walletFailureLines(failure)], '\n')

/** Selects the primary account and asset's receiving instruction. */
export const primaryReceivingInstruction = (
  model: Model,
): Option.Option<ReceivingInstruction> => {
  if (
    model.portfolio._tag !== 'LoadedPortfolio' ||
    Option.isNone(model.maybeSendNetworkSelection)
  ) {
    return Option.none()
  }
  const portfolio = model.portfolio.snapshot
  const selection = model.maybeSendNetworkSelection.value
  const maybeAccount = primaryWalletAccount(model)
  if (Option.isNone(maybeAccount)) {
    return Option.none()
  }
  return Array.findFirst(
    portfolio.receivingInstructions,
    instruction =>
      instruction.accountId === maybeAccount.value.accountId &&
      instruction.assetId === selection.assetId,
  )
}

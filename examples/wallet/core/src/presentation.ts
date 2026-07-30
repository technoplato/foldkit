import { Array, Match as M, Option } from 'effect'

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
  networkForId,
} from './currency.js'
import type {
  AccountBalance,
  Model,
  ReceivingInstruction,
  WalletAccount,
  WalletDataSource,
} from './model.js'
import { sendNetworkSelectionLabel } from './sendNetworkSelection.js'

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

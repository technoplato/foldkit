import { Array, Option } from 'effect'

import {
  type AssetAmount,
  type AssetDescriptor,
  type NetworkDescriptor,
  assetForId,
  networkForId,
} from './currency.js'
import type {
  AccountBalance,
  Model,
  ReceivingInstruction,
  WalletAccount,
} from './model.js'

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

/** Selects the normalized network descriptor for the primary account. */
export const primaryWalletNetwork = (
  model: Model,
): Option.Option<NetworkDescriptor> =>
  Option.flatMap(primaryWalletAccount(model), account =>
    model.portfolio._tag === 'LoadedPortfolio'
      ? networkForId(model.portfolio.snapshot.networks, account.networkId)
      : Option.none(),
  )

/** Selects the normalized asset descriptor for the primary balance. */
export const primaryWalletAsset = (
  model: Model,
): Option.Option<AssetDescriptor> =>
  Option.flatMap(primaryWalletBalance(model), balance =>
    model.portfolio._tag === 'LoadedPortfolio'
      ? assetForId(model.portfolio.snapshot.assets, balance.amount.assetId)
      : Option.none(),
  )

/** Selects the primary account and asset's receiving instruction. */
export const primaryReceivingInstruction = (
  model: Model,
): Option.Option<ReceivingInstruction> =>
  Option.flatMap(primaryWalletAccount(model), account =>
    Option.flatMap(primaryWalletBalance(model), balance =>
      model.portfolio._tag === 'LoadedPortfolio'
        ? Array.findFirst(
            model.portfolio.snapshot.receivingInstructions,
            instruction =>
              instruction.accountId === account.accountId &&
              instruction.assetId === balance.amount.assetId,
          )
        : Option.none(),
    ),
  )

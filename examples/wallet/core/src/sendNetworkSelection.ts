import { Array, Option, Schema as S } from 'effect'

import {
  AssetId,
  type AtomicUnits,
  ChainId,
  type NetworkEnvironment,
  NetworkId,
} from './currency.js'
import type { PortfolioSnapshot } from './model.js'
import type { WalletNetworkMode } from './walletProfile.js'

/** One exact account, network, and native asset selected for sending. */
export const SendNetworkSelection = S.Struct({
  networkMode: S.Literals(['Devnet', 'Testnet']),
  chainId: ChainId,
  networkId: NetworkId,
  accountId: S.String,
  assetId: AssetId,
})
/** One exact account, network, and native asset selected for sending. */
export type SendNetworkSelection = typeof SendNetworkSelection.Type

const isNetworkInMode = (
  environment: NetworkEnvironment,
  networkMode: WalletNetworkMode,
): boolean =>
  networkMode === 'Devnet'
    ? environment === 'Development' || environment === 'Local'
    : environment === 'Testnet'

/** Projects every native transfer rail available in one global network mode. */
export const availableSendNetworkSelections = (
  portfolio: PortfolioSnapshot,
  networkMode: WalletNetworkMode,
): ReadonlyArray<SendNetworkSelection> =>
  Array.flatMap(portfolio.networks, network => {
    const isTransferNetwork = Array.contains(network.capabilities, 'Transfer')
    if (
      !isTransferNetwork ||
      !isNetworkInMode(network.environment, networkMode)
    ) {
      return []
    }
    const accounts = Array.filter(
      portfolio.accounts,
      account => account.networkId === network.networkId,
    )
    const nativeAssets = Array.filter(
      portfolio.assets,
      asset =>
        asset.networkId === network.networkId &&
        asset.kind._tag === 'NativeAsset',
    )
    return Array.flatMap(accounts, account =>
      Array.flatMap(nativeAssets, asset => {
        const hasBalance = Array.some(
          portfolio.balanceSnapshot.balances,
          balance =>
            balance.accountId === account.accountId &&
            balance.amount.assetId === asset.assetId,
        )
        return hasBalance
          ? [
              SendNetworkSelection.make({
                networkMode,
                chainId: network.chainId,
                networkId: network.networkId,
                accountId: account.accountId,
                assetId: asset.assetId,
              }),
            ]
          : []
      }),
    )
  })

/** Reports whether two send-network selections identify the same rail. */
export const isSameSendNetworkSelection = (
  left: SendNetworkSelection,
  right: SendNetworkSelection,
): boolean =>
  left.networkMode === right.networkMode &&
  left.chainId === right.chainId &&
  left.networkId === right.networkId &&
  left.accountId === right.accountId &&
  left.assetId === right.assetId

/** Validates one exact send-network selection against a loaded portfolio. */
export const resolveSendNetworkSelection = (
  portfolio: PortfolioSnapshot,
  selection: SendNetworkSelection,
): Option.Option<SendNetworkSelection> =>
  Array.findFirst(
    availableSendNetworkSelections(portfolio, selection.networkMode),
    candidate => isSameSendNetworkSelection(candidate, selection),
  )

/** Selects a rail for one mode while preserving the selected chain when possible. */
export const selectSendNetworkForMode = (
  portfolio: PortfolioSnapshot,
  maybeCurrent: Option.Option<SendNetworkSelection>,
  networkMode: WalletNetworkMode,
): Option.Option<SendNetworkSelection> => {
  const selections = availableSendNetworkSelections(portfolio, networkMode)
  if (Option.isSome(maybeCurrent)) {
    const maybeMatchingChain = Array.findFirst(
      selections,
      selection => selection.chainId === maybeCurrent.value.chainId,
    )
    if (Option.isSome(maybeMatchingChain)) {
      return maybeMatchingChain
    }
  }
  const maybeEthereum = Array.findFirst(
    selections,
    selection => selection.chainId === 'ethereum',
  )
  return Option.isSome(maybeEthereum) ? maybeEthereum : Array.head(selections)
}

/** Selects the next available rail in the current global network mode. */
export const nextSendNetworkSelection = (
  portfolio: PortfolioSnapshot,
  current: SendNetworkSelection,
): Option.Option<SendNetworkSelection> => {
  const selections = availableSendNetworkSelections(
    portfolio,
    current.networkMode,
  )
  const maybeCurrentIndex = Array.findFirstIndex(selections, selection =>
    isSameSendNetworkSelection(selection, current),
  )
  if (
    Option.isNone(maybeCurrentIndex) ||
    Array.isReadonlyArrayEmpty(selections)
  ) {
    return Array.head(selections)
  }
  return Array.get(
    selections,
    (maybeCurrentIndex.value + 1) % Array.length(selections),
  )
}

/** Returns a small demonstrative native-asset amount for one send rail. */
export const demoTransferAtomicUnitsForSelection = (
  selection: SendNetworkSelection,
): AtomicUnits => {
  if (selection.chainId === 'bitcoin') {
    return '10000'
  } else if (selection.chainId === 'ethereum') {
    return '10000000000000'
  } else {
    return '1000000'
  }
}

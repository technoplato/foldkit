import { Array, Option, Schema as S } from 'effect'

import {
  AssetId,
  ChainId,
  NetworkId,
  assetForId,
  networkForId,
} from './currency.js'
import type { PortfolioSnapshot } from './model.js'
import {
  WalletNetworkMode,
  type WalletProfile,
  isNetworkEnvironmentInWalletMode,
  walletProfileForAccountId,
} from './walletProfile.js'

/** One exact account, network, and transferable asset selected for sending. */
export const SendNetworkSelection = S.Struct({
  networkMode: WalletNetworkMode,
  chainId: ChainId,
  networkId: NetworkId,
  accountId: S.String,
  assetId: AssetId,
})
/** One exact account, network, and transferable asset selected for sending. */
export type SendNetworkSelection = typeof SendNetworkSelection.Type

/** Encodes one exact selection for stable host option values and view identity. */
export const sendNetworkSelectionIdentity = (
  selection: SendNetworkSelection,
): string =>
  `${encodeURIComponent(selection.networkMode)}|${encodeURIComponent(
    selection.chainId,
  )}|${encodeURIComponent(selection.networkId)}|${encodeURIComponent(
    selection.accountId,
  )}|${encodeURIComponent(selection.assetId)}`

/** Formats one exact Wallet, cryptocurrency, and network selection. */
export const sendNetworkSelectionLabel = (
  portfolio: PortfolioSnapshot,
  wallets: ReadonlyArray<WalletProfile>,
  selection: SendNetworkSelection,
): string => {
  const walletName = Option.match(
    walletProfileForAccountId(wallets, selection.accountId),
    {
      onNone: () => selection.accountId,
      onSome: wallet => wallet.displayName,
    },
  )
  const assetName = Option.match(
    assetForId(portfolio.assets, selection.assetId),
    {
      onNone: () => selection.assetId,
      onSome: asset => asset.symbol,
    },
  )
  const networkName = Option.match(
    networkForId(portfolio.networks, selection.networkId),
    {
      onNone: () => selection.networkId,
      onSome: network => network.displayName,
    },
  )
  return `${walletName} · ${assetName} · ${networkName}`
}

/** Projects every transfer rail available in one global network mode. */
export const availableSendNetworkSelections = (
  portfolio: PortfolioSnapshot,
  networkMode: WalletNetworkMode,
): ReadonlyArray<SendNetworkSelection> =>
  Array.flatMap(portfolio.networks, network => {
    const isTransferNetwork = Array.contains(network.capabilities, 'Transfer')
    if (
      !isTransferNetwork ||
      !isNetworkEnvironmentInWalletMode(network.environment, networkMode)
    ) {
      return []
    }
    const accounts = Array.filter(
      portfolio.accounts,
      account => account.networkId === network.networkId,
    )
    const assets = Array.filter(
      portfolio.assets,
      asset => asset.networkId === network.networkId,
    )
    return Array.flatMap(accounts, account =>
      Array.map(assets, asset =>
        SendNetworkSelection.make({
          networkMode,
          chainId: network.chainId,
          networkId: network.networkId,
          accountId: account.accountId,
          assetId: asset.assetId,
        }),
      ),
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

/** Selects a rail for one mode while preserving the selected Wallet and chain when possible. */
export const selectSendNetworkForMode = (
  portfolio: PortfolioSnapshot,
  wallets: ReadonlyArray<WalletProfile>,
  maybeCurrent: Option.Option<SendNetworkSelection>,
  networkMode: WalletNetworkMode,
): Option.Option<SendNetworkSelection> => {
  const selections = availableSendNetworkSelections(portfolio, networkMode)
  if (Option.isSome(maybeCurrent)) {
    const maybeWallet = walletProfileForAccountId(
      wallets,
      maybeCurrent.value.accountId,
    )
    const maybeMatchingWalletAndChain = Array.findFirst(
      selections,
      selection =>
        selection.chainId === maybeCurrent.value.chainId &&
        Option.isSome(maybeWallet) &&
        Array.some(
          maybeWallet.value.accounts,
          account => account.accountId === selection.accountId,
        ),
    )
    if (Option.isSome(maybeMatchingWalletAndChain)) {
      return maybeMatchingWalletAndChain
    }
    if (Option.isSome(maybeWallet)) {
      const maybeMatchingWallet = Array.findFirst(selections, selection =>
        Array.some(
          maybeWallet.value.accounts,
          account => account.accountId === selection.accountId,
        ),
      )
      if (Option.isSome(maybeMatchingWallet)) {
        return maybeMatchingWallet
      }
    }
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

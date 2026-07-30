import { Layer } from 'effect'
import {
  type WalletDataSource,
  type WalletResources,
} from 'wallet-core-example'
import {
  EthereumAnvilEndpoint,
  LiveWalletClient,
  liveWalletNetworksWithEthereumAnvilEndpoint,
  makeLiveWalletClientLayer,
} from 'wallet-live-client-example'

import { ExpoWalletClipboard } from './walletClipboard'
import { mergeWalletResourceLayers } from './walletResourceGraph'
import { ExpoWalletResources } from './walletVault'

const nativeLiveWalletClient = (
  httpRpcUrl: string | undefined,
  webSocketRpcUrl: string | undefined,
) => {
  if (httpRpcUrl === undefined || webSocketRpcUrl === undefined) {
    return LiveWalletClient
  } else {
    return makeLiveWalletClientLayer(
      liveWalletNetworksWithEthereumAnvilEndpoint(
        EthereumAnvilEndpoint.make({ httpRpcUrl, webSocketRpcUrl }),
      ),
    )
  }
}

/** Builds native Wallet resources without importing browser custody modules. */
export const makeWalletResourcesForPlatform = (
  _platform: string,
  _webDataSource: WalletDataSource,
  httpRpcUrl: string | undefined,
  webSocketRpcUrl: string | undefined,
): Layer.Layer<WalletResources> =>
  mergeWalletResourceLayers(
    nativeLiveWalletClient(httpRpcUrl, webSocketRpcUrl),
    ExpoWalletResources,
    ExpoWalletClipboard,
  )

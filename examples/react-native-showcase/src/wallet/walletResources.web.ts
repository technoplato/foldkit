import { type Layer } from 'effect'
import {
  type WalletDataSource,
  type WalletResources,
} from 'wallet-core-example'
import { makeWebWalletResources } from 'wallet-web-client-example'

/** Builds Expo Web Wallet resources without importing native custody modules. */
export const makeWalletResourcesForPlatform = (
  _platform: string,
  webDataSource: WalletDataSource,
  _httpRpcUrl: string | undefined,
  _webSocketRpcUrl: string | undefined,
): Layer.Layer<WalletResources> => makeWebWalletResources(webDataSource)

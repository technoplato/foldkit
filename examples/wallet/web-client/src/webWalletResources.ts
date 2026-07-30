import { Layer, Match as M } from 'effect'
import {
  type WalletDataSource,
  type WalletResources,
} from 'wallet-core-example'
import { LiveWalletClient } from 'wallet-live-client-example'
import {
  makeRemoteWalletResources,
  publicTestnetWalletEndpoint,
} from 'wallet-remote-example'
import { makeSimulatedWalletResources } from 'wallet-simulated-client-example'

import { WalletWebClipboard } from './webClipboard.js'
import { BrowserWalletResources, BrowserWalletVault } from './webWalletVault.js'

/** Parses a host setting into one complete Wallet data-source selection. */
export const walletDataSourceFromEnvironment = (
  value: string | undefined,
): WalletDataSource => {
  if (value === 'Fixture' || value === 'Testnet') {
    return value
  } else {
    return 'Live'
  }
}

/** Selects one complete browser resource graph without mixing data sources. */
export const makeWebWalletResources = (
  dataSource: WalletDataSource,
): Layer.Layer<WalletResources> =>
  M.value(dataSource).pipe(
    M.withReturnType<Layer.Layer<WalletResources>>(),
    M.when('Fixture', () =>
      makeSimulatedWalletResources({
        walletClipboard: WalletWebClipboard,
      }),
    ),
    M.when('Testnet', () =>
      makeRemoteWalletResources(publicTestnetWalletEndpoint, {
        walletClipboard: WalletWebClipboard,
        walletVault: BrowserWalletVault,
      }),
    ),
    M.when('Live', () =>
      Layer.mergeAll(
        LiveWalletClient,
        BrowserWalletResources,
        WalletWebClipboard,
      ),
    ),
    M.exhaustive,
  )

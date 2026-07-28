import { type Layer, Match as M } from 'effect'
import {
  type WalletDataSource,
  type WalletResources,
} from 'wallet-core-example'
import {
  makeRemoteWalletResources,
  publicTestnetWalletEndpoint,
} from 'wallet-remote-example'
import { makeSimulatedWalletResources } from 'wallet-simulated-client-example'

import { WalletWebClipboard } from './webClipboard.js'
import { BrowserWalletVault } from './webWalletVault.js'

/** Parses a host setting into one complete Wallet data-source selection. */
export const walletDataSourceFromEnvironment = (
  value: string | undefined,
): WalletDataSource => (value === 'Testnet' ? 'Testnet' : 'Fixture')

/** Selects one complete browser resource graph without mixing data sources. */
export const makeWebWalletResources = (
  dataSource: WalletDataSource,
): Layer.Layer<WalletResources> =>
  M.value(dataSource).pipe(
    M.withReturnType<Layer.Layer<WalletResources>>(),
    M.when('Fixture', () =>
      makeSimulatedWalletResources({
        walletClipboard: WalletWebClipboard,
        walletVault: BrowserWalletVault,
      }),
    ),
    M.when('Testnet', () =>
      makeRemoteWalletResources(publicTestnetWalletEndpoint, {
        walletClipboard: WalletWebClipboard,
        walletVault: BrowserWalletVault,
      }),
    ),
    M.exhaustive,
  )

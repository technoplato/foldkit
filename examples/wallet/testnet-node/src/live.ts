import { Layer } from 'effect'
import { LocalWalletVault } from 'wallet-local-vault-example'

import {
  EthereumSepoliaKeyConfig,
  EthereumSepoliaKeyConfigFromEnv,
  EthereumSepoliaNodeConfig,
  EthereumSepoliaNodeConfigFromEnv,
  SolanaDevnetKeyConfigFromEnv,
  SolanaDevnetNodeConfigFromEnv,
} from './config.js'
import {
  EthereumSepoliaLocalCustodyLive,
  EthereumSepoliaTransportLive,
} from './ethereumSepolia.js'
import { EthereumSepoliaWalletServicesLive } from './ethereumWalletServices.js'
import {
  SolanaDevnetLocalCustodyLive,
  SolanaDevnetTransportLive,
} from './solanaDevnet.js'
import {
  WalletNetworkServicesLive,
  WalletServicesLive,
  WalletSignerLive,
} from './walletServices.js'

const TestnetNodeNetworkConfigFromEnv = Layer.mergeAll(
  EthereumSepoliaNodeConfigFromEnv,
  SolanaDevnetNodeConfigFromEnv,
)

const TestnetNodeLocalSignerConfigFromEnv = Layer.mergeAll(
  EthereumSepoliaNodeConfigFromEnv,
  SolanaDevnetNodeConfigFromEnv,
  EthereumSepoliaKeyConfigFromEnv,
  SolanaDevnetKeyConfigFromEnv,
)

const TestnetNodeNetworkAdaptersLive = Layer.mergeAll(
  EthereumSepoliaTransportLive,
  SolanaDevnetTransportLive,
).pipe(Layer.provide(TestnetNodeNetworkConfigFromEnv))

const TestnetNodeLocalCustodyLive = Layer.mergeAll(
  EthereumSepoliaLocalCustodyLive,
  SolanaDevnetLocalCustodyLive,
).pipe(Layer.provide(TestnetNodeLocalSignerConfigFromEnv))

const EthereumSepoliaConfigFromEnv = Layer.mergeAll(
  EthereumSepoliaNodeConfigFromEnv,
  EthereumSepoliaKeyConfigFromEnv,
)

const EthereumSepoliaAdaptersLive = Layer.merge(
  EthereumSepoliaTransportLive,
  EthereumSepoliaLocalCustodyLive,
).pipe(Layer.provide(EthereumSepoliaConfigFromEnv))

/** Builds complete Sepolia resources from host-supplied public and protected configuration. */
export const makeEthereumSepoliaWalletLive = <LayerError, Requirements>(
  config: Layer.Layer<
    EthereumSepoliaNodeConfig | EthereumSepoliaKeyConfig,
    LayerError,
    Requirements
  >,
) =>
  Layer.merge(
    EthereumSepoliaWalletServicesLive.pipe(
      Layer.provide(
        Layer.merge(
          EthereumSepoliaTransportLive,
          EthereumSepoliaLocalCustodyLive,
        ).pipe(Layer.provide(config)),
      ),
    ),
    LocalWalletVault,
  )

/** WalletClient and WalletCrypto for Sepolia and Devnet without local custody. */
export const TestnetNodeNetworkLive = WalletNetworkServicesLive.pipe(
  Layer.provide(TestnetNodeNetworkAdaptersLive),
)

/** WalletSigner for Sepolia and Devnet using Redacted local keys. */
export const TestnetNodeLocalSignerLive = WalletSignerLive.pipe(
  Layer.provide(TestnetNodeLocalCustodyLive),
)

/** Complete wallet-core resources for Sepolia and Devnet from Redacted environment configuration. */
export const TestnetNodeWalletLive = Layer.merge(
  WalletServicesLive.pipe(
    Layer.provide(
      Layer.merge(TestnetNodeNetworkAdaptersLive, TestnetNodeLocalCustodyLive),
    ),
  ),
  LocalWalletVault,
)

/** Complete wallet-core resources for the configured Sepolia account only. */
export const EthereumSepoliaWalletLive = Layer.merge(
  EthereumSepoliaWalletServicesLive.pipe(
    Layer.provide(EthereumSepoliaAdaptersLive),
  ),
  LocalWalletVault,
)

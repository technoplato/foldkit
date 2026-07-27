import { Layer } from 'effect'

import {
  EthereumSepoliaKeyConfigFromEnv,
  EthereumSepoliaNodeConfigFromEnv,
  SolanaDevnetKeyConfigFromEnv,
  SolanaDevnetNodeConfigFromEnv,
} from './config.js'
import {
  EthereumSepoliaLocalCustodyLive,
  EthereumSepoliaTransportLive,
} from './ethereumSepolia.js'
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

/** WalletClient and WalletCrypto for Sepolia and Devnet without local custody. */
export const TestnetNodeNetworkLive = WalletNetworkServicesLive.pipe(
  Layer.provide(TestnetNodeNetworkAdaptersLive),
)

/** WalletSigner for Sepolia and Devnet using Redacted local keys. */
export const TestnetNodeLocalSignerLive = WalletSignerLive.pipe(
  Layer.provide(TestnetNodeLocalCustodyLive),
)

/** Complete wallet-core resources for Sepolia and Devnet from Redacted environment configuration. */
export const TestnetNodeWalletLive = WalletServicesLive.pipe(
  Layer.provide(
    Layer.merge(TestnetNodeNetworkAdaptersLive, TestnetNodeLocalCustodyLive),
  ),
)

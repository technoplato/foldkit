import { Config, Context, Effect, Layer, Redacted } from 'effect'

/** Public account and protected RPC configuration for Ethereum Sepolia. */
export type EthereumSepoliaNodeConfigService = Readonly<{
  accountId: string
  address: string
  displayName: string
  httpRpcUrl: Redacted.Redacted<string>
  webSocketRpcUrl: Redacted.Redacted<string>
}>

/** Public account and protected RPC configuration for Solana Devnet. */
export type SolanaDevnetNodeConfigService = Readonly<{
  accountId: string
  address: string
  displayName: string
  httpRpcUrl: Redacted.Redacted<string>
  webSocketRpcUrl: Redacted.Redacted<string>
}>

/** Protected local Ethereum custody material loaded only by the Node host. */
export type EthereumSepoliaKeyConfigService = Readonly<{
  accountId: string
  privateKeyHex: Redacted.Redacted<string>
}>

/** Protected local Solana custody material loaded only by the Node host. */
export type SolanaDevnetKeyConfigService = Readonly<{
  accountId: string
  secretKeyBase64: Redacted.Redacted<string>
}>

/** Ethereum Sepolia account and provider configuration. */
export class EthereumSepoliaNodeConfig extends Context.Service<
  EthereumSepoliaNodeConfig,
  EthereumSepoliaNodeConfigService
>()('WalletTestnetNode/EthereumSepoliaNodeConfig') {}

/** Solana Devnet account and provider configuration. */
export class SolanaDevnetNodeConfig extends Context.Service<
  SolanaDevnetNodeConfig,
  SolanaDevnetNodeConfigService
>()('WalletTestnetNode/SolanaDevnetNodeConfig') {}

/** Ethereum Sepolia local-key custody configuration. */
export class EthereumSepoliaKeyConfig extends Context.Service<
  EthereumSepoliaKeyConfig,
  EthereumSepoliaKeyConfigService
>()('WalletTestnetNode/EthereumSepoliaKeyConfig') {}

/** Solana Devnet local-key custody configuration. */
export class SolanaDevnetKeyConfig extends Context.Service<
  SolanaDevnetKeyConfig,
  SolanaDevnetKeyConfigService
>()('WalletTestnetNode/SolanaDevnetKeyConfig') {}

/** Loads Ethereum Sepolia account and protected provider URLs from environment configuration. */
export const EthereumSepoliaNodeConfigFromEnv = Layer.effect(
  EthereumSepoliaNodeConfig,
  Effect.gen(function* () {
    const accountId = yield* Config.string('WALLET_ETHEREUM_SEPOLIA_ACCOUNT_ID')
    const address = yield* Config.string(
      'WALLET_ETHEREUM_SEPOLIA_ACCOUNT_ADDRESS',
    )
    const displayName = yield* Config.string(
      'WALLET_ETHEREUM_SEPOLIA_DISPLAY_NAME',
    )
    const httpRpcUrl = yield* Config.redacted(
      'WALLET_ETHEREUM_SEPOLIA_HTTP_RPC_URL',
    )
    const webSocketRpcUrl = yield* Config.redacted(
      'WALLET_ETHEREUM_SEPOLIA_WS_RPC_URL',
    )
    return {
      accountId,
      address,
      displayName,
      httpRpcUrl,
      webSocketRpcUrl,
    }
  }),
)

/** Loads Solana Devnet account and protected provider URLs from environment configuration. */
export const SolanaDevnetNodeConfigFromEnv = Layer.effect(
  SolanaDevnetNodeConfig,
  Effect.gen(function* () {
    const accountId = yield* Config.string('WALLET_SOLANA_DEVNET_ACCOUNT_ID')
    const address = yield* Config.string('WALLET_SOLANA_DEVNET_ACCOUNT_ADDRESS')
    const displayName = yield* Config.string(
      'WALLET_SOLANA_DEVNET_DISPLAY_NAME',
    )
    const httpRpcUrl = yield* Config.redacted(
      'WALLET_SOLANA_DEVNET_HTTP_RPC_URL',
    )
    const webSocketRpcUrl = yield* Config.redacted(
      'WALLET_SOLANA_DEVNET_WS_RPC_URL',
    )
    return {
      accountId,
      address,
      displayName,
      httpRpcUrl,
      webSocketRpcUrl,
    }
  }),
)

/** Loads a protected Ethereum Sepolia private key for the optional local custody Layer. */
export const EthereumSepoliaKeyConfigFromEnv = Layer.effect(
  EthereumSepoliaKeyConfig,
  Effect.gen(function* () {
    const accountId = yield* Config.string('WALLET_ETHEREUM_SEPOLIA_ACCOUNT_ID')
    const privateKeyHex = yield* Config.redacted(
      'WALLET_ETHEREUM_SEPOLIA_PRIVATE_KEY_HEX',
    )
    return { accountId, privateKeyHex }
  }),
)

/** Loads a protected Solana Devnet secret key for the optional local custody Layer. */
export const SolanaDevnetKeyConfigFromEnv = Layer.effect(
  SolanaDevnetKeyConfig,
  Effect.gen(function* () {
    const accountId = yield* Config.string('WALLET_SOLANA_DEVNET_ACCOUNT_ID')
    const secretKeyBase64 = yield* Config.redacted(
      'WALLET_SOLANA_DEVNET_SECRET_KEY_BASE64',
    )
    return { accountId, secretKeyBase64 }
  }),
)

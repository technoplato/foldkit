import { Config, Effect, Encoding, FileSystem, Layer, Redacted } from 'effect'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { privateKeyToAccount } from 'viem/accounts'
import {
  EthereumSepoliaKeyConfig,
  EthereumSepoliaNodeConfig,
  makeEthereumSepoliaWalletLive,
} from 'wallet-testnet-node-example'

const defaultKeyFilePath = join(
  homedir(),
  'Library',
  'Application Support',
  'Foldkit',
  'wallet-testnet',
  'sepolia-sender.key',
)
const defaultHttpRpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com'
const defaultWebSocketRpcUrl = 'wss://ethereum-sepolia-rpc.publicnode.com'

const LocalTestWalletConfigLive = Layer.unwrap(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const keyFilePath = yield* Config.string(
      'WALLET_ETHEREUM_SEPOLIA_PRIVATE_KEY_FILE',
    ).pipe(Config.withDefault(defaultKeyFilePath))
    const accountId = yield* Config.string(
      'WALLET_ETHEREUM_SEPOLIA_ACCOUNT_ID',
    ).pipe(Config.withDefault('sepolia-sender'))
    const displayName = yield* Config.string(
      'WALLET_ETHEREUM_SEPOLIA_DISPLAY_NAME',
    ).pipe(Config.withDefault('Foldkit Sepolia test wallet'))
    const httpRpcUrl = yield* Config.redacted(
      'WALLET_ETHEREUM_SEPOLIA_HTTP_RPC_URL',
    ).pipe(Config.withDefault(Redacted.make(defaultHttpRpcUrl)))
    const webSocketRpcUrl = yield* Config.redacted(
      'WALLET_ETHEREUM_SEPOLIA_WS_RPC_URL',
    ).pipe(Config.withDefault(Redacted.make(defaultWebSocketRpcUrl)))
    const privateKeyBytes = yield* fileSystem.readFile(keyFilePath)
    if (privateKeyBytes.length !== 32) {
      return yield* Effect.die(
        new Error(
          'The Sepolia test wallet key file must contain exactly 32 bytes',
        ),
      )
    }
    const privateKeyHex = Encoding.encodeHex(privateKeyBytes)
    const account = yield* Effect.try({
      try: () => privateKeyToAccount(`0x${privateKeyHex}`),
      catch: () => new Error('The Sepolia test wallet key is invalid'),
    })
    return Layer.merge(
      Layer.succeed(EthereumSepoliaNodeConfig, {
        accountId,
        address: account.address,
        displayName,
        httpRpcUrl,
        webSocketRpcUrl,
      }),
      Layer.succeed(EthereumSepoliaKeyConfig, {
        accountId,
        privateKeyHex: Redacted.make(privateKeyHex),
      }),
    )
  }),
)

/** Complete Sepolia Wallet resources for the machine-local disposable test key. */
export const LocalTestWalletLive = makeEthereumSepoliaWalletLive(
  LocalTestWalletConfigLive,
)

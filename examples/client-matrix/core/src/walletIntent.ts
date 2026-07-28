import { Array, Effect, Match as M, Schema as S } from 'effect'
import {
  SendAssetIntent,
  WalletIntent,
  walletIntentRouter,
} from 'wallet-core-example'

import { WalletClientId } from './wallet.js'

/** Host intake support for the shared Wallet intent codec. */
export const WalletIntentClientSupport = S.Literals([
  'Active',
  'HostIntakePending',
  'Planned',
])
/** Host intake support for the shared Wallet intent codec. */
export type WalletIntentClientSupport = typeof WalletIntentClientSupport.Type

/** Execution support represented by one normalized Wallet intent example. */
export const WalletIntentSupport = S.Literals(['Implemented', 'Unsupported'])
/** Execution support represented by one normalized Wallet intent example. */
export type WalletIntentSupport = typeof WalletIntentSupport.Type

/** Network capability metadata for one normalized Wallet intent example. */
export const WalletIntentCapability = S.Struct({
  support: WalletIntentSupport,
  network: S.String,
  reason: S.String,
})
/** Network capability metadata for one normalized Wallet intent example. */
export type WalletIntentCapability = typeof WalletIntentCapability.Type

/** One canonical send-money intent and its portable relative URI. */
export const WalletIntentDefinition = S.Struct({
  id: S.String,
  title: S.String,
  description: S.String,
  intent: WalletIntent,
  portableRoute: S.String,
  capability: WalletIntentCapability,
})
/** One canonical send-money intent and its portable relative URI. */
export type WalletIntentDefinition = typeof WalletIntentDefinition.Type

/** One host carrier for a portable Wallet intent. */
export const WalletIntentCarrier = S.Struct({
  clientId: WalletClientId,
  support: WalletIntentClientSupport,
  carrier: S.String,
  limitation: S.String,
})
/** One host carrier for a portable Wallet intent. */
export type WalletIntentCarrier = typeof WalletIntentCarrier.Type

const ethereumDestination = '0xF0135cBe737572885131c6831B1E061e679E7933'
const solanaDestination = '7XSg97qfSE6n2J1aVfxyTLZgcV7R4sr1kPnCVTLMriYJ'

const makeIntentDefinition = (
  id: string,
  title: string,
  description: string,
  intent: WalletIntent,
  capability: WalletIntentCapability,
): WalletIntentDefinition =>
  WalletIntentDefinition.make({
    id,
    title,
    description,
    intent,
    portableRoute: Effect.runSync(walletIntentRouter.print(intent)),
    capability,
  })

/** ETH, SOL, and USD intent examples over every requested deployment mode. */
export const walletIntentDefinitions: ReadonlyArray<WalletIntentDefinition> = [
  makeIntentDefinition(
    'eth-devnet',
    'ETH | Devnet',
    'Valid request with no configured Ethereum Devnet execution Layer.',
    SendAssetIntent.make({
      accountId: 'ethereum-local-demo',
      assetId: 'ethereum:local:eth',
      atomicUnits: '1000000000000000',
      destinationAddress: ethereumDestination,
    }),
    WalletIntentCapability.make({
      support: 'Unsupported',
      network: 'Ethereum Localnet',
      reason: 'No Ethereum development execution Layer is configured.',
    }),
  ),
  makeIntentDefinition(
    'eth-testnet',
    'ETH | Testnet',
    'One milli-ETH on Ethereum Sepolia.',
    SendAssetIntent.make({
      accountId: 'simulated-ethereum-account',
      assetId: 'ethereum:sepolia:eth',
      atomicUnits: '1000000000000000',
      destinationAddress: ethereumDestination,
    }),
    WalletIntentCapability.make({
      support: 'Implemented',
      network: 'Ethereum Sepolia',
      reason:
        'The testnet adapter validates, previews, signs, and submits ETH.',
    }),
  ),
  makeIntentDefinition(
    'eth-live',
    'ETH | Live',
    'Canonical mainnet intent with deliberately unavailable execution.',
    SendAssetIntent.make({
      accountId: 'ethereum-mainnet-demo',
      assetId: 'ethereum:mainnet:eth',
      atomicUnits: '1000000000000000',
      destinationAddress: ethereumDestination,
    }),
    WalletIntentCapability.make({
      support: 'Unsupported',
      network: 'Ethereum Mainnet',
      reason: 'No mainnet execution Layer is configured.',
    }),
  ),
  makeIntentDefinition(
    'sol-devnet',
    'SOL | Devnet',
    'One milli-SOL on Solana Devnet.',
    SendAssetIntent.make({
      accountId: 'simulated-solana-account',
      assetId: 'solana:devnet:sol',
      atomicUnits: '1000000',
      destinationAddress: solanaDestination,
    }),
    WalletIntentCapability.make({
      support: 'Implemented',
      network: 'Solana Devnet',
      reason:
        'The testnet adapter validates, previews, signs, and submits SOL.',
    }),
  ),
  makeIntentDefinition(
    'sol-testnet',
    'SOL | Testnet',
    'The network is typed, but the current Layer rejects execution.',
    SendAssetIntent.make({
      accountId: 'solana-testnet-demo',
      assetId: 'solana:testnet:sol',
      atomicUnits: '1000000',
      destinationAddress: solanaDestination,
    }),
    WalletIntentCapability.make({
      support: 'Unsupported',
      network: 'Solana Testnet',
      reason: 'No Solana Testnet execution Layer is configured.',
    }),
  ),
  makeIntentDefinition(
    'sol-live',
    'SOL | Live',
    'Canonical mainnet intent with deliberately unavailable execution.',
    SendAssetIntent.make({
      accountId: 'solana-mainnet-demo',
      assetId: 'solana:mainnet:sol',
      atomicUnits: '1000000',
      destinationAddress: solanaDestination,
    }),
    WalletIntentCapability.make({
      support: 'Unsupported',
      network: 'Solana Mainnet',
      reason: 'No mainnet execution Layer is configured.',
    }),
  ),
  makeIntentDefinition(
    'usd-devnet',
    'USD | Devnet',
    'One USD represented by one million atomic USDC units on Solana Devnet.',
    SendAssetIntent.make({
      accountId: 'simulated-solana-account',
      assetId: 'solana:devnet:usdc',
      atomicUnits: '1000000',
      destinationAddress: solanaDestination,
    }),
    WalletIntentCapability.make({
      support: 'Implemented',
      network: 'Solana Devnet',
      reason: 'The normalized adapter represents USDC as an issued asset.',
    }),
  ),
  makeIntentDefinition(
    'usd-testnet',
    'USD | Testnet',
    'One USD represented by one million atomic USDC units on Sepolia.',
    SendAssetIntent.make({
      accountId: 'simulated-ethereum-account',
      assetId: 'ethereum:sepolia:usdc',
      atomicUnits: '1000000',
      destinationAddress: ethereumDestination,
    }),
    WalletIntentCapability.make({
      support: 'Implemented',
      network: 'Ethereum Sepolia',
      reason: 'The normalized adapter represents USDC as an issued asset.',
    }),
  ),
  makeIntentDefinition(
    'usd-live',
    'USD | Live',
    'Canonical USDC intent with deliberately unavailable mainnet execution.',
    SendAssetIntent.make({
      accountId: 'ethereum-mainnet-demo',
      assetId: 'ethereum:mainnet:usdc',
      atomicUnits: '1000000',
      destinationAddress: ethereumDestination,
    }),
    WalletIntentCapability.make({
      support: 'Unsupported',
      network: 'Ethereum Mainnet',
      reason: 'No mainnet execution Layer is configured.',
    }),
  ),
]

/** Wraps one portable Wallet intent in a client-owned carrier. */
export const walletIntentCarrierForClient = (
  clientId: WalletClientId,
  portableRoute: string,
): WalletIntentCarrier =>
  M.value(clientId).pipe(
    M.withReturnType<WalletIntentCarrier>(),
    M.when('ReactWeb', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'Active',
        carrier: `<react-wallet-origin>${portableRoute}`,
        limitation:
          'Opening the carrier loads the wallet and previews the transfer without submitting it.',
      }),
    ),
    M.when('FoldkitView', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'Active',
        carrier: `<foldkit-wallet-origin>${portableRoute}`,
        limitation:
          'Opening the carrier loads the wallet and previews the transfer without submitting it.',
      }),
    ),
    M.when('RawCli', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'HostIntakePending',
        carrier: `pnpm --filter wallet-cli-example wallet open --intent-uri '${portableRoute}'`,
        limitation:
          'The proposed command is not implemented. Existing send flags remain the executable CLI surface.',
      }),
    ),
    M.when('EffectTerminal', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'HostIntakePending',
        carrier: `pnpm --filter wallet-terminal-example terminal -- '${portableRoute}'`,
        limitation:
          'The terminal currently accepts Program state and replay routes, not domain intents.',
      }),
    ),
    M.when('OpenTui', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'HostIntakePending',
        carrier: `pnpm --filter wallet-tui-example dev -- '${portableRoute}'`,
        limitation:
          'The TUI currently accepts Program state and replay routes, not domain intents.',
      }),
    ),
    M.when('ExpoWeb', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'Active',
        carrier: `<expo-web-origin>${portableRoute}`,
        limitation:
          'Opening the carrier selects Wallet, loads it, and previews the transfer without submitting it.',
      }),
    ),
    M.whenOr('ExpoIos', 'ExpoAndroid', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'Active',
        carrier: `foldkit://showcase${portableRoute}`,
        limitation:
          'Opening the carrier selects Wallet, loads it, and previews the transfer without submitting it.',
      }),
    ),
    M.when('FutureServer', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'Planned',
        carrier: `<wallet-server-origin>${portableRoute}`,
        limitation: 'No server host or execution policy exists.',
      }),
    ),
    M.exhaustive,
  )

const walletClientIds: ReadonlyArray<WalletClientId> = [
  'ReactWeb',
  'FoldkitView',
  'RawCli',
  'EffectTerminal',
  'OpenTui',
  'ExpoWeb',
  'ExpoIos',
  'ExpoAndroid',
  'FutureServer',
]

/** Returns every client carrier for one Wallet intent definition. */
export const walletIntentCarriers = (
  definition: WalletIntentDefinition,
): ReadonlyArray<WalletIntentCarrier> =>
  Array.map(walletClientIds, clientId =>
    walletIntentCarrierForClient(clientId, definition.portableRoute),
  )

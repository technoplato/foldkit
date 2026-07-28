import { Array, Effect, Match as M, Schema as S } from 'effect'
import {
  type AtomicUnits,
  SendAssetIntent,
  SendNetworkSelection,
  WalletIntent,
  type WalletNetworkMode,
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

const bitcoinRegtestDestination = 'bcrt1q2n0r7w3x8k9m4p6s5t2v7y9z3c8d4f6g0h2j5k'
const bitcoinTestnetDestination = 'tb1q2n0r7w3x8k9m4p6s5t2v7y9z3c8d4f6g0h2j5k'
const ethereumDestination = '0xF0135cBe737572885131c6831B1E061e679E7933'
const solanaDestination = '7XSg97qfSE6n2J1aVfxyTLZgcV7R4sr1kPnCVTLMriYJ'
const suiDestination =
  '0x1111111111111111111111111111111111111111111111111111111111111111'

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

const implementedCapability = (network: string): WalletIntentCapability =>
  WalletIntentCapability.make({
    support: 'Implemented',
    network,
    reason:
      'The deterministic adapter validates, previews, signs, submits, and observes this native-asset transfer.',
  })

const sendIntent = (
  networkMode: WalletNetworkMode,
  chainId: string,
  networkId: string,
  accountId: string,
  assetId: string,
  atomicUnits: AtomicUnits,
  destinationAddress: string,
): WalletIntent =>
  SendAssetIntent.make({
    source: SendNetworkSelection.make({
      networkMode,
      chainId,
      networkId,
      accountId,
      assetId,
    }),
    atomicUnits,
    destinationAddress,
  })

/** Native-asset intent examples for every chain in both network modes. */
export const walletIntentDefinitions: ReadonlyArray<WalletIntentDefinition> = [
  makeIntentDefinition(
    'btc-devnet',
    'BTC | Devnet',
    'Ten thousand satoshis on Bitcoin Regtest.',
    sendIntent(
      'Devnet',
      'bitcoin',
      'bitcoin:regtest',
      'simulated-bitcoin-regtest-account',
      'bitcoin:regtest:btc',
      '10000',
      bitcoinRegtestDestination,
    ),
    implementedCapability('Bitcoin Regtest'),
  ),
  makeIntentDefinition(
    'btc-testnet',
    'BTC | Testnet',
    'Ten thousand satoshis on Bitcoin Testnet.',
    sendIntent(
      'Testnet',
      'bitcoin',
      'bitcoin:testnet',
      'simulated-bitcoin-testnet-account',
      'bitcoin:testnet:btc',
      '10000',
      bitcoinTestnetDestination,
    ),
    implementedCapability('Bitcoin Testnet'),
  ),
  makeIntentDefinition(
    'eth-devnet',
    'ETH | Devnet',
    'A small ETH transfer on Ethereum Localnet.',
    sendIntent(
      'Devnet',
      'ethereum',
      'ethereum:localnet',
      'simulated-ethereum-localnet-account',
      'ethereum:localnet:eth',
      '10000000000000',
      ethereumDestination,
    ),
    implementedCapability('Ethereum Localnet'),
  ),
  makeIntentDefinition(
    'eth-testnet',
    'ETH | Testnet',
    'A small ETH transfer on Ethereum Sepolia.',
    sendIntent(
      'Testnet',
      'ethereum',
      'ethereum:sepolia',
      'simulated-ethereum-account',
      'ethereum:sepolia:eth',
      '10000000000000',
      ethereumDestination,
    ),
    implementedCapability('Ethereum Sepolia'),
  ),
  makeIntentDefinition(
    'sol-devnet',
    'SOL | Devnet',
    'One milli-SOL on Solana Devnet.',
    sendIntent(
      'Devnet',
      'solana',
      'solana:devnet',
      'simulated-solana-account',
      'solana:devnet:sol',
      '1000000',
      solanaDestination,
    ),
    implementedCapability('Solana Devnet'),
  ),
  makeIntentDefinition(
    'sol-testnet',
    'SOL | Testnet',
    'One milli-SOL on Solana Testnet.',
    sendIntent(
      'Testnet',
      'solana',
      'solana:testnet',
      'simulated-solana-testnet-account',
      'solana:testnet:sol',
      '1000000',
      solanaDestination,
    ),
    implementedCapability('Solana Testnet'),
  ),
  makeIntentDefinition(
    'sui-devnet',
    'SUI | Devnet',
    'One milli-SUI on Sui Devnet.',
    sendIntent(
      'Devnet',
      'sui',
      'sui:devnet',
      'simulated-sui-devnet-account',
      'sui:devnet:sui',
      '1000000',
      suiDestination,
    ),
    implementedCapability('Sui Devnet'),
  ),
  makeIntentDefinition(
    'sui-testnet',
    'SUI | Testnet',
    'One milli-SUI on Sui Testnet.',
    sendIntent(
      'Testnet',
      'sui',
      'sui:testnet',
      'simulated-sui-testnet-account',
      'sui:testnet:sui',
      '1000000',
      suiDestination,
    ),
    implementedCapability('Sui Testnet'),
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
        support: 'Active',
        carrier: `pnpm demo:wallet send --uri '${portableRoute}'`,
        limitation:
          'The CLI submits the preview through deterministic resources, observes the transaction, and prints every intent property.',
      }),
    ),
    M.when('EffectTerminal', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'Active',
        carrier: `pnpm --filter wallet-terminal-example terminal -- '${portableRoute}'`,
        limitation:
          'The terminal starts from the intent preview. Submission remains a separate native input action.',
      }),
    ),
    M.when('OpenTui', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'Active',
        carrier: `pnpm --filter wallet-tui-example dev -- '${portableRoute}'`,
        limitation:
          'The TUI starts from the intent preview. Submission remains a separate native interaction.',
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

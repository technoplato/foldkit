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

/** The strongest evidence for one Client's Wallet intent intake. */
export const WalletIntentCarrierEvidence = S.Literals([
  'FocusedTest',
  'SourceInspection',
  'NoEvidence',
])
/** The strongest evidence for one Client's Wallet intent intake. */
export type WalletIntentCarrierEvidence =
  typeof WalletIntentCarrierEvidence.Type

/** Execution support represented by one normalized Wallet intent example. */
export const WalletIntentSupport = S.Literals(['Implemented', 'Unsupported'])
/** Execution support represented by one normalized Wallet intent example. */
export type WalletIntentSupport = typeof WalletIntentSupport.Type

/** Evidence for execution against the named external blockchain network. */
export const WalletIntentNetworkEvidence = S.Literals([
  'Verified',
  'Unverified',
  'Unsupported',
])
/** Evidence for execution against the named external blockchain network. */
export type WalletIntentNetworkEvidence =
  typeof WalletIntentNetworkEvidence.Type

/** Network capability metadata for one normalized Wallet intent example. */
export const WalletIntentCapability = S.Struct({
  support: WalletIntentSupport,
  networkId: S.String,
  network: S.String,
  simulationEvidence: S.Literal('FocusedTest'),
  actualNetworkEvidence: WalletIntentNetworkEvidence,
  evidence: S.Array(S.String),
  reason: S.String,
  limitation: S.String,
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
  evidenceLevel: WalletIntentCarrierEvidence,
  evidence: S.Array(S.String),
  limitation: S.String,
})
/** One host carrier for a portable Wallet intent. */
export type WalletIntentCarrier = typeof WalletIntentCarrier.Type

const bitcoinRegtestDestination = 'bcrt1q2n0r7w3x8k9m4p6s5t2v7y9z3c8d4f6g0h2j5k'
const bitcoinTestnetDestination = 'tb1q2n0r7w3x8k9m4p6s5t2v7y9z3c8d4f6g0h2j5k'
const bitcoinMainnetDestination = 'bc1q2n0r7w3x8k9m4p6s5t2v7y9z3c8d4f6g0h2j5k'
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

const implementedCapability = (
  networkId: string,
  network: string,
  networkMode: WalletNetworkMode,
): WalletIntentCapability =>
  WalletIntentCapability.make({
    support: 'Implemented',
    networkId,
    network,
    simulationEvidence: 'FocusedTest',
    actualNetworkEvidence: 'Unverified',
    evidence: [
      'examples/wallet/simulated-client/src/simulatedWallet.test.ts',
      'examples/wallet/tui/src/host.test.ts',
      'examples/wallet/terminal/src/host.test.ts',
    ],
    reason:
      'The deterministic adapter validates, previews, signs, submits, observes, and paginates this native-asset transfer.',
    limitation:
      networkMode === 'Live'
        ? 'Simulation is verified. No real Mainnet transaction was authorized, broadcast, or observed, so actual-network execution remains unverified.'
        : 'Simulation is verified. A simulated result is not proof of the configured live RPC, faucet, or public-network transaction path.',
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

/** Native-asset intent examples for every chain and Wallet network mode. */
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
    implementedCapability('bitcoin:regtest', 'Bitcoin Regtest', 'Devnet'),
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
    implementedCapability('bitcoin:testnet', 'Bitcoin Testnet', 'Testnet'),
  ),
  makeIntentDefinition(
    'btc-live',
    'BTC | Live',
    'Ten thousand satoshis on Bitcoin Mainnet.',
    sendIntent(
      'Live',
      'bitcoin',
      'bitcoin:mainnet',
      'simulated-bitcoin-mainnet-account',
      'bitcoin:mainnet:btc',
      '10000',
      bitcoinMainnetDestination,
    ),
    implementedCapability('bitcoin:mainnet', 'Bitcoin Mainnet', 'Live'),
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
    implementedCapability('ethereum:localnet', 'Ethereum Localnet', 'Devnet'),
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
    implementedCapability('ethereum:sepolia', 'Ethereum Sepolia', 'Testnet'),
  ),
  makeIntentDefinition(
    'eth-live',
    'ETH | Live',
    'A small ETH transfer on Ethereum Mainnet.',
    sendIntent(
      'Live',
      'ethereum',
      'ethereum:mainnet',
      'simulated-ethereum-mainnet-account',
      'ethereum:mainnet:eth',
      '10000000000000',
      ethereumDestination,
    ),
    implementedCapability('ethereum:mainnet', 'Ethereum Mainnet', 'Live'),
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
    implementedCapability('solana:devnet', 'Solana Devnet', 'Devnet'),
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
    implementedCapability('solana:testnet', 'Solana Testnet', 'Testnet'),
  ),
  makeIntentDefinition(
    'sol-live',
    'SOL | Live',
    'One milli-SOL on Solana Mainnet Beta.',
    sendIntent(
      'Live',
      'solana',
      'solana:mainnet-beta',
      'simulated-solana-mainnet-account',
      'solana:mainnet-beta:sol',
      '1000000',
      solanaDestination,
    ),
    implementedCapability('solana:mainnet-beta', 'Solana Mainnet Beta', 'Live'),
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
    implementedCapability('sui:devnet', 'Sui Devnet', 'Devnet'),
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
    implementedCapability('sui:testnet', 'Sui Testnet', 'Testnet'),
  ),
  makeIntentDefinition(
    'sui-live',
    'SUI | Live',
    'One milli-SUI on Sui Mainnet.',
    sendIntent(
      'Live',
      'sui',
      'sui:mainnet',
      'simulated-sui-mainnet-account',
      'sui:mainnet:sui',
      '1000000',
      suiDestination,
    ),
    implementedCapability('sui:mainnet', 'Sui Mainnet', 'Live'),
  ),
]

const intentCarrier = (
  clientId: WalletClientId,
  support: WalletIntentClientSupport,
  carrier: string,
  evidenceLevel: WalletIntentCarrierEvidence,
  evidence: ReadonlyArray<string>,
  limitation: string,
): WalletIntentCarrier =>
  WalletIntentCarrier.make({
    clientId,
    support,
    carrier,
    evidenceLevel,
    evidence,
    limitation,
  })

/** Wraps one portable Wallet intent in a client-owned carrier. */
export const walletIntentCarrierForClient = (
  clientId: WalletClientId,
  portableRoute: string,
): WalletIntentCarrier =>
  M.value(clientId).pipe(
    M.withReturnType<WalletIntentCarrier>(),
    M.when('ReactWeb', () =>
      intentCarrier(
        clientId,
        'Active',
        `<react-wallet-origin>${portableRoute}`,
        'FocusedTest',
        [
          'examples/wallet/react-bindings/src/walletRoute.ts',
          'examples/wallet/react-bindings/src/wallet.test.tsx',
        ],
        'Opening the carrier loads the wallet and previews the transfer without submitting it.',
      ),
    ),
    M.when('FoldkitView', () =>
      intentCarrier(
        clientId,
        'Active',
        `<foldkit-wallet-origin>${portableRoute}`,
        'FocusedTest',
        [
          'examples/wallet/foldkit/src/route.ts',
          'examples/wallet/foldkit/src/route.test.ts',
        ],
        'Opening the carrier loads the wallet and previews the transfer without submitting it.',
      ),
    ),
    M.when('RawCli', () =>
      intentCarrier(
        clientId,
        'Active',
        `pnpm demo:wallet send --uri '${portableRoute}'`,
        'FocusedTest',
        [
          'examples/wallet/cli/src/host.ts',
          'examples/wallet/cli/src/host.test.ts',
        ],
        'The CLI submits the preview through deterministic resources, observes the transaction, and prints every intent property.',
      ),
    ),
    M.when('EffectTerminal', () =>
      intentCarrier(
        clientId,
        'Active',
        `pnpm --filter wallet-terminal-example terminal -- '${portableRoute}'`,
        'SourceInspection',
        [
          'examples/wallet/terminal/src/entry.ts',
          'examples/wallet/terminal/src/host.ts',
        ],
        'The terminal starts from the intent preview. Submission remains a separate native input action.',
      ),
    ),
    M.when('OpenTui', () =>
      intentCarrier(
        clientId,
        'Active',
        `pnpm --filter wallet-tui-example dev -- '${portableRoute}'`,
        'SourceInspection',
        [
          'examples/wallet/tui/src/entry.tsx',
          'examples/wallet/tui/src/host.tsx',
        ],
        'The TUI starts from the intent preview. Submission remains a separate native interaction.',
      ),
    ),
    M.when('ExpoWeb', () =>
      intentCarrier(
        clientId,
        'Active',
        `<expo-web-origin>${portableRoute}`,
        'FocusedTest',
        [
          'examples/react-native-showcase/src/App.tsx',
          'examples/react-native-showcase/src/wallet/walletProgram.test.ts',
        ],
        'Opening the carrier selects Wallet, loads it, and previews the transfer without submitting it.',
      ),
    ),
    M.whenOr('ExpoIos', 'ExpoAndroid', () =>
      intentCarrier(
        clientId,
        'Active',
        `foldkit://showcase${portableRoute}`,
        'SourceInspection',
        ['examples/react-native-showcase/src/App.tsx'],
        'Source wiring is present, but no physical iOS or Android intent intake is claimed.',
      ),
    ),
    M.when('FutureServer', () =>
      intentCarrier(
        clientId,
        'Planned',
        `<wallet-server-origin>${portableRoute}`,
        'NoEvidence',
        [],
        'No server host, Processor, carrier endpoint, or execution policy exists.',
      ),
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

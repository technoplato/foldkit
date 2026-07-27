import { Array, Effect, Match as M, Schema as S } from 'effect'
import {
  SendMoneyIntent,
  WalletIntent,
  WalletIntentCapability,
  capabilityForWalletIntent,
  walletIntentRouter,
} from 'wallet-core-example'

import { WalletClientId } from './wallet.js'

/** Host intake support for the shared Wallet intent codec. */
export const WalletIntentClientSupport = S.Literals([
  'HostIntakePending',
  'Planned',
])
/** Host intake support for the shared Wallet intent codec. */
export type WalletIntentClientSupport = typeof WalletIntentClientSupport.Type

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
  intent: SendMoneyIntent,
): WalletIntentDefinition =>
  WalletIntentDefinition.make({
    id,
    title,
    description,
    intent,
    portableRoute: Effect.runSync(walletIntentRouter.print(intent)),
    capability: capabilityForWalletIntent(intent),
  })

/** ETH, SOL, and USD intent examples over every requested deployment mode. */
export const walletIntentDefinitions: ReadonlyArray<WalletIntentDefinition> = [
  makeIntentDefinition(
    'eth-devnet',
    'ETH | Devnet',
    'Typed but invalid because Ethereum has no Devnet Layer.',
    SendMoneyIntent.make({
      asset: 'Eth',
      mode: 'Devnet',
      rail: 'Ethereum',
      atomicUnits: '1000000000000000',
      destinationAddress: ethereumDestination,
    }),
  ),
  makeIntentDefinition(
    'eth-testnet',
    'ETH | Testnet',
    'One milli-ETH on Ethereum Sepolia.',
    SendMoneyIntent.make({
      asset: 'Eth',
      mode: 'Testnet',
      rail: 'Ethereum',
      atomicUnits: '1000000000000000',
      destinationAddress: ethereumDestination,
    }),
  ),
  makeIntentDefinition(
    'eth-live',
    'ETH | Live',
    'Canonical mainnet intent with deliberately unavailable execution.',
    SendMoneyIntent.make({
      asset: 'Eth',
      mode: 'Live',
      rail: 'Ethereum',
      atomicUnits: '1000000000000000',
      destinationAddress: ethereumDestination,
    }),
  ),
  makeIntentDefinition(
    'sol-devnet',
    'SOL | Devnet',
    'One milli-SOL on Solana Devnet.',
    SendMoneyIntent.make({
      asset: 'Sol',
      mode: 'Devnet',
      rail: 'Solana',
      atomicUnits: '1000000',
      destinationAddress: solanaDestination,
    }),
  ),
  makeIntentDefinition(
    'sol-testnet',
    'SOL | Testnet',
    'The network is typed, but the current Layer rejects execution.',
    SendMoneyIntent.make({
      asset: 'Sol',
      mode: 'Testnet',
      rail: 'Solana',
      atomicUnits: '1000000',
      destinationAddress: solanaDestination,
    }),
  ),
  makeIntentDefinition(
    'sol-live',
    'SOL | Live',
    'Canonical mainnet intent with deliberately unavailable execution.',
    SendMoneyIntent.make({
      asset: 'Sol',
      mode: 'Live',
      rail: 'Solana',
      atomicUnits: '1000000',
      destinationAddress: solanaDestination,
    }),
  ),
  makeIntentDefinition(
    'usd-devnet',
    'USD | Devnet',
    'One USD represented by one million atomic USDC units on Solana Devnet.',
    SendMoneyIntent.make({
      asset: 'Usd',
      mode: 'Devnet',
      rail: 'Solana',
      atomicUnits: '1000000',
      destinationAddress: solanaDestination,
    }),
  ),
  makeIntentDefinition(
    'usd-testnet',
    'USD | Testnet',
    'One USD represented by one million atomic USDC units on Sepolia.',
    SendMoneyIntent.make({
      asset: 'Usd',
      mode: 'Testnet',
      rail: 'Ethereum',
      atomicUnits: '1000000',
      destinationAddress: ethereumDestination,
    }),
  ),
  makeIntentDefinition(
    'usd-live',
    'USD | Live',
    'Canonical USDC intent with deliberately unavailable mainnet execution.',
    SendMoneyIntent.make({
      asset: 'Usd',
      mode: 'Live',
      rail: 'Ethereum',
      atomicUnits: '1000000',
      destinationAddress: ethereumDestination,
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
        support: 'HostIntakePending',
        carrier: `<react-wallet-origin>${portableRoute}`,
        limitation:
          'The shared React binding needs a startup-intent input before this carrier can compose a transfer.',
      }),
    ),
    M.when('FoldkitView', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'HostIntakePending',
        carrier: `<foldkit-wallet-origin>${portableRoute}`,
        limitation:
          'The Foldkit application needs a startup-intent input before this carrier can compose a transfer.',
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
        support: 'HostIntakePending',
        carrier: `<expo-web-origin>${portableRoute}`,
        limitation:
          'The Showcase route graph needs a Wallet intent destination and startup input.',
      }),
    ),
    M.whenOr('ExpoIos', 'ExpoAndroid', () =>
      WalletIntentCarrier.make({
        clientId,
        support: 'HostIntakePending',
        carrier: `foldkit://showcase${portableRoute}`,
        limitation:
          'The native route graph needs a Wallet intent destination and startup input.',
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

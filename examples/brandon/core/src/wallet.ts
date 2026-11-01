import { Array, Match as M, Option } from 'effect'
import { NetworkDescriptor, type NetworkId } from 'wallet-core-example'
import {
  EthereumLiveNetwork,
  type LiveWalletNetwork,
  SolanaLiveNetwork,
  liveWalletNetworkForId,
} from 'wallet-live-client-example'

import { WatchedNetworkId } from './page.js'

// WALLET

/**
 * The four networks Brandon dot's wallet offers, in the order its pickers
 * list them. Devnet holds Solana Devnet and Ethereum Sepolia; Mainnet
 * holds both mainnets.
 */
export const brandonWalletNetworkIds: ReadonlyArray<NetworkId> =
  WatchedNetworkId.literals

const inDevnetMode = (configuration: LiveWalletNetwork): LiveWalletNetwork =>
  M.value(configuration).pipe(
    M.withReturnType<LiveWalletNetwork>(),
    M.tag('EthereumLiveNetwork', ethereum =>
      EthereumLiveNetwork.make({
        ...ethereum,
        network: NetworkDescriptor.make({
          ...ethereum.network,
          environment: 'Development',
        }),
      }),
    ),
    M.orElse(() => configuration),
  )

const browserSolanaMainnetRpc = 'solana-rpc.publicnode.com'

// NOTE: api.mainnet-beta.solana.com answers 403 to any request with an
// Origin header, and a browser always sends one, so the page reads Solana
// Mainnet through publicnode, which answers it. The mini's watcher has no
// Origin and keeps the Foundation's endpoint from the catalog.
const throughBrowserRpc = (
  configuration: LiveWalletNetwork,
): LiveWalletNetwork =>
  M.value(configuration).pipe(
    M.withReturnType<LiveWalletNetwork>(),
    M.tag('SolanaLiveNetwork', solana =>
      SolanaLiveNetwork.make({
        ...solana,
        httpRpcUrl: `https://${browserSolanaMainnetRpc}`,
        webSocketRpcUrl: `wss://${browserSolanaMainnetRpc}`,
      }),
    ),
    M.orElse(() => configuration),
  )

const forBrandonDot = (
  networkId: NetworkId,
  configuration: LiveWalletNetwork,
): LiveWalletNetwork =>
  M.value(networkId).pipe(
    M.withReturnType<LiveWalletNetwork>(),
    M.when('ethereum:sepolia', () => inDevnetMode(configuration)),
    M.when('solana:mainnet-beta', () => throughBrowserRpc(configuration)),
    M.orElse(() => configuration),
  )

/**
 * Brandon dot's networks from the wallet's own catalog. The catalog files
 * Sepolia under Testnet; here it sits in Devnet beside Solana Devnet, so
 * the page has exactly two modes, test money and real money. Solana
 * Mainnet is read through an RPC that answers a browser.
 */
export const brandonWalletNetworks: ReadonlyArray<LiveWalletNetwork> =
  Array.map(brandonWalletNetworkIds, networkId =>
    forBrandonDot(
      networkId,
      Option.getOrThrow(liveWalletNetworkForId(networkId)),
    ),
  )

const urlsOf = (configuration: LiveWalletNetwork): ReadonlyArray<string> =>
  M.value(configuration).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      BitcoinLiveNetwork: ({ apiUrl, webSocketUrl }) => [apiUrl, webSocketUrl],
      EthereumLiveNetwork: ({
        httpRpcUrl,
        webSocketRpcUrl,
        maybeHistoryApiUrl,
      }) => [
        httpRpcUrl,
        webSocketRpcUrl,
        ...Option.toArray(maybeHistoryApiUrl),
      ],
      SolanaLiveNetwork: ({ httpRpcUrl, webSocketRpcUrl }) => [
        httpRpcUrl,
        webSocketRpcUrl,
      ],
      SuiLiveNetwork: ({ grpcUrl, graphQlUrl }) => [grpcUrl, graphQlUrl],
    }),
  )

/**
 * Every origin the wallet's chain adapters reach, for the page's content
 * security policy: `https://api.devnet.solana.com`, then its `wss://`
 * twin, and so on for each network.
 */
export const brandonWalletConnectOrigins: ReadonlyArray<string> = Array.dedupe(
  Array.flatMap(brandonWalletNetworks, configuration =>
    Array.map(urlsOf(configuration), url => new URL(url).origin),
  ),
)

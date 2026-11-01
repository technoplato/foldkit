import { Array, Match as M, Option } from 'effect'
import { NetworkDescriptor, type NetworkId } from 'wallet-core-example'
import {
  EthereumLiveNetwork,
  type LiveWalletNetwork,
  liveWalletNetworkForId,
} from 'wallet-live-client-example'

// WALLET

/**
 * The four networks Brandon dot's wallet offers, in the order its pickers
 * list them. Devnet holds Solana Devnet and Ethereum Sepolia; Mainnet
 * holds both mainnets.
 */
export const brandonWalletNetworkIds: ReadonlyArray<NetworkId> = [
  'solana:devnet',
  'ethereum:sepolia',
  'solana:mainnet-beta',
  'ethereum:mainnet',
]

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

/**
 * Brandon dot's networks from the wallet's own catalog. The catalog files
 * Sepolia under Testnet; here it sits in Devnet beside Solana Devnet, so
 * the page has exactly two modes, test money and real money.
 */
export const brandonWalletNetworks: ReadonlyArray<LiveWalletNetwork> =
  Array.map(brandonWalletNetworkIds, networkId => {
    const configuration = Option.getOrThrow(liveWalletNetworkForId(networkId))
    return networkId === 'ethereum:sepolia'
      ? inDevnetMode(configuration)
      : configuration
  })

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

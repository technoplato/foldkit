import { Array, Option, Schema as S } from 'effect'
import {
  AdapterTestFundingMethod,
  AssetDescriptor,
  ChainDescriptor,
  ExternalTestFundingMethod,
  NativeAsset,
  NetworkDescriptor,
  type NetworkId,
  type TestFundingMethod,
  UnavailableTestFundingMethod,
  WalletCapability,
} from 'wallet-core-example'

const transferableCapabilities: ReadonlyArray<typeof WalletCapability.Type> = [
  'Transfer',
  'TransactionHistory',
  'TransactionObservation',
  'ChallengeSignature',
]

const testFundableCapabilities: ReadonlyArray<typeof WalletCapability.Type> = [
  'Transfer',
  'TestFunding',
  'TransactionHistory',
  'TransactionObservation',
  'ChallengeSignature',
]

const localFundableCapabilities: ReadonlyArray<typeof WalletCapability.Type> = [
  'Transfer',
  'TestFunding',
  'TransactionHistory',
  'TransactionObservation',
  'ChallengeSignature',
]

const externalFundableCapabilities: ReadonlyArray<
  typeof WalletCapability.Type
> = [
  'Transfer',
  'ExternalTestFunding',
  'TransactionHistory',
  'TransactionObservation',
  'ChallengeSignature',
]

/** Bitcoin network parameters consumed only by the Bitcoin adapter. */
export const BitcoinLiveNetwork = S.TaggedStruct('BitcoinLiveNetwork', {
  chain: ChainDescriptor,
  network: NetworkDescriptor,
  asset: AssetDescriptor,
  apiUrl: S.String,
  webSocketUrl: S.String,
  explorerTransactionBaseUrl: S.String,
  bech32: S.String,
  pubKeyHash: S.Number,
  scriptHash: S.Number,
  wif: S.Number,
})
/** Bitcoin network parameters consumed only by the Bitcoin adapter. */
export type BitcoinLiveNetwork = typeof BitcoinLiveNetwork.Type

/** Ethereum network parameters consumed only by the Ethereum adapter. */
export const EthereumLiveNetwork = S.TaggedStruct('EthereumLiveNetwork', {
  chain: ChainDescriptor,
  network: NetworkDescriptor,
  asset: AssetDescriptor,
  numericChainId: S.Number,
  httpRpcUrl: S.String,
  webSocketRpcUrl: S.String,
  maybeHistoryApiUrl: S.OptionFromNullishOr(S.String, {
    onNoneEncoding: null,
  }),
  maybeExplorerTransactionBaseUrl: S.OptionFromNullishOr(S.String, {
    onNoneEncoding: null,
  }),
})
/** Ethereum network parameters consumed only by the Ethereum adapter. */
export type EthereumLiveNetwork = typeof EthereumLiveNetwork.Type

/** Solana cluster parameters consumed only by the Solana adapter. */
export const SolanaLiveNetwork = S.TaggedStruct('SolanaLiveNetwork', {
  chain: ChainDescriptor,
  network: NetworkDescriptor,
  asset: AssetDescriptor,
  cluster: S.Literals(['Devnet', 'Testnet', 'MainnetBeta']),
  httpRpcUrl: S.String,
  webSocketRpcUrl: S.String,
  explorerClusterQuery: S.String,
})
/** Solana cluster parameters consumed only by the Solana adapter. */
export type SolanaLiveNetwork = typeof SolanaLiveNetwork.Type

/** Sui network parameters consumed only by the Sui adapter. */
export const SuiLiveNetwork = S.TaggedStruct('SuiLiveNetwork', {
  chain: ChainDescriptor,
  network: NetworkDescriptor,
  asset: AssetDescriptor,
  suiNetwork: S.Literals(['Devnet', 'Testnet', 'Mainnet']),
  grpcUrl: S.String,
  graphQlUrl: S.String,
  maybeFaucetUrl: S.OptionFromNullishOr(S.String, {
    onNoneEncoding: null,
  }),
  explorerTransactionBaseUrl: S.String,
})
/** Sui network parameters consumed only by the Sui adapter. */
export type SuiLiveNetwork = typeof SuiLiveNetwork.Type

/** One adapter-owned network configuration projected into Wallet core. */
export const LiveWalletNetwork = S.Union([
  BitcoinLiveNetwork,
  EthereumLiveNetwork,
  SolanaLiveNetwork,
  SuiLiveNetwork,
])
/** One adapter-owned network configuration projected into Wallet core. */
export type LiveWalletNetwork = typeof LiveWalletNetwork.Type

const bitcoin = ChainDescriptor.make({
  chainId: 'bitcoin',
  displayName: 'Bitcoin',
})

const ethereum = ChainDescriptor.make({
  chainId: 'ethereum',
  displayName: 'Ethereum',
})

const solana = ChainDescriptor.make({
  chainId: 'solana',
  displayName: 'Solana',
})

const sui = ChainDescriptor.make({
  chainId: 'sui',
  displayName: 'Sui',
})

const bitcoinNetwork = (
  networkId: string,
  displayName: string,
  environment: 'Development' | 'Testnet' | 'Mainnet',
  apiUrl: string,
  webSocketUrl: string,
  explorerTransactionBaseUrl: string,
  testFundingMethod: TestFundingMethod,
  bech32: string,
  pubKeyHash: number,
  scriptHash: number,
  wif: number,
): BitcoinLiveNetwork => {
  const network = NetworkDescriptor.make({
    networkId,
    chainId: bitcoin.chainId,
    displayName,
    environment,
    capabilities:
      testFundingMethod._tag === 'ExternalTestFundingMethod'
        ? externalFundableCapabilities
        : transferableCapabilities,
    testFundingMethod,
  })
  return BitcoinLiveNetwork.make({
    chain: bitcoin,
    network,
    asset: AssetDescriptor.make({
      assetId: `${networkId}:btc`,
      networkId,
      displayName: 'Bitcoin',
      symbol: 'BTC',
      decimalPlaces: 8,
      kind: NativeAsset.make({}),
    }),
    apiUrl,
    webSocketUrl,
    explorerTransactionBaseUrl,
    bech32,
    pubKeyHash,
    scriptHash,
    wif,
  })
}

const ethereumNetwork = (
  networkId: string,
  displayName: string,
  environment: 'Local' | 'Testnet' | 'Mainnet',
  capabilities: ReadonlyArray<typeof WalletCapability.Type>,
  numericChainId: number,
  httpRpcUrl: string,
  webSocketRpcUrl: string,
  maybeHistoryApiUrl: Option.Option<string>,
  maybeExplorerTransactionBaseUrl: Option.Option<string>,
  testFundingMethod: TestFundingMethod,
): EthereumLiveNetwork => {
  const network = NetworkDescriptor.make({
    networkId,
    chainId: ethereum.chainId,
    displayName,
    environment,
    capabilities,
    testFundingMethod,
  })
  return EthereumLiveNetwork.make({
    chain: ethereum,
    network,
    asset: AssetDescriptor.make({
      assetId: `${networkId}:eth`,
      networkId,
      displayName: 'Ether',
      symbol: 'ETH',
      decimalPlaces: 18,
      kind: NativeAsset.make({}),
    }),
    numericChainId,
    httpRpcUrl,
    webSocketRpcUrl,
    maybeHistoryApiUrl,
    maybeExplorerTransactionBaseUrl,
  })
}

const solanaNetwork = (
  networkId: string,
  displayName: string,
  environment: 'Development' | 'Testnet' | 'Mainnet',
  capabilities: ReadonlyArray<typeof WalletCapability.Type>,
  cluster: 'Devnet' | 'Testnet' | 'MainnetBeta',
  httpRpcUrl: string,
  webSocketRpcUrl: string,
  explorerClusterQuery: string,
): SolanaLiveNetwork => {
  const testFundingMethod = Array.contains(capabilities, 'TestFunding')
    ? AdapterTestFundingMethod.make({})
    : UnavailableTestFundingMethod.make({})
  const network = NetworkDescriptor.make({
    networkId,
    chainId: solana.chainId,
    displayName,
    environment,
    capabilities,
    testFundingMethod,
  })
  return SolanaLiveNetwork.make({
    chain: solana,
    network,
    asset: AssetDescriptor.make({
      assetId: `${networkId}:sol`,
      networkId,
      displayName: 'Solana',
      symbol: 'SOL',
      decimalPlaces: 9,
      kind: NativeAsset.make({}),
    }),
    cluster,
    httpRpcUrl,
    webSocketRpcUrl,
    explorerClusterQuery,
  })
}

const suiNetwork = (
  networkId: string,
  displayName: string,
  environment: 'Development' | 'Testnet' | 'Mainnet',
  capabilities: ReadonlyArray<typeof WalletCapability.Type>,
  suiNetworkName: 'Devnet' | 'Testnet' | 'Mainnet',
  grpcUrl: string,
  graphQlUrl: string,
  maybeFaucetUrl: Option.Option<string>,
  explorerTransactionBaseUrl: string,
): SuiLiveNetwork => {
  const testFundingMethod = Array.contains(capabilities, 'TestFunding')
    ? AdapterTestFundingMethod.make({})
    : UnavailableTestFundingMethod.make({})
  const network = NetworkDescriptor.make({
    networkId,
    chainId: sui.chainId,
    displayName,
    environment,
    capabilities,
    testFundingMethod,
  })
  return SuiLiveNetwork.make({
    chain: sui,
    network,
    asset: AssetDescriptor.make({
      assetId: `${networkId}:sui`,
      networkId,
      displayName: 'Sui',
      symbol: 'SUI',
      decimalPlaces: 9,
      kind: NativeAsset.make({}),
    }),
    suiNetwork: suiNetworkName,
    grpcUrl,
    graphQlUrl,
    maybeFaucetUrl,
    explorerTransactionBaseUrl,
  })
}

/** Every real network and native cryptocurrency available to Wallet hosts. */
export const liveWalletNetworks: ReadonlyArray<LiveWalletNetwork> = [
  bitcoinNetwork(
    'bitcoin:signet',
    'Bitcoin Signet',
    'Development',
    'https://mempool.space/signet/api',
    'wss://mempool.space/signet/api/v1/ws',
    'https://mempool.space/signet/tx/',
    ExternalTestFundingMethod.make({
      providerName: 'Bitcoin Signet Faucet',
      providerUrl: 'https://bitcoinsignetfaucet.com/',
    }),
    'tb',
    0x6f,
    0xc4,
    0xef,
  ),
  bitcoinNetwork(
    'bitcoin:testnet4',
    'Bitcoin Testnet4',
    'Testnet',
    'https://mempool.space/testnet4/api',
    'wss://mempool.space/testnet4/api/v1/ws',
    'https://mempool.space/testnet4/tx/',
    ExternalTestFundingMethod.make({
      providerName: 'mempool.space Testnet4 Faucet',
      providerUrl: 'https://mempool.space/testnet4/faucet',
    }),
    'tb',
    0x6f,
    0xc4,
    0xef,
  ),
  bitcoinNetwork(
    'bitcoin:mainnet',
    'Bitcoin Mainnet',
    'Mainnet',
    'https://mempool.space/api',
    'wss://mempool.space/api/v1/ws',
    'https://mempool.space/tx/',
    UnavailableTestFundingMethod.make({}),
    'bc',
    0x00,
    0x05,
    0x80,
  ),
  ethereumNetwork(
    'ethereum:anvil',
    'Ethereum Anvil',
    'Local',
    localFundableCapabilities,
    31_337,
    'http://127.0.0.1:8545',
    'ws://127.0.0.1:8545',
    Option.none(),
    Option.none(),
    AdapterTestFundingMethod.make({}),
  ),
  ethereumNetwork(
    'ethereum:sepolia',
    'Ethereum Sepolia',
    'Testnet',
    externalFundableCapabilities,
    11_155_111,
    'https://ethereum-sepolia-rpc.publicnode.com',
    'wss://ethereum-sepolia-rpc.publicnode.com',
    Option.some('https://eth-sepolia.blockscout.com/api/v2'),
    Option.some('https://eth-sepolia.blockscout.com/tx/'),
    ExternalTestFundingMethod.make({
      providerName: 'Google Cloud Web3 Sepolia Faucet',
      providerUrl:
        'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
    }),
  ),
  ethereumNetwork(
    'ethereum:mainnet',
    'Ethereum Mainnet',
    'Mainnet',
    transferableCapabilities,
    1,
    'https://ethereum-rpc.publicnode.com',
    'wss://ethereum-rpc.publicnode.com',
    Option.some('https://eth.blockscout.com/api/v2'),
    Option.some('https://eth.blockscout.com/tx/'),
    UnavailableTestFundingMethod.make({}),
  ),
  solanaNetwork(
    'solana:devnet',
    'Solana Devnet',
    'Development',
    testFundableCapabilities,
    'Devnet',
    'https://api.devnet.solana.com',
    'wss://api.devnet.solana.com',
    '?cluster=devnet',
  ),
  solanaNetwork(
    'solana:testnet',
    'Solana Testnet',
    'Testnet',
    testFundableCapabilities,
    'Testnet',
    'https://api.testnet.solana.com',
    'wss://api.testnet.solana.com',
    '?cluster=testnet',
  ),
  solanaNetwork(
    'solana:mainnet-beta',
    'Solana Mainnet Beta',
    'Mainnet',
    transferableCapabilities,
    'MainnetBeta',
    'https://api.mainnet-beta.solana.com',
    'wss://api.mainnet-beta.solana.com',
    '',
  ),
  suiNetwork(
    'sui:devnet',
    'Sui Devnet',
    'Development',
    testFundableCapabilities,
    'Devnet',
    'https://fullnode.devnet.sui.io:443',
    'https://graphql.devnet.sui.io/graphql',
    Option.some('https://faucet.devnet.sui.io'),
    'https://suiscan.xyz/devnet/tx/',
  ),
  suiNetwork(
    'sui:testnet',
    'Sui Testnet',
    'Testnet',
    testFundableCapabilities,
    'Testnet',
    'https://fullnode.testnet.sui.io:443',
    'https://graphql.testnet.sui.io/graphql',
    Option.some('https://faucet.testnet.sui.io'),
    'https://suiscan.xyz/testnet/tx/',
  ),
  suiNetwork(
    'sui:mainnet',
    'Sui Mainnet',
    'Mainnet',
    transferableCapabilities,
    'Mainnet',
    'https://fullnode.mainnet.sui.io:443',
    'https://graphql.mainnet.sui.io/graphql',
    Option.none(),
    'https://suiscan.xyz/mainnet/tx/',
  ),
]

/** Host-reachable JSON-RPC endpoints for a developer-owned Anvil node. */
export const EthereumAnvilEndpoint = S.Struct({
  httpRpcUrl: S.String,
  webSocketRpcUrl: S.String,
})
/** Host-reachable JSON-RPC endpoints for a developer-owned Anvil node. */
export type EthereumAnvilEndpoint = typeof EthereumAnvilEndpoint.Type

/** Rebinds the Anvil rail without changing any normalized network identity. */
export const liveWalletNetworksWithEthereumAnvilEndpoint = (
  endpoint: EthereumAnvilEndpoint,
): ReadonlyArray<LiveWalletNetwork> =>
  Array.map(liveWalletNetworks, configuration => {
    if (
      configuration._tag === 'EthereumLiveNetwork' &&
      configuration.network.networkId === 'ethereum:anvil'
    ) {
      return EthereumLiveNetwork.make({
        ...configuration,
        httpRpcUrl: endpoint.httpRpcUrl,
        webSocketRpcUrl: endpoint.webSocketRpcUrl,
      })
    } else {
      return configuration
    }
  })

/** The adapter-owned chain catalog projected into Wallet core. */
export const liveWalletChains = [bitcoin, ethereum, solana, sui]

/** The adapter-owned network catalog projected into Wallet core. */
export const liveWalletNetworkDescriptors = Array.map(
  liveWalletNetworks,
  configuration => configuration.network,
)

/** The adapter-owned native cryptocurrency catalog projected into Wallet core. */
export const liveWalletAssetDescriptors = Array.map(
  liveWalletNetworks,
  configuration => configuration.asset,
)

/** Finds one exact live adapter configuration by normalized network id. */
export const liveWalletNetworkForId = (
  networkId: NetworkId,
): Option.Option<LiveWalletNetwork> =>
  Array.findFirst(
    liveWalletNetworks,
    configuration => configuration.network.networkId === networkId,
  )

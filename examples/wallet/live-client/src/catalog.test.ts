import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  TransactionHistoryQuery,
  maximumTransactionHistoryPageSize,
} from 'wallet-core-example'

import {
  EthereumAnvilEndpoint,
  liveWalletAssetDescriptors,
  liveWalletChains,
  liveWalletNetworkDescriptors,
  liveWalletNetworkForId,
  liveWalletNetworks,
  liveWalletNetworksWithEthereumAnvilEndpoint,
} from './catalog.js'
import { makeLiveNetworkAdapter } from './liveWallet.js'

describe('live Wallet catalog', () => {
  it('defines one native asset for every chain and network mode', () => {
    expect(Array.length(liveWalletChains)).toBe(4)
    expect(Array.length(liveWalletNetworks)).toBe(12)
    expect(Array.length(liveWalletNetworkDescriptors)).toBe(12)
    expect(Array.length(liveWalletAssetDescriptors)).toBe(12)

    for (const chain of liveWalletChains) {
      const environments = Array.map(
        Array.filter(
          liveWalletNetworkDescriptors,
          network => network.chainId === chain.chainId,
        ),
        network => network.environment,
      )
      expect(environments).toContain('Mainnet')
      expect(environments).toContain('Testnet')
      expect(
        environments.includes('Development') || environments.includes('Local'),
      ).toBe(true)
    }
  })

  it('never advertises test funding on Mainnet', () => {
    for (const network of liveWalletNetworkDescriptors) {
      if (network.environment === 'Mainnet') {
        expect(network.capabilities).not.toContain('TestFunding')
        expect(network.capabilities).not.toContain('ExternalTestFunding')
        expect(network.testFundingMethod._tag).toBe(
          'UnavailableTestFundingMethod',
        )
      }
    }
  })

  it('distinguishes adapter requests from provider-owned faucet handoffs', () => {
    const adapterNetworkIds = Array.map(
      Array.filter(
        liveWalletNetworkDescriptors,
        network =>
          network.testFundingMethod._tag === 'AdapterTestFundingMethod',
      ),
      network => network.networkId,
    )
    const externalNetworkIds = Array.map(
      Array.filter(
        liveWalletNetworkDescriptors,
        network =>
          network.testFundingMethod._tag === 'ExternalTestFundingMethod',
      ),
      network => network.networkId,
    )

    expect(adapterNetworkIds).toEqual([
      'ethereum:anvil',
      'solana:devnet',
      'solana:testnet',
      'sui:devnet',
      'sui:testnet',
    ])
    expect(externalNetworkIds).toEqual([
      'bitcoin:signet',
      'bitcoin:testnet4',
      'ethereum:sepolia',
    ])
  })

  it('keeps each funding method aligned with its advertised capability', () => {
    for (const network of liveWalletNetworkDescriptors) {
      if (network.testFundingMethod._tag === 'AdapterTestFundingMethod') {
        expect(network.capabilities).toContain('TestFunding')
        expect(network.capabilities).not.toContain('ExternalTestFunding')
      } else if (
        network.testFundingMethod._tag === 'ExternalTestFundingMethod'
      ) {
        expect(network.capabilities).toContain('ExternalTestFunding')
        expect(network.capabilities).not.toContain('TestFunding')
      } else {
        expect(network.capabilities).not.toContain('TestFunding')
        expect(network.capabilities).not.toContain('ExternalTestFunding')
      }
    }
  })

  it('advertises transfer, history, observation, and signing on every rail', () => {
    for (const network of liveWalletNetworkDescriptors) {
      expect(network.capabilities).toContain('Transfer')
      expect(network.capabilities).toContain('TransactionHistory')
      expect(network.capabilities).toContain('TransactionObservation')
      expect(network.capabilities).toContain('ChallengeSignature')
    }
  })

  it('constructs the complete executable adapter contract for all 12 rails', () => {
    for (const configuration of liveWalletNetworks) {
      const adapter = makeLiveNetworkAdapter(configuration)

      expect(adapter.configuration).toBe(configuration)
      expect(adapter.loadBalance).toBeTypeOf('function')
      expect(adapter.receivingInstruction).toBeTypeOf('function')
      expect(adapter.validateTransfer).toBeTypeOf('function')
      expect(adapter.previewTransfer).toBeTypeOf('function')
      expect(adapter.buildTransferPayload).toBeTypeOf('function')
      expect(adapter.submitTransaction).toBeTypeOf('function')
      expect(adapter.loadTransactionHistory).toBeTypeOf('function')
      expect(adapter.observeTransactions).toBeTypeOf('function')
      expect(adapter.requestTestFunding).toBeTypeOf('function')
    }
  })

  it('rejects oversized history pages at the contract boundary for all 12 rails', () => {
    for (const configuration of liveWalletNetworks) {
      expect(() =>
        TransactionHistoryQuery.make({
          accountId: `wallet-1:${configuration.network.networkId}`,
          networkId: configuration.network.networkId,
          maybeCursor: Option.none(),
          limit: maximumTransactionHistoryPageSize + 1,
        }),
      ).toThrow()
    }
  })

  it('rebinds Anvil to host-reachable native endpoints', () => {
    const networks = liveWalletNetworksWithEthereumAnvilEndpoint(
      EthereumAnvilEndpoint.make({
        httpRpcUrl: 'http://192.0.2.1:8545',
        webSocketRpcUrl: 'ws://192.0.2.1:8545',
      }),
    )
    const maybeAnvil = Array.findFirst(
      networks,
      configuration => configuration.network.networkId === 'ethereum:anvil',
    )

    expect(Option.isSome(maybeAnvil)).toBe(true)
    if (
      Option.isSome(maybeAnvil) &&
      maybeAnvil.value._tag === 'EthereumLiveNetwork'
    ) {
      expect(maybeAnvil.value.httpRpcUrl).toBe('http://192.0.2.1:8545')
      expect(maybeAnvil.value.webSocketRpcUrl).toBe('ws://192.0.2.1:8545')
      expect(
        Option.isNone(maybeAnvil.value.maybeExplorerTransactionBaseUrl),
      ).toBe(true)
    }
  })

  it('resolves only exact normalized network identifiers', () => {
    expect(Option.isSome(liveWalletNetworkForId('solana:devnet'))).toBe(true)
    expect(Option.isNone(liveWalletNetworkForId('solana'))).toBe(true)
    expect(Option.isNone(liveWalletNetworkForId('unknown:mainnet'))).toBe(true)
  })
})

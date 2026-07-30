import { Array, Context, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  WalletClient,
  WalletClipboard,
  WalletClipboardError,
  WalletCrypto,
  WalletSigner,
  WalletVault,
  availableSendNetworkSelections,
} from 'wallet-core-example'
import { LiveWalletClient } from 'wallet-live-client-example'
import { makeLocalWalletResources } from 'wallet-local-vault-example'

import { mergeWalletResourceLayers } from './walletResourceGraph'
import { makeWalletResourcesForPlatform } from './walletResources'

describe('Expo Wallet resource selection', () => {
  it('loads all twelve fixture rails through the isolated web resource graph', async () => {
    const resources = makeWalletResourcesForPlatform(
      'web',
      'Fixture',
      undefined,
      undefined,
    )
    const result = await Effect.gen(function* () {
      const client = yield* WalletClient
      const vault = yield* WalletVault
      const wallets = yield* vault.loadWallets
      const portfolio = yield* client.loadPortfolio(wallets)
      return { portfolio, wallets }
    }).pipe(Effect.provide(resources), Effect.runPromise)

    expect(result.portfolio.chains).not.toHaveLength(0)
    expect(result.portfolio.networks).toHaveLength(12)
    expect(result.portfolio.assets).toHaveLength(12)
    expect(result.portfolio.accounts).toHaveLength(12)
    expect(
      Array.map(
        availableSendNetworkSelections(result.portfolio, 'Devnet'),
        selection => selection.networkId,
      ),
    ).toStrictEqual([
      'bitcoin:regtest',
      'ethereum:localnet',
      'solana:devnet',
      'sui:devnet',
    ])
    expect(
      Array.map(
        availableSendNetworkSelections(result.portfolio, 'Testnet'),
        selection => selection.networkId,
      ),
    ).toStrictEqual([
      'bitcoin:testnet',
      'ethereum:sepolia',
      'solana:testnet',
      'sui:testnet',
    ])
    expect(
      Array.map(
        availableSendNetworkSelections(result.portfolio, 'Live'),
        selection => selection.networkId,
      ),
    ).toStrictEqual([
      'bitcoin:mainnet',
      'ethereum:mainnet',
      'solana:mainnet-beta',
      'sui:mainnet',
    ])
    expect(result.wallets).toStrictEqual([])
  })

  it('composes every native Wallet service from complete injected layers', async () => {
    const custody = makeLocalWalletResources(byteCount =>
      new Uint8Array(byteCount).fill(1),
    )
    const clipboard = Layer.succeed(
      WalletClipboard,
      WalletClipboard.of({
        writeText: () =>
          Effect.fail(new WalletClipboardError({ code: 'Denied' })),
      }),
    )
    const context = await Effect.runPromise(
      Effect.scoped(
        Layer.build(
          mergeWalletResourceLayers(LiveWalletClient, custody, clipboard),
        ),
      ),
    )
    expect(Option.isSome(Context.getOption(context, WalletClient))).toBe(true)
    expect(Option.isSome(Context.getOption(context, WalletClipboard))).toBe(
      true,
    )
    expect(Option.isSome(Context.getOption(context, WalletCrypto))).toBe(true)
    expect(Option.isSome(Context.getOption(context, WalletSigner))).toBe(true)
    expect(Option.isSome(Context.getOption(context, WalletVault))).toBe(true)
  })
})

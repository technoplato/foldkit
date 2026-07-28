import { Effect, Layer, Redacted, Schema as S } from 'effect'
import { privateKeyToAccount } from 'viem/accounts'
import {
  BitcoinAddressSet,
  BitcoinWalletAccount,
  EthereumWalletAccount,
  SolanaWalletAccount,
  SuiWalletAccount,
  type WalletCreationRequest,
  WalletProfile,
  WalletVault,
  WalletVaultError,
} from 'wallet-core-example'

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { ed25519 } from '@noble/curves/ed25519'
import { secp256k1 } from '@noble/curves/secp256k1'
import { base58, hex } from '@scure/base'
import * as Bitcoin from '@scure/btc-signer'
import { pubECDSA, pubSchnorr } from '@scure/btc-signer/utils.js'
import { address as solanaAddress } from '@solana/addresses'

/** A host-provided source of cryptographically secure random bytes. */
export type WalletRandomBytes = (byteCount: number) => Uint8Array

type LocalWalletCustody = Readonly<{
  bitcoinPrivateKey: Redacted.Redacted<Uint8Array>
  ethereumPrivateKey: Redacted.Redacted<string>
  solanaPrivateKey: Redacted.Redacted<Uint8Array>
  suiPrivateKey: Redacted.Redacted<string>
}>

const bitcoinRegtest = {
  bech32: 'bcrt',
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
}

const bitcoinTestnet = {
  bech32: 'tb',
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
}

const requiredBitcoinAddress = (maybeAddress: string | undefined): string => {
  if (maybeAddress === undefined) {
    throw new WalletVaultError({ code: 'InvalidKeyMaterial' })
  } else {
    return maybeAddress
  }
}

const secp256k1PrivateKey = (randomBytes: WalletRandomBytes): Uint8Array => {
  const privateKey = randomBytes(32)
  if (secp256k1.utils.isValidPrivateKey(privateKey)) {
    return privateKey
  } else {
    throw new WalletVaultError({ code: 'InvalidKeyMaterial' })
  }
}

const bitcoinAddressSet = (
  privateKey: Uint8Array,
  network: Readonly<{
    bech32: string
    pubKeyHash: number
    scriptHash: number
    wif: number
  }>,
): typeof BitcoinAddressSet.Type =>
  BitcoinAddressSet.make({
    nativeSegwitAddress: requiredBitcoinAddress(
      Bitcoin.p2wpkh(pubECDSA(privateKey), network).address,
    ),
    taprootAddress: requiredBitcoinAddress(
      Bitcoin.p2tr(pubSchnorr(privateKey), undefined, network).address,
    ),
  })

const createWallet = (
  request: WalletCreationRequest,
  randomBytes: WalletRandomBytes,
): Readonly<{ custody: LocalWalletCustody; wallet: WalletProfile }> => {
  const bitcoinPrivateKey = secp256k1PrivateKey(randomBytes)
  const ethereumPrivateKey = secp256k1PrivateKey(randomBytes)
  const ethereumPrivateKeyHex = S.decodeUnknownSync(
    S.TemplateLiteral(['0x', S.String]),
  )(`0x${hex.encode(ethereumPrivateKey)}`)
  const ethereumAccount = privateKeyToAccount(ethereumPrivateKeyHex)
  const solanaPrivateKey = randomBytes(32)
  const solanaPublicKey = ed25519.getPublicKey(solanaPrivateKey)
  const suiPrivateKey = randomBytes(32)
  const suiKeypair = Ed25519Keypair.fromSecretKey(suiPrivateKey)
  const walletId = request.requestId

  return {
    custody: {
      bitcoinPrivateKey: Redacted.make(bitcoinPrivateKey),
      ethereumPrivateKey: Redacted.make(ethereumPrivateKeyHex),
      solanaPrivateKey: Redacted.make(solanaPrivateKey),
      suiPrivateKey: Redacted.make(suiKeypair.getSecretKey()),
    },
    wallet: WalletProfile.make({
      walletId,
      displayName: request.displayName,
      createdAt: Date.now(),
      accounts: {
        bitcoin: BitcoinWalletAccount.make({
          accountId: `${walletId}:bitcoin`,
          devnetAddresses: bitcoinAddressSet(bitcoinPrivateKey, bitcoinRegtest),
          testnetAddresses: bitcoinAddressSet(
            bitcoinPrivateKey,
            bitcoinTestnet,
          ),
          preferredAddressType: 'NativeSegwit',
        }),
        ethereum: EthereumWalletAccount.make({
          accountId: `${walletId}:ethereum`,
          address: ethereumAccount.address,
        }),
        solana: SolanaWalletAccount.make({
          accountId: `${walletId}:solana`,
          address: solanaAddress(base58.encode(solanaPublicKey)),
        }),
        sui: SuiWalletAccount.make({
          accountId: `${walletId}:sui`,
          address: suiKeypair.toSuiAddress(),
        }),
      },
    }),
  }
}

/** Builds an in-memory Wallet vault around a platform entropy source. */
export const makeLocalWalletVault = (
  randomBytes: WalletRandomBytes,
): Layer.Layer<WalletVault> =>
  Layer.effect(
    WalletVault,
    Effect.sync(() => {
      const custodyByWalletId = new Map<string, LocalWalletCustody>()
      const walletByRequestId = new Map<string, WalletProfile>()
      return WalletVault.of({
        createWallet: request =>
          Effect.try({
            try: () => {
              const existingWallet = walletByRequestId.get(request.requestId)
              if (existingWallet !== undefined) {
                return existingWallet
              }
              const created = createWallet(request, randomBytes)
              custodyByWalletId.set(created.wallet.walletId, created.custody)
              walletByRequestId.set(request.requestId, created.wallet)
              return created.wallet
            },
            catch: error =>
              error instanceof WalletVaultError
                ? error
                : new WalletVaultError({ code: 'Unavailable' }),
          }),
      })
    }),
  )

const defaultRandomBytes: WalletRandomBytes = byteCount => {
  const bytes = new Uint8Array(byteCount)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

/** In-memory Wallet vault for browser and Node hosts with Web Crypto. */
export const LocalWalletVault = makeLocalWalletVault(defaultRandomBytes)

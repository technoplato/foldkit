import {
  Array as Array_,
  Effect,
  Layer,
  Order,
  Redacted,
  Schema as S,
} from 'effect'
import { privateKeyToAccount } from 'viem/accounts'
import {
  BitcoinAddressSet,
  BitcoinWalletAccount,
  EthereumWalletAccount,
  SolanaWalletAccount,
  SuiWalletAccount,
  WalletCreationRequest,
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

/** Opaque record persistence supplied by the browser, native, or test host. */
export type WalletVaultStorage = Readonly<{
  loadRecords: Effect.Effect<ReadonlyArray<string>, WalletVaultError>
  saveRecord: (
    walletId: string,
    record: string,
  ) => Effect.Effect<void, WalletVaultError>
}>

type LocalWalletCustody = Readonly<{
  bitcoinPrivateKey: Redacted.Redacted<Uint8Array>
  ethereumPrivateKey: Redacted.Redacted<string>
  solanaPrivateKey: Redacted.Redacted<Uint8Array>
  suiPrivateKey: Redacted.Redacted<string>
}>

const StoredWalletRecord = S.Struct({
  request: WalletCreationRequest,
  createdAt: S.Number,
  bitcoinPrivateKey: S.String,
  ethereumPrivateKey: S.String,
  solanaPrivateKey: S.String,
  suiPrivateKey: S.String,
})
type StoredWalletRecord = typeof StoredWalletRecord.Type
const StoredWalletRecordJson = S.fromJsonString(StoredWalletRecord)

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

const secp256k1PrivateKey = (privateKey: Uint8Array): Uint8Array => {
  if (secp256k1.utils.isValidPrivateKey(privateKey)) {
    return privateKey
  } else {
    throw new WalletVaultError({ code: 'InvalidKeyMaterial' })
  }
}

const randomSecp256k1PrivateKey = (
  randomBytes: WalletRandomBytes,
): Uint8Array => secp256k1PrivateKey(randomBytes(32))

const ed25519PrivateKey = (privateKey: Uint8Array): Uint8Array => {
  if (privateKey.length === 32) {
    return privateKey
  } else {
    throw new WalletVaultError({ code: 'InvalidKeyMaterial' })
  }
}

const decodePrivateKey = (encoded: string): Uint8Array => {
  try {
    return ed25519PrivateKey(hex.decode(encoded))
  } catch {
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

const walletForStoredRecord = (
  record: StoredWalletRecord,
): Readonly<{ custody: LocalWalletCustody; wallet: WalletProfile }> => {
  const bitcoinPrivateKey = secp256k1PrivateKey(
    decodePrivateKey(record.bitcoinPrivateKey),
  )
  const ethereumPrivateKey = secp256k1PrivateKey(
    decodePrivateKey(record.ethereumPrivateKey),
  )
  const ethereumPrivateKeyHex = S.decodeUnknownSync(
    S.TemplateLiteral(['0x', S.String]),
  )(`0x${hex.encode(ethereumPrivateKey)}`)
  const ethereumAccount = privateKeyToAccount(ethereumPrivateKeyHex)
  const solanaPrivateKey = decodePrivateKey(record.solanaPrivateKey)
  const solanaPublicKey = ed25519.getPublicKey(solanaPrivateKey)
  const suiPrivateKey = decodePrivateKey(record.suiPrivateKey)
  const suiKeypair = Ed25519Keypair.fromSecretKey(suiPrivateKey)
  const walletId = record.request.requestId

  return {
    custody: {
      bitcoinPrivateKey: Redacted.make(bitcoinPrivateKey),
      ethereumPrivateKey: Redacted.make(ethereumPrivateKeyHex),
      solanaPrivateKey: Redacted.make(solanaPrivateKey),
      suiPrivateKey: Redacted.make(suiKeypair.getSecretKey()),
    },
    wallet: WalletProfile.make({
      walletId,
      displayName: record.request.displayName,
      createdAt: record.createdAt,
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

const createStoredRecord = (
  request: WalletCreationRequest,
  randomBytes: WalletRandomBytes,
): StoredWalletRecord =>
  StoredWalletRecord.make({
    request,
    createdAt: Date.now(),
    bitcoinPrivateKey: hex.encode(randomSecp256k1PrivateKey(randomBytes)),
    ethereumPrivateKey: hex.encode(randomSecp256k1PrivateKey(randomBytes)),
    solanaPrivateKey: hex.encode(ed25519PrivateKey(randomBytes(32))),
    suiPrivateKey: hex.encode(ed25519PrivateKey(randomBytes(32))),
  })

const decodeStoredRecord = (record: string): StoredWalletRecord => {
  try {
    return S.decodeUnknownSync(StoredWalletRecordJson)(record)
  } catch {
    throw new WalletVaultError({ code: 'InvalidKeyMaterial' })
  }
}

const walletCreatedAtOrder = Order.mapInput(
  Order.Number,
  (wallet: WalletProfile) => wallet.createdAt,
)

/** Builds a persistent Wallet vault around platform entropy and record storage. */
export const makePersistentLocalWalletVault = (
  randomBytes: WalletRandomBytes,
  storage: WalletVaultStorage,
): Layer.Layer<WalletVault> =>
  Layer.effect(
    WalletVault,
    Effect.sync(() => {
      const custodyByWalletId = new Map<string, LocalWalletCustody>()
      const walletByRequestId = new Map<string, WalletProfile>()
      let isLoaded = false

      const loadRecords = Effect.suspend(() => {
        if (isLoaded) {
          return Effect.void
        } else {
          return storage.loadRecords.pipe(
            Effect.flatMap(records =>
              Effect.forEach(records, record =>
                Effect.try({
                  try: () => walletForStoredRecord(decodeStoredRecord(record)),
                  catch: error =>
                    error instanceof WalletVaultError
                      ? error
                      : new WalletVaultError({ code: 'InvalidKeyMaterial' }),
                }),
              ),
            ),
            Effect.flatMap(wallets =>
              Effect.sync(() => {
                for (const created of wallets) {
                  custodyByWalletId.set(
                    created.wallet.walletId,
                    created.custody,
                  )
                  walletByRequestId.set(created.wallet.walletId, created.wallet)
                }
                isLoaded = true
              }),
            ),
          )
        }
      })

      return WalletVault.of({
        loadWallets: loadRecords.pipe(
          Effect.map(() =>
            Array_.sort(
              Array_.fromIterable(walletByRequestId.values()),
              walletCreatedAtOrder,
            ),
          ),
        ),
        createWallet: request =>
          loadRecords.pipe(
            Effect.flatMap(() => {
              const existingWallet = walletByRequestId.get(request.requestId)
              if (existingWallet !== undefined) {
                return Effect.succeed(existingWallet)
              }
              return Effect.try({
                try: () => createStoredRecord(request, randomBytes),
                catch: error =>
                  error instanceof WalletVaultError
                    ? error
                    : new WalletVaultError({ code: 'Unavailable' }),
              }).pipe(
                Effect.flatMap(record => {
                  const created = walletForStoredRecord(record)
                  const encoded = S.encodeSync(StoredWalletRecordJson)(record)
                  return Effect.uninterruptible(
                    storage.saveRecord(created.wallet.walletId, encoded).pipe(
                      Effect.flatMap(() =>
                        Effect.sync(() => {
                          custodyByWalletId.set(
                            created.wallet.walletId,
                            created.custody,
                          )
                          walletByRequestId.set(
                            request.requestId,
                            created.wallet,
                          )
                          return created.wallet
                        }),
                      ),
                    ),
                  )
                }),
              )
            }),
          ),
      })
    }),
  )

/** Creates process-local record storage for tests and ephemeral hosts. */
export const makeMemoryWalletVaultStorage = (): WalletVaultStorage => {
  const records = new Map<string, string>()
  return {
    loadRecords: Effect.sync(() => Array_.fromIterable(records.values())),
    saveRecord: (walletId, record) =>
      Effect.sync(() => {
        records.set(walletId, record)
      }),
  }
}

/** Builds an in-memory Wallet vault around a platform entropy source. */
export const makeLocalWalletVault = (
  randomBytes: WalletRandomBytes,
): Layer.Layer<WalletVault> =>
  makePersistentLocalWalletVault(randomBytes, makeMemoryWalletVaultStorage())

const defaultRandomBytes: WalletRandomBytes = byteCount => {
  const bytes = new Uint8Array(byteCount)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

/** In-memory Wallet vault for ephemeral browser and Node hosts. */
export const LocalWalletVault = Layer.suspend(() =>
  makeLocalWalletVault(defaultRandomBytes),
)

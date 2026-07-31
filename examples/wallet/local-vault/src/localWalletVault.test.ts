import { Array as Array_, Effect, Option, Redacted, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  SignatureProof,
  WalletCreationRequest,
  WalletCrypto,
  type WalletProfile,
  type WalletProfileAccount,
  WalletSigner,
  WalletVault,
  WalletVaultError,
  activeWalletAccounts,
  makeTransactionPayload,
  makeWalletTestChallenge,
} from 'wallet-core-example'
import {
  BitcoinPreparedPayload,
  BitcoinPreparedPayloadJson,
  BitcoinSignedPayloadJson,
  EthereumPreparedPayload,
  EthereumPreparedPayloadJson,
  EthereumSignedPayloadJson,
  SolanaPreparedPayload,
  SolanaPreparedPayloadJson,
  SolanaSignedPayloadJson,
  SuiPreparedPayload,
  SuiPreparedPayloadJson,
  SuiSignedPayloadJson,
  liveWalletNetworkDescriptors,
} from 'wallet-live-client-example'

import { Transaction as SuiTransaction } from '@mysten/sui/transactions'
import { base58, base64, hex } from '@scure/base'
import * as Bitcoin from '@scure/btc-signer'
import { pubECDSA } from '@scure/btc-signer/utils.js'

import {
  LocalWalletTransferInternal,
  LocalWalletTransferRecordPort,
  type WalletVaultStorage,
  WalletVaultStorageCustody,
  WalletVaultStorageError,
  localWalletVaultOwnerKey,
  makeLocalWalletResources,
  makeLocalWalletVault,
  makeMemoryWalletVaultStorage,
  makeOwnerPartitionMemoryWalletVaultStorage,
  makePersistentLocalWalletResources,
  makePersistentLocalWalletVault,
} from './localWalletVault.js'

const walletCreationRequest = WalletCreationRequest.make({
  requestId: 'wallet-1',
  displayName: 'Wallet 1',
  networks: liveWalletNetworkDescriptors,
})

const secondWalletCreationRequest = WalletCreationRequest.make({
  requestId: 'wallet-2',
  displayName: 'Wallet 2',
  networks: liveWalletNetworkDescriptors,
})

const subsetNetworkIds: ReadonlyArray<string> = [
  'ethereum:sepolia',
  'solana:devnet',
]
const subsetWalletCreationRequest = WalletCreationRequest.make({
  requestId: 'subset-wallet',
  displayName: 'Subset Wallet',
  networks: Array_.filter(liveWalletNetworkDescriptors, network =>
    Array_.contains(subsetNetworkIds, network.networkId),
  ),
})

const makeDeterministicRandomBytes = () => {
  let nextByte = 1
  return (byteCount: number): Uint8Array => {
    const bytes = new Uint8Array(byteCount)
    bytes.fill(nextByte)
    nextByte += 1
    return bytes
  }
}

const privateKeyHex = (byte: number): string => {
  const bytes = new Uint8Array(32)
  bytes.fill(byte)
  return hex.encode(bytes)
}

const accountForNetwork = (
  wallet: WalletProfile,
  networkId: string,
): WalletProfileAccount => {
  const maybeAccount = Array_.findFirst(
    wallet.accounts,
    account => account.networkId === networkId,
  )
  if (Option.isNone(maybeAccount)) {
    throw new Error(`Missing test account for ${networkId}`)
  } else {
    return maybeAccount.value
  }
}

describe('local Wallet vault', () => {
  it('creates one exact-network account from each requested live configuration', async () => {
    const TestWalletVault = makeLocalWalletVault(makeDeterministicRandomBytes())
    const [first, second] = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* Effect.all([
          vault.createWallet(walletCreationRequest),
          vault.createWallet(walletCreationRequest),
        ])
      }).pipe(Effect.provide(TestWalletVault)),
    )

    expect(second).toStrictEqual(first)
    expect(first.accounts).toHaveLength(liveWalletNetworkDescriptors.length)
    expect(accountForNetwork(first, 'bitcoin:signet').address).toMatch(/^tb1/)
    expect(accountForNetwork(first, 'bitcoin:testnet4').address).toMatch(/^tb1/)
    expect(accountForNetwork(first, 'bitcoin:mainnet').address).toMatch(/^bc1/)
    expect(accountForNetwork(first, 'ethereum:mainnet').address).toMatch(
      /^0x[0-9a-fA-F]{40}$/,
    )
    expect(accountForNetwork(first, 'solana:mainnet-beta').address).toMatch(
      /^[1-9A-HJ-NP-Za-km-z]+$/,
    )
    expect(accountForNetwork(first, 'sui:mainnet').address).toMatch(
      /^0x[0-9a-f]{64}$/,
    )
    expect(
      activeWalletAccounts(first, liveWalletNetworkDescriptors, 'Devnet'),
    ).toHaveLength(4)
    expect(
      activeWalletAccounts(first, liveWalletNetworkDescriptors, 'Testnet'),
    ).toHaveLength(4)
    expect(
      activeWalletAccounts(first, liveWalletNetworkDescriptors, 'Live'),
    ).toHaveLength(4)
    expect(JSON.stringify(first)).not.toContain('privateKey')
  })

  it('rejects a changed creation request that reuses a visible Wallet id', async () => {
    const TestWalletVault = makeLocalWalletVault(makeDeterministicRandomBytes())
    const changedRequest = WalletCreationRequest.make({
      ...walletCreationRequest,
      displayName: 'Changed Wallet',
    })
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const first = yield* vault.createWallet(walletCreationRequest)
        const failure = yield* vault
          .createWallet(changedRequest)
          .pipe(Effect.flip)
        const wallets = yield* vault.loadWallets
        return { failure, first, wallets }
      }).pipe(Effect.provide(TestWalletVault)),
    )

    expect(result.failure.code).toBe('InvalidKeyMaterial')
    expect(result.wallets).toStrictEqual([result.first])
  })

  it('restores the same profiles and addresses through a reconstructed vault', async () => {
    const storage = makeMemoryWalletVaultStorage(localWalletVaultOwnerKey)
    const first = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* vault.createWallet(walletCreationRequest)
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletVault(
            makeDeterministicRandomBytes(),
            storage,
          ),
        ),
      ),
    )
    const restored = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* vault.loadWallets
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletVault(
            makeDeterministicRandomBytes(),
            storage,
          ),
        ),
      ),
    )

    expect(restored).toStrictEqual([first])
  })

  it('imports one canonical record and refreshes signing custody for every restored account', async () => {
    const sourceStorage = makeMemoryWalletVaultStorage(localWalletVaultOwnerKey)
    const source = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const transfer = yield* LocalWalletTransferRecordPort
        const wallet = yield* vault.createWallet(walletCreationRequest)
        const record = yield* transfer.exportCanonicalRecord(wallet.walletId)
        return { wallet, record }
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletResources(
            makeDeterministicRandomBytes(),
            sourceStorage,
          ),
        ),
      ),
    )
    const targetStorage = makeMemoryWalletVaultStorage(localWalletVaultOwnerKey)
    const restored = await Effect.runPromise(
      Effect.gen(function* () {
        const transfer = yield* LocalWalletTransferRecordPort
        const vault = yield* WalletVault
        const signer = yield* WalletSigner
        const crypto = yield* WalletCrypto
        yield* transfer.importCanonicalRecord(source.record)
        yield* transfer.importCanonicalRecord(source.record)
        const wallets = yield* vault.loadWallets
        const verifications = yield* Effect.forEach(
          source.wallet.accounts,
          account => {
            const challenge = makeWalletTestChallenge(
              `restored:${account.accountId}`,
              account.accountId,
            )
            return signer
              .signChallenge(challenge)
              .pipe(
                Effect.flatMap(proof =>
                  crypto.verifySignatureProof(challenge, proof),
                ),
              )
          },
        )
        return { wallets, verifications }
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletResources(
            makeDeterministicRandomBytes(),
            targetStorage,
          ),
        ),
      ),
    )

    expect(restored.wallets).toStrictEqual([source.wallet])
    expect(Array_.every(restored.verifications, Boolean)).toBe(true)
    expect(String(source.record)).not.toContain('privateKeyHex')
    expect(JSON.stringify(source.record)).not.toContain('privateKeyHex')
  })

  it('round trips subset-network custody from both new and legacy v2 records', async () => {
    const newStorage = makeMemoryWalletVaultStorage(localWalletVaultOwnerKey)
    const newRecord = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const transfer = yield* LocalWalletTransferRecordPort
        const wallet = yield* vault.createWallet(subsetWalletCreationRequest)
        return {
          wallet,
          record: yield* transfer.exportCanonicalRecord(wallet.walletId),
        }
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletResources(
            makeDeterministicRandomBytes(),
            newStorage,
          ),
        ),
      ),
    )
    const decodedNewRecord = S.decodeUnknownSync(
      LocalWalletTransferInternal.StoredWalletRecordJson,
    )(Redacted.value(newRecord.record))
    expect(Array_.map(decodedNewRecord.keys, key => key.chainId)).toStrictEqual(
      ['ethereum', 'solana'],
    )
    expect(
      Array_.map(newRecord.wallet.accounts, account => account.networkId),
    ).toStrictEqual(subsetNetworkIds)

    const legacyV2Record = LocalWalletTransferInternal.StoredWalletRecord.make({
      version: 2,
      request: subsetWalletCreationRequest,
      createdAt: 1,
      keys: Array_.map(
        ['bitcoin', 'ethereum', 'solana', 'sui'],
        (chainId, index) =>
          LocalWalletTransferInternal.StoredWalletChainKey.make({
            chainId,
            privateKeyHex: privateKeyHex(index + 1),
          }),
      ),
    })
    const legacyV2Encoded = S.encodeSync(
      LocalWalletTransferInternal.StoredWalletRecordJson,
    )(legacyV2Record)
    const legacyStorage: WalletVaultStorage = {
      ownerKey: localWalletVaultOwnerKey,
      custody: WalletVaultStorageCustody.make('ProcessLocal'),
      loadRecords: Effect.succeed([legacyV2Encoded]),
      prepareRecord: (walletId, createRecord) =>
        Effect.sync(() =>
          walletId === subsetWalletCreationRequest.requestId
            ? legacyV2Encoded
            : createRecord(),
        ),
      commitPreparedRecord: () => Effect.void,
    }
    const exportedLegacy = await Effect.runPromise(
      Effect.gen(function* () {
        const transfer = yield* LocalWalletTransferRecordPort
        return yield* transfer.exportCanonicalRecord(
          subsetWalletCreationRequest.requestId,
        )
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletResources(
            makeDeterministicRandomBytes(),
            legacyStorage,
          ),
        ),
      ),
    )
    const targetStorage = makeMemoryWalletVaultStorage(localWalletVaultOwnerKey)
    const roundTrip = await Effect.runPromise(
      Effect.gen(function* () {
        const transfer = yield* LocalWalletTransferRecordPort
        const vault = yield* WalletVault
        yield* transfer.importCanonicalRecord(exportedLegacy)
        return {
          record: yield* transfer.exportCanonicalRecord(
            subsetWalletCreationRequest.requestId,
          ),
          wallets: yield* vault.loadWallets,
        }
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletResources(
            makeDeterministicRandomBytes(),
            targetStorage,
          ),
        ),
      ),
    )

    expect(Redacted.value(roundTrip.record)).toBe(
      Redacted.value(exportedLegacy),
    )
    expect(roundTrip.wallets).toStrictEqual([
      expect.objectContaining({
        walletId: subsetWalletCreationRequest.requestId,
        accounts: [
          expect.objectContaining({ networkId: 'ethereum:sepolia' }),
          expect.objectContaining({ networkId: 'solana:devnet' }),
        ],
      }),
    ])
  })

  it('rejects malformed and noncanonical transfer records table by table', async () => {
    const canonical = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const transfer = yield* LocalWalletTransferRecordPort
        const wallet = yield* vault.createWallet(walletCreationRequest)
        return yield* transfer.exportCanonicalRecord(wallet.walletId)
      }).pipe(
        Effect.provide(
          makeLocalWalletResources(makeDeterministicRandomBytes()),
        ),
      ),
    )
    const encoded = Redacted.value(canonical)
    const decoded = S.decodeUnknownSync(
      LocalWalletTransferInternal.StoredWalletRecordJson,
    )(encoded)
    const maybeFirstKey = Array_.head(decoded.keys)
    const maybeFirstNetwork = Array_.head(decoded.request.networks)
    if (Option.isNone(maybeFirstKey) || Option.isNone(maybeFirstNetwork)) {
      throw new Error('Expected canonical Wallet test material')
    }
    const encode = S.encodeSync(
      LocalWalletTransferInternal.StoredWalletRecordJson,
    )
    const invalidRecords: ReadonlyArray<
      Readonly<{ name: string; encoded: string }>
    > = [
      {
        name: 'unsupported version',
        encoded: encoded.replace('"version":2', '"version":3'),
      },
      {
        name: 'noncanonical whitespace',
        encoded: ` ${encoded}`,
      },
      {
        name: 'noncanonical key order',
        encoded: encode(
          LocalWalletTransferInternal.StoredWalletRecord.make({
            ...decoded,
            keys: Array_.reverse(decoded.keys),
          }),
        ),
      },
      {
        name: 'missing required key',
        encoded: encode(
          LocalWalletTransferInternal.StoredWalletRecord.make({
            ...decoded,
            keys: Array_.drop(decoded.keys, 1),
          }),
        ),
      },
      {
        name: 'duplicate key',
        encoded: encode(
          LocalWalletTransferInternal.StoredWalletRecord.make({
            ...decoded,
            keys: [...decoded.keys, maybeFirstKey.value],
          }),
        ),
      },
      {
        name: 'unknown key family',
        encoded: encode(
          LocalWalletTransferInternal.StoredWalletRecord.make({
            ...decoded,
            keys: [
              LocalWalletTransferInternal.StoredWalletChainKey.make({
                chainId: 'unknown',
                privateKeyHex: maybeFirstKey.value.privateKeyHex,
              }),
              ...Array_.drop(decoded.keys, 1),
            ],
          }),
        ),
      },
      {
        name: 'invalid key material',
        encoded: encode(
          LocalWalletTransferInternal.StoredWalletRecord.make({
            ...decoded,
            keys: [
              LocalWalletTransferInternal.StoredWalletChainKey.make({
                ...maybeFirstKey.value,
                privateKeyHex: '00',
              }),
              ...Array_.drop(decoded.keys, 1),
            ],
          }),
        ),
      },
      {
        name: 'duplicate network',
        encoded: encode(
          LocalWalletTransferInternal.StoredWalletRecord.make({
            ...decoded,
            request: WalletCreationRequest.make({
              ...decoded.request,
              networks: [...decoded.request.networks, maybeFirstNetwork.value],
            }),
          }),
        ),
      },
      {
        name: 'noncanonical network order',
        encoded: encode(
          LocalWalletTransferInternal.StoredWalletRecord.make({
            ...decoded,
            request: WalletCreationRequest.make({
              ...decoded.request,
              networks: Array_.reverse(decoded.request.networks),
            }),
          }),
        ),
      },
    ]
    const targetStorage = makeMemoryWalletVaultStorage(localWalletVaultOwnerKey)
    const failures = await Effect.runPromise(
      Effect.gen(function* () {
        const transfer = yield* LocalWalletTransferRecordPort
        return yield* Effect.forEach(invalidRecords, invalid =>
          transfer.importCanonicalRecord(Redacted.make(invalid.encoded)).pipe(
            Effect.flip,
            Effect.map(error => ({ name: invalid.name, error })),
          ),
        )
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletResources(
            makeDeterministicRandomBytes(),
            targetStorage,
          ),
        ),
      ),
    )

    expect(
      Array_.map(failures, failure => ({
        name: failure.name,
        code: failure.error.code,
      })),
    ).toStrictEqual(
      Array_.map(invalidRecords, invalid => ({
        name: invalid.name,
        code: 'InvalidRecord',
      })),
    )
  })

  it('rejects invalid versions and same-id custody collisions without changing the target Wallet', async () => {
    const source = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const transfer = yield* LocalWalletTransferRecordPort
        const wallet = yield* vault.createWallet(walletCreationRequest)
        return yield* transfer.exportCanonicalRecord(wallet.walletId)
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletResources(
            makeDeterministicRandomBytes(),
            makeMemoryWalletVaultStorage(localWalletVaultOwnerKey),
          ),
        ),
      ),
    )
    const targetStorage = makeMemoryWalletVaultStorage(localWalletVaultOwnerKey)
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const transfer = yield* LocalWalletTransferRecordPort
        const existing = yield* vault.createWallet(walletCreationRequest)
        const invalidVersion = Redacted.make(
          Redacted.value(source).replace('"version":2', '"version":3'),
        )
        const invalidVersionFailure = yield* transfer
          .importCanonicalRecord(invalidVersion)
          .pipe(Effect.flip)
        const collision = yield* transfer
          .importCanonicalRecord(source)
          .pipe(Effect.flip)
        const wallets = yield* vault.loadWallets
        return { existing, invalidVersionFailure, collision, wallets }
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletResources(
            byteCount => new Uint8Array(byteCount).fill(9),
            targetStorage,
          ),
        ),
      ),
    )

    expect(result.invalidVersionFailure.code).toBe('InvalidRecord')
    expect(result.collision.code).toBe('Conflict')
    expect(result.wallets).toStrictEqual([result.existing])
  })

  it('loads and idempotently retries a legacy record without rewriting custody', async () => {
    const storedRecord = JSON.stringify({
      request: { requestId: 'legacy-wallet', displayName: 'Legacy Wallet' },
      createdAt: 1,
      bitcoinPrivateKey: privateKeyHex(1),
      ethereumPrivateKey: privateKeyHex(2),
      solanaPrivateKey: privateKeyHex(3),
      suiPrivateKey: privateKeyHex(4),
    })
    let saveCount = 0
    const storage: WalletVaultStorage = {
      ownerKey: localWalletVaultOwnerKey,
      custody: WalletVaultStorageCustody.make('ProcessLocal'),
      loadRecords: Effect.sync(() => [storedRecord]),
      prepareRecord: () => Effect.succeed(storedRecord),
      commitPreparedRecord: (walletId, nextRecord) =>
        Effect.suspend(() => {
          expect(walletId).toBe('legacy-wallet')
          if (nextRecord !== storedRecord) {
            return Effect.fail(
              new WalletVaultStorageError({ code: 'Conflict' }),
            )
          }
          saveCount += 1
          return Effect.void
        }),
    }
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const wallets = yield* vault.loadWallets
        const retried = yield* vault.createWallet(
          WalletCreationRequest.make({
            requestId: 'legacy-wallet',
            displayName: 'Legacy Wallet',
            networks: liveWalletNetworkDescriptors,
          }),
        )
        return { retried, wallets }
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletVault(
            makeDeterministicRandomBytes(),
            storage,
          ),
        ),
      ),
    )

    expect(result.wallets).toHaveLength(1)
    const maybeWallet = Array_.head(result.wallets)
    if (Option.isNone(maybeWallet)) {
      throw new Error('Missing migrated Wallet profile')
    }
    expect(maybeWallet.value.accounts).toHaveLength(
      liveWalletNetworkDescriptors.length,
    )
    expect(result.retried).toStrictEqual(maybeWallet.value)
    expect(saveCount).toBe(1)
  })

  it('refreshes a running vault and signer after another vault adds a record', async () => {
    const storage = makeMemoryWalletVaultStorage(localWalletVaultOwnerKey)
    const primaryResources = makePersistentLocalWalletResources(
      makeDeterministicRandomBytes(),
      storage,
    )
    const secondaryVault = makePersistentLocalWalletVault(
      makeDeterministicRandomBytes(),
      storage,
    )
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const signer = yield* WalletSigner
        const initiallyLoaded = yield* vault.loadWallets
        const externallyCreated = yield* Effect.gen(function* () {
          const externalVault = yield* WalletVault
          return yield* externalVault.createWallet(secondWalletCreationRequest)
        }).pipe(Effect.provide(secondaryVault))
        const refreshed = yield* vault.loadWallets
        const account = accountForNetwork(externallyCreated, 'solana:devnet')
        const challenge = makeWalletTestChallenge(
          'external-wallet-challenge',
          account.accountId,
        )
        const proof = yield* signer.signChallenge(challenge)
        return { initiallyLoaded, refreshed, proof, account }
      }).pipe(Effect.provide(primaryResources)),
    )

    expect(result.initiallyLoaded).toStrictEqual([])
    expect(result.refreshed).toStrictEqual([
      expect.objectContaining({ walletId: 'wallet-2' }),
    ])
    expect(result.proof.accountId).toBe(result.account.accountId)
  })

  it('replaces the registry when a persisted record disappears', async () => {
    const records = new Map<string, string>()
    const storage: WalletVaultStorage = {
      ownerKey: localWalletVaultOwnerKey,
      custody: WalletVaultStorageCustody.make('ProcessLocal'),
      loadRecords: Effect.sync(() => Array_.fromIterable(records.values())),
      prepareRecord: (walletId, createRecord) =>
        Effect.sync(() => {
          const existing = records.get(walletId)
          if (existing !== undefined) {
            return existing
          } else {
            const record = createRecord()
            records.set(walletId, record)
            return record
          }
        }),
      commitPreparedRecord: (walletId, record) =>
        Effect.sync(() => {
          expect(records.get(walletId)).toBe(record)
        }),
    }
    const wallets = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        yield* vault.createWallet(walletCreationRequest)
        yield* vault.createWallet(secondWalletCreationRequest)
        const beforeRemoval = yield* vault.loadWallets
        yield* Effect.sync(() => {
          records.delete(secondWalletCreationRequest.requestId)
        })
        const afterRemoval = yield* vault.loadWallets
        return { beforeRemoval, afterRemoval }
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletVault(
            makeDeterministicRandomBytes(),
            storage,
          ),
        ),
      ),
    )

    expect(wallets.beforeRemoval).toHaveLength(2)
    expect(wallets.afterRemoval).toStrictEqual([
      expect.objectContaining({ walletId: 'wallet-1' }),
    ])
  })

  it('shares custody across vault, signer, and crypto services', async () => {
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const signer = yield* WalletSigner
        const crypto = yield* WalletCrypto
        const wallet = yield* vault.createWallet(walletCreationRequest)
        return yield* Effect.forEach(wallet.accounts, account => {
          const challenge = makeWalletTestChallenge(
            `challenge:${account.accountId}`,
            account.accountId,
          )
          return signer.signChallenge(challenge).pipe(
            Effect.flatMap(proof =>
              Effect.all({
                proof: Effect.succeed(proof),
                isVerified: crypto.verifySignatureProof(challenge, proof),
                isWrongChallengeVerified: crypto.verifySignatureProof(
                  challenge,
                  SignatureProof.make({
                    ...proof,
                    challengeId: 'wrong-challenge',
                  }),
                ),
              }),
            ),
          )
        })
      }).pipe(
        Effect.provide(
          makeLocalWalletResources(makeDeterministicRandomBytes()),
        ),
      ),
    )

    expect(Array_.every(results, result => result.isVerified)).toBe(true)
    expect(
      Array_.every(results, result => !result.isWrongChallengeVerified),
    ).toBe(true)
    expect(JSON.stringify(results)).not.toContain('privateKey')
  })

  it('signs a valid transaction payload for every supported cryptocurrency', async () => {
    const signedPayloads = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const signer = yield* WalletSigner
        const wallet = yield* vault.createWallet(walletCreationRequest)
        const bitcoinAccount = accountForNetwork(wallet, 'bitcoin:signet')
        const ethereumAccount = accountForNetwork(wallet, 'ethereum:anvil')
        const solanaAccount = accountForNetwork(wallet, 'solana:devnet')
        const suiAccount = accountForNetwork(wallet, 'sui:devnet')

        const bitcoinNetwork = {
          bech32: 'tb',
          pubKeyHash: 0x6f,
          scriptHash: 0xc4,
          wif: 0xef,
        }
        const bitcoinSpend = Bitcoin.p2wpkh(
          pubECDSA(new Uint8Array(32).fill(1)),
          bitcoinNetwork,
        )
        const bitcoinTransaction = new Bitcoin.Transaction()
        bitcoinTransaction.addInput({
          txid: new Uint8Array(32).fill(1),
          index: 0,
          witnessUtxo: { amount: 100_000n, script: bitcoinSpend.script },
        })
        bitcoinTransaction.addOutputAddress(
          bitcoinAccount.address,
          90_000n,
          bitcoinNetwork,
        )
        const bitcoinPayload = makeTransactionPayload(
          bitcoinAccount.accountId,
          bitcoinAccount.networkId,
          S.encodeSync(BitcoinPreparedPayloadJson)(
            BitcoinPreparedPayload.make({
              previewId: 'bitcoin-preview',
              psbtHex: hex.encode(bitcoinTransaction.toPSBT()),
            }),
          ),
        )
        const ethereumPayload = makeTransactionPayload(
          ethereumAccount.accountId,
          ethereumAccount.networkId,
          S.encodeSync(EthereumPreparedPayloadJson)(
            EthereumPreparedPayload.make({
              previewId: 'ethereum-preview',
              chainId: 31_337,
              nonce: 0,
              gas: '21000',
              maxFeePerGas: '1000000000',
              maxPriorityFeePerGas: '1000000000',
              to: ethereumAccount.address,
              value: '1',
            }),
          ),
        )
        const solanaPayload = makeTransactionPayload(
          solanaAccount.accountId,
          solanaAccount.networkId,
          S.encodeSync(SolanaPreparedPayloadJson)(
            SolanaPreparedPayload.make({
              previewId: 'solana-preview',
              sourceAddress: solanaAccount.address,
              destinationAddress: solanaAccount.address,
              atomicUnits: '1',
              blockhash: base58.encode(new Uint8Array(32).fill(9)),
              lastValidBlockHeight: '1',
            }),
          ),
        )
        const suiTransaction = new SuiTransaction()
        suiTransaction.setSender(suiAccount.address)
        suiTransaction.setGasBudget(1_000_000)
        suiTransaction.setGasPrice(1_000)
        suiTransaction.setGasPayment([
          {
            objectId: `0x${'01'.repeat(32)}`,
            version: '1',
            digest: base58.encode(new Uint8Array(32).fill(8)),
          },
        ])
        suiTransaction.transferObjects([suiTransaction.gas], suiAccount.address)
        const suiTransactionBytes = yield* Effect.promise(() =>
          suiTransaction.build(),
        )
        const suiPayload = makeTransactionPayload(
          suiAccount.accountId,
          suiAccount.networkId,
          S.encodeSync(SuiPreparedPayloadJson)(
            SuiPreparedPayload.make({
              previewId: 'sui-preview',
              transactionBytesBase64: base64.encode(suiTransactionBytes),
            }),
          ),
        )

        return yield* Effect.all({
          bitcoin: signer.signTransaction(bitcoinPayload),
          ethereum: signer.signTransaction(ethereumPayload),
          solana: signer.signTransaction(solanaPayload),
          sui: signer.signTransaction(suiPayload),
        })
      }).pipe(
        Effect.provide(
          makeLocalWalletResources(makeDeterministicRandomBytes()),
        ),
      ),
    )

    expect(
      S.decodeUnknownSync(BitcoinSignedPayloadJson)(
        Redacted.value(signedPayloads.bitcoin.payload),
      ).rawTransactionHex,
    ).not.toBe('')
    expect(
      S.decodeUnknownSync(EthereumSignedPayloadJson)(
        Redacted.value(signedPayloads.ethereum.payload),
      ).rawTransaction,
    ).toMatch(/^0x/)
    expect(
      S.decodeUnknownSync(SolanaSignedPayloadJson)(
        Redacted.value(signedPayloads.solana.payload),
      ).wireTransactionBase64,
    ).not.toBe('')
    expect(
      S.decodeUnknownSync(SuiSignedPayloadJson)(
        Redacted.value(signedPayloads.sui.payload),
      ).signature,
    ).not.toBe('')
  })

  it('does not report creation success when durable storage fails', async () => {
    const TestWalletVault = makePersistentLocalWalletVault(
      makeDeterministicRandomBytes(),
      {
        ownerKey: localWalletVaultOwnerKey,
        custody: WalletVaultStorageCustody.make('ProcessLocal'),
        loadRecords: Effect.succeed([]),
        prepareRecord: (_walletId, createRecord) => Effect.sync(createRecord),
        commitPreparedRecord: () =>
          Effect.fail(new Error('unavailable')).pipe(
            Effect.mapError(
              () => new WalletVaultError({ code: 'Unavailable' }),
            ),
          ),
      },
    )
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* vault.createWallet(walletCreationRequest)
      }).pipe(Effect.provide(TestWalletVault)),
    )

    expect(exit._tag).toBe('Failure')
  })

  it('recovers a prepared record after a failed visibility commit without regenerating custody', async () => {
    const preparedRecords = new Map<string, string>()
    let isVisible = false
    let isFirstSave = true
    const storage: WalletVaultStorage = {
      ownerKey: localWalletVaultOwnerKey,
      custody: WalletVaultStorageCustody.make('ProcessLocal'),
      loadRecords: Effect.sync(() =>
        isVisible ? Array_.fromIterable(preparedRecords.values()) : [],
      ),
      prepareRecord: (walletId, createRecord) =>
        Effect.suspend(() => {
          const existingRecord = preparedRecords.get(walletId)
          if (existingRecord !== undefined) {
            return Effect.succeed(existingRecord)
          } else {
            const record = createRecord()
            preparedRecords.set(walletId, record)
            return Effect.succeed(record)
          }
        }),
      commitPreparedRecord: (walletId, record) =>
        Effect.suspend(() => {
          if (preparedRecords.get(walletId) !== record) {
            return Effect.fail(
              new WalletVaultStorageError({ code: 'Conflict' }),
            )
          }
          if (isFirstSave) {
            isFirstSave = false
            return Effect.fail(
              new WalletVaultStorageError({ code: 'Unavailable' }),
            )
          } else {
            isVisible = true
            return Effect.void
          }
        }),
    }
    await Effect.runPromiseExit(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* vault.createWallet(walletCreationRequest)
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletVault(
            makeDeterministicRandomBytes(),
            storage,
          ),
        ),
      ),
    )
    const preparedRecord = preparedRecords.get(walletCreationRequest.requestId)
    let retryEntropyCalls = 0
    const restored = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* vault.createWallet(walletCreationRequest)
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletVault(byteCount => {
            retryEntropyCalls += 1
            return new Uint8Array(byteCount).fill(9)
          }, storage),
        ),
      ),
    )

    expect(preparedRecord).toBeDefined()
    expect(preparedRecords.get(walletCreationRequest.requestId)).toBe(
      preparedRecord,
    )
    expect(restored.walletId).toBe(walletCreationRequest.requestId)
    expect(restored.accounts).toHaveLength(liveWalletNetworkDescriptors.length)
    expect(retryEntropyCalls).toBe(0)
  })

  it('validates authenticated owner partitions at runtime', () => {
    const authenticatedOwner = 'A'.repeat(43)

    expect(
      makeOwnerPartitionMemoryWalletVaultStorage(authenticatedOwner).ownerKey,
    ).toBe(authenticatedOwner)
    expect(() => makeOwnerPartitionMemoryWalletVaultStorage('Local')).toThrow(
      WalletVaultStorageError,
    )
    expect(() =>
      makeOwnerPartitionMemoryWalletVaultStorage('subject@example.com'),
    ).toThrow(WalletVaultStorageError)
    expect(() => makeMemoryWalletVaultStorage('not-an-owner-key')).toThrow(
      WalletVaultStorageError,
    )
  })
})

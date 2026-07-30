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
  type WalletVaultStorage,
  makeLocalWalletResources,
  makeLocalWalletVault,
  makeMemoryWalletVaultStorage,
  makePersistentLocalWalletResources,
  makePersistentLocalWalletVault,
} from './localWalletVault.js'

const MigratedRecordEnvelope = S.Struct({ version: S.Number })
const MigratedRecordEnvelopeJson = S.fromJsonString(MigratedRecordEnvelope)

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

  it('restores the same profiles and addresses through a reconstructed vault', async () => {
    const storage = makeMemoryWalletVaultStorage()
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

  it('migrates legacy four-key records into exact-network accounts', async () => {
    let storedRecord = JSON.stringify({
      request: { requestId: 'legacy-wallet', displayName: 'Legacy Wallet' },
      createdAt: 1,
      bitcoinPrivateKey: privateKeyHex(1),
      ethereumPrivateKey: privateKeyHex(2),
      solanaPrivateKey: privateKeyHex(3),
      suiPrivateKey: privateKeyHex(4),
    })
    let saveCount = 0
    const storage: WalletVaultStorage = {
      loadRecords: Effect.sync(() => [storedRecord]),
      saveRecord: (walletId, nextRecord) =>
        Effect.sync(() => {
          expect(walletId).toBe('legacy-wallet')
          storedRecord = nextRecord
          saveCount += 1
        }),
    }
    const wallets = await Effect.runPromise(
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

    expect(wallets).toHaveLength(1)
    const maybeWallet = Array_.head(wallets)
    if (Option.isNone(maybeWallet)) {
      throw new Error('Missing migrated Wallet profile')
    }
    expect(maybeWallet.value.accounts).toHaveLength(
      liveWalletNetworkDescriptors.length,
    )
    expect(saveCount).toBe(1)
    expect(
      S.decodeUnknownSync(MigratedRecordEnvelopeJson)(storedRecord).version,
    ).toBe(2)
  })

  it('refreshes a running vault and signer after another vault adds a record', async () => {
    const storage = makeMemoryWalletVaultStorage()
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
      loadRecords: Effect.sync(() => Array_.fromIterable(records.values())),
      saveRecord: (walletId, record) =>
        Effect.sync(() => {
          records.set(walletId, record)
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
        loadRecords: Effect.succeed([]),
        saveRecord: () =>
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
})

import {
  Array as Array_,
  Effect,
  Layer,
  Match as M,
  Option,
  Order,
  Redacted,
  Schema as S,
} from 'effect'
import { getAddress, verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  SignatureProof,
  type SignedTransaction,
  type SigningChallenge,
  type TransactionPayload,
  WalletCreationRequest,
  WalletCrypto,
  WalletCryptoError,
  type WalletCryptoService,
  WalletProfile,
  WalletProfileAccount,
  WalletSigner,
  WalletSignerError,
  type WalletSignerService,
  WalletVault,
  WalletVaultError,
  type WalletVaultService,
  makeSignedTransaction,
} from 'wallet-core-example'
import {
  type BitcoinLiveNetwork,
  BitcoinPreparedPayloadJson,
  BitcoinSignedPayload,
  BitcoinSignedPayloadJson,
  type EthereumLiveNetwork,
  EthereumPreparedPayloadJson,
  EthereumSignedPayload,
  EthereumSignedPayloadJson,
  type LiveWalletNetwork,
  type SolanaLiveNetwork,
  SolanaPreparedPayloadJson,
  SolanaSignedPayload,
  SolanaSignedPayloadJson,
  type SuiLiveNetwork,
  SuiPreparedPayloadJson,
  SuiSignedPayload,
  SuiSignedPayloadJson,
  buildSolanaTransactionMessage,
  liveWalletNetworkDescriptors,
  liveWalletNetworkForId,
} from 'wallet-live-client-example'

import { bcs } from '@mysten/sui/bcs'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { verifyPersonalMessageSignature } from '@mysten/sui/verify'
import { ed25519 } from '@noble/curves/ed25519'
import { secp256k1 } from '@noble/curves/secp256k1'
import { base58, base64, hex } from '@scure/base'
import * as Bitcoin from '@scure/btc-signer'
import { pubECDSA } from '@scure/btc-signer/utils.js'
import {
  createKeyPairSignerFromPrivateKeyBytes,
  getBase64EncodedWireTransaction,
  signTransactionMessageWithSigners,
} from '@solana/kit'

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

type LocalWalletAccountCustody = Readonly<{
  profile: WalletProfileAccount
  configuration: LiveWalletNetwork
  privateKey: Redacted.Redacted<Uint8Array>
}>

type LoadedLocalWallet = Readonly<{
  wallet: WalletProfile
  accounts: ReadonlyArray<LocalWalletAccountCustody>
}>

type LocalWalletServices = Readonly<{
  vault: WalletVaultService
  signer: WalletSignerService
  crypto: WalletCryptoService
}>

const StoredWalletChainKey = S.Struct({
  chainId: S.String,
  privateKeyHex: S.String,
})
type StoredWalletChainKey = typeof StoredWalletChainKey.Type

const StoredWalletRecord = S.Struct({
  version: S.Literals([2]),
  request: WalletCreationRequest,
  createdAt: S.Number,
  keys: S.Array(StoredWalletChainKey),
})
type StoredWalletRecord = typeof StoredWalletRecord.Type

const LegacyWalletCreationRequest = S.Struct({
  requestId: S.String,
  displayName: S.String,
})
const LegacyStoredWalletRecord = S.Struct({
  request: LegacyWalletCreationRequest,
  createdAt: S.Number,
  bitcoinPrivateKey: S.String,
  ethereumPrivateKey: S.String,
  solanaPrivateKey: S.String,
  suiPrivateKey: S.String,
})
type LegacyStoredWalletRecord = typeof LegacyStoredWalletRecord.Type

const StoredWalletRecordDocument = S.Union([
  StoredWalletRecord,
  LegacyStoredWalletRecord,
])
const StoredWalletRecordDocumentJson = S.fromJsonString(
  StoredWalletRecordDocument,
)
const StoredWalletRecordJson = S.fromJsonString(StoredWalletRecord)

const requiredPrivateKeyByteCount = 32
const requiredChallengeByteCount = 32
const storedWalletRecordVersion = 2

const invalidKeyMaterial = () =>
  new WalletVaultError({ code: 'InvalidKeyMaterial' })

const unavailableVault = () => new WalletVaultError({ code: 'Unavailable' })

const unsupportedAccount = () =>
  new WalletSignerError({ code: 'UnsupportedAccount' })

const deniedSignature = () => new WalletSignerError({ code: 'Denied' })

const unavailableSigner = () => new WalletSignerError({ code: 'Unavailable' })

const unavailableCrypto = () => new WalletCryptoError({ code: 'Unavailable' })

const verificationFailed = () =>
  new WalletCryptoError({ code: 'VerificationFailed' })

const requiredBitcoinAddress = (maybeAddress: string | undefined): string => {
  if (maybeAddress === undefined) {
    throw invalidKeyMaterial()
  } else {
    return maybeAddress
  }
}

const requiredEd25519PrivateKey = (privateKey: Uint8Array): Uint8Array => {
  if (privateKey.byteLength === requiredPrivateKeyByteCount) {
    return privateKey
  } else {
    throw invalidKeyMaterial()
  }
}

const requiredSecp256k1PrivateKey = (privateKey: Uint8Array): Uint8Array => {
  if (secp256k1.utils.isValidPrivateKey(privateKey)) {
    return privateKey
  } else {
    throw invalidKeyMaterial()
  }
}

const privateKeyForChain = (
  chainId: string,
  privateKey: Uint8Array,
): Uint8Array =>
  M.value(chainId).pipe(
    M.withReturnType<Uint8Array>(),
    M.when('bitcoin', () => requiredSecp256k1PrivateKey(privateKey)),
    M.when('ethereum', () => requiredSecp256k1PrivateKey(privateKey)),
    M.when('solana', () => requiredEd25519PrivateKey(privateKey)),
    M.when('sui', () => requiredEd25519PrivateKey(privateKey)),
    M.orElse(() => {
      throw invalidKeyMaterial()
    }),
  )

const randomPrivateKeyForChain = (
  chainId: string,
  randomBytes: WalletRandomBytes,
): Uint8Array => privateKeyForChain(chainId, randomBytes(32))

const decodePrivateKeyForChain = (
  chainId: string,
  encoded: string,
): Uint8Array => {
  try {
    return privateKeyForChain(chainId, hex.decode(encoded))
  } catch {
    throw invalidKeyMaterial()
  }
}

const ethereumPrivateKeyHex = (privateKey: Uint8Array) =>
  S.decodeUnknownSync(S.TemplateLiteral(['0x', S.String]))(
    `0x${hex.encode(privateKey)}`,
  )

const bitcoinNetwork = (configuration: BitcoinLiveNetwork) => ({
  bech32: configuration.bech32,
  pubKeyHash: configuration.pubKeyHash,
  scriptHash: configuration.scriptHash,
  wif: configuration.wif,
})

const bitcoinAddress = (
  privateKey: Uint8Array,
  configuration: BitcoinLiveNetwork,
): string =>
  requiredBitcoinAddress(
    Bitcoin.p2wpkh(pubECDSA(privateKey), bitcoinNetwork(configuration)).address,
  )

const configurationForNetwork = (
  networkId: string,
  chainId: string,
): LiveWalletNetwork => {
  const maybeConfiguration = liveWalletNetworkForId(networkId)
  if (
    Option.isNone(maybeConfiguration) ||
    maybeConfiguration.value.network.chainId !== chainId
  ) {
    throw invalidKeyMaterial()
  } else {
    return maybeConfiguration.value
  }
}

const addressForNetwork = (
  privateKey: Uint8Array,
  configuration: LiveWalletNetwork,
): string =>
  M.value(configuration).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      BitcoinLiveNetwork: bitcoinConfiguration =>
        bitcoinAddress(privateKey, bitcoinConfiguration),
      EthereumLiveNetwork: () =>
        privateKeyToAccount(ethereumPrivateKeyHex(privateKey)).address,
      SolanaLiveNetwork: () => base58.encode(ed25519.getPublicKey(privateKey)),
      SuiLiveNetwork: () =>
        Ed25519Keypair.fromSecretKey(privateKey).toSuiAddress(),
    }),
  )

const normalizedStoredRecord = (
  record: LegacyStoredWalletRecord,
): StoredWalletRecord =>
  StoredWalletRecord.make({
    version: storedWalletRecordVersion,
    request: WalletCreationRequest.make({
      requestId: record.request.requestId,
      displayName: record.request.displayName,
      networks: liveWalletNetworkDescriptors,
    }),
    createdAt: record.createdAt,
    keys: [
      StoredWalletChainKey.make({
        chainId: 'bitcoin',
        privateKeyHex: record.bitcoinPrivateKey,
      }),
      StoredWalletChainKey.make({
        chainId: 'ethereum',
        privateKeyHex: record.ethereumPrivateKey,
      }),
      StoredWalletChainKey.make({
        chainId: 'solana',
        privateKeyHex: record.solanaPrivateKey,
      }),
      StoredWalletChainKey.make({
        chainId: 'sui',
        privateKeyHex: record.suiPrivateKey,
      }),
    ],
  })

const decodeStoredRecord = (
  encoded: string,
): Readonly<{ record: StoredWalletRecord; isMigration: boolean }> => {
  try {
    const document = S.decodeUnknownSync(StoredWalletRecordDocumentJson)(
      encoded,
    )
    if ('version' in document) {
      return { record: document, isMigration: false }
    } else {
      return { record: normalizedStoredRecord(document), isMigration: true }
    }
  } catch {
    throw invalidKeyMaterial()
  }
}

const encodeStoredRecord = (record: StoredWalletRecord): string =>
  S.encodeSync(StoredWalletRecordJson)(record)

const createStoredRecord = (
  request: WalletCreationRequest,
  randomBytes: WalletRandomBytes,
): StoredWalletRecord => {
  const chainIds = Array_.dedupe(
    Array_.map(request.networks, network => network.chainId),
  )
  return StoredWalletRecord.make({
    version: storedWalletRecordVersion,
    request,
    createdAt: Date.now(),
    keys: Array_.map(chainIds, chainId =>
      StoredWalletChainKey.make({
        chainId,
        privateKeyHex: hex.encode(
          randomPrivateKeyForChain(chainId, randomBytes),
        ),
      }),
    ),
  })
}

const loadedWalletForRecord = (
  record: StoredWalletRecord,
): LoadedLocalWallet => {
  const privateKeysByChainId = new Map<string, Redacted.Redacted<Uint8Array>>()
  for (const key of record.keys) {
    if (privateKeysByChainId.has(key.chainId)) {
      throw invalidKeyMaterial()
    }
    privateKeysByChainId.set(
      key.chainId,
      Redacted.make(decodePrivateKeyForChain(key.chainId, key.privateKeyHex)),
    )
  }
  const networkIds = Array_.map(
    record.request.networks,
    network => network.networkId,
  )
  if (Array_.length(Array_.dedupe(networkIds)) !== Array_.length(networkIds)) {
    throw invalidKeyMaterial()
  }
  const accounts = Array_.map(record.request.networks, network => {
    const privateKey = privateKeysByChainId.get(network.chainId)
    if (privateKey === undefined) {
      throw invalidKeyMaterial()
    }
    const configuration = configurationForNetwork(
      network.networkId,
      network.chainId,
    )
    const profile = WalletProfileAccount.make({
      accountId: `${record.request.requestId}:${network.networkId}`,
      chainId: network.chainId,
      networkId: network.networkId,
      address: addressForNetwork(Redacted.value(privateKey), configuration),
      displayName: configuration.network.displayName,
    })
    return { profile, configuration, privateKey }
  })
  return {
    wallet: WalletProfile.make({
      walletId: record.request.requestId,
      displayName: record.request.displayName,
      createdAt: record.createdAt,
      accounts: Array_.map(accounts, account => account.profile),
    }),
    accounts,
  }
}

const walletCreatedAtOrder = Order.mapInput(
  Order.Number,
  (wallet: WalletProfile) => wallet.createdAt,
)

const challengeBytes = (
  challenge: SigningChallenge,
): Option.Option<Uint8Array> => {
  if (challenge.digest.encoding !== 'hex') {
    return Option.none()
  }
  try {
    const bytes = hex.decode(challenge.digest.digest.replace(/^0x/, ''))
    if (bytes.byteLength === requiredChallengeByteCount) {
      return Option.some(bytes)
    } else {
      return Option.none()
    }
  } catch {
    return Option.none()
  }
}

const signEthereumTransaction = (
  account: LocalWalletAccountCustody,
  configuration: EthereumLiveNetwork,
  payload: TransactionPayload,
): Effect.Effect<SignedTransaction, WalletSignerError> =>
  S.decodeUnknownEffect(EthereumPreparedPayloadJson)(
    Redacted.value(payload.payload),
  ).pipe(
    Effect.mapError(deniedSignature),
    Effect.flatMap(prepared =>
      Effect.tryPromise({
        try: async () => {
          if (prepared.chainId !== configuration.numericChainId) {
            throw new Error('Ethereum chain mismatch')
          }
          const signer = privateKeyToAccount(
            ethereumPrivateKeyHex(Redacted.value(account.privateKey)),
          )
          if (
            getAddress(signer.address) !== getAddress(account.profile.address)
          ) {
            throw new Error('Ethereum account mismatch')
          }
          const rawTransaction = await signer.signTransaction({
            type: 'eip1559',
            chainId: prepared.chainId,
            nonce: prepared.nonce,
            gas: BigInt(prepared.gas),
            maxFeePerGas: BigInt(prepared.maxFeePerGas),
            maxPriorityFeePerGas: BigInt(prepared.maxPriorityFeePerGas),
            to: getAddress(prepared.to),
            value: BigInt(prepared.value),
          })
          return makeSignedTransaction(
            payload.accountId,
            payload.networkId,
            S.encodeSync(EthereumSignedPayloadJson)(
              EthereumSignedPayload.make({
                previewId: prepared.previewId,
                rawTransaction,
              }),
            ),
          )
        },
        catch: deniedSignature,
      }),
    ),
  )

const signBitcoinTransaction = (
  account: LocalWalletAccountCustody,
  configuration: BitcoinLiveNetwork,
  payload: TransactionPayload,
): Effect.Effect<SignedTransaction, WalletSignerError> =>
  S.decodeUnknownEffect(BitcoinPreparedPayloadJson)(
    Redacted.value(payload.payload),
  ).pipe(
    Effect.mapError(deniedSignature),
    Effect.flatMap(prepared =>
      Effect.try({
        try: () => {
          const privateKey = Redacted.value(account.privateKey)
          const expectedPayment = Bitcoin.p2wpkh(
            pubECDSA(privateKey),
            bitcoinNetwork(configuration),
          )
          if (
            expectedPayment.address !== account.profile.address ||
            expectedPayment.script === undefined
          ) {
            throw new Error('Bitcoin account mismatch')
          }
          const transaction = Bitcoin.Transaction.fromPSBT(
            hex.decode(prepared.psbtHex),
          )
          if (transaction.inputsLength === 0) {
            throw new Error('Bitcoin transaction has no inputs')
          }
          const inputIndexes = Array_.range(0, transaction.inputsLength - 1)
          const isExpectedScript = Array_.every(inputIndexes, inputIndex => {
            const input = transaction.getInput(inputIndex)
            return (
              input.witnessUtxo !== undefined &&
              hex.encode(input.witnessUtxo.script) ===
                hex.encode(expectedPayment.script)
            )
          })
          if (!isExpectedScript) {
            throw new Error('Bitcoin input script mismatch')
          }
          transaction.sign(privateKey)
          transaction.finalize()
          return makeSignedTransaction(
            payload.accountId,
            payload.networkId,
            S.encodeSync(BitcoinSignedPayloadJson)(
              BitcoinSignedPayload.make({
                previewId: prepared.previewId,
                rawTransactionHex: hex.encode(transaction.extract()),
              }),
            ),
          )
        },
        catch: deniedSignature,
      }),
    ),
  )

const signSolanaTransaction = (
  account: LocalWalletAccountCustody,
  _configuration: SolanaLiveNetwork,
  payload: TransactionPayload,
): Effect.Effect<SignedTransaction, WalletSignerError> =>
  S.decodeUnknownEffect(SolanaPreparedPayloadJson)(
    Redacted.value(payload.payload),
  ).pipe(
    Effect.mapError(deniedSignature),
    Effect.flatMap(prepared =>
      Effect.tryPromise({
        try: async () => {
          const signer = await createKeyPairSignerFromPrivateKeyBytes(
            Redacted.value(account.privateKey),
          )
          if (
            prepared.sourceAddress !== signer.address ||
            account.profile.address !== signer.address
          ) {
            throw new Error('Solana account mismatch')
          }
          const message = buildSolanaTransactionMessage(prepared, signer)
          const signed = await signTransactionMessageWithSigners(message)
          return makeSignedTransaction(
            payload.accountId,
            payload.networkId,
            S.encodeSync(SolanaSignedPayloadJson)(
              SolanaSignedPayload.make({
                previewId: prepared.previewId,
                wireTransactionBase64: getBase64EncodedWireTransaction(signed),
              }),
            ),
          )
        },
        catch: deniedSignature,
      }),
    ),
  )

const signSuiTransaction = (
  account: LocalWalletAccountCustody,
  _configuration: SuiLiveNetwork,
  payload: TransactionPayload,
): Effect.Effect<SignedTransaction, WalletSignerError> =>
  S.decodeUnknownEffect(SuiPreparedPayloadJson)(
    Redacted.value(payload.payload),
  ).pipe(
    Effect.mapError(deniedSignature),
    Effect.flatMap(prepared =>
      Effect.tryPromise({
        try: async () => {
          const transactionBytes = base64.decode(
            prepared.transactionBytesBase64,
          )
          const transactionData = bcs.TransactionData.parse(transactionBytes)
          const signer = Ed25519Keypair.fromSecretKey(
            Redacted.value(account.privateKey),
          )
          if (
            transactionData.V1 === null ||
            normalizeSuiAddress(transactionData.V1.sender) !==
              normalizeSuiAddress(account.profile.address) ||
            signer.toSuiAddress() !== account.profile.address
          ) {
            throw new Error('Sui account mismatch')
          }
          const signed = await signer.signTransaction(transactionBytes)
          return makeSignedTransaction(
            payload.accountId,
            payload.networkId,
            S.encodeSync(SuiSignedPayloadJson)(
              SuiSignedPayload.make({
                previewId: prepared.previewId,
                transactionBytesBase64: prepared.transactionBytesBase64,
                signature: signed.signature,
              }),
            ),
          )
        },
        catch: deniedSignature,
      }),
    ),
  )

const signTransactionForAccount = (
  account: LocalWalletAccountCustody,
  payload: TransactionPayload,
): Effect.Effect<SignedTransaction, WalletSignerError> => {
  if (
    payload.accountId !== account.profile.accountId ||
    payload.networkId !== account.profile.networkId
  ) {
    return Effect.fail(unsupportedAccount())
  }
  return M.value(account.configuration).pipe(
    M.withReturnType<Effect.Effect<SignedTransaction, WalletSignerError>>(),
    M.tagsExhaustive({
      BitcoinLiveNetwork: configuration =>
        signBitcoinTransaction(account, configuration, payload),
      EthereumLiveNetwork: configuration =>
        signEthereumTransaction(account, configuration, payload),
      SolanaLiveNetwork: configuration =>
        signSolanaTransaction(account, configuration, payload),
      SuiLiveNetwork: configuration =>
        signSuiTransaction(account, configuration, payload),
    }),
  )
}

const signChallengeForAccount = (
  account: LocalWalletAccountCustody,
  challenge: SigningChallenge,
): Effect.Effect<SignatureProof, WalletSignerError> => {
  const maybeBytes = challengeBytes(challenge)
  if (Option.isNone(maybeBytes)) {
    return Effect.fail(unsupportedAccount())
  }
  const privateKey = Redacted.value(account.privateKey)
  return M.value(account.configuration).pipe(
    M.withReturnType<Effect.Effect<SignatureProof, WalletSignerError>>(),
    M.tagsExhaustive({
      BitcoinLiveNetwork: configuration =>
        Effect.try({
          try: () => {
            const publicKey = pubECDSA(privateKey)
            if (
              bitcoinAddress(privateKey, configuration) !==
              account.profile.address
            ) {
              throw new Error('Bitcoin account mismatch')
            }
            return SignatureProof.make({
              challengeId: challenge.challengeId,
              accountId: challenge.accountId,
              algorithm: 'secp256k1',
              publicIdentity: hex.encode(publicKey),
              signature: hex.encode(
                secp256k1
                  .sign(maybeBytes.value, privateKey)
                  .toCompactRawBytes(),
              ),
              encoding: 'hex',
            })
          },
          catch: deniedSignature,
        }),
      EthereumLiveNetwork: () =>
        Effect.tryPromise({
          try: async () => {
            if (challenge.digest.algorithm !== 'keccak256') {
              throw new Error('Unsupported Ethereum digest')
            }
            const signer = privateKeyToAccount(
              ethereumPrivateKeyHex(privateKey),
            )
            if (
              getAddress(signer.address) !== getAddress(account.profile.address)
            ) {
              throw new Error('Ethereum account mismatch')
            }
            return SignatureProof.make({
              challengeId: challenge.challengeId,
              accountId: challenge.accountId,
              algorithm: 'secp256k1',
              publicIdentity: signer.address,
              signature: await signer.signMessage({
                message: { raw: `0x${hex.encode(maybeBytes.value)}` },
              }),
              encoding: 'hex',
            })
          },
          catch: deniedSignature,
        }),
      SolanaLiveNetwork: () =>
        Effect.try({
          try: () => {
            const publicIdentity = base58.encode(
              ed25519.getPublicKey(privateKey),
            )
            if (publicIdentity !== account.profile.address) {
              throw new Error('Solana account mismatch')
            }
            return SignatureProof.make({
              challengeId: challenge.challengeId,
              accountId: challenge.accountId,
              algorithm: 'ed25519',
              publicIdentity,
              signature: base58.encode(
                ed25519.sign(maybeBytes.value, privateKey),
              ),
              encoding: 'base58',
            })
          },
          catch: deniedSignature,
        }),
      SuiLiveNetwork: () =>
        Effect.tryPromise({
          try: async () => {
            const signer = Ed25519Keypair.fromSecretKey(privateKey)
            if (signer.toSuiAddress() !== account.profile.address) {
              throw new Error('Sui account mismatch')
            }
            const signed = await signer.signPersonalMessage(maybeBytes.value)
            return SignatureProof.make({
              challengeId: challenge.challengeId,
              accountId: challenge.accountId,
              algorithm: 'ed25519',
              publicIdentity: signer.toSuiAddress(),
              signature: signed.signature,
              encoding: 'base64',
            })
          },
          catch: deniedSignature,
        }),
    }),
  )
}

const verifyProofForAccount = (
  account: LocalWalletAccountCustody,
  challenge: SigningChallenge,
  proof: SignatureProof,
): Effect.Effect<boolean, WalletCryptoError> => {
  const maybeBytes = challengeBytes(challenge)
  if (
    Option.isNone(maybeBytes) ||
    proof.challengeId !== challenge.challengeId ||
    proof.accountId !== challenge.accountId ||
    proof.accountId !== account.profile.accountId
  ) {
    return Effect.succeed(false)
  }
  const privateKey = Redacted.value(account.privateKey)
  return M.value(account.configuration).pipe(
    M.withReturnType<Effect.Effect<boolean, WalletCryptoError>>(),
    M.tagsExhaustive({
      BitcoinLiveNetwork: configuration =>
        Effect.try({
          try: () => {
            const publicKey = pubECDSA(privateKey)
            return (
              proof.algorithm === 'secp256k1' &&
              proof.encoding === 'hex' &&
              proof.publicIdentity === hex.encode(publicKey) &&
              bitcoinAddress(privateKey, configuration) ===
                account.profile.address &&
              secp256k1.verify(
                hex.decode(proof.signature),
                maybeBytes.value,
                publicKey,
              )
            )
          },
          catch: verificationFailed,
        }),
      EthereumLiveNetwork: () => {
        if (
          challenge.digest.algorithm !== 'keccak256' ||
          proof.algorithm !== 'secp256k1' ||
          proof.encoding !== 'hex'
        ) {
          return Effect.succeed(false)
        }
        return Effect.tryPromise({
          try: async () => {
            const publicIdentity = getAddress(proof.publicIdentity)
            if (publicIdentity !== getAddress(account.profile.address)) {
              return false
            }
            return verifyMessage({
              address: publicIdentity,
              message: { raw: `0x${hex.encode(maybeBytes.value)}` },
              signature: S.decodeUnknownSync(
                S.TemplateLiteral(['0x', S.String]),
              )(proof.signature),
            })
          },
          catch: verificationFailed,
        })
      },
      SolanaLiveNetwork: () =>
        Effect.try({
          try: () => {
            const publicKey = ed25519.getPublicKey(privateKey)
            return (
              proof.algorithm === 'ed25519' &&
              proof.encoding === 'base58' &&
              proof.publicIdentity === account.profile.address &&
              proof.publicIdentity === base58.encode(publicKey) &&
              ed25519.verify(
                base58.decode(proof.signature),
                maybeBytes.value,
                publicKey,
              )
            )
          },
          catch: verificationFailed,
        }),
      SuiLiveNetwork: () => {
        if (
          proof.algorithm !== 'ed25519' ||
          proof.encoding !== 'base64' ||
          normalizeSuiAddress(proof.publicIdentity) !==
            normalizeSuiAddress(account.profile.address)
        ) {
          return Effect.succeed(false)
        }
        return Effect.tryPromise({
          try: async () => {
            const publicKey = await verifyPersonalMessageSignature(
              maybeBytes.value,
              proof.signature,
              { address: account.profile.address },
            )
            return publicKey.toSuiAddress() === account.profile.address
          },
          catch: verificationFailed,
        })
      },
    }),
  )
}

const makeLocalWalletServices = (
  randomBytes: WalletRandomBytes,
  storage: WalletVaultStorage,
): Effect.Effect<LocalWalletServices> =>
  Effect.gen(function* () {
    const accountById = new Map<string, LocalWalletAccountCustody>()
    const walletByRequestId = new Map<string, WalletProfile>()

    const registerWallet = (loaded: LoadedLocalWallet): void => {
      walletByRequestId.set(loaded.wallet.walletId, loaded.wallet)
      for (const account of loaded.accounts) {
        accountById.set(account.profile.accountId, account)
      }
    }

    const loadRecords = yield* Effect.cached(
      storage.loadRecords.pipe(
        Effect.flatMap(records =>
          Effect.forEach(records, encoded =>
            Effect.try({
              try: () => {
                const decoded = decodeStoredRecord(encoded)
                return {
                  ...decoded,
                  loaded: loadedWalletForRecord(decoded.record),
                }
              },
              catch: error =>
                error instanceof WalletVaultError
                  ? error
                  : invalidKeyMaterial(),
            }).pipe(
              Effect.flatMap(decoded => {
                if (decoded.isMigration) {
                  return storage
                    .saveRecord(
                      decoded.loaded.wallet.walletId,
                      encodeStoredRecord(decoded.record),
                    )
                    .pipe(Effect.as(decoded.loaded))
                } else {
                  return Effect.succeed(decoded.loaded)
                }
              }),
            ),
          ),
        ),
        Effect.flatMap(wallets =>
          Effect.sync(() => {
            for (const wallet of wallets) {
              registerWallet(wallet)
            }
          }),
        ),
      ),
    )

    const accountForSigner = (
      accountId: string,
    ): Effect.Effect<LocalWalletAccountCustody, WalletSignerError> =>
      loadRecords.pipe(
        Effect.mapError(unavailableSigner),
        Effect.flatMap(() => {
          const account = accountById.get(accountId)
          if (account === undefined) {
            return Effect.fail(unsupportedAccount())
          } else {
            return Effect.succeed(account)
          }
        }),
      )

    const vault = WalletVault.of({
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
                error instanceof WalletVaultError ? error : unavailableVault(),
            }).pipe(
              Effect.flatMap(record => {
                const loaded = loadedWalletForRecord(record)
                return Effect.uninterruptible(
                  storage
                    .saveRecord(
                      loaded.wallet.walletId,
                      encodeStoredRecord(record),
                    )
                    .pipe(
                      Effect.flatMap(() =>
                        Effect.sync(() => {
                          registerWallet(loaded)
                          return loaded.wallet
                        }),
                      ),
                    ),
                )
              }),
            )
          }),
        ),
    })

    const signer = WalletSigner.of({
      signTransaction: payload =>
        accountForSigner(payload.accountId).pipe(
          Effect.flatMap(account =>
            signTransactionForAccount(account, payload),
          ),
        ),
      signChallenge: challenge =>
        accountForSigner(challenge.accountId).pipe(
          Effect.flatMap(account =>
            signChallengeForAccount(account, challenge),
          ),
        ),
    })

    const crypto = WalletCrypto.of({
      verifySignatureProof: (challenge, proof) =>
        loadRecords.pipe(
          Effect.mapError(unavailableCrypto),
          Effect.flatMap(() => {
            const account = accountById.get(challenge.accountId)
            if (account === undefined) {
              return Effect.succeed(false)
            } else {
              return verifyProofForAccount(account, challenge, proof)
            }
          }),
        ),
    })

    return { vault, signer, crypto }
  })

/** Builds persistent Wallet vault, signer, and crypto Layers over one registry. */
export const makePersistentLocalWalletResources = (
  randomBytes: WalletRandomBytes,
  storage: WalletVaultStorage,
): Layer.Layer<WalletVault | WalletSigner | WalletCrypto> =>
  Layer.unwrap(
    makeLocalWalletServices(randomBytes, storage).pipe(
      Effect.map(services =>
        Layer.mergeAll(
          Layer.succeed(WalletVault, services.vault),
          Layer.succeed(WalletSigner, services.signer),
          Layer.succeed(WalletCrypto, services.crypto),
        ),
      ),
    ),
  )

/** Builds a persistent Wallet vault around platform entropy and record storage. */
export const makePersistentLocalWalletVault = (
  randomBytes: WalletRandomBytes,
  storage: WalletVaultStorage,
): Layer.Layer<WalletVault> =>
  Layer.unwrap(
    makeLocalWalletServices(randomBytes, storage).pipe(
      Effect.map(services => Layer.succeed(WalletVault, services.vault)),
    ),
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

/** Builds in-memory Wallet vault, signer, and crypto Layers. */
export const makeLocalWalletResources = (
  randomBytes: WalletRandomBytes,
): Layer.Layer<WalletVault | WalletSigner | WalletCrypto> =>
  makePersistentLocalWalletResources(
    randomBytes,
    makeMemoryWalletVaultStorage(),
  )

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

/** In-memory Wallet vault, signer, and crypto for ephemeral hosts. */
export const LocalWalletResources = Layer.suspend(() =>
  makeLocalWalletResources(defaultRandomBytes),
)

/** In-memory Wallet vault for ephemeral browser and Node hosts. */
export const LocalWalletVault = Layer.suspend(() =>
  makeLocalWalletVault(defaultRandomBytes),
)

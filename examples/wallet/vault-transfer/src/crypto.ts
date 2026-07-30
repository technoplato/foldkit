import {
  Context,
  Effect,
  Encoding,
  Layer,
  Redacted,
  Result,
  Schema as S,
} from 'effect'

import {
  EncryptedRelayCapsule,
  TransferClaimToken,
  type TransferClaimVerifier,
  TransferCryptoError,
  TransferReservation,
  TransferSecrets,
  TransferTicket,
} from './protocol.js'

const aes256KeyByteLength = 32
const aesGcmNonceByteLength = 12
const aesGcmAuthenticationTagByteLength = 16
const sha256ByteLength = 32
const maximumCanonicalWalletRecordByteLength = 65_536
const textEncoder = new TextEncoder()
const strictTextDecoder = new TextDecoder('utf-8', { fatal: true })
const CanonicalWalletRecord = S.Redacted(S.String.check(S.isNonEmpty()), {
  label: 'canonical-wallet-record',
  disallowJsonEncode: true,
})
const Sha256Digest = S.Uint8Array.check(
  S.isLengthBetween(sha256ByteLength, sha256ByteLength),
)
const Aes256KeyBytes = S.Uint8Array.check(
  S.isLengthBetween(aes256KeyByteLength, aes256KeyByteLength),
)
const AesGcmNonceBytes = S.Uint8Array.check(
  S.isLengthBetween(aesGcmNonceByteLength, aesGcmNonceByteLength),
)
const CanonicalWalletRecordBytes = S.Redacted(
  S.Uint8Array.check(
    S.isLengthBetween(1, maximumCanonicalWalletRecordByteLength),
  ),
  {
    label: 'wallet-transfer-plaintext',
    disallowJsonEncode: true,
  },
)

/** Secret or public bytes accepted by the SHA-256 adapter boundary. */
export type Sha256Input = Uint8Array | Redacted.Redacted<Uint8Array>

/** AES-256-GCM encryption input with Redacted key and plaintext bytes. */
export type Aes256GcmEncryptRequest = Readonly<{
  key: Redacted.Redacted<Uint8Array>
  nonce: Uint8Array
  additionalAuthenticatedData: Uint8Array
  plaintext: Redacted.Redacted<Uint8Array>
}>

/** AES-256-GCM decryption input with a detached 16-byte tag. */
export type Aes256GcmDecryptRequest = Readonly<{
  key: Redacted.Redacted<Uint8Array>
  nonce: Uint8Array
  additionalAuthenticatedData: Uint8Array
  ciphertext: Uint8Array
  authenticationTag: Uint8Array
}>

/** Expo Crypto compatible sealed bytes with ciphertext and tag kept separate. */
export const Aes256GcmSealedBytes = S.Struct({
  ciphertext: S.Uint8Array.check(
    S.isLengthBetween(1, maximumCanonicalWalletRecordByteLength),
  ),
  authenticationTag: S.Uint8Array.check(
    S.isLengthBetween(
      aesGcmAuthenticationTagByteLength,
      aesGcmAuthenticationTagByteLength,
    ),
  ),
})
/** Expo Crypto compatible sealed bytes with ciphertext and tag kept separate. */
export type Aes256GcmSealedBytes = typeof Aes256GcmSealedBytes.Type

/** Cryptographic capabilities supplied by Web Crypto, Expo Crypto, or another host. */
export type VaultTransferCryptoService = Readonly<{
  randomBytes: (
    byteLength: number,
  ) => Effect.Effect<Uint8Array, TransferCryptoError>
  sha256: (input: Sha256Input) => Effect.Effect<Uint8Array, TransferCryptoError>
  encryptAes256Gcm: (
    request: Aes256GcmEncryptRequest,
  ) => Effect.Effect<Aes256GcmSealedBytes, TransferCryptoError>
  decryptAes256Gcm: (
    request: Aes256GcmDecryptRequest,
  ) => Effect.Effect<Redacted.Redacted<Uint8Array>, TransferCryptoError>
}>

/** The host-selected cryptography adapter for Wallet vault transfer. */
export class VaultTransferCrypto extends Context.Service<
  VaultTransferCrypto,
  VaultTransferCryptoService
>()('Wallet/VaultTransferCrypto') {}

const copyBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(bytes)

const bytesFromSha256Input = (input: Sha256Input): Uint8Array =>
  Redacted.isRedacted(input) ? Redacted.value(input) : input

const invalidKeyMaterial = () =>
  new TransferCryptoError({ code: 'InvalidKeyMaterial' })

const invalidEnvelope = () =>
  new TransferCryptoError({ code: 'InvalidEnvelope' })

const cryptoUnavailable = () => new TransferCryptoError({ code: 'Unavailable' })

const validateAesKey = (
  key: Redacted.Redacted<Uint8Array>,
): Effect.Effect<Uint8Array, TransferCryptoError> => {
  const bytes = Redacted.value(key)
  if (bytes.byteLength === aes256KeyByteLength) {
    return Effect.succeed(bytes)
  }
  return Effect.fail(invalidKeyMaterial())
}

const validateNonce = (
  nonce: Uint8Array,
): Effect.Effect<Uint8Array, TransferCryptoError> => {
  if (nonce.byteLength === aesGcmNonceByteLength) {
    return Effect.succeed(nonce)
  }
  return Effect.fail(invalidEnvelope())
}

const validateTag = (
  tag: Uint8Array,
): Effect.Effect<Uint8Array, TransferCryptoError> => {
  if (tag.byteLength === aesGcmAuthenticationTagByteLength) {
    return Effect.succeed(tag)
  }
  return Effect.fail(invalidEnvelope())
}

/** Creates a Web Crypto adapter without making Web Crypto a domain dependency. */
export const makeWebCryptoVaultTransferCrypto = (
  webCrypto: Crypto,
): VaultTransferCryptoService => ({
  randomBytes: byteLength =>
    Effect.try({
      try: () => {
        if (
          !Number.isSafeInteger(byteLength) ||
          byteLength <= 0 ||
          byteLength > 65_536
        ) {
          throw new Error('Invalid random byte length')
        }
        return webCrypto.getRandomValues(new Uint8Array(byteLength))
      },
      catch: cryptoUnavailable,
    }),
  sha256: input =>
    Effect.tryPromise({
      try: async () =>
        new Uint8Array(
          await webCrypto.subtle.digest(
            'SHA-256',
            copyBytes(bytesFromSha256Input(input)),
          ),
        ),
      catch: cryptoUnavailable,
    }),
  encryptAes256Gcm: request =>
    Effect.gen(function* () {
      const keyBytes = yield* validateAesKey(request.key)
      const nonce = yield* validateNonce(request.nonce)
      const sealed = yield* Effect.tryPromise({
        try: async () => {
          const key = await webCrypto.subtle.importKey(
            'raw',
            copyBytes(keyBytes),
            { name: 'AES-GCM' },
            false,
            ['encrypt'],
          )
          return new Uint8Array(
            await webCrypto.subtle.encrypt(
              {
                name: 'AES-GCM',
                iv: copyBytes(nonce),
                additionalData: copyBytes(request.additionalAuthenticatedData),
                tagLength: aesGcmAuthenticationTagByteLength * 8,
              },
              key,
              copyBytes(Redacted.value(request.plaintext)),
            ),
          )
        },
        catch: cryptoUnavailable,
      })
      if (sealed.byteLength < aesGcmAuthenticationTagByteLength) {
        return yield* Effect.fail(cryptoUnavailable())
      }
      const ciphertextByteLength =
        sealed.byteLength - aesGcmAuthenticationTagByteLength
      return Aes256GcmSealedBytes.make({
        ciphertext: sealed.slice(0, ciphertextByteLength),
        authenticationTag: sealed.slice(ciphertextByteLength),
      })
    }),
  decryptAes256Gcm: request =>
    Effect.gen(function* () {
      const keyBytes = yield* validateAesKey(request.key)
      const nonce = yield* validateNonce(request.nonce)
      const authenticationTag = yield* validateTag(request.authenticationTag)
      const sealed = new Uint8Array(
        request.ciphertext.byteLength + authenticationTag.byteLength,
      )
      sealed.set(request.ciphertext)
      sealed.set(authenticationTag, request.ciphertext.byteLength)
      return yield* Effect.tryPromise({
        try: async () => {
          const key = await webCrypto.subtle.importKey(
            'raw',
            copyBytes(keyBytes),
            { name: 'AES-GCM' },
            false,
            ['decrypt'],
          )
          const plaintext = await webCrypto.subtle.decrypt(
            {
              name: 'AES-GCM',
              iv: copyBytes(nonce),
              additionalData: copyBytes(request.additionalAuthenticatedData),
              tagLength: aesGcmAuthenticationTagByteLength * 8,
            },
            key,
            copyBytes(sealed),
          )
          return Redacted.make(new Uint8Array(plaintext), {
            label: 'wallet-transfer-plaintext',
          })
        },
        catch: invalidEnvelope,
      })
    }),
})

/** Provides a specific Web Crypto object as the cryptography Layer. */
export const makeWebCryptoVaultTransferCryptoLayer = (webCrypto: Crypto) =>
  Layer.succeed(
    VaultTransferCrypto,
    makeWebCryptoVaultTransferCrypto(webCrypto),
  )

/** Encodes the canonical AES-GCM additional authenticated data. */
export const canonicalTransferAdditionalAuthenticatedData = (
  reservation: TransferReservation,
): Uint8Array =>
  textEncoder.encode(
    JSON.stringify([
      reservation.protocolVersion,
      reservation.environment,
      reservation.transferId,
      reservation.serverExpiresAtMs,
      reservation.ownerBinding,
    ]),
  )

/** Generates independent 256-bit AES key and claim-token material. */
export const generateTransferSecrets: Effect.Effect<
  TransferSecrets,
  TransferCryptoError,
  VaultTransferCrypto
> = Effect.gen(function* () {
  const crypto = yield* VaultTransferCrypto
  const encryptionKey = yield* crypto
    .randomBytes(aes256KeyByteLength)
    .pipe(
      Effect.flatMap(S.decodeUnknownEffect(Aes256KeyBytes)),
      Effect.mapError(cryptoUnavailable),
    )
  const claimToken = yield* crypto
    .randomBytes(sha256ByteLength)
    .pipe(
      Effect.flatMap(S.decodeUnknownEffect(Sha256Digest)),
      Effect.mapError(cryptoUnavailable),
    )
  return TransferSecrets.make({
    encryptionKey: Redacted.make(encryptionKey, {
      label: 'wallet-transfer-encryption-key',
    }),
    claimToken: Redacted.make(claimToken, {
      label: 'wallet-transfer-claim-token',
    }),
  })
})

/** Derives the relay-safe SHA-256 verifier for a secret claim token. */
export const deriveTransferClaimVerifier = (
  claimToken: Redacted.Redacted<Uint8Array>,
): Effect.Effect<
  TransferClaimVerifier,
  TransferCryptoError,
  VaultTransferCrypto
> =>
  Effect.gen(function* () {
    const validatedToken = yield* S.decodeUnknownEffect(TransferClaimToken)(
      claimToken,
    ).pipe(Effect.mapError(invalidKeyMaterial))
    const crypto = yield* VaultTransferCrypto
    const digest = yield* crypto
      .sha256(validatedToken)
      .pipe(
        Effect.flatMap(S.decodeUnknownEffect(Sha256Digest)),
        Effect.mapError(cryptoUnavailable),
      )
    return Encoding.encodeBase64Url(digest)
  })

const decodeCapsuleBytes = (
  capsule: EncryptedRelayCapsule,
): Effect.Effect<
  Readonly<{
    nonce: Uint8Array
    ciphertext: Uint8Array
    authenticationTag: Uint8Array
  }>,
  TransferCryptoError
> =>
  Effect.gen(function* () {
    const nonceResult = Encoding.decodeBase64Url(capsule.nonce)
    const ciphertextResult = Encoding.decodeBase64Url(capsule.ciphertext)
    const tagResult = Encoding.decodeBase64Url(capsule.authenticationTag)
    if (
      Result.isFailure(nonceResult) ||
      Result.isFailure(ciphertextResult) ||
      Result.isFailure(tagResult)
    ) {
      return yield* Effect.fail(invalidEnvelope())
    }
    const nonce = yield* S.decodeUnknownEffect(AesGcmNonceBytes)(
      nonceResult.success,
    ).pipe(Effect.mapError(invalidEnvelope))
    const ciphertext = yield* S.decodeUnknownEffect(
      Aes256GcmSealedBytes.fields.ciphertext,
    )(ciphertextResult.success).pipe(Effect.mapError(invalidEnvelope))
    const authenticationTag = yield* S.decodeUnknownEffect(
      Aes256GcmSealedBytes.fields.authenticationTag,
    )(tagResult.success).pipe(Effect.mapError(invalidEnvelope))
    return {
      nonce,
      ciphertext,
      authenticationTag,
    }
  })

/** Seals exactly one canonical opaque Wallet record into a relay capsule. */
export const sealCanonicalWalletRecord = (
  record: Redacted.Redacted<string>,
  ticket: TransferTicket,
  reservation: TransferReservation,
): Effect.Effect<
  EncryptedRelayCapsule,
  TransferCryptoError,
  VaultTransferCrypto
> =>
  Effect.gen(function* () {
    const validatedRecord = yield* S.decodeUnknownEffect(CanonicalWalletRecord)(
      record,
    ).pipe(Effect.mapError(invalidEnvelope))
    const validatedTicket = yield* S.decodeUnknownEffect(TransferTicket)(
      ticket,
    ).pipe(Effect.mapError(invalidEnvelope))
    const validatedReservation = yield* S.decodeUnknownEffect(
      TransferReservation,
    )(reservation).pipe(Effect.mapError(invalidEnvelope))
    if (
      validatedTicket.protocolVersion !==
        validatedReservation.protocolVersion ||
      validatedTicket.environment !== validatedReservation.environment ||
      validatedTicket.transferId !== validatedReservation.transferId ||
      validatedTicket.expiresAtHintMs !== validatedReservation.serverExpiresAtMs
    ) {
      return yield* Effect.fail(invalidEnvelope())
    }
    const crypto = yield* VaultTransferCrypto
    const nonce = yield* crypto
      .randomBytes(aesGcmNonceByteLength)
      .pipe(
        Effect.flatMap(S.decodeUnknownEffect(AesGcmNonceBytes)),
        Effect.mapError(cryptoUnavailable),
      )
    const plaintext = Redacted.make(
      textEncoder.encode(Redacted.value(validatedRecord)),
      { label: 'wallet-transfer-plaintext' },
    )
    return yield* Effect.gen(function* () {
      const validatedPlaintext = yield* S.decodeUnknownEffect(
        CanonicalWalletRecordBytes,
      )(plaintext).pipe(Effect.mapError(invalidEnvelope))
      const sealed = yield* crypto
        .encryptAes256Gcm({
          key: validatedTicket.encryptionKey,
          nonce,
          additionalAuthenticatedData:
            canonicalTransferAdditionalAuthenticatedData(validatedReservation),
          plaintext: validatedPlaintext,
        })
        .pipe(
          Effect.flatMap(S.decodeUnknownEffect(Aes256GcmSealedBytes)),
          Effect.mapError(cryptoUnavailable),
        )
      return yield* S.decodeUnknownEffect(EncryptedRelayCapsule)({
        protocolVersion: validatedReservation.protocolVersion,
        environment: validatedReservation.environment,
        transferId: validatedReservation.transferId,
        serverExpiresAtMs: validatedReservation.serverExpiresAtMs,
        ownerBinding: validatedReservation.ownerBinding,
        nonce: Encoding.encodeBase64Url(nonce),
        ciphertext: Encoding.encodeBase64Url(sealed.ciphertext),
        authenticationTag: Encoding.encodeBase64Url(sealed.authenticationTag),
      }).pipe(Effect.mapError(invalidEnvelope))
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          Redacted.wipeUnsafe(plaintext)
        }),
      ),
    )
  })

/** Opens a fully validated capsule and returns one Redacted canonical record. */
export const openCanonicalWalletRecord = (
  ticket: TransferTicket,
  capsule: EncryptedRelayCapsule,
): Effect.Effect<
  Redacted.Redacted<string>,
  TransferCryptoError,
  VaultTransferCrypto
> =>
  Effect.gen(function* () {
    const validatedTicket = yield* S.decodeUnknownEffect(TransferTicket)(
      ticket,
    ).pipe(Effect.mapError(invalidEnvelope))
    const validatedCapsule = yield* S.decodeUnknownEffect(
      EncryptedRelayCapsule,
    )(capsule).pipe(Effect.mapError(invalidEnvelope))
    if (
      validatedTicket.protocolVersion !== validatedCapsule.protocolVersion ||
      validatedTicket.environment !== validatedCapsule.environment ||
      validatedTicket.transferId !== validatedCapsule.transferId ||
      validatedTicket.expiresAtHintMs !== validatedCapsule.serverExpiresAtMs
    ) {
      return yield* Effect.fail(invalidEnvelope())
    }
    const bytes = yield* decodeCapsuleBytes(validatedCapsule)
    const crypto = yield* VaultTransferCrypto
    const plaintext = yield* crypto.decryptAes256Gcm({
      key: validatedTicket.encryptionKey,
      nonce: bytes.nonce,
      additionalAuthenticatedData:
        canonicalTransferAdditionalAuthenticatedData(validatedCapsule),
      ciphertext: bytes.ciphertext,
      authenticationTag: bytes.authenticationTag,
    })
    return yield* Effect.gen(function* () {
      const validatedPlaintext = yield* S.decodeUnknownEffect(
        CanonicalWalletRecordBytes,
      )(plaintext).pipe(Effect.mapError(invalidEnvelope))
      const record = yield* Effect.try({
        try: () => strictTextDecoder.decode(Redacted.value(validatedPlaintext)),
        catch: invalidEnvelope,
      })
      if (record.length === 0) {
        return yield* Effect.fail(invalidEnvelope())
      }
      return Redacted.make(record, { label: 'canonical-wallet-record' })
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (Redacted.isRedacted(plaintext)) {
            Redacted.wipeUnsafe(plaintext)
          }
        }),
      ),
    )
  })

import { Array, Effect, Option, String } from 'effect'

const WORD_BYTES = 4
const SHA1_BLOCK_BYTES = 64
const SHA1_LENGTH_BYTES = 8
const SHA1_MESSAGE_WORDS = 16
const SHA1_SCHEDULE_WORDS = 80
const SHA1_ROUND_LENGTH = 20
const SHA1_PADDING_MARKER = 0x80
const UUID_BYTES = 16
const VERSION_BYTE = 6
const VARIANT_BYTE = 8
const VERSION_5 = 0x50
const VERSION_4 = 0x40
const VERSION_CLEAR = 0x0f
const VARIANT_RFC_4122 = 0x80
const VARIANT_CLEAR = 0x3f
const HEX_RADIX = 16
const BITS_PER_BYTE = 8
const TWO_TO_THE_32 = 2 ** 32

const SHA1_INITIAL_STATE: ReadonlyArray<number> = [
  0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0,
]
const SHA1_ROUND_CONSTANTS: ReadonlyArray<number> = [
  0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6,
]

type Sha1State = readonly [number, number, number, number, number]

const wordAt = (words: ReadonlyArray<number>, index: number): number =>
  Option.getOrElse(Array.get(words, index), () => 0)

const rotateLeft = (value: number, bits: number): number =>
  ((value << bits) | (value >>> (32 - bits))) >>> 0

const roundFunction = (round: number, b: number, c: number, d: number) => {
  if (round < SHA1_ROUND_LENGTH) {
    return (b & c) | (~b & d)
  } else if (round < 2 * SHA1_ROUND_LENGTH) {
    return b ^ c ^ d
  } else if (round < 3 * SHA1_ROUND_LENGTH) {
    return (b & c) | (b & d) | (c & d)
  } else {
    return b ^ c ^ d
  }
}

const paddedMessage = (bytes: Uint8Array): DataView => {
  const paddedLength =
    Math.ceil((bytes.length + 1 + SHA1_LENGTH_BYTES) / SHA1_BLOCK_BYTES) *
    SHA1_BLOCK_BYTES
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  const view = new DataView(padded.buffer)
  const bitLength = bytes.length * BITS_PER_BYTE
  view.setUint8(bytes.length, SHA1_PADDING_MARKER)
  view.setUint32(
    paddedLength - SHA1_LENGTH_BYTES,
    Math.floor(bitLength / TWO_TO_THE_32),
  )
  view.setUint32(paddedLength - WORD_BYTES, bitLength >>> 0)
  return view
}

const scheduleOf = (
  view: DataView,
  blockOffset: number,
): ReadonlyArray<number> =>
  Array.reduce(
    Array.range(0, SHA1_SCHEDULE_WORDS - 1),
    Array.empty<number>(),
    (words, index) => [
      ...words,
      index < SHA1_MESSAGE_WORDS
        ? view.getUint32(blockOffset + index * WORD_BYTES)
        : rotateLeft(
            wordAt(words, index - 3) ^
              wordAt(words, index - 8) ^
              wordAt(words, index - 14) ^
              wordAt(words, index - 16),
            1,
          ),
    ],
  )

const compressBlock = (
  state: Sha1State,
  schedule: ReadonlyArray<number>,
): Sha1State => {
  const [a, b, c, d, e] = Array.reduce(
    Array.range(0, SHA1_SCHEDULE_WORDS - 1),
    state,
    ([wa, wb, wc, wd, we], round): Sha1State => [
      (rotateLeft(wa, 5) +
        roundFunction(round, wb, wc, wd) +
        we +
        wordAt(SHA1_ROUND_CONSTANTS, Math.floor(round / SHA1_ROUND_LENGTH)) +
        wordAt(schedule, round)) >>>
        0,
      wa,
      rotateLeft(wb, 30),
      wc,
      wd,
    ],
  )
  const [s0, s1, s2, s3, s4] = state
  return [
    (s0 + a) >>> 0,
    (s1 + b) >>> 0,
    (s2 + c) >>> 0,
    (s3 + d) >>> 0,
    (s4 + e) >>> 0,
  ]
}

const initialSha1State: Sha1State = [
  wordAt(SHA1_INITIAL_STATE, 0),
  wordAt(SHA1_INITIAL_STATE, 1),
  wordAt(SHA1_INITIAL_STATE, 2),
  wordAt(SHA1_INITIAL_STATE, 3),
  wordAt(SHA1_INITIAL_STATE, 4),
]

/**
 * SHA-1 of `bytes`, computed synchronously so ids derived from it stay pure.
 * Only for RFC 4122 version 5 UUIDs, which are defined over SHA-1.
 */
export const sha1 = (bytes: Uint8Array): Uint8Array => {
  const view = paddedMessage(bytes)
  const blockOffsets = Array.makeBy(
    view.byteLength / SHA1_BLOCK_BYTES,
    index => index * SHA1_BLOCK_BYTES,
  )
  const state = Array.reduce(
    blockOffsets,
    initialSha1State,
    (current, offset) => compressBlock(current, scheduleOf(view, offset)),
  )
  const digest = new DataView(new ArrayBuffer(state.length * WORD_BYTES))
  state.forEach((word, index) => digest.setUint32(index * WORD_BYTES, word))
  return new Uint8Array(digest.buffer)
}

const uuidBytesOf = (uuid: string): Uint8Array => {
  const hex = uuid.toLowerCase().replaceAll('-', '')
  return Uint8Array.from(
    Array.makeBy(UUID_BYTES, index =>
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), HEX_RADIX),
    ),
  )
}

const formatUUID = (bytes: Uint8Array): string => {
  const hex = Array.join(
    Array.map(Array.fromIterable(bytes), byte =>
      String.padStart(2, '0')(byte.toString(HEX_RADIX)),
    ),
    '',
  )
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const stampVersion = (digest: Uint8Array, version: number): Uint8Array => {
  const bytes = digest.slice(0, UUID_BYTES)
  const view = new DataView(bytes.buffer)
  view.setUint8(
    VERSION_BYTE,
    (view.getUint8(VERSION_BYTE) & VERSION_CLEAR) | version,
  )
  view.setUint8(
    VARIANT_BYTE,
    (view.getUint8(VARIANT_BYTE) & VARIANT_CLEAR) | VARIANT_RFC_4122,
  )
  return bytes
}

/**
 * The RFC 4122 version 5 UUID of `name` in `namespace`, lowercase.
 *
 * @example
 * ```ts
 * uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')
 * // '2ed6657d-e927-568b-95e1-2665a8aea6a2'
 * ```
 */
export const uuidV5 = (namespace: string, name: string): string => {
  const nameBytes = new TextEncoder().encode(name)
  const input = new Uint8Array(UUID_BYTES + nameBytes.length)
  input.set(uuidBytesOf(namespace))
  input.set(nameBytes, UUID_BYTES)
  return formatUUID(stampVersion(sha1(input), VERSION_5))
}

const realtimeTranscriptionNamespace = '2d9d3dca-4f3d-4d80-8f7d-3f0ef45e6e6d'

/** The live transcription configuration stamped on a `transcriptions` row. */
export type TranscriptionConfiguration = Readonly<{
  sampleRate: number
  channels: number
  language: string
  diarizationEnabled: boolean
}>

const slugOf = (text: string): string => {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'default' : slug
}

const canonicalConfigurationJSON = (
  configuration: TranscriptionConfiguration,
): string =>
  JSON.stringify({
    channels: configuration.channels,
    diarizationEnabled: configuration.diarizationEnabled,
    language: configuration.language,
    sampleRate: configuration.sampleRate,
  })

/**
 * The `transcriptions` id for a recording, derived the way the iPhone derives
 * it (`ScribeSharedRealtimeTranscription.transcriptionID`): a version 5 UUID
 * of the recording id, provider, configuration name, and configuration JSON.
 */
export const transcriptionIDOf = (
  recordingID: string,
  provider: string,
  configurationName: string,
  configuration: TranscriptionConfiguration,
): string =>
  uuidV5(
    realtimeTranscriptionNamespace,
    Array.join(
      [
        recordingID.toLowerCase(),
        slugOf(provider),
        slugOf(configurationName),
        canonicalConfigurationJSON(configuration),
      ],
      '\u001F',
    ),
  )

/** A web transcript section's id: the same recording and index always give the same id. */
export const segmentIDOf = (
  recordingID: string,
  segmentIndex: number,
): string => uuidV5(recordingID, `scribe-web-segment:${segmentIndex}`)

/**
 * The lifecycle key the iPhone stamps on a recording's media: `v1:<id>:<ms>`,
 * where `ms` is the recording's start in whole milliseconds.
 */
export const lifecycleIDOf = (
  recordingID: string,
  startedAtMs: number,
): string => `v1:${recordingID.toLowerCase()}:${Math.round(startedAtMs)}`

/** Where a recording's audio lives in Instant storage, as the iPhone names it. */
export const audioStoragePathOf = (
  recordingID: string,
  startedAtMs: number,
): string =>
  `scribe/${recordingID.toLowerCase()}/generation-${Math.round(startedAtMs)}/audio.wav`

/**
 * A stable id for `seed`, as Scribe derives stable ids
 * (`ScribeRecordingLibrary.stableUUID`): the first 16 bytes of SHA-256 of the
 * seed, stamped as a version 4 UUID, so every device writes the same row.
 */
export const stableUUIDOf = (seed: string): Effect.Effect<string> =>
  Effect.promise(() =>
    globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)),
  ).pipe(
    Effect.map(digest =>
      formatUUID(stampVersion(new Uint8Array(digest), VERSION_4)),
    ),
  )

/**
 * The attachment id the iPhone derives for a recording's media
 * (`ScribeRecordingLibrary.attachmentID`): the stable id of
 * `scribe-recording-attachment:<lifecycle>:<kind>:<media id>`. The audio's
 * media id is `audio`.
 */
export const attachmentIDOf = (
  lifecycleID: string,
  kind: string,
  mediaID: string,
): Effect.Effect<string> =>
  stableUUIDOf(
    `scribe-recording-attachment:${lifecycleID}:${kind}:${mediaID.toLowerCase()}`,
  )

/**
 * A share recipient row's id (ADR 0014): the stable id of
 * `scribe-share-recipient:<owner>:<email>`, one row per sharer and email.
 */
export const shareRecipientIDOf = (
  ownerUserID: string,
  email: string,
): Effect.Effect<string> =>
  stableUUIDOf(
    `scribe-share-recipient:${ownerUserID}:${email.trim().toLowerCase()}`,
  )

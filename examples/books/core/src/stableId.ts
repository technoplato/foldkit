import { Array, Option, String, pipe } from 'effect'

// STABLE ID

const roundConstants: ReadonlyArray<number> = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

/** SHA-256's eight working words, a to h. */
type Words = Readonly<{
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
  g: number
  h: number
}>

const initialWords: Words = {
  a: 0x6a09e667,
  b: 0xbb67ae85,
  c: 0x3c6ef372,
  d: 0xa54ff53a,
  e: 0x510e527f,
  f: 0x9b05688c,
  g: 0x1f83d9ab,
  h: 0x5be0cd19,
}

const bitsPerByte = 8
const blockBytes = 64
const lengthFieldBytes = 8
const bytesPerWord = 4
const wordsPerBlock = 16
const roundCount = 64
const firstPaddingByte = 0x80

const rotateRight = (word: number, bits: number): number =>
  (word >>> bits) | (word << (32 - bits))

const padded = (bytes: Uint8Array): DataView => {
  const paddedLength =
    Math.ceil((bytes.length + 1 + lengthFieldBytes) / blockBytes) * blockBytes
  const view = new DataView(new ArrayBuffer(paddedLength))
  bytes.forEach((byte, index) => view.setUint8(index, byte))
  view.setUint8(bytes.length, firstPaddingByte)
  const bitLength = bytes.length * bitsPerByte
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 2 ** 32))
  view.setUint32(paddedLength - 4, bitLength >>> 0)
  return view
}

const wordAt = (words: ReadonlyArray<number>, index: number): number =>
  Option.getOrElse(Array.get(words, index), () => 0)

const scheduleOf = (
  view: DataView,
  blockOffset: number,
): ReadonlyArray<number> =>
  Array.reduce(
    Array.range(wordsPerBlock, roundCount - 1),
    Array.makeBy(wordsPerBlock, index =>
      view.getUint32(blockOffset + index * bytesPerWord),
    ),
    (words, index) => {
      const before15 = wordAt(words, index - 15)
      const before2 = wordAt(words, index - 2)
      const sigma0 =
        rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3)
      const sigma1 =
        rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10)
      return Array.append(
        words,
        (wordAt(words, index - 16) +
          sigma0 +
          wordAt(words, index - 7) +
          sigma1) >>>
          0,
      )
    },
  )

const round = (words: Words, constant: number, scheduled: number): Words => {
  const { a, b, c, d, e, f, g, h } = words
  const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
  const choice = (e & f) ^ (~e & g)
  const first = (h + sum1 + choice + constant + scheduled) >>> 0
  const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
  const majority = (a & b) ^ (a & c) ^ (b & c)
  const second = (sum0 + majority) >>> 0
  return {
    a: (first + second) >>> 0,
    b: a,
    c: b,
    d: c,
    e: (d + first) >>> 0,
    f: e,
    g: f,
    h: g,
  }
}

const added = (self: Words, that: Words): Words => ({
  a: (self.a + that.a) >>> 0,
  b: (self.b + that.b) >>> 0,
  c: (self.c + that.c) >>> 0,
  d: (self.d + that.d) >>> 0,
  e: (self.e + that.e) >>> 0,
  f: (self.f + that.f) >>> 0,
  g: (self.g + that.g) >>> 0,
  h: (self.h + that.h) >>> 0,
})

const hexOf = (word: number): string =>
  String.padStart(8, '0')(word.toString(16))

/**
 * SHA-256 of a string's UTF-8 bytes, as 64 lowercase hex characters. Pure
 * and synchronous, so a stable id is the same in a browser, a terminal, and
 * a test.
 *
 * @example
 * ```typescript
 * sha256Hex('abc') // 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
 * ```
 */
export const sha256Hex = (text: string): string => {
  const view = padded(new TextEncoder().encode(text))
  const digest = Array.reduce(
    Array.makeBy(view.byteLength / blockBytes, block => block * blockBytes),
    initialWords,
    (words, blockOffset) =>
      added(
        words,
        Array.reduce(
          Array.zip(roundConstants, scheduleOf(view, blockOffset)),
          words,
          (current, [constant, scheduled]) =>
            round(current, constant, scheduled),
        ),
      ),
  )
  return pipe(
    [
      digest.a,
      digest.b,
      digest.c,
      digest.d,
      digest.e,
      digest.f,
      digest.g,
      digest.h,
    ],
    Array.map(hexOf),
    Array.join(''),
  )
}

const versionBits = 0x50
const variantBits = 0x80

const withBits = (hexByte: string, mask: number, bits: number): string =>
  String.padStart(2, '0')(((parseInt(hexByte, 16) & mask) | bits).toString(16))

/**
 * A UUID with version-5 bits from the first 16 bytes of SHA-256 of `name`:
 * ADR 0048's construction, the YouTube companion's and Scribe Videos'
 * `stableUUID`, so Books names a row the way every other writer of
 * Scribe's timeline would.
 *
 * @example
 * ```typescript
 * stableUUID('abc') // 'ba7816bf-8f01-5fea-8141-40de5dae2223'
 * ```
 */
export const stableUUID = (name: string): string => {
  const hex = sha256Hex(name)
  const marked = `${hex.slice(0, 12)}${withBits(hex.slice(12, 14), 0x0f, versionBits)}${hex.slice(14, 16)}${withBits(hex.slice(16, 18), 0x3f, variantBits)}${hex.slice(18, 32)}`
  return Array.join(
    [
      marked.slice(0, 8),
      marked.slice(8, 12),
      marked.slice(12, 16),
      marked.slice(16, 20),
      marked.slice(20, 32),
    ],
    '-',
  )
}

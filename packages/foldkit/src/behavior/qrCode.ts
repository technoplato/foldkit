import { Array, Data, Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  define,
  forStates,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import { ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import {
  Device,
  type DeviceReason,
  Settled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core QrCode Part (Widget #54 of 54, Scribe #2693). It
// ships a self-contained ISO/IEC 18004 QR Code matrix encoder in pure
// TypeScript (Byte mode, Versions 1..10 auto-fit, Error Correction Levels
// L/M/Q/H, GF(256) Reed-Solomon multi-block interleaving, finder/alignment/
// timing/dark-module placement, 8-mask penalty evaluation, BCH format and
// version info bits, and SVG path / viewBox / ASCII projections) with zero
// DOM, canvas, or third-party dependencies.

// CONSTANTS

/** Default error correction level (`'M'`, ~15% recovery capacity). */
export const defaultErrorCorrectionLevel: ErrorCorrectionLevel = 'M'

/** Default typing-pause settle window for `SetQrCodeValue` in milliseconds (`200`). */
export const defaultSettleMs = 200

/** Minimum supported QR Code version (`1`, 21x21 modules). */
export const minSupportedVersion = 1

/** Maximum supported QR Code version (`10`, 57x57 modules). */
export const maxSupportedVersion = 10

/** Default SVG module size in viewBox units (`1`). */
export const defaultModuleSize = 1

/** Default quiet-zone margin in modules for SVG/viewBox rendering (`0`). */
export const defaultQuietZone = 0

// SCHEMAS

/** ISO/IEC 18004 error correction level (`'L'`, `'M'`, `'Q'`, or `'H'`). */
export const ErrorCorrectionLevel = S.Literals(['L', 'M', 'Q', 'H'])
/** ISO/IEC 18004 error correction level. */
export type ErrorCorrectionLevel = typeof ErrorCorrectionLevel.Type

/** Standard `data-state` marker for QrCode (`'empty' | 'ready' | 'error'`). */
export const DataState = S.Literals(['empty', 'ready', 'error'])
/** Standard `data-state` marker for QrCode. */
export type DataState = typeof DataState.Type

/** Encoded QR Code matrix: version (`1..10`), side length `size` (`4 * version + 17`), and boolean dark-module grid. */
export const QrMatrix = S.Struct({
  version: S.Number,
  size: S.Number,
  modules: S.Array(S.Array(S.Boolean)),
})
/** Encoded QR Code matrix. */
export type QrMatrix = typeof QrMatrix.Type

/**
 * Read-only configuration supplied to the QrCode chart and projection from
 * the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  level: S.optionalKey(ErrorCorrectionLevel),
  moduleSize: S.optionalKey(S.Number),
  quietZone: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  downloadLabel: S.optionalKey(S.String),
  settleMs: S.optionalKey(S.Number),
})
/** Read-only configuration supplied to the QrCode chart and projection. */
export type Props = typeof Props.Type

/** Error raised by {@link encodeQrMatrix} when a payload exceeds Version 10 byte capacity. */
export class QrCodeCapacityError extends Data.TaggedError(
  'QrCodeCapacityError',
)<{
  readonly byteLength: number
  readonly maxBytes: number
  readonly level: ErrorCorrectionLevel
  readonly message: string
}> {}

// ISO/IEC 18004 QR CODE ENCODER (VERSIONS 1..10, BYTE MODE, GF(256) REED-SOLOMON)

type EcBlockSpec = Readonly<{
  version: number
  totalDataCodewords: number
  ecPerBlock: number
  group1Blocks: number
  group1Data: number
  group2Blocks: number
  group2Data: number
}>

const ecTable: Readonly<
  Record<ErrorCorrectionLevel, ReadonlyArray<EcBlockSpec>>
> = {
  L: [
    {
      version: 1,
      totalDataCodewords: 19,
      ecPerBlock: 7,
      group1Blocks: 1,
      group1Data: 19,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 2,
      totalDataCodewords: 34,
      ecPerBlock: 10,
      group1Blocks: 1,
      group1Data: 34,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 3,
      totalDataCodewords: 55,
      ecPerBlock: 15,
      group1Blocks: 1,
      group1Data: 55,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 4,
      totalDataCodewords: 80,
      ecPerBlock: 20,
      group1Blocks: 1,
      group1Data: 80,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 5,
      totalDataCodewords: 108,
      ecPerBlock: 26,
      group1Blocks: 1,
      group1Data: 108,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 6,
      totalDataCodewords: 136,
      ecPerBlock: 18,
      group1Blocks: 2,
      group1Data: 68,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 7,
      totalDataCodewords: 156,
      ecPerBlock: 20,
      group1Blocks: 2,
      group1Data: 78,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 8,
      totalDataCodewords: 194,
      ecPerBlock: 24,
      group1Blocks: 2,
      group1Data: 97,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 9,
      totalDataCodewords: 232,
      ecPerBlock: 30,
      group1Blocks: 2,
      group1Data: 116,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 10,
      totalDataCodewords: 274,
      ecPerBlock: 18,
      group1Blocks: 2,
      group1Data: 68,
      group2Blocks: 2,
      group2Data: 69,
    },
  ],
  M: [
    {
      version: 1,
      totalDataCodewords: 16,
      ecPerBlock: 10,
      group1Blocks: 1,
      group1Data: 16,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 2,
      totalDataCodewords: 28,
      ecPerBlock: 16,
      group1Blocks: 1,
      group1Data: 28,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 3,
      totalDataCodewords: 44,
      ecPerBlock: 26,
      group1Blocks: 1,
      group1Data: 44,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 4,
      totalDataCodewords: 64,
      ecPerBlock: 18,
      group1Blocks: 2,
      group1Data: 32,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 5,
      totalDataCodewords: 86,
      ecPerBlock: 24,
      group1Blocks: 2,
      group1Data: 43,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 6,
      totalDataCodewords: 108,
      ecPerBlock: 16,
      group1Blocks: 4,
      group1Data: 27,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 7,
      totalDataCodewords: 124,
      ecPerBlock: 18,
      group1Blocks: 4,
      group1Data: 31,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 8,
      totalDataCodewords: 154,
      ecPerBlock: 22,
      group1Blocks: 2,
      group1Data: 38,
      group2Blocks: 2,
      group2Data: 39,
    },
    {
      version: 9,
      totalDataCodewords: 182,
      ecPerBlock: 22,
      group1Blocks: 3,
      group1Data: 36,
      group2Blocks: 2,
      group2Data: 37,
    },
    {
      version: 10,
      totalDataCodewords: 216,
      ecPerBlock: 26,
      group1Blocks: 4,
      group1Data: 43,
      group2Blocks: 1,
      group2Data: 44,
    },
  ],
  Q: [
    {
      version: 1,
      totalDataCodewords: 13,
      ecPerBlock: 13,
      group1Blocks: 1,
      group1Data: 13,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 2,
      totalDataCodewords: 22,
      ecPerBlock: 22,
      group1Blocks: 1,
      group1Data: 22,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 3,
      totalDataCodewords: 34,
      ecPerBlock: 18,
      group1Blocks: 2,
      group1Data: 17,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 4,
      totalDataCodewords: 48,
      ecPerBlock: 26,
      group1Blocks: 2,
      group1Data: 24,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 5,
      totalDataCodewords: 62,
      ecPerBlock: 18,
      group1Blocks: 2,
      group1Data: 15,
      group2Blocks: 2,
      group2Data: 16,
    },
    {
      version: 6,
      totalDataCodewords: 76,
      ecPerBlock: 24,
      group1Blocks: 4,
      group1Data: 19,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 7,
      totalDataCodewords: 88,
      ecPerBlock: 18,
      group1Blocks: 2,
      group1Data: 14,
      group2Blocks: 4,
      group2Data: 15,
    },
    {
      version: 8,
      totalDataCodewords: 110,
      ecPerBlock: 22,
      group1Blocks: 4,
      group1Data: 18,
      group2Blocks: 2,
      group2Data: 19,
    },
    {
      version: 9,
      totalDataCodewords: 132,
      ecPerBlock: 20,
      group1Blocks: 4,
      group1Data: 16,
      group2Blocks: 4,
      group2Data: 17,
    },
    {
      version: 10,
      totalDataCodewords: 154,
      ecPerBlock: 24,
      group1Blocks: 6,
      group1Data: 19,
      group2Blocks: 2,
      group2Data: 20,
    },
  ],
  H: [
    {
      version: 1,
      totalDataCodewords: 9,
      ecPerBlock: 17,
      group1Blocks: 1,
      group1Data: 9,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 2,
      totalDataCodewords: 16,
      ecPerBlock: 28,
      group1Blocks: 1,
      group1Data: 16,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 3,
      totalDataCodewords: 26,
      ecPerBlock: 22,
      group1Blocks: 2,
      group1Data: 13,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 4,
      totalDataCodewords: 36,
      ecPerBlock: 16,
      group1Blocks: 4,
      group1Data: 9,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 5,
      totalDataCodewords: 46,
      ecPerBlock: 22,
      group1Blocks: 2,
      group1Data: 11,
      group2Blocks: 2,
      group2Data: 12,
    },
    {
      version: 6,
      totalDataCodewords: 60,
      ecPerBlock: 28,
      group1Blocks: 4,
      group1Data: 15,
      group2Blocks: 0,
      group2Data: 0,
    },
    {
      version: 7,
      totalDataCodewords: 66,
      ecPerBlock: 26,
      group1Blocks: 4,
      group1Data: 13,
      group2Blocks: 1,
      group2Data: 14,
    },
    {
      version: 8,
      totalDataCodewords: 86,
      ecPerBlock: 26,
      group1Blocks: 4,
      group1Data: 14,
      group2Blocks: 2,
      group2Data: 15,
    },
    {
      version: 9,
      totalDataCodewords: 100,
      ecPerBlock: 24,
      group1Blocks: 4,
      group1Data: 12,
      group2Blocks: 4,
      group2Data: 13,
    },
    {
      version: 10,
      totalDataCodewords: 122,
      ecPerBlock: 28,
      group1Blocks: 6,
      group1Data: 15,
      group2Blocks: 2,
      group2Data: 16,
    },
  ],
}

const alignmentCentersByVersion: ReadonlyArray<ReadonlyArray<number>> = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
]

const formatEcBitsOf = (level: ErrorCorrectionLevel): number =>
  M.value(level).pipe(
    M.withReturnType<number>(),
    M.when('L', () => 1),
    M.when('M', () => 0),
    M.when('Q', () => 3),
    M.when('H', () => 2),
    M.exhaustive,
  )

const byteCountBitsOf = (version: number): number => (version >= 10 ? 16 : 8)

const byteCapacityOfSpec = (spec: EcBlockSpec): number =>
  Math.floor(
    (spec.totalDataCodewords * 8 - 4 - byteCountBitsOf(spec.version)) / 8,
  )

/** Maximum UTF-8 byte length supported at `level` across Versions 1..10. */
export const maxByteCapacityOf = (
  level: ErrorCorrectionLevel = defaultErrorCorrectionLevel,
): number =>
  Option.match(Array.last(ecTable[level]), {
    onNone: () => 0,
    onSome: byteCapacityOfSpec,
  })

/** Encodes a JavaScript string into UTF-8 byte values (`0..255`) without relying on host globals. */
export const utf8BytesOf = (text: string): ReadonlyArray<number> => {
  const bytes: Array<number> = []
  for (const char of text) {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined) {
      continue
    } else if (codePoint <= 0x7f) {
      bytes.push(codePoint)
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f))
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >>> 12),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      )
    } else {
      bytes.push(
        0xf0 | (codePoint >>> 18),
        0x80 | ((codePoint >>> 12) & 0x3f),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      )
    }
  }
  return bytes
}

const byteAt = (bytes: ReadonlyArray<number>, index: number): number =>
  Option.getOrElse(Array.get(bytes, index), () => 0)

const gfPrimitivePolynomial = 0x11d
const gfByteWidth = 8
const gfHighBit = 0x80
const gfByteMask = 0xff

/** Multiplies two GF(256) elements modulo the QR primitive polynomial `0x11d`. */
const gfMul = (left: number, right: number): number => {
  let product = 0
  let factor = left & gfByteMask
  let multiplier = right & gfByteMask
  for (let bit = 0; bit < gfByteWidth; bit += 1) {
    if ((multiplier & 1) === 1) {
      product ^= factor
    }
    const carries = (factor & gfHighBit) !== 0
    factor = (factor << 1) & gfByteMask
    if (carries) {
      factor ^= gfPrimitivePolynomial & gfByteMask
    }
    multiplier >>>= 1
  }
  return product
}

/** Computes the monic Reed-Solomon generator polynomial coefficients (excluding leading `1`) for `degree` EC bytes. */
const rsGeneratorOf = (degree: number): ReadonlyArray<number> => {
  let poly: ReadonlyArray<number> = [1]
  let root = 1
  for (let step = 0; step < degree; step += 1) {
    const nextLength = poly.length + 1
    const nextMap = new Map<number, number>()
    for (let index = 0; index < poly.length; index += 1) {
      const coeff = byteAt(poly, index)
      nextMap.set(index, (nextMap.get(index) ?? 0) ^ coeff)
      nextMap.set(index + 1, (nextMap.get(index + 1) ?? 0) ^ gfMul(coeff, root))
    }
    poly = Array.makeBy(nextLength, index => nextMap.get(index) ?? 0)
    root = gfMul(root, 2)
  }
  return Array.drop(poly, 1)
}

/** Computes `ecPerBlock` Reed-Solomon error-correction codewords for one data block. */
const rsErrorCorrectionOf = (
  data: ReadonlyArray<number>,
  ecPerBlock: number,
): ReadonlyArray<number> => {
  const generator = rsGeneratorOf(ecPerBlock)
  let remainder: ReadonlyArray<number> = Array.makeBy(ecPerBlock, () => 0)
  for (const byte of data) {
    const factor = byte ^ byteAt(remainder, 0)
    remainder = Array.makeBy(ecPerBlock, index => {
      const shifted = index + 1 < ecPerBlock ? byteAt(remainder, index + 1) : 0
      return shifted ^ gfMul(byteAt(generator, index), factor)
    })
  }
  return remainder
}

const padByteEven = 0xec
const padByteOdd = 0x11
const byteModeIndicator = 0x4
const modeIndicatorBits = 4
const maxTerminatorBits = 4

const buildDataCodewords = (
  bytes: ReadonlyArray<number>,
  spec: EcBlockSpec,
): ReadonlyArray<number> => {
  const bits: Array<number> = []
  const pushBits = (value: number, width: number): void => {
    for (let shift = width - 1; shift >= 0; shift -= 1) {
      bits.push((value >>> shift) & 1)
    }
  }

  pushBits(byteModeIndicator, modeIndicatorBits)
  pushBits(bytes.length, byteCountBitsOf(spec.version))
  for (const byte of bytes) {
    pushBits(byte, gfByteWidth)
  }

  const capacityBits = spec.totalDataCodewords * gfByteWidth
  const terminatorBits = Math.min(maxTerminatorBits, capacityBits - bits.length)
  for (let step = 0; step < terminatorBits; step += 1) {
    bits.push(0)
  }
  while (bits.length % gfByteWidth !== 0) {
    bits.push(0)
  }

  const codewords: Array<number> = []
  for (let offset = 0; offset < bits.length; offset += gfByteWidth) {
    let byte = 0
    for (let bit = 0; bit < gfByteWidth; bit += 1) {
      byte = (byte << 1) | byteAt(bits, offset + bit)
    }
    codewords.push(byte)
  }

  let padIndex = 0
  while (codewords.length < spec.totalDataCodewords) {
    codewords.push(padIndex % 2 === 0 ? padByteEven : padByteOdd)
    padIndex += 1
  }
  return codewords
}

const interleaveCodewords = (
  dataCodewords: ReadonlyArray<number>,
  spec: EcBlockSpec,
): ReadonlyArray<number> => {
  const blocks: Array<
    Readonly<{ data: ReadonlyArray<number>; ec: ReadonlyArray<number> }>
  > = []
  let offset = 0
  for (let block = 0; block < spec.group1Blocks; block += 1) {
    const slice = dataCodewords.slice(offset, offset + spec.group1Data)
    offset += spec.group1Data
    blocks.push({
      data: slice,
      ec: rsErrorCorrectionOf(slice, spec.ecPerBlock),
    })
  }
  for (let block = 0; block < spec.group2Blocks; block += 1) {
    const slice = dataCodewords.slice(offset, offset + spec.group2Data)
    offset += spec.group2Data
    blocks.push({
      data: slice,
      ec: rsErrorCorrectionOf(slice, spec.ecPerBlock),
    })
  }

  const maxDataLength = Math.max(spec.group1Data, spec.group2Data)
  const interleaved: Array<number> = []
  for (let index = 0; index < maxDataLength; index += 1) {
    for (const block of blocks) {
      const maybeByte = Array.get(block.data, index)
      if (Option.isSome(maybeByte)) {
        interleaved.push(maybeByte.value)
      }
    }
  }
  for (let index = 0; index < spec.ecPerBlock; index += 1) {
    for (const block of blocks) {
      interleaved.push(byteAt(block.ec, index))
    }
  }
  return interleaved
}

const formatInfoGenerator = 0x537
const formatInfoMask = 0x5412
const formatInfoDataShift = 10
const formatInfoHighestBit = 14

/** Computes the 15-bit ISO/IEC 18004 BCH(15, 5) masked format word for `(level, maskPattern)`. */
const formatInfoBitsOf = (
  level: ErrorCorrectionLevel,
  maskPattern: number,
): number => {
  const data = (formatEcBitsOf(level) << 3) | (maskPattern & 0x7)
  let remainder = data << formatInfoDataShift
  for (let bit = formatInfoHighestBit; bit >= formatInfoDataShift; bit -= 1) {
    if (((remainder >>> bit) & 1) === 1) {
      remainder ^= formatInfoGenerator << (bit - formatInfoDataShift)
    }
  }
  return ((data << formatInfoDataShift) | remainder) ^ formatInfoMask
}

const versionInfoGenerator = 0x1f25
const versionInfoDataShift = 12
const versionInfoHighestBit = 17
const minVersionWithVersionInfo = 7
const versionInfoBitCount = 18

/** Computes the 18-bit ISO/IEC 18004 BCH(18, 6) version word for Versions 7..10. */
const versionInfoBitsOf = (version: number): number => {
  let remainder = version << versionInfoDataShift
  for (let bit = versionInfoHighestBit; bit >= versionInfoDataShift; bit -= 1) {
    if (((remainder >>> bit) & 1) === 1) {
      remainder ^= versionInfoGenerator << (bit - versionInfoDataShift)
    }
  }
  return (version << versionInfoDataShift) | remainder
}

const maskConditionOf = (
  maskPattern: number,
  row: number,
  col: number,
): boolean => {
  if (maskPattern === 0) {
    return (row + col) % 2 === 0
  } else if (maskPattern === 1) {
    return row % 2 === 0
  } else if (maskPattern === 2) {
    return col % 3 === 0
  } else if (maskPattern === 3) {
    return (row + col) % 3 === 0
  } else if (maskPattern === 4) {
    return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0
  } else if (maskPattern === 5) {
    return ((row * col) % 2) + ((row * col) % 3) === 0
  } else if (maskPattern === 6) {
    return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0
  } else {
    return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0
  }
}

const cellKey = (size: number, row: number, col: number): number =>
  row * size + col

const setFunctionModule = (
  modules: Map<number, boolean>,
  functionCells: Set<number>,
  size: number,
  row: number,
  col: number,
  isDark: boolean,
): void => {
  if (row >= 0 && row < size && col >= 0 && col < size) {
    const key = cellKey(size, row, col)
    modules.set(key, isDark)
    functionCells.add(key)
  }
}

const drawFinderPattern = (
  modules: Map<number, boolean>,
  functionCells: Set<number>,
  size: number,
  topRow: number,
  leftCol: number,
): void => {
  for (let dr = -1; dr <= 7; dr += 1) {
    for (let dc = -1; dc <= 7; dc += 1) {
      const row = topRow + dr
      const col = leftCol + dc
      if (row < 0 || row >= size || col < 0 || col >= size) {
        continue
      }
      const inOuterRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
      const onOuterBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6
      const inInnerSquare = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
      const isDark = inOuterRing && (onOuterBorder || inInnerSquare)
      setFunctionModule(modules, functionCells, size, row, col, isDark)
    }
  }
}

const drawAlignmentPattern = (
  modules: Map<number, boolean>,
  functionCells: Set<number>,
  size: number,
  centerRow: number,
  centerCol: number,
): void => {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      const distance = Math.max(Math.abs(dr), Math.abs(dc))
      setFunctionModule(
        modules,
        functionCells,
        size,
        centerRow + dr,
        centerCol + dc,
        distance !== 1,
      )
    }
  }
}

const writeFormatInfo = (
  modules: Map<number, boolean>,
  functionCells: Set<number>,
  size: number,
  level: ErrorCorrectionLevel,
  maskPattern: number,
): void => {
  const bits = formatInfoBitsOf(level, maskPattern)
  const bitOf = (index: number): boolean => ((bits >>> index) & 1) === 1

  // Copy 1: top-left finder perimeter
  for (let index = 0; index <= 5; index += 1) {
    setFunctionModule(modules, functionCells, size, index, 8, bitOf(index))
  }
  setFunctionModule(modules, functionCells, size, 7, 8, bitOf(6))
  setFunctionModule(modules, functionCells, size, 8, 8, bitOf(7))
  setFunctionModule(modules, functionCells, size, 8, 7, bitOf(8))
  for (let index = 9; index <= 14; index += 1) {
    setFunctionModule(modules, functionCells, size, 8, 14 - index, bitOf(index))
  }

  // Copy 2: top-right and bottom-left strips + fixed dark module
  for (let index = 0; index <= 7; index += 1) {
    setFunctionModule(
      modules,
      functionCells,
      size,
      8,
      size - 1 - index,
      bitOf(index),
    )
  }
  for (let index = 8; index <= 14; index += 1) {
    setFunctionModule(
      modules,
      functionCells,
      size,
      size - 15 + index,
      8,
      bitOf(index),
    )
  }
  setFunctionModule(modules, functionCells, size, size - 8, 8, true)
}

const writeVersionInfo = (
  modules: Map<number, boolean>,
  functionCells: Set<number>,
  size: number,
  version: number,
): void => {
  if (version < minVersionWithVersionInfo) {
    return
  }
  const bits = versionInfoBitsOf(version)
  for (let index = 0; index < versionInfoBitCount; index += 1) {
    const isDark = ((bits >>> index) & 1) === 1
    const a = Math.floor(index / 3)
    const b = size - 11 + (index % 3)
    setFunctionModule(modules, functionCells, size, b, a, isDark)
    setFunctionModule(modules, functionCells, size, a, b, isDark)
  }
}

const placeDataBits = (
  modules: Map<number, boolean>,
  functionCells: Set<number>,
  size: number,
  codewords: ReadonlyArray<number>,
): void => {
  const totalBits = codewords.length * gfByteWidth
  let bitIndex = 0
  let goingUp = true
  let right = size - 1
  while (right >= 1) {
    if (right === 6) {
      right = 5
    }
    for (let step = 0; step < size; step += 1) {
      const row = goingUp ? size - 1 - step : step
      for (let delta = 0; delta < 2; delta += 1) {
        const col = right - delta
        const key = cellKey(size, row, col)
        if (!functionCells.has(key)) {
          let isDark = false
          if (bitIndex < totalBits) {
            const byte = byteAt(codewords, bitIndex >>> 3)
            const shift = 7 - (bitIndex & 7)
            isDark = ((byte >>> shift) & 1) === 1
            bitIndex += 1
          }
          modules.set(key, isDark)
        }
      }
    }
    goingUp = !goingUp
    right -= 2
  }
}

const penaltyRunThreshold = 5
const penaltyRunBase = 3
const penaltyBlockWeight = 3
const penaltyFinderWeight = 40
const penaltyBalanceWeight = 10
const penaltyBalanceStepPercent = 5
const penaltyTargetPercent = 50
const finderLikeMask = 0x7ff
const finderLikePatternA = 0b10111010000
const finderLikePatternB = 0b00001011101
const finderLikeWidth = 11

const evaluateLinePenalty = (
  size: number,
  read: (index: number) => boolean,
): number => {
  let score = 0
  let runColor = read(0)
  let runLength = 1
  let windowBits = runColor ? 1 : 0

  for (let index = 1; index < size; index += 1) {
    const color = read(index)
    if (color === runColor) {
      runLength += 1
    } else {
      if (runLength >= penaltyRunThreshold) {
        score += penaltyRunBase + (runLength - penaltyRunThreshold)
      }
      runColor = color
      runLength = 1
    }
    windowBits = ((windowBits << 1) | (color ? 1 : 0)) & finderLikeMask
    if (
      index >= finderLikeWidth - 1 &&
      (windowBits === finderLikePatternA || windowBits === finderLikePatternB)
    ) {
      score += penaltyFinderWeight
    }
  }
  if (runLength >= penaltyRunThreshold) {
    score += penaltyRunBase + (runLength - penaltyRunThreshold)
  }
  return score
}

const evaluatePenalty = (
  modules: Map<number, boolean>,
  size: number,
): number => {
  const isDarkAt = (row: number, col: number): boolean =>
    modules.get(cellKey(size, row, col)) === true

  let score = 0
  for (let row = 0; row < size; row += 1) {
    score += evaluateLinePenalty(size, col => isDarkAt(row, col))
  }
  for (let col = 0; col < size; col += 1) {
    score += evaluateLinePenalty(size, row => isDarkAt(row, col))
  }

  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const topLeft = isDarkAt(row, col)
      if (
        topLeft === isDarkAt(row, col + 1) &&
        topLeft === isDarkAt(row + 1, col) &&
        topLeft === isDarkAt(row + 1, col + 1)
      ) {
        score += penaltyBlockWeight
      }
    }
  }

  let darkCount = 0
  const totalModules = size * size
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (isDarkAt(row, col)) {
        darkCount += 1
      }
    }
  }
  const darkPercent = (darkCount * 100) / totalModules
  const balanceSteps = Math.floor(
    Math.abs(darkPercent - penaltyTargetPercent) / penaltyBalanceStepPercent,
  )
  score += balanceSteps * penaltyBalanceWeight
  return score
}

const maskPatternCount = 8

const buildMatrixFromSpec = (
  bytes: ReadonlyArray<number>,
  spec: EcBlockSpec,
  level: ErrorCorrectionLevel,
): QrMatrix => {
  const size = spec.version * 4 + 17
  const baseModules = new Map<number, boolean>()
  const functionCells = new Set<number>()

  drawFinderPattern(baseModules, functionCells, size, 0, 0)
  drawFinderPattern(baseModules, functionCells, size, 0, size - 7)
  drawFinderPattern(baseModules, functionCells, size, size - 7, 0)

  for (let index = 8; index <= size - 9; index += 1) {
    const isDark = index % 2 === 0
    setFunctionModule(baseModules, functionCells, size, 6, index, isDark)
    setFunctionModule(baseModules, functionCells, size, index, 6, isDark)
  }

  const centers = Option.getOrElse(
    Array.get(alignmentCentersByVersion, spec.version - 1),
    () => [],
  )
  const lastCenter = Option.getOrElse(Array.last(centers), () => -1)
  for (const centerRow of centers) {
    for (const centerCol of centers) {
      const overlapsTopLeft = centerRow === 6 && centerCol === 6
      const overlapsTopRight = centerRow === 6 && centerCol === lastCenter
      const overlapsBottomLeft = centerRow === lastCenter && centerCol === 6
      if (!overlapsTopLeft && !overlapsTopRight && !overlapsBottomLeft) {
        drawAlignmentPattern(
          baseModules,
          functionCells,
          size,
          centerRow,
          centerCol,
        )
      }
    }
  }

  // Reserve format and version info modules before zigzag placement
  writeFormatInfo(baseModules, functionCells, size, level, 0)
  writeVersionInfo(baseModules, functionCells, size, spec.version)

  const dataCodewords = buildDataCodewords(bytes, spec)
  const finalCodewords = interleaveCodewords(dataCodewords, spec)
  placeDataBits(baseModules, functionCells, size, finalCodewords)

  let bestPenalty = Number.POSITIVE_INFINITY
  let bestModules = baseModules

  for (let maskPattern = 0; maskPattern < maskPatternCount; maskPattern += 1) {
    const candidate = new Map<number, boolean>(baseModules)
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const key = cellKey(size, row, col)
        if (!functionCells.has(key) && maskConditionOf(maskPattern, row, col)) {
          candidate.set(key, candidate.get(key) !== true)
        }
      }
    }
    writeFormatInfo(candidate, functionCells, size, level, maskPattern)
    const penalty = evaluatePenalty(candidate, size)
    if (penalty < bestPenalty) {
      bestPenalty = penalty
      bestModules = candidate
    }
  }

  const modules: ReadonlyArray<ReadonlyArray<boolean>> = Array.makeBy(
    size,
    row =>
      Array.makeBy(
        size,
        col => bestModules.get(cellKey(size, row, col)) === true,
      ),
  )

  return {
    version: spec.version,
    size,
    modules,
  }
}

/**
 * Pure total QR Code matrix encoder returning `Option.some(matrix)` when
 * `value` fits within Versions 1..10 at `level`, or `Option.none()` when it
 * exceeds byte capacity.
 *
 * @example
 * ```typescript
 * tryEncodeQrMatrix('https://foldkit.dev', 'M')
 * // Some({ version: 2, size: 25, modules: [...] })
 * ```
 */
export const tryEncodeQrMatrix = (
  value: string,
  level: ErrorCorrectionLevel = defaultErrorCorrectionLevel,
): Option.Option<QrMatrix> => {
  const bytes = utf8BytesOf(value)
  const maybeSpec = Array.findFirst(
    ecTable[level],
    spec => bytes.length <= byteCapacityOfSpec(spec),
  )
  return Option.map(maybeSpec, spec => buildMatrixFromSpec(bytes, spec, level))
}

/**
 * Pure QR Code matrix encoder returning `{ version, size, modules }` for
 * `value` at `level` (auto-fitting Versions 1..10 in Byte mode). Throws
 * {@link QrCodeCapacityError} when `value` exceeds Version 10 byte capacity;
 * use {@link tryEncodeQrMatrix} for a total `Option`-returning call.
 *
 * @example
 * ```typescript
 * const matrix = encodeQrMatrix('https://foldkit.dev', 'M')
 * matrix.size // 25
 * ```
 */
export const encodeQrMatrix = (
  value: string,
  level: ErrorCorrectionLevel = defaultErrorCorrectionLevel,
): QrMatrix =>
  Option.match(tryEncodeQrMatrix(value, level), {
    onSome: matrix => matrix,
    onNone: () => {
      const byteLength = utf8BytesOf(value).length
      const maxBytes = maxByteCapacityOf(level)
      throw new QrCodeCapacityError({
        byteLength,
        maxBytes,
        level,
        message: `QR payload of ${byteLength.toString()} bytes exceeds maximum Version 10 capacity (${maxBytes.toString()} bytes at level ${level})`,
      })
    },
  })

/** Options for rendering a {@link QrMatrix} into an SVG path or viewBox. */
export type SvgOptions = Readonly<{
  moduleSize?: number
  quietZone?: number
}>

const resolvedModuleSize = (options?: SvgOptions): number =>
  options?.moduleSize !== undefined &&
  Number.isFinite(options.moduleSize) &&
  options.moduleSize > 0
    ? options.moduleSize
    : defaultModuleSize

const resolvedQuietZone = (options?: SvgOptions): number =>
  options?.quietZone !== undefined &&
  Number.isFinite(options.quietZone) &&
  options.quietZone >= 0
    ? Math.floor(options.quietZone)
    : defaultQuietZone

/**
 * Converts a {@link QrMatrix} into a compact SVG `<path d="...">` string by
 * merging adjacent dark modules along each horizontal row.
 *
 * @example
 * ```typescript
 * const path = svgPathOf(encodeQrMatrix('Foldkit', 'M'))
 * // 'M0 0h7v1h-7z...'
 * ```
 */
export const svgPathOf = (matrix: QrMatrix, options?: SvgOptions): string => {
  const unit = resolvedModuleSize(options)
  const quiet = resolvedQuietZone(options)
  const segments: Array<string> = []

  for (let rowIndex = 0; rowIndex < matrix.size; rowIndex += 1) {
    const row = Option.getOrElse(Array.get(matrix.modules, rowIndex), () => [])
    let col = 0
    while (col < matrix.size) {
      const isDark = Option.getOrElse(Array.get(row, col), () => false)
      if (!isDark) {
        col += 1
        continue
      }
      const startCol = col
      while (
        col < matrix.size &&
        Option.getOrElse(Array.get(row, col), () => false)
      ) {
        col += 1
      }
      const x = (startCol + quiet) * unit
      const y = (rowIndex + quiet) * unit
      const width = (col - startCol) * unit
      segments.push(
        `M${x.toString()} ${y.toString()}h${width.toString()}v${unit.toString()}h-${width.toString()}z`,
      )
    }
  }
  return Array.join(segments, '')
}

/** Computes the matching SVG `viewBox` string (`"0 0 W H"`) for a {@link QrMatrix}. */
export const viewBoxOf = (matrix: QrMatrix, options?: SvgOptions): string => {
  const unit = resolvedModuleSize(options)
  const quiet = resolvedQuietZone(options)
  const extent = (matrix.size + quiet * 2) * unit
  return `0 0 ${extent.toString()} ${extent.toString()}`
}

/** Renders a {@link QrMatrix} as multiline ASCII blocks (`██` dark, `  ` light) for terminal Clients. */
export const asciiOf = (matrix: QrMatrix): string =>
  Array.join(
    Array.map(matrix.modules, row =>
      Array.join(
        Array.map(row, isDark => (isDark ? '██' : '  ')),
        '',
      ),
    ),
    '\n',
  )

// STATE

/** No text is configured yet; no QR matrix is produced. */
export const Empty = ts('Empty', {
  level: ErrorCorrectionLevel,
})
/** No text is configured yet. */
export type Empty = typeof Empty.Type

/** Valid QR matrix encoded for `value` at `level`, carrying `version`, `size`, `matrix`, `svgPath`, and `downloadCount`. */
export const Ready = ts('Ready', {
  value: S.String,
  level: ErrorCorrectionLevel,
  version: S.Number,
  size: S.Number,
  matrix: QrMatrix,
  svgPath: S.String,
  downloadCount: S.Number,
})
/** Valid QR matrix encoded for `value` at `level`. */
export type Ready = typeof Ready.Type

/** Payload exceeded supported QR Code byte capacity for `level`. */
export const Error = ts('Error', {
  value: S.String,
  level: ErrorCorrectionLevel,
  reason: S.String,
})
/** Payload exceeded supported QR Code byte capacity. */
export type Error = typeof Error.Type

/** Where a QrCode Part stands: `Empty`, `Ready`, or `Error`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Empty, Ready, Error])
/** Where a QrCode Part stands. */
export type State = typeof State.Type

/** Initial QrCode state: empty with error correction level `'M'`. */
export const initial: State = Empty({ level: defaultErrorCorrectionLevel })

const encodeToState = (
  value: string,
  level: ErrorCorrectionLevel,
  options?: SvgOptions,
  downloadCount: number = 0,
): State => {
  if (value === '') {
    return Empty({ level })
  }
  return Option.match(tryEncodeQrMatrix(value, level), {
    onSome: matrix =>
      Ready({
        value,
        level,
        version: matrix.version,
        size: matrix.size,
        matrix,
        svgPath: svgPathOf(matrix, options),
        downloadCount,
      }),
    onNone: () => {
      const byteLength = utf8BytesOf(value).length
      const maxBytes = maxByteCapacityOf(level)
      return Error({
        value,
        level,
        reason: `Payload of ${byteLength.toString()} bytes exceeds maximum Version 10 capacity (${maxBytes.toString()} bytes at level ${level})`,
      })
    },
  })
}

/** Creates an initial QrCode state encoded from `value` at `level`. */
export const initialValue = (
  value: string,
  level: ErrorCorrectionLevel = defaultErrorCorrectionLevel,
  options?: SvgOptions,
): State => encodeToState(value, level, options)

// ACTIONS

/** Sets the text encoded in the QR code; synced via `Pace.Settled` on typing pauses. */
export const SetQrCodeValue = Catalog.action('SetQrCodeValue', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'content',
    prompt: 'Encode which text in the QR code?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter text to encode',
  },
  what: 'Updates the text encoded in the QR code',
  why: 'To generate a scannable matrix for new content',
  meta: { label: 'Set QR content', keys: [] },
})

const errorCorrectionChoices: ReadonlyArray<
  Catalog.Choice<ErrorCorrectionLevel>
> = [
  { value: 'L', title: 'Low (7%)' },
  { value: 'M', title: 'Medium (15%)' },
  { value: 'Q', title: 'Quartile (25%)' },
  { value: 'H', title: 'High (30%)' },
]

/** Changes the ISO/IEC 18004 error correction level (`'L' | 'M' | 'Q' | 'H'`). */
export const SetQrCodeErrorCorrection = Catalog.action(
  'SetQrCodeErrorCorrection',
  {
    fields: { level: ErrorCorrectionLevel },
    choose: {
      field: 'level',
      noun: 'error correction level',
      prompt: 'Choose an error correction level',
      token: ErrorCorrectionLevel,
      choicesOf: () => errorCorrectionChoices,
      accepts: () => Catalog.Enabled(),
      nothingToChoose: 'Choose L, M, Q, or H',
    },
    what: 'Changes the QR code error correction level',
    why: 'To balance data density against damage resilience',
    meta: { label: 'Set error correction', keys: [] },
  },
)

/** Clears the QR code value and returns to `Empty`. */
export const ClearQrCode = Catalog.action('ClearQrCode', {
  what: 'Clears the QR code content',
  why: 'To remove the current encoded matrix',
  meta: { label: 'Clear QR code', keys: [] },
})

/** Requests an export of the ready QR code matrix for host adapters to fulfill. */
export const RequestQrCodeDownload = Catalog.action('RequestQrCodeDownload', {
  what: 'Requests an export of the generated QR code',
  why: 'To save the scannable image for sharing or printing',
  meta: { label: 'Download QR code', keys: [] },
})

/** The Catalog Actions a QrCode Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SetQrCodeValue,
  SetQrCodeErrorCorrection,
  ClearQrCode,
  RequestQrCodeDownload,
]

// MESSAGES

/** Every Message the QrCode chart handles. */
export const Message = S.Union([
  SetQrCodeValue,
  SetQrCodeErrorCorrection,
  ClearQrCode,
  RequestQrCodeDownload,
])
/** Every Message the QrCode chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the QrCode Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the root container element id from a QrCode base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the SVG frame element id from a QrCode base `id`. */
export const frameId = (id: string): string => `${id}-frame`

/** Derives the SVG path pattern element id from a QrCode base `id`. */
export const patternId = (id: string): string => `${id}-pattern`

/** Derives the centered logo overlay element id from a QrCode base `id`. */
export const overlayId = (id: string): string => `${id}-overlay`

/** Derives the download trigger button element id from a QrCode base `id`. */
export const downloadTriggerId = (id: string): string => `${id}-download`

// PURE READINGS

/** True when no value is encoded (`Empty`). */
export const isEmpty = (state: State): boolean => state._tag === 'Empty'

/** True when a valid QR matrix is encoded (`Ready`). */
export const isReady = (state: State): boolean => state._tag === 'Ready'

/** True when encoding failed due to capacity overflow (`Error`). */
export const isError = (state: State): boolean => state._tag === 'Error'

/** Standard `data-state` marker (`'empty' | 'ready' | 'error'`). */
export const dataStateOf = (state: State): DataState =>
  M.value(state).pipe(
    M.withReturnType<DataState>(),
    M.tagsExhaustive({
      Empty: () => 'empty',
      Ready: () => 'ready',
      Error: () => 'error',
    }),
  )

/** Current encoded text (`''` when empty). */
export const valueOf = (state: State): string =>
  state._tag === 'Empty' ? '' : state.value

/** Current error correction level. */
export const levelOf = (state: State): ErrorCorrectionLevel => state.level

/** Encoded {@link QrMatrix} while `Ready`, or `Option.none()`. */
export const matrixOf = (state: State): Option.Option<QrMatrix> =>
  state._tag === 'Ready' ? Option.some(state.matrix) : Option.none()

/** Encoded SVG `<path d="...">` string while `Ready`, or `Option.none()`. */
export const svgPathStateOf = (state: State): Option.Option<string> =>
  state._tag === 'Ready' ? Option.some(state.svgPath) : Option.none()

/** Error message when capacity was exceeded, or `Option.none()`. */
export const errorReasonOf = (state: State): Option.Option<string> =>
  state._tag === 'Error' ? Option.some(state.reason) : Option.none()

/** Number of download requests recorded in the current `Ready` state (`0` otherwise). */
export const downloadCountOf = (state: State): number =>
  state._tag === 'Ready' ? state.downloadCount : 0

// INTERNAL HELPERS

const svgOptionsOf = (props: Props): SvgOptions => ({
  ...(props.moduleSize === undefined ? {} : { moduleSize: props.moduleSize }),
  ...(props.quietZone === undefined ? {} : { quietZone: props.quietZone }),
})

// CHART

/**
 * The QrCode Machine chart: encodes text into a QR matrix (`Empty | Ready |
 * Error`), re-encodes when error correction level changes (including recovery
 * from `Error` when switching to a lower error correction level), clears to
 * `Empty`, and records download requests while `Ready`.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Empty: {
        on: {
          SetQrCodeErrorCorrection: to('Empty', ({ message }) =>
            Empty({ level: message.level }),
          ),
          ClearQrCode: [ignore()],
          RequestQrCodeDownload: [ignore()],
        },
      },
      Ready: {
        on: {
          SetQrCodeErrorCorrection: [
            when(
              (state, message, context) => {
                const next = encodeToState(
                  state.value,
                  message.level,
                  svgOptionsOf(context),
                  state.downloadCount,
                )
                return next._tag === 'Ready' ? Option.some(next) : Option.none()
              },
              'Ready',
              ({ guardValue }) => guardValue,
            ),
            when(
              () => true,
              'Error',
              ({ state, message, context }) => {
                const next = encodeToState(
                  state.value,
                  message.level,
                  svgOptionsOf(context),
                )
                return next._tag === 'Error'
                  ? next
                  : Error({
                      value: state.value,
                      level: message.level,
                      reason: 'Payload exceeds supported QR capacity',
                    })
              },
            ),
          ],
          ClearQrCode: to('Empty', ({ state }) =>
            Empty({ level: state.level }),
          ),
          RequestQrCodeDownload: to('Ready', ({ state }) =>
            Ready({
              ...state,
              downloadCount: state.downloadCount + 1,
            }),
          ),
        },
      },
      Error: {
        on: {
          SetQrCodeErrorCorrection: [
            when(
              (state, message, context) => {
                const next = encodeToState(
                  state.value,
                  message.level,
                  svgOptionsOf(context),
                )
                return next._tag === 'Ready' ? Option.some(next) : Option.none()
              },
              'Ready',
              ({ guardValue }) => guardValue,
            ),
            when(
              () => true,
              'Error',
              ({ state, message, context }) => {
                const next = encodeToState(
                  state.value,
                  message.level,
                  svgOptionsOf(context),
                )
                return next._tag === 'Error'
                  ? next
                  : Error({
                      value: state.value,
                      level: message.level,
                      reason: state.reason,
                    })
              },
            ),
          ],
          ClearQrCode: to('Empty', ({ state }) =>
            Empty({ level: state.level }),
          ),
          RequestQrCodeDownload: [ignore()],
        },
      },
    },
    shared: [
      forStates(['Empty', 'Ready', 'Error']).on({
        SetQrCodeValue: [
          when(
            (_state, message) => message.value === '',
            'Empty',
            ({ state, context }) =>
              Empty({ level: context.level ?? state.level }),
          ),
          when(
            (state, message, context) => {
              const level =
                state._tag === 'Empty'
                  ? (context.level ?? state.level)
                  : state.level
              const next = encodeToState(
                message.value,
                level,
                svgOptionsOf(context),
              )
              return next._tag === 'Ready' ? Option.some(next) : Option.none()
            },
            'Ready',
            ({ guardValue }) => guardValue,
          ),
          when(
            () => true,
            'Error',
            ({ state, message, context }) => {
              const level =
                state._tag === 'Empty'
                  ? (context.level ?? state.level)
                  : state.level
              const next = encodeToState(
                message.value,
                level,
                svgOptionsOf(context),
              )
              return next._tag === 'Error'
                ? next
                : Error({
                    value: message.value,
                    level,
                    reason: 'Payload exceeds supported QR capacity',
                  })
            },
          ),
        ],
      }),
    ],
  },
)

// SYNC

/**
 * Builds the QrCode sync table using `Pace.Settled({ afterMs })` on
 * `SetQrCodeValue` (200 ms default) and `Pace.Synced()` on error correction,
 * clear, and download requests.
 */
export const syncOf = (
  settleMs: number = defaultSettleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetQrCodeValue: Settled({ afterMs: settleMs }),
  SetQrCodeErrorCorrection: Synced(),
  ClearQrCode: Synced(),
  RequestQrCodeDownload: Synced(),
})

/** Default QrCode synchronization: `SetQrCodeValue` settled at 200 ms, discrete controls synced immediately. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a QrCode kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetQrCodeValue: Device({ because }),
  SetQrCodeErrorCorrection: Device({ because }),
  ClearQrCode: Device({ because }),
  RequestQrCodeDownload: Device({ because }),
})

/** Returns the {@link Sync} pace for one QrCode Message under `settleMs`. */
export const paceOf = (
  message: Message,
  settleMs: number = defaultSettleMs,
): Sync => syncOf(settleMs)[message._tag]

// SLOTS & PROJECTION

/**
 * The five painted slots of a QrCode Part: `Root`, `Frame`, `Pattern`,
 * `Overlay`, and `DownloadTrigger`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Frame: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  Pattern: {
    focus: 'None',
    gestures: [],
  },
  Overlay: {
    focus: 'None',
    gestures: [],
  },
  DownloadTrigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'RequestQrCodeDownload' }],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  const ready = state._tag === 'Ready'
  const label = props.label ?? 'QR code'
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      label,
      ...(state._tag === 'Error' ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Frame') {
    return {
      id: frameId(props.id),
      label: ready ? `${label}: ${state.value}` : label,
      ...(ready
        ? { valueText: viewBoxOf(state.matrix, svgOptionsOf(props)) }
        : { isHidden: true }),
    }
  } else if (slot === 'Pattern') {
    return {
      id: patternId(props.id),
      ...(ready ? { valueText: state.svgPath } : { isHidden: true }),
    }
  } else if (slot === 'Overlay') {
    return {
      id: overlayId(props.id),
      ...(ready ? {} : { isHidden: true }),
    }
  } else if (slot === 'DownloadTrigger') {
    return {
      id: downloadTriggerId(props.id),
      label: props.downloadLabel ?? 'Download QR code',
      ...(ready ? {} : { isDisabled: true }),
    }
  } else {
    return {}
  }
}

/** What a restart opens a QrCode on: preserves encoded matrix and clears transient `downloadCount`. */
export const atRest = (state: State): State =>
  state._tag === 'Ready' ? Ready({ ...state, downloadCount: 0 }) : state

// PART FACTORY

/** Options for customizing a QrCode Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this QrCode device-only. */
  sync?: 'Synced' | DeviceReason
  /** Typing-pause settle window for `SetQrCodeValue` in milliseconds (`200` by default). */
  settleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a QrCode {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * `SetQrCodeValue` at `Pace.Settled({ afterMs: 200 })`); pass
 * `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a QrCode local to
 * one device.
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const settleMs = options.settleMs ?? defaultSettleMs
  return Part.define<State, Message, Props>({
    name: options.name ?? 'QrCode',
    State,
    Message,
    chart,
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? syncOf(settleMs)
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
    slots,
    atRest,
    project: projectSlot,
    configuration: options.configuration ?? {
      base: {
        pace: {
          ...defaultPace,
          typingSettleMs: settleMs,
        },
      },
      presets: {},
    },
  })
}

/**
 * Shorthand for a QrCode Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> => {
  const { because, ...rest } = options
  return make({
    ...rest,
    sync: because ?? 'OwnView',
  })
}

/** The default synced QrCode Part (`name: 'QrCode'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()

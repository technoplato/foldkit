import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Settled, Synced } from './pace.js'
import * as Part from './part.js'
import * as QrCode from './qrCode.js'
import * as Slot from './slot.js'

const baseProps: QrCode.Props = {
  id: 'share-qr',
  label: 'Share QR code',
}

const fold = (
  messages: ReadonlyArray<QrCode.Message>,
  props: QrCode.Props = baseProps,
  from: QrCode.State = QrCode.initial,
): QrCode.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => QrCode.chart.transition(state, message, props)[0],
  )

const moduleAt = (matrix: QrCode.QrMatrix, row: number, col: number): boolean =>
  Option.getOrElse(
    Option.flatMap(Array.get(matrix.modules, row), line =>
      Array.get(line, col),
    ),
    () => false,
  )

const readFormatCopy1 = (matrix: QrCode.QrMatrix): number => {
  let bits = 0
  for (let index = 0; index <= 5; index += 1) {
    if (moduleAt(matrix, index, 8)) {
      bits |= 1 << index
    }
  }
  if (moduleAt(matrix, 7, 8)) {
    bits |= 1 << 6
  }
  if (moduleAt(matrix, 8, 8)) {
    bits |= 1 << 7
  }
  if (moduleAt(matrix, 8, 7)) {
    bits |= 1 << 8
  }
  for (let index = 9; index <= 14; index += 1) {
    if (moduleAt(matrix, 8, 14 - index)) {
      bits |= 1 << index
    }
  }
  return bits
}

const readFormatCopy2 = (matrix: QrCode.QrMatrix): number => {
  let bits = 0
  for (let index = 0; index <= 7; index += 1) {
    if (moduleAt(matrix, 8, matrix.size - 1 - index)) {
      bits |= 1 << index
    }
  }
  for (let index = 8; index <= 14; index += 1) {
    if (moduleAt(matrix, matrix.size - 15 + index, 8)) {
      bits |= 1 << index
    }
  }
  return bits
}

const readVersionBlock = (
  matrix: QrCode.QrMatrix,
  topRight: boolean,
): number => {
  let bits = 0
  for (let index = 0; index < 18; index += 1) {
    const a = Math.floor(index / 3)
    const b = matrix.size - 11 + (index % 3)
    const isDark = topRight ? moduleAt(matrix, a, b) : moduleAt(matrix, b, a)
    if (isDark) {
      bits |= 1 << index
    }
  }
  return bits
}

const assertFinderAt = (
  matrix: QrCode.QrMatrix,
  topRow: number,
  leftCol: number,
): void => {
  for (let dr = 0; dr <= 6; dr += 1) {
    for (let dc = 0; dc <= 6; dc += 1) {
      const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6
      const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
      expect(moduleAt(matrix, topRow + dr, leftCol + dc)).toBe(
        onBorder || inCenter,
      )
    }
  }
}

describe('core QrCode Part', () => {
  describe('declaration, chart integrity, IDs, sync paces, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(QrCode.part)).toEqual([])
      expect(Part.problemsOf(QrCode.make({ settleMs: 150 }))).toEqual([])
      expect(Part.problemsOf(QrCode.deviceOnly())).toEqual([])
      expect(Part.problemsOf(QrCode.make({ sync: 'OwnView' }))).toEqual([])
      expect(Block.problemsOf({ name: 'QrCode', chart: QrCode.chart })).toEqual(
        [],
      )

      for (const action of QrCode.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and sync paces cleanly', () => {
      expect(QrCode.rootId('share-qr')).toBe('share-qr-root')
      expect(QrCode.frameId('share-qr')).toBe('share-qr-frame')
      expect(QrCode.patternId('share-qr')).toBe('share-qr-pattern')
      expect(QrCode.overlayId('share-qr')).toBe('share-qr-overlay')
      expect(QrCode.downloadTriggerId('share-qr')).toBe('share-qr-download')

      expect(QrCode.synced.SetQrCodeValue).toEqual(Settled({ afterMs: 200 }))
      expect(QrCode.synced.SetQrCodeErrorCorrection).toEqual(Synced())
      expect(QrCode.synced.ClearQrCode).toEqual(Synced())
      expect(QrCode.synced.RequestQrCodeDownload).toEqual(Synced())
      expect(
        QrCode.paceOf(QrCode.SetQrCodeValue({ value: 'hi' }), 350),
      ).toEqual(Settled({ afterMs: 350 }))
      expect(QrCode.deviceSync('OwnView').SetQrCodeValue).toEqual(
        Device({ because: 'OwnView' }),
      )
    })

    it('round-trips Empty, Ready, and Error states through Effect Schema JSON encoding', () => {
      const ready = fold([
        QrCode.SetQrCodeValue({ value: 'https://foldkit.dev' }),
      ])
      const overflow = fold([QrCode.SetQrCodeValue({ value: 'x'.repeat(300) })])

      for (const state of [QrCode.initial, ready, overflow]) {
        const encoded = S.encodeUnknownSync(QrCode.State)(state)
        const decoded = S.decodeUnknownSync(QrCode.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('pure ISO/IEC 18004 QR matrix encoder', () => {
    it('auto-fits Versions 1..10, places finder/timing/dark/alignment/format/version patterns, and stays deterministic', () => {
      const v1 = QrCode.encodeQrMatrix('Foldkit', 'M')
      expect(v1.version).toBe(1)
      expect(v1.size).toBe(21)
      expect(v1.modules.length).toBe(21)

      // Deterministic output
      expect(QrCode.encodeQrMatrix('Foldkit', 'M')).toEqual(v1)

      // Finder patterns at all three corners
      assertFinderAt(v1, 0, 0)
      assertFinderAt(v1, 0, 14)
      assertFinderAt(v1, 14, 0)

      // Timing patterns along row 6 and column 6
      for (let i = 8; i <= 12; i += 1) {
        expect(moduleAt(v1, 6, i)).toBe(i % 2 === 0)
        expect(moduleAt(v1, i, 6)).toBe(i % 2 === 0)
      }

      // Fixed dark module at (4 * version + 9, 8)
      expect(moduleAt(v1, 13, 8)).toBe(true)

      // Both format info copies match and unmask to EC = M (0b00)
      const fmt1 = readFormatCopy1(v1)
      const fmt2 = readFormatCopy2(v1)
      expect(fmt1).toBe(fmt2)
      const unmasked = fmt1 ^ 0x5412
      expect((unmasked >>> 13) & 0x3).toBe(0) // M = 00

      // Version 2 alignment pattern centered at (18, 18)
      const v2 = QrCode.encodeQrMatrix('https://foldkit.dev/ui', 'M')
      expect(v2.version).toBe(2)
      expect(v2.size).toBe(25)
      expect(moduleAt(v2, 18, 18)).toBe(true)
      expect(moduleAt(v2, 17, 17)).toBe(false)
      expect(moduleAt(v2, 16, 16)).toBe(true)

      // Version 7+ writes identical 18-bit BCH version info into both 6x3 and 3x6 areas
      const v7Payload = 'A'.repeat(115) // exceeds V6-M (106), fits V7-M (122)
      const v7 = QrCode.encodeQrMatrix(v7Payload, 'M')
      expect(v7.version).toBe(7)
      expect(v7.size).toBe(45)
      expect(moduleAt(v7, 4 * 7 + 9, 8)).toBe(true)
      const topRightVersion = readVersionBlock(v7, true)
      const bottomLeftVersion = readVersionBlock(v7, false)
      expect(topRightVersion).toBe(bottomLeftVersion)
      expect(topRightVersion).toBe(0x07c94) // ISO/IEC 18004 Table D.1 Version 7 exact word

      // Version 10 (16-bit byte count indicator) fits up to 271 bytes at Level L
      const v10 = QrCode.encodeQrMatrix('Z'.repeat(271), 'L')
      expect(v10.version).toBe(10)
      expect(v10.size).toBe(57)
      expect(readFormatCopy1(v10)).toBe(readFormatCopy2(v10))
      expect(((readFormatCopy1(v10) ^ 0x5412) >>> 13) & 0x3).toBe(1) // L = 01
    })

    it('encodes multi-byte UTF-8 payloads, handles capacity overflow, and projects SVG path / viewBox / ASCII', () => {
      expect(QrCode.utf8BytesOf('Aé€😀')).toEqual([
        0x41, 0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80,
      ])

      const utf8Matrix = QrCode.encodeQrMatrix('Foldkit 🚀', 'H')
      expect(utf8Matrix.version).toBe(2)
      expect(utf8Matrix.size).toBe(25)

      const path = QrCode.svgPathOf(utf8Matrix)
      expect(path.startsWith('M0 0h7v1h-7z')).toBe(true)
      expect(QrCode.viewBoxOf(utf8Matrix)).toBe('0 0 25 25')
      expect(
        QrCode.viewBoxOf(utf8Matrix, { moduleSize: 4, quietZone: 2 }),
      ).toBe('0 0 116 116')
      const ascii = QrCode.asciiOf(utf8Matrix)
      expect(ascii.split('\n').length).toBe(25)

      expect(QrCode.maxByteCapacityOf('L')).toBe(271)
      expect(QrCode.maxByteCapacityOf('M')).toBe(213)
      expect(QrCode.maxByteCapacityOf('Q')).toBe(151)
      expect(QrCode.maxByteCapacityOf('H')).toBe(119)

      expect(QrCode.tryEncodeQrMatrix('X'.repeat(272), 'L')).toEqual(
        Option.none(),
      )
      expect(() => QrCode.encodeQrMatrix('X'.repeat(272), 'L')).toThrowError(
        /exceeds maximum Version 10 capacity/,
      )
    })

    it('round-trips Byte-mode payload and satisfies GF(256) Reed-Solomon zero syndromes when decoded from the final masked matrix', () => {
      const gfMul = (left: number, right: number): number => {
        let product = 0
        let factor = left & 0xff
        let multiplier = right & 0xff
        for (let bit = 0; bit < 8; bit += 1) {
          if ((multiplier & 1) === 1) {
            product ^= factor
          }
          const carries = (factor & 0x80) !== 0
          factor = (factor << 1) & 0xff
          if (carries) {
            factor ^= 0x1d
          }
          multiplier >>>= 1
        }
        return product
      }

      const maskBit = (mask: number, r: number, c: number): boolean => {
        if (mask === 0) {
          return (r + c) % 2 === 0
        } else if (mask === 1) {
          return r % 2 === 0
        } else if (mask === 2) {
          return c % 3 === 0
        } else if (mask === 3) {
          return (r + c) % 3 === 0
        } else if (mask === 4) {
          return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
        } else if (mask === 5) {
          return ((r * c) % 2) + ((r * c) % 3) === 0
        } else if (mask === 6) {
          return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
        } else {
          return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
        }
      }

      const isFunctionCell = (
        version: number,
        size: number,
        r: number,
        c: number,
      ): boolean => {
        // Finder + separator + format areas
        if (r <= 8 && c <= 8) {
          return true
        }
        if (r <= 8 && c >= size - 8) {
          return true
        }
        if (r >= size - 8 && c <= 8) {
          return true
        }
        // Timing patterns
        if (r === 6 || c === 6) {
          return true
        }
        // Version 2 alignment pattern at (18, 18)
        if (version === 2 && Math.abs(r - 18) <= 2 && Math.abs(c - 18) <= 2) {
          return true
        }
        return false
      }

      const decodeSingleBlockQr = (
        matrix: QrCode.QrMatrix,
        totalCodewords: number,
        ecCount: number,
      ): string => {
        const format = readFormatCopy1(matrix) ^ 0x5412
        const mask = (format >>> 10) & 0x7
        const bits: Array<number> = []
        let goingUp = true
        let right = matrix.size - 1
        while (right >= 1) {
          if (right === 6) {
            right = 5
          }
          for (let step = 0; step < matrix.size; step += 1) {
            const row = goingUp ? matrix.size - 1 - step : step
            for (let delta = 0; delta < 2; delta += 1) {
              const col = right - delta
              if (!isFunctionCell(matrix.version, matrix.size, row, col)) {
                const raw = moduleAt(matrix, row, col)
                const unmasked = maskBit(mask, row, col) ? !raw : raw
                bits.push(unmasked ? 1 : 0)
              }
            }
          }
          goingUp = !goingUp
          right -= 2
        }

        const codewords: Array<number> = []
        for (let idx = 0; idx < totalCodewords; idx += 1) {
          let byte = 0
          for (let b = 0; b < 8; b += 1) {
            byte =
              (byte << 1) |
              Option.getOrElse(Array.get(bits, idx * 8 + b), () => 0)
          }
          codewords.push(byte)
        }

        // Verify GF(256) Reed-Solomon zero syndromes at alpha^0 .. alpha^(ecCount - 1)
        let alphaPow = 1
        for (let rootIdx = 0; rootIdx < ecCount; rootIdx += 1) {
          let evalSum = 0
          for (const cw of codewords) {
            evalSum = gfMul(evalSum, alphaPow) ^ cw
          }
          expect(evalSum).toBe(0)
          alphaPow = gfMul(alphaPow, 2)
        }

        // Decode Byte mode (4-bit mode 0100 + 8-bit count + payload bytes)
        const mode = Option.getOrElse(Array.get(codewords, 0), () => 0) >>> 4
        expect(mode).toBe(4)
        const len =
          ((Option.getOrElse(Array.get(codewords, 0), () => 0) & 0x0f) << 4) |
          (Option.getOrElse(Array.get(codewords, 1), () => 0) >>> 4)
        const decodedBytes: Array<number> = []
        for (let i = 0; i < len; i += 1) {
          const high =
            (Option.getOrElse(Array.get(codewords, i + 1), () => 0) & 0x0f) << 4
          const low =
            Option.getOrElse(Array.get(codewords, i + 2), () => 0) >>> 4
          decodedBytes.push(high | low)
        }
        return new TextDecoder().decode(new Uint8Array(decodedBytes))
      }

      // V1-M (26 total codewords, 10 EC)
      const v1m = QrCode.encodeQrMatrix('Foldkit UI', 'M')
      expect(v1m.version).toBe(1)
      expect(decodeSingleBlockQr(v1m, 26, 10)).toBe('Foldkit UI')

      // V2-M (44 total codewords, 16 EC)
      const v2m = QrCode.encodeQrMatrix('https://foldkit.dev/ui', 'M')
      expect(v2m.version).toBe(2)
      expect(decodeSingleBlockQr(v2m, 44, 16)).toBe('https://foldkit.dev/ui')

      // V2-H (44 total codewords, 28 EC) with UTF-8 emoji
      const v2h = QrCode.encodeQrMatrix('Foldkit 🚀', 'H')
      expect(v2h.version).toBe(2)
      expect(decodeSingleBlockQr(v2h, 44, 28)).toBe('Foldkit 🚀')
    })
  })

  describe('machine lifecycle: Empty, Ready, Error recovery, download requests, and atRest', () => {
    it('transitions Empty -> Ready -> Error -> Ready via error correction level adjustment and ClearQrCode', () => {
      expect(QrCode.isEmpty(QrCode.initial)).toBe(true)
      expect(QrCode.matrixOf(QrCode.initial)).toEqual(Option.none())

      // 180 bytes fits L (271) and M (213) but overflows Q (151) and H (119)
      const mediumPayload = 'B'.repeat(180)
      const ready = fold([QrCode.SetQrCodeValue({ value: mediumPayload })])
      expect(QrCode.isReady(ready)).toBe(true)
      expect(QrCode.dataStateOf(ready)).toBe('ready')
      expect(Option.isSome(QrCode.matrixOf(ready))).toBe(true)
      expect(Option.isSome(QrCode.svgPathStateOf(ready))).toBe(true)

      const downloaded = fold(
        [QrCode.RequestQrCodeDownload(), QrCode.RequestQrCodeDownload()],
        baseProps,
        ready,
      )
      expect(QrCode.downloadCountOf(downloaded)).toBe(2)
      expect(QrCode.downloadCountOf(QrCode.atRest(downloaded))).toBe(0)

      // Raising EC to H overflows into Error
      const overflowed = fold(
        [QrCode.SetQrCodeErrorCorrection({ level: 'H' })],
        baseProps,
        downloaded,
      )
      expect(QrCode.isError(overflowed)).toBe(true)
      expect(QrCode.dataStateOf(overflowed)).toBe('error')
      expect(Option.isSome(QrCode.errorReasonOf(overflowed))).toBe(true)

      // Lowering EC back to L recovers into Ready
      const recovered = fold(
        [QrCode.SetQrCodeErrorCorrection({ level: 'L' })],
        baseProps,
        overflowed,
      )
      expect(QrCode.isReady(recovered)).toBe(true)
      expect(QrCode.levelOf(recovered)).toBe('L')

      const cleared = fold([QrCode.ClearQrCode()], baseProps, recovered)
      expect(QrCode.isEmpty(cleared)).toBe(true)
      expect(QrCode.valueOf(cleared)).toBe('')
    })
  })

  describe('reference-stable SlotBindings and Part.compose', () => {
    it('projects all 5 slots and preserves unchanged slot references across transitions', () => {
      const emptyView = Part.view(QrCode.part, QrCode.initial, baseProps)
      const emptyViewAgain = Part.view(QrCode.part, QrCode.initial, baseProps)
      expect(emptyViewAgain).toBe(emptyView)
      const emptyRoot = emptyView.slot('Root')
      expect(emptyView.slot('Frame').isHidden).toBe(true)
      expect(emptyView.slot('Pattern').isHidden).toBe(true)
      expect(emptyView.slot('Overlay').isHidden).toBe(true)
      expect(emptyView.slot('DownloadTrigger').isDisabled).toBe(true)

      const ready = fold([
        QrCode.SetQrCodeValue({ value: 'https://foldkit.dev' }),
      ])
      const readyView = Part.view(QrCode.part, ready, baseProps)
      expect(readyView.slot('Root')).toBe(emptyRoot)
      expect(readyView.slot('Frame').isHidden).toBeUndefined()
      expect(Slot.ariaOf(readyView.slot('Frame'))).toMatchObject({
        role: 'region',
        id: 'share-qr-frame',
        'aria-label': 'Share QR code: https://foldkit.dev',
        'aria-valuetext': '0 0 25 25',
      })
      expect(readyView.slot('Pattern').valueText?.startsWith('M0 0h7')).toBe(
        true,
      )
      expect(readyView.slot('Overlay').isHidden).toBeUndefined()
      expect(readyView.slot('DownloadTrigger').isDisabled).toBeUndefined()
    })

    it('composes cleanly into a Program with Part.compose', () => {
      const Base = makeProgram({
        id: 'qrcode-compose-test',
        version: 1,
        Model: S.Struct({ label: S.String }),
        Message: S.TaggedStruct('Renamed', { label: S.String }),
        init: () => [{ label: 'Link' }, []],
        update: (model, message) => [{ ...model, label: message.label }, []],
      })
      const App = Part.compose({
        of: Base,
        parts: [Part.given(QrCode.part, () => baseProps)],
      })
      const [initModel] = App.init()
      const [readyModel] = App.update(
        initModel,
        QrCode.SetQrCodeValue({ value: 'https://foldkit.dev' }),
      )
      expect(QrCode.isReady(readyModel.parts['QrCode'])).toBe(true)
    })
  })
})

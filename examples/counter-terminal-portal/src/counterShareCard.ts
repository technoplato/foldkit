import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'

const IMAGE_WIDTH = 1200
const IMAGE_HEIGHT = 630
const CHANNEL_COUNT = 3
const FILTER_BYTE_COUNT = 1
const FONT_HEIGHT = 7
const FONT_ADVANCE = 6
const PNG_COLOR_TYPE_TRUECOLOR = 2
const PNG_COMPRESSION_DEFLATE = 0
const PNG_FILTER_ADAPTIVE = 0
const PNG_INTERLACE_NONE = 0
const PNG_BIT_DEPTH = 8
const TITLE_SCALE = 8
const HEADING_SCALE = 4
const BODY_SCALE = 2
const URL_MAX_CHARS = 78

type Color = Readonly<{
  blue: number
  green: number
  red: number
}>

type PixelBuffer = Readonly<{
  data: Buffer
  rowStride: number
}>

/** Data rendered into the Counter portal Open Graph PNG card. */
export type CounterShareCardOptions = Readonly<{
  count: string
  decrementUrl: string
  incrementUrl: string
  mediumLabel: string
  stateUrl: string
}>

const BackgroundColor: Color = { blue: 16, green: 11, red: 9 }
const PanelColor: Color = { blue: 39, green: 31, red: 24 }
const AccentColor: Color = { blue: 94, green: 197, red: 34 }
const SoftAccentColor: Color = { blue: 140, green: 235, red: 74 }
const MutedColor: Color = { blue: 170, green: 161, red: 161 }
const TextColor: Color = { blue: 250, green: 250, red: 250 }
const UrlColor: Color = { blue: 208, green: 247, red: 187 }

const Glyphs = new Map<string, ReadonlyArray<string>>([
  [' ', ['00000', '00000', '00000', '00000', '00000', '00000', '00000']],
  ['?', ['01110', '10001', '00001', '00010', '00100', '00000', '00100']],
  ['.', ['00000', '00000', '00000', '00000', '00000', '00110', '00110']],
  [':', ['00000', '00110', '00110', '00000', '00110', '00110', '00000']],
  ['/', ['00001', '00010', '00010', '00100', '01000', '01000', '10000']],
  ['-', ['00000', '00000', '00000', '11111', '00000', '00000', '00000']],
  ['_', ['00000', '00000', '00000', '00000', '00000', '00000', '11111']],
  ['=', ['00000', '11111', '00000', '11111', '00000', '00000', '00000']],
  ['&', ['01100', '10010', '10100', '01000', '10101', '10010', '01101']],
  ['+', ['00000', '00100', '00100', '11111', '00100', '00100', '00000']],
  ['0', ['01110', '10001', '10011', '10101', '11001', '10001', '01110']],
  ['1', ['00100', '01100', '00100', '00100', '00100', '00100', '01110']],
  ['2', ['01110', '10001', '00001', '00010', '00100', '01000', '11111']],
  ['3', ['11110', '00001', '00001', '01110', '00001', '00001', '11110']],
  ['4', ['00010', '00110', '01010', '10010', '11111', '00010', '00010']],
  ['5', ['11111', '10000', '10000', '11110', '00001', '00001', '11110']],
  ['6', ['01110', '10000', '10000', '11110', '10001', '10001', '01110']],
  ['7', ['11111', '00001', '00010', '00100', '01000', '01000', '01000']],
  ['8', ['01110', '10001', '10001', '01110', '10001', '10001', '01110']],
  ['9', ['01110', '10001', '10001', '01111', '00001', '00001', '01110']],
  ['A', ['01110', '10001', '10001', '11111', '10001', '10001', '10001']],
  ['B', ['11110', '10001', '10001', '11110', '10001', '10001', '11110']],
  ['C', ['01110', '10001', '10000', '10000', '10000', '10001', '01110']],
  ['D', ['11110', '10001', '10001', '10001', '10001', '10001', '11110']],
  ['E', ['11111', '10000', '10000', '11110', '10000', '10000', '11111']],
  ['F', ['11111', '10000', '10000', '11110', '10000', '10000', '10000']],
  ['G', ['01110', '10001', '10000', '10111', '10001', '10001', '01111']],
  ['H', ['10001', '10001', '10001', '11111', '10001', '10001', '10001']],
  ['I', ['01110', '00100', '00100', '00100', '00100', '00100', '01110']],
  ['J', ['00001', '00001', '00001', '00001', '10001', '10001', '01110']],
  ['K', ['10001', '10010', '10100', '11000', '10100', '10010', '10001']],
  ['L', ['10000', '10000', '10000', '10000', '10000', '10000', '11111']],
  ['M', ['10001', '11011', '10101', '10101', '10001', '10001', '10001']],
  ['N', ['10001', '11001', '10101', '10011', '10001', '10001', '10001']],
  ['O', ['01110', '10001', '10001', '10001', '10001', '10001', '01110']],
  ['P', ['11110', '10001', '10001', '11110', '10000', '10000', '10000']],
  ['Q', ['01110', '10001', '10001', '10001', '10101', '10010', '01101']],
  ['R', ['11110', '10001', '10001', '11110', '10100', '10010', '10001']],
  ['S', ['01111', '10000', '10000', '01110', '00001', '00001', '11110']],
  ['T', ['11111', '00100', '00100', '00100', '00100', '00100', '00100']],
  ['U', ['10001', '10001', '10001', '10001', '10001', '10001', '01110']],
  ['V', ['10001', '10001', '10001', '10001', '10001', '01010', '00100']],
  ['W', ['10001', '10001', '10001', '10101', '10101', '10101', '01010']],
  ['X', ['10001', '10001', '01010', '00100', '01010', '10001', '10001']],
  ['Y', ['10001', '10001', '01010', '00100', '00100', '00100', '00100']],
  ['Z', ['11111', '00001', '00010', '00100', '01000', '10000', '11111']],
])

const makePixelBuffer = (): PixelBuffer => ({
  data: Buffer.alloc(
    (IMAGE_WIDTH * CHANNEL_COUNT + FILTER_BYTE_COUNT) * IMAGE_HEIGHT,
  ),
  rowStride: IMAGE_WIDTH * CHANNEL_COUNT + FILTER_BYTE_COUNT,
})

const writePixel = (
  image: PixelBuffer,
  x: number,
  y: number,
  color: Color,
): void => {
  const offset = y * image.rowStride + FILTER_BYTE_COUNT + x * CHANNEL_COUNT
  image.data.writeUInt8(color.red, offset)
  image.data.writeUInt8(color.green, offset + 1)
  image.data.writeUInt8(color.blue, offset + 2)
}

const fillRectangle = (
  image: PixelBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Color,
): void => {
  const startX = Math.max(0, x)
  const startY = Math.max(0, y)
  const endX = Math.min(IMAGE_WIDTH, x + width)
  const endY = Math.min(IMAGE_HEIGHT, y + height)

  if (startX < endX && startY < endY) {
    for (let nextY = startY; nextY < endY; nextY += 1) {
      for (let nextX = startX; nextX < endX; nextX += 1) {
        writePixel(image, nextX, nextY, color)
      }
    }
  }
}

const drawBackground = (image: PixelBuffer): void => {
  fillRectangle(image, 0, 0, IMAGE_WIDTH, IMAGE_HEIGHT, BackgroundColor)
  fillRectangle(
    image,
    64,
    56,
    IMAGE_WIDTH - 128,
    IMAGE_HEIGHT - 112,
    PanelColor,
  )
  fillRectangle(image, 64, 56, 14, IMAGE_HEIGHT - 112, AccentColor)
  fillRectangle(image, 92, 88, 176, 10, SoftAccentColor)
}

const drawGlyph = (
  image: PixelBuffer,
  glyph: ReadonlyArray<string>,
  x: number,
  y: number,
  scale: number,
  color: Color,
): void => {
  let rowIndex = 0
  for (const row of glyph) {
    let columnIndex = 0
    for (const pixel of row) {
      if (pixel === '1') {
        fillRectangle(
          image,
          x + columnIndex * scale,
          y + rowIndex * scale,
          scale,
          scale,
          color,
        )
      }
      columnIndex += 1
    }
    rowIndex += 1
  }
}

const drawText = (
  image: PixelBuffer,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: Color,
): void => {
  let nextX = x
  const fallbackGlyph = Glyphs.get('?')

  for (const character of text.toUpperCase()) {
    const glyph = Glyphs.get(character) ?? fallbackGlyph
    if (glyph !== undefined) {
      drawGlyph(image, glyph, nextX, y, scale, color)
    }
    nextX += FONT_ADVANCE * scale
  }
}

const wrapFixedWidth = (
  value: string,
  maxChars: number,
): ReadonlyArray<string> => {
  const lines = new Array<string>()
  let nextLine = ''

  for (const character of value) {
    if (nextLine.length >= maxChars) {
      lines.push(nextLine)
      nextLine = ''
    }
    nextLine += character
  }

  if (nextLine.length > 0) {
    lines.push(nextLine)
  }

  return lines
}

const drawWrappedText = (
  image: PixelBuffer,
  label: string,
  value: string,
  x: number,
  y: number,
): number => {
  drawText(image, label, x, y, BODY_SCALE, MutedColor)
  let nextY = y + FONT_HEIGHT * BODY_SCALE + 10
  for (const line of wrapFixedWidth(value, URL_MAX_CHARS)) {
    drawText(image, line, x, nextY, BODY_SCALE, UrlColor)
    nextY += FONT_HEIGHT * BODY_SCALE + 8
  }
  return nextY + 10
}

const makeChunk = (type: string, data: Buffer): Buffer => {
  const typeBuffer = Buffer.from(type, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  const crcBuffer = Buffer.alloc(4)
  const chunkBody = Buffer.concat([typeBuffer, data])

  lengthBuffer.writeUInt32BE(data.byteLength, 0)
  crcBuffer.writeUInt32BE(crc32(chunkBody), 0)

  return Buffer.concat([lengthBuffer, chunkBody, crcBuffer])
}

const crc32 = (buffer: Buffer): number => {
  let crc = 0xffffffff

  for (let index = 0; index < buffer.byteLength; index += 1) {
    crc = (crc ^ buffer.readUInt8(index)) >>> 0
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1)
      crc = ((crc >>> 1) ^ (0xedb88320 & mask)) >>> 0
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

const makeHeaderChunkData = (): Buffer => {
  const data = Buffer.alloc(13)
  data.writeUInt32BE(IMAGE_WIDTH, 0)
  data.writeUInt32BE(IMAGE_HEIGHT, 4)
  data.writeUInt8(PNG_BIT_DEPTH, 8)
  data.writeUInt8(PNG_COLOR_TYPE_TRUECOLOR, 9)
  data.writeUInt8(PNG_COMPRESSION_DEFLATE, 10)
  data.writeUInt8(PNG_FILTER_ADAPTIVE, 11)
  data.writeUInt8(PNG_INTERLACE_NONE, 12)
  return data
}

/** Renders a PNG image for sharing the current Counter portal state. */
export const renderCounterShareCardPng = (
  options: CounterShareCardOptions,
): Buffer => {
  const image = makePixelBuffer()
  drawBackground(image)

  drawText(image, 'Foldkit Counter', 112, 112, HEADING_SCALE, TextColor)
  drawText(image, options.mediumLabel, 112, 172, BODY_SCALE, MutedColor)
  drawText(image, options.count, 112, 222, TITLE_SCALE, AccentColor)

  let nextY = 364
  nextY = drawWrappedText(image, 'Current state', options.stateUrl, 112, nextY)
  nextY = drawWrappedText(image, 'Increment', options.incrementUrl, 112, nextY)
  drawWrappedText(image, 'Decrement', options.decrementUrl, 112, nextY)

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    makeChunk('IHDR', makeHeaderChunkData()),
    makeChunk('IDAT', deflateSync(image.data)),
    makeChunk('IEND', Buffer.alloc(0)),
  ])
}

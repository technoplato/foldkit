import { Array } from 'effect'
import { type Html, createLazy, html } from 'foldkit/html'
import type { Message } from 'words-core-example'

import { Byte, Charset, Encoder } from '@nuintun/qrcode'

const QUIET_ZONE_MODULES = 3
const FINDER_MODULES = 7
const encoder = new Encoder({ level: 'M' })
const qrSlot = createLazy()

const isInFinder = (size: number, x: number, y: number): boolean => {
  const isNearLeft = x < FINDER_MODULES
  const isNearTop = y < FINDER_MODULES
  const isNearRight = x >= size - FINDER_MODULES
  const isNearBottom = y >= size - FINDER_MODULES
  return (
    (isNearLeft && isNearTop) ||
    (isNearRight && isNearTop) ||
    (isNearLeft && isNearBottom)
  )
}

const finderPath = (left: number, top: number): string =>
  `M${left + 1.5} ${top}h4a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-1.5 1.5h-4A1.5 1.5 0 01${left} ${top + 5.5}v-4A1.5 1.5 0 01${left + 1.5} ${top}z` +
  `M${left + 1.6} ${top + 1}h3.8a.6.6 0 01.6.6v3.8a.6.6 0 01-.6.6h-3.8a.6.6 0 01-.6-.6v-3.8a.6.6 0 01.6-.6z` +
  `M${left + 2.9} ${top + 2}h1.2a.9.9 0 01.9.9v1.2a.9.9 0 01-.9.9h-1.2a.9.9 0 01-.9-.9v-1.2a.9.9 0 01.9-.9z`

const qrView = (text: string, label: string): Html => {
  const h = html<Message>()
  const encoded = encoder.encode(new Byte(text, Charset.UTF_8))
  const size = encoded.size
  const moduleRects = Array.flatMap(Array.range(0, size - 1), y =>
    Array.map(
      Array.filter(
        Array.range(0, size - 1),
        x => encoded.get(x, y) === 1 && !isInFinder(size, x, y),
      ),
      x => `M${x + 0.08} ${y + 0.08}h.84v.84h-.84z`,
    ),
  )
  const finders = [
    finderPath(0, 0),
    finderPath(size - FINDER_MODULES, 0),
    finderPath(0, size - FINDER_MODULES),
  ]
  const viewSize = size + QUIET_ZONE_MODULES * 2
  return h.svg(
    [
      h.ViewBox(
        `${-QUIET_ZONE_MODULES} ${-QUIET_ZONE_MODULES} ${viewSize} ${viewSize}`,
      ),
      h.Role('img'),
      h.AriaLabel(label),
      h.Class('block size-full'),
    ],
    [
      h.rect(
        [
          h.X(String(-QUIET_ZONE_MODULES)),
          h.Y(String(-QUIET_ZONE_MODULES)),
          h.Width(String(viewSize)),
          h.Height(String(viewSize)),
          h.Rx('3'),
          h.Fill('#ffffff'),
        ],
        [],
      ),
      h.path(
        [
          h.D(Array.join([...finders, ...moduleRects], '')),
          h.Fill('#111111'),
          h.FillRule('evenodd'),
        ],
        [],
      ),
    ],
  )
}

/** A QR code for `text`, drawn as SVG and recomputed only when the text changes. */
export const qrCode = (text: string, label: string): Html =>
  qrSlot(qrView, [text, label])

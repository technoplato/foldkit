import { Array, Result } from 'effect'

import { Byte, Charset, Encoder } from '@nuintun/qrcode'

const encoder = new Encoder({ level: 'M' })

const quietZoneModules = 4

/** A QR code as one SVG path on a `size` square, quiet zone included. */
export type QrDrawing = Readonly<{ path: string; size: number }>

/**
 * Draws a QR code on the origin, so the page loads no script from anyone
 * else to do it.
 *
 * @example
 * ```typescript
 * qrDrawingOf('https://brandon.pisspoursoftware.xyz')
 * // { path: 'M4 4h1v1h-1z…', size: 41 }
 * ```
 */
export const qrDrawingOf = (text: string): QrDrawing => {
  const encoded = encoder.encode(new Byte(text, Charset.UTF_8))
  const positions = Array.makeBy(encoded.size, row => row)
  const path = Array.flatMap(positions, y =>
    Array.filterMap(positions, x =>
      encoded.get(x, y) === 1
        ? Result.succeed(
            `M${(x + quietZoneModules).toString()} ${(y + quietZoneModules).toString()}h1v1h-1z`,
          )
        : Result.failVoid,
    ),
  ).join('')
  return { path, size: encoded.size + quietZoneModules * 2 }
}

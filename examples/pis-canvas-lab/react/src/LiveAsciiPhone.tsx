import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { AsciiFrame, AsciiHotspot } from './ascii-ui/types.js'

export type MonoCellMetrics = {
  /** Pixel width of one character cell. */
  cellW: number
  /** Pixel height of one row (line box). */
  cellH: number
}

type Props = {
  frame: AsciiFrame
  onHotspot: (h: AsciiHotspot) => void
  compact?: boolean
  /**
   * Fixed cell metrics (tests + calibrated hosts). When omitted, measures a
   * 10×"M" ruler with the same font as the <pre>.
   */
  cell?: MonoCellMetrics
  /** Show hit boxes (debug / manual QA). */
  showHitBoxes?: boolean
}

/** Content padding around the glyph grid (wrapper + hotspot origin). */
export const ASCII_PAD_Y = 6
export const ASCII_PAD_X = 4

const MONO_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'

/**
 * Overlay box from paint cell coords + mono metrics.
 * Pure — unit-tested so hit targets cannot drift from layout paint.
 *
 * Coordinate system: padding edge of the phone content wrapper.
 * Glyph (col=0,row=0) sits at (pad.x, pad.y).
 */
export function hotspotStyle(
  h: Pick<AsciiHotspot, 'row' | 'col' | 'width' | 'height'>,
  cell: MonoCellMetrics,
  pad: { x: number; y: number } = { x: ASCII_PAD_X, y: ASCII_PAD_Y },
): {
  left: number
  top: number
  width: number
  height: number
} {
  return {
    left: pad.x + h.col * cell.cellW,
    top: pad.y + h.row * cell.cellH,
    width: h.width * cell.cellW,
    height: h.height * cell.cellH,
  }
}

/**
 * Layout-space cell width (CSS px before ancestor transforms).
 *
 * Do **not** use getBoundingClientRect here: FoldkitCanvas applies
 * `transform: scale(...)`, and that shrinks rect widths while CSS left/top
 * stay in unscaled layout space — hit boxes then drift left of glyphs.
 */
export function measureMonoCellW(
  fontSize: number,
  fontFamily: string = MONO_STACK,
  ruler?: HTMLElement | null,
): number {
  // 1) Canvas metrics — not affected by CSS transforms on ancestors
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.font = `${fontSize}px ${fontFamily}`
      const w = ctx.measureText('M').width
      if (w > 0) return w
    }
  }
  // 2) offsetWidth of a 10×M ruler (layout box, ignores transform)
  if (ruler) {
    const w = ruler.offsetWidth
    if (w > 0) return w / 10
  }
  // 3) typical mono advance
  return fontSize * 0.6
}

/**
 * Pointer-interactive ASCII phone.
 * Hotspots share one padded content box with the <pre>; positions use measured
 * mono cell size in px (not `ch`, which drifts under scale / font quirks).
 */
export function LiveAsciiPhone({
  frame,
  onHotspot,
  compact,
  cell: cellProp,
  showHitBoxes = true,
}: Props) {
  const fontSize = compact ? 11 : 12.5
  const lineH = compact ? 13 : 15
  const rulerRef = useRef<HTMLSpanElement>(null)
  const [measured, setMeasured] = useState<MonoCellMetrics>({
    cellW: fontSize * 0.6,
    cellH: lineH,
  })

  useLayoutEffect(() => {
    if (cellProp) return
    const cellW = measureMonoCellW(fontSize, MONO_STACK, rulerRef.current)
    setMeasured({
      cellW,
      cellH: lineH,
    })
  }, [cellProp, fontSize, lineH, frame.lines.join('\n')])

  const cell = cellProp ?? measured

  const textStyle: React.CSSProperties = {
    margin: 0,
    padding: 0,
    fontFamily: MONO_STACK,
    fontSize,
    lineHeight: `${lineH}px`,
    letterSpacing: 0,
    fontVariantLigatures: 'none',
    fontFeatureSettings: '"liga" 0, "calt" 0',
    tabSize: 1,
    whiteSpace: 'pre',
  }

  const boxes = useMemo(
    () =>
      frame.hotspots.map(h => ({
        h,
        style: hotspotStyle(h, cell),
      })),
    [frame.hotspots, cell],
  )

  return (
    <div className="relative inline-block rounded-lg border border-stone-700 bg-stone-950 p-2 shadow-lg">
      <div className="relative overflow-hidden rounded-md bg-black">
        {/*
          Relative content root. Absolute hotspots use the padding edge as origin.
          Flow <pre> is inset by the same pad so glyph (0,0) == hotspot origin + pad.
        */}
        <div
          className="relative"
          data-ascii-phone
          data-cell-w={cell.cellW}
          data-cell-h={cell.cellH}
        >
          <pre
            className="m-0 text-emerald-400"
            style={{
              ...textStyle,
              padding: `${ASCII_PAD_Y}px ${ASCII_PAD_X}px`,
            }}
          >
            {frame.lines.join('\n')}
          </pre>
          {/* Hidden ruler: 10× M under the same font — measures cellW */}
          <span
            ref={rulerRef}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 -z-10 opacity-0"
            style={{
              ...textStyle,
              padding: 0,
              display: 'inline-block',
            }}
          >
            MMMMMMMMMM
          </span>
          {boxes.map(({ h, style }) => (
            <button
              key={h.id}
              type="button"
              title={h.label}
              aria-label={h.label}
              data-hotspot-id={h.id}
              data-hotspot-row={h.row}
              data-hotspot-col={h.col}
              data-hotspot-w={h.width}
              data-hotspot-h={h.height}
              onClick={e => {
                e.stopPropagation()
                onHotspot(h)
              }}
              className={
                showHitBoxes
                  ? 'absolute m-0 box-border rounded-[1px] border border-amber-400/80 bg-amber-400/20 p-0'
                  : 'absolute m-0 box-border rounded-[1px] border border-amber-400/0 bg-amber-400/0 p-0 transition-colors hover:border-amber-400/55 hover:bg-amber-400/15 focus-visible:border-amber-400 focus-visible:outline-none'
              }
              style={{
                left: style.left,
                top: style.top,
                width: style.width,
                height: style.height,
              }}
            />
          ))}
        </div>
      </div>
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-stone-600" />
    </div>
  )
}

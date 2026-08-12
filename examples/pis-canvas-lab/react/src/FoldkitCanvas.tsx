import {
  useMultipleCountersActions,
  useMultipleCountersModel,
} from 'pis-canvas-lab-react-bindings-example'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  countersCanvasNodes,
  renderAscii,
  type AsciiHotspot,
  type CountersActions,
} from './ascii-ui/index.js'
import { LiveAsciiPhone } from './LiveAsciiPhone.js'

const CARD_W = 320

/**
 * PIS canvas: Foldkit Model → atomic UI tree → AsciiSurface → phones.
 * Cells pan to active destination; ASCII updates with Model.
 */
export function FoldkitCanvas() {
  const model = useMultipleCountersModel()
  const actions = useMultipleCountersActions() as CountersActions

  const nodeSpecs = countersCanvasNodes(model, actions)
  const nodes = nodeSpecs.map(n => ({
    ...n,
    frame: renderAscii(n.tree),
  }))
  const activeUri = nodes.find(n => n.active)?.uri ?? nodes[0]?.uri

  const [canvas, setCanvas] = useState({ x: 48, y: 48, scale: 0.85 })
  const [panning, setPanning] = useState(false)
  const drag = useRef<{
    mode: 'pan' | null
    sx: number
    sy: number
    ox: number
    oy: number
  }>({ mode: null, sx: 0, sy: 0, ox: 0, oy: 0 })
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = nodes.find(n => n.uri === activeUri)
    const el = rootRef.current
    if (!node || !el) return
    const vw = el.clientWidth
    const vh = el.clientHeight
    let cancelled = false
    let raf = 0
    setCanvas(from => {
      const scale = Math.max(from.scale, 0.75)
      const target = {
        scale,
        x: vw / 2 - (node.x + CARD_W / 2) * scale,
        y: vh / 2 - (node.y + 160) * scale,
      }
      const start = performance.now()
      const dur = 420
      const step = (now: number) => {
        if (cancelled) return
        const t = Math.min(1, (now - start) / dur)
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        setCanvas({
          scale: from.scale + (target.scale - from.scale) * e,
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
        })
        if (t < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
      return from
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUri])

  const dispatch = useCallback(
    (h: AsciiHotspot) => {
      // Prefer layout-attached onPress via re-render; hotspots carry action tags
      const a = h.action
      switch (a._tag) {
        case 'add':
          actions.clickedAddCounter()
          break
        case 'open':
          actions.selectedCounter(a.counterId)
          break
        case 'inc':
          actions.clickedIncrementCounter(a.counterId)
          break
        case 'dec':
          actions.clickedDecrementCounter(a.counterId)
          break
        case 'reset':
          actions.clickedResetCounter(a.counterId)
          break
        case 'back':
          actions.dismissedCounterDetail()
          break
        case 'delete':
          actions.clickedDeleteCounter()
          break
        case 'cancelDelete':
          actions.cancelledDeleteCounter()
          break
        case 'confirmDelete':
          actions.confirmedDeleteCounter()
          break
        default:
          break
      }
    },
    [actions],
  )

  return (
    <div
      ref={rootRef}
      className="relative h-[min(70vh,720px)] w-full overflow-hidden rounded-2xl border border-stone-800 bg-stone-950"
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, rgb(68 64 60 / 0.55) 1px, transparent 0)',
        backgroundSize: `${18 * canvas.scale}px ${18 * canvas.scale}px`,
        backgroundPosition: `${canvas.x}px ${canvas.y}px`,
        cursor: panning ? 'grabbing' : 'grab',
      }}
      onWheel={e => {
        e.preventDefault()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        const next = Math.min(2.2, Math.max(0.35, canvas.scale * factor))
        const wx = (mx - canvas.x) / canvas.scale
        const wy = (my - canvas.y) / canvas.scale
        setCanvas({
          scale: next,
          x: mx - wx * next,
          y: my - wy * next,
        })
      }}
      onPointerDown={e => {
        if ((e.target as HTMLElement).dataset?.['canvasBg'] === '1' || e.altKey) {
          drag.current = {
            mode: 'pan',
            sx: e.clientX,
            sy: e.clientY,
            ox: canvas.x,
            oy: canvas.y,
          }
          setPanning(true)
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }
      }}
      onPointerMove={e => {
        if (drag.current.mode !== 'pan') return
        setCanvas({
          ...canvas,
          x: drag.current.ox + (e.clientX - drag.current.sx),
          y: drag.current.oy + (e.clientY - drag.current.sy),
        })
      }}
      onPointerUp={() => {
        drag.current.mode = null
        setPanning(false)
      }}
    >
      <div data-canvas-bg="1" className="absolute inset-0" />

      <div
        className="absolute origin-top-left will-change-transform"
        style={{
          transform: `translate(${canvas.x}px, ${canvas.y}px) scale(${canvas.scale})`,
        }}
      >
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={900}
          height={800}
        >
          <path
            d="M 360 140 C 380 140, 380 140, 400 140"
            fill="none"
            stroke="rgb(120 113 108)"
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
        </svg>

        {nodes.map(n => (
          <div
            key={n.uri}
            className={
              n.active
                ? 'absolute rounded-xl border-2 border-amber-400 bg-stone-900 shadow-xl ring-2 ring-amber-400/30'
                : 'absolute rounded-xl border border-stone-700 bg-stone-900 shadow-md'
            }
            style={{ left: n.x, top: n.y, width: CARD_W }}
          >
            <div className="border-b border-stone-800 px-3 py-2">
              <div className="font-mono text-[10px] text-amber-300/90">
                {n.uri}
                {n.active ? ' · active' : ''}
              </div>
              <div className="text-sm font-medium text-stone-100">{n.title}</div>
              <p className="mt-0.5 text-[11px] text-stone-400">{n.summary}</p>
            </div>
            <div className="flex justify-center bg-black/40 p-2">
              <LiveAsciiPhone compact frame={n.frame} onHotspot={dispatch} />
            </div>
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-stone-700 bg-stone-900/95 px-2 py-1 font-mono text-[11px] text-stone-400">
        AsciiSurface · VStack/HStack/Text/Button · Foldkit Model · hotspots from
        layout
      </div>
    </div>
  )
}

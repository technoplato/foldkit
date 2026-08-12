import * as Calculator from 'calculator-core-example'
import * as Counter from 'counter-core-example'
import {
  CounterListProgram,
  DemoCatalog,
  FocusedSlotChanged,
  GotCalculatorMessage,
  GotCounterListMessage,
  GotSingleCounterMessage,
  ShowcaseShell,
  ToggledShowCalc,
  ToggledShowList,
  ToggledShowMulti,
  ToggledShowSingle,
} from 'pis-canvas-lab-core-example'
import {
  useMultipleCountersActions,
  usePisCanvasLabEnqueue,
  usePisCanvasLabModel,
} from 'pis-canvas-lab-react-bindings-example'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  labCanvasNodes,
  renderAscii,
  type AsciiHotspot,
  type CountersActions,
} from './ascii-ui/index.js'
import { LiveAsciiPhone } from './LiveAsciiPhone.js'

const CARD_W = 300

/**
 * Full-viewport PIS map: all composed demos as ASCII phones.
 * Pan / wheel-zoom; click a card to focus that demo slot.
 */
export function FoldkitCanvas() {
  const lab = usePisCanvasLabModel()
  const enqueue = usePisCanvasLabEnqueue()
  const multiActions = useMultipleCountersActions() as CountersActions

  const nodeSpecs = useMemo(
    () =>
      labCanvasNodes(
        {
          single: lab.demos.single,
          multi: lab.demos.multi,
          calc: lab.demos.calc,
          list: lab.demos.list,
          chrome: lab.chrome,
        },
        multiActions,
      ),
    [lab, multiActions],
  )

  const nodes = nodeSpecs.map(n => ({
    ...n,
    frame: renderAscii(n.tree),
  }))
  const activeUri = nodes.find(n => n.active)?.uri ?? nodes[0]?.uri

  const [canvas, setCanvas] = useState({ x: 48, y: 48, scale: 0.78 })
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
      const scale = Math.max(from.scale, 0.7)
      const target = {
        scale,
        x: vw / 2 - (node.x + CARD_W / 2) * scale,
        y: vh / 2 - (node.y + 180) * scale,
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

  const focusSlot = useCallback(
    (slot: 'single' | 'multi' | 'calc' | 'list' | 'chrome') => {
      enqueue(FocusedSlotChanged({ slot }))
    },
    [enqueue],
  )

  const dispatch = useCallback(
    (h: AsciiHotspot) => {
      const a = h.action
      switch (a._tag) {
        case 'add':
          multiActions.clickedAddCounter()
          break
        case 'open':
          multiActions.selectedCounter(a.counterId)
          break
        case 'inc':
          multiActions.clickedIncrementCounter(a.counterId)
          break
        case 'dec':
          multiActions.clickedDecrementCounter(a.counterId)
          break
        case 'reset':
          multiActions.clickedResetCounter(a.counterId)
          break
        case 'back':
          multiActions.dismissedCounterDetail()
          break
        case 'delete':
          multiActions.clickedDeleteCounter()
          break
        case 'cancelDelete':
          multiActions.cancelledDeleteCounter()
          break
        case 'confirmDelete':
          multiActions.confirmedDeleteCounter()
          break
        case 'singleInc':
          enqueue(GotSingleCounterMessage({ message: Counter.ClickedIncrement() }))
          break
        case 'singleDec':
          enqueue(GotSingleCounterMessage({ message: Counter.ClickedDecrement() }))
          break
        case 'singleReset':
          enqueue(GotSingleCounterMessage({ message: Counter.ClickedReset() }))
          break
        case 'calc': {
          let message: Calculator.Message
          switch (a.kind) {
            case 'digit':
              message = Calculator.PressedDigit({
                digit: a.digit as Calculator.Digit,
              })
              break
            case 'op':
              message = Calculator.PressedOperation({
                operation: a.operation as Calculator.Operation,
              })
              break
            case 'clear':
              message = Calculator.PressedClear()
              break
            case 'equals':
              message = Calculator.PressedEquals()
              break
            case 'dot':
              message = Calculator.PressedDecimalSeparator()
              break
            case 'percent':
              message = Calculator.PressedPercent()
              break
            case 'sign':
              message = Calculator.PressedSign()
              break
            case 'backspace':
              message = Calculator.PressedBackspace()
              break
            default:
              return
          }
          enqueue(GotCalculatorMessage({ message }))
          break
        }
        case 'listAdd':
          enqueue(
            GotCounterListMessage({ message: CounterListProgram.addRow }),
          )
          break
        case 'listRemove':
          enqueue(
            GotCounterListMessage({
              message: CounterListProgram.removeRow(a.id),
            }),
          )
          break
        case 'listInc':
          enqueue(
            GotCounterListMessage({
              message: CounterListProgram.childMessage(
                a.id,
                Counter.ClickedIncrement(),
              ),
            }),
          )
          break
        case 'listDec':
          enqueue(
            GotCounterListMessage({
              message: CounterListProgram.childMessage(
                a.id,
                Counter.ClickedDecrement(),
              ),
            }),
          )
          break
        case 'focusDemo':
          focusSlot(a.slot)
          break
        default:
          break
      }
    },
    [enqueue, multiActions, focusSlot],
  )

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      {/* Thin toolbar — PIS-like chrome, not a marketing hero */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-800 bg-stone-950/95 px-3 py-2">
        <div className="mr-2">
          <div className="text-sm font-semibold text-stone-100">PIS lab</div>
          <div className="text-[10px] text-stone-500">
            compose · map ≠ territory
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['single', lab.chrome.showSingle, ToggledShowSingle],
              ['multi', lab.chrome.showMulti, ToggledShowMulti],
              ['calc', lab.chrome.showCalc, ToggledShowCalc],
              ['list', lab.chrome.showList, ToggledShowList],
            ] as const
          ).map(([id, on, toggle]) => (
            <button
              key={id}
              type="button"
              onClick={() => enqueue(toggle())}
              className={
                on
                  ? 'rounded-md bg-amber-400/20 px-2 py-1 font-mono text-[11px] text-amber-200'
                  : 'rounded-md border border-stone-700 px-2 py-1 font-mono text-[11px] text-stone-500'
              }
            >
              {id}
            </button>
          ))}
        </div>
        <div className="ml-auto font-mono text-[10px] text-stone-500">
          focus={lab.chrome.focusedSlot} · scale={canvas.scale.toFixed(2)} ·
          demos={DemoCatalog.keys.join('+')}
        </div>
      </div>

      <div
        ref={rootRef}
        className="relative min-h-0 flex-1 w-full overflow-hidden bg-stone-950"
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
          if (
            (e.target as HTMLElement).dataset?.['canvasBg'] === '1' ||
            e.altKey
          ) {
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
          {nodes.map(n => (
            <div
              key={n.uri}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (n.uri.startsWith('demos.single')) focusSlot('single')
                else if (n.uri.startsWith('counters')) focusSlot('multi')
                else if (n.uri.startsWith('demos.calc')) focusSlot('calc')
                else if (n.uri.startsWith('demos.list')) focusSlot('list')
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  ;(e.currentTarget as HTMLElement).click()
                }
              }}
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
                <div className="text-sm font-medium text-stone-100">
                  {n.title}
                </div>
                <p className="mt-0.5 text-[11px] text-stone-400">{n.summary}</p>
              </div>
              <div className="flex justify-center bg-black/40 p-2">
                <LiveAsciiPhone compact frame={n.frame} onHotspot={dispatch} />
              </div>
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-stone-700 bg-stone-900/95 px-2 py-1 font-mono text-[11px] text-stone-400">
          scroll zoom · drag empty · alt-drag ·{' '}
          {ShowcaseShell.id}
        </div>
      </div>
    </div>
  )
}

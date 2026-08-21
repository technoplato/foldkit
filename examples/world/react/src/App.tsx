import { Match as M, Option } from 'effect'
import { useEffect } from 'react'
import {
  messageFromKey,
  overlayOf,
  townCells,
  townWidth,
} from 'world-core-example'
import { useWorldModel, useWorldSend } from 'world-react-bindings-example'

const cellClass = (glyph: string): string => {
  if (glyph === '@') {
    return 'bg-amber-300 text-stone-900'
  }
  if (glyph === 'V') {
    return 'bg-rose-700 text-amber-100'
  }
  if (glyph === '!') {
    return 'bg-amber-800 text-amber-100'
  }
  if (glyph === '#') {
    return 'bg-stone-800 text-stone-400'
  }
  return 'bg-emerald-800 text-emerald-200'
}

/** 2D town view over the shared World Program. */
export const App = () => {
  const model = useWorldModel()
  const send = useWorldSend()
  const overlay = overlayOf(model)
  const cells = townCells(model)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const maybeMessage = messageFromKey(event.key, model)
      if (Option.isNone(maybeMessage)) {
        return
      }
      event.preventDefault()
      send(maybeMessage.value)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [model, send])

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-stone-950 p-4 text-stone-100">
      <h1 className="mb-2 font-mono text-sm tracking-widest text-amber-300">
        KNOPHY TOWN
      </h1>
      <p className="mb-4 font-mono text-xs text-stone-400">
        Arrows W S D walk. Q west. A talks. Esc dismisses.
      </p>
      <div
        className="grid gap-px rounded border border-stone-700 bg-stone-900 p-1"
        style={{
          gridTemplateColumns: `repeat(${String(townWidth)}, 1.75rem)`,
        }}
      >
        {cells.map(cell => (
          <div
            key={`${String(cell.x)}:${String(cell.z)}`}
            className={`flex h-7 w-7 items-center justify-center font-mono text-sm ${cellClass(cell.glyph)}`}
          >
            {cell.glyph}
          </div>
        ))}
      </div>
      {M.value(overlay).pipe(
        M.tagsExhaustive({
          Hidden: () => null,
          SignOverlay: ({ speaker, overlay: body }) => (
            <div className="absolute inset-0 flex items-end justify-center bg-black/70 p-6">
              <div className="w-full max-w-xl rounded-lg border-4 border-stone-200 bg-stone-900 p-4">
                <p className="mb-2 font-mono text-xs tracking-widest text-amber-300">
                  {speaker}
                </p>
                <p className="font-serif text-lg leading-relaxed">{body}</p>
                <p className="mt-3 font-mono text-xs text-stone-400">
                  A / Esc dismiss
                </p>
              </div>
            </div>
          ),
          VendingOverlay: ({ keypadBuffer, vendPhase, listPriceDisplay }) => (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6">
              <div className="w-full max-w-md rounded-lg border-4 border-amber-400 bg-stone-950 p-4 font-mono text-amber-100">
                <p className="text-xs tracking-widest">THE CLIP</p>
                <p className="text-2xl">{`listed ${listPriceDisplay}`}</p>
                <p className="mt-3 text-lg">
                  {keypadBuffer === '' ? '____' : keypadBuffer}
                </p>
                <p className="text-sm text-amber-300">{vendPhase}</p>
              </div>
            </div>
          ),
        }),
      )}
    </main>
  )
}

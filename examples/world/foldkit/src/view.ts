import { Array, Match as M } from 'effect'
import { Document, html, type Html } from 'foldkit/html'
import {
  type Message,
  type Model,
  messageFromKey,
  overlayOf,
  townCells,
  townWidth,
} from 'world-core-example'

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

const overlayView = (model: Model): Html => {
  const h = html<Message>()
  const overlay = overlayOf(model)
  return M.value(overlay).pipe(
    M.tagsExhaustive({
      Hidden: () => h.empty,
      SignOverlay: ({ speaker, overlay: body }) =>
        h.div(
          [
            h.Class(
              'absolute inset-0 flex items-end justify-center bg-black/70 p-6',
            ),
            h.Role('dialog'),
            h.AriaLabel(speaker),
          ],
          [
            h.div(
              [
                h.Class(
                  'w-full max-w-xl rounded-lg border-4 border-stone-200 bg-stone-900 p-4 text-stone-100 shadow-xl',
                ),
              ],
              [
                h.p(
                  [h.Class('mb-2 font-mono text-xs tracking-widest text-amber-300')],
                  [speaker],
                ),
                h.p([h.Class('font-serif text-lg leading-relaxed')], [body]),
                h.p(
                  [h.Class('mt-3 font-mono text-xs text-stone-400')],
                  ['A / Esc dismiss'],
                ),
              ],
            ),
          ],
        ),
      VendingOverlay: ({ keypadBuffer, vendPhase, listPriceDisplay }) =>
        h.div(
          [
            h.Class(
              'absolute inset-0 flex items-center justify-center bg-black/70 p-6',
            ),
            h.Role('dialog'),
            h.AriaLabel('Vending machine'),
          ],
          [
            h.div(
              [
                h.Class(
                  'w-full max-w-md rounded-lg border-4 border-amber-400 bg-stone-950 p-4 font-mono text-amber-100',
                ),
              ],
              [
                h.p([h.Class('text-xs tracking-widest')], ['THE CLIP']),
                h.p(
                  [h.Class('text-2xl')],
                  [`listed ${listPriceDisplay}`],
                ),
                h.p([h.Class('mt-3 text-lg')], [keypadBuffer === '' ? '____' : keypadBuffer]),
                h.p([h.Class('text-sm text-amber-300')], [vendPhase]),
                h.p(
                  [h.Class('mt-3 text-xs text-stone-400')],
                  ['Dial 1428. Enter. Pay Devnet. Esc leaves.'],
                ),
              ],
            ),
          ],
        ),
    }),
  )
}

/** Renders the 2D town and the exclusive overlay. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const cells = townCells(model)
  return {
    title: 'World | Knophy',
    body: h.main(
      [
        h.Class(
          'relative flex min-h-screen flex-col items-center justify-center bg-stone-950 p-4 text-stone-100',
        ),
        h.Tabindex(0),
        h.AriaLabel('Town yard'),
        h.OnKeyDownPreventDefault((key) => messageFromKey(key, model)),
      ],
      [
        h.h1(
          [h.Class('mb-2 font-mono text-sm tracking-widest text-amber-300')],
          ['KNOPHY TOWN'],
        ),
        h.p(
          [h.Class('mb-4 font-mono text-xs text-stone-400')],
          ['Arrows W S D walk. Q west. A talks. Esc dismisses.'],
        ),
        h.div(
          [
            h.Class('grid gap-px rounded border border-stone-700 bg-stone-900 p-1'),
            h.Style({
              gridTemplateColumns: `repeat(${String(townWidth)}, 1.75rem)`,
            }),
          ],
          Array.map(cells, cell =>
            h.keyed('div')(
              `${String(cell.x)}:${String(cell.z)}`,
              [
                h.Class(
                  `flex h-7 w-7 items-center justify-center font-mono text-sm ${cellClass(cell.glyph)}`,
                ),
              ],
              [cell.glyph],
            ),
          ),
        ),
        overlayView(model),
      ],
    ),
  }
}

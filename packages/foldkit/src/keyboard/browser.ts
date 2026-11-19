import { Effect, Layer, Queue, Stream } from 'effect'

import { HardwareKeyboard } from './keyboard.js'

// BROWSER

// NOTE: A page cannot ask whether a keyboard is attached. A pointer that
// hovers and points finely, a mouse or a trackpad, comes with one on
// every device that has it; a touch screen alone does not. A tablet
// reports the change when a keyboard case with a trackpad is attached.
const pointerQuery = '(hover: hover) and (pointer: fine)'

const attached: Stream.Stream<boolean> =
  typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? Stream.make(false)
    : Stream.callback<boolean>(queue =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const query = window.matchMedia(pointerQuery)
            const report = (): void => {
              Queue.offerUnsafe(queue, query.matches)
            }
            report()
            query.addEventListener('change', report)
            return { query, report }
          }),
          ({ query, report }) =>
            Effect.sync(() => {
              query.removeEventListener('change', report)
            }),
        ),
      )

/**
 * A browser's keyboard, as a page can tell: attached where the pointer
 * hovers and points finely, and reported again when that changes.
 */
export const browserHardwareKeyboard = Layer.succeed(HardwareKeyboard, {
  attached,
})

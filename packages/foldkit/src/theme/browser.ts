import { Effect, Layer, Option, Queue, Stream } from 'effect'

import { maybePage } from '../environment/environment.js'
import { SystemAppearance } from './appearance.js'
import type { Mode } from './theme.js'

// BROWSER

const darkQuery = '(prefers-color-scheme: dark)'

const modeOfQuery = (query: Readonly<{ matches: boolean }>): Mode =>
  query.matches ? 'Dark' : 'Light'

/**
 * A browser's report of the system's mode: the page's mode now, then each
 * change, read from the one media query a browser offers for it. This
 * host adapter is the only code that asks; it hands the answer to the
 * Program as a fact, and no painter or stylesheet asks again. Outside a
 * page it reports light once.
 *
 * @example
 * ```typescript
 * Layer.mergeAll(resources, browserSystemAppearance)
 * ```
 */
export const browserSystemAppearance = Layer.succeed(SystemAppearance, {
  modes: Option.match(maybePage(), {
    onNone: () => Stream.make<[Mode]>('Light'),
    onSome: page =>
      Stream.callback<Mode>(queue =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const query = page.window.matchMedia(darkQuery)
            const report = (): void => {
              Queue.offerUnsafe(queue, modeOfQuery(query))
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
      ),
  }),
})

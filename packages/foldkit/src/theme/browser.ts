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

// PAGE

/** Where the last resolved mode is mirrored for a page's first paint. */
export const modeStorageKey = 'foldkit.mode'

/** The attribute a page carries its mode in, `data-fk-mode="Dark"`. */
const pageModeAttribute = 'data-fk-mode'

/** The part of a page the mode is written to: its root and its storage. */
export type ModePage = Readonly<{
  root: Readonly<{ setAttribute: (name: string, value: string) => void }>
  storage: Readonly<{ setItem: (key: string, value: string) => void }>
}>

/**
 * Tells a page the mode its Program resolved: sets it on the root, where
 * the theme's stylesheet reads it, and mirrors it for the next first
 * paint. A host calls it each time the Model's mode changes. It is the
 * only writer of the mirror; a mirror that cannot be written is ignored.
 *
 * @example
 * ```typescript
 * handle.subscribe(() => {
 *   paintModeOnPage(modeOfState(model.appearance), { root: document.documentElement, storage: localStorage })
 * })
 * ```
 */
export const paintModeOnPage = (mode: Mode, page: ModePage): void => {
  page.root.setAttribute(pageModeAttribute, mode)
  try {
    page.storage.setItem(modeStorageKey, mode)
  } catch {
    // NOTE: A full or forbidden storage only costs the next first paint.
  }
}

/**
 * The script a page runs before its first paint, so it opens in the mode
 * it was last in instead of flashing light: it reads the mirror
 * {@link paintModeOnPage} wrote and sets the same attribute. It is the
 * one reader of the mirror, it runs before the Program exists, and the
 * Program's own mode replaces it as soon as it starts. No component reads
 * the mirror.
 *
 * @example
 * ```html
 * <script>/* firstPaintScript() *\/</script>
 * ```
 */
export const firstPaintScript = (): string =>
  `try{var m=localStorage.getItem(${JSON.stringify(modeStorageKey)});if(m==="Dark"||m==="Light"){document.documentElement.setAttribute("${pageModeAttribute}",m)}}catch(e){}`

import { Effect, Layer, Option, Queue, Stream } from 'effect'

import { maybePage } from '../environment/environment.js'
import { SystemAppearance } from './appearance.js'
import type { Contrast, Mode } from './theme.js'

// BROWSER

const darkQuery = '(prefers-color-scheme: dark)'

const modeOfQuery = (query: Readonly<{ matches: boolean }>): Mode =>
  query.matches ? 'Dark' : 'Light'

const moreContrastQuery = '(prefers-contrast: more)'

const contrastOfQuery = (query: Readonly<{ matches: boolean }>): Contrast =>
  query.matches ? 'More' : 'Standard'

/**
 * A browser's report of the system's mode: the page's mode now, then each
 * change, read from the one media query a browser offers for it. This
 * host adapter is the only code that asks; it hands the answer to the
 * Program as a fact, and no painter or stylesheet asks again. Outside a
 * page it reports light once. It reports the contrast the system asks
 * for the same way: the usual, or more.
 *
 * @example
 * ```typescript
 * Layer.mergeAll(resources, browserSystemAppearance)
 * ```
 */
const reportsOf = <A>(
  queryText: string,
  read: (query: Readonly<{ matches: boolean }>) => A,
  outsideAPage: A,
): Stream.Stream<A> =>
  Option.match(maybePage(), {
    onNone: () => Stream.make(outsideAPage),
    onSome: page =>
      Stream.callback<A>(queue =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const query = page.window.matchMedia(queryText)
            const report = (): void => {
              Queue.offerUnsafe(queue, read(query))
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
  })

export const browserSystemAppearance = Layer.succeed(SystemAppearance, {
  modes: reportsOf<Mode>(darkQuery, modeOfQuery, 'Light'),
  contrasts: reportsOf<Contrast>(
    moreContrastQuery,
    contrastOfQuery,
    'Standard',
  ),
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

/**
 * The first-paint script for a page with no remembered mode yet: it uses
 * the remembered mode when there is one, as {@link firstPaintScript}
 * does, and otherwise takes the system's mode, once, so a first visit on
 * a dark system does not open light, and with More Contrast where the
 * system asks for it. It runs before the Program exists
 * and is the first paint's own exception; once the Program starts, the
 * mode is the Model's, heard from the host as a fact.
 *
 * @example
 * ```html
 * <script>/* firstPaintScriptFollowingSystem() *\/</script>
 * ```
 */
export const firstPaintScriptFollowingSystem = (): string =>
  `try{var m=localStorage.getItem(${JSON.stringify(modeStorageKey)});if(m!=="Dark"&&m!=="Light"){m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"Dark":"Light"}document.documentElement.setAttribute("${pageModeAttribute}",m);if(window.matchMedia&&window.matchMedia("(prefers-contrast: more)").matches){document.documentElement.setAttribute("data-fk-contrast","More")}}catch(e){}`

/** The attribute a page carries More Contrast in, `data-fk-contrast="More"`. */
const pageContrastAttribute = 'data-fk-contrast'

/** The part of a page the contrast is written to: its root. */
export type ContrastPage = Readonly<{
  setAttribute: (name: string, value: string) => void
  removeAttribute: (name: string) => void
}>

/**
 * Tells a page the contrast its Program resolved: the attribute is there
 * while it is More, where the theme's stylesheet reads it, and gone for
 * the usual contrast. A host calls it each time the Model's contrast
 * changes.
 *
 * @example
 * ```typescript
 * paintContrastOnPage(contrastOfState(model.appearance), document.documentElement)
 * ```
 */
export const paintContrastOnPage = (
  contrast: Contrast,
  root: ContrastPage,
): void => {
  if (contrast === 'More') {
    root.setAttribute(pageContrastAttribute, 'More')
  } else {
    root.removeAttribute(pageContrastAttribute)
  }
}

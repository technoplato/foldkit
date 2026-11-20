import { Array } from 'effect'

import {
  type Counter,
  documentUses,
  domImports,
  domUses,
  heldState,
  listeners,
  numbers,
  timers,
  windowUses,
} from './count'

/**
 * One set of files that is counted and held to its checked-in ledger:
 * which files, what is counted in them, and what to tell someone whose
 * change raised a count.
 */
export type Ratchet = Readonly<{
  name: string
  ledgerPath: string
  roots: ReadonlyArray<string>
  covers: (filePath: string) => boolean
  counters: ReadonlyArray<Counter>
  heading: (fileCount: number, totals: string) => string
  whereItGoes: ReadonlyArray<string>
}>

// FILES

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|svelte)$/

const NOT_SOURCE = [
  /\.test\.[a-z]+$/,
  /\.d\.ts$/,
  /\.config\.[a-z]+$/,
  /(^|\/)(test|node_modules|dist)\//,
]

const isSource = (filePath: string): boolean =>
  SOURCE_FILE.test(filePath) &&
  !Array.some(NOT_SOURCE, pattern => pattern.test(filePath))

const PAINTER_FILES = [
  /^packages\/foldkit\/src\/renderers\/html[^/]*\.ts$/,
  /^packages\/foldkit\/src\/interaction\/document[^/]*\.ts$/,
  /^packages\/foldkit\/src\/cli\/(surface|terminalScreen|tui|tail|view)\.ts$/,
  /^packages\/(react|react-native|svelte|opentui)\/src\//,
  /^examples\/(books|counter|words)\/(?!core\/|scripts\/|headless\/)[^/]+\/(src|app)\//,
]

// NOTE: these sit in a Client folder and paint nothing. They fill a port a
// core declares (AGENTS.md, layer 4): the page's audio element, the
// microphone, the compressed copy of a recording. Their timers are the
// service's own, so zero is not where they are headed.
const SERVICE_ADAPTERS = [
  /^examples\/words\/foldkit\/src\/(audio|capture|copyAudio|resources)\.ts$/,
]

const PAINTER_ROOTS = [
  'packages/foldkit/src/renderers',
  'packages/foldkit/src/interaction',
  'packages/foldkit/src/cli',
  'packages/react/src',
  'packages/react-native/src',
  'packages/svelte/src',
  'packages/opentui/src',
  'examples/books',
  'examples/counter',
  'examples/words',
]

/**
 * Whether a file is a painter's: the HTML painter and its edge, the page's
 * hint and key listeners, the terminal painters, everything in
 * `@foldkit/react`, `@foldkit/react-native`, `@foldkit/svelte` and
 * `@foldkit/opentui`, and the Client folders of Books, Counter and Words,
 * the three apps plan 14 covers. A Client that draws nothing (`headless`)
 * and a service adapter (`examples/words/foldkit/src/audio.ts`) are not a
 * painter's. A file that does not exist yet is covered by where it would
 * sit.
 *
 * @example
 * ```typescript
 * isPainterFile('packages/react/src/paintReact/quiet.tsx') // true
 * isPainterFile('examples/words/foldkit/src/browser.ts') // true
 * isPainterFile('packages/foldkit/src/behavior/reader.ts') // false
 * isPainterFile('examples/words/foldkit/src/audio.ts') // false
 * isPainterFile('packages/react/src/paintReact/paintReact.test.tsx') // false
 * ```
 */
export const isPainterFile = (filePath: string): boolean =>
  isSource(filePath) &&
  Array.some(PAINTER_FILES, pattern => pattern.test(filePath)) &&
  !Array.some(SERVICE_ADAPTERS, pattern => pattern.test(filePath))

const UI_FILES = /^packages\/ui\/src\//

/**
 * Whether a file is one of `@foldkit/ui`'s own.
 *
 * @example
 * ```typescript
 * isUiFile('packages/ui/src/menu/menu.ts') // true
 * isUiFile('packages/ui/src/menu/menu.test.ts') // false
 * ```
 */
export const isUiFile = (filePath: string): boolean =>
  isSource(filePath) && UI_FILES.test(filePath)

// RATCHET

/** His words on what a painter is for, said of this ratchet on 2026-11-20. */
export const OWNERS_WORDS =
  '"a painter should just take state and render a UI and then when that state changes, it should render again. That\'s it."'

/** Where a rule goes when it leaves a painter. */
export const BEHAVIOR_FOLDER = 'packages/foldkit/src/behavior/'

/**
 * The painter ratchet: what each painter file holds beyond taking state
 * and drawing it. Its counts are headed to zero.
 */
export const painters: Ratchet = {
  name: 'painters',
  ledgerPath: 'scripts/painter-ratchet/painters.json',
  roots: PAINTER_ROOTS,
  covers: isPainterFile,
  counters: [timers, heldState, listeners, numbers],
  heading: (fileCount, totals) =>
    `Painters: ${fileCount} files still hold ${totals}.`,
  whereItGoes: [
    `The owner: ${OWNERS_WORDS}`,
    'These counts are not a budget to stay under. Zero is where each painter file is headed,',
    `and every count above zero is a rule still to move into ${BEHAVIOR_FOLDER}.`,
    'A number with a unit of time, distance or count (500 ms, 10 px, 5 tries), or a branch on',
    `what the person meant, is a rule: write it once in ${BEHAVIOR_FOLDER} as a pure step,`,
    'and let the painter only measure, scroll, listen and draw.',
  ],
}

/**
 * The `@foldkit/ui` ratchet: how much of each widget still stands on
 * `foldkit/html` and the DOM. It falls as each widget's rule moves to a
 * core part.
 */
export const ui: Ratchet = {
  name: 'ui',
  ledgerPath: 'scripts/painter-ratchet/ui.json',
  roots: ['packages/ui/src'],
  covers: isUiFile,
  counters: [domImports, domUses, documentUses, windowUses],
  heading: (fileCount, totals) =>
    `@foldkit/ui: ${fileCount} files still hold ${totals}.`,
  whereItGoes: [
    'Every @foldkit/ui widget moves to a core part, one at a time, and the widget keeps',
    'working as the HTML painter of that part. These counts fall with each widget moved;',
    `they may not rise. A widget's rule goes in ${BEHAVIOR_FOLDER}, not in a new view.`,
  ],
}

/** Every ratchet the gate runs. */
export const ratchets: ReadonlyArray<Ratchet> = [painters, ui]

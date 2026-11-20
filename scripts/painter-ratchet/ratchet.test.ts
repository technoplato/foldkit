import { Array, Option, Record, Schema as S } from 'effect'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  type Counter,
  type Counts,
  countsOf,
  documentUses,
  domImports,
  domUses,
  heldState,
  listeners,
  numbers,
  sourceOf,
  timers,
  windowUses,
} from './count'
import { type Ratchet, isPainterFile, isUiFile, painters, ui } from './cover'
import {
  type Entry,
  type Ledger,
  LedgerJson,
  type Problem,
  type Rise,
  lineOf,
  problemsOf,
  rewritten,
} from './ledger'

const repoRoot = path.resolve(import.meta.dirname, '../..')

const read = (filePath: string): string =>
  readFileSync(path.join(repoRoot, filePath), 'utf8')

const ledgerOf = (ratchet: Ratchet): Ledger =>
  S.decodeUnknownSync(LedgerJson)(read(ratchet.ledgerPath))

const PAINT_REACT = 'packages/react/src/paintReact/paintReact.tsx'

const HTML_EDGE = 'packages/foldkit/src/renderers/htmlEdge.ts'

const WORDS_BROWSER = 'examples/words/foldkit/src/browser.ts'

const TERMINAL_TUI = 'packages/foldkit/src/cli/tui.ts'

const UI_MENU = 'packages/ui/src/menu/index.ts'

// NOTE: this is the quiet-time check `@foldkit/svelte` still carries in
// `TranscriptView.svelte`, the copy of the follow rule plan 14 names. It
// is the paste the ratchet exists to stop.
const QUIET_CHECK = `
const userScrollQuietMs = 4000
let lastUserScrollAtMs = 0
const noteUserScroll = (): void => {
  lastUserScrollAtMs = Date.now()
}
window.addEventListener('wheel', noteUserScroll, { passive: true })
const isQuiet = (): boolean =>
  Date.now() - lastUserScrollAtMs < userScrollQuietMs
`

const HELD_OBJECT = `
const held: { leftAtMs?: number } = {}
export const noteLeft = (atMs: number): void => {
  held.leftAtMs = atMs
}
`

const RETRY_RULE = `
const maximumJumps = 5
const retryAfterMs = 120
`

const countIn = (counter: Counter, text: string, filePath = 'a.ts'): number =>
  counter.count(sourceOf(filePath, text))

const problemsFor = (
  ratchet: Ratchet,
  ledger: Ledger,
  filePath: string,
  text: string,
): ReadonlyArray<Problem> =>
  Array.filter(
    problemsOf({
      measured: { [filePath]: countsOf(ratchet.counters, filePath, text) },
      ledger,
      earlier: [ledger],
    }),
    problem => problem.file === filePath,
  )

const grownKindsOf = (
  ratchet: Ratchet,
  filePath: string,
  text: string,
): ReadonlyArray<string> =>
  Array.map(
    Array.filter(
      problemsFor(ratchet, ledgerOf(ratchet), filePath, text),
      problem => problem._tag === 'Grew',
    ),
    problem => problem.kind,
  )

const entryOf = (ledger: Ledger, filePath: string): Entry =>
  Option.getOrThrow(Record.get(ledger.files, filePath))

const countOf = (counts: Counts, kind: string): number =>
  Option.getOrThrow(Record.get(counts, kind))

const withEntry = (ledger: Ledger, filePath: string, entry: Entry): Ledger => ({
  about: ledger.about,
  files: { ...ledger.files, [filePath]: entry },
})

const raised = (
  ledger: Ledger,
  filePath: string,
  kind: string,
  rises: ReadonlyArray<Rise>,
): Ledger => {
  const entry = entryOf(ledger, filePath)
  return withEntry(ledger, filePath, {
    ...entry,
    counts: { ...entry.counts, [kind]: countOf(entry.counts, kind) + 1 },
    rises: [...(entry.rises ?? []), ...rises],
  })
}

const measuredAs = (ledger: Ledger): Readonly<Record<string, Counts>> =>
  Record.map(ledger.files, entry => entry.counts)

describe('the counters', () => {
  it('count timers and clocks', () => {
    const text = `
      setTimeout(tick, 250)
      const handle: ReturnType<typeof setTimeout> = window.setInterval(tick, 250)
      requestAnimationFrame(paint)
      const ports = { now: Date.now, started: performance.now() }
      Effect.sleep('1 second')
      Effect.delay(effect, '1 second')
      const at = new Date()
      const then = new Date(4000)
    `
    assert.equal(countIn(timers, text), 8)
  })

  it('count held state, and an object only when it is written to later', () => {
    assert.equal(
      countIn(heldState, 'const [open, setOpen] = useState(false)'),
      1,
    )
    assert.equal(countIn(heldState, 'const wait = useRef(undefined)'), 1)
    assert.equal(countIn(heldState, 'let lastAtMs = 0'), 1)
    assert.equal(
      countIn(heldState, 'const seen = new Map<string, number>()'),
      1,
    )
    assert.equal(countIn(heldState, 'const held = {}; held.wait = 3'), 1)
    assert.equal(
      countIn(heldState, 'const held = { wait: 3 }; read(held.wait)'),
      0,
    )
    assert.equal(countIn(heldState, 'const waits = []; waits.push(3)'), 1)
    assert.equal(countIn(heldState, 'const state = Ref.make(0)'), 1)
  })

  it('count a write only against the object in reach of it', () => {
    const text = `
      const first = () => { const held = {}; return held }
      const second = (held: { wait: number }) => { held.wait = 3 }
    `
    assert.equal(countIn(heldState, text), 0)
  })

  it('count listeners', () => {
    const text = `
      window.addEventListener('wheel', left)
      process.stdin.on('data', read)
      new ResizeObserver(measure)
      const view = <div onScroll={left} className="fk" />
      const button = h.button([h.OnClick(pressed)], [])
    `
    assert.equal(countIn(listeners, text, 'a.tsx'), 5)
  })

  it('count every number but 0 and 1', () => {
    const text =
      'const maximumJumps = 5; const first = 0; const next = first + 1; const gap = -1; const quiet = 4_000'
    assert.equal(countIn(numbers, text), 2)
  })

  it('count a Svelte file by its script and its markup', () => {
    const text = `
      <script lang="ts">
        let root: HTMLElement | undefined = $state(undefined)
        const userScrollQuietMs = 4000
      </script>
      <div bind:this={root} onscroll={left} on:wheel={left}>{label}</div>
      <style>.fk { margin: 24px }</style>
    `
    assert.deepEqual(
      countsOf([timers, heldState, listeners, numbers], 'A.svelte', text),
      { timers: 0, heldState: 2, listeners: 2, numbers: 1 },
    )
  })

  it("count @foldkit/ui's imports and uses of foldkit/html and the DOM", () => {
    const text = `
      import { html, type Html } from 'foldkit/html'
      import { Dom, Command } from 'foldkit'
      import { computePosition } from '@floating-ui/dom'
      const h = html<Message>()
      export const view = (): Html => h.div([], [])
      const focus = Dom.focus('#menu')
      const menu = document.getElementById('menu')
      window.scrollTo(0, 0)
    `
    assert.deepEqual(
      countsOf([domImports, domUses, documentUses, windowUses], 'a.ts', text),
      { domImports: 3, domUses: 3, document: 1, window: 1 },
    )
  })
})

describe('which files are held', () => {
  it('covers each painter, and a file that does not exist yet beside one', () => {
    assert.equal(isPainterFile(PAINT_REACT), true)
    assert.equal(isPainterFile(HTML_EDGE), true)
    assert.equal(isPainterFile(WORDS_BROWSER), true)
    assert.equal(isPainterFile(TERMINAL_TUI), true)
    assert.equal(isPainterFile('packages/react/src/paintReact/quiet.tsx'), true)
    assert.equal(
      isPainterFile('packages/react-native/src/interaction/transcript.tsx'),
      true,
    )
    assert.equal(
      isPainterFile('packages/svelte/src/interaction/TranscriptView.svelte'),
      true,
    )
    assert.equal(isPainterFile('examples/books/cli/src/view.ts'), true)
  })

  it('leaves core, tests and domain cores alone', () => {
    assert.equal(
      isPainterFile('packages/foldkit/src/behavior/reader.ts'),
      false,
    )
    assert.equal(
      isPainterFile('packages/foldkit/src/interaction/terminalFocus.ts'),
      false,
    )
    assert.equal(
      isPainterFile('packages/react/src/paintReact/paintReact.test.tsx'),
      false,
    )
    assert.equal(isPainterFile('examples/words/core/src/update.ts'), false)
    assert.equal(isPainterFile('examples/words/foldkit/src/audio.ts'), false)
    assert.equal(
      isPainterFile('examples/counter/headless/src/stress.ts'),
      false,
    )
  })

  it("covers @foldkit/ui's own files", () => {
    assert.equal(isUiFile(UI_MENU), true)
    assert.equal(isUiFile('packages/ui/src/menu/story.test.ts'), false)
  })
})

describe('the painter ratchet fails', () => {
  it('nothing for a painter as it is checked in', () => {
    assert.deepEqual(
      problemsFor(painters, ledgerOf(painters), PAINT_REACT, read(PAINT_REACT)),
      [],
    )
  })

  it('a quiet-time check pasted into paintReact.tsx', () => {
    assert.deepEqual(
      grownKindsOf(painters, PAINT_REACT, `${read(PAINT_REACT)}${QUIET_CHECK}`),
      ['heldState', 'listeners', 'numbers', 'timers'],
    )
  })

  it('a const held = {} written to in htmlEdge.ts', () => {
    assert.deepEqual(
      grownKindsOf(painters, HTML_EDGE, `${read(HTML_EDGE)}${HELD_OBJECT}`),
      ['heldState'],
    )
  })

  it('a new file beside paintReact.tsx with a timer', () => {
    const problems = problemsFor(
      painters,
      ledgerOf(painters),
      'packages/react/src/paintReact/quiet.tsx',
      'export const later = (run: () => void) => setTimeout(run)',
    )
    assert.deepEqual(Array.map(problems, lineOf), [
      'packages/react/src/paintReact/quiet.tsx: timers rose from 0 to 1',
    ])
  })

  it("a rule added to Words' browser.ts", () => {
    assert.deepEqual(
      grownKindsOf(
        painters,
        WORDS_BROWSER,
        `${read(WORDS_BROWSER)}${RETRY_RULE}`,
      ),
      ['numbers'],
    )
  })

  it('a checked-in count raised without a reason', () => {
    const before = ledgerOf(painters)
    const after = raised(before, PAINT_REACT, 'timers', [])
    assert.deepEqual(
      Array.map(
        problemsOf({
          measured: measuredAs(after),
          ledger: after,
          earlier: [before],
        }),
        problem => problem._tag,
      ),
      ['Unexplained'],
    )
  })

  it('a checked-in count raised with a reason that says nothing', () => {
    const before = ledgerOf(painters)
    const timersBefore = countOf(entryOf(before, PAINT_REACT).counts, 'timers')
    const after = raised(before, PAINT_REACT, 'timers', [
      { kind: 'timers', from: timersBefore, to: timersBefore + 1, why: '  ' },
    ])
    assert.equal(
      problemsOf({
        measured: measuredAs(after),
        ledger: after,
        earlier: [before],
      }).length,
      1,
    )
  })

  it('a count that fell and was not written down, and --write records it', () => {
    const before = ledgerOf(painters)
    const timersBefore = countOf(entryOf(before, PAINT_REACT).counts, 'timers')
    const stale = raised(before, PAINT_REACT, 'timers', [
      {
        kind: 'timers',
        from: timersBefore,
        to: timersBefore + 1,
        why: 'a fair rise that was later undone',
      },
    ])
    const measured = measuredAs(before)
    assert.deepEqual(
      Array.map(
        problemsOf({ measured, ledger: stale, earlier: [] }),
        problem => problem._tag,
      ),
      ['Fell'],
    )
    assert.deepEqual(rewritten(stale, measured), before)
  })
})

describe('a fair rise', () => {
  it('passes when a branch edits only the ledger: the count and a rise that says why', () => {
    const before = ledgerOf(painters)
    const timersBefore = countOf(entryOf(before, TERMINAL_TUI).counts, 'timers')
    const after = raised(before, TERMINAL_TUI, 'timers', [
      {
        kind: 'timers',
        from: timersBefore,
        to: timersBefore + 1,
        why: 'Scribe #2591: the frame diff waits one tick before it redraws',
      },
    ])
    assert.deepEqual(
      problemsOf({
        measured: measuredAs(after),
        ledger: after,
        earlier: [before],
      }),
      [],
    )
  })

  it('is expected of the terminal painter, and the ledger says so beside each file', () => {
    const ledger = ledgerOf(painters)
    const noted = Array.filter(
      Record.toEntries(ledger.files),
      ([, entry]) => entry.note !== undefined && entry.note.includes('#2591'),
    )
    assert.equal(
      Array.contains(
        Array.map(noted, ([filePath]) => filePath),
        TERMINAL_TUI,
      ),
      true,
    )
  })
})

describe('the @foldkit/ui ratchet fails', () => {
  it('nothing for a widget as it is checked in', () => {
    assert.deepEqual(problemsFor(ui, ledgerOf(ui), UI_MENU, read(UI_MENU)), [])
  })

  it('a new use of the page in a widget', () => {
    assert.deepEqual(
      grownKindsOf(
        ui,
        UI_MENU,
        `${read(UI_MENU)}\nexport const menuOf = () => document.getElementById('menu')\n`,
      ),
      ['document'],
    )
  })

  it('a new file in @foldkit/ui that imports foldkit/html', () => {
    assert.deepEqual(
      grownKindsOf(
        ui,
        'packages/ui/src/menu/rows.ts',
        "import { html } from 'foldkit/html'\nexport const h = html()\n",
      ),
      ['domImports', 'domUses'],
    )
  })
})

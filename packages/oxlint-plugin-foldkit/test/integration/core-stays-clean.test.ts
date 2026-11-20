import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

// Runs real oxlint with the repo's own `.oxlintrc.json`, the config
// `pnpm lint` uses, against files laid out as they sit in the repo. It
// holds plan 14's rule that `packages/foldkit/src/behavior/` stays
// framework-free: no page, no timer, no DOM module, no React, no React
// Native. Only the plugin's path is changed, to a bundle built here.

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '..', '..')
const repoRoot = join(pluginRoot, '..', '..')
const oxlintBin = join(repoRoot, 'node_modules', '.bin', 'oxlint')

const behaviorFolder = join('packages', 'foldkit', 'src', 'behavior')
const paintersFolder = join('packages', 'foldkit', 'src', 'renderers')

let workDir: string

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'foldkit-core-stays-clean-'))
  const bundlePath = join(workDir, 'plugin.js')
  await build({
    entryPoints: [join(pluginRoot, 'src', 'index.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundlePath,
  })
  const config = JSON.parse(
    readFileSync(join(repoRoot, '.oxlintrc.json'), 'utf8'),
  )
  writeFileSync(
    join(workDir, '.oxlintrc.json'),
    JSON.stringify({
      ...config,
      jsPlugins: [{ name: 'foldkit', specifier: bundlePath }],
    }),
  )
  mkdirSync(join(workDir, behaviorFolder), { recursive: true })
  mkdirSync(join(workDir, paintersFolder), { recursive: true })
})

const restricted = /eslint\(no-restricted-(globals|imports|properties)\)/g

const stdoutOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'stdout' in error
    ? String(error.stdout)
    : ''

const restrictedCount = (target: string): number => {
  try {
    execFileSync(
      oxlintBin,
      ['--disable-nested-config', '--config', '.oxlintrc.json', target],
      { cwd: workDir, encoding: 'utf8' },
    )
    return 0
  } catch (error) {
    return (stdoutOf(error).match(restricted) ?? []).length
  }
}

const lintedIn = (folder: string, name: string, source: string): number => {
  const target = join(folder, `${name}.ts`)
  writeFileSync(join(workDir, target), source)
  return restrictedCount(target)
}

const forbidden: ReadonlyArray<readonly [string, string]> = [
  ['document', "export const menuOf = () => document.getElementById('menu')"],
  ['window', 'export const widthOf = () => window.innerWidth'],
  [
    'setTimeout',
    'export const later = (run: () => void) => setTimeout(run, 250)',
  ],
  [
    'setInterval',
    'export const often = (run: () => void) => setInterval(run, 250)',
  ],
  [
    'requestAnimationFrame',
    'export const nextFrame = (run: () => void) => requestAnimationFrame(run)',
  ],
  ['Date.now', 'export const nowMs = () => Date.now()'],
  [
    'Effect.sleep',
    "import { Effect } from 'effect'\nexport const pause = Effect.sleep('1 second')",
  ],
  ['react', "import { useState } from 'react'\nexport const hook = useState"],
  [
    'react-native',
    "import { View } from 'react-native'\nexport const view = View",
  ],
  [
    'foldkit-html',
    "import { html } from 'foldkit/html'\nexport const h = html()",
  ],
  [
    'relative-html',
    "import { html } from '../html/index.js'\nexport const h = html()",
  ],
  [
    'relative-dom',
    "import { focus } from '../dom/index.js'\nexport const focusMenu = focus",
  ],
  [
    'root-barrel',
    "import { Html } from '../index.js'\nexport const html = Html",
  ],
]

describe('packages/foldkit/src/behavior stays framework-free', () => {
  for (const [name, source] of forbidden) {
    it(`pnpm lint's config fails on ${name} in behavior/`, () => {
      expect(lintedIn(behaviorFolder, name, source)).toBeGreaterThan(0)
    })
  }

  it('lets a painter name the page and a timer', () => {
    expect(
      lintedIn(
        paintersFolder,
        'painter',
        "export const later = (run: () => void) => window.setTimeout(run, 250)\nexport const menuOf = () => document.getElementById('menu')",
      ),
    ).toBe(0)
  })

  it('lets a behavior import Effect, Schema helpers and screen-tree types', () => {
    expect(
      lintedIn(
        behaviorFolder,
        'clean',
        "import { Option } from 'effect'\nimport type { TranscriptNode } from '../renderers/types.js'\nimport { ts } from '../schema/index.js'\nexport const Left = ts('Left')\nexport const first = (node: TranscriptNode) => Option.some(node)",
      ),
    ).toBe(0)
  })

  it('passes every behavior file as it is checked in', () => {
    for (const name of ['reader.ts', 'transcriptFollow.ts', 'index.ts']) {
      copyFileSync(
        join(repoRoot, behaviorFolder, name),
        join(workDir, behaviorFolder, name),
      )
      expect(restrictedCount(join(behaviorFolder, name)), name).toBe(0)
    }
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// NOTE: The site reads its workspace packages from their built output. A
// checkout where one of them was never built answers its page with an
// error, and one built before a change serves the old code. So every
// script that serves or checks the site builds what it depends on first,
// asked of the workspace by this package's own name, never from a list
// kept here by hand.

const here = fileURLToPath(new URL('.', import.meta.url))

type Manifest = Readonly<{
  name: string
  scripts: Readonly<Record<string, string>>
}>

const manifest: Manifest = JSON.parse(
  readFileSync(join(here, '../package.json'), 'utf8'),
)

describe('the Books site’s scripts', () => {
  it('build the workspace packages the site depends on that are stale, by asking the workspace', () => {
    expect(manifest.scripts['deps']).toBe(
      'node ../../../scripts/build-stale-deps.mjs',
    )
  })

  it('run their tests when the workspace runs every test', () => {
    expect(manifest.scripts['test']).toBe('vitest run')
  })

  it.each(['dev', 'dev:made-up', 'build', 'build:live', 'typecheck'])(
    'build them before %s',
    name => {
      expect(manifest.scripts[`pre${name}`]).toBe('pnpm run deps')
    },
  )

  it('name no package to build by hand', () => {
    const named = Object.entries(manifest.scripts).filter(([, script]) =>
      /--filter/.test(script),
    )
    expect(named).toEqual([])
  })
})

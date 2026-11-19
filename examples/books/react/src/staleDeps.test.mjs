import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  staleNamesOf,
  timesOf,
  toBuildOf,
} from '../../../../scripts/build-stale-deps.mjs'

// NOTE: A dev start built all seven of the site's workspace dependencies
// every time, 36 to 40 seconds, whether or not anything had changed. It
// builds only what is stale: a package whose sources are newer than its
// built output, and every package that depends on one of those.

const at = (path, seconds) => {
  writeFileSync(path, '')
  utimesSync(path, seconds, seconds)
}

const packageAt = files => {
  const root = mkdtempSync(join(tmpdir(), 'stale-deps-'))
  for (const [path, seconds] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    at(join(root, path), seconds)
  }
  return root
}

describe('what a package was built from, and when it was built', () => {
  it('reads the newest source and the newest built file', () => {
    const root = packageAt({
      'package.json': 100,
      'src/index.ts': 300,
      'src/deep/part.ts': 200,
      'dist/index.js': 250,
      'dist/index.d.ts': 260,
    })
    expect(timesOf(root)).toEqual({ sourceMs: 300_000, builtMs: 260_000 })
  })

  it('leaves out what a build does not read: tests, installed packages, hidden files, the output itself and the record a build writes beside it', () => {
    const root = packageAt({
      'package.json': 100,
      'src/index.ts': 200,
      'src/index.test.ts': 900,
      'src/part.test.tsx': 900,
      'node_modules/other/index.js': 900,
      'tsconfig.build.tsbuildinfo': 900,
      '.cache/any': 900,
      'dist/index.js': 250,
    })
    expect(timesOf(root)).toEqual({ sourceMs: 200_000, builtMs: 250_000 })
  })

  it('says a package with no output was never built', () => {
    const root = packageAt({ 'package.json': 100, 'src/index.ts': 200 })
    expect(timesOf(root).builtMs).toBe(0)
  })
})

describe('which packages are stale', () => {
  it('are the ones never built, and the ones whose sources are newer than their output', () => {
    expect(
      staleNamesOf([
        { name: 'never', sourceMs: 5, builtMs: 0 },
        { name: 'edited', sourceMs: 9, builtMs: 7 },
        { name: 'fresh', sourceMs: 5, builtMs: 7 },
        { name: 'same', sourceMs: 7, builtMs: 7 },
      ]),
    ).toEqual(['never', 'edited'])
  })
})

describe('which packages to build', () => {
  const packages = [
    { name: 'library', dependsOn: [] },
    { name: 'painter', dependsOn: ['library'] },
    { name: 'player', dependsOn: ['library'] },
    { name: 'core', dependsOn: ['library', 'player'] },
    { name: 'alone', dependsOn: [] },
  ]

  it('are none when nothing is stale', () => {
    expect(toBuildOf(packages, [])).toEqual([])
  })

  it('are a stale package and every package that depends on it, however far', () => {
    expect(toBuildOf(packages, ['player'])).toEqual(['player', 'core'])
    expect(toBuildOf(packages, ['library'])).toEqual([
      'library',
      'painter',
      'player',
      'core',
    ])
    expect(toBuildOf(packages, ['alone'])).toEqual(['alone'])
  })
})

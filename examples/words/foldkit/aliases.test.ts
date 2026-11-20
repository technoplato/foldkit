import { Array, Option, Record, String } from 'effect'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { foldkitAliases } from '../../vite.aliases'

// NOTE: the page is served from source: each `foldkit/…` import is found
// through `foldkitAliases`, not through the package's built files, which
// the tests read. A subpath with no alias passes every test and leaves the
// page blank, as `foldkit/behavior` did on 2026-11-20.

const here = __dirname

const sourceRoots = [
  path.resolve(here, 'src'),
  path.resolve(here, '../core/src'),
]

const sourceFilesIn = (directory: string): ReadonlyArray<string> =>
  Array.flatMap(readdirSync(directory, { withFileTypes: true }), entry => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return sourceFilesIn(entryPath)
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      return [entryPath]
    } else {
      return []
    }
  })

const foldkitImport = /from '(foldkit\/[^']+)'/g

const importedSubpaths = (): ReadonlyArray<string> =>
  Array.dedupe(
    Array.flatMap(Array.flatMap(sourceRoots, sourceFilesIn), file =>
      Array.map(
        Array.fromIterable(readFileSync(file, 'utf8').matchAll(foldkitImport)),
        match => match[1] ?? '',
      ),
    ),
  )

const aliases = Record.toEntries(foldkitAliases(path.resolve(here, '..')))

const sourceOf = (specifier: string): Option.Option<string> =>
  Option.map(
    Array.findFirst(
      aliases,
      ([name]) =>
        name !== 'foldkit' &&
        (specifier === name || String.startsWith(`${name}/`)(specifier)),
    ),
    ([name, target]) => `${target}${specifier.slice(name.length)}`,
  )

const isSource = (target: string): boolean =>
  existsSync(`${target}.ts`) || existsSync(path.join(target, 'index.ts'))

describe('the Foldkit subpaths the Words page imports', () => {
  it('each have an alias that leads to a source file', () => {
    const unresolved = Array.filter(
      importedSubpaths(),
      specifier => !Option.exists(sourceOf(specifier), isSource),
    )
    expect(importedSubpaths().length).toBeGreaterThan(0)
    expect(unresolved).toEqual([])
  })
})

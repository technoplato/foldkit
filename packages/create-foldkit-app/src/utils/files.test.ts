import { Option } from 'effect'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { applyPackageManager, exampleSourceDefinitions } from './files.js'

const templateReadme = readFileSync(
  fileURLToPath(new URL('../../templates/base/README.md', import.meta.url)),
  'utf8',
)

describe('applyPackageManager', () => {
  it('substitutes the README command placeholders for the selected manager', () => {
    const bun = applyPackageManager(templateReadme, 'bun')
    expect(bun).toContain('bun install')
    expect(bun).toContain('bun dev')
    expect(bun).not.toContain('{{')

    const npm = applyPackageManager(templateReadme, 'npm')
    expect(npm).toContain('npm install')
    expect(npm).toContain('npm run dev')
    expect(npm).not.toContain('{{')

    const pnpm = applyPackageManager(templateReadme, 'pnpm')
    expect(pnpm).toContain('pnpm install')
    expect(pnpm).toContain('pnpm dev')
    expect(pnpm).not.toContain('{{')
  })
})

describe('exampleSourceDefinitions', () => {
  it('flattens the Counter core into the graphical client', () => {
    const definitions = exampleSourceDefinitions('counter')

    expect(definitions).toHaveLength(2)
    expect(definitions.map(definition => definition.url)).toEqual([
      'https://api.github.com/repos/foldkit/foldkit/contents/examples/counter/foldkit/src',
      'https://api.github.com/repos/foldkit/foldkit/contents/examples/counter/core/src',
    ])
    expect(
      definitions.map(definition => definition.maybeTargetDirectory),
    ).toEqual([Option.none(), Option.some('core')])
    expect(
      definitions.map(definition => definition.maybeBundledPackage),
    ).toEqual([Option.some('counter-core-example'), Option.none()])
  })

  it('keeps ordinary examples under their existing source root', () => {
    expect(exampleSourceDefinitions('stopwatch')).toEqual([
      {
        url: 'https://api.github.com/repos/foldkit/foldkit/contents/examples/stopwatch/src',
        maybeTargetDirectory: Option.none(),
        maybeBundledPackage: Option.none(),
      },
    ])
  })
})

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcDir = dirname(fileURLToPath(import.meta.url))

describe('launchBrowserCountersHost', () => {
  it('fails missing Instant instead of opening a local tape', () => {
    const source = readFileSync(join(srcDir, 'launch.ts'), 'utf8')
    expect(source).toContain('Instant app id is missing')
    expect(source).toContain('The Host will not open a local tape.')
    expect(source).not.toContain('makeInMemoryProgramStore')
    expect(source).not.toContain('local-counters')
  })
})

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const tuiEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

const runTui = (input: string) =>
  spawnSync(process.execPath, [tuiEntryPath], {
    encoding: 'utf8',
    env: { ...process.env, COUNTER_TAPE: 'memory' },
    input,
    timeout: 10_000,
  })

describe('Counter TUI process', () => {
  it('presses Actions from keys and quits on q', () => {
    const result = runTui('++q')
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('increment   [+ =]')
    expect(result.stdout).toMatch(/^2\s*$/m)
  })

  it('starts fresh in memory every run', () => {
    const result = runTui('q')
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toMatch(/^0\s*$/m)
  })
})

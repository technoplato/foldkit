import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const tuiEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

describe('Settings TUI process', () => {
  it('paints the sample Read and quits', () => {
    const result = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      env: { ...process.env, GATE_ORIGIN: 'test' },
      input: 'q',
      timeout: 5_000,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('ingest.knophy.com')
    expect(result.stdout).toContain('[q] quit')
  })
})

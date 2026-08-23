import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const entryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

describe('Settings headless process', () => {
  it('prints the sample Read after init', () => {
    const result = spawnSync(process.execPath, [entryPath], {
      encoding: 'utf8',
      env: { ...process.env, GATE_ORIGIN: 'test' },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('ingest.knophy.com')
    expect(result.stdout).toContain('Settings')
  })
})

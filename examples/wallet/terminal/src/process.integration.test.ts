import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const terminalEntryPath = fileURLToPath(
  new URL('../dist/entry.js', import.meta.url),
)

describe('Wallet Effect Terminal process', () => {
  it('accepts input and exits cleanly on q', () => {
    const result = spawnSync(process.execPath, [terminalEntryPath], {
      encoding: 'utf8',
      input: 'q',
      timeout: 5_000,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Foldkit Wallet | Effect Terminal')
    expect(result.stdout).toContain('[q] Quit')
    expect(result.stderr).toBe('')
  })
})

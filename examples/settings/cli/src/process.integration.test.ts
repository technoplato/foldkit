import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cliEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

const runCli = (args: ReadonlyArray<string>): string => {
  const result = spawnSync(process.execPath, [cliEntryPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GATE_ORIGIN: 'test' },
  })

  expect(result.status, result.stderr).toBe(0)
  return result.stdout
}

describe('Settings CLI process', () => {
  it('prints the sample Read on show', () => {
    const output = runCli(['show'])
    expect(output).toContain('ingest.knophy.com')
    expect(output).toContain('[refresh]')
    expect(output).toContain('Settings')
  })

  it('prints the sample Read on refresh', () => {
    const output = runCli(['refresh'])
    expect(output).toContain('Public')
  })
})

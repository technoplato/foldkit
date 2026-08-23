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

describe('Gate CLI process', () => {
  it('prints the sample Read on show', () => {
    const output = runCli(['show'])
    expect(output).toContain('Rate remaining 40 of 60 resets 60000')
    expect(output).toContain('[refresh]')
    expect(output).not.toContain('gate.grok.me')
  })

  it('prints the sample Read on refresh', () => {
    const output = runCli(['refresh'])
    expect(output).toContain('Messages remaining 10 of 20 resets 86400000')
  })
})

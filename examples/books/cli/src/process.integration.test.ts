import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cliEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

const runCli = (args: ReadonlyArray<string>): string => {
  const result = spawnSync(process.execPath, [cliEntryPath, ...args], {
    encoding: 'utf8',
  })

  expect(result.status, result.stderr).toBe(0)
  return result.stdout
}

describe('Books CLI process', () => {
  it('prints signed out', () => {
    const output = runCli(['show'])
    expect(output).toContain('signed out')
  })

  it('opens Dune from tokens', () => {
    const output = runCli(['do', 'signin', 'open:i1'])
    expect(output).toContain('Dune')
    expect(output).toContain('delicate care')
  })
})

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

describe('Conversations CLI process', () => {
  it('prints the projects list', () => {
    const output = runCli(['show'])
    expect(output).toContain('scribe')
    expect(output).toContain('laptop')
  })

  it('opens a project from tokens', () => {
    const output = runCli(['do', 'project:p-scribe'])
    expect(output).toContain('CMUX Tab Test')
  })
})

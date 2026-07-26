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

describe('Multiple Counters CLI process', () => {
  it('prints the initial screen', () => {
    expect(runCli(['show'])).toBe('Counters\ncounter-1: 0\ncounter-2: 0\n')
  })

  it('prints a loaded fact and only the valid modal command', () => {
    expect(
      runCli([
        'run',
        'open:counter-1',
        'increment:counter-1',
        'fact',
        '--verbose',
      ]),
    ).toBe(
      'Counter fact for 1\n' +
        '1 is an integer and therefore has no fractional part.\n' +
        'Available commands:\n' +
        '  dismiss  Dismiss fact\n',
    )
  })

  it('explains which actions are valid when a token is rejected', () => {
    const result = spawnSync(process.execPath, [cliEntryPath, 'run', 'fact'], {
      encoding: 'utf8',
    })

    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain('Action "fact" is not valid here.')
    expect(result.stdout).toContain('Valid actions: add, open:counter-1')
  })
})

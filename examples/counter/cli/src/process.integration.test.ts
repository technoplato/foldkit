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

describe('Counter CLI process', () => {
  it('prints one ephemeral result for every command', () => {
    expect(runCli(['show'])).toBe('0\n')
    expect(runCli(['increment'])).toBe('1\n')
    expect(runCli(['increment'])).toBe('1\n')
    expect(runCli(['decrement'])).toBe('-1\n')
    expect(runCli(['reset'])).toBe('0\n')
  })

  it('prints progress before the final integer when verbose', () => {
    expect(runCli(['increment', '--verbose'])).toBe(
      'Initial Model: Model({ count: 0 })\n' +
        'Message: ClickedIncrement()\n' +
        'Final Model: Model({ count: 1 })\n' +
        '1\n',
    )
  })
})

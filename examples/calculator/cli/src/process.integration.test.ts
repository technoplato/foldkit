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

describe('Calculator CLI process', () => {
  it('prints the initial display', () => {
    expect(runCli(['show'])).toBe('0\n')
  })

  it('prints the result of a button sequence', () => {
    expect(runCli(['press', '7', 'x', '6', '='])).toBe('42\n')
  })

  it('prints progress before the final display when verbose', () => {
    expect(runCli(['press', '1', '+', '2', '=', '--verbose'])).toBe(
      'Initial Model: Model(EditingExpression, expression: , display: 0)\n' +
        'Message: PressedDigit(One)\n' +
        'Message: PressedOperation(Add)\n' +
        'Message: PressedDigit(Two)\n' +
        'Message: PressedEquals()\n' +
        'Final Model: Model(ShowingResult, expression: 1+2, display: 3)\n' +
        '3\n',
    )
  })
})

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
  it('prints the default canonical list for show', () => {
    expect(runCli(['show'])).toBe('Counters\ncounter-1: 0\ncounter-2: 0\n')
  })

  it('describes --uri as a canonical destination', () => {
    const output = runCli(['show', '--help'])

    expect(output).toContain('Canonical Multiple Counters destination URI')
  })

  it.each([
    {
      uri: '/counters',
      output: 'Counters\ncounter-1: 0\ncounter-2: 0\n',
    },
    {
      uri: '/counters/counter-1',
      output: 'counter-1\nCount: 0\n',
    },
    {
      uri: '/counters/counter-1/fact',
      output: 'Counter fact for 0\n0 is the current value of this counter.\n',
    },
    {
      uri: '/counters/counter-1/delete',
      output: 'Delete counter-1?\nThis cannot be undone.\n',
    },
  ])('opens the canonical $uri carrier', ({ uri, output }) => {
    expect(runCli(['show', '--uri', uri])).toBe(output)
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

  it('runs from the default canonical list and stays quiet without verbose', () => {
    const output = runCli(['run', 'increment:counter-2', 'open:counter-2'])

    expect(output).toBe('counter-2\nCount: 1\n')
    expect(output).not.toContain('Available commands:')
  })

  it('lists and invokes actions from a carrier-relative current graph', () => {
    expect(
      runCli(['run', 'fact', '--uri', '/counters/counter-1', '--verbose']),
    ).toBe(
      'Counter fact for 0\n' +
        '0 is the current value of this counter.\n' +
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

  it.each([
    {
      uri: '/missing',
      errorTag: 'InvalidNavigationCarrierUriError',
    },
    {
      uri: '/counters/',
      errorTag: 'InvalidNavigationCarrierUriError',
    },
    {
      uri: 'https://counters.test/counters/counter-1',
      errorTag: 'NonCanonicalNavigationCarrierUriError',
    },
    {
      uri: '/counters/counter-missing',
      errorTag: 'MissingNavigationCarrierDestinationError',
    },
  ])(
    'exits unsuccessfully for the strict $uri carrier',
    ({ uri, errorTag }) => {
      const result = spawnSync(
        process.execPath,
        [cliEntryPath, 'show', '--uri', uri],
        { encoding: 'utf8' },
      )

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain(errorTag)
    },
  )
})

import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const entryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))
const tuiPath = fileURLToPath(new URL('../dist/tui.js', import.meta.url))

const tapeIn = (): string =>
  join(mkdtempSync(join(tmpdir(), 'counters-')), 'tape.json')

const run = (tapePath: string, ...words: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [entryPath, ...words], {
    encoding: 'utf8',
    env: { ...process.env, COUNTERS_TAPE_PATH: tapePath },
    timeout: 20_000,
  })

describe('counters CLI', () => {
  it('keeps counters between runs on one file tape', () => {
    const tapePath = tapeIn()
    expect(run(tapePath, 'add-counter').status).toBe(0)
    expect(run(tapePath, 'increment', '2').status).toBe(0)
    const shown = run(tapePath)
    expect(shown.stdout).toMatch(/^Counter 2 1 /m)
    expect(shown.stdout).toMatch(/^ +\$ counters increment 2$/m)
  })

  it('refuses a delete nobody was asked about, with its sentence', () => {
    const refused = run(tapeIn(), 'confirm-delete-counter')
    expect(refused.status).toBe(1)
    expect(refused.stderr.trim()).toBe(
      'confirm-delete-counter is disabled: no delete is waiting for an answer.',
    )
  })

  it('asks, then deletes on confirm', () => {
    const tapePath = tapeIn()
    const asked = run(tapePath, 'delete-counter', '1')
    expect(asked.stdout).toContain('at /counters/delete/1')
    expect(asked.stdout).toContain('Delete Counter 1?')
    const deleted = run(tapePath, 'confirm-delete-counter')
    expect(deleted.status).toBe(0)
    expect(deleted.stdout).toContain('No counters yet.')
  })
})

describe('counters TUI', () => {
  it('adds and opens a counter from keys and quits on q', () => {
    const result = spawnSync(process.execPath, [tuiPath], {
      encoding: 'utf8',
      env: { ...process.env, COUNTERS_TAPE: 'memory' },
      input: 'aq',
      timeout: 20_000,
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Counter 2')
    expect(result.stdout).toContain('\u001b]0;Counters | TUI\u0007')
  })
})

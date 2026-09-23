import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const entryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

const tapeDirectories: Array<string> = []

afterEach(() => {
  tapeDirectories.splice(0).forEach(directory => {
    rmSync(directory, { recursive: true, force: true })
  })
})

const counterOnNewTape = () => {
  const tapeDirectory = mkdtempSync(join(tmpdir(), 'counter-cli-'))
  tapeDirectories.push(tapeDirectory)
  return (...args: ReadonlyArray<string>) =>
    spawnSync(process.execPath, [entryPath, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        COUNTER_TAPE_PATH: join(tapeDirectory, 'tape.json'),
      },
    })
}

describe('counter CLI on a file tape', () => {
  it('paints the count and every Action from the Catalog', () => {
    const counter = counterOnNewTape()
    const result = counter()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('ready')
    expect(result.stdout).toContain(
      'increment   [+ =]   Increments the count by one',
    )
    expect(result.stdout).toContain(
      'reset       [r]     Sets the count to 0  (disabled: count is already 0)',
    )
  })

  it('keeps the count across processes', () => {
    const counter = counterOnNewTape()
    expect(counter('increment').status).toBe(0)
    expect(counter('increment').status).toBe(0)
    const shown = counter('show')
    expect(shown.stdout.split('\n')).toContain('2')
  })

  it('refuses a Disabled Action with its sentence', () => {
    const counter = counterOnNewTape()
    const refused = counter('reset')
    expect(refused.status).toBe(1)
    expect(refused.stderr).toContain('reset is disabled: count is already 0.')
  })

  it('rejects an unknown command and lists the real ones', () => {
    const counter = counterOnNewTape()
    const unknown = counter('explode')
    expect(unknown.status).toBe(2)
    expect(unknown.stderr).toContain('Try one of: increment, decrement, reset.')
  })

  it('drives the action menu and chooses by name', () => {
    const counter = counterOnNewTape()
    expect(counter('increment').status).toBe(0)
    const chosen = counter('menu', 'choose', 'reset')
    expect(chosen.status).toBe(0)
    expect(counter('show').stdout.split('\n')).toContain('0')
  })

  it('prints usage derived from the Catalog', () => {
    const counter = counterOnNewTape()
    const help = counter('help')
    expect(help.stdout).toContain(
      'increment          Increments the count by one',
    )
    expect(help.stdout).toContain('menu choose <cmd>')
  })
})

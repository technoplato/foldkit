import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const entryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

type Counter = (...args: ReadonlyArray<string>) => ReturnType<typeof spawnSync>

const tapeDirectories: Array<string> = []

const counters: Array<Counter> = []

// NOTE: Each test gets a Background Processor of its own, on a file tape
// of its own, and stops it after, so no test answers for another or for a
// person's Counter.
afterEach(() => {
  counters.splice(0).forEach(counter => {
    counter('stop')
  })
  tapeDirectories.splice(0).forEach(directory => {
    rmSync(directory, { recursive: true, force: true })
  })
})

const counterOnNewTape = () => {
  const tapeDirectory = mkdtempSync(join(tmpdir(), 'counter-cli-'))
  tapeDirectories.push(tapeDirectory)
  const counter = (...args: ReadonlyArray<string>) =>
    spawnSync(process.execPath, [entryPath, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        COUNTER_TAPE_PATH: join(tapeDirectory, 'tape.json'),
        FOLDKIT_TERMINAL_ISOLATION: tapeDirectory,
      },
    })
  counters.push(counter)
  return counter
}

describe('counter CLI on a file tape', () => {
  it('paints the count and every Action from the Catalog', () => {
    const counter = counterOnNewTape()
    const result = counter()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('ready')
    expect(result.stdout).toMatch(
      /^ {2}increment +\+ = +Increments the count by one$/m,
    )
    expect(result.stdout).toMatch(/^ {2}reset +r +Sets the count to 0$/m)
    expect(result.stdout).toMatch(/^ +Unavailable: count is already 0$/m)
    expect(result.stdout).toMatch(/^ +\$ counter increment$/m)
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

  it('rejects an unknown command in a sentence, names the nearest, and says where all are listed', () => {
    const counter = counterOnNewTape()
    const unknown = counter('explode')
    expect(unknown.status).toBe(2)
    expect(unknown.stderr).toContain('Unknown command "explode".')
    expect(unknown.stderr).toContain('lists every command.')
    expect(counter('incremnt').stderr).toContain('Nearest: counter increment')
  })

  it('drives the action menu and chooses by name', () => {
    const counter = counterOnNewTape()
    expect(counter('increment').status).toBe(0)
    const chosen = counter('menu', 'choose', 'reset')
    expect(chosen.status).toBe(0)
    expect(counter('show').stdout.split('\n')).toContain('0')
  })

  it('keeps the Counter in one Background Processor, and stops it when told', () => {
    const counter = counterOnNewTape()
    expect(counter('increment').status).toBe(0)
    expect(counter('stop').stdout).toContain(
      "Stopped counter's Background Processor.",
    )
    expect(counter('stop').stdout).toContain('is not running')
    expect(counter('show').stdout.split('\n')).toContain('1')
  })

  it('prints usage derived from the Catalog', () => {
    const counter = counterOnNewTape()
    const help = counter('help')
    expect(help.stdout).toMatch(
      /^ {2}increment +\+ = +Increments the count by one$/m,
    )
    expect(help.stdout).toContain('menu choose <action>')
    expect(help.stdout).toMatch(/^ +\$ counter menu choose increment$/m)
  })
})

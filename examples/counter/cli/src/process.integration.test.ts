import { CounterProgram, Increment } from 'counter-core-example'
import { Effect, Layer } from 'effect'
import { Runtime } from 'foldkit'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cliEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

const runCli = (
  args: ReadonlyArray<string>,
): {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
} => {
  const result = spawnSync(process.execPath, [cliEntryPath, ...args], {
    encoding: 'utf8',
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

describe('Counter CLI process', () => {
  it('prints show without chrome and do increment for a fresh count', () => {
    const shown = runCli(['show'])
    expect(shown.status, shown.stderr).toBe(0)
    expect(shown.stdout).toContain('uri      /counter')
    expect(shown.stdout).toContain('count    0')
    expect(shown.stdout).not.toContain('laptop')
    expect(shown.stdout).not.toContain('[ + ]')

    const phone = runCli(['show', '--device', 'phone'])
    expect(phone.status, phone.stderr).toBe(0)
    expect(phone.stdout).toContain('device   phone')
    expect(phone.stdout).toContain('[ + ]')
    expect(phone.stdout).not.toContain('[ reset ]')

    const incremented = runCli(['do', 'increment'])
    expect(incremented.status, incremented.stderr).toBe(0)
    expect(incremented.stdout).toContain('increment sent')
    expect(incremented.stdout).toContain('count    1')
  })

  it('starts each process at count 0', () => {
    runCli(['do', 'increment'])
    const shown = runCli(['show'])
    expect(shown.status, shown.stderr).toBe(0)
    expect(shown.stdout).toContain('count    0')
  })

  it('rejects an unknown token without crashing', () => {
    const result = runCli(['do', 'ClickedIncrement'])
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('Unknown action')
  })

  it('accepts INCREMENT as increment', () => {
    const result = runCli(['do', 'INCREMENT'])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('increment sent')
    expect(result.stdout).toContain('count    1')
  })

  it('rejects extra do tokens', () => {
    const result = runCli(['do', 'increment', 'now'])
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('Send one token')
  })

  it('logs invalid reset at 0', () => {
    const result = runCli(['do', 'reset'])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(
      'log  attempted to invoke invalid action reset',
    )
  })

  it('replays a Program tape from --tape', async () => {
    const tape = await Effect.runPromise(
      Effect.scoped(
        Runtime.recordReplayTape(CounterProgram, Layer.empty, [Increment()]),
      ),
    )
    const json = await Effect.runPromise(
      Runtime.encodeReplayTape(CounterProgram, tape),
    )
    const path = join(mkdtempSync(join(tmpdir(), 'counter-cli-')), 'tape.json')
    writeFileSync(path, json)

    const result = runCli(['replay', '--tape', path])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('FRAME 0')
    expect(result.stdout).toContain('FRAME 1')
    expect(result.stdout).toContain('Increment')
    expect(result.stdout).toContain('count    0')
    expect(result.stdout).toContain('count    1')
    expect(result.stdout).toContain('[ reset ]')
  })
})

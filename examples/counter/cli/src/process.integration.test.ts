import {
  CounterProgram,
  FoldkitCounterV01,
  Increment,
} from 'counter-core-example'
import { Effect, Layer } from 'effect'
import { Runtime } from 'foldkit'
import { cliDaemonSocketPath, stopCliDaemon } from 'foldkit/cli'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cliEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))
const cliEntrySourcePath = fileURLToPath(new URL('./entry.ts', import.meta.url))

const runCli = (
  args: ReadonlyArray<string>,
): {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
} => {
  const result = spawnSync(process.execPath, [cliEntryPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, COUNTER_TAPE: 'memory' },
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

describe('Counter CLI process', () => {
  it('keeps the slim view free of Effect, foldkit, Instant, and the Program', () => {
    const source = readFileSync(cliEntrySourcePath, 'utf8')
    expect(source).not.toMatch(/from ['"]effect['"]/)
    expect(source).not.toMatch(/from ['"]foldkit['"]/)
    expect(source).not.toMatch(/from ['"]counter-core-example['"]/)
    expect(source).toContain("from 'foldkit/cli/view'")
  })

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

    const decremented = runCli(['do', 'decrement'])
    expect(decremented.status, decremented.stderr).toBe(0)
    expect(decremented.stdout).toContain('decrement sent')
    expect(decremented.stdout).toContain('count    -1')

    const occupied = runCli(['show', '--path', '/counter'])
    expect(occupied.status, occupied.stderr).toBe(0)
    expect(occupied.stdout).toContain('uri      /counter')
    expect(occupied.stdout).not.toContain('uri      /counter/counter')
    expect(occupied.stdout).toContain('path     counter')
    expect(occupied.stdout).toContain('  decrement')
  })

  it('lists palette tokens and increments through palette and speech', () => {
    const listed = runCli(['palette'])
    expect(listed.status, listed.stderr).toBe(0)
    expect(listed.stdout).toContain('PALETTE')
    expect(listed.stdout).toContain('increment')
    expect(listed.stdout).toContain('decrement')
    expect(listed.stdout).toContain('reset')

    const paletted = runCli(['palette', 'increment'])
    expect(paletted.status, paletted.stderr).toBe(0)
    expect(paletted.stdout).toContain('increment sent')
    expect(paletted.stdout).toContain('count    1')

    const spoken = runCli(['say', 'go', 'up'])
    expect(spoken.status, spoken.stderr).toBe(0)
    expect(spoken.stdout).toContain('increment sent')
    expect(spoken.stdout).toContain('count    1')

    const reset = runCli(['say', 'start', 'over'])
    expect(reset.status, reset.stderr).toBe(0)
    expect(reset.stdout).toContain(
      'log  attempted to invoke invalid action reset',
    )
  })

  it('starts each process at count 0', () => {
    runCli(['do', 'increment'])
    const shown = runCli(['show'])
    expect(shown.status, shown.stderr).toBe(0)
    expect(shown.stdout).toContain('count    0')
  })

  it('persists increment across processes on a file Instant tape', async () => {
    const cacheRoot = join(homedir(), '.cache')
    mkdirSync(cacheRoot, { recursive: true })
    const directory = mkdtempSync(join(cacheRoot, 'foldkit-counter-cli-'))
    const tapePath = join(directory, 'tape.json')
    const env = { ...process.env, COUNTER_TAPE_PATH: tapePath }

    const incremented = spawnSync(
      process.execPath,
      [cliEntryPath, 'do', 'increment'],
      { encoding: 'utf8', env, timeout: 25_000 },
    )
    expect(incremented.status, incremented.stderr).toBe(0)
    expect(incremented.stdout).toContain('count    1')

    const shown = spawnSync(process.execPath, [cliEntryPath, 'show'], {
      encoding: 'utf8',
      env,
      timeout: 25_000,
    })
    expect(shown.status, shown.stderr).toBe(0)
    expect(shown.stdout).toContain('count    1')
    await Effect.runPromise(
      stopCliDaemon(
        cliDaemonSocketPath({
          programId: FoldkitCounterV01.id,
          isolationKey: tapePath,
        }),
      ),
    )
    rmSync(directory, { force: true, recursive: true })
  }, 30_000)

  it('persists decrement and --path /counter across processes on a file Instant tape', async () => {
    const cacheRoot = join(homedir(), '.cache')
    mkdirSync(cacheRoot, { recursive: true })
    const directory = mkdtempSync(join(cacheRoot, 'foldkit-counter-cli-'))
    const tapePath = join(directory, 'tape.json')
    const env = { ...process.env, COUNTER_TAPE_PATH: tapePath }

    const incremented = spawnSync(
      process.execPath,
      [cliEntryPath, 'do', 'increment'],
      { encoding: 'utf8', env, timeout: 25_000 },
    )
    expect(incremented.status, incremented.stderr).toBe(0)
    expect(incremented.stdout).toContain('count    1')

    const decremented = spawnSync(
      process.execPath,
      [cliEntryPath, 'do', 'decrement'],
      { encoding: 'utf8', env, timeout: 25_000 },
    )
    expect(decremented.status, decremented.stderr).toBe(0)
    expect(decremented.stdout).toContain('decrement sent')
    expect(decremented.stdout).toContain('count    0')

    const phone = spawnSync(
      process.execPath,
      [cliEntryPath, 'show', '--device', 'phone'],
      { encoding: 'utf8', env, timeout: 25_000 },
    )
    expect(phone.status, phone.stderr).toBe(0)
    expect(phone.stdout).toContain('device   phone')

    const occupied = spawnSync(
      process.execPath,
      [cliEntryPath, 'show', '--path', '/counter'],
      { encoding: 'utf8', env, timeout: 25_000 },
    )
    expect(occupied.status, occupied.stderr).toBe(0)
    expect(occupied.stdout).toContain('path     counter')
    expect(occupied.stdout).toContain('device   phone')

    const shown = spawnSync(process.execPath, [cliEntryPath, 'show'], {
      encoding: 'utf8',
      env,
      timeout: 25_000,
    })
    expect(shown.status, shown.stderr).toBe(0)
    expect(shown.stdout).toContain('count    0')
    expect(shown.stdout).toContain('device   phone')
    expect(shown.stdout).toContain('path     counter')
    expect(shown.stdout).toContain('uri      /counter')
    expect(shown.stdout).not.toContain('uri      /counter/counter')
    await Effect.runPromise(
      stopCliDaemon(
        cliDaemonSocketPath({
          programId: FoldkitCounterV01.id,
          isolationKey: tapePath,
        }),
      ),
    )
    rmSync(directory, { force: true, recursive: true })
  }, 30_000)

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

  it('persists increment on the live Instant tape when credentials exist', () => {
    if (
      process.env['COUNTER_TAPE'] !== 'instant' ||
      process.env['INSTANT_APP_ADMIN_TOKEN'] === undefined ||
      process.env['INSTANT_APP_ADMIN_TOKEN'] === ''
    ) {
      return
    }
    const env = { ...process.env, COUNTER_TAPE: 'instant' }
    const incremented = spawnSync(
      process.execPath,
      [cliEntryPath, 'do', 'increment'],
      { encoding: 'utf8', env },
    )
    expect(incremented.status, incremented.stderr).toBe(0)
    expect(incremented.stdout).toContain('increment sent')
    const shown = spawnSync(process.execPath, [cliEntryPath, 'show'], {
      encoding: 'utf8',
      env,
    })
    expect(shown.status, shown.stderr).toBe(0)
    expect(shown.stdout).toMatch(/count\s+[1-9]/)
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

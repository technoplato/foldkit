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

  it('shows each tweet painter on its own Host', () => {
    const svelte = runCli(['show', '--surface', 'svelte'])
    expect(svelte.status, svelte.stderr).toBe(0)
    expect(svelte.stdout).toContain('Foldkit - Svelte Counter')
    expect(svelte.stdout).toContain('count    0')
    expect(svelte.stdout).toContain('surface  svelte')
    expect(svelte.stdout).not.toContain('Foldkit - CLI Counter')

    const reactScreen = runCli(['show', '--surface', 'react-screen'])
    expect(reactScreen.status, reactScreen.stderr).toBe(0)
    expect(reactScreen.stdout).toContain('Foldkit - React screen Counter')
    expect(reactScreen.stdout).toContain('surface  react-screen')

    const unknown = runCli(['show', '--surface', '2e'])
    expect(unknown.status).not.toBe(0)
    expect(`${unknown.stdout}${unknown.stderr}`).toContain('Unknown surface')
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

  it('lets live painters read the same file Instant tape count', async () => {
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

    const painters = [
      ['foldkit', 'Foldkit - Foldkit Counter'],
      ['svelte', 'Foldkit - Svelte Counter'],
      ['react', 'Foldkit - React Counter'],
      ['react-screen', 'Foldkit - React screen Counter'],
      ['expo', 'Foldkit - Expo Counter'],
      ['cli', 'Foldkit - CLI Counter'],
      ['opentui', 'Foldkit - OpenTUI Counter'],
    ] as const
    for (const [surface, title] of painters) {
      const shown = spawnSync(
        process.execPath,
        [cliEntryPath, 'show', '--surface', surface],
        { encoding: 'utf8', env, timeout: 25_000 },
      )
      expect(shown.status, `${surface}: ${shown.stderr}`).toBe(0)
      expect(shown.stdout).toContain(title)
      expect(shown.stdout).toContain('count    1')
      expect(shown.stdout).toContain(`surface  ${surface}`)
    }

    await Effect.runPromise(
      stopCliDaemon(
        cliDaemonSocketPath({
          programId: FoldkitCounterV01.id,
          isolationKey: tapePath,
        }),
      ),
    )
    rmSync(directory, { force: true, recursive: true })
  }, 60_000)

  it('lets bob increment kitchen and keeps carol and public off it', async () => {
    const cacheRoot = join(homedir(), '.cache')
    mkdirSync(cacheRoot, { recursive: true })
    const directory = mkdtempSync(join(cacheRoot, 'foldkit-counter-share-'))
    const tapePath = join(directory, 'tape.json')
    const env = { ...process.env, COUNTER_TAPE_PATH: tapePath }
    delete env['COUNTER_TAPE']

    const run = (args: ReadonlyArray<string>) =>
      spawnSync(process.execPath, [cliEntryPath, ...args], {
        encoding: 'utf8',
        env,
        timeout: 25_000,
      })

    const publicBefore = run(['show'])
    expect(publicBefore.status, publicBefore.stderr).toBe(0)
    expect(publicBefore.stdout).toContain('count    0')
    expect(publicBefore.stdout).toContain('uri      /counter')

    const aliceBefore = run(['--as', 'alice', '--name', 'kitchen', 'show'])
    expect(aliceBefore.status, aliceBefore.stderr).toBe(0)
    expect(aliceBefore.stdout).toContain('uri      /kitchen')
    expect(aliceBefore.stdout).toContain('path     kitchen')
    expect(aliceBefore.stdout).toContain('count    0')

    const shared = run([
      '--as',
      'alice',
      'share',
      '--name',
      'kitchen',
      '--with',
      'bob',
    ])
    expect(shared.status, shared.stderr).toBe(0)
    expect(shared.stdout).toContain('shared kitchen with bob')
    expect(shared.stdout).toContain('uri            /kitchen')

    const bobInc = run(['--as', 'bob', '--name', 'kitchen', 'do', 'increment'])
    expect(bobInc.status, bobInc.stderr).toBe(0)
    expect(bobInc.stdout).toContain('increment sent')
    expect(bobInc.stdout).toContain('count    1')
    expect(bobInc.stdout).toContain('uri      /kitchen')

    const aliceAfter = run(['--as', 'alice', '--name', 'kitchen', 'show'])
    expect(aliceAfter.status, aliceAfter.stderr).toBe(0)
    expect(aliceAfter.stdout).toContain('count    1')
    expect(aliceAfter.stdout).toContain('uri      /kitchen')

    const bobAfter = run(['--as', 'bob', '--name', 'kitchen', 'show'])
    expect(bobAfter.status, bobAfter.stderr).toBe(0)
    expect(bobAfter.stdout).toContain('count    1')

    const carol = run(['--as', 'carol', '--name', 'kitchen', 'show'])
    expect(carol.status, carol.stderr).toBe(0)
    expect(carol.stdout).toContain('count    0')
    expect(carol.stdout).not.toMatch(/count\s+1/)

    const publicAfter = run(['show'])
    expect(publicAfter.status, publicAfter.stderr).toBe(0)
    expect(publicAfter.stdout).toContain('count    0')
    expect(publicAfter.stdout).toContain('uri      /counter')
    expect(publicAfter.stdout).not.toContain('uri      /kitchen')

    const mine = run(['--as', 'alice', '--audience', 'mine', 'show'])
    expect(mine.status, mine.stderr).toBe(0)
    expect(mine.stdout).toContain('count    0')

    await Effect.runPromise(
      stopCliDaemon(
        cliDaemonSocketPath({
          programId: FoldkitCounterV01.id,
          isolationKey: `${tapePath}.share-kitchen`,
        }),
      ),
    )
    await Effect.runPromise(
      stopCliDaemon(
        cliDaemonSocketPath({
          programId: FoldkitCounterV01.id,
          isolationKey: `${tapePath}.share-kitchen-denied-carol`,
        }),
      ),
    )
    await Effect.runPromise(
      stopCliDaemon(
        cliDaemonSocketPath({
          programId: FoldkitCounterV01.id,
          isolationKey: tapePath,
        }),
      ),
    )
    rmSync(directory, { force: true, recursive: true })
  }, 45_000)

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

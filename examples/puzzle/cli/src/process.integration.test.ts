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
import {
  FoldkitPuzzleV01,
  GuessedYes,
  PuzzleProgram,
  ResetTape,
  emptyModel,
  uriOf,
} from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

const cliEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))
const cliEntrySourcePath = fileURLToPath(new URL('./entry.ts', import.meta.url))

const runCli = (
  args: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv = { ...process.env, PUZZLE_TAPE: 'memory' },
): {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
} => {
  const result = spawnSync(process.execPath, [cliEntryPath, ...args], {
    encoding: 'utf8',
    env,
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

describe('Puzzle CLI process', () => {
  it('keeps the slim view free of Effect, foldkit, Instant, and the Program', () => {
    const source = readFileSync(cliEntrySourcePath, 'utf8')
    expect(source).not.toMatch(/from ['"]effect['"]/)
    expect(source).not.toMatch(/from ['"]foldkit['"]/)
    expect(source).not.toMatch(/from ['"]puzzle-core-example['"]/)
    expect(source).toContain("from 'foldkit/cli/view'")
  })

  it('prints show without chrome and do reset for the demo tape', () => {
    const shown = runCli(['show'])
    expect(shown.status, shown.stderr).toBe(0)
    expect(shown.stdout).toContain('uri      /puzzle')
    expect(shown.stdout).toContain('/puzzle#')
    expect(shown.stdout).not.toContain('laptop')
    expect(shown.stdout).not.toContain('[ y ]')

    const phone = runCli(['show', '--device', 'phone'])
    expect(phone.status, phone.stderr).toBe(0)
    expect(phone.stdout).toContain('device   phone')
    expect(phone.stdout).toContain('[ reset ]')
    expect(phone.stdout).toContain('https://puzzle.knophy.com')
    expect(phone.stdout).not.toContain('[ y ]')

    const reset = runCli(['do', 'reset'])
    expect(reset.status, reset.stderr).toBe(0)
    expect(reset.stdout).toContain('reset sent')
    expect(reset.stdout).toContain(uriOf(emptyModel()))
  })

  it('starts each process at the demo tape', () => {
    runCli(['do', 'reset'])
    const shown = runCli(['show'])
    expect(shown.status, shown.stderr).toBe(0)
    expect(shown.stdout).toContain('/replicate')
  })

  it('persists reset then yes across processes on a file Instant tape', async () => {
    const cacheRoot = join(homedir(), '.cache')
    mkdirSync(cacheRoot, { recursive: true })
    const directory = mkdtempSync(join(cacheRoot, 'foldkit-puzzle-cli-'))
    const tapePath = join(directory, 'tape.json')
    const env = { ...process.env, PUZZLE_TAPE_PATH: tapePath }

    const reset = spawnSync(process.execPath, [cliEntryPath, 'do', 'reset'], {
      encoding: 'utf8',
      env,
      timeout: 25_000,
    })
    expect(reset.status, reset.stderr).toBe(0)
    expect(reset.stdout).toContain(uriOf(emptyModel()))

    const guessed = spawnSync(process.execPath, [cliEntryPath, 'do', 'yes'], {
      encoding: 'utf8',
      env,
      timeout: 25_000,
    })
    expect(guessed.status, guessed.stderr).toBe(0)
    expect(guessed.stdout).toContain('next=y')

    const shown = spawnSync(process.execPath, [cliEntryPath, 'show'], {
      encoding: 'utf8',
      env,
      timeout: 25_000,
    })
    expect(shown.status, shown.stderr).toBe(0)
    expect(shown.stdout).toContain('next=y')
    await Effect.runPromise(
      stopCliDaemon(
        cliDaemonSocketPath({
          programId: FoldkitPuzzleV01.id,
          isolationKey: tapePath,
        }),
      ),
    )
    rmSync(directory, { force: true, recursive: true })
  }, 30_000)

  it('rejects an unknown token without crashing', () => {
    const result = runCli(['do', 'ClickedGuessedYes'])
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('Unknown action')
  })

  it('accepts YES as yes after reset', () => {
    const snapshot = mkdtempSync(join(tmpdir(), 'puzzle-cli-yes-'))
    const env = {
      ...process.env,
      PUZZLE_TAPE_PATH: join(snapshot, 'tape.json'),
    }
    runCli(['do', 'reset'], env)
    const result = runCli(['do', 'YES'], env)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('yes sent')
    expect(result.stdout).toContain('next=y')
  })

  it('rejects extra do tokens', () => {
    const result = runCli(['do', 'yes', 'now'])
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('Send one token')
  })

  it('logs invalid yes on the demo ReplicateStep', () => {
    const result = runCli(['do', 'yes'])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(
      'log  attempted to invoke invalid action yes',
    )
  })

  it('persists reset on the live Instant tape when credentials exist', () => {
    if (
      process.env['PUZZLE_TAPE'] !== 'instant' ||
      process.env['INSTANT_APP_ADMIN_TOKEN'] === undefined ||
      process.env['INSTANT_APP_ADMIN_TOKEN'] === ''
    ) {
      return
    }
    const env = { ...process.env, PUZZLE_TAPE: 'instant' }
    const reset = spawnSync(process.execPath, [cliEntryPath, 'do', 'reset'], {
      encoding: 'utf8',
      env,
    })
    expect(reset.status, reset.stderr).toBe(0)
    expect(reset.stdout).toContain('reset sent')
    const shown = spawnSync(process.execPath, [cliEntryPath, 'show'], {
      encoding: 'utf8',
      env,
    })
    expect(shown.status, shown.stderr).toBe(0)
    expect(shown.stdout).toContain(uriOf(emptyModel()))
  })

  it('replays a Program tape from --tape', async () => {
    const tape = await Effect.runPromise(
      Effect.scoped(
        Runtime.recordReplayTape(PuzzleProgram, Layer.empty, [
          ResetTape(),
          GuessedYes(),
        ]),
      ),
    )
    const json = await Effect.runPromise(
      Runtime.encodeReplayTape(PuzzleProgram, tape),
    )
    const path = join(mkdtempSync(join(tmpdir(), 'puzzle-cli-')), 'tape.json')
    writeFileSync(path, json)

    const result = runCli(['replay', '--tape', path])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('FRAME 0')
    expect(result.stdout).toContain('FRAME 1')
    expect(result.stdout).toContain('FRAME 2')
    expect(result.stdout).toContain('GuessedYes')
    expect(result.stdout).toContain(uriOf(emptyModel()))
    expect(result.stdout).toContain('next=y')
    expect(result.stdout).toContain('[ reset ]')
  })
})

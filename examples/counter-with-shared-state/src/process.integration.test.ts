import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const cliEntryPath = fileURLToPath(
  new URL('../dist/foldkitCounter.js', import.meta.url),
)
const tuiEntryPath = fileURLToPath(
  new URL('../dist/foldkitCounterTui.js', import.meta.url),
)
const temporaryDirectories = new Array<string>()

const makeStateFilePath = (): string => {
  const directoryPath = mkdtempSync(join(tmpdir(), 'foldkit-counter-process-'))
  temporaryDirectories.push(directoryPath)
  return join(directoryPath, 'state', 'counter.json')
}

const processEnvironment = (stateFilePath: string) => ({
  ...process.env,
  FOLDKIT_COUNTER_STATE_FILE: stateFilePath,
})

const runCli = (
  stateFilePath: string,
  args: ReadonlyArray<string>,
  input?: string,
) => {
  const result = spawnSync(process.execPath, [cliEntryPath, ...args], {
    encoding: 'utf8',
    env: processEnvironment(stateFilePath),
    input,
  })

  expect(result.status, result.stderr).toBe(0)
  return result.stdout
}

const waitFor = (
  predicate: () => boolean,
  timeoutMilliseconds = 5_000,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const check = () => {
      if (predicate()) {
        resolve()
      } else if (Date.now() - startedAt >= timeoutMilliseconds) {
        reject(new Error('Timed out waiting for cross-process Counter state'))
      } else {
        setTimeout(check, 10)
      }
    }
    check()
  })

afterEach(() => {
  temporaryDirectories.forEach(directoryPath => {
    rmSync(directoryPath, { recursive: true, force: true })
  })
  temporaryDirectories.splice(0)
})

describe('Counter processes', () => {
  it('persists one implicit Counter across one-shot invocations', () => {
    const stateFilePath = makeStateFilePath()

    expect(runCli(stateFilePath, ['show'])).toBe('0\n')
    expect(runCli(stateFilePath, ['increment'])).toBe('1\n')
    expect(runCli(stateFilePath, ['increment'])).toBe('2\n')
    expect(runCli(stateFilePath, ['decrement'])).toBe('1\n')
    expect(runCli(stateFilePath, ['reset'])).toBe('0\n')
  })

  it('hands the portable URI to the foreground TUI and restores its write', () => {
    const stateFilePath = makeStateFilePath()

    expect(runCli(stateFilePath, ['increment'])).toBe('1\n')
    const tuiOutput = runCli(stateFilePath, ['open', 'tui'], '+q')
    expect(tuiOutput).toContain('Saved')
    expect(runCli(stateFilePath, ['show'])).toBe('2\n')
  })

  it('observes a one-shot write in an already-running TUI', async () => {
    const stateFilePath = makeStateFilePath()
    const tui = spawn(
      process.execPath,
      [tuiEntryPath, '--uri', '/?mode=Ready&count=0'],
      {
        env: processEnvironment(stateFilePath),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    let output = ''
    tui.stdout.setEncoding('utf8')
    tui.stdout.on('data', chunk => {
      output += chunk
    })

    await waitFor(() => output.includes('Saved'))
    await waitFor(() => existsSync(join(stateFilePath, '..')))
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(runCli(stateFilePath, ['increment'])).toBe('1\n')
    await waitFor(() => output.includes('1'))

    tui.stdin.write('q')
    const exitCode = await new Promise<number | null>(resolve => {
      tui.once('exit', resolve)
    })
    expect(exitCode).toBe(0)
    expect(runCli(stateFilePath, ['show'])).toBe('1\n')
  })
})

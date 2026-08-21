import { FoldkitCounterV01 } from 'counter-core-example'
import { Effect } from 'effect'
import { cliDaemonSocketPath, stopCliDaemon } from 'foldkit/cli'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const screenEntryPath = fileURLToPath(
  new URL('../dist/screenEntry.js', import.meta.url),
)
const screenEntrySourcePath = fileURLToPath(
  new URL('./screenEntry.ts', import.meta.url),
)

const runScreenCli = (
  args: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv = { ...process.env, COUNTER_TAPE: 'memory' },
): {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
} => {
  const result = spawnSync(process.execPath, [screenEntryPath, ...args], {
    encoding: 'utf8',
    env,
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

const wholeLoopTimeoutMs = 30_000
const helpTimeoutMs = 15_000

describe('Counter screen-window CLI process', () => {
  it('keeps the slim screen view free of Effect, foldkit, Instant, and the Program', () => {
    const source = readFileSync(screenEntrySourcePath, 'utf8')
    expect(source).not.toMatch(/from ['"]effect['"]/)
    expect(source).not.toMatch(/from ['"]foldkit['"]/)
    expect(source).not.toMatch(/from ['"]counter-core-example['"]/)
    expect(source).toContain("from 'foldkit/cli/view'")
  })

  it(
    'walks the whole vocabulary loop on a file Instant tape',
    async () => {
      const cacheRoot = join(homedir(), '.cache')
      mkdirSync(cacheRoot, { recursive: true })
      const directory = mkdtempSync(join(cacheRoot, 'foldkit-counter-screen-'))
      const tapePath = join(directory, 'tape.json')
      const env = { ...process.env, COUNTER_TAPE_PATH: tapePath }

      const shown = runScreenCli([], env)
      expect(shown.status, shown.stderr).toBe(0)
      expect(shown.stdout).toContain('0\n[increment] [decrement]')
      expect(shown.stdout).not.toContain('reset')

      const once = runScreenCli(['increment'], env)
      expect(once.status, once.stderr).toBe(0)
      expect(once.stdout).toContain('sent increment')
      expect(once.stdout).toContain('1\n[increment] [decrement] [reset]')

      const twice = runScreenCli(['increment'], env)
      expect(twice.status, twice.stderr).toBe(0)
      expect(twice.stdout).toContain('2\n[increment] [decrement] [reset]')

      const reset = runScreenCli(['reset'], env)
      expect(reset.status, reset.stderr).toBe(0)
      expect(reset.stdout).toContain('sent reset')
      expect(reset.stdout).toContain('0\n[increment] [decrement]')

      const hidden = runScreenCli(['reset'], env)
      expect(hidden.status).toBe(1)
      expect(hidden.stderr).toContain('"reset" is hidden: count is already 0')

      await Effect.runPromise(
        stopCliDaemon(
          cliDaemonSocketPath({
            programId: FoldkitCounterV01.id,
            isolationKey: tapePath,
          }),
        ),
      )
      rmSync(directory, { force: true, recursive: true })
    },
    wholeLoopTimeoutMs,
  )

  it(
    'prints usage for help and rejects extra arguments',
    () => {
      const helped = runScreenCli(['--help'])
      expect(helped.status, helped.stderr).toBe(0)
      expect(helped.stdout).toContain('run: counter-screen <command>')

      const rejected = runScreenCli(['increment', 'now'])
      expect(rejected.status).toBe(1)
      expect(rejected.stderr).toContain('Send one command')
    },
    helpTimeoutMs,
  )
})

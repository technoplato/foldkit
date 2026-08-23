import { Effect } from 'effect'
import { cliDaemonSocketPath, stopCliDaemon } from 'foldkit/cli'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FoldkitPuzzleV01, emptyModel, uriOf } from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

const screenEntryPath = fileURLToPath(
  new URL('../dist/screenEntry.js', import.meta.url),
)
const screenEntrySourcePath = fileURLToPath(
  new URL('./screenEntry.ts', import.meta.url),
)

const runScreenCli = (
  args: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv = { ...process.env, PUZZLE_TAPE: 'memory' },
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

describe('Puzzle screen-window CLI process', () => {
  it('keeps the slim screen view free of Effect, foldkit, Instant, and the Program', () => {
    const source = readFileSync(screenEntrySourcePath, 'utf8')
    expect(source).not.toMatch(/from ['"]effect['"]/)
    expect(source).not.toMatch(/from ['"]foldkit['"]/)
    expect(source).not.toMatch(/from ['"]puzzle-core-example['"]/)
    expect(source).toContain("from 'foldkit/cli/view'")
  })

  it(
    'walks the whole vocabulary loop on a file Instant tape',
    async () => {
      const cacheRoot = join(homedir(), '.cache')
      mkdirSync(cacheRoot, { recursive: true })
      const directory = mkdtempSync(join(cacheRoot, 'foldkit-puzzle-screen-'))
      const tapePath = join(directory, 'tape.json')
      const env = { ...process.env, PUZZLE_TAPE_PATH: tapePath }

      const shown = runScreenCli([], env)
      expect(shown.status, shown.stderr).toBe(0)
      expect(shown.stdout).toContain('[reset]')
      expect(shown.stdout).toContain('https://puzzle.knophy.com')
      expect(shown.stdout).toContain('https://replicate.knophy.com')
      expect(shown.stdout).toContain('https://grok.knophy.com')
      expect(shown.stdout).not.toContain('[yes]')

      const reset = runScreenCli(['reset'], env)
      expect(reset.status, reset.stderr).toBe(0)
      expect(reset.stdout).toContain('sent reset')
      expect(reset.stdout).toContain(uriOf(emptyModel()))
      expect(reset.stdout).toContain('[yes] [no] [hint] [operator] [replicate]')

      const once = runScreenCli(['yes'], env)
      expect(once.status, once.stderr).toBe(0)
      expect(once.stdout).toContain('sent yes')
      expect(once.stdout).toContain('next=y')
      expect(once.stdout).toContain('[reset]')

      const again = runScreenCli(['reset'], env)
      expect(again.status, again.stderr).toBe(0)
      expect(again.stdout).toContain('sent reset')
      expect(again.stdout).toContain(uriOf(emptyModel()))

      const hidden = runScreenCli(['reset'], env)
      expect(hidden.status).toBe(1)
      expect(hidden.stderr).toContain(
        '"reset" is hidden: tape is already empty',
      )

      await Effect.runPromise(
        stopCliDaemon(
          cliDaemonSocketPath({
            programId: FoldkitPuzzleV01.id,
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
      expect(helped.stdout).toContain('run: puzzle-screen <command>')

      const rejected = runScreenCli(['yes', 'now'])
      expect(rejected.status).toBe(1)
      expect(rejected.stderr).toContain('Send one command')
    },
    helpTimeoutMs,
  )
})

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readyPuzzle } from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

import { renderPuzzleScreen } from './client.js'

const tuiEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

const readyScreen = (): string => renderPuzzleScreen(readyPuzzle())

const memoryEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PUZZLE_TAPE: 'memory',
})

const instantMissingEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PUZZLE_TAPE: 'instant',
    INSTANT_APP_ID: '',
    INSTANT_APP_ADMIN_TOKEN: '',
  }
  delete env['PUZZLE_TAPE_PATH']
  return env
}

describe('Puzzle TUI process', () => {
  it('renders Ready and quits without persistence', () => {
    const result = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      env: memoryEnv(),
      input: 'q',
      timeout: 5_000,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(readyScreen())
    expect(result.stdout).toContain('https://puzzle.knophy.com')
    expect(result.stdout).toContain('[ reset ]')

    const secondResult = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      env: memoryEnv(),
      input: 'q',
      timeout: 5_000,
    })

    expect(secondResult.status, secondResult.stderr).toBe(0)
    expect(secondResult.stdout).toContain(readyScreen())
  })

  it('paints Failed when Instant env is missing and does not crash', () => {
    const result = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      env: instantMissingEnv(),
      input: 'q',
      timeout: 5_000,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toMatch(
      /Starting Instant Puzzle|INSTANT_APP_ADMIN_TOKEN/,
    )
    expect(result.stdout).not.toContain('[ y ]')
    expect(result.stdout).not.toContain('[ reset ]')
  })
})

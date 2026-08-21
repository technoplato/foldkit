import { readyCounter } from 'counter-core-example'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { renderCounterScreen } from './client.js'

const tuiEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

const readyScreen = (count: number): string =>
  renderCounterScreen(readyCounter(count))

const memoryEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  COUNTER_TAPE: 'memory',
})

const instantMissingEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  COUNTER_TAPE: 'instant',
  INSTANT_APP_ID: '',
  INSTANT_APP_ADMIN_TOKEN: '',
})

describe('Counter TUI process', () => {
  it('renders Ready and quits without persistence', () => {
    const result = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      env: memoryEnv(),
      input: 'q',
      timeout: 5_000,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(readyScreen(0))

    const secondResult = spawnSync(process.execPath, [tuiEntryPath], {
      encoding: 'utf8',
      env: memoryEnv(),
      input: 'q',
      timeout: 5_000,
    })

    expect(secondResult.status, secondResult.stderr).toBe(0)
    expect(secondResult.stdout).toContain(readyScreen(0))
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
      /Starting Instant Counter|INSTANT_APP_ADMIN_TOKEN/,
    )
    expect(result.stdout).not.toContain('[ + ]')
  })
})

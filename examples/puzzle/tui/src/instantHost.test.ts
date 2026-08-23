import { Processor } from 'foldkit'
import { readFileSync } from 'node:fs'
import {
  describePuzzleSyncError,
  startLivePuzzle,
  waitForSyncedHandle,
} from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

describe('Puzzle TUI Instant host', () => {
  it('keeps Instant in core and out of paint', () => {
    const entrySource = readFileSync('src/entry.ts', 'utf8')
    expect(entrySource).toContain('startLivePuzzle')
    expect(entrySource).toContain('Processor.Host.Tui()')
    expect(entrySource).toContain('runPuzzleTui')
    expect(entrySource).not.toContain('Instant(')
    expect(entrySource).not.toContain('@foldkit/instant')
    expect(entrySource).not.toContain('puzzle-instant-example')
    expect(entrySource).not.toContain('loadPuzzleDemoEnv')
    expect(entrySource).not.toContain('startPuzzleWindowRuntime')
    expect(entrySource).not.toContain('signIn')
    expect(entrySource).not.toContain('void Effect')
  })

  it('shows Failed when the admin token is missing', async () => {
    const previous = process.env['INSTANT_APP_ADMIN_TOKEN']
    const previousTape = process.env['PUZZLE_TAPE']
    process.env['INSTANT_APP_ADMIN_TOKEN'] = ''
    delete process.env['PUZZLE_TAPE']
    delete process.env['PUZZLE_TAPE_PATH']
    const handle = startLivePuzzle(Processor.Host.Tui())
    const snapshot = await waitForSyncedHandle(handle)
    if (previous === undefined) {
      delete process.env['INSTANT_APP_ADMIN_TOKEN']
    } else {
      process.env['INSTANT_APP_ADMIN_TOKEN'] = previous
    }
    if (previousTape === undefined) {
      delete process.env['PUZZLE_TAPE']
    } else {
      process.env['PUZZLE_TAPE'] = previousTape
    }
    expect(snapshot._tag).toBe('Failed')
    if (snapshot._tag === 'Failed') {
      const text = describePuzzleSyncError(snapshot.error)
      expect(text).toContain('INSTANT_APP_ADMIN_TOKEN')
      expect(text).not.toContain('INSTANT_APP_ID')
      expect(text).not.toContain('secret')
      expect(text).not.toContain('TransportFailed')
    }
    handle.stop()
  })
})

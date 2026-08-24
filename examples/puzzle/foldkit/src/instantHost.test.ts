import { Processor } from 'foldkit'
import { readFileSync } from 'node:fs'
import {
  SyncedPuzzle,
  hangingSyncedEngine,
  readyPuzzle,
  startSyncedPuzzleHandle,
  waitForSyncedHandle,
} from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

import {
  paintPuzzleHostStatus,
  reportAttachedFoldkitFailure,
  shouldPaintPuzzleHostStatus,
} from './instantHost.js'

describe('Puzzle Foldkit Instant host chrome', () => {
  it('paints Failed host chrome and leaves Starting and Ready to Foldkit', () => {
    const container = document.createElement('div')
    expect(paintPuzzleHostStatus(container, SyncedPuzzle.Starting())).toBe(
      false,
    )
    expect(container.textContent).toBe('')
    expect(
      paintPuzzleHostStatus(
        container,
        SyncedPuzzle.Failed({
          error: SyncedPuzzle.TransportFailed({
            what: 'Instant did not return a snapshot.',
            meaning: 'This Processor could not start from Instant.',
            fix: 'Check the Instant app and try again.',
            cause:
              'Instant() needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.',
          }),
        }),
      ),
    ).toBe(true)
    expect(container.textContent).toContain('INSTANT_APP_ADMIN_TOKEN')
    expect(container.textContent).not.toContain('TransportFailed')
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(paintPuzzleHostStatus(container, readyPuzzle())).toBe(false)
  })

  it('paints Failed when Instant subscribe never settles', async () => {
    const handle = startSyncedPuzzleHandle(
      hangingSyncedEngine(Processor.Host.Foldkit()),
      { settleMs: 50 },
    )
    try {
      const snapshot = await waitForSyncedHandle(handle, 1000)
      expect(shouldPaintPuzzleHostStatus(snapshot)).toBe(true)
      const container = document.createElement('div')
      expect(paintPuzzleHostStatus(container, snapshot)).toBe(true)
      expect(container.textContent).toContain(
        'This Processor never became Ready.',
      )
      expect(container.textContent).toContain('start did not settle')
      expect(container.textContent).not.toContain('TransportFailed')
      expect(container.querySelector('button')).toBeNull()
    } finally {
      await handle.stop()
    }
  })

  it('keeps host chrome off Starting so Foldkit can paint puzzleScreen', () => {
    expect(shouldPaintPuzzleHostStatus(SyncedPuzzle.Starting())).toBe(false)
    expect(shouldPaintPuzzleHostStatus(readyPuzzle())).toBe(false)
    expect(
      shouldPaintPuzzleHostStatus(
        SyncedPuzzle.Failed({
          error: SyncedPuzzle.TransportFailed({
            what: 'Instant did not return a snapshot.',
            meaning: 'This Processor could not start from Instant.',
            fix: 'Check the Instant app and try again.',
            cause: 'Instant read or subscribe did not settle.',
          }),
        }),
      ),
    ).toBe(true)
  })

  it('opens Instant through startLivePuzzle and Processor.Host.Foldkit()', () => {
    const source = readFileSync('src/instantHost.ts', 'utf8')
    expect(source).toContain('startLivePuzzle')
    expect(source).toContain('Processor.Host.Foldkit()')
    expect(source).toContain('document.addEventListener')
    expect(source).not.toContain('window.addEventListener')
    expect(source).not.toContain('Instant(')
    expect(source).not.toContain('@foldkit/instant')
    expect(source).not.toContain('puzzle-instant-example')
    expect(source).not.toContain('openLivePuzzleWindowTape')
    expect(source).not.toContain('signIn')
    expect(source).not.toContain('StartingWindow')
    expect(source).not.toContain('void Effect.runPromise')
  })

  it('keeps Instant out of the Foldkit window view', () => {
    const viewSource = readFileSync('src/view.ts', 'utf8')
    expect(viewSource).toContain('paintHtml')
    expect(viewSource).toContain('App.screen')
    expect(viewSource).toContain('paintHtml(screen')
    expect(viewSource).not.toContain('h.h1')
    expect(viewSource).not.toContain('surface.description')
    expect(viewSource).not.toContain('h.Href(surface.sourceUrl)')
    expect(viewSource).not.toContain('surface.live')
    expect(viewSource).not.toContain('surface.sourceUrl')
    expect(viewSource).not.toContain('github.com')
    expect(viewSource).not.toContain('@instantdb')
    expect(viewSource).not.toContain('@foldkit/instant')
    expect(viewSource).not.toContain('store.send')
    expect(viewSource).not.toContain('store.observe')
    expect(viewSource).not.toContain('void Effect.runPromise')
    expect(viewSource).not.toContain('Button.view')
    expect(viewSource).not.toContain('ReplicateStep')
  })

  it('keeps Ready when Foldkit attach fails', () => {
    expect(() => {
      reportAttachedFoldkitFailure(
        new Error('Foldkit could not attach the Puzzle screen.'),
      )
    }).not.toThrow()
  })
})

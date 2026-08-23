import { Processor } from 'foldkit'
import { readFileSync } from 'node:fs'
import {
  GuessedYes,
  Path,
  type SyncedPuzzleHandle,
  demoModel,
  emptyModel,
  memorySyncedEngine,
  startSyncedPuzzleHandle,
  update,
  uriOf,
  waitForSyncedHandle,
} from 'puzzle-core-example'
import { afterEach, describe, expect, it } from 'vitest'

import { startInstantPuzzle } from './instantHost.js'
import {
  installSyncedPuzzleHandle,
  resetSyncedPuzzleHandle,
  useActions,
  useModel,
  useScreen,
} from './processor.js'

const [afterYes] = update(emptyModel(), GuessedYes())

const waitForReadyUri = async (handle: SyncedPuzzleHandle, uri: string) => {
  const current = handle.readModel()
  if (current._tag === 'Ready' && uriOf(current.product) === uri) {
    return current
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop()
      reject(new Error('Timed out waiting for the Puzzle handle.'))
    }, 1000)
    const stop = handle.subscribe(() => {
      const next = handle.readModel()
      if (next._tag === 'Ready' && uriOf(next.product) === uri) {
        clearTimeout(timeout)
        stop()
        resolve(next)
      }
    })
  })
}

let handle: SyncedPuzzleHandle | undefined

afterEach(() => {
  resetSyncedPuzzleHandle()
  handle = undefined
})

describe('Puzzle Svelte processor', () => {
  it('keeps Instant out of the Svelte window', () => {
    const viewSource = readFileSync('src/App.svelte', 'utf8')
    expect(viewSource).toContain('useModel(Path())')
    expect(viewSource).toContain('useScreen(Path())')
    expect(viewSource).toContain('PaintScreen')
    expect(viewSource).toContain('describePuzzleSyncError')
    expect(viewSource).not.toContain('useActions(Path())')
    expect(viewSource).not.toContain('ReplicateStep')
    expect(viewSource).not.toContain('StartingWindow')
    expect(viewSource).not.toContain('signIn')
    expect(viewSource).not.toContain("useModel('/puzzle')")
    expect(viewSource).not.toContain('@instantdb')
    expect(viewSource).not.toContain('@foldkit/instant')
    expect(viewSource).not.toContain('instantHost')
    expect(viewSource).not.toContain('store.send')
    expect(viewSource).not.toContain('github.com')
    expect(viewSource).not.toContain('surface.live')
    expect(viewSource).not.toContain('surface.sourceUrl')
  })

  it('installs Instant from the host with Processor.Host.Svelte()', () => {
    const hostSource = readFileSync('src/instantHost.ts', 'utf8')
    const entrySource = readFileSync('src/main.ts', 'utf8')
    expect(hostSource).toContain('installSyncedPuzzleHandle')
    expect(hostSource).toContain('startLivePuzzle')
    expect(hostSource).toContain('Processor.Host.Svelte()')
    expect(hostSource).not.toContain('Instant(')
    expect(hostSource).not.toContain('@foldkit/instant')
    expect(hostSource).not.toContain('puzzle-instant-example')
    expect(hostSource).not.toContain('openLivePuzzleWindowTape')
    expect(hostSource).not.toContain('signIn')
    expect(entrySource).toContain('startInstantPuzzle')
    expect(entrySource).not.toContain('VITE_INSTANT_APP_ID')
    expect(startInstantPuzzle).toEqual(expect.any(Function))
  })

  it('draws Ready from useModel and adds one without send', async () => {
    handle = startSyncedPuzzleHandle(
      memorySyncedEngine(Processor.Host.Svelte()),
    )
    installSyncedPuzzleHandle(handle)
    const ready = await waitForSyncedHandle(handle)
    expect(ready).toEqual({
      _tag: 'Ready',
      product: demoModel(),
      actionMenu: { _tag: 'Closed' },
    })
    expect(useModel(Path())).toEqual({
      _tag: 'Ready',
      product: demoModel(),
      actionMenu: { _tag: 'Closed' },
    })
    expect(useScreen(Path())).toBeDefined()

    const reset = useActions(Path()).resetButtonTapped
    expect(reset._tag).toBe('Tappable')
    if (reset._tag === 'Tappable') {
      reset.tap()
    }
    await waitForReadyUri(handle, uriOf(emptyModel()))
    useActions(Path()).yesButtonTapped()
    const next = await waitForReadyUri(handle, uriOf(afterYes))
    expect(next).toEqual({
      _tag: 'Ready',
      product: afterYes,
      actionMenu: { _tag: 'Closed' },
    })
  })
})

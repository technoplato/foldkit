import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  emptyInstantPuzzleSnapshot,
  instantReadTimeoutMs,
} from './instantSchema.js'
import { queryOncePuzzleSnapshotLogState } from './instantTransport.js'
import { defaultPrompt } from './tape.js'
import { TAPE_UUID, TapeRow } from './wire.js'

describe('queryOncePuzzleSnapshotLogState', () => {
  it('Ready-paints a live Instant tape row from queryOnce', async () => {
    const snapshot = TapeRow.make({
      asOf: 'foldkit-processor',
      at: 1_700_000_000_000,
      id: TAPE_UUID,
      prompt: defaultPrompt,
      steps: [],
    })
    const state = await queryOncePuzzleSnapshotLogState(
      () =>
        Promise.resolve({
          message: [],
          tape: [snapshot],
        }),
      new AbortController().signal,
    )
    expect(state.snapshot).toEqual(snapshot)
    expect(state.snapshot?.id).toBe(TAPE_UUID)
    expect(state.snapshot?.asOf).toBe('foldkit-processor')
    expect(state.snapshot?.at).toBe(1_700_000_000_000)
  })

  it('does not finish empty before queryOnce resolves', async () => {
    let settleQuery: ((value: unknown) => void) | undefined
    const query = new Promise(resolve => {
      settleQuery = resolve
    })
    const pending = queryOncePuzzleSnapshotLogState(
      () => query,
      new AbortController().signal,
    )
    await Promise.resolve()
    await Promise.resolve()
    let isSettled = false
    void pending.then(
      () => {
        isSettled = true
      },
      () => {
        isSettled = true
      },
    )
    await Promise.resolve()
    expect(isSettled).toBe(false)
    if (settleQuery === undefined) {
      throw new Error('Expected queryOnce to start.')
    }
    settleQuery({ message: [], tape: [] })
    const state = await pending
    expect(state.snapshot).toEqual(emptyInstantPuzzleSnapshot)
  })

  it('rejects on a real Instant queryOnce error', async () => {
    await expect(
      queryOncePuzzleSnapshotLogState(
        () => Promise.reject(new Error('Query timed out')),
        new AbortController().signal,
      ),
    ).rejects.toThrow('Query timed out')
  })
})

describe('InstantPuzzle browser boot', () => {
  it('calls Instant queryOnce instead of skip-read or microtask empty', () => {
    const source = readFileSync('src/instantTransport.ts', 'utf8')
    expect(source).toContain('database.queryOnce(puzzleSnapshotLogQuery)')
    expect(source).toContain('makeInstantCorePuzzleSnapshotLogTransport')
    expect(source).not.toContain(
      'read: () => Effect.succeed(emptyPuzzleSnapshotLogState)',
    )
    expect(source).not.toContain('queueMicrotask')
    expect(source).toContain('instantReadTimeoutMs')
    expect(instantReadTimeoutMs).toBeGreaterThan(0)
  })
})

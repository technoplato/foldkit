import { type CounterWindowModel, uri } from 'counter-core-example'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { startInstantCounterWindow } from './instantHost.js'

const waitForSnapshot = async (
  read: () => CounterWindowModel,
  tag: CounterWindowModel['_tag'],
): Promise<CounterWindowModel> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const snapshot = read()
    if (snapshot._tag === tag) {
      return snapshot
    }
    await Promise.resolve()
  }
  return read()
}

describe('Counter TUI Instant host', () => {
  it('keeps Instant in the Host and out of paint', () => {
    const hostSource = readFileSync('src/instantHost.ts', 'utf8')
    const entrySource = readFileSync('src/entry.ts', 'utf8')
    expect(hostSource).toContain('startCounterWindowRuntime')
    expect(hostSource).toContain('makeInstantCounterSnapshotLog')
    expect(hostSource).toContain('openSnapshotCounterWindowTape')
    expect(hostSource).toContain('counterProcessorIds.tui')
    expect(hostSource).not.toContain('void Effect')
    expect(hostSource).not.toContain('Effect.orDie')
    expect(hostSource).not.toContain('renderCounterScreen')
    expect(hostSource).not.toContain('Terminal')
    expect(entrySource).toContain('startInstantCounterWindow')
    expect(entrySource).toContain('runCounterTui')
  })

  it('shows FailedWindow when Instant env is missing', async () => {
    const runtime = startInstantCounterWindow({
      COUNTER_TAPE: 'instant',
    })
    const snapshot = await waitForSnapshot(
      () => runtime.getSnapshot(uri),
      'FailedWindow',
    )
    expect(snapshot).toEqual({
      _tag: 'FailedWindow',
      error:
        'COUNTER_TAPE=instant needs INSTANT_APP_ID. Use the foldkit Instant demo wrapper.',
    })
    runtime.stop()
  })
})

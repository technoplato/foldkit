import { describe, expect, it } from 'vitest'

import { actions, snapshot, subscribe } from './processor.js'

const listUri = '/counters'
const counterUri = '/counters/counter-1'
const missingAppIdError =
  'VITE_INSTANT_APP_ID is missing. Start through the Instant demo wrapper.'

const waitForSnapshot = async (
  uri: string,
  tag: 'StartingWindow' | 'FailedWindow' | 'ReadyWindow',
) => {
  const current = snapshot(uri)
  if (current._tag === tag) {
    return current
  }
  return new Promise<ReturnType<typeof snapshot>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop()
      reject(new Error(`Timed out waiting for ${tag}`))
    }, 1000)
    const stop = subscribe(() => {
      const next = snapshot(uri)
      if (next._tag === tag) {
        clearTimeout(timeout)
        stop()
        resolve(next)
      }
    })
  })
}

describe('Multiple Counters SvelteKit Host', () => {
  it('draws FailedWindow from snapshot when Instant app id is missing', async () => {
    const first = snapshot(listUri)
    expect(first._tag).toBe('StartingWindow')
    const failed = await waitForSnapshot(listUri, 'FailedWindow')
    expect(failed).toEqual({
      _tag: 'FailedWindow',
      error: missingAppIdError,
    })
    expect(actions(listUri)).toHaveProperty('signIn')
    expect(actions(listUri)).not.toHaveProperty('send')
  })

  it('does not increment a local Counter while Instant is Failed', async () => {
    const failed = await waitForSnapshot(listUri, 'FailedWindow')
    expect(failed).toEqual({
      _tag: 'FailedWindow',
      error: missingAppIdError,
    })
    actions(counterUri).increment()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(snapshot(counterUri)).toEqual({
      _tag: 'FailedWindow',
      error: missingAppIdError,
    })
  })
})

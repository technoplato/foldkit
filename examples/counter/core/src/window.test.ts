import { describe, expect, it } from 'vitest'

import { type CounterWindowModel, Increment, Model, uri } from './index.js'
import {
  FailedCounterSession,
  SignedInCounterSession,
  describeCounterWindowError,
  memoryCounterTape,
  projectCounterWindow,
  startCounterWindowRuntime,
  startMemoryCounterWindow,
} from './window.js'

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

describe('Counter window runtime', () => {
  it('projects ReadyWindow count for /counter', () => {
    const snapshot = projectCounterWindow(uri, {
      _tag: 'ReadyWindow',
      model: Model.make({ count: 4 }),
    })
    expect(snapshot).toEqual({ _tag: 'ReadyWindow', count: 4 })
  })

  it('increments through actions and hides reset at 0', async () => {
    const runtime = startMemoryCounterWindow()
    await waitForSnapshot(() => runtime.getSnapshot(uri), 'ReadyWindow')
    const actions = runtime.actions(uri)
    expect(actions).not.toHaveProperty('send')
    expect(actions).not.toHaveProperty('observe')
    actions.clickedReset()
    expect(runtime.getSnapshot(uri)).toEqual({ _tag: 'ReadyWindow', count: 0 })
    actions.clickedIncrement()
    expect(runtime.getSnapshot(uri)).toEqual({ _tag: 'ReadyWindow', count: 1 })
    runtime.enqueue(Increment())
    expect(runtime.getSnapshot(uri)).toEqual({ _tag: 'ReadyWindow', count: 2 })
    runtime.stop()
  })

  it('shows failed sign-in as a FailedWindow snapshot', async () => {
    const runtime = startCounterWindowRuntime({
      openTape: () => Promise.resolve(memoryCounterTape()),
      signIn: () =>
        Promise.resolve(
          FailedCounterSession.make({
            error: 'Sign-in failed. Instant has no session.',
          }),
        ),
    })
    await waitForSnapshot(() => runtime.getSnapshot(uri), 'FailedWindow')
    expect(runtime.getSnapshot(uri)).toEqual({
      _tag: 'FailedWindow',
      error: 'Sign-in failed. Instant has no session.',
    })
    runtime.stop()
  })

  it('describes a thrown Instant error', () => {
    expect(
      describeCounterWindowError(
        new Error('Instant has no Counter demo user.'),
      ),
    ).toBe('Instant has no Counter demo user.')
    expect(describeCounterWindowError('nope')).toBe(
      'Instant could not open the Counter tape.',
    )
    expect(SignedInCounterSession.make({ userId: 'user-1' })._tag).toBe(
      'SignedInCounterSession',
    )
  })

  it('surfaces a host attach failure as FailedWindow', async () => {
    const runtime = startMemoryCounterWindow()
    await waitForSnapshot(() => runtime.getSnapshot(uri), 'ReadyWindow')
    runtime.fail('Foldkit could not attach the Counter screen.')
    expect(runtime.getSnapshot(uri)).toEqual({
      _tag: 'FailedWindow',
      error: 'Foldkit could not attach the Counter screen.',
    })
    runtime.stop()
  })
})

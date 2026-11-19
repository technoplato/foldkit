import { describe, expect, it } from 'vitest'

// @ts-expect-error The tool is plain JavaScript that runs with no build.
import * as tool from '../../bin/foldkit-sim-session.mjs'

type Ran = Readonly<{ code: number; cleanedUp: ReadonlyArray<string> }>

const session = (
  body: () => Promise<number>,
  cleanups: ReadonlyArray<readonly [string, () => Promise<void>]>,
): Promise<Ran> => {
  const cleanedUp: Array<string> = []
  return tool
    .withCleanup({
      body,
      cleanups: cleanups.map(([name, run]) => ({
        name,
        run: async () => {
          cleanedUp.push(name)
          await run()
        },
      })),
      report: () => undefined,
    })
    .then((code: number) => ({ code, cleanedUp }))
}

const quietly = (): Promise<void> => Promise.resolve()

describe('a test session on a simulator that always cleans up', () => {
  it('pauses what plays and shuts down after a test that passes, in the order given', async () => {
    const ran = await session(
      () => Promise.resolve(0),
      [
        ['pause', quietly],
        ['close the app', quietly],
        ['shut the simulator down', quietly],
      ],
    )
    expect(ran).toEqual({
      code: 0,
      cleanedUp: ['pause', 'close the app', 'shut the simulator down'],
    })
  })

  it('does the same after a test that fails, and still says it failed', async () => {
    const ran = await session(
      () => Promise.resolve(3),
      [
        ['pause', quietly],
        ['shut the simulator down', quietly],
      ],
    )
    expect(ran).toEqual({
      code: 3,
      cleanedUp: ['pause', 'shut the simulator down'],
    })
  })

  it('does the same after a test that throws', async () => {
    const ran = await session(
      () => Promise.reject(new Error('the step broke')),
      [
        ['pause', quietly],
        ['shut the simulator down', quietly],
      ],
    )
    expect(ran.code).not.toBe(0)
    expect(ran.cleanedUp).toEqual(['pause', 'shut the simulator down'])
  })

  it('goes on to the next cleanup when one fails, and fails the session', async () => {
    const ran = await session(
      () => Promise.resolve(0),
      [
        ['pause', () => Promise.reject(new Error('nothing to pause'))],
        ['shut the simulator down', quietly],
      ],
    )
    expect(ran.code).not.toBe(0)
    expect(ran.cleanedUp).toEqual(['pause', 'shut the simulator down'])
  })
})

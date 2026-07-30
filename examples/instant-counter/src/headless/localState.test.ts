import { Effect } from 'effect'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  headlessStatePathFromEnvironment,
  makeHeadlessLocalState,
} from './localState.js'

const temporaryDirectories: Array<string> = []

const makeStatePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'foldkit-counter-state-'))
  temporaryDirectories.push(directory)
  return join(directory, 'nested', 'headless-state.json')
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach(directory => {
    rmSync(directory, { force: true, recursive: true })
  })
})

describe('headless local state', () => {
  it('accepts a disposable state-path override without treating it as data', () => {
    expect(
      headlessStatePathFromEnvironment({
        FOLDKIT_INSTANT_COUNTER_HEADLESS_STATE_PATH: '/tmp/demo-state.json',
      }),
    ).toBe('/tmp/demo-state.json')
    expect(headlessStatePathFromEnvironment({})).toBeUndefined()
  })

  it('advances actor sequences across process restarts', async () => {
    const statePath = makeStatePath()
    const firstProcess = await Effect.runPromise(
      makeHeadlessLocalState(statePath),
    )

    expect(
      await Effect.runPromise(firstProcess.nextActorSequence('session-1')),
    ).toBe(1)
    expect(
      await Effect.runPromise(firstProcess.nextActorSequence('session-1')),
    ).toBe(2)

    const restartedProcess = await Effect.runPromise(
      makeHeadlessLocalState(statePath),
    )
    expect(restartedProcess.identity).toStrictEqual(firstProcess.identity)
    expect(
      await Effect.runPromise(restartedProcess.nextActorSequence('session-1')),
    ).toBe(3)
    expect(
      await Effect.runPromise(restartedProcess.nextActorSequence('session-2')),
    ).toBe(1)
  })

  it('records an effect claim before execution and preserves it across restart', async () => {
    const statePath = makeStatePath()
    const firstProcess = await Effect.runPromise(
      makeHeadlessLocalState(statePath),
    )

    expect(firstProcess.claimEffect('effect-1')).toBe(true)
    expect(firstProcess.claimEffect('effect-1')).toBe(false)

    const restartedProcess = await Effect.runPromise(
      makeHeadlessLocalState(statePath),
    )
    expect(restartedProcess.claimEffect('effect-1')).toBe(false)
    expect(restartedProcess.claimEffect('effect-2')).toBe(true)
    expect(statSync(statePath).mode & 0o777).toBe(0o600)
    expect(readFileSync(statePath, 'utf8')).not.toMatch(
      /adminToken|refreshToken|magicCode/i,
    )
  })

  it('does not change permissions on an existing parent directory', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'foldkit-counter-parent-'))
    temporaryDirectories.push(directory)
    chmodSync(directory, 0o755)
    const statePath = join(directory, 'headless-state.json')

    await Effect.runPromise(makeHeadlessLocalState(statePath))

    expect(statSync(directory).mode & 0o777).toBe(0o755)
    expect(statSync(statePath).mode & 0o777).toBe(0o600)
  })
})

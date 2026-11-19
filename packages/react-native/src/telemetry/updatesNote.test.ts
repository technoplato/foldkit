import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type UpdatesCheck,
  runningCodeOf,
  updatesOutcomeOf,
  watchUpdates,
} from './updatesNote.js'

const settled: UpdatesCheck = {
  isChecking: false,
  isDownloading: false,
  isUpdateAvailable: false,
  isUpdatePending: false,
}

describe('which code a phone app is running', () => {
  it('is the code it was built with, by its own name, when no update has been taken', () => {
    expect(
      runningCodeOf({
        isEnabled: true,
        updateId: 'built-in-id',
        isEmbeddedLaunch: true,
        isEmergencyLaunch: false,
        runtimeVersion: 'runtime-1',
        createdAt: new Date('2026-11-19T15:00:00Z'),
      }),
    ).toEqual({
      code: {
        updateId: 'built-in-id',
        isBuiltIn: true,
        runtime: 'runtime-1',
        madeAt: '2026-11-19T15:00:00.000Z',
      },
    })
  })

  it('is an update taken over the air, by its own name', () => {
    expect(
      runningCodeOf({
        isEnabled: true,
        updateId: 'update-id',
        isEmbeddedLaunch: false,
        isEmergencyLaunch: false,
        runtimeVersion: 'runtime-1',
        createdAt: new Date('2026-11-19T16:00:00Z'),
      }),
    ).toEqual({
      code: {
        updateId: 'update-id',
        isBuiltIn: false,
        runtime: 'runtime-1',
        madeAt: '2026-11-19T16:00:00.000Z',
      },
    })
  })

  it('says so when the app fell back to its built-in code because an update would not start', () => {
    expect(
      runningCodeOf({
        isEnabled: true,
        updateId: 'built-in-id',
        isEmbeddedLaunch: true,
        isEmergencyLaunch: true,
        runtimeVersion: 'runtime-1',
        createdAt: null,
      }),
    ).toEqual({
      code: {
        updateId: 'built-in-id',
        isBuiltIn: true,
        runtime: 'runtime-1',
        fellBack: true,
      },
    })
  })

  it('is only what the build carries when updates are off', () => {
    expect(
      runningCodeOf({
        isEnabled: false,
        updateId: null,
        isEmbeddedLaunch: true,
        isEmergencyLaunch: false,
        runtimeVersion: null,
        createdAt: null,
      }),
    ).toEqual({ code: { updates: 'off' } })
  })
})

describe('what came of asking for newer code', () => {
  it('is nothing to say while the app is still asking or fetching', () => {
    expect(updatesOutcomeOf({ ...settled, isChecking: true })).toEqual(
      Option.none(),
    )
    expect(updatesOutcomeOf({ ...settled, isDownloading: true })).toEqual(
      Option.none(),
    )
    expect(updatesOutcomeOf(settled)).toEqual(Option.none())
  })

  it('is that there is none newer', () => {
    expect(
      updatesOutcomeOf({
        ...settled,
        lastCheckForUpdateTime: new Date('2026-11-19T16:00:00Z'),
      }),
    ).toEqual(Option.some({ updates: 'none newer' }))
  })

  it('is that newer code was fetched and runs from the next open', () => {
    expect(
      updatesOutcomeOf({
        ...settled,
        isUpdateAvailable: true,
        isUpdatePending: true,
        downloadedManifest: { id: 'newer-id' },
      }),
    ).toEqual(
      Option.some({
        updates: 'fetched; runs from the next open',
        updateId: 'newer-id',
      }),
    )
  })

  it('is that the server could not be reached, which is no failure of the app', () => {
    expect(
      updatesOutcomeOf({
        ...settled,
        checkError: { message: 'The request timed out.' },
      }),
    ).toEqual(
      Option.some({
        updates: 'could not ask the updates server; keeping the code it has',
        why: 'The request timed out.',
      }),
    )
  })

  it('is that newer code could not be fetched', () => {
    expect(
      updatesOutcomeOf({
        ...settled,
        isUpdateAvailable: true,
        downloadError: { message: 'x'.repeat(500) },
      }),
    ).toEqual(
      Option.some({
        updates: 'could not fetch the newer code; keeping the code it has',
        why: 'x'.repeat(200),
      }),
    )
  })
})

describe('a phone app that says what came of asking, once', () => {
  it('says what was already known when it started watching, then each change, never the same thing twice', () => {
    const said: Array<Readonly<Record<string, unknown>>> = []
    const listeners: Array<(event: { context: UpdatesCheck }) => void> = []
    watchUpdates({
      latest: { ...settled, isChecking: true },
      listen: listener => {
        listeners.push(listener)
      },
      say: note => {
        said.push(note)
      },
    })
    const tell = (context: UpdatesCheck): void => {
      listeners.forEach(listener => {
        listener({ context })
      })
    }

    expect(said).toEqual([])
    const noneNewer = {
      ...settled,
      lastCheckForUpdateTime: new Date('2026-11-19T16:00:00Z'),
    }
    tell(noneNewer)
    tell(noneNewer)
    tell({
      ...settled,
      isUpdateAvailable: true,
      isUpdatePending: true,
      downloadedManifest: { id: 'newer-id' },
    })

    expect(said).toEqual([
      { updates: 'none newer' },
      { updates: 'fetched; runs from the next open', updateId: 'newer-id' },
    ])
  })
})

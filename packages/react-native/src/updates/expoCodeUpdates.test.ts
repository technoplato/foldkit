import { Array, Effect, Option, Stream } from 'effect'
import {
  Asking,
  BuiltIn,
  type CodeStatus,
  CompletedRestartOnNewerCode,
  CouldNotAsk,
  CouldNotFetch,
  FailedRestartOnNewerCode,
  FellBack,
  Fetching,
  Found,
  NoneNewer,
  NotAsked,
  ObservedCodeStatus,
  Ready,
  RestartOnNewerCode,
  Update,
  statusStream,
} from 'foldkit/code-updates'
import { describe, expect, it } from 'vitest'

import {
  type ExpoUpdates,
  type ExpoUpdatesCheck,
  expoCodeUpdates,
  newerCodeOfExpo,
  runningCodeOfExpo,
} from './expoCodeUpdates.js'

const settled: ExpoUpdatesCheck = {
  isChecking: false,
  isDownloading: false,
  isUpdateAvailable: false,
  isUpdatePending: false,
}

const checkedAt = new Date('2026-11-20T19:40:00Z')

const madeAt = new Date('2026-11-20T19:37:00Z')

type Listener = (event: Readonly<{ context: ExpoUpdatesCheck }>) => void

const expoModule = (
  overrides: Partial<ExpoUpdates> = {},
  later: ReadonlyArray<ExpoUpdatesCheck> = [],
): ExpoUpdates & Readonly<{ heard: { removedCount: number } }> => {
  const heard = { removedCount: 0 }
  return {
    isEnabled: true,
    updateId: 'update-id',
    isEmbeddedLaunch: false,
    isEmergencyLaunch: false,
    runtimeVersion: 'runtime-1',
    createdAt: madeAt,
    latestContext: { ...settled, isChecking: true },
    addUpdatesStateChangeListener: (listener: Listener) => {
      later.forEach(context => {
        listener({ context })
      })
      return {
        remove: () => {
          heard.removedCount += 1
        },
      }
    },
    reloadAsync: () => Promise.resolve(),
    ...overrides,
    heard,
  }
}

const running = Update({
  maybeUpdateId: Option.some('update-id'),
  maybeRuntime: Option.some('runtime-1'),
  maybeMadeAtMs: Option.some(madeAt.getTime()),
})

describe('which code an Expo app runs, as Foldkit reads it', () => {
  it('is an update taken over the air, by its own name, runtime and time', () => {
    expect(runningCodeOfExpo(expoModule())).toEqual(Option.some(running))
  })

  it('is the code the build carries when no update has been taken', () => {
    expect(
      runningCodeOfExpo(
        expoModule({ updateId: 'built-in-id', isEmbeddedLaunch: true }),
      ),
    ).toEqual(
      Option.some(
        BuiltIn({
          maybeUpdateId: Option.some('built-in-id'),
          maybeRuntime: Option.some('runtime-1'),
          maybeMadeAtMs: Option.some(madeAt.getTime()),
        }),
      ),
    )
  })

  it('is the built-in code it fell back to when an update would not start', () => {
    expect(
      runningCodeOfExpo(
        expoModule({
          updateId: 'built-in-id',
          isEmbeddedLaunch: true,
          isEmergencyLaunch: true,
          createdAt: null,
        }),
      ),
    ).toEqual(
      Option.some(
        FellBack({
          maybeUpdateId: Option.some('built-in-id'),
          maybeRuntime: Option.some('runtime-1'),
          maybeMadeAtMs: Option.none(),
        }),
      ),
    )
  })

  it('is nothing to say when updates are off, as in a development build', () => {
    expect(
      runningCodeOfExpo(
        expoModule({
          isEnabled: false,
          updateId: null,
          isEmbeddedLaunch: true,
          runtimeVersion: null,
          createdAt: null,
        }),
      ),
    ).toEqual(Option.none())
  })
})

describe('where an Expo app is in asking for newer code', () => {
  it('has not asked, is asking, or is fetching', () => {
    expect(newerCodeOfExpo(settled)).toEqual(NotAsked())
    expect(newerCodeOfExpo({ ...settled, isChecking: true })).toEqual(Asking())
    expect(newerCodeOfExpo({ ...settled, isDownloading: true })).toEqual(
      Fetching(),
    )
  })

  it('asked and found none newer', () => {
    expect(
      newerCodeOfExpo({ ...settled, lastCheckForUpdateTime: checkedAt }),
    ).toEqual(NoneNewer())
  })

  it('found newer code it has not fetched, which is not none newer', () => {
    expect(
      newerCodeOfExpo({
        ...settled,
        isUpdateAvailable: true,
        lastCheckForUpdateTime: checkedAt,
        latestManifest: { id: 'newer-id' },
      }),
    ).toEqual(Found({ maybeUpdateId: Option.some('newer-id') }))
  })

  it('has newer code fetched and ready, by its name when the module names it', () => {
    expect(
      newerCodeOfExpo({
        ...settled,
        isUpdateAvailable: true,
        isUpdatePending: true,
        downloadedManifest: { id: 'newer-id' },
      }),
    ).toEqual(Ready({ maybeUpdateId: Option.some('newer-id') }))
    expect(newerCodeOfExpo({ ...settled, isUpdatePending: true })).toEqual(
      Ready({ maybeUpdateId: Option.none() }),
    )
  })

  it('could not ask, or could not fetch, with a reason short enough to show', () => {
    expect(
      newerCodeOfExpo({
        ...settled,
        checkError: { message: 'The request timed out.' },
      }),
    ).toEqual(CouldNotAsk({ why: 'The request timed out.' }))
    expect(
      newerCodeOfExpo({
        ...settled,
        isUpdateAvailable: true,
        downloadError: { message: 'x'.repeat(500) },
      }),
    ).toEqual(CouldNotFetch({ why: 'x'.repeat(200) }))
  })

  it('reads a module that says null where it has nothing to say', () => {
    expect(
      newerCodeOfExpo({
        ...settled,
        checkError: null,
        downloadError: null,
        downloadedManifest: null,
        latestManifest: null,
        lastCheckForUpdateTime: null,
      }),
    ).toEqual(NotAsked())
  })
})

describe('what an Expo app says of its code to a Program', () => {
  const noneNewer: ExpoUpdatesCheck = {
    ...settled,
    lastCheckForUpdateTime: checkedAt,
  }
  const fetched: ExpoUpdatesCheck = {
    ...settled,
    isUpdateAvailable: true,
    isUpdatePending: true,
    downloadedManifest: { id: 'newer-id' },
  }

  it('is the status when the Program starts listening, then each change, never the same twice running', async () => {
    const updates = expoModule({}, [noneNewer, noneNewer, fetched])
    const heard = await Effect.runPromise(
      Stream.runCollect(Stream.take(statusStream, 3)).pipe(
        Effect.provide(expoCodeUpdates(updates)),
      ),
    )
    const statuses: ReadonlyArray<CodeStatus> = [
      { running, newer: Asking() },
      { running, newer: NoneNewer() },
      { running, newer: Ready({ maybeUpdateId: Option.some('newer-id') }) },
    ]
    expect(Array.fromIterable(heard)).toEqual(
      Array.map(statuses, status => ObservedCodeStatus({ status })),
    )
    expect(updates.heard.removedCount).toBe(1)
  })

  it('reads where the module stands when listening starts, not when the supply was made', async () => {
    const stands: { context: ExpoUpdatesCheck } = {
      context: { ...settled, isChecking: true },
    }
    const supply = expoCodeUpdates({
      ...expoModule(),
      get latestContext() {
        return stands.context
      },
    })
    stands.context = noneNewer
    const heard = await Effect.runPromise(
      Stream.runCollect(Stream.take(statusStream, 1)).pipe(
        Effect.provide(supply),
      ),
    )
    expect(Array.fromIterable(heard)).toEqual([
      ObservedCodeStatus({ status: { running, newer: NoneNewer() } }),
    ])
  })

  it('says nothing when updates are off', async () => {
    const heard = await Effect.runPromise(
      Stream.runCollect(statusStream).pipe(
        Effect.provide(expoCodeUpdates(expoModule({ isEnabled: false }))),
      ),
    )
    expect(Array.fromIterable(heard)).toEqual([])
  })

  it('restarts through the module, and a refusal carries its reason', async () => {
    const reloads = { count: 0 }
    const willing = expoCodeUpdates(
      expoModule({
        reloadAsync: () => {
          reloads.count += 1
          return Promise.resolve()
        },
      }),
    )
    expect(
      await Effect.runPromise(
        RestartOnNewerCode().effect.pipe(Effect.provide(willing)),
      ),
    ).toEqual(CompletedRestartOnNewerCode())
    expect(reloads.count).toBe(1)
    const unwilling = expoCodeUpdates(
      expoModule({
        reloadAsync: () => Promise.reject(new Error('reload is not allowed')),
      }),
    )
    expect(
      await Effect.runPromise(
        RestartOnNewerCode().effect.pipe(Effect.provide(unwilling)),
      ),
    ).toEqual(FailedRestartOnNewerCode({ reason: 'reload is not allowed' }))
  })
})

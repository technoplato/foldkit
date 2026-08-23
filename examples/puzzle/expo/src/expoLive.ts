import { Layer } from 'effect'
import { Processor } from 'foldkit'
import {
  FoldkitPuzzleV01,
  Instant,
  InstantEngine,
  InstantPuzzleSnapshotLogSchema,
  isMemoryTape,
  memorySyncedEngine,
} from 'puzzle-core-example'
import { Platform } from 'react-native'

import { init } from '@instantdb/react-native'

import './polyfill'

const instanceLength = 8
const nativeDatabaseKey = Symbol.for('foldkit.puzzle.expo.nativeDatabase')
const instanceKey = Symbol.for('foldkit.puzzle.expo.instance')

type NativeDatabase = ReturnType<typeof init>

const nativeDatabaseCache = (): NativeDatabase => {
  const global = globalThis as typeof globalThis & {
    [nativeDatabaseKey]?: NativeDatabase
  }
  const existing = global[nativeDatabaseKey]
  if (existing !== undefined) {
    return existing
  }
  const created = init({
    appId: FoldkitPuzzleV01.id,
    schema: InstantPuzzleSnapshotLogSchema,
  })
  global[nativeDatabaseKey] = created
  return created
}

const expoInstance = (): string => {
  const global = globalThis as typeof globalThis & {
    [instanceKey]?: string
  }
  const existing = global[instanceKey]
  if (existing !== undefined) {
    return existing
  }
  const created = globalThis.crypto.randomUUID().slice(0, instanceLength)
  global[instanceKey] = created
  return created
}

const nativeDatabase = nativeDatabaseCache()

const expoHost = (): Processor.Host.Host => {
  if (Platform.OS === 'ios') {
    return Processor.Host.ExpoIos()
  }
  return Processor.Host.ExpoAndroid()
}

/**
 * Expo Instant Layer. Supplies the react-native database and the
 * Expo iOS or Android Host. App.tsx does not choose either.
 *
 * Fast Refresh must reuse the same Instant client and instance. A
 * second init() stacks native websocket close listeners the same
 * way Vite HMR stacked them in the React browser Host.
 */
export const ExpoLive: Layer.Layer<InstantEngine> = Layer.sync(
  InstantEngine,
  () => {
    const processor = expoHost()
    if (isMemoryTape()) {
      return memorySyncedEngine(processor)
    }
    return Instant({
      app: FoldkitPuzzleV01,
      processor,
      database: nativeDatabase.core,
      instance: expoInstance(),
    })
  },
)

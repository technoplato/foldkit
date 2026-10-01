import {
  type BoundCounter,
  FoldkitCounterV01,
  InstantSnapshotLogSchema,
  bindCounter,
  newProcessorInstance,
  startCounter,
} from 'counter-core-example'
import { Processor } from 'foldkit'
import { Platform } from 'react-native'

import { init } from '@instantdb/react-native'

import './polyfill'

type NativeDatabase = ReturnType<typeof init>

const nativeDatabaseKey = Symbol.for('foldkit.counter.expo.nativeDatabase')
const boundCounterKey = Symbol.for('foldkit.counter.expo.boundCounter')

type ExpoGlobals = typeof globalThis & {
  [nativeDatabaseKey]?: NativeDatabase
  [boundCounterKey]?: BoundCounter
}

const expoGlobals = (): ExpoGlobals => globalThis

// NOTE: Fast Refresh re-runs this module. A second Instant init() stacks
// native websocket listeners, so the database and the running Counter live
// on globalThis and are reused.
const nativeDatabase = (): NativeDatabase => {
  const globals = expoGlobals()
  const existing = globals[nativeDatabaseKey]
  if (existing !== undefined) {
    return existing
  }
  const created = init({
    appId: FoldkitCounterV01.id,
    schema: InstantSnapshotLogSchema,
  })
  globals[nativeDatabaseKey] = created
  return created
}

const expoHost = (): Processor.Host.Host =>
  Platform.OS === 'ios'
    ? Processor.Host.ExpoIos()
    : Processor.Host.ExpoAndroid()

/**
 * Starts the Expo Counter once per JavaScript runtime and binds it to the
 * generic interaction. `EXPO_PUBLIC_COUNTER_TAPE=memory` keeps the count on
 * the device.
 */
export const startExpoCounter = (): BoundCounter => {
  const globals = expoGlobals()
  const existing = globals[boundCounterKey]
  if (existing !== undefined) {
    return existing
  }
  const isMemory = process.env['EXPO_PUBLIC_COUNTER_TAPE'] === 'memory'
  const bound = bindCounter(
    startCounter({
      host: expoHost(),
      instance: newProcessorInstance(),
      ...(isMemory ? { tape: 'Memory' } : { database: nativeDatabase().core }),
    }),
  )
  globals[boundCounterKey] = bound
  return bound
}

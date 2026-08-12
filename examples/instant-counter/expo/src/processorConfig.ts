import * as Crypto from 'expo-crypto'
import { Effect } from 'effect'
import type { InstantCounterDatabase } from 'instant-counter-example/schema'
import {
  type MultipleCountersV3LocalIdentityEnvironment,
  type MultipleCountersV3ProcessorConfig,
  makeMultipleCountersV3ProcessorConfig,
} from 'instant-counter-example/v3-client'

import { makeNativeMultipleCountersV3LocalIdentityStore } from './localIdentity'
import type { NativeDatabase } from './nativeDatabase'

import AsyncStorage from '@react-native-async-storage/async-storage'

/** Native entropy, UUID, and clock sources used only by the host controller. */
export const nativeMultipleCountersV3LocalIdentityEnvironment =
  (): MultipleCountersV3LocalIdentityEnvironment => ({
    now: Date.now,
    randomBytes: () => Crypto.getRandomBytes(32),
    randomUuid: () => Crypto.randomUUID(),
  })

/** Creates one native Processor config from AsyncStorage-held keys and sequences. */
export const makeNativeMultipleCountersV3ProcessorConfig = (
  input: Readonly<{
    database: InstantCounterDatabase
    instantAppId: string
    sessionEpochSeed: string
    subjectId: string
  }>,
): Effect.Effect<MultipleCountersV3ProcessorConfig, unknown> =>
  makeMultipleCountersV3ProcessorConfig({
    database: input.database,
    environment: nativeMultipleCountersV3LocalIdentityEnvironment(),
    instantAppId: input.instantAppId,
    sessionEpochSeed: input.sessionEpochSeed,
    store: makeNativeMultipleCountersV3LocalIdentityStore(AsyncStorage),
    subjectId: input.subjectId,
  })

/** Returns the Instant core database used by the v3 Processor and policy store. */
export const nativeCoreDatabase = (
  database: NativeDatabase,
): InstantCounterDatabase => database.core

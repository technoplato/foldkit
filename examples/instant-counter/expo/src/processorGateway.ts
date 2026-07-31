import { Effect } from 'effect'
import * as Crypto from 'expo-crypto'
import type { Message } from 'instant-counter-example/domain'
import {
  type AttemptedEffectRegistry,
  type Sha256HexDigest,
  allocateClientProcessor,
  observeProcessorSnapshots,
} from 'instant-counter-example/processor-client'

import AsyncStorage from '@react-native-async-storage/async-storage'

import type {
  CounterProcessorGateway,
  CounterProcessorLease,
} from './controller'
import {
  makeActorSequenceRegistry,
  makeClientIdentityRegistry,
} from './localState'
import type { NativeDatabase } from './nativeDatabase'
import {
  makeNativeEffectExecutorLayer,
  makeNativeProcessorDescriptor,
} from './nativeHost'

const processorKind = 'expo-native'

/** Computes the lowercase SHA-256 digest used for stable Program sessions. */
export const nativeSha256HexDigest: Sha256HexDigest = value =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value)

const makeAttemptedEffectRegistry = (): AttemptedEffectRegistry => {
  const attemptedKeys = new Set<string>()
  return {
    claim: idempotencyKey => {
      if (attemptedKeys.has(idempotencyKey)) {
        return false
      } else {
        attemptedKeys.add(idempotencyKey)
        return true
      }
    },
  }
}

const toProcessorLease = (
  allocation: Awaited<ReturnType<typeof allocateClientProcessor>>,
): CounterProcessorLease => ({
  connect: () => Effect.runPromise(allocation.processor.shared.connect),
  disconnect: () => Effect.runPromise(allocation.processor.shared.disconnect),
  observe: listener =>
    observeProcessorSnapshots(allocation.processor, listener),
  propose: (message: Message) =>
    Effect.runPromise(
      allocation.processor.shared.propose(message).pipe(Effect.asVoid),
    ),
  publishUnavailable: () =>
    Effect.runPromise(
      allocation.processor.publishEffectExecutorAvailability(false),
    ),
  readSnapshot: () =>
    Effect.runPromise(allocation.processor.shared.readSnapshot),
  release: allocation.release,
})

/** Builds the cancellable shared Processor gateway for one native database. */
export const makeNativeProcessorGateway = (
  database: NativeDatabase,
): CounterProcessorGateway => {
  const actorSequences = makeActorSequenceRegistry(AsyncStorage)
  const identityRegistry = makeClientIdentityRegistry(
    AsyncStorage,
    Crypto.randomUUID,
  )
  const attemptRegistry = makeAttemptedEffectRegistry()
  return {
    allocate: async (subjectId, signal) => {
      const identity = await Effect.runPromise(identityRegistry.load())
      if (signal.aborted) {
        throw new Error('Native Processor startup was cancelled.')
      }
      const allocation = await allocateClientProcessor(
        {
          actorSequences,
          attemptRegistry,
          database: database.core,
          digest: nativeSha256HexDigest,
          host: {
            isEffectExecutor: false,
            makeDescriptor: makeNativeProcessorDescriptor,
            makeEffectExecutorLayer: makeNativeEffectExecutorLayer,
            processorKind,
          },
          identity,
          subjectId,
        },
        signal,
      )
      return toProcessorLease(allocation)
    },
  }
}

import { Effect, Fiber } from 'effect'
import { Synchronization } from 'foldkit'
import { describe, expect, it, vi } from 'vitest'

import {
  instantV3ProgramProtocolVersion,
  makeInstantV3ProgramSessionLifecyclePositionKey,
} from '@foldkit/instant'

import {
  makeMultipleCountersV3EntityId,
  makeMultipleCountersV3SessionIdentity,
} from '../shared/identity.js'
import {
  MultipleCountersV3PolicyResolutionRecord,
  makeMultipleCountersV3PolicyRequest,
  makeMultipleCountersV3PolicyResolutionPositionKey,
  multipleCountersV3PolicyProgramId,
  multipleCountersV3PolicyProgramVersion,
} from '../shared/policyRequest.js'
import {
  MultipleCountersV3BrowserPolicyResolutionError,
  resolveBrowserMultipleCountersV3PolicyRequestSubscription,
} from './processorConfig.js'

const instantAppId = 'instant-v3-demo-app'
const subjectId = 'authenticated-subject'
const identity = makeMultipleCountersV3SessionIdentity({
  instantAppId,
  sessionEpochSeed: 'browser-policy-resolution',
  subjectId,
})
const request = makeMultipleCountersV3PolicyRequest(
  {
    appSubjectDigest: identity.appSubjectDigest,
    instantAppId,
    programId: multipleCountersV3PolicyProgramId,
    programVersion: multipleCountersV3PolicyProgramVersion,
    protocolVersion: instantV3ProgramProtocolVersion,
    sessionEpochId: identity.sessionEpochId,
    sessionId: identity.sessionId,
    subjectId,
  },
  {
    lifecycleGeneration: 1,
    lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
      identity.sessionId,
      1,
    ),
    lifecycleState: 'Active',
    sessionPolicy: Synchronization.SessionPolicy.make({
      generation: 0,
      mode: Synchronization.SharedDomain.make({}),
    }),
  },
  Synchronization.Mirror.make({}),
  {
    policyRequestId: 'browser-policy-request',
    requestedAtMs: 1_000,
  },
)
const resolutionPositionKey = makeMultipleCountersV3PolicyResolutionPositionKey(
  request.sessionId,
  request.policyRequestId,
)
const resolution = MultipleCountersV3PolicyResolutionRecord.make({
  ...request,
  id: makeMultipleCountersV3EntityId('PolicyResolution', resolutionPositionKey),
  policyResolutionPositionKey: resolutionPositionKey,
  resolvedAtMs: 2_000,
  resolvedLifecycleGeneration: 2,
  resolvedLifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
    request.sessionId,
    2,
  ),
  resolvedPolicyGeneration: 1,
  resolvingProcessorId: 'authority-processor',
  resolutionState: 'Accepted',
})

const responseFor = (rows: ReadonlyArray<unknown>) => ({
  data: { multipleCountersV3PolicyRequestResolutions: rows },
})

describe('browser Multiple Counters v3 policy resolution', () => {
  it('accepts the unique current exact authority row and releases observation', async () => {
    const unsubscribe = vi.fn()
    const observed = await Effect.runPromise(
      resolveBrowserMultipleCountersV3PolicyRequestSubscription(listener => {
        listener(responseFor([]))
        listener(responseFor([resolution]))
        return unsubscribe
      }, request),
    )

    expect(observed).toEqual(resolution)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('waits for a delayed row and unsubscribes after settlement', async () => {
    const observation: {
      listener?: (response: unknown) => void
    } = {}
    const unsubscribe = vi.fn()
    const fiber = Effect.runFork(
      resolveBrowserMultipleCountersV3PolicyRequestSubscription(listener => {
        observation.listener = listener
        return unsubscribe
      }, request),
    )
    await vi.waitFor(() => expect(observation.listener).toBeDefined())

    observation.listener?.(responseFor([resolution]))
    const observed = await Effect.runPromise(Fiber.join(fiber))

    expect(observed).toEqual(resolution)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('turns response and synchronous subscription failures into typed errors', async () => {
    const responseFailure = await Effect.runPromise(
      Effect.flip(
        resolveBrowserMultipleCountersV3PolicyRequestSubscription(listener => {
          listener({ error: new Error('query failed') })
          return vi.fn()
        }, request),
      ),
    )
    const subscriptionFailure = await Effect.runPromise(
      Effect.flip(
        resolveBrowserMultipleCountersV3PolicyRequestSubscription(() => {
          throw new Error('subscribe failed')
        }, request),
      ),
    )

    expect(responseFailure).toBeInstanceOf(
      MultipleCountersV3BrowserPolicyResolutionError,
    )
    expect(subscriptionFailure).toBeInstanceOf(
      MultipleCountersV3BrowserPolicyResolutionError,
    )
  })

  it('rejects duplicate and immutable-request-mismatched rows', async () => {
    const mismatched = MultipleCountersV3PolicyResolutionRecord.make({
      ...resolution,
      requestedAtMs: resolution.requestedAtMs + 1,
    })
    const duplicateFailure = await Effect.runPromise(
      Effect.flip(
        resolveBrowserMultipleCountersV3PolicyRequestSubscription(listener => {
          listener(responseFor([resolution, resolution]))
          return vi.fn()
        }, request),
      ),
    )
    const mismatchFailure = await Effect.runPromise(
      Effect.flip(
        resolveBrowserMultipleCountersV3PolicyRequestSubscription(listener => {
          listener(responseFor([mismatched]))
          return vi.fn()
        }, request),
      ),
    )

    expect(duplicateFailure).toBeInstanceOf(
      MultipleCountersV3BrowserPolicyResolutionError,
    )
    expect(mismatchFailure).toBeInstanceOf(
      MultipleCountersV3BrowserPolicyResolutionError,
    )
  })

  it('unsubscribes when the awaiting Client operation is interrupted', async () => {
    const observation: {
      listener?: (response: unknown) => void
    } = {}
    const unsubscribe = vi.fn()
    const fiber = Effect.runFork(
      resolveBrowserMultipleCountersV3PolicyRequestSubscription(listener => {
        observation.listener = listener
        return unsubscribe
      }, request),
    )
    await vi.waitFor(() => expect(observation.listener).toBeDefined())

    await Effect.runPromise(Fiber.interrupt(fiber))

    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

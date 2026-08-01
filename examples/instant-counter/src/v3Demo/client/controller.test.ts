import { MultipleCountersProgram } from 'counters-core-example'
import { Effect, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ActiveSubjectScopedProgram,
  type SubjectScopedProgramSnapshot,
  V3PendingProjectionAccepted,
  V3PendingProjectionApplied,
  V3PendingProjectionStale,
  type V3SharedProgramProcessorSnapshot,
  V3SharedProgramUpdateError,
} from '@foldkit/instant'

import {
  type MultipleCountersV3ClientSnapshot,
  isMultipleCountersV3ClientSubmissionApplied,
  projectMultipleCountersV3ClientSnapshot,
} from './controller.js'
import type { MultipleCountersV3Processor } from './processor.js'

const [model] = MultipleCountersProgram.init()

const processorSnapshot: V3SharedProgramProcessorSnapshot<typeof model> = {
  acceptedModel: model,
  activeProgramSession: Option.none(),
  activeSessionPolicy: Option.none(),
  connection: { _tag: 'Detached' },
  lastError: Option.none(),
  optimisticModel: model,
  pendingClaims: [],
  recentTerminalClaims: [],
  throughAcceptedSequence: 0,
  waitingForAcceptedSequence: Option.none(),
}

const processor: MultipleCountersV3Processor = {
  identity: {
    clientId: 'client-id',
    originDeviceId: 'device-id',
    processorId: 'processor-id',
  },
  processor: {
    connect: Effect.void,
    disconnect: Effect.void,
    readSnapshot: Effect.succeed(processorSnapshot),
    retryPending: () => Effect.die('unused'),
    snapshots: Stream.empty,
    submitAction: () => Effect.die('unused'),
    submitClaim: () => Effect.die('unused'),
  },
  scope: {
    appSubjectDigest: 'digest',
    instantAppId: 'instant-app',
    programId: 'multiple-counters',
    programVersion: 2,
    protocolVersion: 3,
    sessionEpochId: 'session-epoch',
    sessionId: 'session-id',
    subjectId: 'subject-a',
  },
}

const snapshot = (
  nextProcessorSnapshot: V3SharedProgramProcessorSnapshot<
    typeof model
  > = processorSnapshot,
): MultipleCountersV3ClientSnapshot =>
  projectMultipleCountersV3ClientSnapshot({
    lifecycle: ActiveSubjectScopedProgram.make({
      generation: 1,
      subjectId: 'subject-a',
    }),
    maybeActiveProgram: Option.some({
      generation: 1,
      maybeProgramSnapshot: Option.some(nextProcessorSnapshot),
      program: processor,
      subjectId: 'subject-a',
    }),
  } satisfies SubjectScopedProgramSnapshot<
    MultipleCountersV3Processor,
    V3SharedProgramProcessorSnapshot<typeof model>
  >)

describe('Multiple Counters v3 Client snapshot', () => {
  it('uses the stable submission projection without reading a later snapshot', () => {
    expect(
      isMultipleCountersV3ClientSubmissionApplied({
        projection: V3PendingProjectionApplied.make({}),
      }),
    ).toBe(true)
    expect(
      isMultipleCountersV3ClientSubmissionApplied({
        projection: V3PendingProjectionAccepted.make({}),
      }),
    ).toBe(true)
    expect(
      isMultipleCountersV3ClientSubmissionApplied({
        projection: V3PendingProjectionStale.make({
          failureTag: 'StaleInteractionReference',
        }),
      }),
    ).toBe(false)
  })

  it('projects only credential-free state without a Processor mutation handle', () => {
    const projected = snapshot()
    expect(Option.isSome(projected.maybeActiveProgram)).toBe(true)
    if (Option.isSome(projected.maybeActiveProgram)) {
      expect(Object.keys(projected.maybeActiveProgram.value).sort()).toEqual([
        'generation',
        'processorId',
        'processorSnapshot',
        'subjectId',
      ])
    }
    expect(JSON.stringify(projected)).not.toContain('processorSecretKey')
    expect(JSON.stringify(projected)).not.toContain('submitAction')
  })

  it('removes untyped Processor error causes at the public Client boundary', () => {
    const projected = snapshot({
      ...processorSnapshot,
      lastError: Option.some(
        new V3SharedProgramUpdateError({
          cause: { processorSecretKey: 'must-not-escape' },
          occurrenceId: 'occurrence-1',
          stage: 'Optimistic',
        }),
      ),
    })

    expect(JSON.stringify(projected)).not.toContain('must-not-escape')
    if (Option.isSome(projected.maybeActiveProgram)) {
      expect(
        projected.maybeActiveProgram.value.processorSnapshot.lastError,
      ).toEqual(Option.some({ _tag: 'V3SharedProgramUpdateError' }))
    }
  })
})

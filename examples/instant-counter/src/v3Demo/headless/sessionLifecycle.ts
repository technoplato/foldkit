import { Data, Effect } from 'effect'
import { Synchronization } from 'foldkit'

import {
  type InstantV3EntityId,
  InstantV3ProgramSessionRecord,
  type InstantV3TimestampMs,
  makeInstantV3ProgramSessionLifecyclePositionKey,
} from '@foldkit/instant'

/** A Program session cannot change synchronization mode after revocation. */
export class MultipleCountersV3SessionTransitionError extends Data.TaggedError(
  'MultipleCountersV3SessionTransitionError',
)<{
  readonly cause: unknown
  readonly reason: 'InvalidMode' | 'RevokedSession'
  readonly sessionId: string
}> {}

/** Host-owned immutable values for the next Program-session generation. */
export type MultipleCountersV3SessionTransitionInput = Readonly<{
  createdAtMs: InstantV3TimestampMs
  id: InstantV3EntityId
}>

const transitionSessionMode = (
  current: InstantV3ProgramSessionRecord,
  mode: Synchronization.Mode,
  input: MultipleCountersV3SessionTransitionInput,
): Effect.Effect<
  InstantV3ProgramSessionRecord,
  MultipleCountersV3SessionTransitionError
> => {
  if (current.lifecycleState === 'Revoked') {
    return Effect.fail(
      new MultipleCountersV3SessionTransitionError({
        cause: new Error('A revoked Program session is permanently terminal.'),
        reason: 'RevokedSession',
        sessionId: current.sessionId,
      }),
    )
  }
  return Effect.try({
    try: () => {
      const nextLifecycleGeneration = current.lifecycleGeneration + 1
      return InstantV3ProgramSessionRecord.make({
        ...current,
        createdAtMs: input.createdAtMs,
        id: input.id,
        lifecycleGeneration: nextLifecycleGeneration,
        lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
          current.sessionId,
          nextLifecycleGeneration,
        ),
        previousLifecyclePositionKey: current.lifecyclePositionKey,
        sessionPolicy: Synchronization.SessionPolicy.make({
          generation: current.sessionPolicy.generation + 1,
          mode,
        }),
      })
    },
    catch: cause =>
      new MultipleCountersV3SessionTransitionError({
        cause,
        reason: 'InvalidMode',
        sessionId: current.sessionId,
      }),
  })
}

/** Appends a typed transition to fully mirrored domain and navigation state. */
export const transitionMultipleCountersV3ToMirror = (
  current: InstantV3ProgramSessionRecord,
  input: MultipleCountersV3SessionTransitionInput,
) => transitionSessionMode(current, Synchronization.Mirror.make({}), input)

/** Appends a typed transition to shared domain with independent navigation. */
export const transitionMultipleCountersV3ToSharedDomain = (
  current: InstantV3ProgramSessionRecord,
  input: MultipleCountersV3SessionTransitionInput,
) =>
  transitionSessionMode(current, Synchronization.SharedDomain.make({}), input)

/** Appends a typed transition to one leader with ordered follower controls. */
export const transitionMultipleCountersV3ToFollow = (
  current: InstantV3ProgramSessionRecord,
  follow: Readonly<{
    followers: ReadonlyArray<Synchronization.Follower>
    leaderProcessorId: string
  }>,
  input: MultipleCountersV3SessionTransitionInput,
) =>
  Effect.try({
    try: () =>
      Synchronization.Follow.make({
        followers: follow.followers,
        leaderProcessorId: follow.leaderProcessorId,
      }),
    catch: cause =>
      new MultipleCountersV3SessionTransitionError({
        cause,
        reason: 'InvalidMode',
        sessionId: current.sessionId,
      }),
  }).pipe(Effect.flatMap(mode => transitionSessionMode(current, mode, input)))

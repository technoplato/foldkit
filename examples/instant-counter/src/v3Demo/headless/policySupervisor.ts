import {
  Array,
  Data,
  Effect,
  Match as M,
  Option,
  Order,
  Schema as S,
  Stream,
} from 'effect'

import {
  type InstantV3ProgramSessionRecord,
  InstantV3TimestampMs,
  type V3ProgramAuthorityStoreService,
  type V3ProgramStoreScope,
  makeInstantV3ProgramSessionLifecyclePositionKey,
} from '@foldkit/instant'

import { makeMultipleCountersV3EntityId } from '../shared/identity.js'
import {
  type MultipleCountersV3PolicyRequestRecord,
  MultipleCountersV3PolicyResolutionRecord,
  type MultipleCountersV3PolicyResolutionRecord as MultipleCountersV3PolicyResolutionRecordType,
  makeMultipleCountersV3PolicyResolutionPositionKey,
} from '../shared/policyRequest.js'
import type { MultipleCountersV3HeadlessDatabase } from './adminDatabase.js'
import {
  transitionMultipleCountersV3ToFollow,
  transitionMultipleCountersV3ToMirror,
  transitionMultipleCountersV3ToSharedDomain,
} from './sessionLifecycle.js'

/** A policy request could not be safely planned or persisted by the authority. */
export class MultipleCountersV3PolicySupervisorError extends Data.TaggedError(
  'MultipleCountersV3PolicySupervisorError',
)<
  Readonly<{
    cause: unknown
    policyRequestId: string
    stage: 'ExistingResolution' | 'History' | 'Persist' | 'Plan' | 'Snapshot'
  }>
> {}

/** The terminal or deferred result of processing one policy request. */
export const MultipleCountersV3PolicyRequestDisposition = S.Literals([
  'Accepted',
  'AwaitingPredecessor',
  'AwaitingSession',
  'Existing',
  'Rejected',
])
/** The terminal or deferred result of processing one policy request. */
export type MultipleCountersV3PolicyRequestDisposition =
  typeof MultipleCountersV3PolicyRequestDisposition.Type

/** One planned session transition and its exact policy audit row. */
export type MultipleCountersV3PolicyRequestPlan = Readonly<{
  disposition: 'Accepted' | 'Rejected'
  resolution: MultipleCountersV3PolicyResolutionRecordType
  session: InstantV3ProgramSessionRecord | null
}>

/** Host-owned authority identity and clock for policy decisions. */
export type MultipleCountersV3PolicySupervisorConfig = Readonly<{
  authorityProcessorId: string
  now: () => number
  onDefect?: (
    error: MultipleCountersV3PolicySupervisorError,
    request: MultipleCountersV3PolicyRequestRecord,
  ) => void
}>

const scopeForRequest = (
  request: MultipleCountersV3PolicyRequestRecord,
): V3ProgramStoreScope => ({
  appSubjectDigest: request.appSubjectDigest,
  instantAppId: request.instantAppId,
  programId: request.programId,
  programVersion: request.programVersion,
  protocolVersion: request.protocolVersion,
  sessionEpochId: request.sessionEpochId,
  sessionId: request.sessionId,
  subjectId: request.subjectId,
})

const currentSession = (
  sessions: ReadonlyArray<InstantV3ProgramSessionRecord>,
  request: MultipleCountersV3PolicyRequestRecord,
): Effect.Effect<
  Option.Option<InstantV3ProgramSessionRecord>,
  MultipleCountersV3PolicySupervisorError
> => {
  const candidates = Array.filter(
    sessions,
    session =>
      session.sessionId === request.sessionId &&
      session.subjectId === request.subjectId &&
      session.programId === request.programId &&
      session.programVersion === request.programVersion,
  )
  const generations = new Set(
    Array.map(candidates, session => session.lifecycleGeneration),
  )
  if (generations.size !== candidates.length) {
    return Effect.fail(
      new MultipleCountersV3PolicySupervisorError({
        cause: new Error(
          'Program-session history contains a duplicate generation.',
        ),
        policyRequestId: request.policyRequestId,
        stage: 'History',
      }),
    )
  }
  return Effect.succeed(
    Array.head(
      Array.sort(
        candidates,
        Order.mapInput(
          Order.flip(Order.Number),
          (session: InstantV3ProgramSessionRecord) =>
            session.lifecycleGeneration,
        ),
      ),
    ),
  )
}

const authorityTimestamp = (
  request: MultipleCountersV3PolicyRequestRecord,
  config: MultipleCountersV3PolicySupervisorConfig,
): Effect.Effect<
  InstantV3TimestampMs,
  MultipleCountersV3PolicySupervisorError
> =>
  Effect.try({
    try: () =>
      InstantV3TimestampMs.make(Math.max(config.now(), request.requestedAtMs)),
    catch: cause =>
      new MultipleCountersV3PolicySupervisorError({
        cause,
        policyRequestId: request.policyRequestId,
        stage: 'Plan',
      }),
  })

const resolutionFields = (
  request: MultipleCountersV3PolicyRequestRecord,
  current: InstantV3ProgramSessionRecord,
  resolvedAtMs: InstantV3TimestampMs,
  config: MultipleCountersV3PolicySupervisorConfig,
) => {
  const policyResolutionPositionKey =
    makeMultipleCountersV3PolicyResolutionPositionKey(
      request.sessionId,
      request.policyRequestId,
    )
  return {
    ...request,
    id: makeMultipleCountersV3EntityId(
      'PolicyResolution',
      policyResolutionPositionKey,
    ),
    policyResolutionPositionKey,
    resolvedAtMs,
    resolvingProcessorId: config.authorityProcessorId,
    resolvedLifecycleGeneration: current.lifecycleGeneration,
    resolvedLifecyclePositionKey: current.lifecyclePositionKey,
    resolvedPolicyGeneration: current.sessionPolicy.generation,
  }
}

const rejectedPlan = (
  request: MultipleCountersV3PolicyRequestRecord,
  current: InstantV3ProgramSessionRecord,
  reason: string,
  resolvedAtMs: InstantV3TimestampMs,
  config: MultipleCountersV3PolicySupervisorConfig,
): MultipleCountersV3PolicyRequestPlan => ({
  disposition: 'Rejected',
  resolution: MultipleCountersV3PolicyResolutionRecord.make({
    ...resolutionFields(request, current, resolvedAtMs, config),
    rejectionReason: reason,
    resolutionState: 'Rejected',
  }),
  session: null,
})

const transitionForRequest = (
  request: MultipleCountersV3PolicyRequestRecord,
  current: InstantV3ProgramSessionRecord,
  resolvedAtMs: InstantV3TimestampMs,
) => {
  const nextLifecyclePositionKey =
    makeInstantV3ProgramSessionLifecyclePositionKey(
      request.sessionId,
      current.lifecycleGeneration + 1,
    )
  const input = {
    createdAtMs: resolvedAtMs,
    id: makeMultipleCountersV3EntityId(
      'ProgramSession',
      nextLifecyclePositionKey,
    ),
  }
  return M.value(request.requestedMode).pipe(
    M.tagsExhaustive({
      Follow: ({ followers, leaderProcessorId }) =>
        transitionMultipleCountersV3ToFollow(
          current,
          { followers, leaderProcessorId },
          input,
        ),
      Mirror: () => transitionMultipleCountersV3ToMirror(current, input),
      SharedDomain: () =>
        transitionMultipleCountersV3ToSharedDomain(current, input),
    }),
  )
}

/** Plans one terminal policy result against one server-confirmed current session. */
export const planMultipleCountersV3PolicyRequest = (
  request: MultipleCountersV3PolicyRequestRecord,
  current: InstantV3ProgramSessionRecord,
  config: MultipleCountersV3PolicySupervisorConfig,
): Effect.Effect<
  MultipleCountersV3PolicyRequestPlan,
  MultipleCountersV3PolicySupervisorError
> =>
  Effect.gen(function* () {
    const resolvedAtMs = yield* authorityTimestamp(request, config)
    if (current.lifecycleState === 'Revoked') {
      return rejectedPlan(
        request,
        current,
        'The Program session is revoked.',
        resolvedAtMs,
        config,
      )
    }
    if (
      request.expectedLifecycleGeneration !== current.lifecycleGeneration ||
      request.expectedPolicyGeneration !== current.sessionPolicy.generation
    ) {
      return rejectedPlan(
        request,
        current,
        'The expected session or policy generation is stale.',
        resolvedAtMs,
        config,
      )
    }
    const nextSession = yield* transitionForRequest(
      request,
      current,
      resolvedAtMs,
    ).pipe(
      Effect.mapError(
        cause =>
          new MultipleCountersV3PolicySupervisorError({
            cause,
            policyRequestId: request.policyRequestId,
            stage: 'Plan',
          }),
      ),
    )
    return {
      disposition: 'Accepted',
      resolution: MultipleCountersV3PolicyResolutionRecord.make({
        ...resolutionFields(request, nextSession, resolvedAtMs, config),
        resolutionState: 'Accepted',
      }),
      session: nextSession,
    }
  })

const existingResolutionMatchesRequest = (
  resolution: MultipleCountersV3PolicyResolutionRecordType,
  request: MultipleCountersV3PolicyRequestRecord,
): boolean =>
  resolution.policyRequestPositionKey === request.policyRequestPositionKey &&
  resolution.requestedAtMs === request.requestedAtMs &&
  resolution.requesterId === request.requesterId &&
  resolution.sessionId === request.sessionId &&
  resolution.subjectId === request.subjectId

/** Processes one request inside the same exclusive authority coordinator as admission. */
export const processMultipleCountersV3PolicyRequest = (
  database: MultipleCountersV3HeadlessDatabase,
  store: V3ProgramAuthorityStoreService,
  request: MultipleCountersV3PolicyRequestRecord,
  config: MultipleCountersV3PolicySupervisorConfig,
): Effect.Effect<
  MultipleCountersV3PolicyRequestDisposition,
  MultipleCountersV3PolicySupervisorError
> =>
  store.coordinator.withCriticalSection(section =>
    Effect.gen(function* () {
      const policyResolutionPositionKey =
        makeMultipleCountersV3PolicyResolutionPositionKey(
          request.sessionId,
          request.policyRequestId,
        )
      const maybeExisting = yield* Effect.tryPromise({
        try: () => database.queryPolicyResolution(policyResolutionPositionKey),
        catch: cause =>
          new MultipleCountersV3PolicySupervisorError({
            cause,
            policyRequestId: request.policyRequestId,
            stage: 'ExistingResolution',
          }),
      })
      if (Option.isSome(maybeExisting)) {
        if (existingResolutionMatchesRequest(maybeExisting.value, request)) {
          return 'Existing'
        }
        return yield* new MultipleCountersV3PolicySupervisorError({
          cause: new Error(
            'The terminal policy identity belongs to a different request.',
          ),
          policyRequestId: request.policyRequestId,
          stage: 'ExistingResolution',
        })
      }
      const snapshot = yield* section
        .readServerConfirmedSnapshot(scopeForRequest(request))
        .pipe(
          Effect.mapError(
            cause =>
              new MultipleCountersV3PolicySupervisorError({
                cause,
                policyRequestId: request.policyRequestId,
                stage: 'Snapshot',
              }),
          ),
        )
      const maybeCurrent = yield* currentSession(
        snapshot.programSessions,
        request,
      )
      if (Option.isNone(maybeCurrent)) {
        return 'AwaitingSession'
      }
      const current = maybeCurrent.value
      if (
        request.expectedLifecycleGeneration > current.lifecycleGeneration ||
        (request.expectedLifecycleGeneration === current.lifecycleGeneration &&
          request.expectedPolicyGeneration > current.sessionPolicy.generation)
      ) {
        return 'AwaitingPredecessor'
      }
      const plan = yield* planMultipleCountersV3PolicyRequest(
        request,
        current,
        config,
      )
      yield* Effect.tryPromise({
        try: () =>
          database.appendPolicyTransition(plan.session, plan.resolution),
        catch: cause =>
          new MultipleCountersV3PolicySupervisorError({
            cause,
            policyRequestId: request.policyRequestId,
            stage: 'Persist',
          }),
      })
      return plan.disposition
    }),
  )

/** Reprocesses requests whenever either request intake or session history changes. */
export const runMultipleCountersV3PolicySupervisor = (
  database: MultipleCountersV3HeadlessDatabase,
  store: V3ProgramAuthorityStoreService,
  config: MultipleCountersV3PolicySupervisorConfig,
): Effect.Effect<never, unknown> =>
  Stream.runForEach(
    Stream.zipLatest(database.policyRequests, database.programSessions),
    ([requests]) =>
      Effect.forEach(
        requests,
        request =>
          processMultipleCountersV3PolicyRequest(
            database,
            store,
            request,
            config,
          ).pipe(
            Effect.catch(error =>
              Effect.sync(() => config.onDefect?.(error, request)),
            ),
          ),
        { concurrency: 1, discard: true },
      ),
  ).pipe(Effect.flatMap(() => Effect.never))

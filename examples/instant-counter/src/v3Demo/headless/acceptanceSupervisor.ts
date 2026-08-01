import {
  MultipleCountersMessageAdmission,
  MultipleCountersProgram,
} from 'counters-core-example'
import {
  Array,
  Cause,
  Duration,
  Effect,
  Fiber,
  Function,
  Option,
  Order,
  Schema as S,
  Scope,
  Stream,
} from 'effect'
import { Synchronization } from 'foldkit'

import {
  type InstantV3EntityId,
  type InstantV3ProgramSessionRecord,
  type InstantV3TimestampMs,
  type V3AcceptanceAuthorityError,
  type V3ProgramAuthorityStoreService,
  V3ProgramStoreError,
  type V3ProgramStoreScope,
  instantV3ProgramProtocolVersion,
  makeV3AcceptanceAuthority,
} from '@foldkit/instant'

import {
  makeMultipleCountersV3AppSubjectDigest,
  makeMultipleCountersV3SessionIdentity,
} from '../shared/identity.js'
import type { MultipleCountersV3HeadlessDatabase } from './adminDatabase.js'
import { MultipleCountersV3MessageProtocol } from './messageProtocol.js'

const restartDelay = Duration.seconds(1)
const sessionPolicyEquivalence = S.toEquivalence(Synchronization.SessionPolicy)

/** Host-owned values and diagnostics for all supervised v3 Program sessions. */
export type MultipleCountersV3AcceptanceSupervisorConfig = Readonly<{
  authorityProcessorId: string
  makeEntityId: () => InstantV3EntityId
  now: () => InstantV3TimestampMs
  onSessionDefect?: (
    cause: Cause.Cause<V3AcceptanceAuthorityError>,
    session: InstantV3ProgramSessionRecord,
  ) => void
  sessionEpochSeed: string
}>

/** One scoped authority worker fenced by an immutable session generation. */
export type RunningMultipleCountersV3AcceptanceAuthority = Readonly<{
  fiber: Fiber.Fiber<never, never>
  session: InstantV3ProgramSessionRecord
}>

const isCanonicalMultipleCountersSession = (
  session: InstantV3ProgramSessionRecord,
  config: MultipleCountersV3AcceptanceSupervisorConfig,
): boolean => {
  const identity = makeMultipleCountersV3SessionIdentity({
    instantAppId: session.instantAppId,
    sessionEpochSeed: config.sessionEpochSeed,
    subjectId: session.subjectId,
  })
  return (
    session.appSubjectDigest ===
      makeMultipleCountersV3AppSubjectDigest(
        session.instantAppId,
        session.subjectId,
      ) &&
    session.appSubjectDigest === identity.appSubjectDigest &&
    session.authorityProcessorId === config.authorityProcessorId &&
    session.processorRoomId === identity.processorRoomId &&
    session.programId === MultipleCountersProgram.id &&
    session.programVersion === MultipleCountersProgram.version &&
    session.protocolVersion === instantV3ProgramProtocolVersion &&
    session.sessionEpochId === identity.sessionEpochId &&
    session.sessionId === identity.sessionId
  )
}

const hasDuplicateGeneration = (
  sessions: ReadonlyArray<InstantV3ProgramSessionRecord>,
): boolean => {
  const generations = new Set<number>()
  for (const session of sessions) {
    if (generations.has(session.lifecycleGeneration)) {
      return true
    }
    generations.add(session.lifecycleGeneration)
  }
  return false
}

const isContiguousLifecycleChain = (
  sessions: ReadonlyArray<InstantV3ProgramSessionRecord>,
): boolean => {
  const ordered = Array.sort(
    sessions,
    Order.mapInput(
      Order.Number,
      (session: InstantV3ProgramSessionRecord) => session.lifecycleGeneration,
    ),
  )
  const maybeFirst = Array.head(ordered)
  if (
    Option.isNone(maybeFirst) ||
    maybeFirst.value.lifecycleGeneration !== 1 ||
    maybeFirst.value.lifecycleState !== 'Active' ||
    maybeFirst.value.sessionPolicy.generation !== 1 ||
    maybeFirst.value.sessionPolicy.mode._tag !== 'Mirror'
  ) {
    return false
  }
  return Array.every(
    Array.zip(ordered, Array.drop(ordered, 1)),
    ([previous, current]) => {
      const isContiguous =
        current.lifecycleGeneration === previous.lifecycleGeneration + 1 &&
        current.previousLifecyclePositionKey ===
          previous.lifecyclePositionKey &&
        current.createdAtMs >= previous.createdAtMs &&
        previous.lifecycleState === 'Active'
      if (!isContiguous) {
        return false
      }
      if (current.lifecycleState === 'Revoked') {
        return sessionPolicyEquivalence(
          current.sessionPolicy,
          previous.sessionPolicy,
        )
      } else {
        return (
          current.sessionPolicy.generation ===
          previous.sessionPolicy.generation + 1
        )
      }
    },
  )
}

/** Selects one unambiguous current active generation per canonical session. */
export const selectActiveMultipleCountersV3Sessions = (
  sessions: ReadonlyArray<InstantV3ProgramSessionRecord>,
  config: MultipleCountersV3AcceptanceSupervisorConfig,
): ReadonlyArray<InstantV3ProgramSessionRecord> => {
  const grouped = new Map<string, Array<InstantV3ProgramSessionRecord>>()
  for (const session of sessions) {
    if (isCanonicalMultipleCountersSession(session, config)) {
      const group = grouped.get(session.sessionId)
      if (group === undefined) {
        grouped.set(session.sessionId, [session])
      } else {
        group.push(session)
      }
    }
  }
  return Array.sort(
    Array.getSomes(
      Array.map(Array.fromIterable(grouped.values()), group => {
        if (
          hasDuplicateGeneration(group) ||
          !isContiguousLifecycleChain(group)
        ) {
          return Option.none<InstantV3ProgramSessionRecord>()
        }
        return Option.filter(
          Array.last(
            Array.sort(
              group,
              Order.mapInput(
                Order.Number,
                (session: InstantV3ProgramSessionRecord) =>
                  session.lifecycleGeneration,
              ),
            ),
          ),
          session => session.lifecycleState === 'Active',
        )
      }),
    ),
    Order.mapInput(
      Order.String,
      (session: InstantV3ProgramSessionRecord) => session.sessionId,
    ),
  )
}

const scopeForSession = (
  session: InstantV3ProgramSessionRecord,
): V3ProgramStoreScope => ({
  appSubjectDigest: session.appSubjectDigest,
  instantAppId: session.instantAppId,
  programId: session.programId,
  programVersion: session.programVersion,
  protocolVersion: session.protocolVersion,
  sessionEpochId: session.sessionEpochId,
  sessionId: session.sessionId,
  subjectId: session.subjectId,
})

const authoritySignals = (
  store: V3ProgramAuthorityStoreService,
  scope: V3ProgramStoreScope,
): Stream.Stream<void, V3ProgramStoreError> =>
  Stream.mergeAll(
    [
      Stream.map(
        store.serverConfirmed.observeAcceptedMessageOccurrences(scope),
        Function.constVoid,
      ),
      Stream.map(
        store.serverConfirmed.observeEffectPlacements(scope),
        Function.constVoid,
      ),
      Stream.map(
        store.serverConfirmed.observeEffectRequests(scope),
        Function.constVoid,
      ),
      Stream.map(
        store.serverConfirmed.observeMessageProposals(scope),
        Function.constVoid,
      ),
      Stream.map(
        store.serverConfirmed.observeMessageProposalResolutions(scope),
        Function.constVoid,
      ),
      Stream.map(
        store.serverConfirmed.observeOriginPolicyDecisions({
          instantAppId: scope.instantAppId,
          protocolVersion: scope.protocolVersion,
          subjectId: scope.subjectId,
        }),
        Function.constVoid,
      ),
      Stream.map(
        store.serverConfirmed.observeProgramSessions(scope),
        Function.constVoid,
      ),
    ],
    { concurrency: 'unbounded' },
  )

/** Binds the Multiple Counters admission and wire contracts to one trusted session. */
export const makeMultipleCountersV3AcceptanceAuthority = (
  session: InstantV3ProgramSessionRecord,
  store: V3ProgramAuthorityStoreService,
  config: MultipleCountersV3AcceptanceSupervisorConfig,
) =>
  makeV3AcceptanceAuthority({
    acceptingProcessorId: config.authorityProcessorId,
    admission: MultipleCountersMessageAdmission,
    makeEntityId: config.makeEntityId,
    now: config.now,
    scope: scopeForSession(session),
    store,
    wire: MultipleCountersV3MessageProtocol,
  })

const runSessionAcceptanceAuthority = (
  session: InstantV3ProgramSessionRecord,
  store: V3ProgramAuthorityStoreService,
  config: MultipleCountersV3AcceptanceSupervisorConfig,
): Effect.Effect<never, V3AcceptanceAuthorityError> =>
  Effect.gen(function* () {
    const scope = scopeForSession(session)
    const authority = yield* makeMultipleCountersV3AcceptanceAuthority(
      session,
      store,
      config,
    )
    yield* authority.processAvailable
    return yield* Stream.runForEach(authoritySignals(store, scope), () =>
      authority.processAvailable.pipe(Effect.asVoid),
    ).pipe(Effect.flatMap(() => Effect.never))
  })

const resilientSessionAcceptanceAuthority = (
  session: InstantV3ProgramSessionRecord,
  store: V3ProgramAuthorityStoreService,
  config: MultipleCountersV3AcceptanceSupervisorConfig,
): Effect.Effect<never> =>
  Effect.forever(
    runSessionAcceptanceAuthority(session, store, config).pipe(
      Effect.catchCause(cause => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.interrupt
        }
        return Effect.andThen(
          Effect.sync(() => {
            config.onSessionDefect?.(cause, session)
          }),
          Effect.sleep(restartDelay),
        )
      }),
    ),
  )

/** Replaces a stale per-session authority only after its old Scope is interrupted. */
export const replaceMultipleCountersV3AcceptanceAuthority = <R>(
  running: RunningMultipleCountersV3AcceptanceAuthority | undefined,
  session: InstantV3ProgramSessionRecord,
  start: (
    session: InstantV3ProgramSessionRecord,
  ) => Effect.Effect<Fiber.Fiber<never, never>, never, R>,
): Effect.Effect<RunningMultipleCountersV3AcceptanceAuthority, never, R> =>
  Effect.gen(function* () {
    if (
      running !== undefined &&
      running.session.lifecyclePositionKey === session.lifecyclePositionKey
    ) {
      return running
    }
    if (running !== undefined) {
      yield* Fiber.interrupt(running.fiber)
    }
    const fiber = yield* start(session)
    return { fiber, session }
  })

/** Supervises one acceptance authority for every current active v3 session. */
export const runMultipleCountersV3AcceptanceSupervisor = (
  database: MultipleCountersV3HeadlessDatabase,
  store: V3ProgramAuthorityStoreService,
  config: MultipleCountersV3AcceptanceSupervisorConfig,
): Effect.Effect<never, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    const runningSessions = new Map<
      string,
      RunningMultipleCountersV3AcceptanceAuthority
    >()
    return yield* Stream.runForEach(database.programSessions, sessions => {
      const activeSessions = selectActiveMultipleCountersV3Sessions(
        sessions,
        config,
      )
      const activeSessionIds = new Set(
        Array.map(activeSessions, session => session.sessionId),
      )
      return Effect.gen(function* () {
        for (const [sessionId, running] of runningSessions) {
          if (!activeSessionIds.has(sessionId)) {
            yield* Fiber.interrupt(running.fiber)
            runningSessions.delete(sessionId)
          }
        }
        yield* Effect.forEach(
          activeSessions,
          session =>
            Effect.gen(function* () {
              const running = runningSessions.get(session.sessionId)
              const nextRunning =
                yield* replaceMultipleCountersV3AcceptanceAuthority(
                  running,
                  session,
                  nextSession =>
                    Effect.forkIn(
                      resilientSessionAcceptanceAuthority(
                        nextSession,
                        store,
                        config,
                      ),
                      scope,
                    ),
                )
              runningSessions.set(session.sessionId, nextRunning)
            }),
          { concurrency: 1, discard: true },
        )
      })
    }).pipe(Effect.flatMap(() => Effect.never))
  })

import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Match as M,
  Option,
  Schema as S,
  Scope,
  Semaphore,
  Stream,
  SubscriptionRef,
  Tuple,
} from 'effect'

import {
  InstantProgramSessionRecord,
  type InstantProgramSessionRecord as InstantProgramSessionRecordType,
} from '../schema/index.js'

const SessionScopedProgramGeneration = S.Int.check(S.isGreaterThanOrEqualTo(0))

/** The authenticated transport cannot currently establish session availability. */
export const TransportUnavailable = S.TaggedStruct('TransportUnavailable', {})

/** The authenticated transport established that no Program session exists. */
export const AuthenticatedMissing = S.TaggedStruct('AuthenticatedMissing', {})

/** The authenticated transport observed one candidate Program session. */
export const AuthenticatedSession = S.TaggedStruct('AuthenticatedSession', {
  session: InstantProgramSessionRecord,
})

/** Every observation produced by an authenticated Program-session transport. */
export const ProgramSessionObservation = S.Union([
  TransportUnavailable,
  AuthenticatedMissing,
  AuthenticatedSession,
])

/** Every observation produced by an authenticated Program-session transport. */
export type ProgramSessionObservation = typeof ProgramSessionObservation.Type

/** No authenticated subject currently owns a Program-session observer. */
export const InactiveSessionScopedProgram = S.TaggedStruct(
  'InactiveSessionScopedProgram',
  {},
)

/** One authenticated subject is being observed without an active Program allocation. */
export const ObservingSessionScopedProgram = S.TaggedStruct(
  'ObservingSessionScopedProgram',
  {
    allocationGeneration: SessionScopedProgramGeneration,
    subjectGeneration: SessionScopedProgramGeneration,
    subjectId: S.NonEmptyString,
  },
)

/** A validated Program session is allocating its Program resources. */
export const AllocatingSessionScopedProgram = S.TaggedStruct(
  'AllocatingSessionScopedProgram',
  {
    allocationGeneration: SessionScopedProgramGeneration,
    session: InstantProgramSessionRecord,
    subjectGeneration: SessionScopedProgramGeneration,
    subjectId: S.NonEmptyString,
  },
)

/** A validated Program session owns an active Program allocation. */
export const ActiveSessionScopedProgram = S.TaggedStruct(
  'ActiveSessionScopedProgram',
  {
    allocationGeneration: SessionScopedProgramGeneration,
    session: InstantProgramSessionRecord,
    subjectGeneration: SessionScopedProgramGeneration,
    subjectId: S.NonEmptyString,
  },
)

/** A current observer, validator, or Program allocation failed closed. */
export const FailedSessionScopedProgram = S.TaggedStruct(
  'FailedSessionScopedProgram',
  {
    allocationGeneration: SessionScopedProgramGeneration,
    failure: S.Literals([
      'ObserveSession',
      'ValidateSession',
      'AllocateProgram',
    ]),
    subjectGeneration: SessionScopedProgramGeneration,
    subjectId: S.NonEmptyString,
  },
)

/** Every credential-free phase of an authenticated Program-session lifecycle. */
export const SessionScopedProgramLifecycle = S.Union([
  InactiveSessionScopedProgram,
  ObservingSessionScopedProgram,
  AllocatingSessionScopedProgram,
  ActiveSessionScopedProgram,
  FailedSessionScopedProgram,
])

/** Every credential-free phase of an authenticated Program-session lifecycle. */
export type SessionScopedProgramLifecycle =
  typeof SessionScopedProgramLifecycle.Type

/** One active Program allocation and its latest optional renderer snapshot. */
export type SessionScopedProgramActive<Program, ProgramSnapshot> = Readonly<{
  allocationGeneration: number
  maybeProgramSnapshot: Option.Option<ProgramSnapshot>
  program: Program
  session: InstantProgramSessionRecordType
  subjectGeneration: number
  subjectId: string
}>

/** The atomic public state of one authenticated Program-session lifecycle. */
export type SessionScopedProgramSnapshot<Program, ProgramSnapshot> = Readonly<{
  lifecycle: SessionScopedProgramLifecycle
  maybeActiveProgram: Option.Option<
    SessionScopedProgramActive<Program, ProgramSnapshot>
  >
}>

/** The generation-fenced context supplied while allocating a Program session. */
export type SessionScopedProgramAllocationContext<ProgramSnapshot> = Readonly<{
  allocationGeneration: number
  publishProgramSnapshot: (
    programSnapshot: ProgramSnapshot,
  ) => Effect.Effect<void>
  session: InstantProgramSessionRecordType
  subjectGeneration: number
  subjectId: string
}>

/** Host boundaries required to observe, validate, and allocate Program sessions. */
export type SessionScopedProgramConfig<
  Program,
  ProgramSnapshot,
  ObserveError = never,
  ObserveRequirements = never,
  ValidationError = never,
  ValidationRequirements = never,
  AllocationError = never,
  AllocationRequirements = never,
  SignOutError = never,
  SignOutRequirements = never,
> = Readonly<{
  allocateProgram: (
    context: SessionScopedProgramAllocationContext<ProgramSnapshot>,
  ) => Effect.Effect<
    Program,
    AllocationError,
    AllocationRequirements | Scope.Scope
  >
  observeSession: (
    subjectId: string,
  ) => Stream.Stream<
    ProgramSessionObservation,
    ObserveError,
    ObserveRequirements
  >
  signOut: () => Effect.Effect<void, SignOutError, SignOutRequirements>
  validateSession: (
    session: InstantProgramSessionRecordType,
    subjectId: string,
  ) => Effect.Effect<
    InstantProgramSessionRecordType,
    ValidationError,
    ValidationRequirements
  >
}>

/** Renderer-neutral ownership of one live Program session per authenticated subject. */
export type SessionScopedProgram<
  Program,
  ProgramSnapshot,
  RuntimeRequirements = never,
  SignOutError = never,
  SignOutRequirements = never,
> = Readonly<{
  read: Effect.Effect<SessionScopedProgramSnapshot<Program, ProgramSnapshot>>
  reconcileAuthenticatedSubject: (
    maybeSubjectId: Option.Option<string>,
  ) => Effect.Effect<void, never, RuntimeRequirements>
  refreshAuthenticatedSubject: Effect.Effect<void, never, RuntimeRequirements>
  shutdown: Effect.Effect<void>
  signOut: Effect.Effect<void, SignOutError, SignOutRequirements>
  snapshots: Stream.Stream<
    SessionScopedProgramSnapshot<Program, ProgramSnapshot>
  >
}>

type SessionObserver = Readonly<{
  generation: number
  scope: Scope.Closeable
  subjectId: string
}>

type ProgramAllocation = Readonly<{
  generation: number
  maybeFiber: Option.Option<Fiber.Fiber<void>>
  scope: Scope.Closeable
  session: InstantProgramSessionRecordType
  subjectScope: Scope.Closeable
  subjectGeneration: number
  subjectId: string
}>

type SessionScopedProgramInternalState<Program, ProgramSnapshot> = Readonly<{
  allocationGeneration: number
  maybeAllocation: Option.Option<ProgramAllocation>
  maybePendingProgramSnapshot: Option.Option<ProgramSnapshot>
  maybeSession: Option.Option<InstantProgramSessionRecordType>
  maybeSubjectObserver: Option.Option<SessionObserver>
  snapshot: SessionScopedProgramSnapshot<Program, ProgramSnapshot>
  subjectGeneration: number
}>

type StartSubjectObserver = Readonly<{
  generation: number
  scope: Scope.Closeable
  subjectId: string
}>

type StartProgramAllocation<ProgramSnapshot> = Readonly<{
  allocation: ProgramAllocation
  context: SessionScopedProgramAllocationContext<ProgramSnapshot>
}>

const sessionEquivalence = S.toEquivalence(InstantProgramSessionRecord)

const initialInternalState = <
  Program,
  ProgramSnapshot,
>(): SessionScopedProgramInternalState<Program, ProgramSnapshot> => ({
  allocationGeneration: 0,
  maybeAllocation: Option.none(),
  maybePendingProgramSnapshot: Option.none(),
  maybeSession: Option.none(),
  maybeSubjectObserver: Option.none(),
  snapshot: {
    lifecycle: InactiveSessionScopedProgram.make({}),
    maybeActiveProgram: Option.none(),
  },
  subjectGeneration: 0,
})

const isSameSubject = (
  maybeObserver: Option.Option<SessionObserver>,
  maybeSubjectId: Option.Option<string>,
): boolean => {
  if (Option.isNone(maybeObserver)) {
    return Option.isNone(maybeSubjectId)
  } else if (Option.isNone(maybeSubjectId)) {
    return false
  } else {
    return maybeObserver.value.subjectId === maybeSubjectId.value
  }
}

const isCurrentSubject = <Program, ProgramSnapshot>(
  state: SessionScopedProgramInternalState<Program, ProgramSnapshot>,
  observer: SessionObserver,
): boolean =>
  state.subjectGeneration === observer.generation &&
  Option.isSome(state.maybeSubjectObserver) &&
  state.maybeSubjectObserver.value.scope === observer.scope &&
  state.maybeSubjectObserver.value.subjectId === observer.subjectId

const isCurrentAllocation = <Program, ProgramSnapshot>(
  state: SessionScopedProgramInternalState<Program, ProgramSnapshot>,
  allocation: ProgramAllocation,
): boolean =>
  Option.isSome(state.maybeSubjectObserver) &&
  state.maybeSubjectObserver.value.generation ===
    allocation.subjectGeneration &&
  state.maybeSubjectObserver.value.scope === allocation.subjectScope &&
  state.maybeSubjectObserver.value.subjectId === allocation.subjectId &&
  state.allocationGeneration === allocation.generation &&
  Option.isSome(state.maybeAllocation) &&
  state.maybeAllocation.value.scope === allocation.scope &&
  sessionEquivalence(state.maybeAllocation.value.session, allocation.session)

const observingLifecycle = (
  observer: SessionObserver,
  allocationGeneration: number,
): SessionScopedProgramLifecycle =>
  ObservingSessionScopedProgram.make({
    allocationGeneration,
    subjectGeneration: observer.generation,
    subjectId: observer.subjectId,
  })

/** Creates a live Program-session lifecycle whose observers and allocations are children of the caller's Scope. */
export const makeSessionScopedProgram = <
  Program,
  ProgramSnapshot,
  ObserveError = never,
  ObserveRequirements = never,
  ValidationError = never,
  ValidationRequirements = never,
  AllocationError = never,
  AllocationRequirements = never,
  SignOutError = never,
  SignOutRequirements = never,
>(
  config: SessionScopedProgramConfig<
    Program,
    ProgramSnapshot,
    ObserveError,
    ObserveRequirements,
    ValidationError,
    ValidationRequirements,
    AllocationError,
    AllocationRequirements,
    SignOutError,
    SignOutRequirements
  >,
): Effect.Effect<
  SessionScopedProgram<
    Program,
    ProgramSnapshot,
    ObserveRequirements | ValidationRequirements | AllocationRequirements,
    SignOutError,
    SignOutRequirements
  >,
  never,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const parentScope = yield* Scope.make()
    const stateRef = yield* SubscriptionRef.make(
      initialInternalState<Program, ProgramSnapshot>(),
    )
    const transitionSemaphore = yield* Semaphore.make(1)

    const closeAllocation = (
      maybeAllocation: Option.Option<ProgramAllocation>,
    ): Effect.Effect<void> => {
      if (Option.isNone(maybeAllocation)) {
        return Effect.void
      }
      const allocation = maybeAllocation.value
      const interrupt = Option.isSome(allocation.maybeFiber)
        ? Fiber.interrupt(allocation.maybeFiber.value)
        : Effect.void
      return interrupt.pipe(
        Effect.andThen(Scope.close(allocation.scope, Exit.void)),
      )
    }

    const closeSubjectObserver = (
      maybeObserver: Option.Option<SessionObserver>,
    ): Effect.Effect<void> => {
      if (Option.isSome(maybeObserver)) {
        return Scope.close(maybeObserver.value.scope, Exit.void)
      } else {
        return Effect.void
      }
    }

    const publishProgramSnapshot = (
      allocation: ProgramAllocation,
      programSnapshot: ProgramSnapshot,
    ): Effect.Effect<void> =>
      SubscriptionRef.updateSome(stateRef, state => {
        if (!isCurrentAllocation(state, allocation)) {
          return Option.none()
        } else if (Option.isSome(state.snapshot.maybeActiveProgram)) {
          return Option.some({
            ...state,
            snapshot: {
              ...state.snapshot,
              maybeActiveProgram: Option.some({
                ...state.snapshot.maybeActiveProgram.value,
                maybeProgramSnapshot: Option.some(programSnapshot),
              }),
            },
          })
        } else {
          return Option.some({
            ...state,
            maybePendingProgramSnapshot: Option.some(programSnapshot),
          })
        }
      })

    const clearCurrentAllocation = (
      observer: SessionObserver,
      maybeSession: Option.Option<InstantProgramSessionRecordType>,
      lifecycle: SessionScopedProgramLifecycle,
    ): Effect.Effect<Option.Option<ProgramAllocation>> =>
      SubscriptionRef.modify(stateRef, state => {
        if (!isCurrentSubject(state, observer)) {
          return Tuple.make(Option.none(), state)
        }
        return Tuple.make(state.maybeAllocation, {
          ...state,
          allocationGeneration: state.allocationGeneration + 1,
          maybeAllocation: Option.none(),
          maybePendingProgramSnapshot: Option.none(),
          maybeSession,
          snapshot: {
            lifecycle,
            maybeActiveProgram: Option.none(),
          },
        })
      })

    const failCurrentSubject = (
      observer: SessionObserver,
      failure: 'ObserveSession' | 'ValidateSession',
    ): Effect.Effect<void> =>
      transitionSemaphore.withPermit(
        Effect.gen(function* () {
          const currentState = yield* SubscriptionRef.get(stateRef)
          if (!isCurrentSubject(currentState, observer)) {
            return
          }
          const maybeAllocation = yield* clearCurrentAllocation(
            observer,
            Option.none(),
            FailedSessionScopedProgram.make({
              allocationGeneration: currentState.allocationGeneration + 1,
              failure,
              subjectGeneration: observer.generation,
              subjectId: observer.subjectId,
            }),
          )
          yield* closeAllocation(maybeAllocation)
        }),
      )

    const beginProgramAllocation = (
      observer: SessionObserver,
      session: InstantProgramSessionRecordType,
    ): Effect.Effect<Option.Option<StartProgramAllocation<ProgramSnapshot>>> =>
      transitionSemaphore.withPermit(
        Effect.gen(function* () {
          const currentState = yield* SubscriptionRef.get(stateRef)
          if (!isCurrentSubject(currentState, observer)) {
            return Option.none()
          }
          if (
            Option.isSome(currentState.maybeSession) &&
            sessionEquivalence(currentState.maybeSession.value, session)
          ) {
            return Option.none()
          }

          const nextAllocationGeneration = currentState.allocationGeneration + 1
          const maybeOldAllocation = yield* clearCurrentAllocation(
            observer,
            Option.some(session),
            session.isRevoked
              ? observingLifecycle(observer, nextAllocationGeneration)
              : AllocatingSessionScopedProgram.make({
                  allocationGeneration: nextAllocationGeneration,
                  session,
                  subjectGeneration: observer.generation,
                  subjectId: observer.subjectId,
                }),
          )
          yield* closeAllocation(maybeOldAllocation)

          if (session.isRevoked) {
            return Option.none()
          }

          const scope = yield* Scope.fork(observer.scope)
          const allocation: ProgramAllocation = {
            generation: nextAllocationGeneration,
            maybeFiber: Option.none(),
            scope,
            session,
            subjectScope: observer.scope,
            subjectGeneration: observer.generation,
            subjectId: observer.subjectId,
          }
          yield* SubscriptionRef.updateSome(stateRef, state => {
            if (!isCurrentSubject(state, observer)) {
              return Option.none()
            }
            return Option.some({
              ...state,
              maybeAllocation: Option.some(allocation),
            })
          })
          return Option.some({
            allocation,
            context: {
              allocationGeneration: nextAllocationGeneration,
              publishProgramSnapshot: programSnapshot =>
                publishProgramSnapshot(allocation, programSnapshot),
              session,
              subjectGeneration: observer.generation,
              subjectId: observer.subjectId,
            },
          })
        }),
      )

    const clearMissingSession = (
      observer: SessionObserver,
    ): Effect.Effect<void> =>
      transitionSemaphore.withPermit(
        Effect.gen(function* () {
          const currentState = yield* SubscriptionRef.get(stateRef)
          if (!isCurrentSubject(currentState, observer)) {
            return
          }
          if (
            Option.isNone(currentState.maybeSession) &&
            Option.isNone(currentState.maybeAllocation) &&
            currentState.snapshot.lifecycle._tag ===
              'ObservingSessionScopedProgram'
          ) {
            return
          }
          const nextAllocationGeneration = currentState.allocationGeneration + 1
          const maybeAllocation = yield* clearCurrentAllocation(
            observer,
            Option.none(),
            observingLifecycle(observer, nextAllocationGeneration),
          )
          yield* closeAllocation(maybeAllocation)
        }),
      )

    const completeAllocation = (
      allocation: ProgramAllocation,
      program: Program,
    ): Effect.Effect<void> =>
      SubscriptionRef.updateSome(stateRef, state => {
        if (!isCurrentAllocation(state, allocation)) {
          return Option.none()
        }
        return Option.some({
          ...state,
          maybePendingProgramSnapshot: Option.none(),
          snapshot: {
            lifecycle: ActiveSessionScopedProgram.make({
              allocationGeneration: allocation.generation,
              session: allocation.session,
              subjectGeneration: allocation.subjectGeneration,
              subjectId: allocation.subjectId,
            }),
            maybeActiveProgram: Option.some({
              allocationGeneration: allocation.generation,
              maybeProgramSnapshot: state.maybePendingProgramSnapshot,
              program,
              session: allocation.session,
              subjectGeneration: allocation.subjectGeneration,
              subjectId: allocation.subjectId,
            }),
          },
        })
      })

    const failAllocation = (
      allocation: ProgramAllocation,
      cause: Cause.Cause<AllocationError>,
    ): Effect.Effect<void> =>
      transitionSemaphore.withPermit(
        Effect.gen(function* () {
          const currentState = yield* SubscriptionRef.get(stateRef)
          if (!isCurrentAllocation(currentState, allocation)) {
            return
          }
          yield* SubscriptionRef.update(stateRef, state => ({
            ...state,
            maybeAllocation: Option.none(),
            maybePendingProgramSnapshot: Option.none(),
            maybeSession: Option.none(),
            snapshot: {
              lifecycle: FailedSessionScopedProgram.make({
                allocationGeneration: allocation.generation,
                failure: 'AllocateProgram',
                subjectGeneration: allocation.subjectGeneration,
                subjectId: allocation.subjectId,
              }),
              maybeActiveProgram: Option.none(),
            },
          }))
          yield* Scope.close(allocation.scope, Exit.failCause(cause))
        }),
      )

    const runProgramAllocation = (
      transition: StartProgramAllocation<ProgramSnapshot>,
    ): Effect.Effect<void, never, AllocationRequirements> =>
      SubscriptionRef.get(stateRef).pipe(
        Effect.flatMap(state => {
          if (!isCurrentAllocation(state, transition.allocation)) {
            return Effect.void
          }
          return Effect.suspend(() =>
            config.allocateProgram(transition.context),
          ).pipe(
            Scope.provide(transition.allocation.scope),
            Effect.matchCauseEffect({
              onFailure: cause => {
                if (Cause.hasInterruptsOnly(cause)) {
                  return Effect.void
                } else {
                  return failAllocation(transition.allocation, cause)
                }
              },
              onSuccess: program =>
                completeAllocation(transition.allocation, program),
            }),
          )
        }),
      )

    const storeAllocationFiber = (
      allocation: ProgramAllocation,
      fiber: Fiber.Fiber<void>,
    ): Effect.Effect<void> =>
      SubscriptionRef.modify(stateRef, state => {
        if (!isCurrentAllocation(state, allocation)) {
          return Tuple.make(false, state)
        }
        const nextAllocation = { ...allocation, maybeFiber: Option.some(fiber) }
        return Tuple.make(true, {
          ...state,
          maybeAllocation: Option.some(nextAllocation),
        })
      }).pipe(
        Effect.flatMap(isStored => {
          if (isStored) {
            return Effect.void
          } else {
            return Fiber.interrupt(fiber).pipe(
              Effect.andThen(Scope.close(allocation.scope, Exit.void)),
            )
          }
        }),
      )

    const startProgramAllocation = (
      transition: StartProgramAllocation<ProgramSnapshot>,
    ): Effect.Effect<void, never, AllocationRequirements> =>
      Effect.gen(function* () {
        const startGate = yield* Deferred.make<void>()
        const fiber = yield* Effect.forkIn(
          Deferred.await(startGate).pipe(
            Effect.andThen(runProgramAllocation(transition)),
          ),
          transition.allocation.subjectScope,
        )
        yield* storeAllocationFiber(transition.allocation, fiber)
        yield* Deferred.succeed(startGate, undefined)
      })

    const handleAuthenticatedSession = (
      observer: SessionObserver,
      candidate: InstantProgramSessionRecordType,
    ): Effect.Effect<
      void,
      never,
      ValidationRequirements | AllocationRequirements
    > =>
      Effect.suspend(() =>
        config.validateSession(candidate, observer.subjectId),
      ).pipe(
        Effect.matchCauseEffect({
          onFailure: cause => {
            if (Cause.hasInterruptsOnly(cause)) {
              return Effect.void
            } else {
              return failCurrentSubject(observer, 'ValidateSession')
            }
          },
          onSuccess: session =>
            beginProgramAllocation(observer, session).pipe(
              Effect.flatMap(maybeTransition => {
                if (Option.isSome(maybeTransition)) {
                  return startProgramAllocation(maybeTransition.value)
                } else {
                  return Effect.void
                }
              }),
            ),
        }),
      )

    const handleObservation = (
      observer: SessionObserver,
      observation: ProgramSessionObservation,
    ): Effect.Effect<
      void,
      never,
      ValidationRequirements | AllocationRequirements
    > =>
      M.value(observation).pipe(
        M.withReturnType<
          Effect.Effect<
            void,
            never,
            ValidationRequirements | AllocationRequirements
          >
        >(),
        M.tagsExhaustive({
          AuthenticatedMissing: () => clearMissingSession(observer),
          AuthenticatedSession: authenticated =>
            handleAuthenticatedSession(observer, authenticated.session),
          TransportUnavailable: () => Effect.void,
        }),
      )

    const runSubjectObserver = (
      observer: SessionObserver,
    ): Effect.Effect<
      void,
      never,
      ObserveRequirements | ValidationRequirements | AllocationRequirements
    > =>
      Effect.suspend(() =>
        Stream.runForEach(
          config.observeSession(observer.subjectId),
          observation => handleObservation(observer, observation),
        ),
      ).pipe(
        Effect.andThen(failCurrentSubject(observer, 'ObserveSession')),
        Effect.catchCause(cause => {
          if (Cause.hasInterruptsOnly(cause)) {
            return Effect.void
          } else {
            return failCurrentSubject(observer, 'ObserveSession')
          }
        }),
      )

    const startSubjectObserver = (
      transition: StartSubjectObserver,
    ): Effect.Effect<
      void,
      never,
      ObserveRequirements | ValidationRequirements | AllocationRequirements
    > =>
      Effect.gen(function* () {
        const observer: SessionObserver = transition
        yield* Effect.forkIn(runSubjectObserver(observer), observer.scope)
      })

    const beginSubjectTransition = (
      maybeSubjectId: Option.Option<string>,
      isRefresh: boolean,
    ): Effect.Effect<Option.Option<StartSubjectObserver>> =>
      transitionSemaphore.withPermit(
        Effect.gen(function* () {
          const currentState = yield* SubscriptionRef.get(stateRef)
          const nextMaybeSubjectId = isRefresh
            ? Option.map(
                currentState.maybeSubjectObserver,
                observer => observer.subjectId,
              )
            : maybeSubjectId
          if (
            !isRefresh &&
            isSameSubject(currentState.maybeSubjectObserver, nextMaybeSubjectId)
          ) {
            return Option.none()
          }

          const nextSubjectGeneration = currentState.subjectGeneration + 1
          const nextAllocationGeneration = currentState.allocationGeneration + 1
          const maybeOldAllocation = currentState.maybeAllocation
          const maybeOldObserver = currentState.maybeSubjectObserver
          yield* SubscriptionRef.set(stateRef, {
            allocationGeneration: nextAllocationGeneration,
            maybeAllocation: Option.none(),
            maybePendingProgramSnapshot: Option.none(),
            maybeSession: Option.none(),
            maybeSubjectObserver: Option.none(),
            snapshot: {
              lifecycle: Option.isSome(nextMaybeSubjectId)
                ? ObservingSessionScopedProgram.make({
                    allocationGeneration: nextAllocationGeneration,
                    subjectGeneration: nextSubjectGeneration,
                    subjectId: nextMaybeSubjectId.value,
                  })
                : InactiveSessionScopedProgram.make({}),
              maybeActiveProgram: Option.none(),
            },
            subjectGeneration: nextSubjectGeneration,
          })
          yield* closeAllocation(maybeOldAllocation)
          yield* closeSubjectObserver(maybeOldObserver)

          if (Option.isNone(nextMaybeSubjectId)) {
            return Option.none()
          }
          const scope = yield* Scope.fork(parentScope)
          const observer: SessionObserver = {
            generation: nextSubjectGeneration,
            scope,
            subjectId: nextMaybeSubjectId.value,
          }
          yield* SubscriptionRef.update(stateRef, state => ({
            ...state,
            maybeSubjectObserver: Option.some(observer),
          }))
          return Option.some(observer)
        }),
      )

    const runSubjectTransition = (
      maybeSubjectId: Option.Option<string>,
      isRefresh: boolean,
    ): Effect.Effect<
      void,
      never,
      ObserveRequirements | ValidationRequirements | AllocationRequirements
    > =>
      beginSubjectTransition(maybeSubjectId, isRefresh).pipe(
        Effect.flatMap(maybeTransition => {
          if (Option.isSome(maybeTransition)) {
            return startSubjectObserver(maybeTransition.value)
          } else {
            return Effect.void
          }
        }),
      )

    const shutdown = transitionSemaphore.withPermit(
      Effect.gen(function* () {
        const currentState = yield* SubscriptionRef.get(stateRef)
        yield* SubscriptionRef.set(stateRef, {
          ...initialInternalState<Program, ProgramSnapshot>(),
          allocationGeneration: currentState.allocationGeneration + 1,
          subjectGeneration: currentState.subjectGeneration + 1,
        })
        yield* closeAllocation(currentState.maybeAllocation)
        yield* closeSubjectObserver(currentState.maybeSubjectObserver)
      }),
    )

    const signOut = transitionSemaphore.withPermit(
      Effect.gen(function* () {
        const currentState = yield* SubscriptionRef.get(stateRef)
        yield* SubscriptionRef.set(stateRef, {
          ...initialInternalState<Program, ProgramSnapshot>(),
          allocationGeneration: currentState.allocationGeneration + 1,
          subjectGeneration: currentState.subjectGeneration + 1,
        })
        yield* closeAllocation(currentState.maybeAllocation)
        yield* closeSubjectObserver(currentState.maybeSubjectObserver)
        yield* config.signOut()
      }),
    )

    const service: SessionScopedProgram<
      Program,
      ProgramSnapshot,
      ObserveRequirements | ValidationRequirements | AllocationRequirements,
      SignOutError,
      SignOutRequirements
    > = {
      read: SubscriptionRef.get(stateRef).pipe(
        Effect.map(state => state.snapshot),
      ),
      reconcileAuthenticatedSubject: maybeSubjectId =>
        runSubjectTransition(maybeSubjectId, false),
      refreshAuthenticatedSubject: runSubjectTransition(Option.none(), true),
      shutdown,
      signOut,
      snapshots: SubscriptionRef.changes(stateRef).pipe(
        Stream.map(state => state.snapshot),
      ),
    }

    yield* Effect.addFinalizer(() =>
      shutdown.pipe(Effect.ensuring(Scope.close(parentScope, Exit.void))),
    )
    return service
  })

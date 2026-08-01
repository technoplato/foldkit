import {
  Cause,
  Data,
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

const SubjectScopedProgramGeneration = S.Int.check(S.isGreaterThanOrEqualTo(0))

/** No authenticated subject currently owns a Program allocation. */
export const InactiveSubjectScopedProgram = S.TaggedStruct(
  'InactiveSubjectScopedProgram',
  {},
)

/** A Program allocation is starting for one authenticated subject. */
export const AllocatingSubjectScopedProgram = S.TaggedStruct(
  'AllocatingSubjectScopedProgram',
  {
    generation: SubjectScopedProgramGeneration,
    subjectId: S.NonEmptyString,
  },
)

/** One authenticated subject currently owns the active Program allocation. */
export const ActiveSubjectScopedProgram = S.TaggedStruct(
  'ActiveSubjectScopedProgram',
  {
    generation: SubjectScopedProgramGeneration,
    subjectId: S.NonEmptyString,
  },
)

/** A Program allocation failed for one authenticated subject. */
export const FailedSubjectScopedProgram = S.TaggedStruct(
  'FailedSubjectScopedProgram',
  {
    generation: SubjectScopedProgramGeneration,
    subjectId: S.NonEmptyString,
  },
)

/** Authentication invalidation is running after the active Program was fenced. */
export const SigningOutSubjectScopedProgram = S.TaggedStruct(
  'SigningOutSubjectScopedProgram',
  {
    generation: SubjectScopedProgramGeneration,
  },
)

/** Every credential-free phase of an authenticated subject's Program lifecycle. */
export const SubjectScopedProgramLifecycle = S.Union([
  InactiveSubjectScopedProgram,
  AllocatingSubjectScopedProgram,
  ActiveSubjectScopedProgram,
  FailedSubjectScopedProgram,
  SigningOutSubjectScopedProgram,
])

/** Every credential-free phase of an authenticated subject's Program lifecycle. */
export type SubjectScopedProgramLifecycle =
  typeof SubjectScopedProgramLifecycle.Type

/** One active Program and its latest optional renderer snapshot. */
export type SubjectScopedProgramActive<Program, ProgramSnapshot> = Readonly<{
  generation: number
  maybeProgramSnapshot: Option.Option<ProgramSnapshot>
  program: Program
  subjectId: string
}>

/** The atomic public state of one authenticated-subject Program lifecycle. */
export type SubjectScopedProgramSnapshot<Program, ProgramSnapshot> = Readonly<{
  lifecycle: SubjectScopedProgramLifecycle
  maybeActiveProgram: Option.Option<
    SubjectScopedProgramActive<Program, ProgramSnapshot>
  >
}>

/** The generation-fenced context supplied while allocating a subject Program. */
export type SubjectScopedProgramAllocationContext<ProgramSnapshot> = Readonly<{
  generation: number
  publishProgramSnapshot: (
    programSnapshot: ProgramSnapshot,
  ) => Effect.Effect<void>
  subjectId: string
}>

/** An operation required an authenticated Program after its allocation ended. */
export class SubjectScopedProgramInactive extends Data.TaggedError(
  'SubjectScopedProgramInactive',
)<
  Readonly<{
    lifecycle: SubjectScopedProgramLifecycle['_tag']
  }>
> {}

/** An authenticated generation ended while its allocation or operation was running. */
export class SubjectScopedProgramSuperseded extends Data.TaggedError(
  'SubjectScopedProgramSuperseded',
)<Readonly<{ generation: number; subjectId: string }>> {}

/** One adapter sign-out already owns the framework lifecycle. */
export class SubjectScopedProgramSignOutInProgress extends Data.TaggedError(
  'SubjectScopedProgramSignOutInProgress',
)<Readonly<{ generation: number }>> {}

/** Host boundaries required to allocate Programs and invalidate authentication. */
export type SubjectScopedProgramConfig<
  Program,
  ProgramSnapshot,
  AllocationError = never,
  AllocationRequirements = never,
  SignOutError = never,
  SignOutRequirements = never,
> = Readonly<{
  allocateProgram: (
    context: SubjectScopedProgramAllocationContext<ProgramSnapshot>,
  ) => Effect.Effect<
    Program,
    AllocationError,
    AllocationRequirements | Scope.Scope
  >
  signOut: () => Effect.Effect<void, SignOutError, SignOutRequirements>
}>

/** Renderer-neutral ownership of one scoped Program per authenticated subject. */
export type SubjectScopedProgram<
  Program,
  ProgramSnapshot,
  AllocationError = never,
  AllocationRequirements = never,
  SignOutError = never,
  SignOutRequirements = never,
> = Readonly<{
  read: Effect.Effect<SubjectScopedProgramSnapshot<Program, ProgramSnapshot>>
  reconcileAuthenticatedSubject: (
    maybeSubjectId: Option.Option<string>,
  ) => Effect.Effect<
    void,
    AllocationError | SubjectScopedProgramSuperseded,
    AllocationRequirements
  >
  refreshAuthenticatedSubject: Effect.Effect<
    void,
    AllocationError | SubjectScopedProgramSuperseded,
    AllocationRequirements
  >
  shutdown: Effect.Effect<void>
  signOut: Effect.Effect<
    void,
    SignOutError | SubjectScopedProgramSignOutInProgress,
    AllocationRequirements | SignOutRequirements
  >
  snapshots: Stream.Stream<
    SubjectScopedProgramSnapshot<Program, ProgramSnapshot>
  >
  withActiveProgram: <Value, Error, Requirements>(
    use: (
      active: SubjectScopedProgramActive<Program, ProgramSnapshot>,
    ) => Effect.Effect<Value, Error, Requirements>,
  ) => Effect.Effect<
    Value,
    Error | SubjectScopedProgramInactive | SubjectScopedProgramSuperseded,
    Requirements
  >
}>

type SubjectScopedProgramInternalState<Program, ProgramSnapshot> = Readonly<{
  generation: number
  maybeDeferredSubjectId: Option.Option<Option.Option<string>>
  maybePendingProgramSnapshot: Option.Option<ProgramSnapshot>
  maybeScope: Option.Option<Scope.Closeable>
  maybeSubjectId: Option.Option<string>
  snapshot: SubjectScopedProgramSnapshot<Program, ProgramSnapshot>
}>

type UnchangedSubjectScopedProgram = Readonly<{
  _tag: 'UnchangedSubjectScopedProgram'
}>

type ClearedSubjectScopedProgram = Readonly<{
  _tag: 'ClearedSubjectScopedProgram'
}>

type DeferredSubjectScopedProgram = Readonly<{
  _tag: 'DeferredSubjectScopedProgram'
}>

type AllocateSubjectScopedProgram<ProgramSnapshot> = Readonly<{
  _tag: 'AllocateSubjectScopedProgram'
  context: SubjectScopedProgramAllocationContext<ProgramSnapshot>
  generation: number
  scope: Scope.Closeable
  subjectId: string
}>

type SubjectScopedProgramTransition<ProgramSnapshot> =
  | UnchangedSubjectScopedProgram
  | ClearedSubjectScopedProgram
  | DeferredSubjectScopedProgram
  | AllocateSubjectScopedProgram<ProgramSnapshot>

type RunningSubjectScopedProgramAllocation<
  Program,
  ProgramSnapshot,
  AllocationError,
> = Readonly<{
  fiber: Fiber.Fiber<Program, AllocationError>
  transition: AllocateSubjectScopedProgram<ProgramSnapshot>
}>

type RunningSubjectScopedProgramSignOut<SignOutError> = Readonly<{
  fiber: Fiber.Fiber<void, SignOutError>
  generation: number
}>

const initialInternalState = <
  Program,
  ProgramSnapshot,
>(): SubjectScopedProgramInternalState<Program, ProgramSnapshot> => ({
  generation: 0,
  maybeDeferredSubjectId: Option.none(),
  maybePendingProgramSnapshot: Option.none(),
  maybeScope: Option.none(),
  maybeSubjectId: Option.none(),
  snapshot: {
    lifecycle: InactiveSubjectScopedProgram.make({}),
    maybeActiveProgram: Option.none(),
  },
})

const hasSameSubject = (
  first: Option.Option<string>,
  second: Option.Option<string>,
): boolean => {
  if (Option.isNone(first)) {
    return Option.isNone(second)
  } else if (Option.isNone(second)) {
    return false
  } else {
    return first.value === second.value
  }
}

const isCurrentAllocation = <Program, ProgramSnapshot>(
  state: SubjectScopedProgramInternalState<Program, ProgramSnapshot>,
  generation: number,
  scope: Scope.Closeable,
  subjectId: string,
): boolean =>
  state.generation === generation &&
  Option.isSome(state.maybeScope) &&
  state.maybeScope.value === scope &&
  Option.isSome(state.maybeSubjectId) &&
  state.maybeSubjectId.value === subjectId

const subjectIdForLifecycle = (
  lifecycle: SubjectScopedProgramLifecycle,
): Option.Option<string> =>
  M.value(lifecycle).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      ActiveSubjectScopedProgram: active => Option.some(active.subjectId),
      AllocatingSubjectScopedProgram: allocating =>
        Option.some(allocating.subjectId),
      FailedSubjectScopedProgram: failed => Option.some(failed.subjectId),
      InactiveSubjectScopedProgram: () => Option.none(),
      SigningOutSubjectScopedProgram: () => Option.none(),
    }),
  )

/** Creates an authenticated-subject lifecycle whose allocations are children of the caller's Scope. */
export const makeSubjectScopedProgram = <
  Program,
  ProgramSnapshot,
  AllocationError = never,
  AllocationRequirements = never,
  SignOutError = never,
  SignOutRequirements = never,
>(
  config: SubjectScopedProgramConfig<
    Program,
    ProgramSnapshot,
    AllocationError,
    AllocationRequirements,
    SignOutError,
    SignOutRequirements
  >,
): Effect.Effect<
  SubjectScopedProgram<
    Program,
    ProgramSnapshot,
    AllocationError,
    AllocationRequirements,
    SignOutError,
    SignOutRequirements
  >,
  never,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const allocationParentScope = yield* Scope.make()
    const stateRef = yield* SubscriptionRef.make(
      initialInternalState<Program, ProgramSnapshot>(),
    )
    const transitionSemaphore = yield* Semaphore.make(1)

    const clearCurrentProgram = (
      lifecycle: SubjectScopedProgramLifecycle,
      maybeSubjectId: Option.Option<string>,
    ): Effect.Effect<Option.Option<Scope.Closeable>> =>
      SubscriptionRef.modify(stateRef, state =>
        Tuple.make(state.maybeScope, {
          generation: state.generation + 1,
          maybeDeferredSubjectId: Option.none(),
          maybePendingProgramSnapshot: Option.none(),
          maybeScope: Option.none(),
          maybeSubjectId,
          snapshot: {
            lifecycle,
            maybeActiveProgram: Option.none(),
          },
        }),
      )

    const closeMaybeScope = (
      maybeScope: Option.Option<Scope.Closeable>,
    ): Effect.Effect<void> => {
      if (Option.isSome(maybeScope)) {
        return Scope.close(maybeScope.value, Exit.void)
      } else {
        return Effect.void
      }
    }

    const publishProgramSnapshot = (
      generation: number,
      scope: Scope.Closeable,
      subjectId: string,
      programSnapshot: ProgramSnapshot,
    ): Effect.Effect<void> =>
      SubscriptionRef.updateSome(stateRef, state => {
        if (!isCurrentAllocation(state, generation, scope, subjectId)) {
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

    const beginTransitionWithPermit = (
      maybeSubjectId: Option.Option<string>,
      isRefresh: boolean,
    ): Effect.Effect<SubjectScopedProgramTransition<ProgramSnapshot>> =>
      Effect.gen(function* () {
        const currentState = yield* SubscriptionRef.get(stateRef)
        if (
          currentState.snapshot.lifecycle._tag ===
          'SigningOutSubjectScopedProgram'
        ) {
          yield* SubscriptionRef.update(stateRef, state => ({
            ...state,
            maybeDeferredSubjectId: Option.some(maybeSubjectId),
          }))
          return { _tag: 'DeferredSubjectScopedProgram' }
        }
        if (
          !isRefresh &&
          hasSameSubject(currentState.maybeSubjectId, maybeSubjectId) &&
          currentState.snapshot.lifecycle._tag !== 'FailedSubjectScopedProgram'
        ) {
          return { _tag: 'UnchangedSubjectScopedProgram' }
        }

        const nextGeneration = currentState.generation + 1
        const nextLifecycle = Option.isSome(maybeSubjectId)
          ? AllocatingSubjectScopedProgram.make({
              generation: nextGeneration,
              subjectId: maybeSubjectId.value,
            })
          : InactiveSubjectScopedProgram.make({})
        const maybeOldScope = yield* clearCurrentProgram(
          nextLifecycle,
          maybeSubjectId,
        )
        yield* closeMaybeScope(maybeOldScope)

        if (Option.isNone(maybeSubjectId)) {
          return { _tag: 'ClearedSubjectScopedProgram' }
        }

        const subjectId = maybeSubjectId.value
        const scope = yield* Scope.fork(allocationParentScope)
        const context: SubjectScopedProgramAllocationContext<ProgramSnapshot> =
          {
            generation: nextGeneration,
            publishProgramSnapshot: programSnapshot =>
              publishProgramSnapshot(
                nextGeneration,
                scope,
                subjectId,
                programSnapshot,
              ),
            subjectId,
          }
        yield* SubscriptionRef.update(stateRef, state => ({
          ...state,
          maybeScope: Option.some(scope),
        }))
        return {
          _tag: 'AllocateSubjectScopedProgram',
          context,
          generation: nextGeneration,
          scope,
          subjectId,
        }
      })

    const completeAllocation = (
      transition: AllocateSubjectScopedProgram<ProgramSnapshot>,
      program: Program,
    ): Effect.Effect<void, SubjectScopedProgramSuperseded> =>
      Effect.gen(function* () {
        const isActivated = yield* SubscriptionRef.modifySome(
          stateRef,
          state => {
            if (
              !isCurrentAllocation(
                state,
                transition.generation,
                transition.scope,
                transition.subjectId,
              )
            ) {
              return Tuple.make(false, Option.none())
            }
            return Tuple.make(
              true,
              Option.some({
                ...state,
                maybePendingProgramSnapshot: Option.none(),
                snapshot: {
                  lifecycle: ActiveSubjectScopedProgram.make({
                    generation: transition.generation,
                    subjectId: transition.subjectId,
                  }),
                  maybeActiveProgram: Option.some({
                    generation: transition.generation,
                    maybeProgramSnapshot: state.maybePendingProgramSnapshot,
                    program,
                    subjectId: transition.subjectId,
                  }),
                },
              }),
            )
          },
        )
        if (!isActivated) {
          yield* Scope.close(transition.scope, Exit.void)
          return yield* new SubjectScopedProgramSuperseded({
            generation: transition.generation,
            subjectId: transition.subjectId,
          })
        }
      })

    const failAllocation = (
      transition: AllocateSubjectScopedProgram<ProgramSnapshot>,
      cause: Cause.Cause<AllocationError>,
    ): Effect.Effect<void, AllocationError | SubjectScopedProgramSuperseded> =>
      Effect.gen(function* () {
        const isCurrent = yield* SubscriptionRef.modifySome(stateRef, state => {
          if (
            !isCurrentAllocation(
              state,
              transition.generation,
              transition.scope,
              transition.subjectId,
            )
          ) {
            return Tuple.make(false, Option.none())
          }
          return Tuple.make(
            true,
            Option.some({
              ...state,
              maybePendingProgramSnapshot: Option.none(),
              maybeScope: Option.none(),
              snapshot: {
                lifecycle: FailedSubjectScopedProgram.make({
                  generation: transition.generation,
                  subjectId: transition.subjectId,
                }),
                maybeActiveProgram: Option.none(),
              },
            }),
          )
        })
        yield* Scope.close(transition.scope, Exit.failCause(cause))
        if (isCurrent) {
          return yield* Effect.failCause(cause)
        }
        return yield* new SubjectScopedProgramSuperseded({
          generation: transition.generation,
          subjectId: transition.subjectId,
        })
      })

    const startAllocationWithPermit = (
      transition: SubjectScopedProgramTransition<ProgramSnapshot>,
    ): Effect.Effect<
      Option.Option<
        RunningSubjectScopedProgramAllocation<
          Program,
          ProgramSnapshot,
          AllocationError
        >
      >,
      never,
      AllocationRequirements
    > =>
      Effect.gen(function* () {
        if (transition._tag !== 'AllocateSubjectScopedProgram') {
          return Option.none()
        }
        const fiber = yield* Effect.forkIn(
          Scope.provide(transition.scope)(
            config.allocateProgram(transition.context),
          ),
          transition.scope,
        )
        return Option.some({ fiber, transition })
      })

    const runAllocation = (
      running: RunningSubjectScopedProgramAllocation<
        Program,
        ProgramSnapshot,
        AllocationError
      >,
    ): Effect.Effect<void, AllocationError | SubjectScopedProgramSuperseded> =>
      Effect.onInterrupt(Fiber.join(running.fiber), () =>
        SubscriptionRef.modifySome(stateRef, state => {
          if (
            !isCurrentAllocation(
              state,
              running.transition.generation,
              running.transition.scope,
              running.transition.subjectId,
            )
          ) {
            return Tuple.make(Option.none<Scope.Closeable>(), Option.none())
          }
          return Tuple.make(
            Option.some(running.transition.scope),
            Option.some({
              ...state,
              maybePendingProgramSnapshot: Option.none(),
              maybeScope: Option.none(),
              snapshot: {
                lifecycle: FailedSubjectScopedProgram.make({
                  generation: running.transition.generation,
                  subjectId: running.transition.subjectId,
                }),
                maybeActiveProgram: Option.none(),
              },
            }),
          )
        }).pipe(Effect.flatMap(closeMaybeScope)),
      ).pipe(
        Effect.matchCauseEffect({
          onFailure: cause => failAllocation(running.transition, cause),
          onSuccess: program => completeAllocation(running.transition, program),
        }),
      )

    const runMaybeAllocation = (
      maybeRunning: Option.Option<
        RunningSubjectScopedProgramAllocation<
          Program,
          ProgramSnapshot,
          AllocationError
        >
      >,
    ): Effect.Effect<void, AllocationError | SubjectScopedProgramSuperseded> =>
      Option.match(maybeRunning, {
        onNone: () => Effect.void,
        onSome: runAllocation,
      })

    const runTransition = (
      maybeSubjectId: Option.Option<string>,
      isRefresh: boolean,
    ): Effect.Effect<
      void,
      AllocationError | SubjectScopedProgramSuperseded,
      AllocationRequirements
    > =>
      transitionSemaphore
        .withPermit(
          beginTransitionWithPermit(maybeSubjectId, isRefresh).pipe(
            Effect.flatMap(startAllocationWithPermit),
          ),
        )
        .pipe(Effect.flatMap(runMaybeAllocation))

    const refreshAuthenticatedSubject = transitionSemaphore
      .withPermit(
        Effect.gen(function* () {
          const state = yield* SubscriptionRef.get(stateRef)
          if (
            state.snapshot.lifecycle._tag === 'SigningOutSubjectScopedProgram'
          ) {
            return Option.none<
              RunningSubjectScopedProgramAllocation<
                Program,
                ProgramSnapshot,
                AllocationError
              >
            >()
          }
          const maybeSubjectId = subjectIdForLifecycle(state.snapshot.lifecycle)
          const transition = yield* beginTransitionWithPermit(
            maybeSubjectId,
            true,
          )
          return yield* startAllocationWithPermit(transition)
        }),
      )
      .pipe(Effect.flatMap(runMaybeAllocation))

    const read = SubscriptionRef.get(stateRef).pipe(
      Effect.map(state => state.snapshot),
    )

    const runActiveProgram = <Value, Error>(
      active: SubjectScopedProgramActive<Program, ProgramSnapshot>,
      scope: Scope.Closeable,
      fiber: Fiber.Fiber<Value, Error>,
    ): Effect.Effect<Value, Error | SubjectScopedProgramSuperseded> =>
      Effect.onInterrupt(Effect.exit(Fiber.join(fiber)), () =>
        Effect.asVoid(Fiber.interrupt(fiber)),
      ).pipe(
        Effect.flatMap(exit =>
          Exit.match(exit, {
            onFailure: cause => {
              return SubscriptionRef.get(stateRef).pipe(
                Effect.flatMap(state => {
                  const result: Effect.Effect<
                    never,
                    Error | SubjectScopedProgramSuperseded
                  > = isCurrentAllocation(
                    state,
                    active.generation,
                    scope,
                    active.subjectId,
                  )
                    ? Effect.failCause(cause)
                    : Effect.fail(
                        new SubjectScopedProgramSuperseded({
                          generation: active.generation,
                          subjectId: active.subjectId,
                        }),
                      )
                  return result
                }),
              )
            },
            onSuccess: value =>
              SubscriptionRef.get(stateRef).pipe(
                Effect.flatMap(state => {
                  const isCurrent =
                    Option.isSome(state.snapshot.maybeActiveProgram) &&
                    state.snapshot.maybeActiveProgram.value.generation ===
                      active.generation &&
                    state.snapshot.maybeActiveProgram.value.subjectId ===
                      active.subjectId
                  const result: Effect.Effect<
                    Value,
                    SubjectScopedProgramSuperseded
                  > = isCurrent
                    ? Effect.succeed(value)
                    : Effect.fail(
                        new SubjectScopedProgramSuperseded({
                          generation: active.generation,
                          subjectId: active.subjectId,
                        }),
                      )
                  return result
                }),
              ),
          }),
        ),
      )

    const withActiveProgram = <Value, Error, Requirements>(
      use: (
        active: SubjectScopedProgramActive<Program, ProgramSnapshot>,
      ) => Effect.Effect<Value, Error, Requirements>,
    ): Effect.Effect<
      Value,
      Error | SubjectScopedProgramInactive | SubjectScopedProgramSuperseded,
      Requirements
    > =>
      transitionSemaphore
        .withPermit(
          Effect.gen(function* () {
            const state = yield* SubscriptionRef.get(stateRef)
            if (
              Option.isNone(state.snapshot.maybeActiveProgram) ||
              Option.isNone(state.maybeScope)
            ) {
              return yield* new SubjectScopedProgramInactive({
                lifecycle: state.snapshot.lifecycle._tag,
              })
            }
            const active = state.snapshot.maybeActiveProgram.value
            const scope = state.maybeScope.value
            const fiber = yield* Effect.forkIn(use(active), scope)
            return { active, fiber, scope }
          }),
        )
        .pipe(
          Effect.flatMap(({ active, fiber, scope }) =>
            runActiveProgram(active, scope, fiber),
          ),
        )

    const shutdown = transitionSemaphore
      .withPermit(
        Effect.gen(function* () {
          const maybeScope = yield* clearCurrentProgram(
            InactiveSubjectScopedProgram.make({}),
            Option.none(),
          )
          yield* closeMaybeScope(maybeScope)
        }),
      )
      .pipe(Effect.andThen(Scope.close(allocationParentScope, Exit.void)))

    const startSignOut = transitionSemaphore.withPermit(
      Effect.gen(function* () {
        const currentState = yield* SubscriptionRef.get(stateRef)
        if (
          currentState.snapshot.lifecycle._tag ===
          'SigningOutSubjectScopedProgram'
        ) {
          return yield* new SubjectScopedProgramSignOutInProgress({
            generation: currentState.snapshot.lifecycle.generation,
          })
        }
        const generation = currentState.generation + 1
        const maybeScope = yield* clearCurrentProgram(
          SigningOutSubjectScopedProgram.make({ generation }),
          Option.none(),
        )
        yield* closeMaybeScope(maybeScope)
        const fiber = yield* Effect.forkIn(
          config.signOut(),
          allocationParentScope,
        )
        return { fiber, generation }
      }),
    )

    const finishSignOut = (
      running: RunningSubjectScopedProgramSignOut<SignOutError>,
    ): Effect.Effect<
      Option.Option<
        RunningSubjectScopedProgramAllocation<
          Program,
          ProgramSnapshot,
          AllocationError
        >
      >,
      never,
      AllocationRequirements
    > =>
      transitionSemaphore.withPermit(
        Effect.gen(function* () {
          const state = yield* SubscriptionRef.get(stateRef)
          if (
            state.snapshot.lifecycle._tag !==
              'SigningOutSubjectScopedProgram' ||
            state.snapshot.lifecycle.generation !== running.generation
          ) {
            return Option.none()
          }
          const maybeDeferredSubjectId = state.maybeDeferredSubjectId
          yield* SubscriptionRef.update(stateRef, current => ({
            ...current,
            maybeDeferredSubjectId: Option.none(),
            maybeSubjectId: Option.none(),
            snapshot: {
              lifecycle: InactiveSubjectScopedProgram.make({}),
              maybeActiveProgram: Option.none(),
            },
          }))
          if (Option.isNone(maybeDeferredSubjectId)) {
            return Option.none()
          }
          const transition = yield* beginTransitionWithPermit(
            maybeDeferredSubjectId.value,
            false,
          )
          return yield* startAllocationWithPermit(transition)
        }),
      )

    const superviseDeferredAllocation = (
      maybeDeferredAllocation: Option.Option<
        RunningSubjectScopedProgramAllocation<
          Program,
          ProgramSnapshot,
          AllocationError
        >
      >,
    ): Effect.Effect<void, never, AllocationRequirements> =>
      Option.match(maybeDeferredAllocation, {
        onNone: () => Effect.void,
        onSome: deferredAllocation =>
          Effect.asVoid(
            Effect.forkIn(
              runAllocation(deferredAllocation).pipe(
                Effect.catch(() => Effect.void),
              ),
              allocationParentScope,
            ),
          ),
      })

    const signOut = Effect.gen(function* () {
      const running = yield* startSignOut
      const adapterExit = yield* Effect.onInterrupt(
        Fiber.await(running.fiber),
        () =>
          Effect.asVoid(Fiber.interrupt(running.fiber)).pipe(
            Effect.andThen(finishSignOut(running)),
            Effect.flatMap(superviseDeferredAllocation),
          ),
      )
      const maybeDeferredAllocation = yield* finishSignOut(running)
      yield* superviseDeferredAllocation(maybeDeferredAllocation)
      return yield* Exit.match(adapterExit, {
        onFailure: Effect.failCause,
        onSuccess: () => Effect.void,
      })
    })

    const service: SubjectScopedProgram<
      Program,
      ProgramSnapshot,
      AllocationError,
      AllocationRequirements,
      SignOutError,
      SignOutRequirements
    > = {
      read,
      reconcileAuthenticatedSubject: maybeSubjectId =>
        runTransition(maybeSubjectId, false),
      refreshAuthenticatedSubject,
      shutdown,
      signOut,
      snapshots: SubscriptionRef.changes(stateRef).pipe(
        Stream.map(state => state.snapshot),
      ),
      withActiveProgram,
    }

    yield* Effect.addFinalizer(() => shutdown)
    return service
  })

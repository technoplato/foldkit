import {
  Cause,
  Effect,
  Exit,
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

/** Every credential-free phase of an authenticated subject's Program lifecycle. */
export const SubjectScopedProgramLifecycle = S.Union([
  InactiveSubjectScopedProgram,
  AllocatingSubjectScopedProgram,
  ActiveSubjectScopedProgram,
  FailedSubjectScopedProgram,
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
  ) => Effect.Effect<void, AllocationError, AllocationRequirements>
  refreshAuthenticatedSubject: Effect.Effect<
    void,
    AllocationError,
    AllocationRequirements
  >
  shutdown: Effect.Effect<void>
  signOut: Effect.Effect<void, SignOutError, SignOutRequirements>
  snapshots: Stream.Stream<
    SubjectScopedProgramSnapshot<Program, ProgramSnapshot>
  >
}>

type SubjectScopedProgramInternalState<Program, ProgramSnapshot> = Readonly<{
  generation: number
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
  | AllocateSubjectScopedProgram<ProgramSnapshot>

const initialInternalState = <
  Program,
  ProgramSnapshot,
>(): SubjectScopedProgramInternalState<Program, ProgramSnapshot> => ({
  generation: 0,
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

    const beginTransition = (
      maybeSubjectId: Option.Option<string>,
      isRefresh: boolean,
    ): Effect.Effect<SubjectScopedProgramTransition<ProgramSnapshot>> =>
      transitionSemaphore.withPermit(
        Effect.gen(function* () {
          const currentState = yield* SubscriptionRef.get(stateRef)
          if (
            !isRefresh &&
            hasSameSubject(currentState.maybeSubjectId, maybeSubjectId)
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
        }),
      )

    const completeAllocation = (
      transition: AllocateSubjectScopedProgram<ProgramSnapshot>,
      program: Program,
    ): Effect.Effect<void> =>
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
        }
      })

    const failAllocation = (
      transition: AllocateSubjectScopedProgram<ProgramSnapshot>,
      cause: Cause.Cause<AllocationError>,
    ): Effect.Effect<void, AllocationError> =>
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
      })

    const runTransition = (
      maybeSubjectId: Option.Option<string>,
      isRefresh: boolean,
    ): Effect.Effect<void, AllocationError, AllocationRequirements> =>
      Effect.gen(function* () {
        const transition = yield* beginTransition(maybeSubjectId, isRefresh)
        if (transition._tag !== 'AllocateSubjectScopedProgram') {
          return
        }
        yield* Scope.provide(transition.scope)(
          config.allocateProgram(transition.context),
        ).pipe(
          Effect.matchCauseEffect({
            onFailure: cause => failAllocation(transition, cause),
            onSuccess: program => completeAllocation(transition, program),
          }),
        )
      })

    const read = SubscriptionRef.get(stateRef).pipe(
      Effect.map(state => state.snapshot),
    )

    const shutdown = transitionSemaphore.withPermit(
      Effect.gen(function* () {
        const maybeScope = yield* clearCurrentProgram(
          InactiveSubjectScopedProgram.make({}),
          Option.none(),
        )
        yield* closeMaybeScope(maybeScope)
      }),
    )

    const signOut = transitionSemaphore.withPermit(
      Effect.gen(function* () {
        const maybeScope = yield* clearCurrentProgram(
          InactiveSubjectScopedProgram.make({}),
          Option.none(),
        )
        yield* closeMaybeScope(maybeScope)
        yield* config.signOut()
      }),
    )

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
      refreshAuthenticatedSubject: SubscriptionRef.get(stateRef).pipe(
        Effect.flatMap(state => {
          const maybeSubjectId = subjectIdForLifecycle(state.snapshot.lifecycle)
          return runTransition(maybeSubjectId, true)
        }),
      ),
      shutdown,
      signOut,
      snapshots: SubscriptionRef.changes(stateRef).pipe(
        Stream.map(state => state.snapshot),
      ),
    }

    yield* Effect.addFinalizer(() =>
      shutdown.pipe(
        Effect.ensuring(Scope.close(allocationParentScope, Exit.void)),
      ),
    )
    return service
  })

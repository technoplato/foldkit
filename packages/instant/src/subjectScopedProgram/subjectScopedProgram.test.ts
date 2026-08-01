import {
  Data,
  Deferred,
  Effect,
  Fiber,
  Option,
  Schema as S,
  Stream,
} from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  type SubjectScopedProgram,
  type SubjectScopedProgramAllocationContext,
  makeSubjectScopedProgram,
} from './subjectScopedProgram.js'

const TestProgram = S.Struct({ subjectId: S.NonEmptyString })
type TestProgram = typeof TestProgram.Type

class AllocationFailure extends Data.TaggedError('AllocationFailure')<{
  readonly subjectId: string
}> {}

class SignOutFailure extends Data.TaggedError('SignOutFailure')<
  Readonly<{ operation: 'SignOut' }>
> {}

describe('subject-scoped Program', () => {
  it.effect(
    'clears subject A before closing its Scope and closes it before allocating subject B',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const trace: Array<string> = []
          const releaseStarted = yield* Deferred.make<void>()
          const releaseAllowed = yield* Deferred.make<void>()
          const serviceReady =
            yield* Deferred.make<SubjectScopedProgram<TestProgram, string>>()
          const service = yield* makeSubjectScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.gen(function* () {
                trace.push(`allocate:${context.subjectId}`)
                if (context.subjectId === 'subject-a') {
                  yield* Effect.addFinalizer(() =>
                    Effect.gen(function* () {
                      const readyService = yield* Deferred.await(serviceReady)
                      const snapshot = yield* readyService.read
                      trace.push(`close:${context.subjectId}`)
                      expect(snapshot.lifecycle).toMatchObject({
                        _tag: 'AllocatingSubjectScopedProgram',
                        subjectId: 'subject-b',
                      })
                      expect(Option.isNone(snapshot.maybeActiveProgram)).toBe(
                        true,
                      )
                      yield* Deferred.succeed(releaseStarted, undefined)
                      yield* Deferred.await(releaseAllowed)
                    }),
                  )
                }
                yield* context.publishProgramSnapshot(
                  `snapshot:${context.subjectId}`,
                )
                return TestProgram.make({ subjectId: context.subjectId })
              }),
            signOut: () => Effect.void,
          })
          yield* Deferred.succeed(serviceReady, service)

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          const replacement = yield* Effect.forkChild(
            service.reconcileAuthenticatedSubject(Option.some('subject-b')),
          )
          yield* Deferred.await(releaseStarted)

          expect(trace).toStrictEqual(['allocate:subject-a', 'close:subject-a'])
          yield* Deferred.succeed(releaseAllowed, undefined)
          yield* Fiber.join(replacement)

          expect(trace).toStrictEqual([
            'allocate:subject-a',
            'close:subject-a',
            'allocate:subject-b',
          ])
          const snapshot = yield* service.read
          expect(snapshot.lifecycle).toMatchObject({
            _tag: 'ActiveSubjectScopedProgram',
            subjectId: 'subject-b',
          })
        }),
      ),
  )

  it.effect('closes the active Scope before invoking adapter sign-out', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const trace: Array<string> = []
        const service = yield* makeSubjectScopedProgram<TestProgram, string>({
          allocateProgram: context =>
            Effect.gen(function* () {
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  trace.push(`close:${context.subjectId}`)
                }),
              )
              return TestProgram.make({ subjectId: context.subjectId })
            }),
          signOut: () =>
            Effect.sync(() => {
              trace.push('adapter-sign-out')
            }),
        })

        yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
        trace.splice(0)
        yield* service.signOut

        expect(trace).toStrictEqual(['close:subject-a', 'adapter-sign-out'])
        const snapshot = yield* service.read
        expect(snapshot.lifecycle._tag).toBe('InactiveSubjectScopedProgram')
        expect(Option.isNone(snapshot.maybeActiveProgram)).toBe(true)
      }),
    ),
  )

  it.effect(
    'queues the latest authenticated subject while sign-out owns the lifecycle',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const signOutStarted = yield* Deferred.make<void>()
          const signOutAllowed = yield* Deferred.make<void>()
          const service = yield* makeSubjectScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.succeed(
                TestProgram.make({ subjectId: context.subjectId }),
              ),
            signOut: () =>
              Effect.gen(function* () {
                yield* Deferred.succeed(signOutStarted, undefined)
                yield* Deferred.await(signOutAllowed)
              }),
          })

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          const firstSignOut = yield* Effect.forkChild(service.signOut)
          yield* Deferred.await(signOutStarted)
          expect((yield* service.read).lifecycle._tag).toBe(
            'SigningOutSubjectScopedProgram',
          )

          const concurrent = yield* Effect.flip(service.signOut)
          expect(concurrent._tag).toBe('SubjectScopedProgramSignOutInProgress')
          yield* service.reconcileAuthenticatedSubject(Option.some('subject-b'))
          const activeSubjectB = yield* Effect.forkChild(
            Stream.runHead(
              Stream.filter(
                service.snapshots,
                snapshot =>
                  snapshot.lifecycle._tag === 'ActiveSubjectScopedProgram' &&
                  snapshot.lifecycle.subjectId === 'subject-b',
              ),
            ),
          )

          yield* Deferred.succeed(signOutAllowed, undefined)
          yield* Fiber.join(firstSignOut)
          const maybeSnapshot = yield* Fiber.join(activeSubjectB)

          expect(Option.isSome(maybeSnapshot)).toBe(true)
          expect((yield* service.read).lifecycle).toMatchObject({
            _tag: 'ActiveSubjectScopedProgram',
            subjectId: 'subject-b',
          })
        }),
      ),
  )

  it.effect('settles SigningOut when its caller is interrupted', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const signOutStarted = yield* Deferred.make<void>()
        const adapterInterrupted = yield* Deferred.make<void>()
        const service = yield* makeSubjectScopedProgram<TestProgram, string>({
          allocateProgram: context =>
            Effect.succeed(TestProgram.make({ subjectId: context.subjectId })),
          signOut: () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(signOutStarted, undefined)
              yield* Effect.never
            }).pipe(
              Effect.ensuring(Deferred.succeed(adapterInterrupted, undefined)),
            ),
        })

        yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
        const signOut = yield* Effect.forkChild(service.signOut)
        yield* Deferred.await(signOutStarted)
        yield* Fiber.interrupt(signOut)
        yield* Deferred.await(adapterInterrupted)

        expect((yield* service.read).lifecycle._tag).toBe(
          'InactiveSubjectScopedProgram',
        )
      }),
    ),
  )

  it.effect('settles Allocating when its caller is interrupted', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const allocationStarted = yield* Deferred.make<void>()
        const allocationClosed = yield* Deferred.make<void>()
        const service = yield* makeSubjectScopedProgram<TestProgram, string>({
          allocateProgram: () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(allocationStarted, undefined)
              yield* Effect.never
              return TestProgram.make({ subjectId: 'unreachable' })
            }).pipe(
              Effect.ensuring(Deferred.succeed(allocationClosed, undefined)),
            ),
          signOut: () => Effect.void,
        })

        const allocation = yield* Effect.forkChild(
          service.reconcileAuthenticatedSubject(Option.some('subject-a')),
        )
        yield* Deferred.await(allocationStarted)
        yield* Fiber.interrupt(allocation)
        yield* Deferred.await(allocationClosed)

        expect((yield* service.read).lifecycle).toMatchObject({
          _tag: 'FailedSubjectScopedProgram',
          subjectId: 'subject-a',
        })
      }),
    ),
  )

  it.effect(
    'interrupts active Program work before subject replacement and rejects work after the fence',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const trace: Array<string> = []
          const actionStarted = yield* Deferred.make<void>()
          const actionAllowed = yield* Deferred.make<void>()
          const service = yield* makeSubjectScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.gen(function* () {
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => {
                    trace.push(`close:${context.subjectId}`)
                  }),
                )
                return TestProgram.make({ subjectId: context.subjectId })
              }),
            signOut: () => Effect.void,
          })

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          const action = yield* Effect.forkChild(
            service.withActiveProgram(active =>
              Effect.gen(function* () {
                trace.push(`action:${active.subjectId}:started`)
                yield* Deferred.succeed(actionStarted, undefined)
                yield* Deferred.await(actionAllowed)
                trace.push(`action:${active.subjectId}:finished`)
              }),
            ),
          )
          yield* Deferred.await(actionStarted)
          const replacement = yield* Effect.forkChild(
            service.reconcileAuthenticatedSubject(Option.some('subject-b')),
          )

          yield* Effect.yieldNow
          expect(trace).toStrictEqual([
            'action:subject-a:started',
            'close:subject-a',
          ])
          yield* Deferred.succeed(actionAllowed, undefined)
          const superseded = yield* Effect.flip(Fiber.join(action))
          yield* Fiber.join(replacement)

          expect(superseded._tag).toBe('SubjectScopedProgramSuperseded')
          expect(trace).toStrictEqual([
            'action:subject-a:started',
            'close:subject-a',
          ])
          const subjectId = yield* service.withActiveProgram(active =>
            Effect.succeed(active.subjectId),
          )
          expect(subjectId).toBe('subject-b')

          yield* service.reconcileAuthenticatedSubject(Option.none())
          const inactive = yield* Effect.flip(
            service.withActiveProgram(active =>
              Effect.succeed(active.subjectId),
            ),
          )
          expect(inactive._tag).toBe('SubjectScopedProgramInactive')
        }),
      ),
  )

  it.effect(
    'treats repeated same-subject observations as no-ops and refreshes only when requested',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const trace: Array<string> = []
          const service = yield* makeSubjectScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.gen(function* () {
                trace.push(`allocate:${context.subjectId}`)
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => {
                    trace.push(`close:${context.subjectId}`)
                  }),
                )
                return TestProgram.make({ subjectId: context.subjectId })
              }),
            signOut: () => Effect.void,
          })

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          const initialSnapshot = yield* service.read
          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          const unchangedSnapshot = yield* service.read

          expect(trace).toStrictEqual(['allocate:subject-a'])
          expect(unchangedSnapshot).toBe(initialSnapshot)

          yield* service.refreshAuthenticatedSubject

          expect(trace).toStrictEqual([
            'allocate:subject-a',
            'close:subject-a',
            'allocate:subject-a',
          ])
          expect((yield* service.read).lifecycle).toMatchObject({
            _tag: 'ActiveSubjectScopedProgram',
            generation: 2,
            subjectId: 'subject-a',
          })
        }),
      ),
  )

  it.effect(
    'refreshes the subject current when its transition permit begins',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const trace: Array<string> = []
          const actionStarted = yield* Deferred.make<void>()
          const actionAllowed = yield* Deferred.make<void>()
          const service = yield* makeSubjectScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.sync(() => {
                trace.push(`allocate:${context.subjectId}`)
                return TestProgram.make({ subjectId: context.subjectId })
              }),
            signOut: () => Effect.void,
          })

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          const action = yield* Effect.forkChild(
            service.withActiveProgram(() =>
              Effect.gen(function* () {
                yield* Deferred.succeed(actionStarted, undefined)
                yield* Deferred.await(actionAllowed)
              }),
            ),
          )
          yield* Deferred.await(actionStarted)
          const replacement = yield* Effect.forkChild(
            service.reconcileAuthenticatedSubject(Option.some('subject-b')),
          )
          const refresh = yield* Effect.forkChild(
            Effect.yieldNow.pipe(
              Effect.andThen(Effect.yieldNow),
              Effect.andThen(service.refreshAuthenticatedSubject),
            ),
          )
          yield* Effect.yieldNow

          yield* Deferred.succeed(actionAllowed, undefined)
          const superseded = yield* Effect.flip(Fiber.join(action))
          yield* Fiber.join(replacement)
          yield* Fiber.join(refresh)

          expect(superseded._tag).toBe('SubjectScopedProgramSuperseded')
          expect(trace).toStrictEqual([
            'allocate:subject-a',
            'allocate:subject-b',
            'allocate:subject-b',
          ])
          expect((yield* service.read).lifecycle).toMatchObject({
            _tag: 'ActiveSubjectScopedProgram',
            generation: 3,
            subjectId: 'subject-b',
          })
        }),
      ),
  )

  it.effect('publishes allocation failure only for the current subject', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const trace: Array<string> = []
        const service = yield* makeSubjectScopedProgram<
          TestProgram,
          string,
          AllocationFailure
        >({
          allocateProgram: context =>
            Effect.gen(function* () {
              trace.push(`allocate:${context.subjectId}`)
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  trace.push(`close:${context.subjectId}`)
                }),
              )
              return yield* Effect.fail(
                new AllocationFailure({ subjectId: context.subjectId }),
              )
            }),
          signOut: () => Effect.void,
        })

        const failure = yield* Effect.flip(
          service.reconcileAuthenticatedSubject(Option.some('subject-a')),
        )

        expect(failure).toEqual(
          new AllocationFailure({ subjectId: 'subject-a' }),
        )
        expect(trace).toStrictEqual(['allocate:subject-a', 'close:subject-a'])
        const snapshot = yield* service.read
        expect(snapshot.lifecycle).toMatchObject({
          _tag: 'FailedSubjectScopedProgram',
          subjectId: 'subject-a',
        })
        expect(Option.isNone(snapshot.maybeActiveProgram)).toBe(true)
      }),
    ),
  )

  it.effect(
    'retries a failed allocation for the same authenticated subject',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          let allocationCount = 0
          const service = yield* makeSubjectScopedProgram<
            TestProgram,
            string,
            AllocationFailure
          >({
            allocateProgram: context =>
              Effect.suspend(() => {
                allocationCount += 1
                return allocationCount === 1
                  ? Effect.fail(
                      new AllocationFailure({ subjectId: context.subjectId }),
                    )
                  : Effect.succeed(
                      TestProgram.make({ subjectId: context.subjectId }),
                    )
              }),
            signOut: () => Effect.void,
          })

          yield* Effect.flip(
            service.reconcileAuthenticatedSubject(Option.some('subject-a')),
          )
          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))

          expect(allocationCount).toBe(2)
          expect((yield* service.read).lifecycle).toMatchObject({
            _tag: 'ActiveSubjectScopedProgram',
            subjectId: 'subject-a',
          })
        }),
      ),
  )

  it.effect(
    'can restore the authenticated subject after adapter sign-out fails',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          let allocationCount = 0
          const service = yield* makeSubjectScopedProgram<
            TestProgram,
            string,
            never,
            never,
            SignOutFailure
          >({
            allocateProgram: context =>
              Effect.sync(() => {
                allocationCount += 1
                return TestProgram.make({ subjectId: context.subjectId })
              }),
            signOut: () =>
              Effect.fail(new SignOutFailure({ operation: 'SignOut' })),
          })

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          yield* Effect.flip(service.signOut)
          expect((yield* service.read).lifecycle._tag).toBe(
            'InactiveSubjectScopedProgram',
          )

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          expect(allocationCount).toBe(2)
          expect((yield* service.read).lifecycle).toMatchObject({
            _tag: 'ActiveSubjectScopedProgram',
            subjectId: 'subject-a',
          })
        }),
      ),
  )

  it.effect(
    'suppresses late allocation completion and snapshot callbacks from an old generation',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const trace: Array<string> = []
          const allocationStarted = yield* Deferred.make<void>()
          const allocationAllowed = yield* Deferred.make<void>()
          const oldContext =
            yield* Deferred.make<
              SubjectScopedProgramAllocationContext<string>
            >()
          const service = yield* makeSubjectScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.gen(function* () {
                trace.push(`allocate:${context.subjectId}`)
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => {
                    trace.push(`close:${context.subjectId}`)
                  }),
                )
                if (context.subjectId === 'subject-a') {
                  yield* Deferred.succeed(oldContext, context)
                  yield* Deferred.succeed(allocationStarted, undefined)
                  yield* Deferred.await(allocationAllowed)
                } else {
                  yield* context.publishProgramSnapshot('snapshot-b')
                }
                return TestProgram.make({ subjectId: context.subjectId })
              }),
            signOut: () => Effect.void,
          })

          const oldAllocation = yield* Effect.forkChild(
            service.reconcileAuthenticatedSubject(Option.some('subject-a')),
          )
          yield* Deferred.await(allocationStarted)
          const capturedOldContext = yield* Deferred.await(oldContext)
          yield* service.reconcileAuthenticatedSubject(Option.some('subject-b'))
          yield* capturedOldContext.publishProgramSnapshot('late-snapshot-a')
          yield* Deferred.succeed(allocationAllowed, undefined)
          const superseded = yield* Effect.flip(Fiber.join(oldAllocation))

          expect(superseded._tag).toBe('SubjectScopedProgramSuperseded')
          expect(trace).toStrictEqual([
            'allocate:subject-a',
            'close:subject-a',
            'allocate:subject-b',
          ])
          const snapshot = yield* service.read
          expect(snapshot.lifecycle).toMatchObject({
            _tag: 'ActiveSubjectScopedProgram',
            subjectId: 'subject-b',
          })
          expect(Option.isSome(snapshot.maybeActiveProgram)).toBe(true)
          if (Option.isSome(snapshot.maybeActiveProgram)) {
            expect(snapshot.maybeActiveProgram.value.program).toEqual(
              TestProgram.make({ subjectId: 'subject-b' }),
            )
            expect(
              snapshot.maybeActiveProgram.value.maybeProgramSnapshot,
            ).toEqual(Option.some('snapshot-b'))
          }
        }),
      ),
  )
})

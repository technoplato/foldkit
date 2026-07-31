import { Data, Deferred, Effect, Fiber, Option, Schema as S } from 'effect'
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
          yield* Fiber.join(oldAllocation)

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

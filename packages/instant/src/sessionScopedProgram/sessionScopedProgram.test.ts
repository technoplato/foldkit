import {
  Array as Array_,
  Data,
  Deferred,
  Effect,
  Fiber,
  Option,
  Queue,
  Schema as S,
  Stream,
} from 'effect'
import { Synchronization } from 'foldkit'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  InstantProgramSessionRecord,
  instantProgramProtocolVersion,
} from '../schema/index.js'
import {
  AuthenticatedMissing,
  AuthenticatedSession,
  type ProgramSessionObservation,
  type SessionScopedProgram,
  type SessionScopedProgramAllocationContext,
  TransportUnavailable,
  makeSessionScopedProgram,
} from './sessionScopedProgram.js'

const TestProgram = S.Struct({
  sessionId: S.NonEmptyString,
  subjectId: S.NonEmptyString,
})
type TestProgram = typeof TestProgram.Type

class InvalidTestSession extends Data.TaggedError('InvalidTestSession')<{
  readonly reason: 'Malformed' | 'WrongSubject'
}> {}

class TestAllocationFailure extends Data.TaggedError(
  'TestAllocationFailure',
)<{}> {}

const mirrorPolicy = Synchronization.SessionPolicy.make({
  generation: 0,
  mode: Synchronization.Mirror.make({}),
})

const makeSession = (
  subjectId: string,
  sessionId: string,
  createdAtMs = 1_753_825_000_000,
): InstantProgramSessionRecord =>
  InstantProgramSessionRecord.make({
    authorityProcessorId: 'processor-authority',
    createdAtMs,
    id: sessionId,
    isRevoked: false,
    processorRoomId: 'room-b16c34a61a9b45a29f8b180035bdc821',
    programId: 'counter',
    programVersion: 1,
    protocolVersion: instantProgramProtocolVersion,
    sessionId,
    sessionPolicy: mirrorPolicy,
    subjectId,
  })

const validSession = (
  session: InstantProgramSessionRecord,
  subjectId: string,
): Effect.Effect<InstantProgramSessionRecord, InvalidTestSession> => {
  if (session.programId === 'malformed') {
    return Effect.fail(new InvalidTestSession({ reason: 'Malformed' }))
  } else if (session.subjectId !== subjectId) {
    return Effect.fail(new InvalidTestSession({ reason: 'WrongSubject' }))
  } else {
    return Effect.succeed(session)
  }
}

const validSessionOrDie = (
  session: InstantProgramSessionRecord,
  subjectId: string,
): Effect.Effect<InstantProgramSessionRecord> =>
  validSession(session, subjectId).pipe(Effect.orDie)

const awaitActiveSession = (
  service: SessionScopedProgram<TestProgram, string>,
  sessionId: string,
): Effect.Effect<void> =>
  service.snapshots.pipe(
    Stream.filter(
      snapshot =>
        snapshot.lifecycle._tag === 'ActiveSessionScopedProgram' &&
        snapshot.lifecycle.session.sessionId === sessionId,
    ),
    Stream.runHead,
    Effect.asVoid,
  )

const awaitValidationFailure = (
  service: SessionScopedProgram<TestProgram, string>,
): Effect.Effect<void> =>
  service.snapshots.pipe(
    Stream.filter(
      snapshot =>
        snapshot.lifecycle._tag === 'FailedSessionScopedProgram' &&
        snapshot.lifecycle.failure === 'ValidateSession',
    ),
    Stream.runHead,
    Effect.asVoid,
  )

const awaitAllocationFailure = (
  service: SessionScopedProgram<TestProgram, string>,
): Effect.Effect<void> =>
  service.snapshots.pipe(
    Stream.filter(
      snapshot =>
        snapshot.lifecycle._tag === 'FailedSessionScopedProgram' &&
        snapshot.lifecycle.failure === 'AllocateProgram',
    ),
    Stream.runHead,
    Effect.asVoid,
  )

describe('session-scoped Program', () => {
  it.effect(
    'clears and closes the old allocation before reallocating when any session field changes',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const observations =
            yield* Queue.unbounded<ProgramSessionObservation>()
          const trace: Array<string> = []
          const activeA = yield* Deferred.make<void>()
          const activeB = yield* Deferred.make<void>()
          const serviceReady =
            yield* Deferred.make<SessionScopedProgram<TestProgram, string>>()
          const sessionA = makeSession('subject-a', 'session-a')
          const sessionB = InstantProgramSessionRecord.make({
            ...sessionA,
            createdAtMs: sessionA.createdAtMs + 1,
          })
          const service = yield* makeSessionScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.gen(function* () {
                trace.push(`allocate:${context.session.createdAtMs}`)
                yield* Effect.addFinalizer(() =>
                  Effect.gen(function* () {
                    const readyService = yield* Deferred.await(serviceReady)
                    const snapshot = yield* readyService.read
                    trace.push(`close:${context.session.createdAtMs}`)
                    if (context.session.createdAtMs === sessionA.createdAtMs) {
                      expect(snapshot.lifecycle).toMatchObject({
                        _tag: 'AllocatingSessionScopedProgram',
                        session: { createdAtMs: sessionB.createdAtMs },
                      })
                    }
                  }),
                )
                if (context.session.createdAtMs === sessionA.createdAtMs) {
                  yield* Deferred.succeed(activeA, undefined)
                } else {
                  yield* Deferred.succeed(activeB, undefined)
                }
                return TestProgram.make({
                  sessionId: context.session.sessionId,
                  subjectId: context.subjectId,
                })
              }),
            observeSession: () => Stream.fromQueue(observations),
            signOut: () => Effect.void,
            validateSession: validSessionOrDie,
          })
          yield* Deferred.succeed(serviceReady, service)

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({ session: sessionA }),
          )
          yield* Deferred.await(activeA)
          yield* awaitActiveSession(service, 'session-a')
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({ session: sessionA }),
          )
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({ session: sessionB }),
          )
          yield* Deferred.await(activeB)
          yield* awaitActiveSession(service, 'session-a')

          expect(trace).toStrictEqual([
            `allocate:${sessionA.createdAtMs}`,
            `close:${sessionA.createdAtMs}`,
            `allocate:${sessionB.createdAtMs}`,
          ])
          const snapshot = yield* service.read
          expect(snapshot.lifecycle).toMatchObject({
            _tag: 'ActiveSessionScopedProgram',
            allocationGeneration: 3,
            session: { createdAtMs: sessionB.createdAtMs },
            subjectGeneration: 1,
          })
        }),
      ),
  )

  it.effect(
    'retains an active identity while transport is unavailable and fails closed for revocation or authenticated absence',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const observations =
            yield* Queue.unbounded<ProgramSessionObservation>()
          const allocationCount: Array<string> = []
          const firstActive = yield* Deferred.make<void>()
          const secondValidation = yield* Deferred.make<void>()
          const firstClosed = yield* Deferred.make<void>()
          const reallocated = yield* Deferred.make<void>()
          const session = makeSession('subject-a', 'session-a')
          const service = yield* makeSessionScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.gen(function* () {
                allocationCount.push(context.session.sessionId)
                yield* Effect.addFinalizer(() =>
                  Deferred.succeed(firstClosed, undefined),
                )
                yield* Deferred.succeed(firstActive, undefined)
                if (allocationCount.length === 2) {
                  yield* Deferred.succeed(reallocated, undefined)
                }
                return TestProgram.make({
                  sessionId: context.session.sessionId,
                  subjectId: context.subjectId,
                })
              }),
            observeSession: () => Stream.fromQueue(observations),
            signOut: () => Effect.void,
            validateSession: (candidate, subjectId) =>
              Effect.gen(function* () {
                if (allocationCount.length === 1) {
                  yield* Deferred.succeed(secondValidation, undefined)
                }
                return yield* validSession(candidate, subjectId).pipe(
                  Effect.orDie,
                )
              }),
          })

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({ session }),
          )
          yield* Deferred.await(firstActive)
          yield* awaitActiveSession(service, 'session-a')
          const activeSnapshot = yield* service.read
          yield* Queue.offer(observations, TransportUnavailable.make({}))
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({ session }),
          )
          yield* Deferred.await(secondValidation)

          expect((yield* service.read).maybeActiveProgram).toEqual(
            activeSnapshot.maybeActiveProgram,
          )
          expect(allocationCount).toStrictEqual(['session-a'])

          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({
              session: InstantProgramSessionRecord.make({
                ...session,
                isRevoked: true,
              }),
            }),
          )
          yield* Deferred.await(firstClosed)
          const revokedSnapshot = yield* service.read
          expect(revokedSnapshot.lifecycle).toMatchObject({
            _tag: 'ObservingSessionScopedProgram',
          })
          expect(Option.isNone(revokedSnapshot.maybeActiveProgram)).toBe(true)

          yield* Queue.offer(observations, AuthenticatedMissing.make({}))
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({ session }),
          )
          yield* Deferred.await(reallocated)
          yield* awaitActiveSession(service, 'session-a')
          const recoveredSnapshot = yield* service.read
          expect(recoveredSnapshot.lifecycle).toMatchObject({
            _tag: 'ActiveSessionScopedProgram',
            allocationGeneration: 5,
          })
          expect(allocationCount).toStrictEqual(['session-a', 'session-a'])
        }),
      ),
  )

  it.effect(
    'uses app validation for malformed and wrong-subject records and recovers only from a valid observation',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const observations =
            yield* Queue.unbounded<ProgramSessionObservation>()
          const malformedValidated = yield* Deferred.make<void>()
          const wrongSubjectValidated = yield* Deferred.make<void>()
          const active = yield* Deferred.make<void>()
          const session = makeSession('subject-a', 'session-a')
          const service = yield* makeSessionScopedProgram<
            TestProgram,
            string,
            never,
            never,
            InvalidTestSession
          >({
            allocateProgram: context =>
              Effect.gen(function* () {
                yield* Deferred.succeed(active, undefined)
                return TestProgram.make({
                  sessionId: context.session.sessionId,
                  subjectId: context.subjectId,
                })
              }),
            observeSession: () => Stream.fromQueue(observations),
            signOut: () => Effect.void,
            validateSession: (candidate, subjectId) =>
              Effect.gen(function* () {
                if (candidate.programId === 'malformed') {
                  yield* Deferred.succeed(malformedValidated, undefined)
                } else if (candidate.subjectId !== subjectId) {
                  yield* Deferred.succeed(wrongSubjectValidated, undefined)
                }
                return yield* validSession(candidate, subjectId)
              }),
          })

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({
              session: InstantProgramSessionRecord.make({
                ...session,
                programId: 'malformed',
              }),
            }),
          )
          yield* Deferred.await(malformedValidated)
          yield* awaitValidationFailure(service)
          expect((yield* service.read).lifecycle).toMatchObject({
            _tag: 'FailedSessionScopedProgram',
            failure: 'ValidateSession',
          })

          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({
              session: makeSession('subject-b', 'session-wrong-subject'),
            }),
          )
          yield* Deferred.await(wrongSubjectValidated)
          yield* awaitValidationFailure(service)
          expect((yield* service.read).lifecycle).toMatchObject({
            _tag: 'FailedSessionScopedProgram',
            failure: 'ValidateSession',
          })

          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({ session }),
          )
          yield* Deferred.await(active)
          yield* awaitActiveSession(service, 'session-a')
          expect((yield* service.read).lifecycle).toMatchObject({
            _tag: 'ActiveSessionScopedProgram',
            session: { sessionId: 'session-a' },
          })
        }),
      ),
  )

  it.effect(
    'suppresses late snapshot callbacks from a replaced session allocation',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const observations =
            yield* Queue.unbounded<ProgramSessionObservation>()
          const oldContext =
            yield* Deferred.make<
              SessionScopedProgramAllocationContext<string>
            >()
          const activeA = yield* Deferred.make<void>()
          const activeB = yield* Deferred.make<void>()
          const sessionA = makeSession('subject-a', 'session-a')
          const sessionB = makeSession('subject-a', 'session-b')
          const service = yield* makeSessionScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.gen(function* () {
                if (context.session.sessionId === 'session-a') {
                  yield* Deferred.succeed(oldContext, context)
                  yield* context.publishProgramSnapshot('snapshot-a')
                  yield* Deferred.succeed(activeA, undefined)
                } else {
                  yield* context.publishProgramSnapshot('snapshot-b')
                  yield* Deferred.succeed(activeB, undefined)
                }
                return TestProgram.make({
                  sessionId: context.session.sessionId,
                  subjectId: context.subjectId,
                })
              }),
            observeSession: () => Stream.fromQueue(observations),
            signOut: () => Effect.void,
            validateSession: validSessionOrDie,
          })

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({ session: sessionA }),
          )
          yield* Deferred.await(activeA)
          yield* awaitActiveSession(service, 'session-a')
          const capturedOldContext = yield* Deferred.await(oldContext)
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({ session: sessionB }),
          )
          yield* Deferred.await(activeB)
          yield* awaitActiveSession(service, 'session-b')
          yield* capturedOldContext.publishProgramSnapshot('late-snapshot-a')

          const snapshot = yield* service.read
          expect(snapshot.lifecycle).toMatchObject({
            _tag: 'ActiveSessionScopedProgram',
            session: { sessionId: 'session-b' },
          })
          expect(Option.isSome(snapshot.maybeActiveProgram)).toBe(true)
          if (Option.isSome(snapshot.maybeActiveProgram)) {
            expect(
              snapshot.maybeActiveProgram.value.maybeProgramSnapshot,
            ).toEqual(Option.some('snapshot-b'))
          }
        }),
      ),
  )

  it.effect(
    'interrupts a pending allocation before starting its replacement',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const observations =
            yield* Queue.unbounded<ProgramSessionObservation>()
          const pendingContext =
            yield* Deferred.make<
              SessionScopedProgramAllocationContext<string>
            >()
          const pendingClosed = yield* Deferred.make<void>()
          const neverComplete = yield* Deferred.make<void>()
          const replacementActive = yield* Deferred.make<void>()
          const service = yield* makeSessionScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.gen(function* () {
                if (context.session.sessionId === 'session-pending') {
                  yield* Effect.addFinalizer(() =>
                    Deferred.succeed(pendingClosed, undefined),
                  )
                  yield* Deferred.succeed(pendingContext, context)
                  yield* Deferred.await(neverComplete)
                } else {
                  yield* context.publishProgramSnapshot('snapshot-replacement')
                  yield* Deferred.succeed(replacementActive, undefined)
                }
                return TestProgram.make({
                  sessionId: context.session.sessionId,
                  subjectId: context.subjectId,
                })
              }),
            observeSession: () => Stream.fromQueue(observations),
            signOut: () => Effect.void,
            validateSession: validSessionOrDie,
          })

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({
              session: makeSession('subject-a', 'session-pending'),
            }),
          )
          const capturedPendingContext = yield* Deferred.await(pendingContext)
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({
              session: makeSession('subject-a', 'session-replacement'),
            }),
          )
          yield* Deferred.await(pendingClosed)
          yield* Deferred.await(replacementActive)
          yield* awaitActiveSession(service, 'session-replacement')
          yield* capturedPendingContext.publishProgramSnapshot(
            'late-pending-snapshot',
          )

          const snapshot = yield* service.read
          expect(snapshot.lifecycle).toMatchObject({
            _tag: 'ActiveSessionScopedProgram',
            session: { sessionId: 'session-replacement' },
          })
          expect(Option.isSome(snapshot.maybeActiveProgram)).toBe(true)
          if (Option.isSome(snapshot.maybeActiveProgram)) {
            expect(
              snapshot.maybeActiveProgram.value.maybeProgramSnapshot,
            ).toEqual(Option.some('snapshot-replacement'))
          }
        }),
      ),
  )

  it.effect(
    'retries an identical session after its prior allocation failed',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const observations =
            yield* Queue.unbounded<ProgramSessionObservation>()
          const attempts: Array<string> = []
          const service = yield* makeSessionScopedProgram<
            TestProgram,
            string,
            never,
            never,
            never,
            never,
            TestAllocationFailure
          >({
            allocateProgram: context =>
              Effect.gen(function* () {
                const isFirstAttempt = Array_.isArrayEmpty(attempts)
                attempts.push(context.session.sessionId)
                if (isFirstAttempt) {
                  return yield* Effect.fail(new TestAllocationFailure())
                } else {
                  return TestProgram.make({
                    sessionId: context.session.sessionId,
                    subjectId: context.subjectId,
                  })
                }
              }),
            observeSession: () => Stream.fromQueue(observations),
            signOut: () => Effect.void,
            validateSession: validSessionOrDie,
          })
          const session = makeSession('subject-a', 'session-a')

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({ session }),
          )
          yield* awaitAllocationFailure(service)
          yield* Queue.offer(
            observations,
            AuthenticatedSession.make({ session }),
          )
          yield* awaitActiveSession(service, 'session-a')

          expect(attempts).toStrictEqual(['session-a', 'session-a'])
          expect((yield* service.read).lifecycle).toMatchObject({
            _tag: 'ActiveSessionScopedProgram',
            allocationGeneration: 3,
          })
        }),
      ),
  )

  it.effect(
    'replaces the subject observer and ignores late observations from the old subject',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const subjectAObservations =
            yield* Queue.unbounded<ProgramSessionObservation>()
          const subjectBObservations =
            yield* Queue.unbounded<ProgramSessionObservation>()
          const trace: Array<string> = []
          const observingB = yield* Deferred.make<void>()
          const activeA = yield* Deferred.make<void>()
          const activeB = yield* Deferred.make<void>()
          const service = yield* makeSessionScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.gen(function* () {
                trace.push(`allocate:${context.subjectId}`)
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => {
                    trace.push(`close-program:${context.subjectId}`)
                  }),
                )
                if (context.subjectId === 'subject-a') {
                  yield* Deferred.succeed(activeA, undefined)
                } else {
                  yield* Deferred.succeed(activeB, undefined)
                }
                return TestProgram.make({
                  sessionId: context.session.sessionId,
                  subjectId: context.subjectId,
                })
              }),
            observeSession: subjectId =>
              Stream.fromEffect(
                Effect.sync(() => {
                  trace.push(`observe:${subjectId}`)
                }),
              ).pipe(
                Stream.flatMap(() => {
                  if (subjectId === 'subject-a') {
                    return Stream.fromQueue(subjectAObservations)
                  } else {
                    return Stream.fromQueue(subjectBObservations)
                  }
                }),
                Stream.ensuring(
                  Effect.sync(() => {
                    trace.push(`close-observer:${subjectId}`)
                  }),
                ),
                Stream.tap(() => {
                  if (subjectId === 'subject-b') {
                    return Deferred.succeed(observingB, undefined)
                  } else {
                    return Effect.void
                  }
                }),
              ),
            signOut: () => Effect.void,
            validateSession: validSessionOrDie,
          })

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          yield* Queue.offer(
            subjectAObservations,
            AuthenticatedSession.make({
              session: makeSession('subject-a', 'session-a'),
            }),
          )
          yield* Deferred.await(activeA)
          yield* awaitActiveSession(service, 'session-a')
          yield* service.reconcileAuthenticatedSubject(Option.some('subject-b'))
          yield* Queue.offer(
            subjectAObservations,
            AuthenticatedSession.make({
              session: makeSession('subject-a', 'session-a-late'),
            }),
          )
          yield* Queue.offer(
            subjectBObservations,
            AuthenticatedSession.make({
              session: makeSession('subject-b', 'session-b'),
            }),
          )
          yield* Deferred.await(observingB)
          yield* Deferred.await(activeB)
          yield* awaitActiveSession(service, 'session-b')
          yield* service.reconcileAuthenticatedSubject(Option.some('subject-b'))

          expect(trace).toStrictEqual([
            'observe:subject-a',
            'allocate:subject-a',
            'close-program:subject-a',
            'close-observer:subject-a',
            'observe:subject-b',
            'allocate:subject-b',
          ])
          expect((yield* service.read).lifecycle).toMatchObject({
            _tag: 'ActiveSessionScopedProgram',
            subjectGeneration: 2,
            subjectId: 'subject-b',
          })
        }),
      ),
  )

  it.effect('closes the allocation and observer before adapter sign-out', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const observations = yield* Queue.unbounded<ProgramSessionObservation>()
        const trace: Array<string> = []
        const active = yield* Deferred.make<void>()
        const service = yield* makeSessionScopedProgram<TestProgram, string>({
          allocateProgram: context =>
            Effect.gen(function* () {
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  trace.push('close-program')
                }),
              )
              yield* Deferred.succeed(active, undefined)
              return TestProgram.make({
                sessionId: context.session.sessionId,
                subjectId: context.subjectId,
              })
            }),
          observeSession: () =>
            Stream.fromQueue(observations).pipe(
              Stream.ensuring(
                Effect.sync(() => {
                  trace.push('close-observer')
                }),
              ),
            ),
          signOut: () =>
            Effect.sync(() => {
              trace.push('adapter-sign-out')
            }),
          validateSession: validSessionOrDie,
        })

        yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
        yield* Queue.offer(
          observations,
          AuthenticatedSession.make({
            session: makeSession('subject-a', 'session-a'),
          }),
        )
        yield* Deferred.await(active)
        yield* awaitActiveSession(service, 'session-a')
        yield* service.signOut

        expect(trace).toStrictEqual([
          'close-program',
          'close-observer',
          'adapter-sign-out',
        ])
        const snapshot = yield* service.read
        expect(snapshot.lifecycle._tag).toBe('InactiveSessionScopedProgram')
        expect(Option.isNone(snapshot.maybeActiveProgram)).toBe(true)
      }),
    ),
  )

  it.effect(
    'does not let a refresh queued behind sign-out restart the replaced subject',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const subjectAObservations =
            yield* Queue.unbounded<ProgramSessionObservation>()
          const subjectBObservations =
            yield* Queue.unbounded<ProgramSessionObservation>()
          const trace: Array<string> = []
          const activeA = yield* Deferred.make<void>()
          const closeAStarted = yield* Deferred.make<void>()
          const allowCloseA = yield* Deferred.make<void>()
          const service = yield* makeSessionScopedProgram<TestProgram, string>({
            allocateProgram: context =>
              Effect.gen(function* () {
                if (context.subjectId === 'subject-a') {
                  yield* Effect.addFinalizer(() =>
                    Effect.gen(function* () {
                      trace.push('close-program:subject-a')
                      yield* Deferred.succeed(closeAStarted, undefined)
                      yield* Deferred.await(allowCloseA)
                    }),
                  )
                  yield* Deferred.succeed(activeA, undefined)
                }
                return TestProgram.make({
                  sessionId: context.session.sessionId,
                  subjectId: context.subjectId,
                })
              }),
            observeSession: subjectId =>
              Stream.fromEffect(
                Effect.sync(() => {
                  trace.push(`observe:${subjectId}`)
                }),
              ).pipe(
                Stream.flatMap(() => {
                  if (subjectId === 'subject-a') {
                    return Stream.fromQueue(subjectAObservations)
                  } else {
                    return Stream.fromQueue(subjectBObservations)
                  }
                }),
                Stream.ensuring(
                  Effect.sync(() => {
                    trace.push(`close-observer:${subjectId}`)
                  }),
                ),
              ),
            signOut: () =>
              Effect.sync(() => {
                trace.push('adapter-sign-out')
              }),
            validateSession: validSessionOrDie,
          })

          yield* service.reconcileAuthenticatedSubject(Option.some('subject-a'))
          yield* Queue.offer(
            subjectAObservations,
            AuthenticatedSession.make({
              session: makeSession('subject-a', 'session-a'),
            }),
          )
          yield* Deferred.await(activeA)
          yield* awaitActiveSession(service, 'session-a')

          const replacement = yield* Effect.forkChild(
            service.reconcileAuthenticatedSubject(Option.some('subject-b')),
          )
          yield* Deferred.await(closeAStarted)
          const signingOut = yield* Effect.forkChild(service.signOut)
          yield* Effect.yieldNow
          const refreshing = yield* Effect.forkChild(
            service.refreshAuthenticatedSubject,
          )
          yield* Effect.yieldNow
          yield* Deferred.succeed(allowCloseA, undefined)
          yield* Fiber.join(replacement)
          yield* Fiber.join(signingOut)
          yield* Fiber.join(refreshing)

          expect(Array_.last(trace)).toEqual(Option.some('adapter-sign-out'))
          const snapshot = yield* service.read
          expect(snapshot.lifecycle._tag).toBe('InactiveSessionScopedProgram')
          expect(Option.isNone(snapshot.maybeActiveProgram)).toBe(true)
        }),
      ),
  )
})

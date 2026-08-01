import { Deferred, Effect, Fiber } from 'effect'
import { Synchronization } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  InstantProgramSessionRecord,
  instantProgramProtocolVersion,
} from '@foldkit/instant'

import {
  hasSameAdmissionSequencerIdentity,
  replaceSessionAdmissionSequencer,
} from './authority.js'

const session = InstantProgramSessionRecord.make({
  authorityProcessorId: 'processor-authority',
  createdAtMs: 1,
  id: 'session-record-1',
  isRevoked: false,
  processorRoomId: 'room-4ec724f1c3584d679b8a3b88f470e372',
  programId: 'instant-counter',
  programVersion: 1,
  protocolVersion: instantProgramProtocolVersion,
  sessionId: 'session-1',
  sessionPolicy: Synchronization.legacyMirrorSessionPolicy(),
  subjectId: 'subject-1',
})

describe('admission sequencer supervision', () => {
  it('retains a fiber only while its trusted session identity is unchanged', () => {
    expect(
      hasSameAdmissionSequencerIdentity(
        session,
        InstantProgramSessionRecord.make({
          ...session,
          createdAtMs: 2,
          id: 'session-record-2',
        }),
      ),
    ).toBe(true)
    expect(
      hasSameAdmissionSequencerIdentity(
        session,
        InstantProgramSessionRecord.make({
          ...session,
          authorityProcessorId: 'processor-authority-rotated',
        }),
      ),
    ).toBe(false)
    expect(
      hasSameAdmissionSequencerIdentity(session, {
        ...session,
        protocolVersion: 3,
      }),
    ).toBe(false)
    expect(
      hasSameAdmissionSequencerIdentity(
        session,
        InstantProgramSessionRecord.make({
          ...session,
          isRevoked: true,
        }),
      ),
    ).toBe(false)
    expect(
      hasSameAdmissionSequencerIdentity(
        session,
        InstantProgramSessionRecord.make({
          ...session,
          programId: 'instant-counter-next',
        }),
      ),
    ).toBe(false)
    expect(
      hasSameAdmissionSequencerIdentity(
        session,
        InstantProgramSessionRecord.make({
          ...session,
          programVersion: 2,
        }),
      ),
    ).toBe(false)
    expect(
      hasSameAdmissionSequencerIdentity(
        session,
        InstantProgramSessionRecord.make({
          ...session,
          subjectId: 'subject-2',
        }),
      ),
    ).toBe(false)
    expect(
      hasSameAdmissionSequencerIdentity(
        session,
        InstantProgramSessionRecord.make({
          ...session,
          processorRoomId: 'room-92334562ca1f4e928c85ed22f89820b2',
        }),
      ),
    ).toBe(false)
    expect(
      hasSameAdmissionSequencerIdentity(
        session,
        InstantProgramSessionRecord.make({
          ...session,
          sessionPolicy: Synchronization.defaultSessionPolicy(),
        }),
      ),
    ).toBe(false)
  })

  it('finishes the old Scope finalizers before starting a replacement', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const trace: Array<string> = []
          const oldReady = yield* Deferred.make<void>()
          const releaseAllowed = yield* Deferred.make<void>()
          const releaseStarted = yield* Deferred.make<void>()
          const oldFiber = yield* Effect.forkScoped(
            Effect.scoped(
              Effect.gen(function* () {
                yield* Effect.addFinalizer(() =>
                  Effect.gen(function* () {
                    trace.push('close:old:start')
                    yield* Deferred.succeed(releaseStarted, undefined)
                    yield* Deferred.await(releaseAllowed)
                    trace.push('close:old:end')
                  }),
                )
                yield* Deferred.succeed(oldReady, undefined)
                return yield* Effect.never
              }),
            ),
          )
          yield* Deferred.await(oldReady)

          const nextSession = InstantProgramSessionRecord.make({
            ...session,
            authorityProcessorId: 'processor-authority-rotated',
          })
          const replacement = yield* Effect.forkChild(
            replaceSessionAdmissionSequencer(
              { fiber: oldFiber, session },
              nextSession,
              next =>
                Effect.andThen(
                  Effect.sync(() => {
                    trace.push(`start:${next.authorityProcessorId}`)
                  }),
                  Effect.forkScoped(Effect.never),
                ),
            ),
          )
          yield* Deferred.await(releaseStarted)

          expect(trace).toStrictEqual(['close:old:start'])
          yield* Deferred.succeed(releaseAllowed, undefined)
          const running = yield* Fiber.join(replacement)

          expect(trace).toStrictEqual([
            'close:old:start',
            'close:old:end',
            'start:processor-authority-rotated',
          ])
          yield* Fiber.interrupt(running.fiber)
        }),
      ),
    )
  })
})

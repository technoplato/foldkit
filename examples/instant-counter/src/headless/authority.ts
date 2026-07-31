import {
  Array,
  Duration,
  Effect,
  Fiber,
  Option,
  Schedule,
  Scope,
  Stream,
} from 'effect'
import { Processor, Runtime } from 'foldkit'
import { randomUUID } from 'node:crypto'

import {
  type InstantProgramSessionRecord,
  makeAdmissionSequencer,
  makeProcessorRoom,
  makeSharedProgramProcessor,
} from '@foldkit/instant'

import { Model } from '../domain/model.js'
import { InstantCounterProgram } from '../domain/program.js'
import { programId, programVersion } from '../shared/identity.js'
import { makeProcessorPresence } from '../shared/presence.js'
import { validateProgramSession } from '../shared/sessionValidation.js'
import { makeMessageCodec } from '../transport/codec.js'
import { DelegatedEffectScheduler } from '../transport/effectScheduler.js'
import {
  makeAdminProgramStore,
  observeAllProgramSessions,
} from './adminStore.js'
import {
  headlessEffectExecutorLayer,
  headlessProcessorDescriptor,
} from './capabilities.js'
import type { HeadlessDatabases } from './database.js'
import type { HeadlessLocalState } from './localState.js'
import { runEffectPlacementSupervisor } from './placementSupervisor.js'
import {
  type HeadlessSubjectScope,
  includesHeadlessSubject,
} from './subjectScope.js'

const heartbeatInterval = '10 seconds'
const restartDelay = Duration.seconds(2)

/** Inputs for the long-lived renderer-free admission sequencer Processor. */
export type HeadlessAdmissionSequencerConfig = Readonly<{
  databases: HeadlessDatabases
  localState: HeadlessLocalState
  subjectScope: HeadlessSubjectScope
}>

const reportRejectedProposal = (): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stderr.write(
      'Foldkit Instant rejected one invalid Message proposal.\n',
    )
  })

const runSessionAdmissionSequencer = (
  session: InstantProgramSessionRecord,
  config: HeadlessAdmissionSequencerConfig,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const processorId = session.authorityProcessorId
      const descriptor = headlessProcessorDescriptor(
        config.localState.identity.clientId,
        processorId,
      )
      const store = makeAdminProgramStore(config.databases.admin)
      const room = yield* makeProcessorRoom(
        config.databases.rooms,
        session.processorRoomId,
        makeProcessorPresence(descriptor, false, 0),
      )
      const scheduler = new DelegatedEffectScheduler({
        attemptRegistry: {
          claim: config.localState.claimEffect,
        },
        processorId,
        room,
        scope: {
          sessionId: session.sessionId,
          subjectId: session.subjectId,
        },
        store,
      })
      const runtime = yield* Runtime.makeProgramRuntime({
        commandScheduler: scheduler.commandScheduler,
        program: InstantCounterProgram,
        resources: headlessEffectExecutorLayer(processorId),
      })
      yield* runtime.initialization
      const codec = makeMessageCodec({
        actor: Processor.SystemActor.make({ processorId }),
      })
      const shared = yield* makeSharedProgramProcessor({
        admissionSequencerProcessorId: session.authorityProcessorId,
        actorId: processorId,
        clientId: config.localState.identity.clientId,
        codec,
        makeId: randomUUID,
        Model,
        nextActorSequence: config.localState.nextActorSequence(
          session.sessionId,
        ),
        now: Date.now,
        originDeviceId: config.localState.identity.deviceId,
        originatingProcessorId: processorId,
        programId,
        programVersion,
        runtime,
        sessionId: session.sessionId,
        store,
        subjectId: session.subjectId,
      })
      scheduler.attach(shared)
      yield* shared.connect

      const publishAvailability = (isAvailable: boolean) =>
        Effect.flatMap(shared.readSnapshot, snapshot =>
          room.publishPresence(
            makeProcessorPresence(
              descriptor,
              isAvailable,
              snapshot.acceptedSequence,
            ),
          ),
        )
      yield* Effect.addFinalizer(() =>
        publishAvailability(false).pipe(Effect.catch(() => Effect.void)),
      )

      const maintainConnectionAndPresence = Effect.flatMap(
        shared.readSnapshot,
        snapshot => {
          if (snapshot.connection._tag === 'Detached') {
            return shared.connect
          } else if (snapshot.connection.transportStatus === 'errored') {
            return Effect.andThen(shared.disconnect, shared.connect)
          } else {
            return Effect.void
          }
        },
      ).pipe(
        Effect.andThen(
          Effect.flatMap(shared.readSnapshot, snapshot =>
            publishAvailability(
              snapshot.connection._tag === 'Attached' &&
                snapshot.connection.transportStatus === 'authenticated',
            ),
          ),
        ),
        Effect.repeat(Schedule.spaced(heartbeatInterval)),
      )
      const admissionSequencer = yield* makeAdmissionSequencer({
        acceptEnvelope: codec.acceptEnvelope,
        now: Date.now,
        onProposalRejected: reportRejectedProposal,
        session,
        store,
      })

      return yield* Effect.all(
        [
          admissionSequencer.run,
          runEffectPlacementSupervisor({
            codec,
            processor: shared,
            room,
            session,
            store,
          }),
          maintainConnectionAndPresence,
        ],
        { concurrency: 'unbounded', discard: true },
      ).pipe(Effect.flatMap(() => Effect.never))
    }),
  )

const resilientSessionAdmissionSequencer = (
  session: InstantProgramSessionRecord,
  config: HeadlessAdmissionSequencerConfig,
): Effect.Effect<never> =>
  Effect.forever(
    runSessionAdmissionSequencer(session, config).pipe(
      Effect.catchCause(() =>
        Effect.andThen(
          Effect.sync(() => {
            process.stderr.write(
              'Foldkit Instant restarted one Program session admission sequencer.\n',
            )
          }),
          Effect.sleep(restartDelay),
        ),
      ),
    ),
  )

/** Supervises one isolated admission sequencer Processor per active session. */
export const runHeadlessAdmissionSequencer = (
  config: HeadlessAdmissionSequencerConfig,
): Effect.Effect<never, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    const sessionFibers = new Map<string, Fiber.Fiber<never, never>>()
    const quarantinedSessionIds = new Set<string>()

    return yield* Stream.runForEach(
      observeAllProgramSessions(config.databases.admin),
      sessions =>
        Effect.gen(function* () {
          const selectedSessions = Array.filter(sessions, session =>
            includesHeadlessSubject(config.subjectScope, session.subjectId),
          )
          const maybeValidSessions = yield* Effect.forEach(
            selectedSessions,
            session =>
              validateProgramSession(session).pipe(
                Effect.match({
                  onFailure: () => {
                    if (!quarantinedSessionIds.has(session.sessionId)) {
                      quarantinedSessionIds.add(session.sessionId)
                      process.stderr.write(
                        'Foldkit Instant quarantined one invalid Program session.\n',
                      )
                    }
                    return Option.none()
                  },
                  onSuccess: Option.some,
                }),
              ),
            { concurrency: 1 },
          )
          const activeSessions = Array.filter(
            Array.getSomes(maybeValidSessions),
            session => !session.isRevoked,
          )
          const activeSessionIds = new Set(
            Array.map(activeSessions, session => session.sessionId),
          )

          for (const [sessionId, fiber] of sessionFibers) {
            if (!activeSessionIds.has(sessionId)) {
              yield* Fiber.interrupt(fiber)
              sessionFibers.delete(sessionId)
            }
          }
          yield* Effect.forEach(
            activeSessions,
            session =>
              Effect.gen(function* () {
                if (!sessionFibers.has(session.sessionId)) {
                  const fiber = yield* Effect.forkIn(
                    resilientSessionAdmissionSequencer(session, config),
                    scope,
                  )
                  sessionFibers.set(session.sessionId, fiber)
                }
              }),
            { concurrency: 1, discard: true },
          )
        }),
    ).pipe(Effect.flatMap(() => Effect.never))
  })

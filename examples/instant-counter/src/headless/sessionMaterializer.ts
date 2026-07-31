import {
  Array,
  Cause,
  Effect,
  Option,
  Queue,
  Schema as S,
  Stream,
} from 'effect'
import { randomUUID } from 'node:crypto'

import { InstantProgramSessionRecord } from '@foldkit/instant'

import {
  admissionSequencerProcessorId,
  deriveSessionId,
  isProcessorRoomId,
  processorRoomIdPrefix,
  programId,
  programVersion,
} from '../shared/identity.js'
import { InstantCounterSessionClaim } from '../shared/sessionClaim.js'
import type { HeadlessInstantDatabase } from './adminStore.js'
import {
  type HeadlessSubjectScope,
  includesHeadlessSubject,
} from './subjectScope.js'

type ClosableSubscription = Readonly<{ close: () => void }>

const observeSessionClaims = (
  database: HeadlessInstantDatabase,
): Stream.Stream<ReadonlyArray<InstantCounterSessionClaim>, unknown> =>
  Stream.callback(queue =>
    Effect.acquireRelease(
      Effect.sync(
        (): ClosableSubscription =>
          database.subscribeQuery(
            {
              instantCounterSessionClaims: {
                $: { order: { claimedAtMs: 'asc' } },
              },
            },
            payload => {
              if (payload.type === 'error') {
                Queue.failCauseUnsafe(queue, Cause.fail(payload.error))
              } else {
                Queue.offerUnsafe(
                  queue,
                  Array.getSomes(
                    Array.map(payload.data.instantCounterSessionClaims, claim =>
                      S.decodeUnknownOption(InstantCounterSessionClaim)(claim),
                    ),
                  ),
                )
              }
            },
          ),
      ),
      subscription => Effect.sync(() => subscription.close()),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )

/** Builds canonical session fields exclusively from trusted headless inputs. */
export const makeProgramSessionForClaim = async (
  claim: InstantCounterSessionClaim,
  input: Readonly<{
    createdAtMs: number
    entityId: string
    roomEntropy: string
  }>,
): Promise<InstantProgramSessionRecord> => {
  const sessionId = await deriveSessionId(claim.subjectId)
  return InstantProgramSessionRecord.make({
    authorityProcessorId: admissionSequencerProcessorId(sessionId),
    createdAtMs: input.createdAtMs,
    id: input.entityId,
    isRevoked: false,
    processorRoomId: `${processorRoomIdPrefix}${input.roomEntropy}`,
    programId,
    programVersion,
    sessionId,
    subjectId: claim.subjectId,
  })
}

/** Checks whether a persisted session is canonical for one authenticated claim. */
export const isCanonicalProgramSessionForClaim = async (
  session: InstantProgramSessionRecord,
  claim: InstantCounterSessionClaim,
): Promise<boolean> => {
  const sessionId = await deriveSessionId(claim.subjectId)
  return (
    session.authorityProcessorId === admissionSequencerProcessorId(sessionId) &&
    isProcessorRoomId(session.processorRoomId) &&
    session.programId === programId &&
    session.programVersion === programVersion &&
    session.sessionId === sessionId &&
    session.subjectId === claim.subjectId
  )
}

const queryProgramSessions = async (
  database: HeadlessInstantDatabase,
  sessionId: string,
  subjectId: string,
): Promise<ReadonlyArray<InstantProgramSessionRecord>> => {
  const result = await database.query({
    foldkitProgramSessions: {
      $: {
        where: {
          and: [{ sessionId }, { subjectId }],
        },
      },
    },
  })
  return Array.getSomes(
    Array.map(result.foldkitProgramSessions, session =>
      S.decodeUnknownOption(InstantProgramSessionRecord)(session),
    ),
  )
}

const programSessionFields = (session: InstantProgramSessionRecord) => ({
  authorityProcessorId: session.authorityProcessorId,
  createdAtMs: session.createdAtMs,
  isRevoked: session.isRevoked,
  processorRoomId: session.processorRoomId,
  programId: session.programId,
  programVersion: session.programVersion,
  sessionId: session.sessionId,
  subjectId: session.subjectId,
})

const createProgramSession = async (
  database: HeadlessInstantDatabase,
  session: InstantProgramSessionRecord,
): Promise<void> => {
  const entity = database.tx.foldkitProgramSessions[session.id]
  if (entity === undefined) {
    throw new Error('Expected a headless Program session transaction entity.')
  }
  await database.transact(entity.create(programSessionFields(session)))
}

const repairProgramSession = async (
  database: HeadlessInstantDatabase,
  session: InstantProgramSessionRecord,
): Promise<void> => {
  const entity = database.tx.foldkitProgramSessions[session.id]
  if (entity === undefined) {
    throw new Error('Expected a headless Program session transaction entity.')
  }
  await database.transact(
    entity.update(programSessionFields(session), { upsert: false }),
  )
}

const materializeSessionClaim = async (
  database: HeadlessInstantDatabase,
  claim: InstantCounterSessionClaim,
): Promise<void> => {
  const sessionId = await deriveSessionId(claim.subjectId)
  const existingSessions = await queryProgramSessions(
    database,
    sessionId,
    claim.subjectId,
  )
  const maybeExistingSession = Array.head(existingSessions)
  if (Option.isSome(maybeExistingSession)) {
    const existingSession = maybeExistingSession.value
    if (await isCanonicalProgramSessionForClaim(existingSession, claim)) {
      return
    }
    const repairedSession = await makeProgramSessionForClaim(claim, {
      createdAtMs: Date.now(),
      entityId: existingSession.id,
      roomEntropy: randomUUID(),
    })
    await repairProgramSession(
      database,
      InstantProgramSessionRecord.make({
        ...repairedSession,
        isRevoked: existingSession.isRevoked,
      }),
    )
    return
  }

  const session = await makeProgramSessionForClaim(claim, {
    createdAtMs: Date.now(),
    entityId: randomUUID(),
    roomEntropy: randomUUID(),
  })
  try {
    await createProgramSession(database, session)
  } catch {
    const winningSessions = await queryProgramSessions(
      database,
      session.sessionId,
      claim.subjectId,
    )
    const maybeWinningSession = Array.head(winningSessions)
    if (
      Option.isNone(maybeWinningSession) ||
      !(await isCanonicalProgramSessionForClaim(
        maybeWinningSession.value,
        claim,
      ))
    ) {
      throw new Error(
        'Unable to materialize the authenticated Program session.',
      )
    }
  }
}

/** Materializes one canonical Program session for every authenticated claim. */
export const runSessionMaterializer = (
  database: HeadlessInstantDatabase,
  subjectScope: HeadlessSubjectScope,
): Effect.Effect<never, unknown> =>
  Stream.runForEach(observeSessionClaims(database), claims =>
    Effect.forEach(
      Array.filter(claims, claim =>
        includesHeadlessSubject(subjectScope, claim.subjectId),
      ),
      claim =>
        Effect.tryPromise({
          try: () => materializeSessionClaim(database, claim),
          catch: cause => cause,
        }),
      { concurrency: 'unbounded', discard: true },
    ),
  ).pipe(Effect.flatMap(() => Effect.never))

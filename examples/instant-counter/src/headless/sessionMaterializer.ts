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
  instantCounterProtocolVersion,
  instantCounterSessionPolicy,
  isInstantCounterSessionPolicy,
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

const LegacyInstantCounterProgramSessionRecord = S.Struct({
  authorityProcessorId: S.String,
  createdAtMs: S.Int,
  id: S.String,
  isRevoked: S.Boolean,
  processorRoomId: S.String,
  programId: S.String,
  programVersion: S.Int,
  sessionId: S.String,
  subjectId: S.String,
})

type ProgramSessionMaterializationRecord =
  | Readonly<{
      _tag: 'Current'
      session: InstantProgramSessionRecord
    }>
  | Readonly<{
      _tag: 'LegacyMirrorV1'
      session: InstantProgramSessionRecord
    }>

/** Decodes either a current session or the exact legacy Mirror v1 row. */
export const decodeProgramSessionForMaterialization = (
  record: unknown,
): Option.Option<ProgramSessionMaterializationRecord> => {
  const maybeCurrent = S.decodeUnknownOption(InstantProgramSessionRecord, {
    onExcessProperty: 'error',
  })(record)
  if (Option.isSome(maybeCurrent)) {
    return Option.some({ _tag: 'Current', session: maybeCurrent.value })
  }
  const maybeLegacy = S.decodeUnknownOption(
    LegacyInstantCounterProgramSessionRecord,
    { onExcessProperty: 'error' },
  )(record)
  if (
    Option.isSome(maybeLegacy) &&
    maybeLegacy.value.programId === programId &&
    maybeLegacy.value.programVersion === programVersion
  ) {
    return Option.some({
      _tag: 'LegacyMirrorV1',
      session: InstantProgramSessionRecord.make({
        ...maybeLegacy.value,
        protocolVersion: instantCounterProtocolVersion,
        sessionPolicy: instantCounterSessionPolicy,
      }),
    })
  }
  return Option.none()
}

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
    ),
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
    protocolVersion: instantCounterProtocolVersion,
    sessionId,
    sessionPolicy: instantCounterSessionPolicy,
    subjectId: claim.subjectId,
  })
}

const hasCanonicalProgramSessionIdentityForClaim = async (
  session: InstantProgramSessionRecord,
  claim: InstantCounterSessionClaim,
): Promise<boolean> => {
  const sessionId = await deriveSessionId(claim.subjectId)
  return (
    session.authorityProcessorId === admissionSequencerProcessorId(sessionId) &&
    isProcessorRoomId(session.processorRoomId) &&
    session.programId === programId &&
    session.programVersion === programVersion &&
    session.protocolVersion === instantCounterProtocolVersion &&
    session.sessionId === sessionId &&
    session.subjectId === claim.subjectId
  )
}

/** Checks whether a persisted session is canonical for one authenticated claim. */
export const isCanonicalProgramSessionForClaim = async (
  session: InstantProgramSessionRecord,
  claim: InstantCounterSessionClaim,
): Promise<boolean> =>
  (await hasCanonicalProgramSessionIdentityForClaim(session, claim)) &&
  isInstantCounterSessionPolicy(session.sessionPolicy)

const queryProgramSessions = async (
  database: HeadlessInstantDatabase,
  sessionId: string,
  subjectId: string,
): Promise<ReadonlyArray<ProgramSessionMaterializationRecord>> => {
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
      decodeProgramSessionForMaterialization(session),
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
  protocolVersion: session.protocolVersion,
  sessionId: session.sessionId,
  sessionPolicy: session.sessionPolicy,
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
    const existing = maybeExistingSession.value
    const existingSession = existing.session
    const hasCanonicalIdentity =
      await hasCanonicalProgramSessionIdentityForClaim(existingSession, claim)
    if (
      existing._tag === 'Current' &&
      hasCanonicalIdentity &&
      isInstantCounterSessionPolicy(existingSession.sessionPolicy)
    ) {
      return
    }
    if (hasCanonicalIdentity) {
      await repairProgramSession(
        database,
        InstantProgramSessionRecord.make({
          ...existingSession,
          protocolVersion: instantCounterProtocolVersion,
          sessionPolicy: instantCounterSessionPolicy,
        }),
      )
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
    if (Option.isNone(maybeWinningSession)) {
      throw new Error(
        'Unable to materialize the authenticated Program session.',
      )
    }
    const winningSession = maybeWinningSession.value.session
    if (
      !(await hasCanonicalProgramSessionIdentityForClaim(winningSession, claim))
    ) {
      throw new Error(
        'Unable to materialize the authenticated Program session.',
      )
    }
    if (
      maybeWinningSession.value._tag === 'LegacyMirrorV1' ||
      !isInstantCounterSessionPolicy(winningSession.sessionPolicy)
    ) {
      await repairProgramSession(
        database,
        InstantProgramSessionRecord.make({
          ...winningSession,
          protocolVersion: instantCounterProtocolVersion,
          sessionPolicy: instantCounterSessionPolicy,
        }),
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

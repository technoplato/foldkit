import { Array, Option, Schema as S } from 'effect'

import { InstantProgramSessionRecord } from '@foldkit/instant'
import { id } from '@instantdb/core'

import type { InstantCounterDatabase } from '../../instant.schema.js'
import {
  authorityProcessorId,
  deriveSessionId,
  isProcessorRoomId,
  programId,
  programVersion,
} from '../shared/identity.js'
import { ensureSessionClaim } from '../shared/sessionClaim.js'

/** The trusted canonical identity needed to join one materialized Program session. */
export const ProgramSessionIdentity = S.Struct({
  authorityProcessorId: S.String,
  processorRoomId: S.String,
  programId: S.String,
  programVersion: S.Int,
  sessionId: S.String,
  subjectId: S.String,
})

/** The trusted canonical identity needed to join one materialized Program session. */
export type ProgramSessionIdentity = typeof ProgramSessionIdentity.Type

/** Validates a materialized record before exposing its room to a Client. */
export const programSessionIdentityFromRecord = (
  record: InstantProgramSessionRecord,
  sessionId: string,
  subjectId: string,
): Option.Option<ProgramSessionIdentity> => {
  if (
    record.authorityProcessorId === authorityProcessorId(sessionId) &&
    !record.isRevoked &&
    isProcessorRoomId(record.processorRoomId) &&
    record.programId === programId &&
    record.programVersion === programVersion &&
    record.sessionId === sessionId &&
    record.subjectId === subjectId
  ) {
    return Option.some(
      ProgramSessionIdentity.make({
        authorityProcessorId: record.authorityProcessorId,
        processorRoomId: record.processorRoomId,
        programId: record.programId,
        programVersion: record.programVersion,
        sessionId: record.sessionId,
        subjectId: record.subjectId,
      }),
    )
  }
  return Option.none()
}

type ProgramSessionObservation = Readonly<{
  maybeCachedIdentity: Option.Option<ProgramSessionIdentity>
  session: Promise<ProgramSessionIdentity>
}>

const observeProgramSession = (
  database: InstantCounterDatabase,
  sessionId: string,
  subjectId: string,
): ProgramSessionObservation => {
  let isSubscribing = true
  let maybeCachedIdentity: Option.Option<ProgramSessionIdentity> = Option.none()
  const session = new Promise<ProgramSessionIdentity>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined
    let isSettled = false

    const close = (): void => {
      if (unsubscribe !== undefined) {
        unsubscribe()
      }
    }
    const succeed = (identity: ProgramSessionIdentity): void => {
      if (!isSettled) {
        if (isSubscribing) {
          maybeCachedIdentity = Option.some(identity)
        }
        isSettled = true
        close()
        resolve(identity)
      }
    }
    const fail = (message: string): void => {
      if (!isSettled) {
        isSettled = true
        close()
        reject(new Error(message))
      }
    }

    unsubscribe = database.subscribeQuery(
      {
        foldkitProgramSessions: {
          $: {
            where: {
              and: [{ sessionId }, { subjectId }],
            },
          },
        },
      },
      payload => {
        if (payload.error !== undefined) {
          fail('Unable to observe the authenticated Program session.')
        } else {
          const sessions = Array.getSomes(
            Array.map(payload.data.foldkitProgramSessions, record =>
              S.decodeUnknownOption(InstantProgramSessionRecord)(record),
            ),
          )
          const maybeRevokedSession = Array.findFirst(
            sessions,
            session =>
              session.sessionId === sessionId &&
              session.subjectId === subjectId &&
              session.isRevoked,
          )
          if (Option.isSome(maybeRevokedSession)) {
            fail('The authenticated Program session has been revoked.')
          } else {
            const maybeIdentity = Array.head(
              Array.getSomes(
                Array.map(sessions, session =>
                  programSessionIdentityFromRecord(
                    session,
                    sessionId,
                    subjectId,
                  ),
                ),
              ),
            )
            if (Option.isSome(maybeIdentity)) {
              succeed(maybeIdentity.value)
            }
          }
        }
      },
    )
    if (isSettled) {
      close()
    }
  })
  isSubscribing = false
  return { maybeCachedIdentity, session }
}

/** Claims and joins the headless-materialized session for one authenticated subject. */
export const ensureProgramSession = async (
  database: InstantCounterDatabase,
  subjectId: string,
): Promise<ProgramSessionIdentity> => {
  const sessionId = await deriveSessionId(subjectId)
  const observation = observeProgramSession(database, sessionId, subjectId)
  if (Option.isSome(observation.maybeCachedIdentity)) {
    return observation.maybeCachedIdentity.value
  }
  const claimedSession = ensureSessionClaim(database, subjectId).then(
    () => observation.session,
  )
  return Promise.race([observation.session, claimedSession])
}

/** Creates an opaque random identifier for one Client, Processor, or proposal. */
export const randomId = (): string => id()

import { Array, Data, Option, Schema as S } from 'effect'

import { InstantProgramSessionRecord } from '@foldkit/instant'
import { id } from '@instantdb/core'

import type { InstantCounterDatabase } from '../../instant.schema.js'
import {
  type Sha256HexDigest,
  authorityProcessorId,
  deriveSessionId,
  deriveSessionIdWithDigest,
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
  cancel: () => void
  maybeCachedIdentity: Option.Option<ProgramSessionIdentity>
  session: Promise<ProgramSessionIdentity>
}>

/** Claiming or observing one authenticated Program session failed. */
export class ProgramSessionError extends Data.TaggedError(
  'ProgramSessionError',
)<{
  readonly cause: unknown
  readonly operation: 'ClaimSession' | 'DeriveSessionId' | 'ObserveSession'
}> {}

/** Options for cancellable, platform-independent Program session selection. */
export type EnsureProgramSessionOptions = Readonly<{
  digest?: Sha256HexDigest
  signal?: AbortSignal
}>

const observeProgramSession = (
  database: InstantCounterDatabase,
  sessionId: string,
  subjectId: string,
  signal: AbortSignal | undefined,
): ProgramSessionObservation => {
  let isSubscribing = true
  let maybeCachedIdentity: Option.Option<ProgramSessionIdentity> = Option.none()
  let cancel = (): void => {}
  const session = new Promise<ProgramSessionIdentity>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined
    let isSettled = false

    const close = (): void => {
      signal?.removeEventListener('abort', abort)
      const closeSubscription = unsubscribe
      unsubscribe = undefined
      if (closeSubscription !== undefined) {
        closeSubscription()
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
    const fail = (cause: unknown): void => {
      if (!isSettled) {
        isSettled = true
        close()
        reject(
          cause instanceof ProgramSessionError
            ? cause
            : new ProgramSessionError({
                cause,
                operation: 'ObserveSession',
              }),
        )
      }
    }
    const abort = (): void => {
      fail(new Error('Program session observation was cancelled.'))
    }
    cancel = close

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
          fail(payload.error)
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
            fail(new Error('The authenticated Program session was revoked.'))
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
    if (!isSettled) {
      if (signal?.aborted === true) {
        abort()
      } else {
        signal?.addEventListener('abort', abort, { once: true })
      }
    }
  })
  isSubscribing = false
  return {
    cancel,
    maybeCachedIdentity,
    session,
  }
}

/** Claims and joins the headless-materialized session for one authenticated subject. */
export const ensureProgramSession = async (
  database: InstantCounterDatabase,
  subjectId: string,
  options: EnsureProgramSessionOptions = {},
): Promise<ProgramSessionIdentity> => {
  let sessionId: string
  try {
    if (options.digest === undefined) {
      sessionId = await deriveSessionId(subjectId)
    } else {
      sessionId = await deriveSessionIdWithDigest(subjectId, options.digest)
    }
  } catch (cause) {
    throw new ProgramSessionError({ cause, operation: 'DeriveSessionId' })
  }
  const observation = observeProgramSession(
    database,
    sessionId,
    subjectId,
    options.signal,
  )
  try {
    if (Option.isSome(observation.maybeCachedIdentity)) {
      return observation.maybeCachedIdentity.value
    }
    const claimedSession = ensureSessionClaim(database, subjectId, {
      signal: options.signal,
    })
      .catch(cause => {
        throw new ProgramSessionError({ cause, operation: 'ClaimSession' })
      })
      .then(() => observation.session)
    return await Promise.race([observation.session, claimedSession])
  } finally {
    observation.cancel()
  }
}

/** Creates an opaque random identifier for one Client, Processor, or proposal. */
export const randomId = (): string => id()

import { Data, Effect } from 'effect'

import type { InstantProgramSessionRecord } from '@foldkit/instant'

import {
  authorityProcessorId,
  deriveSessionId,
  isProcessorRoomId,
  programId,
  programVersion,
} from './identity.js'

/** An observed admin session does not match its canonical authenticated identity. */
export class InvalidProgramSession extends Data.TaggedError(
  'InvalidProgramSession',
)<{
  readonly sessionId: string
}> {}

/** Validates one admin-observed session before a headless Processor trusts it. */
export const validateProgramSession = (
  session: InstantProgramSessionRecord,
): Effect.Effect<InstantProgramSessionRecord, InvalidProgramSession> =>
  Effect.promise(() => deriveSessionId(session.subjectId)).pipe(
    Effect.flatMap(sessionId => {
      if (
        session.programId === programId &&
        session.programVersion === programVersion &&
        !session.isRevoked &&
        session.sessionId === sessionId &&
        isProcessorRoomId(session.processorRoomId) &&
        session.authorityProcessorId === authorityProcessorId(sessionId)
      ) {
        return Effect.succeed(session)
      }
      return Effect.fail(
        new InvalidProgramSession({ sessionId: session.sessionId }),
      )
    }),
  )

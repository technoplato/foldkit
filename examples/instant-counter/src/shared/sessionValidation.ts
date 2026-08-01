import { Data, Effect } from 'effect'

import type { InstantProgramSessionRecord } from '@foldkit/instant'

import {
  admissionSequencerProcessorId,
  deriveSessionId,
  instantCounterProtocolVersion,
  isInstantCounterSessionPolicy,
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
        session.protocolVersion === instantCounterProtocolVersion &&
        !session.isRevoked &&
        session.sessionId === sessionId &&
        isInstantCounterSessionPolicy(session.sessionPolicy) &&
        isProcessorRoomId(session.processorRoomId) &&
        session.authorityProcessorId ===
          admissionSequencerProcessorId(sessionId)
      ) {
        return Effect.succeed(session)
      }
      return Effect.fail(
        new InvalidProgramSession({ sessionId: session.sessionId }),
      )
    }),
  )

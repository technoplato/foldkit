import { Effect } from 'effect'
import * as Synchronization from 'foldkit/synchronization'
import { describe, expect, it } from 'vitest'

import { InstantProgramSessionRecord } from '@foldkit/instant'

import {
  authorityProcessorId,
  deriveSessionId,
  instantCounterProtocolVersion,
  instantCounterSessionPolicy,
  processorRoomIdPrefix,
} from './identity.js'
import { validateProgramSession } from './sessionValidation.js'

const makeSession = async () => {
  const sessionId = await deriveSessionId('subject-1')
  return InstantProgramSessionRecord.make({
    authorityProcessorId: authorityProcessorId(sessionId),
    createdAtMs: 1,
    id: 'session-entity-1',
    isRevoked: false,
    processorRoomId: `${processorRoomIdPrefix}27b74a38-c286-4f1e-8183-fae1e13a6639`,
    programId: 'instant-counter',
    programVersion: 1,
    protocolVersion: instantCounterProtocolVersion,
    sessionId,
    sessionPolicy: instantCounterSessionPolicy,
    subjectId: 'subject-1',
  })
}

describe('headless Program session validation', () => {
  it('accepts a canonical session with a trusted random room', async () => {
    const session = await makeSession()

    expect(
      await Effect.runPromise(validateProgramSession(session)),
    ).toStrictEqual(session)
  })

  it('quarantines a row with a forged room or authority', async () => {
    const session = await makeSession()
    const forged = InstantProgramSessionRecord.make({
      ...session,
      authorityProcessorId: 'processor-attacker',
      processorRoomId: 'room-attacker-00000000000000000000000000000000',
    })
    const error = await Effect.runPromise(
      Effect.flip(validateProgramSession(forged)),
    )

    expect(error).toStrictEqual(
      expect.objectContaining({
        _tag: 'InvalidProgramSession',
        sessionId: session.sessionId,
      }),
    )
  })

  it('rejects a revoked canonical session', async () => {
    const session = await makeSession()
    const revoked = InstantProgramSessionRecord.make({
      ...session,
      isRevoked: true,
    })

    expect(
      await Effect.runPromise(Effect.flip(validateProgramSession(revoked))),
    ).toMatchObject({
      _tag: 'InvalidProgramSession',
      sessionId: session.sessionId,
    })
  })

  it('quarantines a session whose explicit policy drifted from Mirror', async () => {
    const session = await makeSession()
    const drifted = InstantProgramSessionRecord.make({
      ...session,
      sessionPolicy: Synchronization.defaultSessionPolicy(),
    })

    expect(
      await Effect.runPromise(Effect.flip(validateProgramSession(drifted))),
    ).toMatchObject({
      _tag: 'InvalidProgramSession',
      sessionId: session.sessionId,
    })
  })
})

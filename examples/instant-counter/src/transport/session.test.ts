import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { InstantProgramSessionRecord } from '@foldkit/instant'

import {
  authorityProcessorId,
  deriveSessionId,
  processorRoomIdPrefix,
  programId,
  programVersion,
} from '../shared/identity.js'
import { programSessionIdentityFromRecord } from './session.js'

describe('ProgramSessionIdentity', () => {
  it('contains only a trusted versioned session and headless-generated room', async () => {
    const sessionId = await deriveSessionId('subject-1')
    const record = InstantProgramSessionRecord.make({
      authorityProcessorId: authorityProcessorId(sessionId),
      createdAtMs: 1_753_825_100_000,
      id: 'server-generated-id',
      isRevoked: false,
      processorRoomId: `${processorRoomIdPrefix}8f4a82d4-1cf4-4fd6-a42a-773e822e41bf`,
      programId,
      programVersion,
      sessionId,
      subjectId: 'subject-1',
    })

    expect(
      Option.getOrThrow(
        programSessionIdentityFromRecord(record, sessionId, 'subject-1'),
      ),
    ).toEqual({
      authorityProcessorId: authorityProcessorId(sessionId),
      processorRoomId: record.processorRoomId,
      programId,
      programVersion,
      sessionId,
      subjectId: 'subject-1',
    })
    expect(
      Option.isNone(
        programSessionIdentityFromRecord(
          InstantProgramSessionRecord.make({
            ...record,
            processorRoomId: sessionId,
          }),
          sessionId,
          'subject-1',
        ),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        programSessionIdentityFromRecord(
          InstantProgramSessionRecord.make({
            ...record,
            isRevoked: true,
          }),
          sessionId,
          'subject-1',
        ),
      ),
    ).toBe(true)
  })
})

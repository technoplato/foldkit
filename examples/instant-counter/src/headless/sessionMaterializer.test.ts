import { Option, Struct } from 'effect'
import * as Synchronization from 'foldkit/synchronization'
import { describe, expect, it } from 'vitest'

import { InstantProgramSessionRecord } from '@foldkit/instant'

import {
  authorityProcessorId,
  deriveSessionId,
  instantCounterProtocolVersion,
  instantCounterSessionPolicy,
  processorRoomIdPrefix,
  programId,
  programVersion,
} from '../shared/identity.js'
import { InstantCounterSessionClaim } from '../shared/sessionClaim.js'
import {
  decodeProgramSessionForMaterialization,
  isCanonicalProgramSessionForClaim,
  makeProgramSessionForClaim,
} from './sessionMaterializer.js'

const claim = InstantCounterSessionClaim.make({
  claimedAtMs: 1,
  id: 'server-generated-claim-id',
  subjectId: 'subject-1',
})

describe('session materialization', () => {
  it('derives every canonical field from trusted headless inputs', async () => {
    const session = await makeProgramSessionForClaim(claim, {
      createdAtMs: 1_753_825_100_000,
      entityId: '5c01c68e-8cb4-4f59-ae82-2e4d54f5ec2d',
      roomEntropy: '8f4a82d4-1cf4-4fd6-a42a-773e822e41bf',
    })
    const sessionId = await deriveSessionId(claim.subjectId)

    expect(session).toEqual({
      authorityProcessorId: authorityProcessorId(sessionId),
      createdAtMs: 1_753_825_100_000,
      id: '5c01c68e-8cb4-4f59-ae82-2e4d54f5ec2d',
      isRevoked: false,
      processorRoomId: `${processorRoomIdPrefix}8f4a82d4-1cf4-4fd6-a42a-773e822e41bf`,
      programId,
      programVersion,
      protocolVersion: instantCounterProtocolVersion,
      sessionId,
      sessionPolicy: instantCounterSessionPolicy,
      subjectId: 'subject-1',
    })
    expect(session.createdAtMs).not.toBe(claim.claimedAtMs)
    expect(await isCanonicalProgramSessionForClaim(session, claim)).toBe(true)
  })

  it('rejects a session whose room was chosen by a Client', async () => {
    const sessionId = await deriveSessionId(claim.subjectId)
    const session = InstantProgramSessionRecord.make({
      authorityProcessorId: authorityProcessorId(sessionId),
      createdAtMs: 1_753_825_100_000,
      id: '5c01c68e-8cb4-4f59-ae82-2e4d54f5ec2d',
      isRevoked: false,
      processorRoomId: sessionId,
      programId,
      programVersion,
      protocolVersion: instantCounterProtocolVersion,
      sessionId,
      sessionPolicy: instantCounterSessionPolicy,
      subjectId: claim.subjectId,
    })

    expect(await isCanonicalProgramSessionForClaim(session, claim)).toBe(false)
  })

  it('backfills only the exact legacy v1 row as the selected Mirror policy', async () => {
    const session = await makeProgramSessionForClaim(claim, {
      createdAtMs: 1_753_825_100_000,
      entityId: '5c01c68e-8cb4-4f59-ae82-2e4d54f5ec2d',
      roomEntropy: '8f4a82d4-1cf4-4fd6-a42a-773e822e41bf',
    })
    const legacy = {
      authorityProcessorId: session.authorityProcessorId,
      createdAtMs: session.createdAtMs,
      id: session.id,
      isRevoked: session.isRevoked,
      processorRoomId: session.processorRoomId,
      programId: session.programId,
      programVersion: session.programVersion,
      sessionId: session.sessionId,
      subjectId: session.subjectId,
    }

    const decoded = Option.getOrThrow(
      decodeProgramSessionForMaterialization(legacy),
    )

    expect(decoded).toStrictEqual({
      _tag: 'LegacyMirrorV1',
      session,
    })
    expect(
      Option.isNone(
        decodeProgramSessionForMaterialization({
          ...legacy,
          programVersion: 2,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        decodeProgramSessionForMaterialization(
          Struct.omit(session, ['protocolVersion']),
        ),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        decodeProgramSessionForMaterialization({
          ...legacy,
          sessionPolicy: { generation: 0, mode: { _tag: 'Forged' } },
        }),
      ),
    ).toBe(true)
  })

  it('keeps current Mirror rows distinct from explicit policy drift', async () => {
    const session = await makeProgramSessionForClaim(claim, {
      createdAtMs: 1_753_825_100_000,
      entityId: '5c01c68e-8cb4-4f59-ae82-2e4d54f5ec2d',
      roomEntropy: '8f4a82d4-1cf4-4fd6-a42a-773e822e41bf',
    })
    const drifted = InstantProgramSessionRecord.make({
      ...session,
      sessionPolicy: Synchronization.defaultSessionPolicy(),
    })

    expect(
      Option.getOrThrow(decodeProgramSessionForMaterialization(session))._tag,
    ).toBe('Current')
    expect(
      Option.getOrThrow(decodeProgramSessionForMaterialization(drifted))._tag,
    ).toBe('Current')
    expect(await isCanonicalProgramSessionForClaim(session, claim)).toBe(true)
    expect(await isCanonicalProgramSessionForClaim(drifted, claim)).toBe(false)
  })
})

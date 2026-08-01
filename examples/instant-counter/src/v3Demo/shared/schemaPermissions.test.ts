import { describe, expect, it } from 'vitest'

import {
  InstantProgramEntities,
  InstantProgramRooms,
  InstantV3ProgramEntities,
} from '@foldkit/instant'

import permissions from '../../../instant.perms.js'
import { schema } from '../../../instant.schema.js'
import { MultipleCountersV3PolicyEntities } from './policyRequest.js'

const ownsRecord = 'auth.id != null && auth.id == data.subjectId'
const authorityOwned = {
  create: 'false',
  delete: 'false',
  update: 'false',
  view: ownsRecord,
}

const entityPermissions = [
  {
    entityName: 'foldkitAcceptedMessageOccurrences',
    policy: permissions.foldkitAcceptedMessageOccurrences,
  },
  {
    entityName: 'foldkitEffectPlacements',
    policy: permissions.foldkitEffectPlacements,
  },
  {
    entityName: 'foldkitEffectRequests',
    policy: permissions.foldkitEffectRequests,
  },
  {
    entityName: 'foldkitMessageProposalResolutions',
    policy: permissions.foldkitMessageProposalResolutions,
  },
  {
    entityName: 'foldkitMessageProposals',
    policy: permissions.foldkitMessageProposals,
  },
  {
    entityName: 'foldkitProgramSessions',
    policy: permissions.foldkitProgramSessions,
  },
  {
    entityName: 'foldkitProjectionCheckpoints',
    policy: permissions.foldkitProjectionCheckpoints,
  },
  {
    entityName: 'foldkitV3AcceptedMessageOccurrences',
    policy: permissions.foldkitV3AcceptedMessageOccurrences,
  },
  {
    entityName: 'foldkitV3EffectPlacements',
    policy: permissions.foldkitV3EffectPlacements,
  },
  {
    entityName: 'foldkitV3EffectRequests',
    policy: permissions.foldkitV3EffectRequests,
  },
  {
    entityName: 'foldkitV3MessageProposalResolutions',
    policy: permissions.foldkitV3MessageProposalResolutions,
  },
  {
    entityName: 'foldkitV3MessageProposals',
    policy: permissions.foldkitV3MessageProposals,
  },
  {
    entityName: 'foldkitV3OriginEnrollmentClaims',
    policy: permissions.foldkitV3OriginEnrollmentClaims,
  },
  {
    entityName: 'foldkitV3OriginPolicyDecisions',
    policy: permissions.foldkitV3OriginPolicyDecisions,
  },
  {
    entityName: 'foldkitV3ProgramSessions',
    policy: permissions.foldkitV3ProgramSessions,
  },
  {
    entityName: 'foldkitV3ProjectionCheckpoints',
    policy: permissions.foldkitV3ProjectionCheckpoints,
  },
  {
    entityName: 'instantCounterSessionClaims',
    policy: permissions.instantCounterSessionClaims,
  },
  {
    entityName: 'multipleCountersV3PolicyRequestResolutions',
    policy: permissions.multipleCountersV3PolicyRequestResolutions,
  },
  {
    entityName: 'multipleCountersV3PolicyRequests',
    policy: permissions.multipleCountersV3PolicyRequests,
  },
]

const authorityPolicies = [
  permissions.foldkitAcceptedMessageOccurrences,
  permissions.foldkitEffectPlacements,
  permissions.foldkitEffectRequests,
  permissions.foldkitMessageProposalResolutions,
  permissions.foldkitProgramSessions,
  permissions.foldkitProjectionCheckpoints,
  permissions.foldkitV3AcceptedMessageOccurrences,
  permissions.foldkitV3EffectPlacements,
  permissions.foldkitV3EffectRequests,
  permissions.foldkitV3MessageProposalResolutions,
  permissions.foldkitV3OriginPolicyDecisions,
  permissions.foldkitV3ProgramSessions,
  permissions.foldkitV3ProjectionCheckpoints,
  permissions.multipleCountersV3PolicyRequestResolutions,
]

describe('merged Instant Multiple Counters schema', () => {
  it('contains every v2, v3, policy, and legacy bootstrap entity', () => {
    expect(new Set(Object.keys(schema.entities))).toEqual(
      new Set([
        ...Object.keys(InstantProgramEntities),
        ...Object.keys(InstantV3ProgramEntities),
        ...Object.keys(MultipleCountersV3PolicyEntities),
        'instantCounterSessionClaims',
      ]),
    )
    expect(schema.rooms).toBe(InstantProgramRooms)
  })

  it('defines an explicit subject-scoped permission namespace for every entity', () => {
    expect(
      new Set(entityPermissions.map(({ entityName }) => entityName)),
    ).toEqual(new Set(Object.keys(schema.entities)))
    for (const { policy } of entityPermissions) {
      expect(policy.allow.view).toBe(ownsRecord)
    }
  })
})

describe('Instant Multiple Counters permission boundary', () => {
  it('denies every Client mutation of authority-owned namespaces', () => {
    for (const policy of authorityPolicies) {
      expect(policy.allow).toStrictEqual(authorityOwned)
    }
  })

  it('admits only authenticated ordinary Multiple Counters proposals', () => {
    expect(permissions.foldkitMessageProposals.allow).toStrictEqual({
      create:
        "auth.id != null && auth.id == data.subjectId && data.programId == 'multiple-counters' && data.programVersion == 2 && data.protocolVersion == 2 && data.proposalKind == 'Message' && data.actorId == auth.id",
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    })
    expect(permissions.foldkitV3MessageProposals.allow).toStrictEqual({
      create:
        "auth.id != null && auth.id == data.subjectId && data.programId == 'multiple-counters' && data.programVersion == 2 && data.protocolVersion == 3 && data.proposalKind == 'OrdinaryMessage' && data.actorId == auth.id",
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    })
    expect(
      permissions.foldkitMessageProposals.allow.create.includes(
        "data.proposalKind == 'EffectResult'",
      ),
    ).toBe(false)
    expect(
      permissions.foldkitV3MessageProposals.allow.create.includes(
        "data.proposalKind == 'EffectResult'",
      ),
    ).toBe(false)
  })

  it('keeps v3 enrollment claims and policy requests append-only', () => {
    expect(permissions.foldkitV3OriginEnrollmentClaims.allow).toStrictEqual({
      create:
        'auth.id != null && auth.id == data.subjectId && data.protocolVersion == 3 && data.claimedAtMs >= 0',
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    })
    expect(permissions.multipleCountersV3PolicyRequests.allow).toStrictEqual({
      create:
        "auth.id != null && auth.id == data.subjectId && data.programId == 'multiple-counters' && data.programVersion == 2 && data.protocolVersion == 3 && data.requesterId == auth.id && data.expectedLifecycleGeneration >= 1 && data.expectedPolicyGeneration >= 0 && data.requestedAtMs >= 0 && ((data.requestedModeTag == 'Mirror' && data.requestedMode._tag == 'Mirror') || (data.requestedModeTag == 'SharedDomain' && data.requestedMode._tag == 'SharedDomain') || (data.requestedModeTag == 'Follow' && data.requestedMode._tag == 'Follow'))",
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    })
  })

  it('preserves only the owner-scoped legacy claim refresh compatibility lane', () => {
    expect(permissions.instantCounterSessionClaims.allow).toStrictEqual({
      create: ownsRecord,
      delete: 'false',
      update:
        "auth.id != null && auth.id == data.subjectId && auth.id == newData.subjectId && request.modifiedFields.all(field, field in ['claimedAtMs'])",
      view: ownsRecord,
    })
  })

  it('defaults every unlisted operation and schema mutation to denial', () => {
    expect(permissions.$default.allow.$default).toBe('false')
    expect(permissions.attrs.allow.create).toBe('false')
  })
})

const ownsRecord = 'auth.id != null && auth.id == data.subjectId'
const targetsMultipleCounters =
  "data.programId == 'multiple-counters' && data.programVersion == 2"
const targetsCounter = "data.programId == 'counter' && data.programVersion == 2"
const createsCounterTapeRow =
  ownsRecord +
  ' && ' +
  targetsCounter +
  " && data.protocolVersion == 2 && data.proposalKind == 'Message' && data.actorId == auth.id"
const createsV2OrdinaryProposal =
  ownsRecord +
  ' && ' +
  targetsMultipleCounters +
  " && data.protocolVersion == 2 && data.proposalKind == 'Message' && data.actorId == auth.id"
const createsV3OrdinaryProposal =
  ownsRecord +
  ' && ' +
  targetsMultipleCounters +
  " && data.protocolVersion == 3 && data.proposalKind == 'OrdinaryMessage' && data.actorId == auth.id"
const createsOwnV3EnrollmentClaim =
  ownsRecord + ' && data.protocolVersion == 3 && data.claimedAtMs >= 0'
const requestedModeMatchesTag =
  "((data.requestedModeTag == 'Mirror' && data.requestedMode._tag == 'Mirror') || " +
  "(data.requestedModeTag == 'SharedDomain' && data.requestedMode._tag == 'SharedDomain') || " +
  "(data.requestedModeTag == 'Follow' && data.requestedMode._tag == 'Follow'))"
const createsOwnPolicyRequest =
  ownsRecord +
  ' && ' +
  targetsMultipleCounters +
  ' && data.protocolVersion == 3 && data.requesterId == auth.id' +
  ' && data.expectedLifecycleGeneration >= 1 && data.expectedPolicyGeneration >= 0' +
  ' && data.requestedAtMs >= 0 && ' +
  requestedModeMatchesTag
const refreshesOwnClaim =
  ownsRecord +
  ' && auth.id == newData.subjectId' +
  " && request.modifiedFields.all(field, field in ['claimedAtMs'])"

const authorityOwned = {
  allow: {
    create: 'false',
    delete: 'false',
    update: 'false',
    view: ownsRecord,
  },
}

export default {
  $default: {
    allow: {
      $default: 'false',
    },
  },
  attrs: {
    allow: {
      create: 'false',
    },
  },
  foldkitAcceptedMessageOccurrences: {
    allow: {
      create: `${createsCounterTapeRow} || ${createsV2OrdinaryProposal}`,
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
  foldkitEffectPlacements: authorityOwned,
  foldkitEffectRequests: authorityOwned,
  foldkitMessageProposalResolutions: authorityOwned,
  foldkitMessageProposals: {
    allow: {
      create: `${createsV2OrdinaryProposal} || ${createsCounterTapeRow}`,
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
  foldkitProgramSessions: authorityOwned,
  foldkitProjectionCheckpoints: authorityOwned,
  foldkitV3AcceptedMessageOccurrences: authorityOwned,
  foldkitV3EffectPlacements: authorityOwned,
  foldkitV3EffectRequests: authorityOwned,
  foldkitV3MessageProposalResolutions: authorityOwned,
  foldkitV3MessageProposals: {
    allow: {
      create: createsV3OrdinaryProposal,
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
  foldkitV3OriginEnrollmentClaims: {
    allow: {
      create: createsOwnV3EnrollmentClaim,
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
  foldkitV3OriginPolicyDecisions: authorityOwned,
  foldkitV3ProgramSessions: authorityOwned,
  foldkitV3ProjectionCheckpoints: authorityOwned,
  instantCounterSessionClaims: {
    allow: {
      create: ownsRecord,
      delete: 'false',
      update: refreshesOwnClaim,
      view: ownsRecord,
    },
  },
  multipleCountersV3PolicyRequestResolutions: authorityOwned,
  multipleCountersV3PolicyRequests: {
    allow: {
      create: createsOwnPolicyRequest,
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
}

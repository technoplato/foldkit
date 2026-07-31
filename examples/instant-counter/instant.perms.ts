const ownsRecord = 'auth.id != null && auth.id == data.subjectId'
const targetsCounter =
  "data.programId == 'instant-counter' && data.programVersion == 1"
const proposesAsSubject =
  ownsRecord + ' && ' + targetsCounter + ' && data.actorId == auth.id'
const refreshesOwnClaim =
  ownsRecord +
  ' && auth.id == newData.subjectId' +
  " && request.modifiedFields.all(field, field in ['claimedAtMs'])"

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
      create: 'false',
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
  foldkitEffectRequests: {
    allow: {
      create: 'false',
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
  foldkitEffectPlacements: {
    allow: {
      create: 'false',
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
  foldkitMessageProposals: {
    allow: {
      create: proposesAsSubject,
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
  foldkitMessageProposalResolutions: {
    allow: {
      create: 'false',
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
  foldkitProgramSessions: {
    allow: {
      create: 'false',
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
  foldkitProjectionCheckpoints: {
    allow: {
      create: 'false',
      delete: 'false',
      update: 'false',
      view: ownsRecord,
    },
  },
  instantCounterSessionClaims: {
    allow: {
      create: ownsRecord,
      delete: 'false',
      update: refreshesOwnClaim,
      view: ownsRecord,
    },
  },
}

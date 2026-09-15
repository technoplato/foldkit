import type { InstantRules } from '@instantdb/core'

const owns = 'auth.id != null && auth.id == data.ownerId'
const readOnlyAccount = owns + ' && data.access == "read_only"'
const keepsReadOnly = owns + ' && newData.access == "read_only"'

const ownerRules = {
  allow: {
    view: owns,
    create: owns,
    update: owns,
    delete: 'false',
  },
} as const

const rules = {
  attrs: {
    allow: {
      create: 'false',
    },
  },
  personalCfoProfiles: {
    allow: {
      view: owns,
      create: owns,
      update: owns,
      delete: 'false',
    },
  },
  personalCfoAccounts: {
    allow: {
      view: owns,
      create: readOnlyAccount,
      update: keepsReadOnly,
      delete: 'false',
    },
  },
  personalCfoVaultFiles: ownerRules,
  personalCfoRadarJobs: ownerRules,
  personalCfoChatMessages: ownerRules,
  personalCfoNotifications: ownerRules,
} satisfies InstantRules

export default rules

import type { InstantRules } from '@instantdb/core'

const rules = {
  attrs: {
    allow: {
      create: 'false',
    },
  },
  knophyReminders: {
    allow: {
      view: 'auth.id != null',
      create: 'auth.id != null',
      update: 'auth.id != null',
      delete: 'false',
    },
  },
  knophyRemindersMeta: {
    allow: {
      view: 'auth.id != null',
      create: 'auth.id != null',
      update: 'auth.id != null',
      delete: 'false',
    },
  },
} satisfies InstantRules

export default rules

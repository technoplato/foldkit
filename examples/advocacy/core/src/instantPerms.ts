import type { InstantRules } from '@instantdb/core'

const open = {
  allow: {
    view: 'true',
    create: 'true',
    update: 'true',
    delete: 'false',
  },
} as const

const rules = {
  attrs: {
    allow: {
      create: 'true',
    },
  },
  knophyIdeas: {
    allow: {
      view: 'true',
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
  advocacyPeople: open,
  advocacyMeetings: open,
  advocacyCalls: open,
  advocacyParticipants: open,
  advocacyChats: open,
  advocacySegments: open,
} satisfies InstantRules

export default rules

import type { InstantRules } from '@instantdb/core'

const rules = {
  attrs: {
    allow: {
      create: 'false',
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
  knophyTranscripts: {
    allow: {
      view: 'true',
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
  knophyTranscriptFrames: {
    allow: {
      view: 'true',
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
} satisfies InstantRules

export default rules

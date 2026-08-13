import type { InstantRules } from '@instantdb/core'

const rules = {
  attrs: {
    allow: {
      create: 'false',
    },
  },
  foldkitSnap: {
    allow: {
      view: 'true',
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
} satisfies InstantRules

export default rules

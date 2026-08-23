import { InstantProgramEntities, InstantProgramRooms } from '@foldkit/instant'
import { i } from '@instantdb/core'

import { InstantPuzzleSnapshotLogEntities } from './src/instantSchema.js'

/**
 * Instant CLI schema for the shared Knophy demo app.
 * Runtime Instant() uses InstantPuzzleSnapshotLogSchema only.
 * This file is the union so a Puzzle schema push does not delete
 * ideas, /dir presence, or Foldkit Program namespaces.
 */
const schema = i.schema({
  entities: {
    ...InstantProgramEntities,
    ...InstantPuzzleSnapshotLogEntities,
    knophyIdeas: i.entity({
      body: i.string(),
      index: i.number().indexed(),
      slug: i.string().unique().indexed(),
      title: i.string().indexed(),
    }),
    agentPresence: i.entity({
      agentName: i.string().unique().indexed(),
      agentId: i.string(),
      role: i.string().indexed(),
      status: i.string().indexed(),
      tabName: i.string(),
      lastSeenAtMs: i.number().indexed(),
      task: i.string(),
      plan: i.string(),
    }),
    mailboxMessage: i.entity({
      fromAgent: i.string().indexed(),
      toAgent: i.string().indexed(),
      body: i.string(),
      createdAtMs: i.number().indexed(),
      kind: i.string().indexed(),
    }),
  },
  rooms: InstantProgramRooms,
})

export default schema
export { schema }

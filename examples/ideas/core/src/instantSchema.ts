import { InstantProgramEntities, InstantProgramRooms } from '@foldkit/instant'
import { InstantCoreDatabase, i } from '@instantdb/core'

/** Instant schema for Knophy ideas, composed with Foldkit Instant Program entities. */
export const schema = i.schema({
  entities: {
    ...InstantProgramEntities,
    knophyIdeas: i.entity({
      body: i.string(),
      index: i.number().indexed(),
      slug: i.string().unique().indexed(),
      title: i.string().indexed(),
    }),
  },
  rooms: InstantProgramRooms,
})

/** Typed Instant database used by Ideas hosts. */
export type IdeasInstantDatabase = InstantCoreDatabase<typeof schema>

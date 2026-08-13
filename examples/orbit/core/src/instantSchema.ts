import {
  InstantProgramEntities,
  InstantProgramRooms,
} from '@foldkit/instant'
import { InstantCoreDatabase, i } from '@instantdb/core'

/** Instant schema for Orbit, composed with Foldkit Instant Program entities. */
export const schema = i.schema({
  entities: {
    ...InstantProgramEntities,
    foldkitSnap: i.entity({
      room: i.string().unique().indexed(),
      seq: i.number().indexed(),
      modelJson: i.string(),
    }),
  },
  rooms: InstantProgramRooms,
})

/** Typed Instant database used by Orbit hosts. */
export type OrbitInstantDatabase = InstantCoreDatabase<typeof schema>

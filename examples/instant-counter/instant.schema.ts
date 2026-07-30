import { InstantProgramEntities, InstantProgramRooms } from '@foldkit/instant'
import { InstantCoreDatabase, i } from '@instantdb/core'

/** The complete durable and transient schema used by the Instant counter. */
export const schema = i.schema({
  entities: {
    ...InstantProgramEntities,
    instantCounterSessionClaims: i.entity({
      claimedAtMs: i.number().indexed(),
      subjectId: i.string().unique().indexed(),
    }),
  },
  rooms: InstantProgramRooms,
})

/** The typed browser database used by the Instant counter Client. */
export type InstantCounterDatabase = InstantCoreDatabase<typeof schema>

export default schema

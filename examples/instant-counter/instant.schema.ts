import {
  InstantProgramEntities,
  InstantProgramRooms,
  InstantV3ProgramEntities,
} from '@foldkit/instant'
import { InstantCoreDatabase, i } from '@instantdb/core'

import { MultipleCountersV3PolicyEntities } from './src/v3Demo/shared/policyRequest.js'

/** The complete durable and transient schema used by the Instant counter. */
export const schema = i.schema({
  entities: {
    ...InstantProgramEntities,
    ...InstantV3ProgramEntities,
    ...MultipleCountersV3PolicyEntities,
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

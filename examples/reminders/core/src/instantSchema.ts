import { InstantProgramEntities, InstantProgramRooms } from '@foldkit/instant'
import { InstantCoreDatabase, i } from '@instantdb/core'

/** Instant schema for Knophy reminders, composed with Foldkit Instant Program entities. */
export const schema = i.schema({
  entities: {
    ...InstantProgramEntities,
    knophyReminders: i.entity({
      body: i.string(),
      createdAt: i.string().indexed(),
      status: i.string().indexed(),
      triggersJson: i.string(),
    }),
    knophyRemindersMeta: i.entity({
      lastWakeAt: i.string().indexed(),
    }),
  },
  rooms: InstantProgramRooms,
})

/** Typed Instant database used by Reminders hosts. */
export type RemindersInstantDatabase = InstantCoreDatabase<typeof schema>

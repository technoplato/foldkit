import { InstantProgramEntities, InstantProgramRooms } from '@foldkit/instant'
import { InstantCoreDatabase, i } from '@instantdb/core'

/** Instant schema for advocacy meetings, composed with Foldkit Instant Program entities. */
export const schema = i.schema({
  entities: {
    ...InstantProgramEntities,
    knophyIdeas: i.entity({
      body: i.string(),
      index: i.number().indexed(),
      slug: i.string().unique().indexed(),
      title: i.string().indexed(),
    }),
    advocacyPeople: i.entity({
      name: i.string().indexed(),
    }),
    advocacyMeetings: i.entity({
      canceledAt: i.number().optional(),
      createdAt: i.number().indexed(),
      end: i.number().optional(),
      finishedAt: i.number().optional(),
      notes: i.string(),
      originTag: i.string().indexed(),
      patientId: i.string().indexed().optional(),
      preferredTag: i.string().optional(),
      start: i.number().indexed().optional(),
    }),
    advocacyCalls: i.entity({
      connectedAt: i.number().optional(),
      finishedAt: i.number().optional(),
      fromNumber: i.string().optional(),
      kindTag: i.string().indexed(),
      meetingId: i.string().indexed(),
      openedAt: i.number().indexed(),
    }),
    advocacyParticipants: i.entity({
      admittedAt: i.number().optional(),
      arrivedAt: i.number().optional(),
      failedAt: i.number().optional(),
      invitedAt: i.number().indexed(),
      leftAt: i.number().optional(),
      meetingId: i.string().indexed(),
      personId: i.string().indexed(),
      roleTag: i.string().indexed(),
    }),
    advocacyChats: i.entity({
      authorId: i.string().indexed(),
      createdAt: i.number().indexed(),
      meetingId: i.string().indexed(),
      text: i.string(),
    }),
    advocacySegments: i.entity({
      callId: i.string().indexed(),
      createdAt: i.number().indexed(),
      index: i.number().indexed(),
      text: i.string(),
    }),
  },
  rooms: InstantProgramRooms,
})

/** Typed Instant database used by Advocacy hosts. */
export type AdvocacyInstantDatabase = InstantCoreDatabase<typeof schema>

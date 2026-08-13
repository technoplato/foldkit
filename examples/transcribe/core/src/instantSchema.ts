import {
  InstantProgramEntities,
  InstantProgramRooms,
} from "@foldkit/instant"
import { InstantCoreDatabase, i } from "@instantdb/core"

/** Instant schema for Knophy transcribe, composed with Foldkit Instant Program entities. */
export const schema = i.schema({
  entities: {
    ...InstantProgramEntities,
    knophyTranscripts: i.entity({
      analysis: i.string(),
      createdAt: i.number().indexed(),
      slug: i.string().unique().indexed(),
      status: i.string().indexed(),
      title: i.string().indexed(),
      transcriptText: i.string(),
      url: i.string(),
      videoId: i.string().unique().indexed(),
    }),
    knophyTranscriptFrames: i.entity({
      caption: i.string(),
      imagePath: i.string().optional(),
      imageUrl: i.string().optional(),
      index: i.number().indexed(),
      tSec: i.number().indexed(),
      transcriptId: i.string().indexed(),
    }),
  },
  rooms: InstantProgramRooms,
})

/** Typed Instant database used by Transcribe hosts. */
export type TranscribeInstantDatabase = InstantCoreDatabase<typeof schema>

import type * as ReadAloud from 'read-aloud-core-example'
import type * as TranscriptPlayer from 'transcript-player-core-example'

import type { LibraryStore } from './library.js'
import type { ScribeTimeline } from './scribeTimeline.js'
import type { LinkSharing } from './share.js'

// SERVICES

/**
 * What Books needs from the host that runs it: the library store, a way
 * to share a link, Scribe's timeline for what it plays, the Transcript
 * Player's audio output and transcript source, and Read Aloud's reading and
 * preview sources. A host provides them as one Layer, such as the Instant
 * store, timeline, and transcript with the browser's audio and share sheet,
 * and the dev endpoint over Scribe's logs.
 */
export type BooksServices =
  | LibraryStore
  | LinkSharing
  | ScribeTimeline
  | TranscriptPlayer.PlayerServices
  | ReadAloud.ReadAloudServices

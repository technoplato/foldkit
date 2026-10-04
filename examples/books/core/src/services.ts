import type * as TranscriptPlayer from 'transcript-player-core-example'

import type { LibraryStore } from './library.js'

// SERVICES

/**
 * What Books needs from the host that runs it: the library store, and the
 * Transcript Player's audio output and transcript source. A host provides
 * them as one Layer, such as the Instant store and transcript with the
 * browser's audio.
 */
export type BooksServices = LibraryStore | TranscriptPlayer.PlayerServices

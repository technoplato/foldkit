import type { AudioOutput } from './audio.js'
import type { LibraryStore } from './library.js'

// SERVICES

/**
 * What Books needs from the host that runs it: the library store and an
 * audio output. A host provides both as one Layer, such as the Instant
 * store and the browser's audio.
 */
export type BooksServices = LibraryStore | AudioOutput

import type { PreviewSource } from './preview.js'
import type { ReadingSource } from './reading.js'

// SERVICES

/**
 * What Read Aloud needs from the host that runs it: where the readings
 * come from, and where to ask whether a book has a preview. A host
 * provides them as one Layer, such as the dev endpoint and Google's
 * Dynamic Links in a browser, or Scribe's logs and `fetch` in a terminal.
 */
export type ReadAloudServices = ReadingSource | PreviewSource

import { Effect, Layer } from 'effect'
import {
  ClipboardWriteError,
  ClipboardWriter,
  type WordsDatabase,
  scribeSchema,
} from 'words-core-example'

import { init } from '@instantdb/core'

const appId = import.meta.env.VITE_INSTANT_APP_ID

/** Scribe's Instant app id, public, from the build environment. */
export const scribeInstantAppId = typeof appId === 'string' ? appId : ''

/** The Instant client for Scribe's app, the same app the iPhone writes. */
export const makeWordsDatabase = (): WordsDatabase =>
  init({ appId: scribeInstantAppId, schema: scribeSchema, devtool: false })

/** The system clipboard through the browser Clipboard API. */
export const browserClipboard = Layer.succeed(ClipboardWriter, {
  writeText: text =>
    Effect.tryPromise({
      try: () => navigator.clipboard.writeText(text),
      catch: cause => new ClipboardWriteError({ cause }),
    }),
})

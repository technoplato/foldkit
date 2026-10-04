import { Layer } from 'effect'
import { type Processor, Runtime } from 'foldkit'

import {
  Instant,
  makeInstantCoreProgramLogTransport,
  withHostedIdentity,
} from '@foldkit/instant/browser'
import { init } from '@instantdb/core'

import { scriptPreviewSource } from './preview.browser.js'
import { ReadAloudProgram } from './program.js'
import { endpointReadingSource } from './reading.browser.js'
import { readingsEndpointPath } from './reading.js'
import { type ReadAloudHandle, SyncedReadAloud } from './synced.js'

// START

/**
 * How a browser Read Aloud Processor starts: its Instant app, host, and
 * instance, and where the readings come from.
 */
export type StartReadAloudConfig = Readonly<{
  appId: string
  host: Processor.Host.Host
  instance: string
  readingsPath?: string
}>

/**
 * Starts Read Aloud in a browser. The resources sign in as the Cloudflare
 * Access member first, so the program log keeps only that member's rows in
 * Instant; the readings come from the dev endpoint over Scribe's logs, and
 * whether a book has a preview from Google Books' Dynamic Links.
 *
 * @example
 * ```typescript
 * const handle = startReadAloud({ appId: import.meta.env.VITE_INSTANT_APP_ID, host: Processor.Host.React(), instance: newProcessorInstance() })
 * ```
 */
export const startReadAloud = (
  config: StartReadAloudConfig,
): ReadAloudHandle => {
  const database = init({ appId: config.appId })
  const sync = Instant({
    app: { id: config.appId },
    processor: config.host,
    instance: config.instance,
    transport: makeInstantCoreProgramLogTransport(
      database,
      ReadAloudProgram.id,
      { owner: 'SignedInUser' },
    ),
  })
  const resources = withHostedIdentity(
    Layer.mergeAll(
      endpointReadingSource(config.readingsPath ?? readingsEndpointPath),
      scriptPreviewSource,
    ),
    database,
  )
  return Runtime.startHandle({
    program: SyncedReadAloud,
    sync,
    resources,
    host: config.host,
  })
}

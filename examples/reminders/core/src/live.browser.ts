import { Layer } from 'effect'
import { type Processor, Runtime } from 'foldkit'

import {
  Instant,
  makeInstantCoreProgramLogTransport,
  withHostedIdentity,
} from '@foldkit/instant/browser'
import { init } from '@instantdb/core'

import { makeInstantRemindersStore } from './instantStore.js'
import { RemindersProgram } from './program.js'
import type { RemindersHandle } from './startConfig.js'
import { RemindersStore } from './store.js'
import { SyncedReminders } from './synced.js'

/** How a browser Reminders Processor starts: its Instant app, host, and instance. */
export type StartRemindersConfig = Readonly<{
  appId: string
  host: Processor.Host.Host
  instance: string
}>

/**
 * Starts Reminders in a browser on the Instant app that holds the
 * Reminders V3 lists. The resources sign in as the Cloudflare Access
 * member first, then read the board and write each change as that member.
 * The program log keeps only this member's rows.
 *
 * @example
 * ```typescript
 * const handle = startReminders({ appId: import.meta.env.VITE_INSTANT_APP_ID, host: Processor.Host.React(), instance: newProcessorInstance() })
 * ```
 */
export const startReminders = (
  config: StartRemindersConfig,
): RemindersHandle => {
  const database = init({ appId: config.appId })
  const sync = Instant({
    app: { id: config.appId },
    processor: config.host,
    instance: config.instance,
    transport: makeInstantCoreProgramLogTransport(
      database,
      RemindersProgram.id,
      { owner: 'SignedInUser' },
    ),
  })
  const resources = withHostedIdentity(
    Layer.effect(RemindersStore, makeInstantRemindersStore(database)),
    database,
  )
  return Runtime.startHandle({
    program: SyncedReminders,
    sync,
    resources,
    host: config.host,
  })
}

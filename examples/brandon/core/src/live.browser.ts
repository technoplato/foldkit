import type { Layer } from 'effect'
import type { Processor } from 'foldkit'

import { Instant } from '@foldkit/instant/browser'
import { init } from '@instantdb/core'

import { type BrandonHandle, startBrandonOn } from './live.js'
import { BrandonProgram } from './program.js'
import type { BrandonServer } from './server.js'

/**
 * How a browser starts Brandon dot. `appId` is Scribe's Instant app.
 * Guests never sign into Instant, so the log is read signed out, and
 * `instance` tells two tabs apart: `foldkit-4f2a9c1e`.
 */
export type StartBrandonConfig = Readonly<{
  appId: string
  host: Processor.Host.Host
  instance: string
  server: Layer.Layer<BrandonServer>
}>

/**
 * Starts Brandon dot on Instant, following the `brandon-dot` log.
 *
 * @example
 * ```typescript
 * startBrandon({ appId, host: Processor.Host.Foldkit(), instance, server })
 * ```
 */
export const startBrandon = (config: StartBrandonConfig): BrandonHandle =>
  startBrandonOn(
    Instant({
      app: { id: config.appId },
      processor: config.host,
      instance: config.instance,
      database: init({ appId: config.appId }),
      programLog: BrandonProgram.id,
    }),
    config.server,
    config.host,
  )

import type { Layer } from 'effect'
import type { Processor } from 'foldkit'

import { Instant } from '@foldkit/instant/browser'
import { init } from '@instantdb/core'

import { brandonInstantConfig } from './instantConfig.js'
import {
  type BrandonHandle,
  type BrandonResources,
  startBrandonOn,
} from './live.js'
import { BrandonProgram } from './program.js'

/**
 * How a browser starts Brandon dot. `appId` is Scribe's Instant app.
 * Guests never sign into Instant, so the log is read signed out, and
 * `instance` tells two tabs apart: `foldkit-4f2a9c1e`. `resources` is
 * the origin and the wallet's chains and vault.
 */
export type StartBrandonConfig = Readonly<{
  appId: string
  host: Processor.Host.Host
  instance: string
  resources: Layer.Layer<BrandonResources>
}>

/**
 * Starts Brandon dot on Instant, following the `brandon-dot` log.
 *
 * @example
 * ```typescript
 * startBrandon({ appId, host: Processor.Host.Foldkit(), instance, resources })
 * ```
 */
export const startBrandon = (config: StartBrandonConfig): BrandonHandle =>
  startBrandonOn(
    Instant({
      app: { id: config.appId },
      processor: config.host,
      instance: config.instance,
      database: init(brandonInstantConfig(config.appId)),
      programLog: BrandonProgram.id,
    }),
    config.resources,
    config.host,
  )

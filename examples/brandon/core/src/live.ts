import type { Layer } from 'effect'
import { type Processor, Runtime } from 'foldkit'
import type { WalletResources } from 'wallet-core-example'

import type { BrandonProgram } from './program.js'
import type { BrandonServer } from './server.js'
import { SyncedBrandon } from './synced.js'

/** Live Brandon dot. */
export type BrandonHandle = Runtime.SyncedHandle<typeof BrandonProgram>

/** Everything Brandon dot asks of its host: the origin, and the wallet's chains and vault. */
export type BrandonResources = BrandonServer | WalletResources

/** Starts Brandon dot on an engine the caller built. */
export const startBrandonOn = (
  sync: Runtime.SyncEngine,
  resources: Layer.Layer<BrandonResources>,
  host: Processor.Host.Host,
): BrandonHandle =>
  Runtime.startHandle({ program: SyncedBrandon, sync, resources, host })

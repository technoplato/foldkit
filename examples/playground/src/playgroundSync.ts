import { Interaction, Processor, Runtime } from 'foldkit'

import { Instant, SharedInstantProject } from '@foldkit/instant/browser'
import { init } from '@instantdb/core'

import {
  type BoundPlayground,
  type PlaygroundTapeMode,
  SyncedPlayground,
  type SyncedPlaygroundMessage,
  type SyncedPlaygroundState,
  makePlaygroundInstance,
  playgroundProgramId,
} from './playgroundCore'

export * from './playgroundCore'

export type SyncedPlaygroundBridge = Readonly<{
  instance: string
  handle: Interaction.ProgramHandle<
    SyncedPlaygroundState,
    SyncedPlaygroundMessage
  >
  bound: BoundPlayground
  stop: () => Promise<void>
}>

export const startSyncedPlayground = (
  tape: PlaygroundTapeMode = 'Instant',
  syncEngine?: Runtime.SyncEngine,
): SyncedPlaygroundBridge => {
  const instance = makePlaygroundInstance()
  const host = Processor.Host.Foldkit()
  const sync: Runtime.SyncEngine =
    syncEngine ??
    (tape === 'Memory'
      ? Runtime.Memory({ processor: `playground-memory-${instance}` })
      : Instant({
          app: SharedInstantProject,
          processor: host,
          instance,
          programLog: playgroundProgramId,
          database: init({ appId: SharedInstantProject.id }),
        }))
  const handle = Runtime.startHandle({
    program: SyncedPlayground,
    sync,
    host,
  })
  return {
    instance,
    handle,
    bound: Interaction.bind(SyncedPlayground, handle),
    stop: () => handle.stop(),
  }
}

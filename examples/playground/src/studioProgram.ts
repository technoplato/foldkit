import { Interaction, Processor, Runtime } from 'foldkit'

import { Instant, SharedInstantProject } from '@foldkit/instant/browser'
import { init } from '@instantdb/core'

import {
  type BoundStudio,
  type StudioTapeMode,
  SyncedStudio,
  makeStudioInstance,
  studioProgramId,
} from './studioCore'

export * from './studioCore'

export const startSyncedStudio = (
  tape: StudioTapeMode = 'Instant',
): Readonly<{
  bound: BoundStudio
  stop: () => Promise<void>
}> => {
  const instance = makeStudioInstance()
  const host = Processor.Host.React()
  const sync: Runtime.SyncEngine =
    tape === 'Memory'
      ? Runtime.Memory({ processor: `studio-memory-${instance}` })
      : Instant({
          app: SharedInstantProject,
          processor: host,
          instance,
          programLog: studioProgramId,
          database: init({ appId: SharedInstantProject.id }),
        })
  const handle = Runtime.startHandle({
    program: SyncedStudio,
    sync,
    host,
  })
  return {
    bound: Interaction.bind(SyncedStudio, handle),
    stop: () => handle.stop(),
  }
}

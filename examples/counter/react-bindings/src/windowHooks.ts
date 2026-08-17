import {
  type Message,
  type Model,
  type Path,
  type SyncedCounterActions,
  type SyncedCounterHandle,
  memorySyncedEngine,
  startSyncedCounterHandle,
} from 'counter-core-example'
import { Processor, Program } from 'foldkit'
import { useMemo, useSyncExternalStore } from 'react'

let installedHandle: SyncedCounterHandle | undefined

/** Installs a synced Counter handle. Tests use this. The window does not. */
export const installSyncedCounterHandle = (
  handle: SyncedCounterHandle,
): void => {
  installedHandle = handle
}

/** Clears a test handle so the next hook call starts a fresh Memory Processor. */
export const resetSyncedCounterHandle = (): void => {
  if (installedHandle !== undefined) {
    installedHandle.stop()
  }
  installedHandle = undefined
}

const getSyncedCounterHandle = (): SyncedCounterHandle => {
  if (installedHandle !== undefined) {
    return installedHandle
  }
  installedHandle = startSyncedCounterHandle(
    memorySyncedEngine(Processor.Host.React()),
  )
  return installedHandle
}

/** Live synced Model for `Path()`. Do not pass `'/counter'`. */
export const useModel = (path: Path): Program.SyncedModel<Model, Message> => {
  const handle = getSyncedCounterHandle()
  const pathRef = path
  const subscribe = useMemo(() => handle.subscribe, [handle])
  const getSnapshot = useMemo(
    () => () => {
      void pathRef
      return handle.readModel()
    },
    [handle, pathRef],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Valid buttons for `Path()`. Instant stays in Runtime.start. */
export const useActions = (path: Path): SyncedCounterActions => {
  const handle = getSyncedCounterHandle()
  void path
  const subscribe = useMemo(() => handle.subscribe, [handle])
  const getSnapshot = useMemo(() => handle.readModel, [handle])
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return handle.actions()
}

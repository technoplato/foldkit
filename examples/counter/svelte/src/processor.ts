import {
  type AppMessage,
  type AppModel,
  type CounterFactHandles,
  type Path,
  type SyncedCounterHandle,
  memorySyncedEngine,
  startSyncedCounterHandle,
  subscribeHostPaint,
} from 'counter-core-example'
import { Processor, Program } from 'foldkit'
import { createSubscriber } from 'svelte/reactivity'

let installedHandle: SyncedCounterHandle | undefined
let subscribeToHandle: (() => void) | undefined

const bindHandleSubscriber = (handle: SyncedCounterHandle): void => {
  subscribeToHandle = createSubscriber(update =>
    subscribeHostPaint(handle.subscribe, update),
  )
}

/** Installs a synced Counter handle. Tests use this. The window does not. */
export const installSyncedCounterHandle = (
  handle: SyncedCounterHandle,
): void => {
  installedHandle = handle
  bindHandleSubscriber(handle)
}

/** Clears a test handle so the next hook call starts a fresh Memory Processor. */
export const resetSyncedCounterHandle = (): void => {
  if (installedHandle !== undefined) {
    installedHandle.stop()
  }
  installedHandle = undefined
  subscribeToHandle = undefined
}

const getSyncedCounterHandle = (): SyncedCounterHandle => {
  if (installedHandle !== undefined) {
    return installedHandle
  }
  const handle = startSyncedCounterHandle(
    memorySyncedEngine(Processor.Host.Svelte()),
  )
  installedHandle = handle
  bindHandleSubscriber(handle)
  return handle
}

/** Live synced Model for `Path()`. Do not pass `'/counter'`. */
export const useModel = (
  path: Path,
): Program.SyncedModel<AppModel, AppMessage> => {
  const handle = getSyncedCounterHandle()
  void path
  subscribeToHandle?.()
  return handle.readModel()
}

/** Derived past-tense fact handles for `Path()`. Instant stays in Runtime.start. */
export const useActions = (path: Path): CounterFactHandles => {
  const handle = getSyncedCounterHandle()
  void path
  subscribeToHandle?.()
  return handle.actions()
}

import { Processor, Program } from 'foldkit'
import { type UiNode } from 'foldkit/renderers'
import {
  type AppMessage,
  type AppModel,
  type Path,
  type PuzzleFactHandles,
  type SyncedPuzzleHandle,
  actionByToken,
  demoModel,
  memorySyncedEngine,
  puzzleScreen,
  startSyncedPuzzleHandle,
  subscribeHostPaint,
} from 'puzzle-core-example'
import { createSubscriber } from 'svelte/reactivity'

let installedHandle: SyncedPuzzleHandle | undefined
let subscribeToHandle: (() => void) | undefined

const bindHandleSubscriber = (handle: SyncedPuzzleHandle): void => {
  subscribeToHandle = createSubscriber(update =>
    subscribeHostPaint(handle.subscribe, update),
  )
}

/** Installs a synced Puzzle handle. Tests use this. The window does not. */
export const installSyncedPuzzleHandle = (handle: SyncedPuzzleHandle): void => {
  installedHandle = handle
  bindHandleSubscriber(handle)
}

/** Clears a test handle so the next hook call starts a fresh Memory Processor. */
export const resetSyncedPuzzleHandle = (): void => {
  if (installedHandle !== undefined) {
    installedHandle.stop()
  }
  installedHandle = undefined
  subscribeToHandle = undefined
}

const getSyncedPuzzleHandle = (): SyncedPuzzleHandle => {
  if (installedHandle !== undefined) {
    return installedHandle
  }
  const handle = startSyncedPuzzleHandle(
    memorySyncedEngine(Processor.Host.Svelte()),
  )
  installedHandle = handle
  bindHandleSubscriber(handle)
  return handle
}

/** Live synced Model for `Path()`. Do not pass `'/puzzle'`. */
export const useModel = (
  path: Path,
): Program.SyncedModel<AppModel, AppMessage> => {
  const handle = getSyncedPuzzleHandle()
  void path
  subscribeToHandle?.()
  return handle.readModel()
}

/** Derived past-tense fact handles for `Path()`. Instant stays in Runtime.start. */
export const useActions = (path: Path): PuzzleFactHandles => {
  const handle = getSyncedPuzzleHandle()
  void path
  subscribeToHandle?.()
  return handle.actions()
}

const startingScreen = puzzleScreen(demoModel())

const tokenToMessage = (token: string): AppMessage | undefined => {
  if (token === Program.actionMenuDismissToken) {
    return Program.ActionMenuDismissed()
  }
  if (token.startsWith(Program.actionMenuSelectPrefix)) {
    return Program.ActionCommandMenuSelectionMade({
      token: Program.tokenFromActionMenuToken(token),
    })
  }
  const action = actionByToken(token)
  if (action === undefined) {
    return undefined
  }
  return action()
}

/** Live Program screen tree for `Path()`. Starting paints the demo tree. */
export const useScreen = (path: Path): UiNode => {
  const handle = getSyncedPuzzleHandle()
  void path
  subscribeToHandle?.()
  const snapshot = handle.readModel()
  if (snapshot._tag === 'Ready') {
    return puzzleScreen(snapshot.product)
  }
  return startingScreen
}

/** Sends one screen Button token through the synced handle. */
export const sendScreenToken = (token: string): void => {
  const message = tokenToMessage(token)
  if (message === undefined) {
    return
  }
  getSyncedPuzzleHandle().send(message)
}

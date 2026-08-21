import { Program } from 'foldkit'
import type { UiNode } from 'foldkit/renderers'
import { useMemo, useSyncExternalStore } from 'react'

import {
  type ActionsOfPath,
  type BindProgramConfig,
  type MessageOfPath,
  type ModelOfPath,
  type ProgramHandle,
  type ProgramPath,
  bindProgram,
  getBoundProgram,
  getProgramHandle,
  getScreenHandle,
  installProgramHandle,
  installScreenHandle,
  onlyBoundProgram,
  resetProgramHandle,
  resetScreenHandle,
} from '../programHandle/programHandle.js'
import { subscribePaint } from '../programHandle/subscribePaint.js'

const useSyncedModel = (
  handle: ProgramHandle<unknown, unknown>,
): Program.SyncedModel<unknown, unknown> => {
  const subscribe = useMemo(
    () => (onStoreChange: () => void) =>
      subscribePaint(handle.subscribe, onStoreChange),
    [handle],
  )
  const getSnapshot = useMemo(() => handle.readModel, [handle])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Live synced Model for a bound Program Path.
 * Pass a selector to subscribe to a slice.
 */
export function useModel<P extends { readonly _tag: string }>(
  path: P,
): Program.SyncedModel<ModelOfPath<P>, MessageOfPath<P>>
export function useModel<P extends { readonly _tag: string }, Selected>(
  path: P,
  selector: (
    model: Program.SyncedModel<ModelOfPath<P>, MessageOfPath<P>>,
  ) => Selected,
): Selected
export function useModel<P extends { readonly _tag: string }, Selected>(
  path: P,
  selector?: (
    model: Program.SyncedModel<ModelOfPath<P>, MessageOfPath<P>>,
  ) => Selected,
): Selected | Program.SyncedModel<ModelOfPath<P>, MessageOfPath<P>> {
  const handle = getProgramHandle(path)
  const subscribe = useMemo(
    () => (onStoreChange: () => void) =>
      subscribePaint(handle.subscribe, onStoreChange),
    [handle],
  )
  const getSnapshot = useMemo(
    () =>
      (): Selected | Program.SyncedModel<ModelOfPath<P>, MessageOfPath<P>> => {
        const model = handle.readModel() as Program.SyncedModel<
          ModelOfPath<P>,
          MessageOfPath<P>
        >
        if (selector === undefined) {
          return model
        }
        return selector(model)
      },
    [handle, selector],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Past-tense Actions for a bound Program Path, derived from that
 * Program's Action declarations. Recomputed on every Model change.
 */
export const useActions = <P extends { readonly _tag: string }>(
  path: P,
): ActionsOfPath<P> => {
  const handle = getProgramHandle(path)
  const slot = getBoundProgram(path)
  const synced = useSyncedModel(handle)
  return useMemo(
    () => slot.toActions(synced, handle.send) as ActionsOfPath<P>,
    [handle, slot, synced],
  )
}

let lastScreenTag: string | undefined

/**
 * Host-neutral screen tree for a bound Program Path. Starting and
 * Failed paint through the Program screen so the window makes zero
 * business decisions.
 */
export const useScreen = (path: { readonly _tag: string }): UiNode => {
  lastScreenTag = path._tag
  const handle = getScreenHandle(path)
  const slot = getBoundProgram(path)
  const synced = useSyncedModel(handle)
  return slot.toScreen(synced)
}

/**
 * Sends the Message behind a screen Button token through the bound
 * screen handle. The Path is the last `useScreen` call.
 */
export const sendScreenToken = (token: string): void => {
  const slot =
    lastScreenTag === undefined
      ? onlyBoundProgram()
      : getBoundProgram({ _tag: lastScreenTag })
  if (slot === undefined || slot.tokenToMessage === undefined) {
    return
  }
  const message = slot.tokenToMessage(token)
  if (message === undefined) {
    return
  }
  const handle =
    lastScreenTag === undefined
      ? (slot.screenHandle ?? slot.handle)
      : getScreenHandle({ _tag: lastScreenTag })
  if (handle === undefined) {
    return
  }
  handle.send(message)
}

/** Hooks and handle installers for one bound Program. */
export type ProgramHooks<Model, Message, Actions> = Readonly<{
  useModel: {
    (
      path: ProgramPath<Model, Message, Actions>,
    ): Program.SyncedModel<Model, Message>
    <Selected>(
      path: ProgramPath<Model, Message, Actions>,
      selector: (model: Program.SyncedModel<Model, Message>) => Selected,
    ): Selected
  }
  useActions: (path: ProgramPath<Model, Message, Actions>) => Actions
  useScreen: (path: ProgramPath<Model, Message, Actions>) => UiNode
  sendScreenToken: (token: string) => void
  installHandle: (handle: ProgramHandle<Model, Message>) => void
  resetHandle: () => void
  installScreenHandle: (handle: ProgramHandle<Model, Message>) => void
  resetScreenHandle: () => void
}>

/**
 * Binds one Program to the generic React hooks and returns typed
 * installers. Windows still call `useModel(Path())`.
 */
export const createProgramHooks = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions,
>(
  path: ProgramPath<Model, Message, Actions>,
  config: BindProgramConfig<Model, Message, Actions>,
): ProgramHooks<Model, Message, Actions> => {
  bindProgram(path, config)
  return {
    useModel: useModel as ProgramHooks<Model, Message, Actions>['useModel'],
    useActions: useActions as ProgramHooks<
      Model,
      Message,
      Actions
    >['useActions'],
    useScreen,
    sendScreenToken,
    installHandle: handle => {
      installProgramHandle(path, handle)
    },
    resetHandle: () => {
      resetProgramHandle(path)
    },
    installScreenHandle: handle => {
      installScreenHandle(path, handle)
    },
    resetScreenHandle: () => {
      resetScreenHandle(path)
    },
  }
}

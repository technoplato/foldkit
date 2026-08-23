import { Effect, Exit, Layer, Match as M, Scope } from 'effect'
import { Program, Runtime } from 'foldkit'
import {
  type Actions,
  ClickedRefresh,
  type Message,
  Model,
  Path,
  SettingsOrigin,
  SettingsOriginHttpLive,
  SettingsProgram,
  failedUnreachableModel,
  messageFromKey,
  messageFromToken,
  readingModel,
  settingsScreen,
} from 'settings-core-example'

import { type ProgramHandle, createProgramHooks } from '@foldkit/react'

import './boundPrograms.js'

const asReady = (model: Model): Program.SyncedModel<Model, Message> => ({
  _tag: 'Ready',
  origin: model.origin,
})

const productOf = (synced: Program.SyncedModel<Model, Message>): Model =>
  M.value(synced).pipe(
    M.withReturnType<Model>(),
    M.tagsExhaustive({
      Starting: () => readingModel,
      Failed: () => failedUnreachableModel,
      Ready: ({ origin }) => Model.make({ origin }),
    }),
  )

/** Starts one long-lived Settings Processor. First paint is Reading. */
export const createSettingsHandle = (
  resources: Layer.Layer<SettingsOrigin> = SettingsOriginHttpLive,
): ProgramHandle<Model, Message> => {
  const scope = Effect.runSync(Scope.make())
  const runtime = Effect.runSync(
    Runtime.makeProgramRuntime({
      program: SettingsProgram,
      resources,
    }).pipe(Effect.orDie, Effect.provideService(Scope.Scope, scope)),
  )
  let isStopped = false
  let lastProduct: Model | undefined
  let lastSynced: Program.SyncedModel<Model, Message> | undefined
  const readSynced = (): Program.SyncedModel<Model, Message> => {
    const product = runtime.readModel()
    if (lastSynced !== undefined && lastProduct === product) {
      return lastSynced
    }
    lastProduct = product
    lastSynced = asReady(product)
    return lastSynced
  }
  return {
    readModel: readSynced,
    subscribe: listener =>
      runtime.observeModel(() => {
        listener()
      }),
    send: message => {
      runtime.send(message)
    },
    stop: () => {
      if (isStopped) {
        return
      }
      isStopped = true
      return Effect.runPromise(Scope.close(scope, Exit.void))
    },
  }
}

let liveHandle: ProgramHandle<Model, Message> | undefined

const cachedHandle = (): ProgramHandle<Model, Message> => {
  if (liveHandle === undefined) {
    const handle = createSettingsHandle()
    liveHandle = {
      readModel: handle.readModel,
      subscribe: handle.subscribe,
      send: handle.send,
      stop: () => {
        liveHandle = undefined
        return handle.stop?.()
      },
    }
  }
  return liveHandle
}

const hooks = createProgramHooks<Model, Message, Actions>(Path(), {
  createHandle: cachedHandle,
  createScreenHandle: cachedHandle,
  toActions: (synced, send) => ({
    clickedRefresh: () => {
      if (!ClickedRefresh.valid(productOf(synced), {})) {
        return
      }
      send(ClickedRefresh())
    },
  }),
  toScreen: synced => settingsScreen(productOf(synced)),
  tokenToMessage: messageFromToken,
  keyToMessage: (input, synced) =>
    messageFromKey(input.key, productOf(synced), {
      metaKey: input.metaKey,
      ctrlKey: input.ctrlKey,
    }),
})

/** Installs a Settings handle. Tests use this. The window does not. */
export const installSettingsHandle = (
  handle: ProgramHandle<Model, Message>,
): void => {
  hooks.installHandle(handle)
}

/** Stops and clears the `useModel` handle. */
export const resetSettingsHandle = (): void => {
  hooks.resetHandle()
}

/** Installs the handle the default window paints. Hosts and tests use this. */
export const installScreenSettingsHandle = (
  handle: ProgramHandle<Model, Message>,
): void => {
  hooks.installScreenHandle(handle)
}

/** Stops and clears the `useScreen` handle. */
export const resetScreenSettingsHandle = (): void => {
  hooks.resetScreenHandle()
}

export const useModel = hooks.useModel
export const useActions = hooks.useActions
export const useScreen = hooks.useScreen
export const sendScreenToken = hooks.sendScreenToken

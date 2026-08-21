import {
  type Actions,
  type AppMessage,
  type AppModel,
  Path as CounterPath,
  CounterProgram,
  MemoryLive,
  Model,
  type SyncedCounterHandle,
  actionByToken,
  actionMenuMessageFromKey,
  canAttachDomKeydown,
  chosenMenuTokenOf,
  counterScreen,
  counterSyncedFactHandles,
  filterListedActions,
  initialCount,
  listActions,
  memorySyncedEngine,
  startLiveCounter,
  startSyncedCounterHandle,
} from 'counter-core-example'
import { Option } from 'effect'
import { Processor, Program } from 'foldkit'
import type { UiNode } from 'foldkit/renderers'
import { useEffect, useRef, useState } from 'react'

import { createProgramHooks, getProgramHandle } from '@foldkit/react'

import './boundPrograms.js'

const startingScreen = counterScreen(Model.make({ count: initialCount }))

const screenOf = (model: Program.SyncedModel<AppModel, AppMessage>): UiNode => {
  if (model._tag === 'Ready') {
    return counterScreen(model.product)
  }
  return startingScreen
}

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

const hooks = createProgramHooks<AppModel, AppMessage, Actions>(CounterPath(), {
  createHandle: () => startLiveCounter(MemoryLive(Processor.Host.React())),
  createScreenHandle: () =>
    startSyncedCounterHandle(memorySyncedEngine(Processor.Host.React())),
  toActions: counterSyncedFactHandles,
  toScreen: screenOf,
  tokenToMessage,
  keyToMessage: (input, synced) => {
    const menu = synced._tag === 'Ready' ? synced.actionMenu : Program.Closed()
    const product =
      synced._tag === 'Ready' ? synced.product : Model.make({ count: 0 })
    const rows = listActions(CounterProgram, product)
    const message = actionMenuMessageFromKey(input, menu, rows, product)
    if (message !== undefined && menu._tag === 'Open') {
      const maybeChosen = chosenMenuTokenOf(message)
      if (Option.isSome(maybeChosen)) {
        notifyActionMenuChosen(maybeChosen.value)
      }
    }
    return message
  },
})

/** Installs a synced Counter handle. Tests use this. The window does not. */
export const installSyncedCounterHandle = (
  handle: SyncedCounterHandle,
): void => {
  hooks.installHandle(handle)
}

/** Clears a test handle so the next hook call starts a fresh Memory Processor. */
export const resetSyncedCounterHandle = (): void => {
  hooks.resetHandle()
}

/** Installs the synced handle the default window paints. Hosts and tests use this. */
export const installScreenCounterHandle = (
  handle: SyncedCounterHandle,
): void => {
  hooks.installScreenHandle(handle)
}

/** Stops and clears the handle so the next hook call starts a fresh Memory Processor. */
export const resetScreenCounterHandle = (): void => {
  hooks.resetScreenHandle()
}

const chosenFlashListeners = new Set<(token: string) => void>()

const notifyActionMenuChosen = (token: string): void => {
  for (const listener of chosenFlashListeners) {
    listener(token)
  }
}

/**
 * @deprecated Use {@link ProgramKeyBindings} at the host root.
 * Kept so existing hook tests can assert React Native does not attach.
 */
export const useActionMenuKeys = (): void => {
  const handle = getProgramHandle(CounterPath())
  useEffect(() => {
    if (!canAttachDomKeydown()) {
      return
    }
    const slot = getProgramHandle(CounterPath())
    const onKeyDown = (event: KeyboardEvent): void => {
      const synced = handle.readModel() as Program.SyncedModel<
        AppModel,
        AppMessage
      >
      const menu =
        synced._tag === 'Ready' ? synced.actionMenu : Program.Closed()
      const product =
        synced._tag === 'Ready' ? synced.product : Model.make({ count: 0 })
      const rows = listActions(CounterProgram, product)
      const message = actionMenuMessageFromKey(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
        },
        menu,
        rows,
        product,
      )
      if (message === undefined) {
        return
      }
      if (menu._tag === 'Open') {
        const maybeChosen = chosenMenuTokenOf(message)
        if (Option.isSome(maybeChosen)) {
          notifyActionMenuChosen(maybeChosen.value)
        }
      }
      event.preventDefault()
      slot.send(message)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [handle])
}

export const useModel = hooks.useModel
export const useActions = hooks.useActions
export const useScreen = hooks.useScreen
export const sendScreenToken = hooks.sendScreenToken

type HeldMenu = Readonly<{
  menu: Program.Open
  rows: ReturnType<typeof listActions>
  empty: boolean
  token: string
}>

/** Action menu slice and senders for a bespoke window. */
export const useActionMenu = (): Readonly<{
  menu: Program.ActionMenuModelValue
  rows: ReturnType<typeof listActions>
  empty: boolean
  maybeChosen: Option.Option<string>
  dismiss: () => void
  select: (token: string) => void
  trigger: () => void
}> => {
  const handle = getProgramHandle(CounterPath())
  const synced = hooks.useModel(CounterPath())
  const menu = synced._tag === 'Ready' ? synced.actionMenu : Program.Closed()
  const catalog =
    synced._tag === 'Ready' ? listActions(CounterProgram, synced.product) : []
  const filtered =
    menu._tag === 'Open'
      ? filterListedActions(catalog, menu.maybeQuery)
      : { _tag: 'Matches' as const, rows: catalog }
  const rows = filtered._tag === 'Empty' ? [] : filtered.rows
  const empty = filtered._tag === 'Empty'
  const [held, setHeld] = useState<Option.Option<HeldMenu>>(Option.none())
  const paintRef = useRef({ menu, rows, empty })
  paintRef.current = { menu, rows, empty }
  const beginFlash = (token: string): void => {
    const current = paintRef.current
    if (current.menu._tag !== 'Open') {
      return
    }
    setHeld(
      Option.some({
        menu: current.menu,
        rows: current.rows,
        empty: current.empty,
        token,
      }),
    )
    globalThis.setTimeout(() => {
      setHeld(Option.none())
    }, Program.actionMenuChosenMs)
  }
  useEffect(() => {
    const onChosen = (token: string): void => {
      beginFlash(token)
    }
    chosenFlashListeners.add(onChosen)
    return () => {
      chosenFlashListeners.delete(onChosen)
    }
  }, [])
  const painted = Option.isSome(held)
    ? {
        menu: held.value.menu,
        rows: held.value.rows,
        empty: held.value.empty,
        maybeChosen: Option.some(held.value.token),
      }
    : {
        menu,
        rows,
        empty,
        maybeChosen: Option.none<string>(),
      }
  return {
    menu: painted.menu,
    rows: painted.rows,
    empty: painted.empty,
    maybeChosen: painted.maybeChosen,
    dismiss: () => {
      handle.send(Program.ActionMenuDismissed())
    },
    select: token => {
      beginFlash(token)
      handle.send(Program.ActionCommandMenuSelectionMade({ token }))
    },
    trigger: () => {
      handle.send(Program.ActionMenuCommandTriggered())
    },
  }
}

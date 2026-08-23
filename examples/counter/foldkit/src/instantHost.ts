import {
  App,
  type AppMessage,
  type AppModel,
  BrowserLive,
  type SyncedCounterHandle,
  actionMenuMessageFromKey,
  chosenMenuTokenOf,
  describeCounterSyncError,
  listActions,
  startLiveCounter,
  subscribeHostPaint,
} from 'counter-core-example'
import { Effect, Exit, Option, Scope } from 'effect'
import { Processor, Program, Runtime } from 'foldkit'

import { view } from './view.js'

const instanceLength = 8

/** Paints Starting or Failed host chrome. Ready returns false so Foldkit can draw. */
export const paintCounterHostStatus = (
  container: HTMLElement,
  snapshot: Program.SyncedModel<AppModel, AppMessage>,
): boolean => {
  if (snapshot._tag === 'Ready') {
    return false
  }
  container.replaceChildren()
  const status = document.createElement('p')
  if (snapshot._tag === 'Starting') {
    status.textContent = 'Starting Instant Counter…'
  } else {
    status.textContent = describeCounterSyncError(snapshot.error)
  }
  container.append(status)
  return true
}

/**
 * Attach failure after Ready stays Ready.
 * Instant I/O errors go through SyncFailed. This is not Instant I/O.
 */
export const reportAttachedFoldkitFailure = (_error: unknown): void => {}

const flashChosenButton = (container: HTMLElement, token: string): void => {
  const buttons = container.querySelectorAll('button')
  for (const button of buttons) {
    const label = button.textContent ?? ''
    if (label.includes(token)) {
      button.classList.add('fk-chosen')
    }
  }
}

const sendWithChosenFlash = (
  container: HTMLElement,
  handle: SyncedCounterHandle,
  message: AppMessage,
): void => {
  const snapshot = handle.readModel()
  const maybeChosen = chosenMenuTokenOf(message)
  const isOpen =
    snapshot._tag === 'Ready' && snapshot.actionMenu._tag === 'Open'
  if (!isOpen || Option.isNone(maybeChosen)) {
    handle.send(message)
    return
  }
  flashChosenButton(container, maybeChosen.value)
  globalThis.setTimeout(() => {
    handle.send(message)
  }, Program.actionMenuChosenMs)
}

const attachProduct = (
  container: HTMLElement,
  handle: SyncedCounterHandle,
): (() => void) => {
  const scope = Effect.runSync(Scope.make())
  const attached = Effect.runPromise(
    Runtime.makeAttachedFoldkitApplication({
      ClientInput: App.Message,
      container,
      program: App,
      sendClientInput: message => {
        sendWithChosenFlash(container, handle, message)
      },
      source: {
        readModel: () => {
          const snapshot = handle.readModel()
          if (snapshot._tag === 'Ready') {
            return {
              product: snapshot.product,
              actionMenu: snapshot.actionMenu,
            }
          }
          return App.init()[0]
        },
        subscribe: listener =>
          handle.subscribe(() => {
            const snapshot = handle.readModel()
            if (snapshot._tag === 'Ready') {
              listener({
                product: snapshot.product,
                actionMenu: snapshot.actionMenu,
              })
            }
          }),
      },
      view,
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  attached.then(
    () => undefined,
    error => {
      reportAttachedFoldkitFailure(error)
    },
  )
  return () => {
    const closing = Effect.runPromise(Scope.close(scope, Exit.void))
    closing.then(
      () => undefined,
      () => undefined,
    )
  }
}

/** Starts the Foldkit Processor on Instant. Instant has no Model. */
export const startInstantCounter = (): void => {
  const container = document.getElementById('root')
  if (container === null) {
    throw new Error('Root element not found')
  }
  const handle = startLiveCounter(
    BrowserLive(Processor.Host.Foldkit(), {
      instance: globalThis.crypto.randomUUID().slice(0, instanceLength),
    }),
  )
  let detach: (() => void) | undefined
  const render = (): void => {
    const snapshot = handle.readModel()
    const painted = paintCounterHostStatus(container, snapshot)
    if (painted) {
      if (detach !== undefined) {
        detach()
        detach = undefined
      }
      return
    }
    if (detach === undefined) {
      detach = attachProduct(container, handle)
    }
  }
  subscribeHostPaint(handle.subscribe, render)
  render()
  const onKeyDown = (event: KeyboardEvent): void => {
    const snapshot = handle.readModel()
    const menu =
      snapshot._tag === 'Ready' ? snapshot.actionMenu : Program.Closed()
    const product =
      snapshot._tag === 'Ready' ? snapshot.product : App.init()[0].product
    const rows = listActions(App.of, product)
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
    event.preventDefault()
    sendWithChosenFlash(container, handle, message)
  }
  document.addEventListener('keydown', onKeyDown)
  const hot = import.meta.hot
  if (hot !== undefined) {
    hot.dispose(() => {
      document.removeEventListener('keydown', onKeyDown)
    })
  }
}

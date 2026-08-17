import {
  CounterProgram,
  type Message,
  type Model,
  type SyncedCounterHandle,
  describeCounterSyncError,
  startSyncedCounterHandle,
} from 'counter-core-example'
import { Effect, Exit, Scope } from 'effect'
import { Processor, Program, Runtime } from 'foldkit'

import { FoldkitCounterV01, Instant } from '@foldkit/instant/browser'

import { view } from './view.js'

/** Paints Starting or Failed host chrome. Ready returns false so Foldkit can draw. */
export const paintCounterHostStatus = (
  container: HTMLElement,
  snapshot: Program.SyncedModel<Model, Message>,
): boolean => {
  if (snapshot._tag === 'Ready') {
    return false
  }
  container.replaceChildren()
  const status = document.createElement('p')
  if (snapshot._tag === 'Starting') {
    status.textContent = 'Starting Instant Counter…'
    container.append(status)
    return true
  }
  status.textContent = describeCounterSyncError(snapshot.error)
  container.append(status)
  return true
}

/**
 * Attach failure after Ready stays Ready.
 * Instant I/O errors go through SyncFailed. This is not Instant I/O.
 */
export const reportAttachedFoldkitFailure = (_error: unknown): void => {}

const attachProduct = (
  container: HTMLElement,
  handle: SyncedCounterHandle,
): (() => void) => {
  const scope = Effect.runSync(Scope.make())
  const attached = Effect.runPromise(
    Runtime.makeAttachedFoldkitApplication({
      ClientInput: Message,
      container,
      program: CounterProgram,
      sendClientInput: message => {
        handle.send(message)
      },
      source: {
        readModel: () => {
          const snapshot = handle.readModel()
          if (snapshot._tag === 'Ready') {
            return { count: snapshot.count }
          }
          return { count: 0 }
        },
        subscribe: listener =>
          handle.subscribe(() => {
            const snapshot = handle.readModel()
            if (snapshot._tag === 'Ready') {
              listener({ count: snapshot.count })
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
  const handle = startSyncedCounterHandle(
    Instant({
      app: FoldkitCounterV01,
      processor: Processor.Host.Foldkit(),
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
  handle.subscribe(render)
  render()
}

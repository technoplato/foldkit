import {
  CounterProgram,
  type CounterWindowActions,
  type CounterWindowModel,
  type CounterWindowRuntime,
  Message,
  counterProcessorIds,
  describeCounterWindowError,
  startCounterWindowRuntime,
  uri,
} from 'counter-core-example'
import {
  makeCounterInstantDatabase,
  openLiveCounterWindowTape,
  signInCounterWindowSession,
} from 'counter-instant-example/browser'
import { Effect, Exit, Scope } from 'effect'
import { Runtime } from 'foldkit'

import { view } from './view.js'

const foldkitProcessorId = counterProcessorIds.foldkit

/** Paints Starting or Failed host chrome. Ready returns false so Foldkit can draw. */
export const paintCounterHostStatus = (
  container: HTMLElement,
  snapshot: CounterWindowModel,
  actions: CounterWindowActions,
): boolean => {
  if (snapshot._tag === 'ReadyWindow') {
    return false
  }
  container.replaceChildren()
  const status = document.createElement('p')
  if (snapshot._tag === 'StartingWindow') {
    status.textContent = 'Starting Instant Counter…'
    container.append(status)
    return true
  }
  status.textContent = snapshot.error
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = 'Sign in'
  retry.addEventListener('click', () => {
    actions.signIn()
  })
  container.append(status, retry)
  return true
}

/** Surfaces a Foldkit attach failure as FailedWindow. The page must not stay blank. */
export const reportAttachedFoldkitFailure = (
  runtime: Pick<CounterWindowRuntime, 'fail'>,
  error: unknown,
): void => {
  runtime.fail(describeCounterWindowError(error))
}

const attachProduct = (
  container: HTMLElement,
  runtime: ReturnType<typeof startCounterWindowRuntime>,
): (() => void) => {
  const scope = Effect.runSync(Scope.make())
  const attached = Effect.runPromise(
    Runtime.makeAttachedFoldkitApplication({
      ClientInput: Message,
      container,
      program: CounterProgram,
      sendClientInput: message => {
        runtime.enqueue(message)
      },
      source: {
        readModel: () => {
          const snapshot = runtime.getSnapshot(uri)
          if (snapshot._tag === 'ReadyWindow') {
            return { count: snapshot.count }
          }
          return { count: 0 }
        },
        subscribe: listener =>
          runtime.subscribe(() => {
            const snapshot = runtime.getSnapshot(uri)
            if (snapshot._tag === 'ReadyWindow') {
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
      reportAttachedFoldkitFailure(runtime, error)
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

/** Starts the Foldkit Processor on the live Instant Counter tape. */
export const startInstantCounter = (appId: string): void => {
  const container = document.getElementById('root')
  if (container === null) {
    throw new Error('Root element not found')
  }
  const database = makeCounterInstantDatabase(appId)
  const runtime = startCounterWindowRuntime({
    openTape: userId =>
      openLiveCounterWindowTape(database, foldkitProcessorId, userId),
    signIn: () => signInCounterWindowSession(),
  })
  let detach: (() => void) | undefined
  const render = (): void => {
    const snapshot = runtime.getSnapshot(uri)
    const painted = paintCounterHostStatus(
      container,
      snapshot,
      runtime.actions(uri),
    )
    if (painted) {
      if (detach !== undefined) {
        detach()
        detach = undefined
      }
      return
    }
    if (detach === undefined) {
      detach = attachProduct(container, runtime)
    }
  }
  runtime.subscribe(render)
  render()
}

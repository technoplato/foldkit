import { Array, Equal, Match as M, Schema as S } from 'effect'

import { Decrement, Increment, type Message, Reset } from './message.js'
import { Model, initialCount, uri } from './model.js'
import { counterValid } from './program.js'
import { localCounterSubjectId } from './tapeIdentity.js'
import { update } from './update.js'

/** The window is still opening Instant or signing in. */
export const StartingWindow = S.TaggedStruct('StartingWindow', {})
/** The window is still opening Instant or signing in. */
export type StartingWindow = typeof StartingWindow.Type

/** Instant or sign-in failed. The window must show this error. */
export const FailedWindow = S.TaggedStruct('FailedWindow', {
  error: S.String,
})
/** Instant or sign-in failed. The window must show this error. */
export type FailedWindow = typeof FailedWindow.Type

/** Live snapshot of `counter.count` for `/counter`. */
export const ReadyWindow = S.TaggedStruct('ReadyWindow', {
  count: S.Number,
})
/** Live snapshot of `counter.count` for `/counter`. */
export type ReadyWindow = typeof ReadyWindow.Type

/** Every snapshot the Counter window can draw. */
export const CounterWindowModel = S.Union([
  StartingWindow,
  FailedWindow,
  ReadyWindow,
])
/** Every snapshot the Counter window can draw. */
export type CounterWindowModel = typeof CounterWindowModel.Type

/** Causes the window may invoke for `/counter`. Instant stays in the runtime. */
export type CounterWindowActions = Readonly<{
  clickedDecrement: () => void
  clickedIncrement: () => void
  clickedReset: () => void
  signIn: () => void
}>

/** One live Counter window runtime. Adapters subscribe. Windows do not. */
export type CounterWindowRuntime = Readonly<{
  actions: (windowUri: string) => CounterWindowActions
  enqueue: (message: Message) => void
  fail: (error: string) => void
  getSnapshot: (windowUri: string) => CounterWindowModel
  signIn: () => void
  stop: () => void
  subscribe: (listener: () => void) => () => void
}>

/** A Program tape the window runtime can fold into a snapshot. */
export type CounterWindowTape = Readonly<{
  readModel: () => Model
  send: (message: Message) => Promise<void> | void
  stop: () => void
  subscribe: (listener: (model: Model) => void) => () => void
}>

/** How the runtime signs in and opens the Program tape. */
export type CounterWindowDeps = Readonly<{
  openTape: (userId: string) => Promise<CounterWindowTape>
  signIn: () => Promise<
    | { readonly _tag: 'SignedInCounterSession'; readonly userId: string }
    | { readonly _tag: 'FailedCounterSession'; readonly error: string }
  >
}>

/** Signed-in Instant or local subject. */
export const SignedInCounterSession = S.TaggedStruct('SignedInCounterSession', {
  userId: S.String,
})
/** Signed-in Instant or local subject. */
export type SignedInCounterSession = typeof SignedInCounterSession.Type

/** Sign-in failed. The window must show this error. */
export const FailedCounterSession = S.TaggedStruct('FailedCounterSession', {
  error: S.String,
})
/** Sign-in failed. The window must show this error. */
export type FailedCounterSession = typeof FailedCounterSession.Type

const unusedActions = (signIn: () => void): CounterWindowActions => ({
  clickedDecrement: () => {},
  clickedIncrement: () => {},
  clickedReset: () => {},
  signIn,
})

/** Turns a thrown Instant or tape failure into a FailedWindow string. */
export const describeCounterWindowError = (error: unknown): string => {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  return 'Instant could not open the Counter tape.'
}

/** Projects one URI onto the newest folded snapshot. */
export const projectCounterWindow = (
  windowUri: string,
  status:
    | StartingWindow
    | FailedWindow
    | Readonly<{ readonly _tag: 'ReadyWindow'; readonly model: Model }>,
): CounterWindowModel => {
  if (windowUri !== uri && windowUri !== '') {
    return projectCounterWindow(uri, status)
  }
  return M.value(status).pipe(
    M.withReturnType<CounterWindowModel>(),
    M.tagsExhaustive({
      StartingWindow: () => StartingWindow.make({}),
      FailedWindow: ({ error }) => FailedWindow.make({ error }),
      ReadyWindow: ({ model }) => ReadyWindow.make({ count: model.count }),
    }),
  )
}

/** In-memory Program tape. The process dies with the count. */
export const memoryCounterTape = (): CounterWindowTape => {
  let model: Model = Model.make({ count: initialCount })
  const listeners = new Set<(next: Model) => void>()
  return {
    readModel: () => model,
    send: message => {
      const [next] = update(model, message)
      model = next
      listeners.forEach(listener => {
        listener(model)
      })
    },
    stop: () => {
      listeners.clear()
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Starts a local in-memory Counter window. Instant is not opened. */
export const startMemoryCounterWindow = (): CounterWindowRuntime =>
  startCounterWindowRuntime({
    openTape: () => Promise.resolve(memoryCounterTape()),
    signIn: () =>
      Promise.resolve(
        SignedInCounterSession.make({ userId: localCounterSubjectId }),
      ),
  })

/** Starts a Counter window runtime. The adapter subscribes. The window does not. */
export const startCounterWindowRuntime = (
  deps: CounterWindowDeps,
): CounterWindowRuntime => {
  let model: Model = Model.make({ count: initialCount })
  let status:
    | StartingWindow
    | FailedWindow
    | Readonly<{ readonly _tag: 'ReadyWindow'; readonly model: Model }> =
    StartingWindow.make({})
  let tape: CounterWindowTape | undefined
  const listeners = new Set<() => void>()
  const snapshots = new Map<string, CounterWindowModel>()

  const snapshotFor = (windowUri: string): CounterWindowModel => {
    const next = projectCounterWindow(windowUri, status)
    const previous = snapshots.get(windowUri)
    if (previous !== undefined && Equal.equals(previous, next)) {
      return previous
    }
    snapshots.set(windowUri, next)
    return next
  }

  const notify = (): void => {
    listeners.forEach(listener => {
      listener()
    })
  }

  const fail = (error: string): void => {
    status = FailedWindow.make({ error })
    notify()
  }

  const becomeReady = (next: Model): void => {
    model = next
    status = { _tag: 'ReadyWindow', model }
    notify()
  }

  const enqueue = (message: Message): void => {
    if (tape === undefined) {
      return
    }
    const result = tape.send(message)
    if (result !== undefined) {
      result.then(
        () => undefined,
        error => {
          fail(describeCounterWindowError(error))
        },
      )
    }
  }

  const start = async (): Promise<void> => {
    try {
      const session = await deps.signIn()
      if (session._tag === 'FailedCounterSession') {
        fail(session.error)
        return
      }
      const opened = await deps.openTape(session.userId)
      tape = opened
      becomeReady(opened.readModel())
      opened.subscribe(becomeReady)
    } catch (error) {
      fail(describeCounterWindowError(error))
    }
  }

  const signIn = (): void => {
    status = StartingWindow.make({})
    notify()
    if (tape !== undefined) {
      tape.stop()
      tape = undefined
    }
    const opening = start()
    opening.then(
      () => undefined,
      error => {
        fail(describeCounterWindowError(error))
      },
    )
  }

  signIn()

  return {
    actions: windowUri => {
      if (status._tag !== 'ReadyWindow') {
        return unusedActions(signIn)
      }
      const readyUri = windowUri === '' ? uri : windowUri
      if (readyUri !== uri) {
        return unusedActions(signIn)
      }
      return {
        clickedDecrement: () => {
          enqueue(Decrement())
        },
        clickedIncrement: () => {
          enqueue(Increment())
        },
        clickedReset: () => {
          const resetIsValid = Array.some(
            counterValid(model, {}),
            item => item.token === 'reset' && item.valid,
          )
          if (resetIsValid) {
            enqueue(Reset())
          }
        },
        signIn,
      }
    },
    enqueue,
    fail,
    getSnapshot: windowUri => snapshotFor(windowUri),
    signIn,
    stop: () => {
      if (tape !== undefined) {
        tape.stop()
        tape = undefined
      }
      listeners.clear()
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

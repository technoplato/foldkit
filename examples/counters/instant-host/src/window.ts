import {
  type Message,
  type Model,
  MultipleCountersProgram,
  pathToNavigationTarget,
} from 'counters-core-example'
import { Array, Equal, Match as M, Option, Schema as S } from 'effect'

import {
  addCounterMessage,
  decrementCounterMessage,
  dismissCounterDetailMessage,
  incrementCounterMessage,
  resetCounterMessage,
  selectCounterMessage,
  showCounterFactMessage,
} from './hostActions.js'

const [initialCountersModel] = MultipleCountersProgram.init()

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

/** One named counter count the window can draw. */
export const WindowCounter = S.Struct({
  count: S.Number,
  id: S.String,
})
/** One named counter count the window can draw. */
export type WindowCounter = typeof WindowCounter.Type

/** Live snapshot of schema fields for one window URI. */
export const ReadyWindow = S.TaggedStruct('ReadyWindow', {
  count: S.optionalKey(S.Number),
  counters: S.Array(WindowCounter),
  selectedId: S.optionalKey(S.String),
})
/** Live snapshot of schema fields for one window URI. */
export type ReadyWindow = typeof ReadyWindow.Type

/** Every snapshot the Counters window can draw. */
export const CountersWindowModel = S.Union([
  StartingWindow,
  FailedWindow,
  ReadyWindow,
])
/** Every snapshot the Counters window can draw. */
export type CountersWindowModel = typeof CountersWindowModel.Type

/** Methods the window may invoke for one URI. The adapter owns Instant. */
export type CountersWindowActions = Readonly<{
  addCounter: () => void
  back: () => void
  decrement: () => void
  increment: () => void
  open: (counterId: string) => void
  reset: () => void
  showFact: () => void
  signIn: () => void
}>

/** One live Counters window runtime. Adapters subscribe. Windows do not. */
export type CountersWindowRuntime = Readonly<{
  actions: (uri: string) => CountersWindowActions
  getSnapshot: (uri: string) => CountersWindowModel
  signIn: () => void
  stop: () => void
  subscribe: (listener: () => void) => () => void
}>

/** A Program tape the window runtime can fold into a snapshot. */
export type CountersWindowTape = Readonly<{
  readModel: () => Model
  send: (message: Message) => void
  stop: () => void
  subscribe: (listener: (model: Model) => void) => () => void
}>

/** How the runtime signs in and opens the Program tape. */
export type CountersWindowDeps = Readonly<{
  openTape: (userId: string) => Promise<CountersWindowTape>
  signIn: () => Promise<
    | { readonly _tag: 'SignedInCountersSession'; readonly userId: string }
    | { readonly _tag: 'FailedCountersSession'; readonly error: string }
  >
}>

const windowCounters = (model: Model): ReadonlyArray<WindowCounter> =>
  Array.map(model.rows, row =>
    WindowCounter.make({
      count: row.counter.count,
      id: row.id,
    }),
  )

const counterIdFromUri = (uri: string): Option.Option<string> =>
  M.value(pathToNavigationTarget(uri)).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      CounterListTarget: () => Option.none(),
      CounterDetailTarget: ({ counterId }) => Option.some(counterId),
      CounterFactTarget: ({ counterId }) => Option.some(counterId),
      DeleteCounterTarget: ({ counterId }) => Option.some(counterId),
    }),
  )

const countForUri = (
  uri: string,
  model: Model,
): { count?: number; selectedId?: string } => {
  const maybeId = counterIdFromUri(uri)
  if (Option.isNone(maybeId)) {
    return {}
  }
  const maybeRow = Array.findFirst(model.rows, row => row.id === maybeId.value)
  if (Option.isNone(maybeRow)) {
    return { selectedId: maybeId.value }
  }
  return {
    count: maybeRow.value.counter.count,
    selectedId: maybeId.value,
  }
}

/** Projects one URI onto the newest folded snapshot. */
export const projectCountersWindow = (
  uri: string,
  status:
    | StartingWindow
    | FailedWindow
    | Readonly<{ readonly _tag: 'ReadyWindow'; readonly model: Model }>,
): CountersWindowModel =>
  M.value(status).pipe(
    M.withReturnType<CountersWindowModel>(),
    M.tagsExhaustive({
      StartingWindow: () => StartingWindow.make({}),
      FailedWindow: ({ error }) => FailedWindow.make({ error }),
      ReadyWindow: ({ model }) =>
        ReadyWindow.make({
          counters: windowCounters(model),
          ...countForUri(uri, model),
        }),
    }),
  )

const unusedActions = (): CountersWindowActions => ({
  addCounter: () => {},
  back: () => {},
  decrement: () => {},
  increment: () => {},
  open: () => {},
  reset: () => {},
  showFact: () => {},
  signIn: () => {},
})

/** Starts a Counters window runtime. The adapter subscribes. The window does not. */
export const startCountersWindowRuntime = (
  deps: CountersWindowDeps,
): CountersWindowRuntime => {
  let model = initialCountersModel
  let status:
    | StartingWindow
    | FailedWindow
    | Readonly<{ readonly _tag: 'ReadyWindow'; readonly model: Model }> =
    StartingWindow.make({})
  let tape: CountersWindowTape | undefined
  const listeners = new Set<() => void>()
  const snapshots = new Map<string, CountersWindowModel>()

  const snapshotFor = (uri: string): CountersWindowModel => {
    const next = projectCountersWindow(uri, status)
    const previous = snapshots.get(uri)
    if (previous !== undefined && Equal.equals(previous, next)) {
      return previous
    }
    snapshots.set(uri, next)
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

  const send = (message: Message): void => {
    if (tape === undefined) {
      return
    }
    tape.send(message)
  }

  const start = async (): Promise<void> => {
    try {
      const session = await deps.signIn()
      if (session._tag === 'FailedCountersSession') {
        fail(session.error)
        return
      }
      const opened = await deps.openTape(session.userId)
      tape = opened
      becomeReady(opened.readModel())
      opened.subscribe(becomeReady)
    } catch {
      fail('Instant could not open the Counters tape.')
    }
  }

  const signIn = (): void => {
    status = StartingWindow.make({})
    notify()
    if (tape !== undefined) {
      tape.stop()
      tape = undefined
    }
    void start()
  }

  void start()

  return {
    actions: uri => {
      if (status._tag !== 'ReadyWindow') {
        return {
          ...unusedActions(),
          signIn,
        }
      }
      const selected = countForUri(uri, model)
      const selectedId = selected.selectedId
      return {
        addCounter: () => {
          send(addCounterMessage(model))
        },
        back: () => {
          if (selectedId === undefined) {
            return
          }
          if (model.navigation._tag !== 'CounterDetail') {
            return
          }
          send(
            dismissCounterDetailMessage(
              selectedId,
              model.navigation.presentationId,
            ),
          )
        },
        decrement: () => {
          if (selectedId !== undefined) {
            send(decrementCounterMessage(selectedId))
          }
        },
        increment: () => {
          if (selectedId !== undefined) {
            send(incrementCounterMessage(selectedId))
          }
        },
        open: counterId => {
          send(selectCounterMessage(counterId))
        },
        reset: () => {
          if (selectedId !== undefined) {
            send(resetCounterMessage(selectedId))
          }
        },
        showFact: () => {
          if (selectedId === undefined) {
            return
          }
          if (model.navigation._tag !== 'CounterDetail') {
            return
          }
          send(
            showCounterFactMessage(selectedId, model.navigation.presentationId),
          )
        },
        signIn,
      }
    },
    getSnapshot: uri => snapshotFor(uri),
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

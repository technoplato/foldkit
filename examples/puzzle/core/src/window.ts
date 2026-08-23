import { Array, Equal, Match as M, Schema as S } from 'effect'

import { GuessedNo, GuessedYes, type Message, ResetTape } from './message.js'
import { type Model, demoModel, uriOf } from './model.js'
import { puzzleValid } from './program.js'
import { puzzleLocalSubjectId } from './tapeIdentity.js'
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

/** Live snapshot of the hash tape for `/puzzle`. */
export const ReadyWindow = S.TaggedStruct('ReadyWindow', {
  tape: S.String,
})
/** Live snapshot of the hash tape for `/puzzle`. */
export type ReadyWindow = typeof ReadyWindow.Type

/** Every snapshot the Puzzle window can draw. */
export const PuzzleWindowModel = S.Union([
  StartingWindow,
  FailedWindow,
  ReadyWindow,
])
/** Every snapshot the Puzzle window can draw. */
export type PuzzleWindowModel = typeof PuzzleWindowModel.Type

/** Causes the window may invoke for `/puzzle`. Instant stays in the runtime. */
export type PuzzleWindowActions = Readonly<{
  clickedNo: () => void
  clickedYes: () => void
  clickedReset: () => void
  signIn: () => void
}>

/** One live Puzzle window runtime. Adapters subscribe. Windows do not. */
export type PuzzleWindowRuntime = Readonly<{
  actions: (windowUri: string) => PuzzleWindowActions
  enqueue: (message: Message) => void
  fail: (error: string) => void
  getSnapshot: (windowUri: string) => PuzzleWindowModel
  signIn: () => void
  stop: () => void
  subscribe: (listener: () => void) => () => void
}>

/** A Program tape the window runtime can fold into a snapshot. */
export type PuzzleWindowTape = Readonly<{
  readModel: () => Model
  send: (message: Message) => Promise<void> | void
  stop: () => void
  subscribe: (listener: (model: Model) => void) => () => void
}>

/** How the runtime signs in and opens the Program tape. */
export type PuzzleWindowDeps = Readonly<{
  openTape: (userId: string) => Promise<PuzzleWindowTape>
  signIn: () => Promise<
    | { readonly _tag: 'SignedInPuzzleSession'; readonly userId: string }
    | { readonly _tag: 'FailedPuzzleSession'; readonly error: string }
  >
}>

/** Signed-in Instant or local subject. */
export const SignedInPuzzleSession = S.TaggedStruct('SignedInPuzzleSession', {
  userId: S.String,
})
/** Signed-in Instant or local subject. */
export type SignedInPuzzleSession = typeof SignedInPuzzleSession.Type

/** Sign-in failed. The window must show this error. */
export const FailedPuzzleSession = S.TaggedStruct('FailedPuzzleSession', {
  error: S.String,
})
/** Sign-in failed. The window must show this error. */
export type FailedPuzzleSession = typeof FailedPuzzleSession.Type

const unusedActions = (signIn: () => void): PuzzleWindowActions => ({
  clickedNo: () => {},
  clickedYes: () => {},
  clickedReset: () => {},
  signIn,
})

/** Turns a thrown Instant or tape failure into a FailedWindow string. */
export const describePuzzleWindowError = (error: unknown): string => {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  return 'Instant could not open the Puzzle tape.'
}

const puzzleUri = uriOf(demoModel())

/** Projects one URI onto the newest folded snapshot. */
export const projectPuzzleWindow = (
  windowUri: string,
  status:
    | StartingWindow
    | FailedWindow
    | Readonly<{ readonly _tag: 'ReadyWindow'; readonly model: Model }>,
): PuzzleWindowModel => {
  if (windowUri !== puzzleUri && windowUri !== '/puzzle' && windowUri !== '') {
    return projectPuzzleWindow('/puzzle', status)
  }
  return M.value(status).pipe(
    M.withReturnType<PuzzleWindowModel>(),
    M.tagsExhaustive({
      StartingWindow: () => StartingWindow.make({}),
      FailedWindow: ({ error }) => FailedWindow.make({ error }),
      ReadyWindow: ({ model }) => ReadyWindow.make({ tape: uriOf(model) }),
    }),
  )
}

/** In-memory Program tape. The process dies with the tape. */
export const memoryPuzzleTape = (): PuzzleWindowTape => {
  let model: Model = demoModel()
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

/** Starts a local in-memory Puzzle window. Instant is not opened. */
export const startMemoryPuzzleWindow = (): PuzzleWindowRuntime =>
  startPuzzleWindowRuntime({
    openTape: () => Promise.resolve(memoryPuzzleTape()),
    signIn: () =>
      Promise.resolve(
        SignedInPuzzleSession.make({ userId: puzzleLocalSubjectId }),
      ),
  })

/** Starts a Puzzle window runtime. The adapter subscribes. The window does not. */
export const startPuzzleWindowRuntime = (
  deps: PuzzleWindowDeps,
): PuzzleWindowRuntime => {
  let model: Model = demoModel()
  let status:
    | StartingWindow
    | FailedWindow
    | Readonly<{ readonly _tag: 'ReadyWindow'; readonly model: Model }> =
    StartingWindow.make({})
  let tape: PuzzleWindowTape | undefined
  const listeners = new Set<() => void>()
  const snapshots = new Map<string, PuzzleWindowModel>()

  const snapshotFor = (windowUri: string): PuzzleWindowModel => {
    const next = projectPuzzleWindow(windowUri, status)
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
          fail(describePuzzleWindowError(error))
        },
      )
    }
  }

  const start = async (): Promise<void> => {
    try {
      const session = await deps.signIn()
      if (session._tag === 'FailedPuzzleSession') {
        fail(session.error)
        return
      }
      const opened = await deps.openTape(session.userId)
      tape = opened
      becomeReady(opened.readModel())
      opened.subscribe(becomeReady)
    } catch (error) {
      fail(describePuzzleWindowError(error))
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
        fail(describePuzzleWindowError(error))
      },
    )
  }

  signIn()

  return {
    actions: windowUri => {
      if (status._tag !== 'ReadyWindow') {
        return unusedActions(signIn)
      }
      const readyUri = windowUri === '' ? '/puzzle' : windowUri
      if (readyUri !== '/puzzle' && !readyUri.startsWith('/puzzle')) {
        return unusedActions(signIn)
      }
      return {
        clickedNo: () => {
          enqueue(GuessedNo())
        },
        clickedYes: () => {
          enqueue(GuessedYes())
        },
        clickedReset: () => {
          const resetIsValid = Array.some(
            puzzleValid(model, {}),
            item => item.token === 'reset' && item.valid,
          )
          if (resetIsValid) {
            enqueue(ResetTape())
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

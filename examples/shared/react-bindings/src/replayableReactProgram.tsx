import { Array, Effect, Exit, Layer, Match as M, Option, Scope } from 'effect'
import type * as Program from 'foldkit/program'
import {
  type ProgramRuntime,
  type ProgramRuntimeJournalConfig,
  type ReplayController,
  type ReplayControllerSnapshot,
  makeReplayController,
} from 'foldkit/program-runtime'
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'

import type { ReactProgramActions } from './reactProgram.js'

/** Replay controls exposed beside a React Program's domain hooks. */
export type ReactReplayControls = Readonly<{
  mode: ReplayControllerSnapshot<unknown>['mode']
  frame: number
  finalFrame: number
  isBranchable: boolean
  maybeBranchError: Option.Option<string>
  changedFrame: (frame: number) => void
  clickedInspect: () => void
  clickedStepBackward: () => void
  clickedStepForward: () => void
}>

/** Replayable React bindings whose Provider initializes a Program with flags. */
export type ReplayableReactProgramBindingsWithFlags<
  Model,
  Actions extends ReactProgramActions,
  Flags,
> = Readonly<{
  Provider: ({
    children,
    fallback,
    flags,
  }: Readonly<{
    children: ReactNode
    fallback?: ReactNode
    flags: Flags
  }>) => ReactElement | null
  useActions: () => Actions
  useModel: () => Model
  useReplay: () => ReactReplayControls
}>

/** Configuration for replayable React bindings initialized with typed flags. */
export type ReplayableReactProgramConfigWithFlags<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
> = Readonly<{
  createActions: (send: ProgramRuntime<Model, Message>['send']) => Actions
  name: string
  program: Program.Program<Model, Message, Resources>
  resources: Layer.Layer<Resources>
  route: (flags: Flags) => Program.ResolvedProgramRoute<Model, Message>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
}>

type ReplayableReactProgramStore<
  Model,
  Actions extends ReactProgramActions,
> = Readonly<{
  actions: Actions
  readModel: () => Model
  readReplay: () => ReactReplayControls
  subscribe: (listener: () => void) => () => void
}>

type RunningReplayController<Model, Message> = Readonly<{
  controller: ReplayController<Model, Message>
  scope: Scope.Closeable
}>

const startReplayController = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources,
>(
  config: ReplayableReactProgramConfigWithFlags<
    Model,
    Message,
    Actions,
    Flags,
    Resources
  >,
  flags: Flags,
): RunningReplayController<Model, Message> =>
  Effect.runSync(
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const controller = yield* Effect.provideService(
        makeReplayController({
          program: config.program,
          resources: config.resources,
          route: config.route(flags),
          ...(config.journal === undefined ? {} : { journal: config.journal }),
        }).pipe(Effect.orDie),
        Scope.Scope,
        scope,
      )
      return { controller, scope }
    }),
  )

const closeReplayController = <Model, Message>({
  scope,
}: RunningReplayController<Model, Message>) =>
  Effect.runFork(Scope.close(scope, Exit.void))

const runControllerEffect = <Value, Error>(
  effect: Effect.Effect<Value, Error>,
  onFailure: (error: Error) => void,
) => {
  Effect.runFork(
    effect.pipe(Effect.catch(error => Effect.sync(() => onFailure(error)))),
  )
}

const clampFrame = (frame: number, finalFrame: number): number =>
  Math.min(Math.max(Math.trunc(frame), 0), finalFrame)

const makeReplayableProgramStore = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
>(
  controller: ReplayController<Model, Message>,
  createActions: (send: ProgramRuntime<Model, Message>['send']) => Actions,
): ReplayableReactProgramStore<Model, Actions> => {
  let snapshot = controller.read()
  let maybeBranchError: Option.Option<string> = Option.none()
  let replay: ReactReplayControls
  const listeners = new Set<() => void>()

  const notify = (): void => {
    listeners.forEach(listener => listener())
  }

  const branchUnavailableMessage = (frame: number): string =>
    `Frame ${frame.toString()} is waiting for a Command result. Select a settled frame before branching.`

  const setControllerError = (message: string): void => {
    maybeBranchError = Option.some(message)
    replay = { ...replay, maybeBranchError }
    notify()
  }

  const setReplayControlError = (error: unknown): void => {
    const detail = error instanceof Error ? error.message : String(error)
    setControllerError(`Unable to change the replay frame. ${detail}`)
  }

  const isBranchable = (
    nextSnapshot: ReplayControllerSnapshot<Model>,
  ): boolean => {
    if (nextSnapshot.mode === 'Live') {
      return true
    }
    const tape = controller.readReplayTape()
    if (nextSnapshot.frame === 0) {
      return Array.isReadonlyArrayEmpty(tape.initialCommands)
    }
    const maybeTransition = Array.get(tape.transitions, nextSnapshot.frame - 1)
    return (
      Option.isSome(maybeTransition) && maybeTransition.value.isOperationSettled
    )
  }

  const changedFrame = (frame: number): void => {
    const nextFrame = clampFrame(frame, snapshot.finalFrame)
    if (snapshot.mode === 'Live') {
      runControllerEffect(controller.inspect(nextFrame), setReplayControlError)
    } else {
      runControllerEffect(controller.seek(nextFrame), setReplayControlError)
    }
  }

  const clickedInspect = (): void => {
    if (snapshot.mode === 'Live') {
      runControllerEffect(controller.inspect(), setReplayControlError)
    }
  }

  const clickedStepBackward = (): void => {
    if (snapshot.frame === 0) {
      return
    }
    if (snapshot.mode === 'Live') {
      runControllerEffect(
        controller.inspect(snapshot.frame - 1),
        setReplayControlError,
      )
    } else {
      runControllerEffect(controller.stepBackward, setReplayControlError)
    }
  }

  const clickedStepForward = (): void => {
    if (
      snapshot.mode === 'Inspecting' &&
      snapshot.frame < snapshot.finalFrame
    ) {
      runControllerEffect(controller.stepForward, setReplayControlError)
    }
  }

  const replayForSnapshot = (
    nextSnapshot: ReplayControllerSnapshot<Model>,
  ): ReactReplayControls => ({
    mode: nextSnapshot.mode,
    frame: nextSnapshot.frame,
    finalFrame: nextSnapshot.finalFrame,
    isBranchable: isBranchable(nextSnapshot),
    maybeBranchError,
    changedFrame,
    clickedInspect,
    clickedStepBackward,
    clickedStepForward,
  })

  replay = replayForSnapshot(snapshot)
  controller.observe(nextSnapshot => {
    snapshot = nextSnapshot
    maybeBranchError = Option.none()
    replay = replayForSnapshot(nextSnapshot)
    notify()
  })

  const send: ProgramRuntime<Model, Message>['send'] = (message, options) => {
    if (isBranchable(snapshot)) {
      maybeBranchError = Option.none()
      runControllerEffect(controller.run(message, options), error => {
        const message = M.value(error).pipe(
          M.tagsExhaustive({
            ProgramRuntimeStartError: failure =>
              `Unable to start the live replay branch. ${failure.message}`,
            UnsettledReplayFrameError: failure =>
              branchUnavailableMessage(failure.frame),
          }),
        )
        setControllerError(message)
      })
    } else {
      setControllerError(branchUnavailableMessage(snapshot.frame))
    }
  }

  return {
    actions: createActions(send),
    readModel: () => snapshot.model,
    readReplay: () => replay,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Creates one ReplayController-backed Provider, Model hook, actions hook, and replay hook. */
export const createReplayableReactProgramBindingsWithFlags = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
>(
  config: ReplayableReactProgramConfigWithFlags<
    Model,
    Message,
    Actions,
    Flags,
    Resources
  >,
): ReplayableReactProgramBindingsWithFlags<Model, Actions, Flags> => {
  const ProgramContext = createContext<ReplayableReactProgramStore<
    Model,
    Actions
  > | null>(null)

  const useProgramStore = (): ReplayableReactProgramStore<Model, Actions> => {
    const store = useContext(ProgramContext)
    if (store === null) {
      throw new Error(
        `${config.name} hooks must be used inside ${config.name}Provider`,
      )
    }
    return store
  }

  const Provider = ({
    children,
    fallback,
    flags,
  }: Readonly<{
    children: ReactNode
    fallback?: ReactNode
    flags: Flags
  }>): ReactElement | null => {
    const [initialFlags] = useState(flags)
    const [store, setStore] = useState<ReplayableReactProgramStore<
      Model,
      Actions
    > | null>(null)

    useEffect(() => {
      const runningController = startReplayController(config, initialFlags)
      const nextStore = makeReplayableProgramStore(
        runningController.controller,
        config.createActions,
      )
      setStore(nextStore)

      return () => {
        closeReplayController(runningController)
      }
    }, [initialFlags])

    if (store === null) {
      return <>{fallback ?? null}</>
    }

    return (
      <ProgramContext.Provider value={store}>
        {children}
      </ProgramContext.Provider>
    )
  }

  const useModel = (): Model => {
    const store = useProgramStore()
    return useSyncExternalStore(
      store.subscribe,
      store.readModel,
      store.readModel,
    )
  }

  const useActions = (): Actions => useProgramStore().actions

  const useReplay = (): ReactReplayControls => {
    const store = useProgramStore()
    return useSyncExternalStore(
      store.subscribe,
      store.readReplay,
      store.readReplay,
    )
  }

  return { Provider, useActions, useModel, useReplay }
}

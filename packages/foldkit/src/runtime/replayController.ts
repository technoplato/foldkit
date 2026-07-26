import { Data, Effect, Function, Layer, Scope } from 'effect'

import type { Ports } from '../port/port.js'
import type { Program } from '../program/program.js'
import {
  type ReplayRoute,
  type ResolvedProgramRoute,
  type StateRoute,
  replay as makeReplayRoute,
  state as makeStateRoute,
} from '../program/route.js'
import {
  type ProgramRuntime,
  type ProgramRuntimeJournalConfig,
  type ProgramRuntimeStartError,
  type ProgramStart,
  type SendOptions,
  fromModel,
  fromReplay,
  makeProgramRuntime,
} from './programRuntime.js'
import {
  type ReplaySession,
  type UnsettledReplayFrameError,
  makeReplaySession,
} from './replaySession.js'
import type { ReplayFrameError, ReplayTape } from './replayTape.js'

/** A renderer-independent snapshot of an inspectable or live Program. */
export type ReplayControllerSnapshot<Model> = Readonly<{
  mode: 'Inspecting' | 'Live'
  model: Model
  frame: number
  finalFrame: number
}>

/** A replay operation is unavailable after a controller has entered Live mode. */
export class ReplayControllerModeError extends Data.TaggedError(
  'ReplayControllerModeError',
)<{ readonly operation: string }> {}

type InspectingState<Model, Message> = Readonly<{
  _tag: 'Inspecting'
  session: ReplaySession<Model, Message>
}>

type LiveState<
  Model,
  Message,
  P extends Ports | undefined = undefined,
> = Readonly<{
  _tag: 'Live'
  runtime: ProgramRuntime<Model, Message, P>
  stopObserving: () => void
}>

type ControllerState<Model, Message, P extends Ports | undefined = undefined> =
  | InspectingState<Model, Message>
  | LiveState<Model, Message, P>

/** A renderer-free replay controller that can inspect history and branch live. */
export type ReplayController<Model, Message> = Readonly<{
  /** Returns the current inspection or live snapshot synchronously. */
  read: () => ReplayControllerSnapshot<Model>
  /** Selects one historical frame without executing its Commands. */
  seek: (
    frame: number,
  ) => Effect.Effect<Model, ReplayFrameError | ReplayControllerModeError>
  /** Selects the previous historical frame. */
  stepBackward: Effect.Effect<
    Model,
    ReplayFrameError | ReplayControllerModeError
  >
  /** Selects the next historical frame. */
  stepForward: Effect.Effect<
    Model,
    ReplayFrameError | ReplayControllerModeError
  >
  /** Leaves Live mode and inspects the current tape at one inert frame. */
  inspect: (frame?: number) => Effect.Effect<Model, ReplayFrameError>
  /**
   * Sends a new live Message. Inspecting first branches from the selected
   * settled frame; historical Commands stay inert and new Commands run.
   */
  run: (
    message: Message,
    options?: SendOptions,
  ) => Effect.Effect<
    Model,
    ProgramRuntimeStartError | UnsettledReplayFrameError
  >
  /** Observes controller snapshots and returns an unsubscribe function. */
  observe: (
    listener: (snapshot: ReplayControllerSnapshot<Model>) => void,
  ) => () => void
  /** Returns the exact current Model as an engine-owned state route. */
  stateRoute: () => StateRoute<Model>
  /** Returns the current tape and frame as an engine-owned replay route. */
  replayRoute: () => ReplayRoute<Model, Message>
  /** Returns the source or extended typed replay tape. */
  readReplayTape: () => ReplayTape<Model, Message>
  /** Completes after restore-time Commands finish when the controller is live. */
  initialization: Effect.Effect<Model>
  /** Stops the live runtime when one has been created. */
  shutdown: Effect.Effect<void>
}>

/** Configuration for one renderer-free replay controller. */
export type ReplayControllerConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = Readonly<{
  program: Program<Model, Message, Resources, ManagedResourceServices, P>
  resources: Layer.Layer<Resources>
  route: ResolvedProgramRoute<Model, Message>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
}>

/** Creates a controller from a canonical Program state or replay route. */
export const makeReplayController = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config: ReplayControllerConfig<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  >,
): Effect.Effect<
  ReplayController<Model, Message>,
  ReplayFrameError | ProgramRuntimeStartError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    const listeners = new Set<
      (snapshot: ReplayControllerSnapshot<Model>) => void
    >()
    let controllerState: ControllerState<Model, Message, P>

    const snapshotForState = (
      state: ControllerState<Model, Message, P>,
    ): ReplayControllerSnapshot<Model> => {
      if (state._tag === 'Inspecting') {
        return {
          mode: 'Inspecting',
          model: state.session.readModel(),
          frame: state.session.readFrame(),
          finalFrame: state.session.readTape().transitions.length,
        }
      }
      const tape = state.runtime.replay.readTape()
      return {
        mode: 'Live',
        model: state.runtime.readModel(),
        frame: tape.transitions.length,
        finalFrame: tape.transitions.length,
      }
    }

    const notify = (): void => {
      const snapshot = snapshotForState(controllerState)
      listeners.forEach(listener => listener(snapshot))
    }

    const makeLiveRuntime = (start: ProgramStart<Model, Message>) =>
      Effect.provideService(
        makeProgramRuntime({
          program: config.program,
          resources: config.resources,
          start,
          ...(config.journal === undefined ? {} : { journal: config.journal }),
        }),
        Scope.Scope,
        scope,
      )

    const activateLiveRuntime = (
      runtime: ProgramRuntime<Model, Message, P>,
    ): ProgramRuntime<Model, Message, P> => {
      if (controllerState._tag === 'Live') {
        controllerState.stopObserving()
      }
      const stopObserving = runtime.journal.observe(notify)
      controllerState = { _tag: 'Live', runtime, stopObserving }
      notify()
      return runtime
    }

    const activateInspection = (
      session: ReplaySession<Model, Message>,
    ): ReplaySession<Model, Message> => {
      controllerState = { _tag: 'Inspecting', session }
      session.observe(notify)
      notify()
      return session
    }

    if (config.route._tag === 'State') {
      const runtime = yield* makeLiveRuntime(fromModel(config.route.model))
      controllerState = {
        _tag: 'Live',
        runtime,
        stopObserving: Function.constVoid,
      }
      activateLiveRuntime(runtime)
    } else {
      const session = yield* makeReplaySession(
        config.program,
        config.route.tape,
        config.route.frame,
      )
      controllerState = { _tag: 'Inspecting', session }
      activateInspection(session)
    }

    const read = (): ReplayControllerSnapshot<Model> =>
      snapshotForState(controllerState)

    const withSession = <A, E>(
      operation: string,
      use: (session: ReplaySession<Model, Message>) => Effect.Effect<A, E>,
    ): Effect.Effect<A, E | ReplayControllerModeError> =>
      Effect.suspend((): Effect.Effect<A, E | ReplayControllerModeError> => {
        if (controllerState._tag === 'Live') {
          return Effect.fail(new ReplayControllerModeError({ operation }))
        }
        return use(controllerState.session)
      })

    const seek = (frame: number) =>
      withSession('seek', session => session.seek(frame))
    const stepBackward = withSession(
      'stepBackward',
      session => session.stepBackward,
    )
    const stepForward = withSession(
      'stepForward',
      session => session.stepForward,
    )

    const inspect = (frame?: number): Effect.Effect<Model, ReplayFrameError> =>
      Effect.gen(function* () {
        if (controllerState._tag === 'Inspecting') {
          if (frame === undefined) {
            return controllerState.session.readModel()
          } else {
            return yield* controllerState.session.seek(frame)
          }
        }
        const runtime = controllerState.runtime
        const session = yield* runtime.replay.makeSession(frame)
        controllerState.stopObserving()
        yield* runtime.shutdown
        activateInspection(session)
        return session.readModel()
      })

    const run = (
      message: Message,
      options?: SendOptions,
    ): Effect.Effect<
      Model,
      ProgramRuntimeStartError | UnsettledReplayFrameError
    > =>
      Effect.gen(function* () {
        let liveRuntime: ProgramRuntime<Model, Message, P>
        if (controllerState._tag === 'Inspecting') {
          const tape = yield* controllerState.session.branch()
          const runtime = yield* makeLiveRuntime(fromReplay(tape))
          liveRuntime = activateLiveRuntime(runtime)
        } else {
          liveRuntime = controllerState.runtime
        }
        return yield* liveRuntime.run(message, options)
      })

    const observe = (
      listener: (snapshot: ReplayControllerSnapshot<Model>) => void,
    ): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }

    const readReplayTape = (): ReplayTape<Model, Message> => {
      if (controllerState._tag === 'Inspecting') {
        return controllerState.session.readTape()
      }
      return controllerState.runtime.replay.readTape()
    }
    const stateRoute = (): StateRoute<Model> => makeStateRoute(read().model)
    const replayRoute = (): ReplayRoute<Model, Message> =>
      makeReplayRoute(readReplayTape(), read().frame)
    const initialization = Effect.suspend(() => {
      if (controllerState._tag === 'Inspecting') {
        return Effect.succeed(controllerState.session.readModel())
      }
      return controllerState.runtime.initialization
    })
    const shutdown = Effect.suspend(() => {
      if (controllerState._tag === 'Inspecting') {
        return Effect.void
      }
      controllerState.stopObserving()
      return controllerState.runtime.shutdown
    })

    return {
      read,
      seek,
      stepBackward,
      stepForward,
      inspect,
      run,
      observe,
      stateRoute,
      replayRoute,
      readReplayTape,
      initialization,
      shutdown,
    }
  })

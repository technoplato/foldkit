import * as Calculator from 'calculator-core-example'
import * as Counter from 'counter-core-example'
import * as Counters from 'counters-core-example'
import {
  Array,
  Context,
  Crypto,
  Effect,
  Layer,
  Match as M,
  Option,
  Schema as S,
  Scope,
} from 'effect'
import * as Fact from 'fact-core-example'
import { Command, Program, Runtime } from 'foldkit'
import { m } from 'foldkit/message'

import {
  type ReplayDestination,
  ReplayProgramId,
  defaultReplayDestination,
} from './destination.js'
import {
  calculatorActions,
  counterActions,
  factActions,
  replayActionForId,
} from './manifest.js'

const Playback = S.Literals(['Paused', 'Playing'])
type Playback = typeof Playback.Type

const ControllerMode = S.Literals(['Inspecting', 'Live'])

const UnsavedReplay = S.TaggedStruct('UnsavedReplay', {})
const SavingReplay = S.TaggedStruct('SavingReplay', {})
const SavedReplay = S.TaggedStruct('SavedReplay', {
  autoplayUri: S.String,
  uri: S.String,
})
const FailedSavingReplay = S.TaggedStruct('FailedSavingReplay', {
  reason: S.String,
})

/** The persistence state of the current replay tape. */
export const ReplaySaveStatus = S.Union([
  UnsavedReplay,
  SavingReplay,
  SavedReplay,
  FailedSavingReplay,
])
/** The persistence state of the current replay tape. */
export type ReplaySaveStatus = typeof ReplaySaveStatus.Type

const LoadingWorkbench = S.TaggedStruct('Loading', {
  programId: ReplayProgramId,
})

const FailedWorkbench = S.TaggedStruct('Failed', {
  programId: ReplayProgramId,
  reason: S.String,
})

const CounterWorkbench = S.TaggedStruct('Counter', {
  controllerMode: ControllerMode,
  currentFrame: S.Int,
  finalFrame: S.Int,
  maybeError: S.Option(S.String),
  model: Counter.Model,
  playback: Playback,
  replayUri: S.String,
  replaySaveStatus: ReplaySaveStatus,
  stateUri: S.String,
  tape: Runtime.makeReplayTapeSchema(Counter.CounterProgram),
})

const CountersWorkbench = S.TaggedStruct('Counters', {
  controllerMode: ControllerMode,
  currentFrame: S.Int,
  finalFrame: S.Int,
  maybeError: S.Option(S.String),
  model: Counters.Model,
  playback: Playback,
  replayUri: S.String,
  replaySaveStatus: ReplaySaveStatus,
  stateUri: S.String,
  tape: Runtime.makeReplayTapeSchema(Counters.MultipleCountersProgram),
})

const CalculatorWorkbench = S.TaggedStruct('Calculator', {
  controllerMode: ControllerMode,
  currentFrame: S.Int,
  finalFrame: S.Int,
  maybeError: S.Option(S.String),
  model: Calculator.Model,
  playback: Playback,
  replayUri: S.String,
  replaySaveStatus: ReplaySaveStatus,
  stateUri: S.String,
  tape: Runtime.makeReplayTapeSchema(Calculator.CalculatorProgram),
})

const FactWorkbench = S.TaggedStruct('Fact', {
  controllerMode: ControllerMode,
  currentFrame: S.Int,
  finalFrame: S.Int,
  maybeError: S.Option(S.String),
  model: Fact.Model,
  playback: Playback,
  replayUri: S.String,
  replaySaveStatus: ReplaySaveStatus,
  stateUri: S.String,
  tape: Runtime.makeReplayTapeSchema(Fact.FactProgram),
})

/** A fully initialized replay workbench Model. */
export const ReadyModel = S.Union([
  CountersWorkbench,
  CounterWorkbench,
  CalculatorWorkbench,
  FactWorkbench,
])
/** A fully initialized replay workbench Model. */
export type ReadyModel = typeof ReadyModel.Type

/** The shared replay workbench Model for all registered Programs. */
export const Model = S.Union([
  LoadingWorkbench,
  FailedWorkbench,
  CountersWorkbench,
  CounterWorkbench,
  CalculatorWorkbench,
  FactWorkbench,
])
/** A shared replay workbench Model. */
export type Model = typeof Model.Type

/** Returns whether the workbench has completed initialization. */
export const isReady = (model: Model): model is ReadyModel =>
  model._tag === 'Counters' ||
  model._tag === 'Counter' ||
  model._tag === 'Calculator' ||
  model._tag === 'Fact'

/** Returns the registered Program name for a replay workbench Model. */
export const titleForModel = (model: Model): ReplayProgramId => {
  if (isReady(model)) {
    return model._tag
  } else {
    return model.programId
  }
}

/** Returns the primary host-neutral display text for a replay frame. */
export const displayForModel = (model: Model): string => {
  if (model._tag === 'Counters') {
    const destination = Counters.destinationForModel(model.model)
    return M.value(destination).pipe(
      M.withReturnType<string>(),
      M.tagsExhaustive({
        CounterListDestination: ({ counters }) =>
          Array.map(counters, counter => counter.counter.count).join(' · '),
        CounterDetailDestination: ({ counter }) =>
          counter.counter.count.toString(),
      }),
    )
  } else if (model._tag === 'Counter') {
    return model.model.count.toString()
  } else if (model._tag === 'Calculator') {
    return Calculator.displayForModel(model.model)
  } else if (model._tag === 'Fact') {
    return Fact.displayForModel(model.model)
  } else if (model._tag === 'Loading') {
    return 'Loading…'
  } else {
    return 'Unable to load'
  }
}

/** Returns supporting host-neutral detail text for a replay frame. */
export const detailForModel = (model: Model): string => {
  if (model._tag === 'Counters') {
    const destination = Counters.destinationForModel(model.model)
    return M.value(destination).pipe(
      M.withReturnType<string>(),
      M.tagsExhaustive({
        CounterListDestination: ({ counters }) =>
          `${counters.length.toString()} identified counters`,
        CounterDetailDestination: ({ counter, maybeMode }) =>
          Option.match(maybeMode, {
            onNone: () => `Detail for ${counter.id}`,
            onSome: mode => `${counter.id} | ${mode._tag}`,
          }),
      }),
    )
  } else if (model._tag === 'Counter') {
    return `count ${model.model.count.toString()}`
  } else if (model._tag === 'Calculator') {
    return Calculator.expressionForModel(model.model)
  } else if (model._tag === 'Fact') {
    return Fact.detailForModel(model.model)
  } else if (model._tag === 'Loading') {
    return `Restoring ${model.programId}`
  } else {
    return model.reason
  }
}

/** Returns the current domain state name for a replay frame. */
export const modeForModel = (model: Model): string => {
  if (model._tag === 'Counters') {
    return M.value(model.model.navigation).pipe(
      M.withReturnType<string>(),
      M.tagsExhaustive({
        CounterList: () => 'CounterList',
        CounterDetail: ({ maybeMode }) =>
          Option.match(maybeMode, {
            onNone: () => 'CounterDetail',
            onSome: mode => mode._tag,
          }),
      }),
    )
  } else if (model._tag === 'Counter') {
    return 'Counter'
  } else if (model._tag === 'Calculator') {
    return model.model._tag
  } else if (model._tag === 'Fact') {
    return model.model._tag
  } else {
    return model._tag
  }
}

/** Returns the current workbench error when one exists. */
export const errorForModel = (model: Model): string | undefined => {
  if (model._tag === 'Failed') {
    return model.reason
  } else if (isReady(model)) {
    return Option.getOrUndefined(model.maybeError)
  } else {
    return undefined
  }
}

/** The user selected another Program for replay. */
export const SelectedReplayProgram = m('SelectedReplayProgram', {
  programId: ReplayProgramId,
})
/** The user pressed one host-allowed domain action. */
export const PressedReplayAction = m('PressedReplayAction', {
  actionId: S.String,
})
/** The user selected an exact replay frame. */
export const ChangedReplayFrame = m('ChangedReplayFrame', { frame: S.Int })
/** The user pressed the previous-frame control. */
export const ClickedStepBackward = m('ClickedStepBackward')
/** The user pressed the next-frame control. */
export const ClickedStepForward = m('ClickedStepForward')
/** The user toggled automatic replay playback. */
export const ClickedPlayback = m('ClickedPlayback')
/** The user requested a durable UUID-backed replay URI. */
export const ClickedSaveReplay = m('ClickedSaveReplay')
/** The playback delay elapsed. */
export const AdvancedPlayback = m('AdvancedPlayback')
/** The replay workbench finished restoring its initial destination. */
export const CompletedInitializeReplayWorkbench = m(
  'CompletedInitializeReplayWorkbench',
  { model: ReadyModel },
)
/** The replay workbench could not restore its initial destination. */
export const FailedInitializeReplayWorkbench = m(
  'FailedInitializeReplayWorkbench',
  { reason: S.String },
)
/** A replay controller operation completed with a fresh presentation Model. */
export const CompletedReplayOperation = m('CompletedReplayOperation', {
  model: ReadyModel,
})
/** A replay controller operation failed. */
export const FailedReplayOperation = m('FailedReplayOperation', {
  reason: S.String,
})
/** The replay tape was saved and assigned a UUID-backed URI. */
export const CompletedSaveReplay = m('CompletedSaveReplay', {
  model: ReadyModel,
})
/** The replay tape could not be saved. */
export const FailedSaveReplay = m('FailedSaveReplay', {
  reason: S.String,
})

/** Every Message handled by the shared replay workbench. */
export const Message = S.Union([
  SelectedReplayProgram,
  PressedReplayAction,
  ChangedReplayFrame,
  ClickedStepBackward,
  ClickedStepForward,
  ClickedPlayback,
  ClickedSaveReplay,
  AdvancedPlayback,
  CompletedInitializeReplayWorkbench,
  FailedInitializeReplayWorkbench,
  CompletedReplayOperation,
  FailedReplayOperation,
  CompletedSaveReplay,
  FailedSaveReplay,
])
/** A shared replay workbench Message. */
export type Message = typeof Message.Type

type ActiveController =
  | Readonly<{
      _tag: 'Counters'
      controller: Runtime.ReplayController<Counters.Model, Counters.Message>
    }>
  | Readonly<{
      _tag: 'Counter'
      controller: Runtime.ReplayController<Counter.Model, Counter.Message>
    }>
  | Readonly<{
      _tag: 'Calculator'
      controller: Runtime.ReplayController<Calculator.Model, Calculator.Message>
    }>
  | Readonly<{
      _tag: 'Fact'
      controller: Runtime.ReplayController<Fact.Model, Fact.Message>
    }>

type ReplayWorkbenchServiceShape = Readonly<{
  initialize: Effect.Effect<ReadyModel>
  runAction: (actionId: string) => Effect.Effect<ReadyModel>
  seek: (frame: number) => Effect.Effect<ReadyModel>
  selectProgram: (programId: ReplayProgramId) => Effect.Effect<ReadyModel>
  saveReplay: Effect.Effect<ReadyModel, Runtime.SaveReplayTapeError>
}>

class ReplayWorkbenchService extends Context.Service<
  ReplayWorkbenchService,
  ReplayWorkbenchServiceShape
>()('Replayability/ReplayWorkbenchService') {}

const countersModel = (
  controller: Runtime.ReplayController<Counters.Model, Counters.Message>,
  maybeSavedTapeId: Option.Option<Program.ReplayTapeId>,
  playback: Playback = 'Paused',
): Effect.Effect<ReadyModel> =>
  Effect.suspend(() => {
    const snapshot = controller.read()
    const router = Program.makeRouter(Counters.MultipleCountersProgram)
    const replayRoute = Option.match(maybeSavedTapeId, {
      onNone: controller.replayRoute,
      onSome: tapeId => Program.savedReplay(tapeId, snapshot.frame),
    })
    const autoplayRoute = Option.match(maybeSavedTapeId, {
      onNone: controller.replayRoute,
      onSome: tapeId => Program.savedReplay(tapeId, 0, true),
    })
    return Effect.all({
      autoplayUri: router.print(autoplayRoute),
      stateUri: router.print(controller.stateRoute()),
      replayUri: router.print(replayRoute),
    }).pipe(
      Effect.orDie,
      Effect.map(uris =>
        CountersWorkbench.make({
          controllerMode: snapshot.mode,
          currentFrame: snapshot.frame,
          finalFrame: snapshot.finalFrame,
          maybeError: Option.none(),
          model: snapshot.model,
          playback,
          replayUri: uris.replayUri,
          replaySaveStatus: Option.match(maybeSavedTapeId, {
            onNone: () => UnsavedReplay.make({}),
            onSome: () =>
              SavedReplay.make({
                autoplayUri: uris.autoplayUri,
                uri: uris.replayUri,
              }),
          }),
          stateUri: uris.stateUri,
          tape: controller.readReplayTape(),
        }),
      ),
    )
  })

const counterModel = (
  controller: Runtime.ReplayController<Counter.Model, Counter.Message>,
  maybeSavedTapeId: Option.Option<Program.ReplayTapeId>,
  playback: Playback = 'Paused',
): Effect.Effect<ReadyModel> =>
  Effect.suspend(() => {
    const snapshot = controller.read()
    const router = Program.makeRouter(Counter.CounterProgram)
    const replayRoute = Option.match(maybeSavedTapeId, {
      onNone: controller.replayRoute,
      onSome: tapeId => Program.savedReplay(tapeId, snapshot.frame),
    })
    const autoplayRoute = Option.match(maybeSavedTapeId, {
      onNone: controller.replayRoute,
      onSome: tapeId => Program.savedReplay(tapeId, 0, true),
    })
    return Effect.all({
      autoplayUri: router.print(autoplayRoute),
      stateUri: router.print(controller.stateRoute()),
      replayUri: router.print(replayRoute),
    }).pipe(
      Effect.orDie,
      Effect.map(uris =>
        CounterWorkbench.make({
          controllerMode: snapshot.mode,
          currentFrame: snapshot.frame,
          finalFrame: snapshot.finalFrame,
          maybeError: Option.none(),
          model: snapshot.model,
          playback,
          replayUri: uris.replayUri,
          replaySaveStatus: Option.match(maybeSavedTapeId, {
            onNone: () => UnsavedReplay.make({}),
            onSome: () =>
              SavedReplay.make({
                autoplayUri: uris.autoplayUri,
                uri: uris.replayUri,
              }),
          }),
          stateUri: uris.stateUri,
          tape: controller.readReplayTape(),
        }),
      ),
    )
  })

const calculatorModel = (
  controller: Runtime.ReplayController<Calculator.Model, Calculator.Message>,
  maybeSavedTapeId: Option.Option<Program.ReplayTapeId>,
  playback: Playback = 'Paused',
): Effect.Effect<ReadyModel> =>
  Effect.suspend(() => {
    const snapshot = controller.read()
    const router = Program.makeRouter(Calculator.CalculatorProgram)
    const replayRoute = Option.match(maybeSavedTapeId, {
      onNone: controller.replayRoute,
      onSome: tapeId => Program.savedReplay(tapeId, snapshot.frame),
    })
    const autoplayRoute = Option.match(maybeSavedTapeId, {
      onNone: controller.replayRoute,
      onSome: tapeId => Program.savedReplay(tapeId, 0, true),
    })
    return Effect.all({
      autoplayUri: router.print(autoplayRoute),
      stateUri: router.print(controller.stateRoute()),
      replayUri: router.print(replayRoute),
    }).pipe(
      Effect.orDie,
      Effect.map(uris =>
        CalculatorWorkbench.make({
          controllerMode: snapshot.mode,
          currentFrame: snapshot.frame,
          finalFrame: snapshot.finalFrame,
          maybeError: Option.none(),
          model: snapshot.model,
          playback,
          replayUri: uris.replayUri,
          replaySaveStatus: Option.match(maybeSavedTapeId, {
            onNone: () => UnsavedReplay.make({}),
            onSome: () =>
              SavedReplay.make({
                autoplayUri: uris.autoplayUri,
                uri: uris.replayUri,
              }),
          }),
          stateUri: uris.stateUri,
          tape: controller.readReplayTape(),
        }),
      ),
    )
  })

const factModel = (
  controller: Runtime.ReplayController<Fact.Model, Fact.Message>,
  maybeSavedTapeId: Option.Option<Program.ReplayTapeId>,
  playback: Playback = 'Paused',
): Effect.Effect<ReadyModel> =>
  Effect.suspend(() => {
    const snapshot = controller.read()
    const router = Program.makeRouter(Fact.FactProgram)
    const replayRoute = Option.match(maybeSavedTapeId, {
      onNone: controller.replayRoute,
      onSome: tapeId => Program.savedReplay(tapeId, snapshot.frame),
    })
    const autoplayRoute = Option.match(maybeSavedTapeId, {
      onNone: controller.replayRoute,
      onSome: tapeId => Program.savedReplay(tapeId, 0, true),
    })
    return Effect.all({
      autoplayUri: router.print(autoplayRoute),
      stateUri: router.print(controller.stateRoute()),
      replayUri: router.print(replayRoute),
    }).pipe(
      Effect.orDie,
      Effect.map(uris =>
        FactWorkbench.make({
          controllerMode: snapshot.mode,
          currentFrame: snapshot.frame,
          finalFrame: snapshot.finalFrame,
          maybeError: Option.none(),
          model: snapshot.model,
          playback,
          replayUri: uris.replayUri,
          replaySaveStatus: Option.match(maybeSavedTapeId, {
            onNone: () => UnsavedReplay.make({}),
            onSome: () =>
              SavedReplay.make({
                autoplayUri: uris.autoplayUri,
                uri: uris.replayUri,
              }),
          }),
          stateUri: uris.stateUri,
          tape: controller.readReplayTape(),
        }),
      ),
    )
  })

const modelForController = (
  active: ActiveController,
  maybeSavedTapeId: Option.Option<Program.ReplayTapeId>,
  playback: Playback = 'Paused',
): Effect.Effect<ReadyModel> =>
  M.value(active).pipe(
    M.withReturnType<Effect.Effect<ReadyModel>>(),
    M.tagsExhaustive({
      Counters: ({ controller }) =>
        countersModel(controller, maybeSavedTapeId, playback),
      Counter: ({ controller }) =>
        counterModel(controller, maybeSavedTapeId, playback),
      Calculator: ({ controller }) =>
        calculatorModel(controller, maybeSavedTapeId, playback),
      Fact: ({ controller }) =>
        factModel(controller, maybeSavedTapeId, playback),
    }),
  )

const initializeController = (active: ActiveController): Effect.Effect<void> =>
  M.value(active).pipe(
    M.withReturnType<Effect.Effect<void>>(),
    M.tagsExhaustive({
      Counters: ({ controller }) =>
        controller.initialization.pipe(Effect.asVoid),
      Counter: ({ controller }) =>
        controller.initialization.pipe(Effect.asVoid),
      Calculator: ({ controller }) =>
        controller.initialization.pipe(Effect.asVoid),
      Fact: ({ controller }) => controller.initialization.pipe(Effect.asVoid),
    }),
  )

const controllerForDestination = (
  destination: ReplayDestination,
  scope: Scope.Scope,
  factResources: Layer.Layer<Fact.FactClient>,
): Effect.Effect<
  ActiveController,
  never,
  Runtime.ReplayTapeStore | Crypto.Crypto
> =>
  M.value(destination).pipe(
    M.withReturnType<
      Effect.Effect<
        ActiveController,
        never,
        Runtime.ReplayTapeStore | Crypto.Crypto
      >
    >(),
    M.tagsExhaustive({
      Counters: ({ route }) =>
        Runtime.resolveProgramRoute(
          Counters.MultipleCountersProgram,
          route,
        ).pipe(
          Effect.orDie,
          Effect.flatMap(resolvedRoute =>
            Effect.provideService(
              Runtime.makeReplayController({
                program: Counters.MultipleCountersProgram,
                resources: Counters.StaticCounterFactClient,
                route: resolvedRoute,
              }).pipe(Effect.orDie),
              Scope.Scope,
              scope,
            ),
          ),
          Effect.map(controller => ({ _tag: 'Counters', controller })),
        ),
      Counter: ({ route }) =>
        Runtime.resolveProgramRoute(Counter.CounterProgram, route).pipe(
          Effect.orDie,
          Effect.flatMap(resolvedRoute =>
            Effect.provideService(
              Runtime.makeReplayController({
                program: Counter.CounterProgram,
                resources: Layer.empty,
                route: resolvedRoute,
              }).pipe(Effect.orDie),
              Scope.Scope,
              scope,
            ),
          ),
          Effect.map(controller => ({ _tag: 'Counter', controller })),
        ),
      Calculator: ({ route }) =>
        Runtime.resolveProgramRoute(Calculator.CalculatorProgram, route).pipe(
          Effect.orDie,
          Effect.flatMap(resolvedRoute =>
            Effect.provideService(
              Runtime.makeReplayController({
                program: Calculator.CalculatorProgram,
                resources: Layer.empty,
                route: resolvedRoute,
              }).pipe(Effect.orDie),
              Scope.Scope,
              scope,
            ),
          ),
          Effect.map(controller => ({ _tag: 'Calculator', controller })),
        ),
      Fact: ({ route }) =>
        Runtime.resolveProgramRoute(Fact.FactProgram, route).pipe(
          Effect.orDie,
          Effect.flatMap(resolvedRoute =>
            Effect.provideService(
              Runtime.makeReplayController({
                program: Fact.FactProgram,
                resources: factResources,
                route: resolvedRoute,
              }).pipe(Effect.orDie),
              Scope.Scope,
              scope,
            ),
          ),
          Effect.map(controller => ({ _tag: 'Fact', controller })),
        ),
    }),
  )

const savedTapeIdForDestination = (
  destination: ReplayDestination,
): Option.Option<Program.ReplayTapeId> =>
  destination.route._tag === 'SavedReplay'
    ? Option.some(destination.route.tapeId)
    : Option.none()

const playbackForDestination = (destination: ReplayDestination): Playback =>
  destination.route._tag !== 'State' && destination.route.isPlaying
    ? 'Playing'
    : 'Paused'

const seekController = (
  active: ActiveController,
  frame: number,
): Effect.Effect<void> =>
  M.value(active).pipe(
    M.withReturnType<Effect.Effect<void>>(),
    M.tagsExhaustive({
      Counters: ({ controller }) =>
        (controller.read().mode === 'Live'
          ? controller.inspect(frame)
          : controller.seek(frame)
        ).pipe(Effect.orDie, Effect.asVoid),
      Counter: ({ controller }) =>
        (controller.read().mode === 'Live'
          ? controller.inspect(frame)
          : controller.seek(frame)
        ).pipe(Effect.orDie, Effect.asVoid),
      Calculator: ({ controller }) =>
        (controller.read().mode === 'Live'
          ? controller.inspect(frame)
          : controller.seek(frame)
        ).pipe(Effect.orDie, Effect.asVoid),
      Fact: ({ controller }) =>
        (controller.read().mode === 'Live'
          ? controller.inspect(frame)
          : controller.seek(frame)
        ).pipe(Effect.orDie, Effect.asVoid),
    }),
  )

const runControllerAction = (
  active: ActiveController,
  actionId: string,
): Effect.Effect<void> =>
  M.value(active).pipe(
    M.withReturnType<Effect.Effect<void>>(),
    M.tagsExhaustive({
      Counters: ({ controller }) => {
        const maybeMessage = Counters.messageForInteractionToken(
          controller.read().model,
          actionId,
        )
        return Option.isSome(maybeMessage)
          ? controller
              .run(maybeMessage.value, { actionName: actionId })
              .pipe(Effect.orDie, Effect.asVoid)
          : Effect.void
      },
      Counter: ({ controller }) => {
        const maybeAction = replayActionForId(counterActions, actionId)
        return Option.isSome(maybeAction)
          ? controller
              .run(maybeAction.value.message, { actionName: actionId })
              .pipe(Effect.orDie, Effect.asVoid)
          : Effect.void
      },
      Calculator: ({ controller }) => {
        const maybeAction = replayActionForId(calculatorActions, actionId)
        return Option.isSome(maybeAction)
          ? controller
              .run(maybeAction.value.message, { actionName: actionId })
              .pipe(Effect.orDie, Effect.asVoid)
          : Effect.void
      },
      Fact: ({ controller }) => {
        const maybeAction = replayActionForId(factActions, actionId)
        return Option.isSome(maybeAction)
          ? controller
              .run(maybeAction.value.message, { actionName: actionId })
              .pipe(Effect.orDie, Effect.asVoid)
          : Effect.void
      },
    }),
  )

const makeReplayWorkbenchService = (
  initialDestination: ReplayDestination,
  factResources: Layer.Layer<Fact.FactClient>,
): Effect.Effect<
  ReplayWorkbenchServiceShape,
  never,
  Crypto.Crypto | Runtime.ReplayTapeStore | Scope.Scope
> =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    const crypto = yield* Crypto.Crypto
    const replayTapeStore = yield* Runtime.ReplayTapeStore
    let active = yield* controllerForDestination(
      initialDestination,
      scope,
      factResources,
    ).pipe(
      Effect.provideService(Runtime.ReplayTapeStore, replayTapeStore),
      Effect.provideService(Crypto.Crypto, crypto),
    )
    let maybeSavedTapeId = savedTapeIdForDestination(initialDestination)

    const initialize = Effect.andThen(
      initializeController(active),
      Effect.suspend(() =>
        modelForController(
          active,
          maybeSavedTapeId,
          playbackForDestination(initialDestination),
        ),
      ),
    )
    const runAction = (actionId: string): Effect.Effect<ReadyModel> =>
      runControllerAction(active, actionId).pipe(
        Effect.andThen(
          Effect.sync(() => {
            maybeSavedTapeId = Option.none()
          }),
        ),
        Effect.andThen(
          Effect.suspend(() => modelForController(active, maybeSavedTapeId)),
        ),
      )
    const seek = (frame: number): Effect.Effect<ReadyModel> =>
      Effect.andThen(
        seekController(active, frame),
        Effect.suspend(() => modelForController(active, maybeSavedTapeId)),
      )
    const selectProgram = (
      programId: ReplayProgramId,
    ): Effect.Effect<ReadyModel> =>
      Effect.gen(function* () {
        const destination = yield* defaultReplayDestination(programId)
        const previous = active
        active = yield* controllerForDestination(
          destination,
          scope,
          factResources,
        ).pipe(
          Effect.provideService(Runtime.ReplayTapeStore, replayTapeStore),
          Effect.provideService(Crypto.Crypto, crypto),
        )
        maybeSavedTapeId = Option.none()
        yield* M.value(previous).pipe(
          M.withReturnType<Effect.Effect<void>>(),
          M.tagsExhaustive({
            Counters: ({ controller }) => controller.shutdown,
            Counter: ({ controller }) => controller.shutdown,
            Calculator: ({ controller }) => controller.shutdown,
            Fact: ({ controller }) => controller.shutdown,
          }),
        )
        yield* initializeController(active)
        return yield* modelForController(active, maybeSavedTapeId)
      })

    const saveReplay = Effect.suspend(() =>
      M.value(active).pipe(
        M.withReturnType<
          Effect.Effect<ReadyModel, Runtime.SaveReplayTapeError>
        >(),
        M.tagsExhaustive({
          Counters: ({ controller }) =>
            Runtime.saveReplayTape(
              Counters.MultipleCountersProgram,
              controller.readReplayTape(),
              controller.read().frame,
            ).pipe(
              Effect.provideService(Runtime.ReplayTapeStore, replayTapeStore),
              Effect.provideService(Crypto.Crypto, crypto),
              Effect.tap(savedRoute =>
                Effect.sync(() => {
                  maybeSavedTapeId = Option.some(savedRoute.tapeId)
                }),
              ),
              Effect.flatMap(() =>
                modelForController(active, maybeSavedTapeId),
              ),
            ),
          Counter: ({ controller }) =>
            Runtime.saveReplayTape(
              Counter.CounterProgram,
              controller.readReplayTape(),
              controller.read().frame,
            ).pipe(
              Effect.provideService(Runtime.ReplayTapeStore, replayTapeStore),
              Effect.provideService(Crypto.Crypto, crypto),
              Effect.tap(savedRoute =>
                Effect.sync(() => {
                  maybeSavedTapeId = Option.some(savedRoute.tapeId)
                }),
              ),
              Effect.flatMap(() =>
                modelForController(active, maybeSavedTapeId),
              ),
            ),
          Calculator: ({ controller }) =>
            Runtime.saveReplayTape(
              Calculator.CalculatorProgram,
              controller.readReplayTape(),
              controller.read().frame,
            ).pipe(
              Effect.provideService(Runtime.ReplayTapeStore, replayTapeStore),
              Effect.provideService(Crypto.Crypto, crypto),
              Effect.tap(savedRoute =>
                Effect.sync(() => {
                  maybeSavedTapeId = Option.some(savedRoute.tapeId)
                }),
              ),
              Effect.flatMap(() =>
                modelForController(active, maybeSavedTapeId),
              ),
            ),
          Fact: ({ controller }) =>
            Runtime.saveReplayTape(
              Fact.FactProgram,
              controller.readReplayTape(),
              controller.read().frame,
            ).pipe(
              Effect.provideService(Runtime.ReplayTapeStore, replayTapeStore),
              Effect.provideService(Crypto.Crypto, crypto),
              Effect.tap(savedRoute =>
                Effect.sync(() => {
                  maybeSavedTapeId = Option.some(savedRoute.tapeId)
                }),
              ),
              Effect.flatMap(() =>
                modelForController(active, maybeSavedTapeId),
              ),
            ),
        }),
      ),
    )

    return { initialize, runAction, saveReplay, seek, selectProgram }
  })

const withFailureMessage = (
  effect: Effect.Effect<ReadyModel, unknown, ReplayWorkbenchService>,
): Effect.Effect<
  typeof CompletedReplayOperation.Type | typeof FailedReplayOperation.Type,
  never,
  ReplayWorkbenchService
> =>
  effect.pipe(
    Effect.map(model => CompletedReplayOperation({ model })),
    Effect.catch(cause =>
      Effect.succeed(
        FailedReplayOperation({ reason: globalThis.String(cause) }),
      ),
    ),
  )

const InitializeReplayWorkbench = Command.define(
  'InitializeReplayWorkbench',
  CompletedInitializeReplayWorkbench,
  FailedInitializeReplayWorkbench,
)(
  Effect.flatMap(ReplayWorkbenchService, service =>
    service.initialize.pipe(
      Effect.map(model => CompletedInitializeReplayWorkbench({ model })),
      Effect.catch(cause =>
        Effect.succeed(
          FailedInitializeReplayWorkbench({
            reason: globalThis.String(cause),
          }),
        ),
      ),
    ),
  ),
)

const RunReplayAction = Command.define(
  'RunReplayAction',
  { actionId: S.String },
  CompletedReplayOperation,
  FailedReplayOperation,
)(({ actionId }) =>
  Effect.flatMap(ReplayWorkbenchService, service =>
    withFailureMessage(service.runAction(actionId)),
  ),
)

const SeekReplayFrame = Command.define(
  'SeekReplayFrame',
  { frame: S.Int },
  CompletedReplayOperation,
  FailedReplayOperation,
)(({ frame }) =>
  Effect.flatMap(ReplayWorkbenchService, service =>
    withFailureMessage(service.seek(frame)),
  ),
)

const SelectReplayProgram = Command.define(
  'SelectReplayProgram',
  { programId: ReplayProgramId },
  CompletedReplayOperation,
  FailedReplayOperation,
)(({ programId }) =>
  Effect.flatMap(ReplayWorkbenchService, service =>
    withFailureMessage(service.selectProgram(programId)),
  ),
)

const SaveReplay = Command.define(
  'SaveReplay',
  CompletedSaveReplay,
  FailedSaveReplay,
)(
  Effect.flatMap(ReplayWorkbenchService, service =>
    service.saveReplay.pipe(
      Effect.map(model => CompletedSaveReplay({ model })),
      Effect.catch(cause =>
        Effect.succeed(FailedSaveReplay({ reason: globalThis.String(cause) })),
      ),
    ),
  ),
)

const SchedulePlaybackAdvance = Command.define(
  'SchedulePlaybackAdvance',
  AdvancedPlayback,
)(Effect.sleep('500 millis').pipe(Effect.as(AdvancedPlayback())))

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, ReplayWorkbenchService>>,
]

const withPlayback = (model: ReadyModel, playback: Playback): ReadyModel =>
  ReadyModel.make({ ...model, playback })

const withReplaySaveStatus = (
  model: ReadyModel,
  replaySaveStatus: ReplaySaveStatus,
): ReadyModel => ReadyModel.make({ ...model, replaySaveStatus })

const initializedModelUpdate = (initializedModel: ReadyModel): UpdateReturn => {
  if (initializedModel.playback === 'Paused') {
    return [initializedModel, []]
  } else if (initializedModel.currentFrame >= initializedModel.finalFrame) {
    return [initializedModel, [SeekReplayFrame({ frame: 0 })]]
  } else {
    return [initializedModel, [SchedulePlaybackAdvance()]]
  }
}

const updateReadyModel = (model: ReadyModel, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      SelectedReplayProgram: ({ programId }) => [
        withPlayback(model, 'Paused'),
        [SelectReplayProgram({ programId })],
      ],
      PressedReplayAction: ({ actionId }) => [
        withPlayback(model, 'Paused'),
        [RunReplayAction({ actionId })],
      ],
      ChangedReplayFrame: ({ frame }) => [
        withPlayback(model, 'Paused'),
        [SeekReplayFrame({ frame })],
      ],
      ClickedStepBackward: () => [
        withPlayback(model, 'Paused'),
        [SeekReplayFrame({ frame: Math.max(0, model.currentFrame - 1) })],
      ],
      ClickedStepForward: () => [
        withPlayback(model, 'Paused'),
        [
          SeekReplayFrame({
            frame: Math.min(model.finalFrame, model.currentFrame + 1),
          }),
        ],
      ],
      ClickedPlayback: () => {
        if (model.playback === 'Playing') {
          return [withPlayback(model, 'Paused'), []]
        }
        const nextModel = withPlayback(model, 'Playing')
        return model.currentFrame >= model.finalFrame
          ? [nextModel, [SeekReplayFrame({ frame: 0 })]]
          : [nextModel, [SchedulePlaybackAdvance()]]
      },
      ClickedSaveReplay: () => [
        withReplaySaveStatus(model, SavingReplay.make({})),
        [SaveReplay()],
      ],
      AdvancedPlayback: () => {
        if (model.playback === 'Paused') {
          return [model, []]
        }
        return [
          model,
          [
            SeekReplayFrame({
              frame: Math.min(model.finalFrame, model.currentFrame + 1),
            }),
          ],
        ]
      },
      CompletedInitializeReplayWorkbench: ({ model: initializedModel }) =>
        initializedModelUpdate(initializedModel),
      FailedInitializeReplayWorkbench: ({ reason }) => [
        FailedWorkbench.make({
          programId: titleForModel(model),
          reason,
        }),
        [],
      ],
      CompletedReplayOperation: ({ model: completedModel }) => {
        const isFinished =
          completedModel.currentFrame >= completedModel.finalFrame
        const nextPlayback = isFinished ? 'Paused' : model.playback
        const nextModel = ReadyModel.make({
          ...completedModel,
          playback: nextPlayback,
        })
        return nextPlayback === 'Playing'
          ? [nextModel, [SchedulePlaybackAdvance()]]
          : [nextModel, []]
      },
      FailedReplayOperation: ({ reason }) => [
        ReadyModel.make({
          ...model,
          maybeError: Option.some(reason),
          playback: 'Paused',
        }),
        [],
      ],
      CompletedSaveReplay: ({ model: savedModel }) => [savedModel, []],
      FailedSaveReplay: ({ reason }) => [
        withReplaySaveStatus(model, FailedSavingReplay.make({ reason })),
        [],
      ],
    }),
  )

/** Applies one replay workbench Message. */
export const update = (model: Model, message: Message): UpdateReturn => {
  if (isReady(model)) {
    return updateReadyModel(model, message)
  }
  return M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      SelectedReplayProgram: ({ programId }) => [
        LoadingWorkbench.make({ programId }),
        [SelectReplayProgram({ programId })],
      ],
      PressedReplayAction: () => [model, []],
      ChangedReplayFrame: () => [model, []],
      ClickedStepBackward: () => [model, []],
      ClickedStepForward: () => [model, []],
      ClickedPlayback: () => [model, []],
      ClickedSaveReplay: () => [model, []],
      AdvancedPlayback: () => [model, []],
      CompletedInitializeReplayWorkbench: ({ model: initializedModel }) =>
        initializedModelUpdate(initializedModel),
      FailedInitializeReplayWorkbench: ({ reason }) => [
        FailedWorkbench.make({ programId: model.programId, reason }),
        [],
      ],
      CompletedReplayOperation: ({ model: completedModel }) => [
        completedModel,
        [],
      ],
      FailedReplayOperation: ({ reason }) => [
        FailedWorkbench.make({ programId: model.programId, reason }),
        [],
      ],
      CompletedSaveReplay: ({ model: savedModel }) => [savedModel, []],
      FailedSaveReplay: ({ reason }) => [
        FailedWorkbench.make({ programId: model.programId, reason }),
        [],
      ],
    }),
  )
}

/** Creates the shared replay workbench Program and its controller Layer. */
export const makeReplayWorkbench = (
  destination: ReplayDestination,
  replayTapeStore: Runtime.ReplayTapeStoreService,
  cryptoLayer: Layer.Layer<Crypto.Crypto>,
  factResources: Layer.Layer<Fact.FactClient>,
) => {
  const program = Program.make({
    id: 'replayability-workbench',
    version: 1,
    Model,
    Message,
    init: (): UpdateReturn => [
      LoadingWorkbench.make({ programId: destination._tag }),
      [InitializeReplayWorkbench()],
    ],
    update,
  })
  const resources = Layer.provide(
    Layer.effect(
      ReplayWorkbenchService,
      makeReplayWorkbenchService(destination, factResources),
    ),
    Layer.merge(
      cryptoLayer,
      Layer.succeed(Runtime.ReplayTapeStore, replayTapeStore),
    ),
  )
  return { program, resources }
}

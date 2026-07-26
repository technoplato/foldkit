import { Effect, Layer, Schema, Scope } from 'effect'

import { make as makeProgram } from '../program/program.js'
import type { ProgramCommand } from '../program/program.js'
import type { Subscriptions } from '../subscription/subscription.js'
import { makeProgramRuntime } from './programRuntime.js'

/** Configuration for the legacy renderer-free host facade. */
export type HostRuntimeConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
> = Readonly<{
  id?: string
  version?: number
  Model: Schema.Codec<Model, unknown, never, never>
  Message: Schema.Codec<Message, unknown, never, never>
  init: () => readonly [
    Model,
    ReadonlyArray<ProgramCommand<Message, Resources>>,
  ]
  update: (
    model: Model,
    message: Message,
  ) => readonly [Model, ReadonlyArray<ProgramCommand<Message, Resources>>]
  subscriptions?: Subscriptions<Model, Message, Resources>
  resources: Layer.Layer<Resources>
}>

/** A compatibility view of the shared renderer-free Program runtime. */
export type HostRuntime<Model, Message> = Readonly<{
  /** Returns the current immutable Model synchronously. */
  readModel: () => Model
  /** Enqueues one Message without waiting for its causal work to complete. */
  enqueueMessage: (message: Message) => void
  /** Registers a listener for changed Models and returns an unsubscribe function. */
  observeModel: (listener: (model: Model) => void) => () => void
  /** Enqueues one Message and completes after its finite causal work completes. */
  run: (message: Message) => Effect.Effect<Model>
  /** Completes after the finite Command chain returned by init completes. */
  initialization: Effect.Effect<Model>
  /** Stops Commands and Subscriptions and releases the shared resources Layer. */
  shutdown: Effect.Effect<void>
}>

/**
 * Starts the legacy host facade over the shared Program runtime.
 *
 * @deprecated Define a `Program` and use `makeProgramRuntime` so clients can
 * share the typed journal, replay, diagnostics, and portable routes.
 */
export const makeHostRuntime = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
>(
  config: HostRuntimeConfig<Model, Message, Resources>,
): Effect.Effect<HostRuntime<Model, Message>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const program = makeProgram({
      id: config.id ?? 'legacy-host-program',
      version: config.version ?? 1,
      Model: config.Model,
      Message: config.Message,
      init: config.init,
      update: config.update,
      ...(config.subscriptions === undefined
        ? {}
        : { subscriptions: config.subscriptions }),
    })
    const runtime = yield* Effect.orDie(
      makeProgramRuntime({ program, resources: config.resources }),
    )
    return {
      readModel: runtime.readModel,
      enqueueMessage: runtime.send,
      observeModel: runtime.observeModel,
      run: runtime.run,
      initialization: runtime.initialization,
      shutdown: runtime.shutdown,
    }
  })

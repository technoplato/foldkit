import { Effect, Layer, Scope } from 'effect'

import type { Program } from '../program/program.js'
import {
  type ProgramRuntimeStartError,
  makeProgramRuntime,
} from './programRuntime.js'
import type { ReplayTape } from './replayTape.js'

/** Records real Messages and their complete Command chains into a typed tape. */
export const recordReplayTape = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
>(
  program: Program<Model, Message, Resources>,
  resources: Layer.Layer<Resources>,
  messages: ReadonlyArray<Message>,
): Effect.Effect<
  ReplayTape<Model, Message>,
  ProgramRuntimeStartError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const runtime = yield* makeProgramRuntime({ program, resources })
    yield* runtime.initialization
    yield* Effect.forEach(messages, message => runtime.run(message), {
      discard: true,
    })
    const tape = runtime.replay.readTape()
    yield* runtime.shutdown
    return tape
  })

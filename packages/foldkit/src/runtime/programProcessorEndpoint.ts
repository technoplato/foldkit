import { Array, Effect, Option, Schema } from 'effect'

import type { Ports } from '../port/port.js'
import { Descriptor } from '../processor/processor.js'
import type { Descriptor as ProcessorDescriptor } from '../processor/processor.js'
import type { ProgramSchema } from '../program/program.js'
import type { ProgramRuntime, SendOptions } from './programRuntime.js'

const PROGRAM_PROCESSOR_PROTOCOL_VERSION = 1

type ProgramIdentity<Model> = Readonly<{
  id: string
  version: number
  Model: ProgramSchema<Model>
}>

/** One atomic, transport-neutral view of a live Program Processor. */
export type ProgramProcessorSnapshot<Model> = Readonly<{
  protocolVersion: 1
  processor: ProcessorDescriptor
  programId: string
  programVersion: number
  sequence: number
  model: Model
}>

/** Builds the portable snapshot Schema for one Program version. */
export const makeProgramProcessorSnapshotSchema = <Model>(
  program: ProgramIdentity<Model>,
) =>
  Schema.Struct({
    protocolVersion: Schema.Literal(PROGRAM_PROCESSOR_PROTOCOL_VERSION),
    processor: Descriptor,
    programId: Schema.Literal(program.id),
    programVersion: Schema.Literal(program.version),
    sequence: Schema.Int,
    model: program.Model,
  })

/** Configuration for exposing one live Program runtime to attached Clients. */
export type ProgramProcessorEndpointConfig<
  Model,
  Message,
  P extends Ports | undefined = undefined,
> = Readonly<{
  program: ProgramIdentity<Model>
  processor: ProcessorDescriptor
  runtime: ProgramRuntime<Model, Message, P>
}>

/** A transport-neutral attachment point owned by a longer-lived Processor. */
export type ProgramProcessorEndpoint<Model, Message> = Readonly<{
  /** Returns the current sequence and Model from one atomic journal read. */
  readSnapshot: () => ProgramProcessorSnapshot<Model>
  /** Sends a Message and returns the latest snapshot after finite work settles. */
  run: (
    message: Message,
    options?: SendOptions,
  ) => Effect.Effect<ProgramProcessorSnapshot<Model>>
  /**
   * Emits the current snapshot synchronously, then every subsequent snapshot.
   *
   * Returns a detach function without transferring ownership of the runtime.
   */
  attach: (
    listener: (snapshot: ProgramProcessorSnapshot<Model>) => void,
  ) => () => void
}>

/** Creates an endpoint after the Processor's initialization work has settled. */
export const makeProgramProcessorEndpoint = <
  Model,
  Message,
  P extends Ports | undefined = undefined,
>({
  program,
  processor,
  runtime,
}: ProgramProcessorEndpointConfig<Model, Message, P>): Effect.Effect<
  ProgramProcessorEndpoint<Model, Message>
> =>
  Effect.gen(function* () {
    yield* runtime.initialization

    const readSnapshot = (): ProgramProcessorSnapshot<Model> => {
      const journalSnapshot = runtime.journal.read()
      const sequence = Option.match(Array.last(journalSnapshot.transitions), {
        onNone: () => journalSnapshot.retainedFromSequence,
        onSome: transition => transition.sequence,
      })
      return {
        protocolVersion: PROGRAM_PROCESSOR_PROTOCOL_VERSION,
        processor,
        programId: program.id,
        programVersion: program.version,
        sequence,
        model: journalSnapshot.latestModel,
      }
    }

    const run = (
      message: Message,
      options?: SendOptions,
    ): Effect.Effect<ProgramProcessorSnapshot<Model>> =>
      runtime.run(message, options).pipe(Effect.map(readSnapshot))

    const attach = (
      listener: (snapshot: ProgramProcessorSnapshot<Model>) => void,
    ): (() => void) => {
      const detach = runtime.journal.observe(() => {
        listener(readSnapshot())
      })
      try {
        listener(readSnapshot())
      } catch (error) {
        detach()
        throw error
      }
      return detach
    }

    return { readSnapshot, run, attach }
  })

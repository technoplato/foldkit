import { Effect, Schema } from 'effect'

import type { EffectManifest } from '../command/effectManifest.js'
import { MessageEnvelope } from '../processor/processor.js'
import { TransitionSource } from './programJournal.js'

/** A manifested Command returned while a Program is starting. */
export const InitializationCommandCause = Schema.TaggedStruct(
  'Initialization',
  {
    startupOccurrenceId: Schema.OptionFromNullOr(Schema.String),
  },
)

/** A manifested Command returned while a Program is starting. */
export type InitializationCommandCause = typeof InitializationCommandCause.Type

/** A manifested Command caused by one accepted or local Message. */
export const MessageCommandCause = Schema.TaggedStruct('Message', {
  envelope: Schema.OptionFromNullOr(MessageEnvelope),
  source: TransitionSource,
})

/** A manifested Command caused by one accepted or local Message. */
export type MessageCommandCause = typeof MessageCommandCause.Type

/** Provenance from which a Processor derives a durable effect request ID. */
export type ProgramCommandCause =
  | InitializationCommandCause
  | MessageCommandCause

/** A manifested Command whose Effect remains inert until its scheduler runs it. */
export type ScheduledProgramCommand<Message> = Readonly<{
  programId: string
  programVersion: number
  commandIndex: number
  name: string
  args?: Record<string, unknown>
  effectManifest: EffectManifest
  cause: ProgramCommandCause
  execute: Effect.Effect<Message>
}>

/**
 * Owns placement, execution, and result proposal for manifested Commands.
 *
 * The scheduler must not send the result directly back into the originating
 * runtime. It proposes the result to the shared Message transport and lets the
 * accepted occurrence return through normal Message intake.
 */
export type ProgramRuntimeCommandScheduler<Message> = Readonly<{
  startupOccurrenceId?: string
  schedule: (command: ScheduledProgramCommand<Message>) => Effect.Effect<void>
}>

import { Array, Data, Effect, Option, Schema, pipe } from 'effect'

import type { Ports } from '../port/port.js'
import { MessageEnvelope } from '../processor/processor.js'
import type { MessageEnvelope as MessageEnvelopeType } from '../processor/processor.js'
import type { Program } from '../program/program.js'
import {
  type CommandRecord,
  type ProgramJournalSnapshot,
  TransitionSource,
} from './programJournal.js'

const REPLAY_TAPE_FORMAT_VERSION = 1

const EncodedCommandRecord = Schema.Struct({
  name: Schema.String,
  args: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
})

const EncodedReplayTransition = Schema.Struct({
  sequence: Schema.Int,
  message: Schema.Json,
  envelope: Schema.optionalKey(MessageEnvelope),
  source: TransitionSource,
  operationId: Schema.optionalKey(Schema.Int),
  isOperationSettled: Schema.Boolean,
  commands: Schema.Array(EncodedCommandRecord),
  timestamp: Schema.Number,
})

/** One renderer-independent runtime event anchored to a replay frame. */
export const ProgramRuntimeEvent = Schema.Struct({
  name: Schema.String,
  attributes: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  afterFrame: Schema.Int,
  timestamp: Schema.Number,
})

/** One renderer-independent runtime event anchored to a replay frame. */
export type ProgramRuntimeEvent = typeof ProgramRuntimeEvent.Type

/** Host-supplied data recorded beside, but never applied as, a Message. */
export type ProgramRuntimeEventInput = Readonly<{
  name: string
  attributes?: Record<string, Schema.Json>
  timestamp?: number
}>

const ProgramRuntimeEvents = Schema.Array(ProgramRuntimeEvent).pipe(
  Schema.withDecodingDefaultKey(Effect.succeed([])),
)

const EncodedReplayTape = Schema.Struct({
  formatVersion: Schema.Literal(REPLAY_TAPE_FORMAT_VERSION),
  programId: Schema.String,
  programVersion: Schema.Int,
  initialModel: Schema.Json,
  initialCommands: Schema.Array(EncodedCommandRecord),
  transitions: Schema.Array(EncodedReplayTransition),
  runtimeEvents: ProgramRuntimeEvents,
})

/** Builds the typed replay tape Schema for a Program. */
export const makeReplayTapeSchema = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
) =>
  Schema.Struct({
    formatVersion: Schema.Literal(REPLAY_TAPE_FORMAT_VERSION),
    programId: Schema.Literal(program.id),
    programVersion: Schema.Literal(program.version),
    initialModel: program.Model,
    initialCommands: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        args: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
      }),
    ),
    transitions: Schema.Array(
      Schema.Struct({
        sequence: Schema.Int,
        message: program.Message,
        envelope: Schema.optionalKey(MessageEnvelope),
        source: TransitionSource,
        operationId: Schema.optionalKey(Schema.Int),
        isOperationSettled: Schema.Boolean,
        commands: Schema.Array(
          Schema.Struct({
            name: Schema.String,
            args: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
          }),
        ),
        timestamp: Schema.Number,
      }),
    ),
    runtimeEvents: ProgramRuntimeEvents,
  })

const ReplayTapeHeader = Schema.Struct({
  formatVersion: Schema.Int,
  programId: Schema.String,
  programVersion: Schema.Int,
})

type EncodedReplayTape = typeof EncodedReplayTape.Type
type EncodedReplayTransition = typeof EncodedReplayTransition.Type

/** A Message and its runtime provenance in a portable replay tape. */
export type ReplayTransition<Message> = Readonly<{
  sequence: number
  message: Message
  envelope?: MessageEnvelopeType
  source: TransitionSource
  operationId?: number
  isOperationSettled: boolean
  commands: ReadonlyArray<CommandRecord>
  timestamp: number
}>

/** A decoded, typed replay tape for one Program version. */
export type ReplayTape<Model, Message> = Readonly<{
  formatVersion: 1
  programId: string
  programVersion: number
  initialModel: Model
  initialCommands: ReadonlyArray<CommandRecord>
  transitions: ReadonlyArray<ReplayTransition<Message>>
  runtimeEvents: ReadonlyArray<ProgramRuntimeEvent>
}>

/** A portable tape could not be exported through the Program Schemas. */
export class ReplayTapeExportError extends Data.TaggedError(
  'ReplayTapeExportError',
)<{
  readonly message: string
  readonly cause: unknown
}> {}

/** A portable tape could not be parsed or decoded through the Program Schemas. */
export class ReplayTapeImportError extends Data.TaggedError(
  'ReplayTapeImportError',
)<{
  readonly message: string
  readonly cause: unknown
}> {}

/** A tape targets a different Program identity. */
export class IncompatibleProgramError extends Data.TaggedError(
  'IncompatibleProgramError',
)<{
  readonly expectedProgramId: string
  readonly actualProgramId: string
}> {}

/** A tape version cannot be migrated to the current Program version. */
export class IncompatibleProgramVersionError extends Data.TaggedError(
  'IncompatibleProgramVersionError',
)<{
  readonly programId: string
  readonly expectedVersion: number
  readonly actualVersion: number
}> {}

/** A Program migration failed while transforming an encoded tape. */
export class ReplayTapeMigrationError extends Data.TaggedError(
  'ReplayTapeMigrationError',
)<{
  readonly programId: string
  readonly fromVersion: number
  readonly toVersion: number
  readonly cause: unknown
}> {}

/** An inspected replay frame is outside the tape bounds. */
export class ReplayFrameError extends Data.TaggedError('ReplayFrameError')<{
  readonly frame: number
  readonly maximumFrame: number
}> {}

/** A replay frame cannot become the beginning of a live branch. */
export class UnsettledReplayFrameError extends Data.TaggedError(
  'UnsettledReplayFrameError',
)<{
  readonly frame: number
}> {}

/** All typed failures that can occur while importing a replay tape. */
export type ReplayTapeDecodeError =
  | ReplayTapeImportError
  | IncompatibleProgramError
  | IncompatibleProgramVersionError
  | ReplayTapeMigrationError

const mapExportError = (message: string) => (cause: unknown) =>
  new ReplayTapeExportError({ message, cause })

const mapImportError = (message: string) => (cause: unknown) =>
  new ReplayTapeImportError({ message, cause })

const encodeCommandRecord = (
  command: CommandRecord,
): Effect.Effect<typeof EncodedCommandRecord.Type, ReplayTapeExportError> => {
  if (command.args === undefined) {
    return Effect.succeed({ name: command.name })
  }

  return pipe(
    Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Json))(
      command.args,
    ),
    Effect.map(args => ({ name: command.name, args })),
    Effect.mapError(mapExportError(`Command ${command.name} has invalid args`)),
  )
}

const encodeTransition = <Message>(
  MessageJson: Schema.Codec<Message, Schema.Json, never, never>,
  transition: ReplayTransition<Message>,
): Effect.Effect<EncodedReplayTransition, ReplayTapeExportError> =>
  Effect.gen(function* () {
    const message = yield* pipe(
      Schema.encodeEffect(MessageJson)(transition.message),
      Effect.mapError(mapExportError('A Message could not be encoded')),
    )
    const commands = yield* Effect.forEach(
      transition.commands,
      encodeCommandRecord,
    )
    return {
      sequence: transition.sequence,
      message,
      ...(transition.envelope === undefined
        ? {}
        : { envelope: transition.envelope }),
      source: transition.source,
      ...(transition.operationId === undefined
        ? {}
        : { operationId: transition.operationId }),
      isOperationSettled: transition.isOperationSettled,
      commands,
      timestamp: transition.timestamp,
    }
  })

const toReplayTransition = <Model, Message>(
  transition: ProgramJournalSnapshot<Model, Message>['transitions'][number],
): ReplayTransition<Message> => ({
  sequence: transition.sequence,
  message: transition.message,
  ...(transition.envelope === undefined
    ? {}
    : { envelope: transition.envelope }),
  source: transition.source,
  ...(transition.operationId === undefined
    ? {}
    : { operationId: transition.operationId }),
  isOperationSettled: transition.isOperationSettled,
  commands: transition.commands,
  timestamp: transition.timestamp,
})

/** Creates a typed replay tape from an immutable Program journal snapshot. */
export const fromJournal = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  journal: ProgramJournalSnapshot<Model, Message>,
  runtimeEvents: ReadonlyArray<ProgramRuntimeEvent> = [],
): ReplayTape<Model, Message> => ({
  formatVersion: REPLAY_TAPE_FORMAT_VERSION,
  programId: program.id,
  programVersion: program.version,
  initialModel: journal.initialModel,
  initialCommands: journal.initialCommands,
  transitions: Array.map(journal.transitions, toReplayTransition),
  runtimeEvents,
})

/** Validates that a typed tape belongs to the supplied Program version. */
export const validateReplayTapeProgram = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  tape: ReplayTape<Model, Message>,
): Effect.Effect<
  void,
  IncompatibleProgramError | IncompatibleProgramVersionError
> => {
  if (tape.programId !== program.id) {
    return Effect.fail(
      new IncompatibleProgramError({
        expectedProgramId: program.id,
        actualProgramId: tape.programId,
      }),
    )
  }
  if (tape.programVersion !== program.version) {
    return Effect.fail(
      new IncompatibleProgramVersionError({
        programId: program.id,
        expectedVersion: program.version,
        actualVersion: tape.programVersion,
      }),
    )
  }
  return Effect.void
}

/** Truncates a tape at a settled causal boundary for live continuation. */
export const branchReplayTape = <Model, Message>(
  tape: ReplayTape<Model, Message>,
  frame: number,
): Effect.Effect<ReplayTape<Model, Message>, UnsettledReplayFrameError> => {
  if (frame === 0) {
    if (!Array.isReadonlyArrayEmpty(tape.initialCommands)) {
      return Effect.fail(new UnsettledReplayFrameError({ frame }))
    }
    return Effect.succeed({
      ...tape,
      transitions: [],
      runtimeEvents: Array.filter(
        tape.runtimeEvents,
        event => event.afterFrame === 0,
      ),
    })
  }

  const maybeTransition = pipe(tape.transitions, Array.get(frame - 1))
  if (
    Option.isNone(maybeTransition) ||
    !maybeTransition.value.isOperationSettled
  ) {
    return Effect.fail(new UnsettledReplayFrameError({ frame }))
  }
  return Effect.succeed({
    ...tape,
    transitions: Array.take(tape.transitions, frame),
    runtimeEvents: Array.filter(
      tape.runtimeEvents,
      event => event.afterFrame <= frame,
    ),
  })
}

/** Encodes a typed replay tape as portable JSON. */
export const encodeReplayTape = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  tape: ReplayTape<Model, Message>,
): Effect.Effect<string, ReplayTapeExportError> =>
  Effect.gen(function* () {
    const ModelJson = Schema.toCodecJson(program.Model)
    const MessageJson = Schema.toCodecJson(program.Message)
    const initialModel = yield* pipe(
      Schema.encodeEffect(ModelJson)(tape.initialModel),
      Effect.mapError(mapExportError('The initial Model could not be encoded')),
    )
    const transitions = yield* Effect.forEach(tape.transitions, transition =>
      encodeTransition(MessageJson, transition),
    )
    const initialCommands = yield* Effect.forEach(
      tape.initialCommands,
      encodeCommandRecord,
    )
    const encodedTape = yield* pipe(
      Schema.encodeEffect(EncodedReplayTape)({
        formatVersion: REPLAY_TAPE_FORMAT_VERSION,
        programId: program.id,
        programVersion: program.version,
        initialModel,
        initialCommands,
        transitions,
        runtimeEvents: tape.runtimeEvents,
      }),
      Effect.mapError(mapExportError('The replay tape is not portable JSON')),
    )
    return yield* Effect.try({
      try: () => JSON.stringify(encodedTape),
      catch: mapExportError('The replay tape could not be serialized'),
    })
  })

const readHeader = (
  encodedTape: Schema.Json,
): Effect.Effect<typeof ReplayTapeHeader.Type, ReplayTapeImportError> =>
  pipe(
    Schema.decodeUnknownEffect(ReplayTapeHeader)(encodedTape),
    Effect.mapError(mapImportError('The replay tape header is invalid')),
  )

const migrateEncodedTape = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  encodedTape: Schema.Json,
  version: number,
): Effect.Effect<
  Schema.Json,
  | ReplayTapeImportError
  | IncompatibleProgramVersionError
  | ReplayTapeMigrationError
> => {
  if (version === program.version) {
    return Effect.succeed(encodedTape)
  }

  const maybeMigration = pipe(
    program.migrations ?? [],
    Array.findFirst(migration => migration.fromVersion === version),
  )
  if (Option.isNone(maybeMigration)) {
    return Effect.fail(
      new IncompatibleProgramVersionError({
        programId: program.id,
        expectedVersion: program.version,
        actualVersion: version,
      }),
    )
  }

  const migration = maybeMigration.value
  return pipe(
    Effect.try({
      try: () => migration.migrate(encodedTape),
      catch: cause =>
        new ReplayTapeMigrationError({
          programId: program.id,
          fromVersion: migration.fromVersion,
          toVersion: migration.toVersion,
          cause,
        }),
    }),
    Effect.flatMap(migratedTape =>
      pipe(
        readHeader(migratedTape),
        Effect.flatMap(header =>
          migrateEncodedTape(program, migratedTape, header.programVersion),
        ),
      ),
    ),
  )
}

const decodeTransition = <Message>(
  MessageJson: Schema.Codec<Message, Schema.Json, never, never>,
  transition: EncodedReplayTransition,
): Effect.Effect<ReplayTransition<Message>, ReplayTapeImportError> =>
  pipe(
    Schema.decodeUnknownEffect(MessageJson)(transition.message),
    Effect.map(message => ({
      sequence: transition.sequence,
      message,
      ...(transition.envelope === undefined
        ? {}
        : { envelope: transition.envelope }),
      source: transition.source,
      ...(transition.operationId === undefined
        ? {}
        : { operationId: transition.operationId }),
      isOperationSettled: transition.isOperationSettled,
      commands: transition.commands,
      timestamp: transition.timestamp,
    })),
    Effect.mapError(mapImportError('A replay Message is invalid')),
  )

/** Parses, migrates, validates, and decodes portable replay JSON. */
export const decodeReplayTape = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  json: string,
): Effect.Effect<ReplayTape<Model, Message>, ReplayTapeDecodeError> =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => JSON.parse(json),
      catch: mapImportError('The replay tape is not valid JSON'),
    })
    const encodedJson = yield* pipe(
      Schema.decodeUnknownEffect(Schema.Json)(parsed),
      Effect.mapError(mapImportError('The replay tape is not JSON data')),
    )
    const header = yield* readHeader(encodedJson)
    if (header.programId !== program.id) {
      return yield* new IncompatibleProgramError({
        expectedProgramId: program.id,
        actualProgramId: header.programId,
      })
    }
    if (header.formatVersion !== REPLAY_TAPE_FORMAT_VERSION) {
      return yield* new ReplayTapeImportError({
        message: `Unsupported replay tape format ${header.formatVersion}`,
        cause: header.formatVersion,
      })
    }

    const migratedJson = yield* migrateEncodedTape(
      program,
      encodedJson,
      header.programVersion,
    )
    const encodedTape = yield* pipe(
      Schema.decodeUnknownEffect(EncodedReplayTape)(migratedJson),
      Effect.mapError(mapImportError('The replay tape shape is invalid')),
    )
    const ModelJson = Schema.toCodecJson(program.Model)
    const MessageJson = Schema.toCodecJson(program.Message)
    const initialModel = yield* pipe(
      Schema.decodeUnknownEffect(ModelJson)(encodedTape.initialModel),
      Effect.mapError(mapImportError('The initial Model is invalid')),
    )
    const transitions = yield* Effect.forEach(
      encodedTape.transitions,
      transition => decodeTransition(MessageJson, transition),
    )
    return {
      formatVersion: encodedTape.formatVersion,
      programId: encodedTape.programId,
      programVersion: encodedTape.programVersion,
      initialModel,
      initialCommands: encodedTape.initialCommands,
      transitions,
      runtimeEvents: encodedTape.runtimeEvents,
    }
  })

/** Reconstructs a Model at a tape frame without executing historical effects. */
export const replayToFrame = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  tape: ReplayTape<Model, Message>,
  frame: number,
): Effect.Effect<Model, ReplayFrameError> => {
  if (
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame > tape.transitions.length
  ) {
    return Effect.fail(
      new ReplayFrameError({
        frame,
        maximumFrame: tape.transitions.length,
      }),
    )
  }

  return Effect.succeed(
    pipe(
      tape.transitions,
      Array.take(frame),
      Array.reduce(tape.initialModel, (model, transition) => {
        const [nextModel] = program.update(model, transition.message)
        return nextModel
      }),
    ),
  )
}

import { Array, Duration, Effect, Option, Schema as S, Stream } from 'effect'
import { Processor, Runtime } from 'foldkit'

import {
  InstantLogMessageRecord,
  SnapshotLogError,
  instantCauseString,
} from '@foldkit/instant'
import { InstantCoreDatabase, i } from '@instantdb/core'

import { type Prompt, type Step } from './step.js'
import { Prompt as PromptSchema, Step as StepSchema } from './step.js'
import { defaultPrompt } from './tape.js'
import { TAPE_UUID, TapeRow } from './wire.js'

/** Dedicated Instant app for Puzzle. Not the Counter app. */
export const FoldkitPuzzleV01: Readonly<{ readonly id: string }> = {
  id: '63750881-805d-46d9-89d4-c7ad0b1bb713',
}

/** Instant tape row. Steps and prompt are the Puzzle ADT. No count. */
export const InstantPuzzleSnapshotRecord = TapeRow
/** Instant tape row. Steps and prompt are the Puzzle ADT. No count. */
export type InstantPuzzleSnapshotRecord =
  typeof InstantPuzzleSnapshotRecord.Type

/** Instant entity definitions for the tape snapshot and Message log. */
export const InstantPuzzleSnapshotLogEntities = {
  tape: i.entity({
    asOf: i.string(),
    at: i.number().indexed(),
    prompt: i.json(),
    steps: i.json(),
  }),
  message: i.entity({
    createdAtMs: i.number().indexed(),
    from: i.string().indexed(),
    tag: i.string(),
  }),
}

/** Instant schema with the Puzzle tape ADT and Message log. No count. */
export const InstantPuzzleSnapshotLogSchema = i.schema({
  entities: InstantPuzzleSnapshotLogEntities,
})

/** Instant schema with the Puzzle tape ADT and Message log. No count. */
export const InstantSnapshotLogSchema = InstantPuzzleSnapshotLogSchema

/** An Instant core client initialized with the Puzzle snapshot-log schema. */
export type InstantPuzzleSnapshotLogDatabase = InstantCoreDatabase<
  typeof InstantPuzzleSnapshotLogSchema
>

/** Open Instant rules for the Puzzle tape snapshot and Message log. */
export const InstantPuzzleSnapshotLogPermissions = {
  tape: {
    allow: {
      create: 'true',
      delete: 'false',
      update: 'true',
      view: 'true',
    },
  },
  message: {
    allow: {
      create: 'true',
      delete: 'false',
      update: 'true',
      view: 'true',
    },
  },
}

/** Open Instant rules for the Puzzle tape snapshot and Message log. */
export const InstantSnapshotLogPermissions = InstantPuzzleSnapshotLogPermissions

/** Reads every tape row and every Message row. Filter happens in process. */
export const puzzleSnapshotLogQuery = {
  tape: {},
  message: {},
} as const

const LooseTapeRow = S.Struct({
  asOf: S.String,
  at: S.Number,
  id: S.String,
  prompt: S.Unknown,
  steps: S.Unknown,
})

const LooseMessageRow = S.Struct({
  createdAtMs: S.Number,
  from: S.String,
  id: S.String,
  tag: S.String,
})

const decodeJsonField = <A>(
  schema: S.Top,
  value: unknown,
): Option.Option<A> => {
  if (typeof value === 'string') {
    return S.decodeUnknownOption(S.fromJsonString(schema as never))(
      value,
    ) as Option.Option<A>
  }
  return S.decodeUnknownOption(schema as never)(value) as Option.Option<A>
}

/** Decodes one Instant tape row into the Puzzle snapshot ADT. */
export const decodeTapeRow = (
  row: unknown,
): Option.Option<InstantPuzzleSnapshotRecord> => {
  const loose = S.decodeUnknownOption(LooseTapeRow)(row)
  if (Option.isNone(loose)) {
    return Option.none()
  }
  if (loose.value.id !== TAPE_UUID) {
    return Option.none()
  }
  const steps = decodeJsonField<ReadonlyArray<Step>>(
    S.Array(StepSchema),
    loose.value.steps,
  )
  const prompt = decodeJsonField<Prompt>(PromptSchema, loose.value.prompt)
  if (Option.isNone(steps) || Option.isNone(prompt)) {
    return Option.none()
  }
  return Option.some(
    TapeRow.make({
      id: TAPE_UUID,
      asOf: loose.value.asOf,
      at: loose.value.at,
      steps: steps.value,
      prompt: prompt.value,
    }),
  )
}

const decodeMessageRow = (row: unknown): InstantLogMessageRecord => {
  const record = S.decodeUnknownSync(LooseMessageRow)(row)
  return InstantLogMessageRecord.make({
    createdAtMs: record.createdAtMs,
    from: record.from,
    id: record.id,
    tag: record.tag,
  })
}

const compareMessages = (
  left: InstantLogMessageRecord,
  right: InstantLogMessageRecord,
): number => {
  if (left.createdAtMs !== right.createdAtMs) {
    return left.createdAtMs - right.createdAtMs
  }
  if (left.id < right.id) {
    return -1
  }
  if (left.id > right.id) {
    return 1
  }
  return 0
}

/** Instant query payload for the tape snapshot and Message log. */
export type PuzzleSnapshotLogQueryData = Readonly<{
  readonly tape?: ReadonlyArray<unknown>
  readonly message?: ReadonlyArray<unknown>
}>

/** Tape snapshot plus the Message log. */
export type PuzzleSnapshotLogState = Readonly<{
  messages: ReadonlyArray<InstantLogMessageRecord>
  snapshot: InstantPuzzleSnapshotRecord | undefined
}>

/** Missing tape row. Memory and file start here. Instant core does not. */
export const emptyPuzzleSnapshotLogState: PuzzleSnapshotLogState = {
  messages: [],
  snapshot: undefined,
}

/**
 * Instant queryOnce returned no tape row. Ready-paint empty Instant,
 * not Program init / demoModel.
 */
export const emptyInstantPuzzleSnapshot: InstantPuzzleSnapshotRecord =
  TapeRow.make({
    asOf: '',
    at: 0,
    id: TAPE_UUID,
    prompt: defaultPrompt,
    steps: [],
  })

/**
 * Instant queryOnce returned no tape row. Ready-paint empty Instant,
 * not Program init / demoModel.
 */
export const emptyInstantPuzzleSnapshotLogState: PuzzleSnapshotLogState = {
  messages: [],
  snapshot: emptyInstantPuzzleSnapshot,
}

/**
 * Instant `queryOnce` waits until AUTHENTICATED or Instant's 30s timer.
 * This cap Ready-paints empty Instant after a real wait so Starting
 * cannot last forever. It is not a skip-read.
 */
export const instantReadTimeoutMs = 10_000

/** One Instant transaction that updates tape and upserts a Message. */
export type PuzzleSnapshotLogWrite = Readonly<{
  message: InstantLogMessageRecord
  snapshot: InstantPuzzleSnapshotRecord
}>

/**
 * Instant is the durable store.
 * Memory implements the same surface for unit tests.
 */
export type PuzzleSnapshotLogTransport = Readonly<{
  read: () => Effect.Effect<PuzzleSnapshotLogState, SnapshotLogError>
  subscribe: Stream.Stream<PuzzleSnapshotLogState, SnapshotLogError>
  write: (
    write: PuzzleSnapshotLogWrite,
  ) => Effect.Effect<{ readonly _tag: string }, SnapshotLogError>
}>

const isQueryRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

/**
 * Instant core `queryOnce` resolves the InstaQL rows. Some wrappers nest
 * them under `data`. Subscribe callbacks use the same shapes.
 */
export const snapshotLogQueryDataOf = (
  payload: unknown,
): PuzzleSnapshotLogQueryData => {
  if (!isQueryRecord(payload)) {
    return {}
  }
  const tape = payload['tape']
  const message = payload['message']
  if (globalThis.Array.isArray(tape) || globalThis.Array.isArray(message)) {
    return {
      ...(globalThis.Array.isArray(tape) ? { tape } : {}),
      ...(globalThis.Array.isArray(message) ? { message } : {}),
    }
  }
  return snapshotLogQueryDataOf(payload['data'])
}

/** Decodes Instant query rows into a tape snapshot and a sorted Message log. */
export const decodePuzzleSnapshotLogState = (
  data: PuzzleSnapshotLogQueryData,
): PuzzleSnapshotLogState => {
  const tapeRows = data.tape ?? []
  const messageRows = data.message ?? []
  const snapshot = Option.getOrUndefined(
    Array.findFirst(tapeRows, row => Option.isSome(decodeTapeRow(row))).pipe(
      Option.flatMap(row => decodeTapeRow(row)),
    ),
  )
  return {
    messages: [...Array.map(messageRows, decodeMessageRow)].sort(
      compareMessages,
    ),
    snapshot,
  }
}

const toTransportError = (
  cause: unknown,
  operation: Runtime.SyncTransportError['operation'],
  raw?: unknown,
): Runtime.SyncTransportError =>
  new Runtime.SyncTransportError({
    cause: instantCauseString(cause),
    operation,
    ...(raw === undefined ? {} : { raw }),
  })

/**
 * Wraps a Puzzle snapshot-log transport as the Runtime.start SyncEngine.
 * Instant has no Model. The snapshot Schema is the tape ADT.
 */
export const fromPuzzleTransport = (
  transport: PuzzleSnapshotLogTransport,
  processor: string,
): Runtime.SyncEngine => ({
  processor,
  read: () =>
    transport.read().pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(instantReadTimeoutMs),
        orElse: () => Effect.succeed(emptyInstantPuzzleSnapshotLogState),
      }),
      Effect.map(state => ({
        snapshot: state.snapshot,
        messages: state.messages,
      })),
      Effect.mapError(error => toTransportError(error, 'Read')),
    ),
  subscribe: enqueue =>
    Effect.gen(function* () {
      const seenMessageIds = new Set<string>()
      yield* transport.subscribe.pipe(
        Stream.runForEach(state =>
          Effect.sync(() => {
            enqueue({
              _tag: 'Snapshot',
              row: state.snapshot,
            })
            for (const message of state.messages) {
              if (seenMessageIds.has(message.id)) {
                continue
              }
              seenMessageIds.add(message.id)
              enqueue({
                _tag: 'Message',
                row: message,
              })
            }
          }),
        ),
        Effect.catch(() => Effect.void),
        Effect.forkScoped,
      )
    }),
  write: write =>
    Effect.try({
      try: () =>
        S.decodeUnknownSync(InstantPuzzleSnapshotRecord)(write.snapshot),
      catch: cause => toTransportError(cause, 'Decode', write.snapshot),
    }).pipe(
      Effect.flatMap(snapshot =>
        Effect.try({
          try: () =>
            S.decodeUnknownSync(InstantLogMessageRecord)(write.message),
          catch: cause => toTransportError(cause, 'Decode', write.message),
        }).pipe(
          Effect.flatMap(message =>
            transport.write({ message, snapshot }).pipe(
              Effect.map(outcome => ({
                link:
                  outcome._tag === 'Synced'
                    ? ('delivered' as const)
                    : ('queued' as const),
              })),
              Effect.mapError(error => toTransportError(error, 'Write', write)),
            ),
          ),
        ),
      ),
    ),
})

/** Instant `from` for one engine occurrence. */
export const puzzleEngineProcessorId = (options: {
  readonly processor: Processor.Host.Host
  readonly instance?: string
}): string => {
  const host = Processor.Host.print(options.processor)
  if (options.instance === undefined || options.instance === '') {
    return host
  }
  return `${host}-${options.instance}`
}

/** Engine that fails read and write when the Node admin token is missing. */
export const missingPuzzleAdminToken = (
  processor: string,
): Runtime.SyncEngine => ({
  processor,
  read: () =>
    Effect.fail(
      new Runtime.SyncTransportError({
        cause:
          'Instant() needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.',
        operation: 'Read',
      }),
    ),
  subscribe: () => Effect.void,
  write: () =>
    Effect.fail(
      new Runtime.SyncTransportError({
        cause:
          'Instant() needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.',
        operation: 'Write',
      }),
    ),
})

import { Array, Data, Effect, Option, Order, Schema as S, Stream } from 'effect'

import { InstantCoreDatabase, i } from '@instantdb/core'

import {
  type ProgramStoreTransactionOutcome,
  syncedTransactionOutcome,
} from '../programStore/index.js'

/**
 * Instant entity id for the one count snapshot row.
 * Instant requires a UUID. This constant is that one row.
 */
export const countSnapshotId = 'c0a7c001-0000-4000-8000-000000000001'

/** The durable count snapshot. Startup reads this row. */
export const InstantCountSnapshotRecord = S.Struct({
  asOf: S.String,
  at: S.Int,
  id: S.Literal(countSnapshotId),
  value: S.Int,
})
/** The durable count snapshot. Startup reads this row. */
export type InstantCountSnapshotRecord = typeof InstantCountSnapshotRecord.Type

/** One user-intent row on the Instant Message log. */
export const InstantLogMessageRecord = S.Struct({
  createdAtMs: S.Int,
  from: S.String,
  id: S.String,
  tag: S.String,
})
/** One user-intent row on the Instant Message log. */
export type InstantLogMessageRecord = typeof InstantLogMessageRecord.Type

/** Missing count row. Value is 0. */
export const emptyCountSnapshot: InstantCountSnapshotRecord =
  InstantCountSnapshotRecord.make({
    asOf: '',
    at: 0,
    id: countSnapshotId,
    value: 0,
  })

/** Count snapshot plus the Message log. */
export const SnapshotLogState = S.Struct({
  messages: S.Array(InstantLogMessageRecord),
  snapshot: InstantCountSnapshotRecord,
})
/** Count snapshot plus the Message log. */
export type SnapshotLogState = typeof SnapshotLogState.Type

/** One Instant transaction that updates count and upserts a Message. */
export const SnapshotLogWrite = S.Struct({
  message: InstantLogMessageRecord,
  snapshot: InstantCountSnapshotRecord,
})
/** One Instant transaction that updates count and upserts a Message. */
export type SnapshotLogWrite = typeof SnapshotLogWrite.Type

/** Local-first write of one Message against the count snapshot. */
export type SnapshotLogCommit = Readonly<{
  message: InstantLogMessageRecord
  outcome: ProgramStoreTransactionOutcome
  snapshot: InstantCountSnapshotRecord
}>

/** Instant entity definitions for the count snapshot and Message log. */
export const InstantSnapshotLogEntities = {
  count: i.entity({
    asOf: i.string(),
    at: i.number().indexed(),
    value: i.number(),
  }),
  message: i.entity({
    createdAtMs: i.number().indexed(),
    from: i.string().indexed(),
    tag: i.string(),
  }),
}

/** Instant schema with only the count snapshot and Message log. */
export const InstantSnapshotLogSchema = i.schema({
  entities: InstantSnapshotLogEntities,
})

/** An Instant core client initialized with the snapshot-log schema. */
export type InstantSnapshotLogDatabase = InstantCoreDatabase<
  typeof InstantSnapshotLogSchema
>

/** Open Instant rules for a dedicated snapshot-log app. */
export const InstantSnapshotLogPermissions = {
  count: {
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

/** Reads every count row and every Message row. Filter happens in process. */
export const snapshotLogQuery = {
  count: {},
  message: {},
} as const

/** A snapshot-log read, write, or observe failed. */
export class SnapshotLogError extends Data.TaggedError('SnapshotLogError')<{
  readonly cause: unknown
  readonly operation: 'Decode' | 'Observe' | 'Read' | 'Write'
}> {}

/**
 * Instant is the durable store.
 * Memory implements the same surface for unit tests.
 */
export type SnapshotLogTransport = Readonly<{
  read: () => Effect.Effect<SnapshotLogState, SnapshotLogError>
  subscribe: Stream.Stream<SnapshotLogState, SnapshotLogError>
  write: (
    write: SnapshotLogWrite,
  ) => Effect.Effect<ProgramStoreTransactionOutcome, SnapshotLogError>
}>

const logMessageOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (message: InstantLogMessageRecord) => message.createdAtMs,
  ),
  Order.mapInput(
    Order.String,
    (message: InstantLogMessageRecord) => message.id,
  ),
)

const LooseCountRow = S.Struct({
  asOf: S.String,
  at: S.Number,
  id: S.String,
  value: S.Number,
})

const LooseMessageRow = S.Struct({
  createdAtMs: S.Number,
  from: S.String,
  id: S.String,
  tag: S.String,
})

/** Orders Messages by createdAtMs, then id. */
export const sortLogMessages = (
  messages: ReadonlyArray<InstantLogMessageRecord>,
): ReadonlyArray<InstantLogMessageRecord> =>
  Array.sort(messages, logMessageOrder)

/** Replaces a Message with the same id, then sorts. */
export const upsertLogMessage = (
  messages: ReadonlyArray<InstantLogMessageRecord>,
  message: InstantLogMessageRecord,
): ReadonlyArray<InstantLogMessageRecord> =>
  sortLogMessages(
    Array.append(
      Array.filter(messages, existing => existing.id !== message.id),
      message,
    ),
  )

/** Messages at or after the snapshot time, in query order. */
export const messagesSinceSnapshot = (
  messages: ReadonlyArray<InstantLogMessageRecord>,
  snapshot: InstantCountSnapshotRecord,
): ReadonlyArray<InstantLogMessageRecord> =>
  Array.filter(
    sortLogMessages(messages),
    message => message.createdAtMs >= snapshot.at,
  )

/** Returns whether a live Processor must apply this remote Message. */
export const shouldApplyRemoteLogMessage = (
  message: InstantLogMessageRecord,
  snapshot: InstantCountSnapshotRecord,
  processorId: string,
  appliedIds: ReadonlySet<string>,
): boolean => {
  if (message.from === processorId) {
    return false
  }
  if (appliedIds.has(message.id)) {
    return false
  }
  if (message.createdAtMs < snapshot.at) {
    return false
  }
  return true
}

const decodeCountRow = (row: unknown): InstantCountSnapshotRecord => {
  const record = S.decodeUnknownSync(LooseCountRow)(row)
  return InstantCountSnapshotRecord.make({
    asOf: record.asOf,
    at: record.at,
    id: countSnapshotId,
    value: record.value,
  })
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !globalThis.Array.isArray(value)

const peekMessageId = (row: unknown): Option.Option<string> => {
  if (!isPlainObject(row)) {
    return Option.none()
  }
  const id = row['id']
  if (typeof id !== 'string' || id === '') {
    return Option.none()
  }
  return Option.some(id)
}

const messageRowMatchesCache = (
  existing: InstantLogMessageRecord,
  row: unknown,
): boolean => {
  if (!isPlainObject(row)) {
    return false
  }
  return (
    row['createdAtMs'] === existing.createdAtMs &&
    row['from'] === existing.from &&
    row['tag'] === existing.tag
  )
}

const decodeMessageRowCached = (
  row: unknown,
  cache: Map<string, InstantLogMessageRecord>,
): InstantLogMessageRecord => {
  const maybeId = peekMessageId(row)
  if (Option.isSome(maybeId)) {
    const existing = cache.get(maybeId.value)
    if (existing !== undefined && messageRowMatchesCache(existing, row)) {
      return existing
    }
  }
  const decoded = decodeMessageRow(row)
  cache.set(decoded.id, decoded)
  return decoded
}

/** Instant query payload for the count snapshot and Message log. */
export type SnapshotLogQueryData = Readonly<{
  readonly count?: ReadonlyArray<unknown>
  readonly message?: ReadonlyArray<unknown>
}>

/** Decodes Instant query rows into a snapshot and a sorted Message log. */
export const decodeSnapshotLogState = (
  data: SnapshotLogQueryData,
  cache?: Map<string, InstantLogMessageRecord>,
): SnapshotLogState => {
  const countRows = data.count ?? []
  const messageRows = data.message ?? []
  const maybeCount = Array.findFirst(countRows, row => {
    const decoded = S.decodeUnknownOption(LooseCountRow)(row)
    if (Option.isNone(decoded)) {
      return false
    }
    return decoded.value.id === countSnapshotId
  })
  const snapshot = (() => {
    if (Option.isSome(maybeCount)) {
      return decodeCountRow(maybeCount.value)
    }
    return emptyCountSnapshot
  })()
  const decodeOne =
    cache === undefined
      ? decodeMessageRow
      : (row: unknown) => decodeMessageRowCached(row, cache)
  return {
    messages: sortLogMessages(Array.map(messageRows, decodeOne)),
    snapshot,
  }
}

/**
 * Decodes Instant query rows and reuses Messages that did not change.
 * One decoder per subscribeQuery. A burst must not Schema-decode the
 * whole log on every push.
 */
export const createSnapshotLogStateDecoder = (): ((
  data: SnapshotLogQueryData,
) => SnapshotLogState) => {
  const cache = new Map<string, InstantLogMessageRecord>()
  return data => decodeSnapshotLogState(data, cache)
}

/** Empty snapshot and no Messages. */
export const emptySnapshotLogState: SnapshotLogState = {
  messages: [],
  snapshot: emptyCountSnapshot,
}

/** Writes the count snapshot and Message in one transport transaction. */
export const writeSnapshotLog = (
  transport: SnapshotLogTransport,
  write: SnapshotLogWrite,
): Effect.Effect<ProgramStoreTransactionOutcome, SnapshotLogError> =>
  transport.write(write)

/** Options for a local-first snapshot-log commit. */
export type CommitSnapshotLogOptions = Readonly<{
  applyLocal: (currentValue: number) => number
  currentValue: number
  makeId?: () => string
  messageId?: string
  now?: () => number
  processorId: string
  tag: string
  transport: SnapshotLogTransport
}>

/**
 * Updates the local count first, then writes count and Message together.
 * Retry the same Message id when Instant is offline.
 */
export const commitSnapshotLog = (
  options: CommitSnapshotLogOptions,
): Effect.Effect<SnapshotLogCommit, SnapshotLogError> =>
  Effect.gen(function* () {
    const makeId = options.makeId ?? (() => crypto.randomUUID())
    const now = options.now ?? (() => Date.now())
    const id = options.messageId ?? makeId()
    const createdAtMs = now()
    const nextValue = options.applyLocal(options.currentValue)
    const message = InstantLogMessageRecord.make({
      createdAtMs,
      from: options.processorId,
      id,
      tag: options.tag,
    })
    const snapshot = InstantCountSnapshotRecord.make({
      asOf: id,
      at: createdAtMs,
      id: countSnapshotId,
      value: nextValue,
    })
    const outcome = yield* writeSnapshotLog(options.transport, {
      message,
      snapshot,
    })
    return {
      message,
      outcome,
      snapshot,
    }
  })

/**
 * Applies Messages from other Processors.
 * Startup must already have read the count snapshot.
 * Pass that snapshot so live writes are not skipped as asOf.
 */
export const observeRemoteSnapshotLog = <E = never, R = never>(
  transport: SnapshotLogTransport,
  processorId: string,
  applyMessage: (message: InstantLogMessageRecord) => Effect.Effect<void, E, R>,
  initialSnapshot?: InstantCountSnapshotRecord,
): Effect.Effect<void, SnapshotLogError | E, R> =>
  Effect.gen(function* () {
    const appliedIds = new Set<string>()
    const sinceSnapshot = initialSnapshot ?? emptyCountSnapshot
    if (sinceSnapshot.asOf !== '') {
      appliedIds.add(sinceSnapshot.asOf)
    }
    yield* transport.subscribe.pipe(
      Stream.runForEach(state =>
        Effect.forEach(
          Array.filter(
            messagesSinceSnapshot(state.messages, sinceSnapshot),
            message =>
              shouldApplyRemoteLogMessage(
                message,
                sinceSnapshot,
                processorId,
                appliedIds,
              ),
          ),
          message =>
            Effect.gen(function* () {
              yield* applyMessage(message)
              appliedIds.add(message.id)
            }),
        ),
      ),
    )
  })

/** Builds a Synced outcome for a memory transport write. */
export const memorySnapshotLogOutcome = (): ProgramStoreTransactionOutcome =>
  syncedTransactionOutcome('memory')

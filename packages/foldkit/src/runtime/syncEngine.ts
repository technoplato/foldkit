import { Array, Data, Effect, Option, Scope } from 'effect'

import { type Host, print } from '../processor/host.js'

/** Result of one sync write. Isolated Memory reports `offline`. */
export type SyncLink = 'offline' | 'queued' | 'delivered'

/** One write of a snapshot row and a Message row. */
export type SyncWrite = Readonly<{
  snapshot: unknown
  message: unknown
}>

/** Outcome of one {@link SyncEngine.write}. */
export type SyncWriteResult = Readonly<{
  link: SyncLink
}>

/** Current Instant rows. Messages are used only to skip echoes at boot. */
export type SyncRead = Readonly<{
  snapshot: unknown | undefined
  messages: ReadonlyArray<unknown>
}>

/** One live Instant event. */
export type SyncEvent =
  | Readonly<{ readonly _tag: 'Snapshot'; readonly row: unknown }>
  | Readonly<{ readonly _tag: 'Message'; readonly row: unknown }>

/** Instant read, write, or observe failed. `cause` is Instant's sentence. */
export class SyncTransportError extends Data.TaggedError('SyncTransportError')<{
  readonly cause: string
  readonly operation: 'Decode' | 'Observe' | 'Read' | 'Write'
  readonly raw?: unknown
}> {}

/**
 * Instant I/O surface. Instant() and Memory() implement this.
 * Instant has no Model.
 */
export type SyncEngine = Readonly<{
  processor: string
  read: () => Effect.Effect<SyncRead, SyncTransportError>
  subscribe: (
    enqueue: (event: SyncEvent) => void,
  ) => Effect.Effect<void, never, Scope.Scope>
  write: (
    write: SyncWrite,
  ) => Effect.Effect<SyncWriteResult, SyncTransportError>
}>

/** Shared Memory rows. Two Processors share one store. */
export type MemoryStore = {
  snapshot: unknown | undefined
  messages: Array<unknown>
  listeners: Set<(event: SyncEvent) => void>
}

/** Memory engine with test hooks. Memory is a fake Instant. */
export type MemoryEngine = SyncEngine &
  Readonly<{
    store: MemoryStore
    failNextRead: (cause: string) => void
    failNextWrite: (cause: string) => void
    injectSnapshot: (row: unknown) => void
    injectMessage: (row: unknown) => void
    goOffline: () => void
    comeOnline: () => void
  }>

/** Builds an empty Memory store. */
export const makeMemoryStore = (): MemoryStore => ({
  snapshot: undefined,
  messages: [],
  listeners: new Set(),
})

const processorOf = (processor: Host | string | undefined): string => {
  if (processor === undefined) {
    return 'headless'
  }
  if (typeof processor === 'string') {
    return processor
  }
  return print(processor)
}

/**
 * In-process Instant fake. Not a product store.
 *
 * Isolated Memory (no shared store) reports `link: 'offline'`.
 * A shared store reports `link: 'delivered'`.
 */
export const Memory = (options?: {
  processor?: Host | string
  store?: MemoryStore
}): MemoryEngine => {
  const isIsolated = options?.store === undefined
  const store = options?.store ?? makeMemoryStore()
  const processor = processorOf(options?.processor)
  let pendingReadFailure: string | undefined
  let pendingWriteFailure: string | undefined
  let isOffline = false
  const queuedWrites: Array<SyncWrite> = []
  const ownListeners = new Set<(event: SyncEvent) => void>()

  const notify = (event: SyncEvent): void => {
    for (const listener of store.listeners) {
      listener(event)
    }
  }

  const applyWrite = (write: SyncWrite): void => {
    const incomingOrder = rowOrderOf(write.message)
    const newestStored = maxRowOrder(store.messages)
    const isStaleSnapshot =
      Option.isSome(incomingOrder) &&
      Option.isSome(newestStored) &&
      isRowOrderAfter(newestStored.value, incomingOrder.value)
    if (!isStaleSnapshot) {
      store.snapshot = write.snapshot
    }
    store.messages.push(write.message)
    notify({ _tag: 'Snapshot', row: store.snapshot })
    notify({ _tag: 'Message', row: write.message })
  }

  return {
    processor,
    store,
    failNextRead: (cause: string) => {
      pendingReadFailure = cause
    },
    failNextWrite: (cause: string) => {
      pendingWriteFailure = cause
    },
    goOffline: () => {
      isOffline = true
    },
    comeOnline: () => {
      isOffline = false
      const writes = queuedWrites.splice(0)
      for (const write of writes) {
        applyWrite(write)
      }
      for (const listener of ownListeners) {
        listener({ _tag: 'Snapshot', row: store.snapshot })
        for (const message of store.messages) {
          listener({ _tag: 'Message', row: message })
        }
      }
    },
    injectSnapshot: (row: unknown) => {
      store.snapshot = row
      notify({ _tag: 'Snapshot', row })
    },
    injectMessage: (row: unknown) => {
      store.messages.push(row)
      notify({ _tag: 'Message', row })
    },
    read: () => {
      if (pendingReadFailure !== undefined) {
        const cause = pendingReadFailure
        pendingReadFailure = undefined
        return Effect.fail(
          new SyncTransportError({
            cause,
            operation: 'Read',
          }),
        )
      }
      return Effect.succeed({
        snapshot: store.snapshot,
        messages: store.messages,
      })
    },
    subscribe: enqueue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const gated = (event: SyncEvent): void => {
            if (!isOffline) {
              enqueue(event)
            }
          }
          store.listeners.add(gated)
          ownListeners.add(gated)
          return gated
        }),
        gated =>
          Effect.sync(() => {
            store.listeners.delete(gated)
            ownListeners.delete(gated)
          }),
      ).pipe(Effect.asVoid),
    write: write => {
      if (pendingWriteFailure !== undefined) {
        const cause = pendingWriteFailure
        pendingWriteFailure = undefined
        return Effect.fail(
          new SyncTransportError({
            cause,
            operation: 'Write',
          }),
        )
      }
      if (isOffline) {
        queuedWrites.push(write)
        return Effect.succeed<SyncWriteResult>({ link: 'queued' })
      }
      applyWrite(write)
      return Effect.succeed<SyncWriteResult>({
        link: isIsolated ? 'offline' : 'delivered',
      })
    },
  }
}

/** Reads a string field from an Instant row. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads a string field from an Instant row. */
export const readRowString = (
  row: unknown,
  key: string,
): Option.Option<string> => {
  if (!isPlainObject(row)) {
    return Option.none()
  }
  if (!Object.hasOwn(row, key)) {
    return Option.none()
  }
  const value = row[key]
  if (typeof value !== 'string') {
    return Option.none()
  }
  return Option.some(value)
}

/** Reads a number field from an Instant row. */
export const readRowNumber = (
  row: unknown,
  key: string,
): Option.Option<number> => {
  if (!isPlainObject(row)) {
    return Option.none()
  }
  if (!Object.hasOwn(row, key)) {
    return Option.none()
  }
  const value = row[key]
  if (typeof value !== 'number') {
    return Option.none()
  }
  return Option.some(value)
}

/**
 * Log position of one Message row: `createdAtMs`, then actor (`from`),
 * then per-actor `seq`, then `id`. The actor+seq pair carries explicit
 * same-actor causality: rows one Processor wrote keep their write order
 * even when they share a millisecond and UUIDs would sort against it.
 * Legacy rows without actor/seq fall back to `createdAtMs` then `id`.
 */
export type LogRowOrder = Readonly<{
  createdAtMs: number
  id: string
  readonly from?: string | undefined
  readonly seq?: number | undefined
}>

/** Reads the log position of a Message row. */
export const rowOrderOf = (row: unknown): Option.Option<LogRowOrder> => {
  const createdAtMs = readRowNumber(row, 'createdAtMs')
  const id = readRowString(row, 'id')
  if (Option.isNone(createdAtMs) || Option.isNone(id)) {
    return Option.none()
  }
  const from = readRowString(row, 'from')
  const seq = readRowNumber(row, 'seq')
  return Option.some({
    createdAtMs: createdAtMs.value,
    id: id.value,
    ...(Option.isSome(from) && from.value !== '' ? { from: from.value } : {}),
    ...(Option.isSome(seq) ? { seq: seq.value } : {}),
  })
}

/** Three-way compare of optional stamps; missing sorts before present. */
const compareOptionalStamp = <T extends string | number>(
  a: T | undefined,
  b: T | undefined,
): number => {
  if (a === undefined && b === undefined) {
    return 0
  }
  if (a === undefined) {
    return -1
  }
  if (b === undefined) {
    return 1
  }
  return a < b ? -1 : a > b ? 1 : 0
}

/** True when `a` sorts after `b`: ms, actor, seq, then id. */
export const isRowOrderAfter = (a: LogRowOrder, b: LogRowOrder): boolean => {
  if (a.createdAtMs !== b.createdAtMs) {
    return a.createdAtMs > b.createdAtMs
  }
  const byActor = compareOptionalStamp(a.from, b.from)
  if (byActor !== 0) {
    return byActor > 0
  }
  const bySeq = compareOptionalStamp(a.seq, b.seq)
  if (bySeq !== 0) {
    return bySeq > 0
  }
  return a.id > b.id
}

/** Newest log position among Message rows. */
export const maxRowOrder = (
  rows: ReadonlyArray<unknown>,
): Option.Option<LogRowOrder> =>
  Array.reduce(rows, Option.none<LogRowOrder>(), (newest, row) => {
    const order = rowOrderOf(row)
    if (Option.isNone(order)) {
      return newest
    }
    if (Option.isNone(newest) || isRowOrderAfter(order.value, newest.value)) {
      return order
    }
    return newest
  })

/** True when Instant has no snapshot row yet. */
export const isEmptySnapshot = (snapshot: unknown): boolean => {
  if (snapshot === undefined || snapshot === null) {
    return true
  }
  if (!isPlainObject(snapshot)) {
    return false
  }
  return Array.isArrayEmpty(Object.keys(snapshot))
}

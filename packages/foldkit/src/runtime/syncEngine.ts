import { Array, Data, Effect, Option, Scope } from 'effect'

import { type Host, print } from '../processor/host.js'
import type { LocalSnapshotScope, LocalSnapshotStore } from './localSnapshot.js'
import type { SyncLinkState } from './syncTrace.js'

/** Result of one sync write. Isolated Memory reports `offline`. */
export type SyncLink = 'offline' | 'queued' | 'delivered'

/**
 * One write of a snapshot row and a Message row. The runtime fills the
 * Message row's `id`, `programVersion`, `from` (the Processor that wrote
 * it) and `createdAtMs`, `client` with the Host of the client it was
 * sent for when it differs from the Processor's own Host, and any optional
 * client metadata fields (`browser`, `windowLabel`, `appVersion`,
 * `userEmail`) supplied by the host. An engine keeps the fields its store
 * has a place for.
 */
export type SyncWrite = Readonly<{
  snapshot: unknown
  message: unknown
}>

/** Outcome of one {@link SyncEngine.write}. */
export type SyncWriteResult = Readonly<{
  link: SyncLink
}>

/** The rows a sync engine holds now. Messages are used only to skip echoes at boot. */
export type SyncRead = Readonly<{
  snapshot: unknown | undefined
  messages: ReadonlyArray<unknown>
}>

/**
 * Rows the store received after a cursor, in the order it received them,
 * and the cursor after the last of them. A row written offline and synced
 * late is received late, so it is never behind a cursor that was read
 * before it arrived.
 */
export type SyncPage = Readonly<{
  messages: ReadonlyArray<unknown>
  maybeCursor: Option.Option<string>
}>

/**
 * One slot of a 4-slot shared snapshot ring stored on the sync engine so a
 * brand-new device can cold-boot from a recent folded Model and only read the
 * trailing rows after its cursor.
 */
export type SharedSnapshotRow = Readonly<{
  slot: number
  programVersion: number
  foldRevision: string
  count: number
  writtenBy: string
  writtenAtMs: number
  payload: string
}>

/** Query parameters for reading a Program's shared snapshot ring. */
export type SharedSnapshotQuery = Readonly<{
  programVersion: number
  foldRevision: string
}>

/** One live event from a sync engine. */
export type SyncEvent =
  | Readonly<{ readonly _tag: 'Snapshot'; readonly row: unknown }>
  | Readonly<{ readonly _tag: 'Message'; readonly row: unknown }>

/** A sync engine's read, write, or observe failed. `cause` is the engine's sentence. */
export class SyncTransportError extends Data.TaggedError('SyncTransportError')<{
  readonly cause: string
  readonly operation: 'AuthChanged' | 'Decode' | 'Observe' | 'Read' | 'Write'
  readonly isTerminal?: boolean
  readonly raw?: unknown
}> {}

/**
 * What Foldkit needs of a sync engine, and all it knows of one: read the
 * rows, write a snapshot row and a Message row, and hear rows as they
 * arrive. Any engine that does these carries a synced Program. `Memory()`
 * here implements it for tests, `Instant()` in `@foldkit/instant` for the
 * examples, and a test may write its own in a few lines. An engine has no
 * Model: every Processor folds its own from the rows.
 */
export type SyncEngine = Readonly<{
  processor: string
  /**
   * Whether `write` stores a per-Message snapshot alongside the Message row.
   * Defaults to `true` for legacy snapshot-log tables; message-only logs set
   * `false` so `Runtime.start` does not encode the full Ready Model on every
   * persisted Message just to discard it.
   */
  writesSnapshot?: boolean
  read: () => Effect.Effect<SyncRead, SyncTransportError>
  readSince?: (
    maybeCursor: Option.Option<string>,
  ) => Effect.Effect<SyncPage, SyncTransportError>
  subscribe: (
    enqueue: (event: SyncEvent) => void,
  ) => Effect.Effect<void, never, Scope.Scope>
  write: (
    write: SyncWrite,
  ) => Effect.Effect<SyncWriteResult, SyncTransportError>
  /**
   * Tells where the engine's link to its store stands: its state now,
   * then each change, until the Scope closes. An engine that cannot know
   * leaves it out, and its runtime's trace then holds no link changes.
   */
  links?: (
    listener: (link: SyncLinkState) => void,
  ) => Effect.Effect<void, never, Scope.Scope>
  /**
   * Optional engine-owned local snapshot store, resolved by `Runtime.start`
   * after `runtime.initialization` so sign-in has already settled. Tests
   * (`Memory()`, fake transports) omit it.
   */
  localSnapshot?: Effect.Effect<Option.Option<LocalSnapshotStore>, unknown>
  /**
   * Optional scope identity stamped into the local snapshot envelope and
   * verified on decode, preventing cross-app, cross-room, or cross-member
   * leaks even when a caller supplies an explicit override store.
   */
  snapshotScope?: Effect.Effect<Option.Option<LocalSnapshotScope>, unknown>
  /**
   * Notifies `Runtime.start` when the authenticated identity pinned at boot
   * signs out or switches to another member, so the runtime can freeze
   * persistence, remove the local cache, and transition to `SyncFailed`.
   */
  watchAuthChanged?: (
    onChanged: (reason: string) => void,
  ) => Effect.Effect<void, never, Scope.Scope>
  /**
   * Answers whether this Processor id already owns at least one Message row in
   * the log. Shared-snapshot cold boot only runs when this is `false`, because
   * an existing Processor may have local navigation rows omitted from the
   * stranger-viewpoint shared snapshot.
   */
  hasOwnRows?: Effect.Effect<boolean, SyncTransportError>
  /**
   * Reads the shared 4-slot snapshot ring for `(programVersion, foldRevision)`.
   * Exposed only by engines whose trust boundary permits shared snapshots
   * (such as `SignedInUser` rooms or in-memory test engines).
   */
  readSharedSnapshots?: (
    query: SharedSnapshotQuery,
  ) => Effect.Effect<ReadonlyArray<SharedSnapshotRow>, SyncTransportError>
  /**
   * Writes one slot of the shared 4-slot snapshot ring. Engines should enforce
   * monotonicity (`new.count >= existing.count`) and fail with
   * `SyncTransportError({ operation: 'Write' })` if rejected.
   */
  writeSharedSnapshot?: (
    snapshot: SharedSnapshotRow,
  ) => Effect.Effect<void, SyncTransportError>
}>

/** Shared Memory rows. Two Processors share one store. */
export type MemoryStore = {
  snapshot: unknown | undefined
  messages: Array<unknown>
  listeners: Set<(event: SyncEvent) => void>
  sharedSnapshots: Map<string, SharedSnapshotRow>
}

/** Memory engine with test hooks, a stand-in for a real sync engine. */
export type MemoryEngine = SyncEngine &
  Readonly<{
    readSince: NonNullable<SyncEngine['readSince']>
    hasOwnRows: NonNullable<SyncEngine['hasOwnRows']>
    readSharedSnapshots: NonNullable<SyncEngine['readSharedSnapshots']>
    writeSharedSnapshot: NonNullable<SyncEngine['writeSharedSnapshot']>
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
  sharedSnapshots: new Map(),
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
 * An in-process sync engine for tests. Not a product store.
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
  const linkListeners = new Set<(link: SyncLinkState) => void>()

  const linkNow = (): SyncLinkState =>
    isIsolated || isOffline ? 'Offline' : 'Connected'

  const tellLink = (): void => {
    for (const listener of linkListeners) {
      listener(linkNow())
    }
  }

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
      tellLink()
    },
    comeOnline: () => {
      isOffline = false
      tellLink()
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
    links: listener =>
      Effect.acquireRelease(
        Effect.sync(() => {
          linkListeners.add(listener)
          listener(linkNow())
        }),
        () =>
          Effect.sync(() => {
            linkListeners.delete(listener)
          }),
      ),
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
    readSince: maybeCursor => {
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
      const start = Option.getOrElse(
        Option.map(maybeCursor, cursor => Number.parseInt(cursor, 10)),
        () => 0,
      )
      return Effect.succeed({
        messages: store.messages.slice(start),
        maybeCursor: Option.some(String(store.messages.length)),
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
    hasOwnRows: Effect.sync(() =>
      Array.some(
        store.messages,
        row => Option.getOrUndefined(readRowString(row, 'from')) === processor,
      ),
    ),
    readSharedSnapshots: query =>
      Effect.sync(() =>
        Array.filter(
          Array.fromIterable(store.sharedSnapshots.values()),
          row =>
            row.programVersion === query.programVersion &&
            row.foldRevision === query.foldRevision,
        ),
      ),
    writeSharedSnapshot: snapshot =>
      Effect.suspend(() => {
        if (isOffline) {
          return Effect.fail(
            new SyncTransportError({
              cause: 'offline: shared snapshot write skipped',
              operation: 'Write',
            }),
          )
        }
        const key = `${snapshot.programVersion}:${snapshot.foldRevision}:${snapshot.slot}`
        const existing = store.sharedSnapshots.get(key)
        if (existing !== undefined && snapshot.count < existing.count) {
          return Effect.fail(
            new SyncTransportError({
              cause: 'monotonic shared snapshot rule rejected older count',
              operation: 'Write',
            }),
          )
        }
        store.sharedSnapshots.set(key, snapshot)
        return Effect.void
      }),
  }
}

/** Reads a string field from a sync engine row. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads a string field from a sync engine row. */
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

/** Reads a number field from a sync engine row. */
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

/** True when the sync engine has no snapshot row yet. */
export const isEmptySnapshot = (snapshot: unknown): boolean => {
  if (snapshot === undefined || snapshot === null) {
    return true
  }
  if (!isPlainObject(snapshot)) {
    return false
  }
  return Array.isArrayEmpty(Object.keys(snapshot))
}

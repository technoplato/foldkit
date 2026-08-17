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

  const notify = (event: SyncEvent): void => {
    for (const listener of store.listeners) {
      listener(event)
    }
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
          store.listeners.add(enqueue)
        }),
        () =>
          Effect.sync(() => {
            store.listeners.delete(enqueue)
          }),
      ),
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
      store.snapshot = write.snapshot
      store.messages.push(write.message)
      notify({ _tag: 'Snapshot', row: write.snapshot })
      notify({ _tag: 'Message', row: write.message })
      return Effect.succeed({
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

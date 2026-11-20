import { Array, Effect, Option, Schema as S } from 'effect'
import { Runtime } from 'foldkit'

import { sha256 } from '@noble/hashes/sha2.js'

import {
  type PinnedOwnerController,
  ProgramLogAuthChangedError,
  type ProgramLogDatabase,
  type ProgramLogOwner,
} from './core.js'

const textEncoder = new TextEncoder()

const hexByte = (byte: number): string => byte.toString(16).padStart(2, '0')

/**
 * Deterministic UUID v4-shaped entity id for one slot of a shared snapshot
 * ring, derived from `(app, room, ownerUserID, programVersion, foldRevision,
 * slot)` via SHA-256. Instant requires valid UUIDs on `tx.programSnapshot[id]`.
 *
 * @example
 * ```typescript
 * sharedSnapshotSlotId({
 *   app: 'books',
 *   room: 'public',
 *   ownerUserID: 'member-1',
 *   programVersion: 1,
 *   foldRevision: 'fold-v1',
 *   slot: 0,
 * })
 * ```
 */
export const sharedSnapshotSlotId = (
  input: Readonly<{
    app: string
    room: string
    ownerUserID: string
    programVersion: number
    foldRevision: string
    slot: number
  }>,
): string => {
  const seed = JSON.stringify([
    'foldkit-shared-snapshot-v1',
    input.app,
    input.room,
    input.ownerUserID,
    input.programVersion,
    input.foldRevision,
    input.slot,
  ])
  const digest = sha256(textEncoder.encode(seed))
  const bytes = new Uint8Array(digest.slice(0, 16))
  // Stamp RFC 4122 version 4 and variant 10xx bits so Instant's UUID check accepts it.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = globalThis.Array.from(bytes, hexByte).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** Query for all slots in one Program's 4-slot shared snapshot ring. */
export const programSnapshotRingQuery = (
  app: string,
  room: string,
  programVersion: number,
  foldRevision: string,
  ownerUserID: string,
) =>
  ({
    programSnapshot: {
      $: {
        where: {
          app,
          room,
          programVersion,
          foldRevision,
          ownerUserID,
        },
      },
    },
  }) as const

/** Existence query checking whether `processor` already wrote any log row. */
export const hasOwnProgramMessageQuery = (
  app: string,
  processor: string,
  ownerUserID: string,
) =>
  ({
    programMessage: {
      $: {
        where: {
          app,
          ownerUserID,
          from: processor,
        },
        limit: 1,
      },
    },
  }) as const

const StoredProgramSnapshotRow = S.Struct({
  slot: S.Number,
  programVersion: S.Number,
  foldRevision: S.String,
  count: S.Number,
  writtenBy: S.String,
  writtenAtMs: S.Number,
  payload: S.String,
})

const toTransportError = (
  cause: unknown,
  operation: Runtime.SyncTransportError['operation'],
): Runtime.SyncTransportError => {
  if (cause instanceof ProgramLogAuthChangedError) {
    return new Runtime.SyncTransportError({
      cause: cause.message,
      operation: 'AuthChanged',
      isTerminal: true,
    })
  }
  const message =
    cause instanceof Error && cause.message !== ''
      ? cause.message
      : typeof cause === 'string' && cause !== ''
        ? cause
        : 'Instant shared snapshot operation failed.'
  return new Runtime.SyncTransportError({
    cause: message,
    operation,
  })
}

type SharedSnapshotTx = Readonly<{
  programSnapshot?: Record<
    string,
    Readonly<{ update: (fields: Readonly<Record<string, unknown>>) => unknown }>
  >
}>

type SharedSnapshotQueryResponse = Readonly<{
  data: Readonly<{
    programMessage?: ReadonlyArray<unknown>
    programSnapshot?: ReadonlyArray<unknown>
  }>
}>

/**
 * Shared 4-slot snapshot hooks for a `programLog` Instant engine.
 *
 * Strictly enabled ONLY for `owner === 'SignedInUser'` so open `Anyone` rooms
 * never trust untrusted peer-written shared snapshots. Every read and write
 * verifies the pinned `ownerUserID` and writes deterministic UUID slot ids.
 */
export const makeInstantSharedSnapshotHooks = (
  database: ProgramLogDatabase,
  app: string,
  room: string,
  processor: string,
  owner: ProgramLogOwner,
  pinnedOwner: PinnedOwnerController,
): Pick<
  Runtime.SyncEngine,
  'hasOwnRows' | 'readSharedSnapshots' | 'writeSharedSnapshot'
> => {
  if (owner !== 'SignedInUser') {
    return {}
  }

  const queryOnce = (query: unknown): Promise<SharedSnapshotQueryResponse> =>
    (
      database.queryOnce as (
        query: unknown,
      ) => Promise<SharedSnapshotQueryResponse>
    )(query)

  const hasOwnRows: NonNullable<Runtime.SyncEngine['hasOwnRows']> =
    Effect.tryPromise({
      try: async () => {
        const maybeOwner = await pinnedOwner.resolvePinnedOwner()
        if (Option.isNone(maybeOwner)) {
          return true
        }
        const response = await queryOnce(
          hasOwnProgramMessageQuery(app, processor, maybeOwner.value),
        )
        return (response.data.programMessage ?? []).length > 0
      },
      catch: cause => toTransportError(cause, 'Read'),
    })

  const readSharedSnapshots: NonNullable<
    Runtime.SyncEngine['readSharedSnapshots']
  > = query =>
    Effect.tryPromise({
      try: async () => {
        const maybeOwner = await pinnedOwner.resolvePinnedOwner()
        if (Option.isNone(maybeOwner)) {
          return []
        }
        const response = await queryOnce(
          programSnapshotRingQuery(
            app,
            room,
            query.programVersion,
            query.foldRevision,
            maybeOwner.value,
          ),
        )
        const rows = response.data.programSnapshot ?? []
        return Array.getSomes(
          Array.map(rows, row =>
            S.decodeUnknownOption(StoredProgramSnapshotRow)(row),
          ),
        )
      },
      catch: cause => toTransportError(cause, 'Read'),
    })

  const writeSharedSnapshot: NonNullable<
    Runtime.SyncEngine['writeSharedSnapshot']
  > = snapshot =>
    Effect.tryPromise({
      try: async () => {
        const maybeOwner = await pinnedOwner.assertPinnedForWrite()
        if (Option.isNone(maybeOwner)) {
          throw new Error('Cannot write a shared snapshot without a signed-in owner.')
        }
        const ownerUserID = maybeOwner.value
        const slotId = sharedSnapshotSlotId({
          app,
          room,
          ownerUserID,
          programVersion: snapshot.programVersion,
          foldRevision: snapshot.foldRevision,
          slot: snapshot.slot,
        })
        const tx = database.tx as unknown as SharedSnapshotTx
        const entity = tx.programSnapshot?.[slotId]
        if (entity === undefined) {
          throw new Error('Instant database transaction builder lacks programSnapshot.')
        }
        const chunk = entity.update({
          app,
          room,
          programVersion: snapshot.programVersion,
          foldRevision: snapshot.foldRevision,
          ownerUserID,
          slot: snapshot.slot,
          count: snapshot.count,
          writtenBy: snapshot.writtenBy,
          writtenAtMs: snapshot.writtenAtMs,
          payload: snapshot.payload,
        })
        await (
          database.transact as (chunks: ReadonlyArray<unknown>) => Promise<unknown>
        )([chunk])
      },
      catch: cause => toTransportError(cause, 'Write'),
    })

  return {
    hasOwnRows,
    readSharedSnapshots,
    writeSharedSnapshot,
  }
}

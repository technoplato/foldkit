import { Array, Effect, Option, Schema as S, Stream } from 'effect'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  InstantCountSnapshotRecord,
  InstantLogMessageRecord,
  SnapshotLogError,
  type SnapshotLogTransport,
  type SnapshotLogWrite,
  countSnapshotId,
  emptyCountSnapshotFor,
  memorySnapshotLogOutcome,
  upsertLogMessage,
} from './snapshotLog.js'

const FileCountLog = S.Struct({
  messages: S.Array(InstantLogMessageRecord),
  snapshot: S.optionalKey(InstantCountSnapshotRecord),
  counts: S.optionalKey(S.Array(InstantCountSnapshotRecord)),
})

const selectedCountId = (countId: string | undefined): string => {
  if (countId !== undefined && countId !== '') {
    return countId
  }
  const fromEnv = process.env['COUNTER_COUNT_ID']
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv
  }
  return countSnapshotId
}

const upsertCount = (
  counts: ReadonlyArray<InstantCountSnapshotRecord>,
  snapshot: InstantCountSnapshotRecord,
): ReadonlyArray<InstantCountSnapshotRecord> =>
  Array.append(
    Array.filter(counts, existing => existing.id !== snapshot.id),
    snapshot,
  )

const snapshotOf = (
  counts: ReadonlyArray<InstantCountSnapshotRecord>,
  countId: string,
): InstantCountSnapshotRecord => {
  const maybeCount = Array.findFirst(counts, row => row.id === countId)
  if (Option.isSome(maybeCount)) {
    return maybeCount.value
  }
  return emptyCountSnapshotFor(countId)
}

const countsFromDocument = (
  document: typeof FileCountLog.Type,
): ReadonlyArray<InstantCountSnapshotRecord> => {
  if (document.counts !== undefined) {
    return document.counts
  }
  if (document.snapshot !== undefined) {
    return [document.snapshot]
  }
  return []
}

const readCounts = (
  path: string,
): ReadonlyArray<InstantCountSnapshotRecord> => {
  if (!existsSync(path)) {
    return []
  }
  const document = S.decodeUnknownSync(FileCountLog)(
    JSON.parse(readFileSync(path, 'utf8')),
  )
  return countsFromDocument(document)
}

const readState = (
  path: string,
  countId: string | undefined,
): {
  readonly messages: ReadonlyArray<InstantLogMessageRecord>
  readonly snapshot: InstantCountSnapshotRecord
  readonly counts: ReadonlyArray<InstantCountSnapshotRecord>
} => {
  if (!existsSync(path)) {
    const id = selectedCountId(countId)
    return {
      messages: [],
      snapshot: emptyCountSnapshotFor(id),
      counts: [],
    }
  }
  const document = S.decodeUnknownSync(FileCountLog)(
    JSON.parse(readFileSync(path, 'utf8')),
  )
  const counts = countsFromDocument(document)
  return {
    messages: document.messages,
    snapshot: snapshotOf(counts, selectedCountId(countId)),
    counts,
  }
}

/**
 * Reads every count row from a file tape. Missing files are none.
 * Used to resolve named-share ACL before the Processor starts.
 */
export const listFileCountSnapshots = (
  path: string,
): ReadonlyArray<InstantCountSnapshotRecord> => {
  try {
    return readCounts(path)
  } catch {
    return []
  }
}

/**
 * File snapshot log. Two Node processes share counts through this file.
 * Public and named rows stay distinct. Instant has no Model.
 */
export const makeFileSnapshotLogTransport = (
  path: string,
  countId?: string,
): SnapshotLogTransport => ({
  read: () =>
    Effect.try({
      try: () => {
        const state = readState(path, countId)
        return {
          messages: state.messages,
          snapshot: state.snapshot,
        }
      },
      catch: cause =>
        new SnapshotLogError({
          cause,
          operation: 'Read',
        }),
    }),
  subscribe: Stream.fromEffect(
    Effect.try({
      try: () => {
        const state = readState(path, countId)
        return {
          messages: state.messages,
          snapshot: state.snapshot,
        }
      },
      catch: cause =>
        new SnapshotLogError({
          cause,
          operation: 'Observe',
        }),
    }),
  ),
  write: (write: SnapshotLogWrite) =>
    Effect.try({
      try: () => {
        const current = readState(path, countId)
        const counts = upsertCount(current.counts, write.snapshot)
        const next = {
          messages: upsertLogMessage(current.messages, write.message),
          counts,
          snapshot: write.snapshot,
        }
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, `${JSON.stringify(next)}\n`)
        return memorySnapshotLogOutcome()
      },
      catch: cause =>
        new SnapshotLogError({
          cause,
          operation: 'Write',
        }),
    }),
})

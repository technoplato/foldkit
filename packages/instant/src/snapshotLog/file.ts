import { Effect, Schema as S, Stream } from 'effect'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  SnapshotLogError,
  SnapshotLogState,
  type SnapshotLogTransport,
  type SnapshotLogWrite,
  emptySnapshotLogState,
  memorySnapshotLogOutcome,
  upsertLogMessage,
} from './snapshotLog.js'

const readState = (path: string): SnapshotLogState => {
  if (!existsSync(path)) {
    return emptySnapshotLogState
  }
  return S.decodeUnknownSync(SnapshotLogState)(
    JSON.parse(readFileSync(path, 'utf8')),
  )
}

/**
 * File snapshot log. Two Node processes share one count through this file.
 * Instant has no Model.
 */
export const makeFileSnapshotLogTransport = (
  path: string,
): SnapshotLogTransport => ({
  read: () =>
    Effect.try({
      try: () => readState(path),
      catch: cause =>
        new SnapshotLogError({
          cause,
          operation: 'Read',
        }),
    }),
  subscribe: Stream.fromEffect(
    Effect.try({
      try: () => readState(path),
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
        const current = readState(path)
        const next = {
          messages: upsertLogMessage(current.messages, write.message),
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

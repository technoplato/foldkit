import { Effect, Schema as S, Stream } from 'effect'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  InstantLogMessageRecord,
  SnapshotLogError,
  memorySnapshotLogOutcome,
  upsertLogMessage,
} from '@foldkit/instant'

import {
  InstantPuzzleSnapshotRecord,
  type PuzzleSnapshotLogState,
  type PuzzleSnapshotLogTransport,
  type PuzzleSnapshotLogWrite,
  emptyPuzzleSnapshotLogState,
} from './instantSchema.js'

const FilePuzzleSnapshotLogState = S.Struct({
  messages: S.Array(InstantLogMessageRecord),
  snapshot: S.optional(InstantPuzzleSnapshotRecord),
})

const readState = (path: string): PuzzleSnapshotLogState => {
  if (!existsSync(path)) {
    return emptyPuzzleSnapshotLogState
  }
  const decoded = S.decodeUnknownSync(FilePuzzleSnapshotLogState)(
    JSON.parse(readFileSync(path, 'utf8')),
  )
  return {
    messages: decoded.messages,
    snapshot: decoded.snapshot,
  }
}

/**
 * File snapshot log. Two Node processes share one tape through this
 * file. Instant has no Model. The snapshot Schema is the tape ADT.
 */
export const makeFilePuzzleSnapshotLogTransport = (
  path: string,
): PuzzleSnapshotLogTransport => ({
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
  write: (write: PuzzleSnapshotLogWrite) =>
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

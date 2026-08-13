import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

/** A queued archive has been recorded and is not playable yet. */
export const QueuedArchive = ts('QueuedArchive')
/** The archive has a playable transcript in Instant. */
export const ReadyArchive = ts('ReadyArchive')
/** Ingest failed for this URL. */
export const FailedArchive = ts('FailedArchive')
/** Every ingest status for one archive. */
export const ArchiveStatus = S.Union([QueuedArchive, ReadyArchive, FailedArchive])
/** An ingest status value. */
export type ArchiveStatus = typeof ArchiveStatus.Type

/** One archived reel or video the Program can list. */
export const Archive = S.Struct({
  id: S.String,
  url: S.String,
  title: S.String,
  status: ArchiveStatus,
})
/** An Archive value. */
export type Archive = typeof Archive.Type

/** The Archiver Model: a URL draft and the archives already recorded. */
export const Model = S.Struct({
  urlDraft: S.String,
  archives: S.Array(Archive),
})
/** An Archiver Model value. */
export type Model = typeof Model.Type

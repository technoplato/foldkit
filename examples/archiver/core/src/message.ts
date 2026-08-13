import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

/** Records that the URL draft field changed. */
export const UpdatedUrlDraft = m('UpdatedUrlDraft', { value: S.String })
/** Records that the user submitted the URL draft for ingest. */
export const SubmittedArchiveUrl = m('SubmittedArchiveUrl')
/** Records that one archive in the shelf was opened. */
export const ClickedArchive = m('ClickedArchive', { id: S.String })

/** Every Message accepted by the Archiver Program. */
export const Message = S.Union([
  UpdatedUrlDraft,
  SubmittedArchiveUrl,
  ClickedArchive,
])
/** An Archiver Message value. */
export type Message = typeof Message.Type

import { Array, Match as M, Option, Order, Schema as S, pipe } from 'effect'

import { decodeSections, rowsOf } from '../decode.js'
import {
  FailedSharedAudio,
  NoSharedAudio,
  PreparingSharedAudio,
  ReadySharedAudio,
  type RecordingShare,
  type ShareRecipient,
  type SharedAudio,
  type SharedRange,
} from './model.js'

const OptionalString = S.optionalKey(S.NullOr(S.String))
const OptionalNumber = S.optionalKey(S.NullOr(S.Number))

const ShareRow = S.Struct({
  id: S.String,
  ownerUserID: OptionalString,
  recordingID: S.String,
  firstSegmentIndex: S.Number,
  lastSegmentIndex: S.Number,
  startSeconds: OptionalNumber,
  endSeconds: OptionalNumber,
  visibility: OptionalString,
  recipientEmail: OptionalString,
  linkToken: OptionalString,
  sharedByDisplayName: OptionalString,
  note: OptionalString,
  createdAtMs: S.Number,
})
type ShareRow = typeof ShareRow.Type

const RecipientRow = S.Struct({
  id: S.String,
  email: S.String,
  displayName: OptionalString,
  lastSharedAtMs: S.Number,
  shareCount: S.Number,
  createdAtMs: S.Number,
})

const RecordingHeadRow = S.Struct({ title: S.String, startedAtMs: S.Number })
const ReaderRow = S.Struct({ id: S.String })

const presentText = (value: string | null | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), text => text.trim() !== '')

const shareOf = (row: ShareRow): RecordingShare => ({
  id: row.id,
  recordingID: row.recordingID,
  visibility: row.visibility === 'link' ? 'Link' : 'People',
  maybeRecipientEmail: presentText(row.recipientEmail),
  maybeLinkToken: presentText(row.linkToken),
  firstSegmentIndex: row.firstSegmentIndex,
  lastSegmentIndex: row.lastSegmentIndex,
  startSeconds: Option.getOrElse(
    Option.fromNullishOr(row.startSeconds),
    () => 0,
  ),
  endSeconds: Option.getOrElse(Option.fromNullishOr(row.endSeconds), () => 0),
  maybeNote: presentText(row.note),
  maybeSharedBy: presentText(row.sharedByDisplayName),
  createdAtMs: row.createdAtMs,
})

const byNewestShare = Order.mapInput(
  Order.flip(Order.Number),
  (share: RecordingShare) => share.createdAtMs,
)

/** Reads a recording's share rows, newest first; rows that cannot be read are skipped. */
export const decodeShares = (
  rows: ReadonlyArray<unknown>,
): ReadonlyArray<RecordingShare> =>
  pipe(
    rows,
    Array.map(row => S.decodeUnknownOption(ShareRow)(row)),
    Array.getSomes,
    Array.map(shareOf),
    Array.sort(byNewestShare),
  )

/**
 * Reads the shares other accounts made to this one (ADR 0014, Shared with
 * me), newest first. A share this account made itself is left out, so a
 * recording it owns never shows as shared with it.
 */
export const decodeReceivedShares = (
  rows: ReadonlyArray<unknown>,
  viewerUserID: string,
): ReadonlyArray<RecordingShare> =>
  pipe(
    rows,
    Array.map(row => S.decodeUnknownOption(ShareRow)(row)),
    Array.getSomes,
    Array.filter(row => row.ownerUserID !== viewerUserID),
    Array.map(shareOf),
    Array.sort(byNewestShare),
  )

const byMostRecentlyShared = Order.mapInput(
  Order.flip(Order.Number),
  (recipient: ShareRecipient) => recipient.lastSharedAtMs,
)

/** Reads the owner's recipient rows, most recently shared first. */
export const decodeShareRecipients = (
  rows: ReadonlyArray<unknown>,
): ReadonlyArray<ShareRecipient> =>
  pipe(
    rows,
    Array.map(row => S.decodeUnknownOption(RecipientRow)(row)),
    Array.getSomes,
    Array.map(row => ({
      id: row.id,
      email: row.email,
      maybeDisplayName: presentText(row.displayName),
      lastSharedAtMs: row.lastSharedAtMs,
      shareCount: row.shareCount,
      createdAtMs: row.createdAtMs,
    })),
    Array.sort(byMostRecentlyShared),
  )

const SharedRangeRow = S.Struct({
  ...ShareRow.fields,
  audioClipStatus: OptionalString,
  audioClipDurationSeconds: OptionalNumber,
  audioClip: S.optionalKey(S.Unknown),
  recording: S.optionalKey(S.Unknown),
  segments: S.optionalKey(S.Unknown),
  readers: S.optionalKey(S.Unknown),
})
type SharedRangeRow = typeof SharedRangeRow.Type

const ClipFileRow = S.Struct({ url: S.String })

const readyClipOf = (row: SharedRangeRow): SharedAudio =>
  Option.match(
    pipe(
      Array.head(rowsOf(row.audioClip)),
      Option.flatMap(file => S.decodeUnknownOption(ClipFileRow)(file)),
      Option.flatMap(file => presentText(file.url)),
    ),
    {
      onNone: () => PreparingSharedAudio(),
      onSome: url =>
        ReadySharedAudio({
          url,
          maybeDurationSeconds: Option.filter(
            Option.fromNullishOr(row.audioClipDurationSeconds),
            seconds => seconds > 0,
          ),
        }),
    },
  )

/**
 * Reads a share's audio clip from its status and its `audioClip` file. A
 * ready status whose file the viewer cannot read yet still reads as preparing:
 * the subscription shows the clip once the file arrives.
 */
const sharedAudioOf = (row: SharedRangeRow): SharedAudio =>
  M.value(
    Option.getOrElse(Option.fromNullishOr(row.audioClipStatus), () => 'none'),
  ).pipe(
    M.withReturnType<SharedAudio>(),
    M.when('ready', () => readyClipOf(row)),
    M.when('preparing', () => PreparingSharedAudio()),
    M.when('failed', () => FailedSharedAudio()),
    M.orElse(() => NoSharedAudio()),
  )

/**
 * Reads an opened share: the share row, its recording's title and start, the
 * sections in its range (a range reader can read no others), whether the
 * viewer already claimed it, and its audio clip.
 */
export const decodeSharedRange = (
  rows: ReadonlyArray<unknown>,
  maybeViewerUserID: Option.Option<string>,
): Option.Option<SharedRange> =>
  pipe(
    Array.head(rows),
    Option.flatMap(row => S.decodeUnknownOption(SharedRangeRow)(row)),
    Option.flatMap(row =>
      Option.map(
        pipe(
          Array.head(rowsOf(row.recording)),
          Option.flatMap(recording =>
            S.decodeUnknownOption(RecordingHeadRow)(recording),
          ),
        ),
        recording => ({
          share: shareOf(row),
          recordingTitle: recording.title,
          recordingStartedAtMs: recording.startedAtMs,
          sections: Array.filter(
            decodeSections(rowsOf(row.segments)),
            section =>
              section.index >= row.firstSegmentIndex &&
              section.index <= row.lastSegmentIndex,
          ),
          isClaimedByViewer: Option.exists(maybeViewerUserID, viewerID =>
            pipe(
              rowsOf(row.readers),
              Array.map(reader => S.decodeUnknownOption(ReaderRow)(reader)),
              Array.getSomes,
              Array.some(reader => reader.id === viewerID),
            ),
          ),
          audio: sharedAudioOf(row),
        }),
      ),
    ),
  )

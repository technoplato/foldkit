import { Array, Match as M, Option, Order, Schema as S, pipe } from 'effect'

import { rowsOf, scrubbedLinesOf } from '../decode.js'
import {
  FailedSharedAudio,
  LinkAudience,
  NamedAudience,
  NoSharedAudio,
  OwnShare,
  PassedScrub,
  PendingScrub,
  PreparingSharedAudio,
  PublicAudience,
  ReadySharedAudio,
  type RecordingShare,
  type ScrubState,
  type ScrubbedImage,
  type ShareAudience,
  type ShareRecipient,
  type SharedAudio,
  type SharedRange,
  WithheldScrub,
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
  scrubStatus: OptionalString,
  scrubReason: OptionalString,
  scrubbedTitle: OptionalString,
  scrubbedNote: OptionalString,
  scrubbedImages: S.optionalKey(S.Unknown),
  readers: S.optionalKey(S.Unknown),
  owner: S.optionalKey(S.Unknown),
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

const ScrubbedImageRow = S.Struct({
  id: S.String,
  attachmentID: S.String,
  offsetSeconds: S.Number,
  status: S.String,
  width: OptionalNumber,
  height: OptionalNumber,
  file: S.optionalKey(S.Unknown),
})

const PASSED = 'passed'

const passedImagesOf = (row: SharedRangeRow): ReadonlyArray<ScrubbedImage> =>
  pipe(
    rowsOf(row.scrubbedImages),
    Array.map(image => S.decodeUnknownOption(ScrubbedImageRow)(image)),
    Array.getSomes,
    Array.filter(image => image.status === PASSED),
    Array.map(image =>
      Option.map(
        pipe(
          Array.head(rowsOf(image.file)),
          Option.flatMap(file => S.decodeUnknownOption(ClipFileRow)(file)),
          Option.flatMap(file => presentText(file.url)),
        ),
        url => ({
          id: image.id,
          attachmentID: image.attachmentID,
          offsetSeconds: image.offsetSeconds,
          url,
          maybeWidth: Option.fromNullishOr(image.width),
          maybeHeight: Option.fromNullishOr(image.height),
        }),
      ),
    ),
    Array.getSomes,
  )

const scrubStateOf = (row: SharedRangeRow): ScrubState =>
  M.value(
    Option.getOrElse(Option.fromNullishOr(row.scrubStatus), () => 'pending'),
  ).pipe(
    M.withReturnType<ScrubState>(),
    M.when(PASSED, () => PassedScrub()),
    M.when('withheld', () =>
      WithheldScrub({ maybeReason: presentText(row.scrubReason) }),
    ),
    M.orElse(() => PendingScrub()),
  )

const isViewerClaimed = (
  row: SharedRangeRow,
  maybeViewerUserID: Option.Option<string>,
): boolean =>
  Option.exists(maybeViewerUserID, viewerID =>
    pipe(
      rowsOf(row.readers),
      Array.map(reader => S.decodeUnknownOption(ReaderRow)(reader)),
      Array.getSomes,
      Array.some(reader => reader.id === viewerID),
    ),
  )

/**
 * Who the share reaches, as the viewer sees it. The viewer's own share is one
 * made by this sign-in, or one whose owner the viewer can read: Scribe's rules
 * show a share's owner only to that owner's own sign-ins (ADR 0024), so the
 * web sign-in knows a share its iPhone sign-in made.
 */
const audienceOf = (
  row: SharedRangeRow,
  maybeViewerUserID: Option.Option<string>,
): ShareAudience => {
  const isOwnShare =
    Option.exists(
      maybeViewerUserID,
      viewerID => row.ownerUserID === viewerID,
    ) || Array.isReadonlyArrayNonEmpty(rowsOf(row.owner))
  return isOwnShare
    ? OwnShare()
    : M.value(row.visibility ?? '').pipe(
        M.withReturnType<ShareAudience>(),
        M.when('public', () => PublicAudience()),
        M.when('link', () => LinkAudience()),
        M.orElse(() => NamedAudience()),
      )
}

/**
 * Reads an opened share as its readers may read it (ADR 0014 section 13.11):
 * the share row, its scrubbed title and note, the scrubbed lines and images
 * that passed, whether the viewer already claimed it, and its audio clip. It
 * never reads the original sections or the recording: a share's readers
 * cannot, and its owner sees the share as they do. A pending share keeps
 * only the lines and images passed so far; a withheld share keeps nothing
 * but why.
 */
export const decodeSharedRange = (
  rows: ReadonlyArray<unknown>,
  maybeViewerUserID: Option.Option<string>,
): Option.Option<SharedRange> =>
  pipe(
    Array.head(rows),
    Option.flatMap(shareRow =>
      Option.map(S.decodeUnknownOption(SharedRangeRow)(shareRow), row => ({
        shareRow,
        row,
      })),
    ),
    Option.map(({ shareRow, row }) => {
      const scrub = scrubStateOf(row)
      const isClaimedByViewer = isViewerClaimed(row, maybeViewerUserID)
      const shareFields = {
        share: shareOf(row),
        scrub,
        isClaimedByViewer,
        audience: audienceOf(row, maybeViewerUserID),
      }
      return M.value(scrub).pipe(
        M.withReturnType<SharedRange>(),
        M.tagsExhaustive({
          PassedScrub: () => ({
            ...shareFields,
            maybeTitle: presentText(row.scrubbedTitle),
            maybeNote: presentText(row.scrubbedNote),
            lines: scrubbedLinesOf(shareRow),
            images: passedImagesOf(row),
            audio: sharedAudioOf(row),
          }),
          PendingScrub: () => ({
            ...shareFields,
            maybeTitle: Option.none(),
            maybeNote: Option.none(),
            lines: scrubbedLinesOf(shareRow),
            images: passedImagesOf(row),
            audio: NoSharedAudio(),
          }),
          WithheldScrub: () => ({
            ...shareFields,
            maybeTitle: Option.none(),
            maybeNote: Option.none(),
            lines: [],
            images: [],
            audio: NoSharedAudio(),
          }),
        }),
      )
    }),
  )

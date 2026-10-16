import { Array, Match as M, Option, Order, Schema as S, pipe } from 'effect'

import { rowsOf } from '../decode.js'
import type { Section, Word } from '../recording.js'
import {
  FailedSharedAudio,
  NoSharedAudio,
  PassedScrub,
  PendingScrub,
  PreparingSharedAudio,
  ReadySharedAudio,
  type RecordingShare,
  type ScrubState,
  type ScrubbedImage,
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
  scrubbedLines: S.optionalKey(S.Unknown),
  scrubbedImages: S.optionalKey(S.Unknown),
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

const ScrubbedLineRow = S.Struct({
  id: S.String,
  segmentIndex: S.Number,
  startSeconds: S.Number,
  endSeconds: S.Number,
  status: S.String,
  text: S.String,
  wordsJSON: OptionalString,
})
type ScrubbedLineRow = typeof ScrubbedLineRow.Type

const ScrubbedWord = S.Struct({
  text: S.String,
  start: S.Number,
  end: S.Number,
})
const ScrubbedWords = S.fromJsonString(S.Array(ScrubbedWord))

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

const scrubbedWordsOf = (row: ScrubbedLineRow): ReadonlyArray<Word> =>
  pipe(
    Option.fromNullishOr(row.wordsJSON),
    Option.flatMap(json => S.decodeUnknownOption(ScrubbedWords)(json)),
    Option.getOrElse(() => []),
    Array.map((word, position) => ({
      id: `${row.id}-${position}`,
      text: word.text,
      startSeconds: word.start,
      endSeconds: word.end,
    })),
  )

const bySegmentIndex = Order.mapInput(
  Order.Number,
  (line: Section) => line.index,
)

const passedLinesOf = (row: SharedRangeRow): ReadonlyArray<Section> =>
  pipe(
    rowsOf(row.scrubbedLines),
    Array.map(line => S.decodeUnknownOption(ScrubbedLineRow)(line)),
    Array.getSomes,
    Array.filter(line => line.status === PASSED),
    Array.map(line => ({
      id: line.id,
      index: line.segmentIndex,
      startSeconds: line.startSeconds,
      endSeconds: line.endSeconds,
      maybeSpeakerID: Option.none(),
      text: line.text,
      words: scrubbedWordsOf(line),
      isFinal: true,
    })),
    Array.sort(bySegmentIndex),
  )

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

const withheldRangeOf = (
  row: SharedRangeRow,
  scrub: ScrubState,
  maybeViewerUserID: Option.Option<string>,
): SharedRange => ({
  share: shareOf(row),
  maybeTitle: Option.none(),
  maybeNote: Option.none(),
  scrub,
  lines: [],
  images: [],
  isClaimedByViewer: isViewerClaimed(row, maybeViewerUserID),
  audio: NoSharedAudio(),
})

/**
 * Reads an opened share as its readers may read it (ADR 0014 section 13.11):
 * the share row, its scrubbed title and note, the scrubbed lines and images
 * that passed, whether the viewer already claimed it, and its audio clip. It
 * never reads the original sections or the recording: a share's readers
 * cannot, and its owner sees the share as they do. A withheld share keeps
 * nothing but why.
 */
export const decodeSharedRange = (
  rows: ReadonlyArray<unknown>,
  maybeViewerUserID: Option.Option<string>,
): Option.Option<SharedRange> =>
  pipe(
    Array.head(rows),
    Option.flatMap(row => S.decodeUnknownOption(SharedRangeRow)(row)),
    Option.map(row => {
      const scrub = scrubStateOf(row)
      return M.value(scrub).pipe(
        M.withReturnType<SharedRange>(),
        M.tag('WithheldScrub', () =>
          withheldRangeOf(row, scrub, maybeViewerUserID),
        ),
        M.orElse(() => ({
          share: shareOf(row),
          maybeTitle: presentText(row.scrubbedTitle),
          maybeNote: presentText(row.scrubbedNote),
          scrub,
          lines: passedLinesOf(row),
          images: passedImagesOf(row),
          isClaimedByViewer: isViewerClaimed(row, maybeViewerUserID),
          audio: sharedAudioOf(row),
        })),
      )
    }),
  )

import {
  Array,
  Match as M,
  Option,
  Order,
  Result,
  Schema as S,
  pipe,
} from 'effect'

import {
  type Activity,
  type CaptureGap,
  type ClipboardEntry,
  type ImageEntry,
  NoAudio,
  type PreviewLine,
  type RecordingAudio,
  type RecordingDetail,
  type RecordingSummary,
  type Section,
  type Speaker,
  StoredAudio,
  UploadingAudio,
  type Word,
} from './recording.js'

const OptionalString = S.optionalKey(S.NullOr(S.String))
const OptionalNumber = S.optionalKey(S.NullOr(S.Number))
const OptionalRows = S.optionalKey(S.Unknown)

const WordRow = S.Struct({
  id: OptionalString,
  text: S.String,
  start: S.Number,
  end: S.Number,
})

const WordRows = S.fromJsonString(S.Array(S.Unknown))

const decodeWordRow = S.decodeUnknownOption(WordRow)

const SegmentRow = S.Struct({
  id: S.String,
  segmentIndex: S.Number,
  startTimeSeconds: S.Number,
  endTimeSeconds: S.Number,
  text: S.String,
  speaker: OptionalNumber,
  wordsJSON: OptionalString,
  isFinal: S.Boolean,
})

const SystemAudioContextRow = S.Struct({
  platform: OptionalString,
  appBundleIdentifier: OptionalString,
  appDisplayName: OptionalString,
})

const SpeakerRow = S.Struct({
  id: S.Number,
  displayName: OptionalString,
  source: S.optionalKey(
    S.NullOr(
      S.Struct({
        systemAudio: S.optionalKey(
          S.NullOr(S.Struct({ _0: SystemAudioContextRow })),
        ),
      }),
    ),
  ),
})

const CaptureGapRow = S.Struct({
  startedAtMs: S.Number,
  endedAtMs: OptionalNumber,
})

const CaptureGapRows = S.fromJsonString(S.Array(S.Unknown))

const decodeCaptureGapRow = S.decodeUnknownOption(CaptureGapRow)

const ClipboardRow = S.Struct({
  id: S.String,
  timestamp: S.Number,
  fullContent: S.String,
})

const AttachmentRow = S.Struct({
  id: S.String,
  kind: S.String,
  timestampSeconds: OptionalNumber,
  byteCount: S.Number,
  storageFileID: OptionalString,
})

const RecordingRow = S.Struct({
  id: S.String,
  title: S.String,
  startedAtMs: S.Number,
  durationSeconds: S.Number,
  updatedAtMs: OptionalNumber,
  ownerUserID: OptionalString,
  activityKind: OptionalString,
  deviceIcon: OptionalString,
  liveRoomKey: OptionalString,
  captureGapsJSON: OptionalString,
  speakers: OptionalRows,
  clipboardEntries: OptionalRows,
  previewSegmentA: OptionalRows,
  previewSegmentB: OptionalRows,
  segments: OptionalRows,
  attachments: OptionalRows,
})
type RecordingRow = typeof RecordingRow.Type

/**
 * Rows that failed to decode and why the first one failed, so the screen says
 * data is missing instead of hiding it.
 */
export type SkippedRows = Readonly<{
  count: number
  maybeFirstReason: Option.Option<string>
}>

const combineSkipped = (
  first: SkippedRows,
  second: SkippedRows,
): SkippedRows => ({
  count: first.count + second.count,
  maybeFirstReason: Option.orElse(
    first.maybeFirstReason,
    () => second.maybeFirstReason,
  ),
})

type Decoded<A> = Readonly<{ values: ReadonlyArray<A>; skipped: SkippedRows }>

const decodeEach = <A, B>(
  schema: S.Codec<A>,
  rows: ReadonlyArray<unknown>,
  toValue: (row: A) => B,
): Decoded<B> => {
  const decode = S.decodeUnknownResult(schema)
  const decoded = Array.map(rows, row => decode(row))
  const failures = Array.filterMap(decoded, Result.flip)
  return {
    values: Array.map(
      Array.filterMap(decoded, result => result),
      toValue,
    ),
    skipped: {
      count: Array.length(failures),
      maybeFirstReason: Option.map(
        Array.head(failures),
        error => error.message,
      ),
    },
  }
}

const presentRows = (rows: unknown): ReadonlyArray<unknown> => {
  if (Array.isArray(rows)) {
    return rows
  } else if (rows === null || rows === undefined) {
    return []
  } else {
    return [rows]
  }
}

const presentString = (
  value: string | null | undefined,
): Option.Option<string> =>
  pipe(
    Option.fromNullishOr(value),
    Option.filter(text => text.trim() !== ''),
  )

const activityOf = (activityKind: string | null | undefined): Activity =>
  M.value(Option.getOrElse(Option.fromNullishOr(activityKind), () => '')).pipe(
    M.withReturnType<Activity>(),
    M.when('active', () => 'Recording'),
    M.when('playback', () => 'Playing'),
    M.orElse(() => 'Idle'),
  )

const captureGapsOf = (
  captureGapsJSON: string | null | undefined,
): ReadonlyArray<CaptureGap> =>
  pipe(
    Option.fromNullishOr(captureGapsJSON),
    Option.flatMap(S.decodeUnknownOption(CaptureGapRows)),
    Option.map(rows =>
      pipe(
        rows,
        Array.map(row => decodeCaptureGapRow(row)),
        Array.getSomes,
        Array.map(gap => ({
          startedAtMs: gap.startedAtMs,
          maybeEndedAtMs: Option.fromNullishOr(gap.endedAtMs),
        })),
      ),
    ),
    Option.getOrElse(() => []),
  )

const wordsOf = (
  segmentID: string,
  wordsJSON: string | null | undefined,
): ReadonlyArray<Word> =>
  pipe(
    Option.fromNullishOr(wordsJSON),
    Option.flatMap(S.decodeUnknownOption(WordRows)),
    Option.map(rows =>
      pipe(
        rows,
        Array.map(row => decodeWordRow(row)),
        Array.getSomes,
        Array.map((word, index) => ({
          id: Option.getOrElse(
            presentString(word.id),
            () => `${segmentID}:${index}`,
          ),
          text: word.text,
          startSeconds: word.start,
          endSeconds: word.end,
        })),
      ),
    ),
    Option.getOrElse(() => []),
  )

const sectionOf = (row: typeof SegmentRow.Type): Section => {
  const words = wordsOf(row.id, row.wordsJSON)
  return {
    id: row.id,
    index: row.segmentIndex,
    startSeconds: row.startTimeSeconds,
    endSeconds: row.endTimeSeconds,
    maybeSpeakerID: Option.fromNullishOr(row.speaker),
    text: Array.match(words, {
      onEmpty: () => row.text,
      onNonEmpty: nonEmptyWords =>
        Array.join(
          Array.map(nonEmptyWords, word => word.text),
          ' ',
        ),
    }),
    words,
    isFinal: row.isFinal,
  }
}

const bySectionIndex = Order.mapInput(
  Order.Number,
  (section: Section) => section.index,
)

const systemAudioPrefix = (platform: string | null | undefined): string =>
  M.value(Option.getOrElse(Option.fromNullishOr(platform), () => '')).pipe(
    M.withReturnType<string>(),
    M.when('iPhone', () => 'iPhone system audio'),
    M.when('mac', () => 'Mac system audio'),
    M.orElse(() => 'System Audio'),
  )

const systemAudioLabel = (context: typeof SystemAudioContextRow.Type): string =>
  Option.match(
    Option.orElse(presentString(context.appDisplayName), () =>
      presentString(context.appBundleIdentifier),
    ),
    {
      onNone: () => 'System Audio',
      onSome: applicationName =>
        `${systemAudioPrefix(context.platform)} - ${applicationName}`,
    },
  )

const speakerOf = (row: typeof SpeakerRow.Type): Speaker => ({
  id: row.id,
  label: Option.getOrElse(
    Option.orElse(presentString(row.displayName), () =>
      pipe(
        Option.fromNullishOr(row.source),
        Option.flatMap(source => Option.fromNullishOr(source.systemAudio)),
        Option.map(systemAudio => systemAudioLabel(systemAudio._0)),
      ),
    ),
    () => `Speaker ${row.id}`,
  ),
})

const clipboardOf = (row: typeof ClipboardRow.Type): ClipboardEntry => ({
  id: row.id,
  timestampSeconds: row.timestamp,
  text: row.fullContent,
})

const previewLinesOf = (row: RecordingRow): ReadonlyArray<PreviewLine> =>
  pipe(
    [...presentRows(row.previewSegmentA), ...presentRows(row.previewSegmentB)],
    rows => decodeEach(SegmentRow, rows, sectionOf).values,
    Array.dedupeWith((first, second) => first.id === second.id),
    Array.sort(bySectionIndex),
    Array.filter(section => section.text.trim() !== ''),
    Array.map(section => ({
      sectionID: section.id,
      startSeconds: section.startSeconds,
      text: section.text,
    })),
  )

const summaryOf = (row: RecordingRow): RecordingSummary => ({
  id: row.id,
  title: row.title,
  startedAtMs: row.startedAtMs,
  durationSeconds: row.durationSeconds,
  maybeUpdatedAtMs: Option.fromNullishOr(row.updatedAtMs),
  maybeOwnerUserID: presentString(row.ownerUserID),
  activity: activityOf(row.activityKind),
  maybeDeviceIcon: presentString(row.deviceIcon),
  previewLines: previewLinesOf(row),
  isLiveRoomSet: Option.isSome(presentString(row.liveRoomKey)),
  captureGaps: captureGapsOf(row.captureGapsJSON),
})

const audioOf = (
  attachments: ReadonlyArray<typeof AttachmentRow.Type>,
): RecordingAudio =>
  pipe(
    attachments,
    Array.findFirst(attachment => attachment.kind === 'audio'),
    Option.match({
      onNone: () => NoAudio(),
      onSome: audio =>
        Option.match(presentString(audio.storageFileID), {
          onNone: () => UploadingAudio({ byteCount: audio.byteCount }),
          onSome: fileID => StoredAudio({ fileID, byteCount: audio.byteCount }),
        }),
    }),
  )

const imagesOf = (
  attachments: ReadonlyArray<typeof AttachmentRow.Type>,
): ReadonlyArray<ImageEntry> =>
  pipe(
    attachments,
    Array.filter(attachment => attachment.kind === 'image'),
    Array.map(attachment =>
      Option.map(presentString(attachment.storageFileID), fileID => ({
        id: attachment.id,
        timestampSeconds: Option.getOrElse(
          Option.fromNullishOr(attachment.timestampSeconds),
          () => 0,
        ),
        fileID,
      })),
    ),
    Array.getSomes,
  )

/** The recording list, newest first, and how many rows could not be read. */
export type DecodedRecordingList = Readonly<{
  recordings: ReadonlyArray<RecordingSummary>
  skipped: SkippedRows
}>

const byNewestFirst = Order.mapInput(
  Order.flip(Order.Number),
  (recording: RecordingSummary) => recording.startedAtMs,
)

/** Reads the recording list query's rows. */
export const decodeRecordingList = (
  rows: ReadonlyArray<unknown>,
): DecodedRecordingList => {
  const decoded = decodeEach(RecordingRow, rows, summaryOf)
  return {
    recordings: Array.sort(decoded.values, byNewestFirst),
    skipped: decoded.skipped,
  }
}

/** One recording's detail, and how many of its rows could not be read. */
export type DecodedRecordingDetail = Readonly<{
  maybeDetail: Option.Option<RecordingDetail>
  skipped: SkippedRows
}>

/** Reads the recording detail query's rows for one recording. */
export const decodeRecordingDetail = (
  rows: ReadonlyArray<unknown>,
): DecodedRecordingDetail =>
  pipe(
    Array.head(rows),
    Option.flatMap(row => S.decodeUnknownOption(RecordingRow)(row)),
    Option.match({
      onNone: () => ({
        maybeDetail: Option.none(),
        skipped: decodeEach(RecordingRow, rows, row => row).skipped,
      }),
      onSome: row => {
        const sections = decodeEach(
          SegmentRow,
          presentRows(row.segments),
          sectionOf,
        )
        const speakers = decodeEach(
          SpeakerRow,
          presentRows(row.speakers),
          speakerOf,
        )
        const clipboard = decodeEach(
          ClipboardRow,
          presentRows(row.clipboardEntries),
          clipboardOf,
        )
        const attachments = decodeEach(
          AttachmentRow,
          presentRows(row.attachments),
          attachment => attachment,
        )
        return {
          maybeDetail: Option.some({
            summary: summaryOf(row),
            sections: Array.sort(sections.values, bySectionIndex),
            speakers: speakers.values,
            clipboard: clipboard.values,
            images: imagesOf(attachments.values),
            audio: audioOf(attachments.values),
          }),
          skipped: Array.reduce(
            [speakers.skipped, clipboard.skipped, attachments.skipped],
            sections.skipped,
            combineSkipped,
          ),
        }
      },
    }),
  )

/** Reads transcript segment rows into sections, in index order, skipping rows that cannot be read. */
export const decodeSections = (
  rows: ReadonlyArray<unknown>,
): ReadonlyArray<Section> =>
  Array.sort(decodeEach(SegmentRow, rows, sectionOf).values, bySectionIndex)

/** Reads rows that may be a list, one object, or absent, as a list. */
export const rowsOf = (rows: unknown): ReadonlyArray<unknown> =>
  presentRows(rows)

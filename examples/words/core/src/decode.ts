import {
  Array,
  Match as M,
  Option,
  Order,
  Result,
  Schema as S,
  pipe,
} from 'effect'

import type { InstaQLFields } from '@instantdb/core'

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
  type RetiredLine,
  type Section,
  type Speaker,
  StoredAudio,
  UploadingAudio,
  type Word,
  type WordsSeal,
} from './recording.js'
import type { AppSchema } from './scribeSchema.js'

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

/**
 * The fields every query for a recording's transcript lines selects
 * (`transcriptionSegments`): what places a line, its words, `retiredAtMs`
 * (ADR 0064 section 8) and `wordsSeal` (ADR 0097). Never the sealed words'
 * envelope, which only his own devices open, so no browser holds it.
 * {@link decodeSections} reads a row of exactly these fields.
 */
export const LINE_FIELDS: InstaQLFields<AppSchema, 'transcriptionSegments'> = [
  'id',
  'segmentIndex',
  'startTimeSeconds',
  'endTimeSeconds',
  'text',
  'speaker',
  'wordsJSON',
  'isFinal',
  'retiredAtMs',
  'wordsSeal',
]

const REPLACING_LINE_FIELDS: InstaQLFields<AppSchema, 'transcriptionSegments'> =
  ['id']

/**
 * The recording page's selection of its lines: {@link LINE_FIELDS}, and the
 * id of the line each retired line names, so a link to a retired line opens
 * at the line that replaced it. Every query for a recording's lines uses it,
 * as `segments: recordingLinesQuery`; the guard in `lineReaders.test.ts`
 * fails on any other shape.
 */
export const recordingLinesQuery = {
  $: { fields: LINE_FIELDS },
  supersededBy: { $: { fields: REPLACING_LINE_FIELDS } },
}

/**
 * The list's selection of a recording's two preview lines,
 * `previewSegmentA: previewLineQuery`: {@link LINE_FIELDS}, so a retired or a
 * sealed preview line is left out of the list and its search.
 */
export const previewLineQuery = { $: { fields: LINE_FIELDS } }

/**
 * The share page's selection of a share's scrubbed lines
 * (`shareScrubbedLines`), `scrubbedLines: scrubbedLinesQuery`: every field.
 * The scrubber's copy holds no envelope, and a seal or a retirement it starts
 * to carry (#1329) reaches {@link scrubbedLinesOf} without a new build.
 */
export const scrubbedLinesQuery = {}

const LinePlacementRow = S.Struct({
  id: S.String,
  segmentIndex: S.Number,
  retiredAtMs: OptionalNumber,
  supersededBy: OptionalRows,
})
type LinePlacementRow = typeof LinePlacementRow.Type

const ReplacingLineRow = S.Struct({ id: S.String })

const SegmentRow = S.Struct({
  id: S.String,
  segmentIndex: S.Number,
  startTimeSeconds: S.Number,
  endTimeSeconds: S.Number,
  text: S.String,
  speaker: OptionalNumber,
  wordsJSON: OptionalString,
  isFinal: S.Boolean,
  wordsSeal: OptionalString,
})
type SegmentRow = typeof SegmentRow.Type

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

const isRetiredAt = (retiredAtMs: number | null | undefined): boolean =>
  Option.isSome(Option.fromNullishOr(retiredAtMs))

const wordsSealOf = (
  wordsSeal: string | null | undefined,
): Option.Option<WordsSeal> =>
  Option.map(presentString(wordsSeal), seal =>
    M.value(seal).pipe(
      M.withReturnType<WordsSeal>(),
      M.when('held', () => 'Held'),
      M.orElse(() => 'Voice'),
    ),
  )

/**
 * What a sealed line shows in place of its words, after its time and speaker:
 * the same words the Scribe mirror writes (`SEALED_LINE_TEXT`).
 *
 * @example
 * ```ts
 * sealedLineTextOf('Voice')
 * // '[sealed]'
 * sealedLineTextOf('Held')
 * // '[checking the voice]'
 * ```
 */
export const sealedLineTextOf = (seal: WordsSeal): string =>
  M.value(seal).pipe(
    M.withReturnType<string>(),
    M.when('Voice', () => '[sealed]'),
    M.when('Held', () => '[checking the voice]'),
    M.exhaustive,
  )

type LineWords = Readonly<{ text: string; words: ReadonlyArray<Word> }>

const sealedLineWordsOf = (seal: WordsSeal): LineWords => ({
  text: sealedLineTextOf(seal),
  words: [],
})

const openLineWordsOf = (row: SegmentRow): LineWords => {
  const words = wordsOf(row.id, row.wordsJSON)
  return {
    text: Array.match(words, {
      onEmpty: () => row.text,
      onNonEmpty: nonEmptyWords =>
        Array.join(
          Array.map(nonEmptyWords, word => word.text),
          ' ',
        ),
    }),
    words,
  }
}

const sectionOf = (row: SegmentRow): Section => {
  const maybeWordsSeal = wordsSealOf(row.wordsSeal)
  return {
    id: row.id,
    index: row.segmentIndex,
    startSeconds: row.startTimeSeconds,
    endSeconds: row.endTimeSeconds,
    maybeSpeakerID: Option.fromNullishOr(row.speaker),
    isFinal: row.isFinal,
    maybeWordsSeal,
    ...Option.match(maybeWordsSeal, {
      onNone: () => openLineWordsOf(row),
      onSome: sealedLineWordsOf,
    }),
  }
}

const bySectionIndex = Order.mapInput(
  Order.Number,
  (section: Section) => section.index,
)

/**
 * A recording's transcript lines as every reader of the site sees them: the
 * kept lines in # order, where a link to each retired line goes, and how many
 * rows could not be read.
 */
export type Lines = Readonly<{
  sections: ReadonlyArray<Section>
  retiredLines: ReadonlyArray<RetiredLine>
  skipped: SkippedRows
}>

const decodeLinePlacement = S.decodeUnknownResult(LinePlacementRow)
const decodeLine = S.decodeUnknownResult(SegmentRow)

const replacingLineIDOf = (
  placement: LinePlacementRow,
): Option.Option<string> =>
  pipe(
    Array.head(presentRows(placement.supersededBy)),
    Option.flatMap(S.decodeUnknownOption(ReplacingLineRow)),
    Option.map(line => line.id),
  )

const keptLineIDOf = (
  sections: ReadonlyArray<Section>,
  placement: LinePlacementRow,
): Option.Option<string> =>
  Option.orElse(
    Option.filter(replacingLineIDOf(placement), lineID =>
      Array.some(sections, section => section.id === lineID),
    ),
    () =>
      Option.map(
        Option.orElse(
          Array.findFirst(
            sections,
            section => section.index >= placement.segmentIndex,
          ),
          () => Array.last(sections),
        ),
        section => section.id,
      ),
  )

/**
 * The one line rule of the words site (ADR 0064 section 8, ADR 0097; issue
 * #1322). Every reader of transcript lines goes through it: the recording
 * page, its section links, the list previews and so search, the share sheet,
 * Copy Transcript, and the share page ({@link scrubbedLinesOf}).
 *
 * A retired row (`retiredAtMs` set) is read first, for what places it, never
 * its words: it is no line, so it never wins a # it shares with a kept line,
 * though its retirement stamped it newer, and a run of retired rows leaves
 * the kept lines around it with their own #. A link to it opens at the line
 * it names (`supersededBy`), else the next kept line ({@link RetiredLine}).
 * A sealed row (`wordsSeal` set) keeps its place, time and speaker and shows
 * `[sealed]`, or `[checking the voice]` while held, never its words, whatever
 * the row carries. The sealed words' envelope is never selected
 * ({@link LINE_FIELDS}) and never kept.
 *
 * @example
 * ```ts
 * linesOf([kept0, retiredCopyOf1, kept1, sealed2])
 * // { sections: [kept0, kept1, sealed2 shown '[sealed]'],
 * //   retiredLines: [{ id: retiredCopyOf1.id, maybeKeptLineID: Option.some(kept1.id) }],
 * //   skipped: { count: 0, maybeFirstReason: Option.none() } }
 * ```
 */
export const linesOf = (rows: ReadonlyArray<unknown>): Lines => {
  const [placementFailures, placedRows] = Array.partition(rows, row =>
    Result.map(decodeLinePlacement(row), placement => ({ row, placement })),
  )
  const [keptRows, retiredPlacements] = Array.partition(
    placedRows,
    ({ row, placement }) =>
      isRetiredAt(placement.retiredAtMs)
        ? Result.succeed(placement)
        : Result.fail(row),
  )
  const [lineFailures, unorderedSections] = Array.partition(keptRows, row =>
    Result.map(decodeLine(row), sectionOf),
  )
  const sections = Array.sort(unorderedSections, bySectionIndex)
  const failures = [...placementFailures, ...lineFailures]
  return {
    sections,
    retiredLines: Array.map(retiredPlacements, placement => ({
      id: placement.id,
      maybeKeptLineID: keptLineIDOf(sections, placement),
    })),
    skipped: {
      count: Array.length(failures),
      maybeFirstReason: Option.map(
        Array.head(failures),
        error => error.message,
      ),
    },
  }
}

/**
 * The retired line a link names, when it names one: the recording page opens
 * such a link at {@link RetiredLine}'s kept line instead.
 */
export const retiredLineNamed = (
  detail: RecordingDetail,
  sectionID: string,
): Option.Option<RetiredLine> =>
  Array.findFirst(detail.retiredLines, line => line.id === sectionID)

const ScrubbedLineRow = S.Struct({
  id: S.String,
  segmentIndex: S.Number,
  startSeconds: S.Number,
  endSeconds: S.Number,
  status: S.String,
  text: S.String,
  wordsJSON: OptionalString,
  retiredAtMs: OptionalNumber,
  wordsSeal: OptionalString,
})
type ScrubbedLineRow = typeof ScrubbedLineRow.Type

const ScrubbedWord = S.Struct({
  text: S.String,
  start: S.Number,
  end: S.Number,
})
const ScrubbedWords = S.fromJsonString(S.Array(ScrubbedWord))

const SharedLinesRow = S.Struct({ scrubbedLines: OptionalRows })

const PASSED_SCRUB = 'passed'

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

const scrubbedSectionOf = (row: ScrubbedLineRow): Section => {
  const maybeWordsSeal = wordsSealOf(row.wordsSeal)
  return {
    id: row.id,
    index: row.segmentIndex,
    startSeconds: row.startSeconds,
    endSeconds: row.endSeconds,
    maybeSpeakerID: Option.none(),
    isFinal: true,
    maybeWordsSeal,
    ...Option.match(maybeWordsSeal, {
      onNone: () => ({ text: row.text, words: scrubbedWordsOf(row) }),
      onSome: sealedLineWordsOf,
    }),
  }
}

/**
 * A share's scrubbed lines (`shareScrubbedLines`) as its readers see them,
 * through the same rule as {@link linesOf}: only lines the scrubber passed,
 * in # order, no retired line, and a sealed line shown sealed. `shareRow` is
 * the opened share's row, read with {@link scrubbedLinesQuery}. The share
 * page is the site's one page open without a sign-in (#1329).
 */
export const scrubbedLinesOf = (shareRow: unknown): ReadonlyArray<Section> =>
  pipe(
    S.decodeUnknownOption(SharedLinesRow)(shareRow),
    Option.map(row => presentRows(row.scrubbedLines)),
    Option.getOrElse((): ReadonlyArray<unknown> => []),
    Array.map(line => S.decodeUnknownOption(ScrubbedLineRow)(line)),
    Array.getSomes,
    Array.filter(
      line => line.status === PASSED_SCRUB && !isRetiredAt(line.retiredAtMs),
    ),
    Array.map(scrubbedSectionOf),
    Array.sort(bySectionIndex),
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
    linesOf([
      ...presentRows(row.previewSegmentA),
      ...presentRows(row.previewSegmentB),
    ]).sections,
    Array.dedupeWith((first, second) => first.id === second.id),
    Array.filter(
      section =>
        Option.isNone(section.maybeWordsSeal) && section.text.trim() !== '',
    ),
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
        const lines = linesOf(presentRows(row.segments))
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
            sections: lines.sections,
            retiredLines: lines.retiredLines,
            speakers: speakers.values,
            clipboard: clipboard.values,
            images: imagesOf(attachments.values),
            audio: audioOf(attachments.values),
          }),
          skipped: Array.reduce(
            [speakers.skipped, clipboard.skipped, attachments.skipped],
            lines.skipped,
            combineSkipped,
          ),
        }
      },
    }),
  )

/**
 * Reads transcript line rows into the kept sections, in # order, through
 * {@link linesOf}: no retired line, a sealed one shown sealed, rows that
 * cannot be read skipped.
 */
export const decodeSections = (
  rows: ReadonlyArray<unknown>,
): ReadonlyArray<Section> => linesOf(rows).sections

/** Reads rows that may be a list, one object, or absent, as a list. */
export const rowsOf = (rows: unknown): ReadonlyArray<unknown> =>
  presentRows(rows)

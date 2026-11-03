import { Array, Effect, Option, Order, Schema as S, pipe } from 'effect'
import { ts } from 'foldkit/schema'

/**
 * A recording's compressed copy (Scribe ADR 0091): while it records, the
 * phone encodes its audio to AAC in fragmented MP4 and stores it a 6 s
 * segment at a time, about 15 s behind the recording, as one
 * `progressiveMediaStreams` row and a `progressiveMediaSegments` row per
 * segment. Only the recording's owners read them. `segmentCount` and
 * `durationSeconds` grow with each stored segment; `isFinished` once the
 * phone stored the last one.
 */
export const CompressedCopy = S.Struct({
  streamID: S.String,
  initializationPath: S.String,
  codecs: S.String,
  segmentSeconds: S.Number,
  segmentCount: S.Number,
  durationSeconds: S.Number,
  isFinished: S.Boolean,
})
/** A recording's compressed copy, as its stream row says now. */
export type CompressedCopy = typeof CompressedCopy.Type

/** One stored segment of a copy: where it sits in the recording, and its file. */
export const CopySegment = S.Struct({
  index: S.Number,
  startSeconds: S.Number,
  durationSeconds: S.Number,
  byteCount: S.Number,
  path: S.String,
})
/** One stored segment of a copy. */
export type CopySegment = typeof CopySegment.Type

/** A stretch of the recording the browser holds decoded-ready, in seconds. */
export const BufferedRange = S.Struct({
  startSeconds: S.Number,
  endSeconds: S.Number,
})
/** A stretch of the recording the browser holds. */
export type BufferedRange = typeof BufferedRange.Type

/**
 * What the player knows when it decides its next step: where the listener
 * is, whether it plays, what the browser holds, the segment rows read so
 * far, the copy as its row says now, and whether the browser was told the
 * copy ended.
 */
export const CopyFeed = S.Struct({
  positionSeconds: S.Number,
  isPlaying: S.Boolean,
  buffered: S.Array(BufferedRange),
  knownSegments: S.Array(CopySegment),
  copy: CompressedCopy,
  isEnded: S.Boolean,
})
/** What the player knows when it decides its next step. */
export type CopyFeed = typeof CopyFeed.Type

/** Read the segment rows from `fromIndex` up to, not including, `toIndex`. */
export const ReadCopySegments = ts('ReadCopySegments', {
  fromIndex: S.Number,
  toIndex: S.Number,
})
/** Download a segment and hand it to the browser. */
export const AppendCopySegment = ts('AppendCopySegment', {
  segment: CopySegment,
})
/** Let the browser drop a stretch it holds, far from the listener. */
export const RemoveCopyAudio = ts('RemoveCopyAudio', {
  startSeconds: S.Number,
  endSeconds: S.Number,
})
/** Tell the browser the finished copy ends here, so playback ends at its end. */
export const EndCopyAudio = ts('EndCopyAudio')
/** Nothing to do until the listener moves, plays, or the copy grows. */
export const AwaitCopyChange = ts('AwaitCopyChange')
/** The player's next step. */
export const CopyStep = S.Union([
  ReadCopySegments,
  AppendCopySegment,
  RemoveCopyAudio,
  EndCopyAudio,
  AwaitCopyChange,
])
/** The player's next step. */
export type CopyStep = typeof CopyStep.Type

/**
 * How far behind the end of a live copy the listener joins: two segments,
 * so the next one is stored before playing reaches the end. With the copy
 * about 15 s behind the phone, the listener hears it about 30 s behind.
 */
export const LIVE_JOIN_BEHIND_SECONDS = 12
/** How much audio ahead of the listener the player keeps while it plays. */
export const COPY_AHEAD_SECONDS = 30
/** How much audio behind the listener the player keeps for a quick skip back. */
export const COPY_BEHIND_SECONDS = 120
/** How many segment rows one read asks for. */
export const COPY_ROW_PAGE = 20

const PAUSED_AHEAD_SECONDS = 0.5
const BUFFERED_TOLERANCE_SECONDS = 0.1
const MINIMUM_REMOVAL_SECONDS = 1
const STREAM_KEY_PREFIX =
  'instant-progressive-media-stream:scribe-recording-audio:'
const UUID_BYTE_COUNT = 16
const VERSION_BYTE_INDEX = 6
const VARIANT_BYTE_INDEX = 8

/**
 * The recording generation a copy belongs to, as the phone names it
 * (`RecordingLifecycleID`): the recording's id, lowercased, and its start.
 *
 * @example
 * ```ts
 * copyLifecycleIDOf('7E0F1B2C-3D4E-4F50-8A6B-7C8D9E0F1A2B', 1793668368183)
 * // 'v1:7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b:1793668368183'
 * ```
 */
export const copyLifecycleIDOf = (
  recordingID: string,
  startedAtMs: number,
): string => `v1:${recordingID.toLowerCase()}:${Math.round(startedAtMs)}`

const versionedByte = (byte: number, index: number): number => {
  if (index === VERSION_BYTE_INDEX) {
    return (byte & 0x0f) | 0x40
  } else if (index === VARIANT_BYTE_INDEX) {
    return (byte & 0x3f) | 0x80
  } else {
    return byte
  }
}

const uuidOf = (bytes: ReadonlyArray<number>): string => {
  const hex = Array.join(
    Array.map(bytes, byte => byte.toString(16).padStart(2, '0')),
    '',
  )
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * The id of a generation's copy stream: instant-data-swift's derived id,
 * the first 16 bytes of a SHA-256 with version 4 and variant bits, so the
 * page finds the row the phone writes without a query by recording.
 */
export const copyStreamIDOf = (
  lifecycleID: string,
): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: () =>
      crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${STREAM_KEY_PREFIX}${lifecycleID}`),
      ),
    catch: cause => (cause instanceof Error ? cause : new Error(String(cause))),
  }).pipe(
    Effect.map(digest =>
      uuidOf(
        Array.map(
          Array.fromIterable(new Uint8Array(digest, 0, UUID_BYTE_COUNT)),
          versionedByte,
        ),
      ),
    ),
  )

const StreamRow = S.Struct({
  id: S.String,
  codecs: S.String,
  segmentSeconds: S.Number,
  initializationPath: S.String,
  state: S.Literals(['recording', 'finished']),
  segmentCount: S.Number,
  durationSeconds: S.Number,
})

const decodeStreamRow = S.decodeUnknownOption(StreamRow)

/**
 * The copy a stream row describes, once it has a stored segment; none for
 * no row, a row without one yet, or a row that cannot be read.
 */
export const decodeCompressedCopy = (
  rows: ReadonlyArray<unknown>,
): Option.Option<CompressedCopy> =>
  pipe(
    Array.head(rows),
    Option.flatMap(decodeStreamRow),
    Option.filter(
      row =>
        row.segmentCount >= 1 &&
        row.durationSeconds > 0 &&
        row.segmentSeconds > 0 &&
        row.initializationPath !== '',
    ),
    Option.map(row => ({
      streamID: row.id,
      initializationPath: row.initializationPath,
      codecs: row.codecs,
      segmentSeconds: row.segmentSeconds,
      segmentCount: row.segmentCount,
      durationSeconds: row.durationSeconds,
      isFinished: row.state === 'finished',
    })),
  )

const SegmentRow = S.Struct({
  streamID: S.String,
  index: S.Number,
  startSeconds: S.Number,
  durationSeconds: S.Number,
  byteCount: S.Number,
  path: S.String,
})

const decodeSegmentRow = S.decodeUnknownOption(SegmentRow)

const isUsableSegment = (
  row: typeof SegmentRow.Type,
  streamID: string,
): boolean =>
  row.streamID === streamID &&
  Number.isInteger(row.index) &&
  row.index >= 0 &&
  Number.isFinite(row.startSeconds) &&
  row.startSeconds >= 0 &&
  Number.isFinite(row.durationSeconds) &&
  row.durationSeconds > 0 &&
  row.byteCount > 0 &&
  row.path !== ''

const byIndex = Order.mapInput(
  Order.Number,
  (segment: CopySegment) => segment.index,
)

/** One stream's segment rows in index order, each index once; unreadable rows are left out. */
export const decodeCopySegments = (
  rows: ReadonlyArray<unknown>,
  streamID: string,
): ReadonlyArray<CopySegment> =>
  pipe(
    rows,
    Array.map(row =>
      Option.filter(decodeSegmentRow(row), segment =>
        isUsableSegment(segment, streamID),
      ),
    ),
    Array.getSomes,
    Array.map(segment => ({
      index: segment.index,
      startSeconds: segment.startSeconds,
      durationSeconds: segment.durationSeconds,
      byteCount: segment.byteCount,
      path: segment.path,
    })),
    Array.sort(byIndex),
    Array.dedupeWith((first, second) => first.index === second.index),
  )

/**
 * Where a listener joins a live copy: {@link LIVE_JOIN_BEHIND_SECONDS}
 * behind its end, or its start when it is shorter.
 */
export const liveJoinSecondsOf = (copy: CompressedCopy): number =>
  Math.max(0, copy.durationSeconds - LIVE_JOIN_BEHIND_SECONDS)

const endOf = (segment: CopySegment): number =>
  segment.startSeconds + segment.durationSeconds

const isBuffered = (
  buffered: ReadonlyArray<BufferedRange>,
  segment: CopySegment,
): boolean =>
  Array.some(
    buffered,
    range =>
      range.startSeconds <= segment.startSeconds + BUFFERED_TOLERANCE_SECONDS &&
      range.endSeconds >= endOf(segment) - BUFFERED_TOLERANCE_SECONDS,
  )

const segmentAt = (
  knownSegments: ReadonlyArray<CopySegment>,
  index: number,
): Option.Option<CopySegment> =>
  Array.findFirst(knownSegments, segment => segment.index === index)

const readFrom = (copy: CompressedCopy, fromIndex: number): CopyStep =>
  ReadCopySegments({
    fromIndex,
    toIndex: Math.min(copy.segmentCount, fromIndex + COPY_ROW_PAGE),
  })

const neighborIndicesOf = (
  copy: CompressedCopy,
  positionSeconds: number,
): ReadonlyArray<number> => {
  const lastIndex = copy.segmentCount - 1
  const estimate = Math.min(
    lastIndex,
    Math.floor(positionSeconds / copy.segmentSeconds),
  )
  return Array.filter(
    [estimate - 1, estimate, estimate + 1],
    index => index >= 0 && index <= lastIndex,
  )
}

/**
 * The segment holding the position, found among the rows around the
 * estimate `position / segmentSeconds` (a segment is within a frame of
 * `segmentSeconds`); a read when one of those rows is not known yet.
 */
const firstIndexOf = (
  feed: CopyFeed,
  positionSeconds: number,
): readonly [Option.Option<CopyStep>, number] => {
  const neighbors = neighborIndicesOf(feed.copy, positionSeconds)
  const maybeUnknown = Array.findFirst(neighbors, index =>
    Option.isNone(segmentAt(feed.knownSegments, index)),
  )
  const holding = Array.findFirst(neighbors, index =>
    Option.exists(
      segmentAt(feed.knownSegments, index),
      segment =>
        segment.startSeconds <= positionSeconds &&
        positionSeconds < endOf(segment),
    ),
  )
  const fallback = Option.getOrElse(Array.head(neighbors), () => 0)
  return [
    Option.map(maybeUnknown, index => readFrom(feed.copy, index)),
    Option.getOrElse(holding, () => fallback),
  ]
}

/** The first step the wanted stretch needs: a row to read or a segment to append. */
const fillStep = (
  feed: CopyFeed,
  positionSeconds: number,
  wantedEndSeconds: number,
): Option.Option<CopyStep> => {
  const [maybeRead, firstIndex] = firstIndexOf(feed, positionSeconds)
  if (Option.isSome(maybeRead)) {
    return maybeRead
  } else {
    const wanted = pipe(
      Array.range(firstIndex, feed.copy.segmentCount - 1),
      Array.takeWhile(index =>
        Option.match(segmentAt(feed.knownSegments, index), {
          onNone: () => true,
          onSome: segment => segment.startSeconds < wantedEndSeconds,
        }),
      ),
    )
    return Array.findFirst(wanted, index =>
      Option.match(segmentAt(feed.knownSegments, index), {
        onNone: () => Option.some(readFrom(feed.copy, index)),
        onSome: segment =>
          endOf(segment) <= positionSeconds ||
          isBuffered(feed.buffered, segment)
            ? Option.none()
            : Option.some(AppendCopySegment({ segment })),
      }),
    )
  }
}

/** A stretch the browser holds outside what the listener may reach soon. */
const removalStep = (
  feed: CopyFeed,
  positionSeconds: number,
): Option.Option<CopyStep> => {
  const keepFromSeconds = positionSeconds - COPY_BEHIND_SECONDS
  const keepToSeconds =
    positionSeconds + COPY_AHEAD_SECONDS + COPY_BEHIND_SECONDS
  return Array.findFirst(feed.buffered, range => {
    if (range.startSeconds < keepFromSeconds - MINIMUM_REMOVAL_SECONDS) {
      return Option.some(
        RemoveCopyAudio({
          startSeconds: range.startSeconds,
          endSeconds: Math.min(range.endSeconds, keepFromSeconds),
        }),
      )
    } else if (range.endSeconds > keepToSeconds + MINIMUM_REMOVAL_SECONDS) {
      return Option.some(
        RemoveCopyAudio({
          startSeconds: Math.max(range.startSeconds, keepToSeconds),
          endSeconds: range.endSeconds,
        }),
      )
    } else {
      return Option.none()
    }
  })
}

/** The end, once a finished copy is held from the position to its last segment. */
const endStep = (
  feed: CopyFeed,
  positionSeconds: number,
): Option.Option<CopyStep> => {
  if (!feed.copy.isFinished || feed.isEnded) {
    return Option.none()
  } else {
    const [maybeRead, firstIndex] = firstIndexOf(feed, positionSeconds)
    const isHeldToTheEnd =
      Option.isNone(maybeRead) &&
      Array.every(Array.range(firstIndex, feed.copy.segmentCount - 1), index =>
        Option.exists(segmentAt(feed.knownSegments, index), segment =>
          isBuffered(feed.buffered, segment),
        ),
      )
    return isHeldToTheEnd ? Option.some(EndCopyAudio()) : Option.none()
  }
}

/**
 * The player's next step (pure): first what the listener needs, the segment
 * at the position and, while it plays, the next
 * {@link COPY_AHEAD_SECONDS}; then dropping what lies more than
 * {@link COPY_BEHIND_SECONDS} behind or far ahead; then the end of a
 * finished copy. A segment the browser dropped on its own is appended again.
 *
 * @example
 * ```ts
 * nextCopyStep({ positionSeconds: 50, isPlaying: false, buffered: [], knownSegments, copy, isEnded: false })
 * // AppendCopySegment({ segment: the one from 48 s to 54 s })
 * ```
 */
export const nextCopyStep = (feed: CopyFeed): CopyStep => {
  if (feed.copy.segmentCount < 1) {
    return AwaitCopyChange()
  } else {
    const positionSeconds = Math.min(
      Math.max(0, feed.positionSeconds),
      feed.copy.durationSeconds,
    )
    const wantedEndSeconds = Math.min(
      feed.copy.durationSeconds,
      positionSeconds +
        (feed.isPlaying ? COPY_AHEAD_SECONDS : PAUSED_AHEAD_SECONDS),
    )
    return pipe(
      fillStep(feed, positionSeconds, wantedEndSeconds),
      Option.orElse(() => removalStep(feed, positionSeconds)),
      Option.orElse(() => endStep(feed, positionSeconds)),
      Option.getOrElse(() => AwaitCopyChange()),
    )
  }
}

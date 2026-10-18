import {
  Array,
  Context,
  Data,
  type Effect,
  Match as M,
  Option,
  Schema as S,
  String,
  pipe,
} from 'effect'
import { ts } from 'foldkit/schema'

import { Milliseconds } from './ids.js'
import { coverPathOf } from './linkPreview.js'
import { placePathOf } from './links.js'
import type { Title } from './model.js'
import {
  RecordingClock,
  type RunningPart,
  gapsOfJson,
  positionAt,
  runningPartsOf,
  wallClockMsAt,
} from './recordingClock.js'
import { stableUUID } from './stableId.js'
import type { StretchEndReason, StretchEvent } from './stretch.js'

// SCRIBE TIMELINE

/** Scribe's timeline could not take a stretch, and why, safe to show. */
export class ScribeTimelineError extends Data.TaggedError(
  'ScribeTimelineError',
)<{
  readonly reason: string
}> {}

/**
 * Where Books tells Scribe what it played: each stretch's start once it
 * has played 3 s, and its end, on every one of his recordings that was live
 * while it played. It answers how many recordings the stretch landed on: 0
 * when none was live. The live one writes Scribe's own rows in Instant;
 * tests use one that keeps what it is told.
 */
export class ScribeTimeline extends Context.Service<
  ScribeTimeline,
  Readonly<{
    report: (
      title: Title,
      event: StretchEvent,
    ) => Effect.Effect<number, ScribeTimelineError>
  }>
>()('books/ScribeTimeline') {}

/**
 * One Instant row to write: its namespace, id, attributes, and links, each
 * link a label and the linked row's id. The YouTube companion's `Row` and
 * Scribe Videos' `InstantRow`, in the same shape.
 */
export const InstantRow = S.Struct({
  namespace: S.String,
  id: S.String,
  attrs: S.Record(S.String, S.Unknown),
  links: S.Record(S.String, S.String),
})
/** One Instant row to write. */
export type InstantRow = typeof InstantRow.Type

/**
 * What Scribe's timeline shows of anything played, the same for every
 * play of it: what kind of media and its library key, its title, who made
 * it, its artwork, its length, the app that played it, and how that app
 * knew the second. Scribe Videos' episode facts, and Books' book.
 */
export const PlayFacts = S.Struct({
  kind: S.String,
  mediaKey: S.String,
  maybeTitle: S.Option(S.String),
  maybeShowTitle: S.Option(S.String),
  maybeArtworkUrl: S.Option(S.String),
  maybeMediaLengthSeconds: S.Option(S.Number),
  player: S.String,
  source: S.String,
})
/** What Scribe's timeline shows of anything played. */
export type PlayFacts = typeof PlayFacts.Type

/** The play's start event: it is playing. */
export const PlayStarted = ts('PlayStarted')
/** The play's end event: where in the media it stopped, and why. */
export const PlayStopped = ts('PlayStopped', {
  mediaEndSeconds: S.Number,
  reason: S.String,
})
/** Which of a play's two events a payload is. */
export const PlayChange = S.Union([PlayStarted, PlayStopped])
/** Which of a play's two events a payload is. */
export type PlayChange = typeof PlayChange.Type

/**
 * How one of his recordings stands: recording now, stopped at its length,
 * or in Recently Deleted, where nothing lands.
 */
export const RecordingStatus = S.Literals(['Live', 'Stopped', 'Deleted'])
/** How one of his recordings stands. */
export type RecordingStatus = typeof RecordingStatus.Type

/**
 * One of his Scribe recordings, as Books reads it to place a stretch: its
 * id, the sign-in that owns it, its clock, its length, and whether it is
 * live.
 */
export const TimelineRecording = S.Struct({
  recordingId: S.String,
  ownerUserId: S.String,
  clock: RecordingClock,
  durationSeconds: S.Number,
  status: RecordingStatus,
})
/** One of his Scribe recordings. */
export type TimelineRecording = typeof TimelineRecording.Type

/** Where a stretch ended in the media, when, and why, in Scribe's words. */
export const TimelineStretchEnd = S.Struct({
  mediaEndSeconds: S.Number,
  endedAtMs: S.Number,
  reason: S.String,
})

/**
 * A stretch as Scribe's timeline places it: its stable id, where in the
 * media it began and when, at what speed, and how it ended, once it did.
 */
export const TimelineStretch = S.Struct({
  stretchId: S.String,
  mediaStartSeconds: S.Number,
  startedAtMs: S.Number,
  playbackRate: S.Number,
  maybeEnd: S.Option(TimelineStretchEnd),
})
/** A stretch as Scribe's timeline places it. */
export type TimelineStretch = typeof TimelineStretch.Type

/**
 * A play's start as Instant already has it: the rules never let it change,
 * so its end is written from these values.
 */
export const WrittenStart = S.Struct({
  startSeconds: S.Number,
  mediaStartSeconds: S.Number,
  startedAtMs: S.Number,
})
/** A play's start as Instant already has it. */
export type WrittenStart = typeof WrittenStart.Type

/** The runtime event kind Scribe reads as `RuntimeEvent.mediaPlay`. */
export const mediaPlayKind = 'mediaPlay'

/** Books, as the `player` of every play it writes. */
export const booksPlayer = 'books.pisspoursoftware.xyz'

/**
 * How Books knew the second: its own player said, as `safari` names
 * Safari's and `app` names Scribe Videos'.
 */
export const booksSource = 'books'

/** The media kind of a Books title. */
export const audiobookKind = 'audiobook'

/** How far back a recording may have started and still cover a stretch. */
export const lookBackMs = 36 * 3_600_000

const clippedEndToleranceMs = 500

const r3 = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0

// IDS

/**
 * A Books title's key in Scribe's media library (ADR 0081): its audio, the
 * rendition the player plays, `audiobook:<rendition id>`.
 *
 * @example
 * ```typescript
 * mediaKeyOf(title) // 'audiobook:27212be7-2a7a-5301-9fd8-671ad96d4846'
 * ```
 */
export const mediaKeyOf = (title: Title): string =>
  `${audiobookKind}:${title.mediaId}`

/**
 * A stretch's id, from what it played and when it began, so the same
 * stretch reported again, from this tab or any other, is the same play.
 *
 * @example
 * ```typescript
 * stretchIdOf('audiobook:27212be7-2a7a-5301-9fd8-671ad96d4846', 1_792_350_301_500)
 * ```
 */
export const stretchIdOf = (mediaKey: string, startedAtMs: number): string =>
  stableUUID(`books-stretch|${mediaKey}|${Math.round(startedAtMs).toString()}`)

/**
 * The play's id on one recording, Scribe Videos' construction: each
 * stretch lands on each recording as its own play.
 */
export const mediaPlayIdOf = (stretchId: string, recordingId: string): string =>
  stableUUID(
    `media-play|${String.toLowerCase(stretchId)}|${String.toLowerCase(recordingId)}`,
  )

/** The id of a play's start or end event. */
export const mediaPlayEventIdOf = (
  playId: string,
  phase: 'start' | 'end',
): string =>
  stableUUID(`media-play-event|${String.toLowerCase(playId)}|${phase}`)

// PAYLOAD

const sortedJsonOf = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return Array.map(value, sortedJsonOf)
  } else if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      pipe(
        Object.keys(value),
        Array.sort(String.Order),
        Array.map(key => [key, sortedJsonOf(Reflect.get(value, key))]),
      ),
    )
  } else {
    return value
  }
}

const changeJsonOf = (change: PlayChange): unknown =>
  M.value(change).pipe(
    M.withReturnType<unknown>(),
    M.tagsExhaustive({
      PlayStarted: () => ({ started: {} }),
      PlayStopped: ({ mediaEndSeconds, reason }) => ({
        stopped: { mediaEndSeconds: r3(mediaEndSeconds), reason },
      }),
    }),
  )

const optionalFields = (
  fields: ReadonlyArray<readonly [string, Option.Option<unknown>]>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Array.getSomes(
      Array.map(fields, ([key, maybeValue]) =>
        Option.map(maybeValue, value => [key, value]),
      ),
    ),
  )

/**
 * `RuntimeEvent.mediaPlay(RuntimeMediaPlay)` as Scribe encodes it: sorted
 * keys, the play id upper case, the start in milliseconds, seconds to three
 * places, and an optional field left out when absent. Scribe Videos' writer
 * writes the same bytes for an episode (realtime-voice
 * `Fixtures/runtime-media-play-payloads.json`).
 *
 * @example
 * ```typescript
 * mediaPlayPayload({ playId, facts, mediaStartSeconds: 723.4, startedAtMs, playbackRate: 1, maybeOpenUrl, change: PlayStarted() })
 * // '{"mediaPlay":{"_0":{"artworkURL":"https://books.pisspoursoftware.xyz/books/a-new-earth/cover","change":{"started":{}},"kind":"audiobook",…}}}'
 * ```
 */
export const mediaPlayPayload = (
  play: Readonly<{
    playId: string
    facts: PlayFacts
    mediaStartSeconds: number
    startedAtMs: number
    playbackRate: number
    maybeOpenUrl: Option.Option<string>
    change: PlayChange
  }>,
): string =>
  JSON.stringify(
    sortedJsonOf({
      mediaPlay: {
        _0: {
          change: changeJsonOf(play.change),
          kind: play.facts.kind,
          mediaKey: play.facts.mediaKey,
          mediaStartSeconds: r3(play.mediaStartSeconds),
          playID: String.toUpperCase(play.playId),
          playbackRate: play.playbackRate,
          player: play.facts.player,
          source: play.facts.source,
          startedAt: Math.round(play.startedAtMs),
          ...optionalFields([
            ['title', Option.filter(play.facts.maybeTitle, String.isNonEmpty)],
            [
              'showTitle',
              Option.filter(play.facts.maybeShowTitle, String.isNonEmpty),
            ],
            ['artworkURL', play.facts.maybeArtworkUrl],
            [
              'mediaLengthSeconds',
              Option.filter(
                play.facts.maybeMediaLengthSeconds,
                length => Number.isFinite(length) && length > 0,
              ),
            ],
            ['openURL', play.maybeOpenUrl],
          ]),
        },
      },
    }),
  )

// BOOKS

/**
 * What Scribe's timeline shows of a Books title: an audiobook, keyed by
 * its audio, by its authors, with the cover Books serves publicly at
 * `/books/<slug>/cover` (Scribe's app has no Cloudflare Access login), its
 * length, and Books as the player.
 *
 * @example
 * ```typescript
 * bookPlayFactsOf(title, 'https://books.pisspoursoftware.xyz')
 * // { kind: 'audiobook', mediaKey: 'audiobook:…', maybeTitle: Some('A New Earth'), maybeShowTitle: Some('Eckhart Tolle'), … }
 * ```
 */
export const bookPlayFactsOf = (title: Title, origin: string): PlayFacts => ({
  kind: audiobookKind,
  mediaKey: mediaKeyOf(title),
  maybeTitle: Option.liftPredicate(title.name, String.isNonEmpty),
  maybeShowTitle: Array.match(title.authors, {
    onEmpty: () => Option.none(),
    onNonEmpty: authors => Option.some(Array.join(authors, ', ')),
  }),
  maybeArtworkUrl: Option.map(
    title.maybeCoverUrl,
    () => `${origin}${coverPathOf(title.slug)}`,
  ),
  maybeMediaLengthSeconds: Option.liftPredicate(
    title.durationMs / 1000,
    length => length > 0,
  ),
  player: booksPlayer,
  source: booksSource,
})

/**
 * The player at the second a play began: the link Scribe's timeline opens,
 * the same address Books keeps while it plays.
 *
 * @example
 * ```typescript
 * bookPlayOpenUrlOf(title, 'https://books.pisspoursoftware.xyz', 723.4)
 * // Some('https://books.pisspoursoftware.xyz/books/a-new-earth/listen/12m03s')
 * ```
 */
export const bookPlayOpenUrlOf = (
  title: Title,
  origin: string,
  mediaSeconds: number,
): Option.Option<string> =>
  Option.some(
    `${origin}${placePathOf(title.slug, Milliseconds.make(Math.max(0, Math.round(mediaSeconds * 1000))))}`,
  )

const wireReasonOf = (reason: StretchEndReason): string =>
  M.value(reason).pipe(
    M.withReturnType<string>(),
    M.when('Paused', () => 'paused'),
    M.when('Ended', () => 'ended'),
    M.when('Seeked', () => 'seeked'),
    M.when('TitleChanged', () => 'videoChanged'),
    M.when('SpeedChanged', () => 'rateChanged'),
    M.when('Interrupted', () => 'interrupted'),
    M.when('PageClosed', () => 'appClosed'),
    M.exhaustive,
  )

/**
 * A Books stretch as Scribe's timeline places it: seconds where Books
 * counts milliseconds, the speed as the rate, and the end reason in the
 * words Scribe's timeline knows, such as `videoChanged` for another title.
 */
export const timelineStretchOf = (
  title: Title,
  event: StretchEvent,
): TimelineStretch => ({
  stretchId: stretchIdOf(mediaKeyOf(title), event.stretch.startedAtMs),
  mediaStartSeconds: event.stretch.mediaStartMs / 1000,
  startedAtMs: event.stretch.startedAtMs,
  playbackRate: event.stretch.speed,
  maybeEnd:
    event._tag === 'StretchEnded'
      ? Option.some({
          mediaEndSeconds: event.end.mediaEndMs / 1000,
          endedAtMs: event.end.endedAtMs,
          reason: wireReasonOf(event.end.reason),
        })
      : Option.none(),
})

// RECORDINGS

const RecordingRow = S.Struct({
  id: S.String,
  ownerUserID: S.String,
  startedAtMs: S.Number,
  durationSeconds: S.optionalKey(S.NullOr(S.Number)),
  activityKind: S.optionalKey(S.NullOr(S.String)),
  deletedAtMs: S.optionalKey(S.NullOr(S.Number)),
  captureGapsJSON: S.optionalKey(S.NullOr(S.String)),
})

const statusOfRow = (row: typeof RecordingRow.Type): RecordingStatus => {
  if (Option.isSome(Option.fromNullishOr(row.deletedAtMs))) {
    return 'Deleted'
  } else if (row.activityKind === 'active') {
    return 'Live'
  } else {
    return 'Stopped'
  }
}

/**
 * One `recordings` row as Books places a stretch on it: live while its
 * activity is `active`, deleted once it has a `deletedAtMs`, its clock from
 * its start and capture gaps. None for a row without an owner or a start.
 *
 * @example
 * ```typescript
 * recordingOfRow({ id, ownerUserID, startedAtMs, durationSeconds: 774.2, activityKind: 'active' }) // Some({ …, status: 'Live' })
 * ```
 */
export const recordingOfRow = (
  row: unknown,
): Option.Option<TimelineRecording> =>
  Option.map(S.decodeUnknownOption(RecordingRow)(row), recording => ({
    recordingId: recording.id,
    ownerUserId: recording.ownerUserID,
    clock: {
      startedAtMs: recording.startedAtMs,
      gaps: gapsOfJson(Option.fromNullishOr(recording.captureGapsJSON)),
    },
    durationSeconds: recording.durationSeconds ?? 0,
    status: statusOfRow(recording),
  }))

const StartRow = S.Struct({
  timestampSeconds: S.Number,
  capturedAtMs: S.Number,
  payloadJSON: S.String,
})

const StartPayload = S.fromJsonString(
  S.Struct({
    mediaPlay: S.Struct({ _0: S.Struct({ mediaStartSeconds: S.Number }) }),
  }),
)

/**
 * The values a play's start event already holds in Instant: its second on
 * the recording, its second in the media, and when it began.
 */
export const writtenStartOfRow = (row: unknown): Option.Option<WrittenStart> =>
  Option.flatMap(S.decodeUnknownOption(StartRow)(row), start =>
    Option.map(
      S.decodeUnknownOption(StartPayload)(start.payloadJSON),
      payload => ({
        startSeconds: start.timestampSeconds,
        mediaStartSeconds: payload.mediaPlay._0.mediaStartSeconds,
        startedAtMs: start.capturedAtMs,
      }),
    ),
  )

// PLACEMENT

type Placement = Readonly<{
  maybeStartSeconds: Option.Option<number>
  parts: ReadonlyArray<RunningPart>
  fromMs: number
  toMs: number
}>

type PlacedEnd = Readonly<{
  endSeconds: number
  mediaEndSeconds: number
  endedAtMs: number
  reason: string
}>

type Placed = Readonly<{
  start: WrittenStart
  maybeEnd: Option.Option<PlacedEnd>
}>

const liveUntilMsOf = (recording: TimelineRecording, nowMs: number): number =>
  recording.status === 'Live'
    ? nowMs
    : wallClockMsAt(recording.clock, recording.durationSeconds)

const placementOf = (
  recording: TimelineRecording,
  stretch: TimelineStretch,
  nowMs: number,
): Option.Option<Placement> => {
  const endMs = Option.match(stretch.maybeEnd, {
    onNone: () => nowMs,
    onSome: end => end.endedAtMs,
  })
  const liveUntilMs = liveUntilMsOf(recording, nowMs)
  const fromMs = Math.max(stretch.startedAtMs, recording.clock.startedAtMs)
  const toMs = Math.min(endMs, liveUntilMs)
  const parts = runningPartsOf(recording.clock, fromMs, toMs)
  const startPosition = positionAt(recording.clock, stretch.startedAtMs)
  const maybeStartSeconds =
    startPosition._tag === 'Running'
      ? Option.some(startPosition.offsetSeconds)
      : Option.none()
  const isPlaced =
    recording.status !== 'Deleted' &&
    liveUntilMs >= stretch.startedAtMs &&
    (Option.isSome(maybeStartSeconds) || Array.isReadonlyArrayNonEmpty(parts))
  return isPlaced
    ? Option.some({
        maybeStartSeconds,
        parts,
        fromMs,
        toMs: Math.max(fromMs, toMs),
      })
    : Option.none()
}

const mediaSecondsAt = (stretch: TimelineStretch, wallMs: number): number =>
  r3(
    stretch.mediaStartSeconds +
      (Math.max(0, wallMs - stretch.startedAtMs) / 1000) * stretch.playbackRate,
  )

const startOf = (
  stretch: TimelineStretch,
  placement: Placement,
  maybeWrittenStart: Option.Option<WrittenStart>,
): Option.Option<WrittenStart> =>
  pipe(
    maybeWrittenStart,
    Option.orElse(() =>
      Option.map(placement.maybeStartSeconds, startSeconds => ({
        startSeconds: r3(startSeconds),
        mediaStartSeconds: r3(stretch.mediaStartSeconds),
        startedAtMs: stretch.startedAtMs,
      })),
    ),
    Option.orElse(() =>
      Option.map(Array.head(placement.parts), first => ({
        startSeconds: r3(first.startSeconds),
        mediaStartSeconds: mediaSecondsAt(stretch, first.fromMs),
        startedAtMs: first.fromMs,
      })),
    ),
  )

const endOf = (
  stretch: TimelineStretch,
  placement: Placement,
  start: WrittenStart,
): Option.Option<PlacedEnd> =>
  Option.map(stretch.maybeEnd, end => {
    const isClipped = placement.toMs < end.endedAtMs - clippedEndToleranceMs
    const lastEndSeconds = Option.match(Array.last(placement.parts), {
      onNone: () => start.startSeconds,
      onSome: part => part.endSeconds,
    })
    return {
      endSeconds: r3(Math.max(start.startSeconds, lastEndSeconds)),
      mediaEndSeconds: isClipped
        ? mediaSecondsAt(stretch, placement.toMs)
        : r3(end.mediaEndSeconds),
      endedAtMs: Math.max(
        start.startedAtMs,
        isClipped ? placement.toMs : end.endedAtMs,
      ),
      reason: isClipped ? 'recordingStopped' : end.reason,
    }
  })

const placedOn = (
  recording: TimelineRecording,
  stretch: TimelineStretch,
  nowMs: number,
  maybeWrittenStart: Option.Option<WrittenStart>,
): Option.Option<Placed> =>
  Option.flatMap(placementOf(recording, stretch, nowMs), placement =>
    Option.map(startOf(stretch, placement, maybeWrittenStart), start => ({
      start,
      maybeEnd: endOf(stretch, placement, start),
    })),
  )

/**
 * Whether a stretch played while a recording was live: before it, after
 * it, entirely inside one of its pauses, or on a deleted one, it did not.
 */
export const isPlacedOn = (
  recording: TimelineRecording,
  stretch: TimelineStretch,
  nowMs: number,
): boolean => Option.isSome(placedOn(recording, stretch, nowMs, Option.none()))

// ROWS

/**
 * The rows one stretch writes on one recording, Scribe Videos' rows: the
 * play's start event at the recording's second where it began, and once it
 * ended, its end event, linked to its start and its length. Each is owned by
 * the recording's own sign-in. A start Instant already has is not written
 * again, and the end is placed from it. None when the stretch never played
 * while the recording ran.
 *
 * @example
 * ```typescript
 * rowsOnRecording({ recording, stretch, facts, openUrlAt, nowMs, maybeWrittenStart: Option.none() })
 * // [{ namespace: 'recordingRuntimeEvents', id: '…', attrs: { kind: 'mediaPlay', timestampSeconds: 600, … }, links: { recording } }]
 * ```
 */
export const rowsOnRecording = (
  input: Readonly<{
    recording: TimelineRecording
    stretch: TimelineStretch
    facts: PlayFacts
    openUrlAt: (mediaSeconds: number) => Option.Option<string>
    nowMs: number
    maybeWrittenStart: Option.Option<WrittenStart>
  }>,
): ReadonlyArray<InstantRow> =>
  Option.match(
    placedOn(
      input.recording,
      input.stretch,
      input.nowMs,
      input.maybeWrittenStart,
    ),
    {
      onNone: () => [],
      onSome: ({ start, maybeEnd }) => {
        const { recordingId, ownerUserId } = input.recording
        const playId = mediaPlayIdOf(input.stretch.stretchId, recordingId)
        const startEventId = mediaPlayEventIdOf(playId, 'start')
        const payloadOf = (change: PlayChange): string =>
          mediaPlayPayload({
            playId,
            facts: input.facts,
            mediaStartSeconds: start.mediaStartSeconds,
            startedAtMs: start.startedAtMs,
            playbackRate: input.stretch.playbackRate,
            maybeOpenUrl: input.openUrlAt(start.mediaStartSeconds),
            change,
          })
        const eventRow = (
          id: string,
          atSeconds: number,
          atMs: number,
          change: PlayChange,
          span: Readonly<Record<string, unknown>>,
        ): InstantRow => ({
          namespace: 'recordingRuntimeEvents',
          id,
          attrs: {
            ownerUserID: ownerUserId,
            recordingID: recordingId,
            formatVersion: 1,
            kind: mediaPlayKind,
            timestampSeconds: r3(atSeconds),
            capturedAtMs: Math.round(atMs),
            payloadJSON: payloadOf(change),
            updatedAtMs: Math.round(atMs),
            ...span,
          },
          links: { recording: recordingId },
        })
        const startRows = Option.isSome(input.maybeWrittenStart)
          ? []
          : [
              eventRow(
                startEventId,
                start.startSeconds,
                start.startedAtMs,
                PlayStarted(),
                {},
              ),
            ]
        const endRows = Option.match(maybeEnd, {
          onNone: () => [],
          onSome: end => [
            eventRow(
              mediaPlayEventIdOf(playId, 'end'),
              end.endSeconds,
              end.endedAtMs,
              PlayStopped({
                mediaEndSeconds: end.mediaEndSeconds,
                reason: end.reason,
              }),
              {
                spanStartID: startEventId,
                spanDurationSeconds: r3(
                  Math.max(0, end.endSeconds - start.startSeconds),
                ),
              },
            ),
          ],
        })
        return [...startRows, ...endRows]
      },
    },
  )

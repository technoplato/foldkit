import {
  Array,
  Clock,
  Effect,
  Option,
  Record as Record_,
  Ref,
  Schema as S,
  Semaphore,
} from 'effect'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'

import type { Title } from './model.js'
import {
  type InstantRow,
  type PlayClosing,
  ScribeTimeline,
  ScribeTimelineError,
  type TimelineRecording,
  type TimelineStretch,
  bookPlayFactsOf,
  bookPlayOpenUrlOf,
  booksPlayer,
  closingRowOf,
  isPlacedOn,
  lookBackMs,
  mediaPlayEventIdOf,
  mediaPlayIdOf,
  mediaPlayKind,
  recordingOfRow,
  rowsOnRecording,
  timelineStretchOf,
  unendedPlaysOf,
  wireReasonOf,
  writtenStartOfRow,
} from './scribeTimeline.js'
import type { StretchEvent } from './stretch.js'

// INSTANT SCRIBE TIMELINE

const recordingsLimit = 50

const playRowsLimit = 500

const recordingFields = [
  'ownerUserID',
  'startedAtMs',
  'durationSeconds',
  'deletedAtMs',
  'captureGapsJSON',
]

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : 'Scribe’s timeline refused it'

const attempted = <A>(attempt: () => Promise<A>) =>
  Effect.tryPromise({
    try: attempt,
    catch: cause => new ScribeTimelineError({ reason: reasonOf(cause) }),
  })

type Query = Parameters<ProgramLogDatabase['queryOnce']>[0]

const answered = (database: ProgramLogDatabase, query: Query) =>
  Effect.map(
    attempted(() => database.queryOnce(query)),
    response => response.data,
  )

const signedInUserOf = (database: ProgramLogDatabase) =>
  Effect.flatMap(
    attempted(() => database.getAuth()),
    maybeUser =>
      Option.match(Option.fromNullishOr(maybeUser), {
        onNone: () =>
          Effect.fail(
            new ScribeTimelineError({
              reason:
                'sign in so Scribe’s timeline knows whose listening it is',
            }),
          ),
        onSome: user => Effect.succeed(user.id),
      }),
  )

const IdRow = S.Struct({ id: S.String })
const LinkedMembers = S.Struct({ members: S.optionalKey(S.Array(IdRow)) })
const MembersData = S.Struct({
  $users: S.Array(
    S.Struct({
      accountLink: S.optionalKey(
        S.Union([S.Array(LinkedMembers), LinkedMembers]),
      ),
    }),
  ),
})

/**
 * The sign-ins of the signed-in person: this one and every member of its
 * account link (ADR 0024), such as his Apple sign-in, which owns his
 * recordings, beside the email sign-in Books uses.
 */
const accountMembersOf = (database: ProgramLogDatabase, userId: string) =>
  Effect.map(
    answered(database, {
      $users: { $: { where: { id: userId } }, accountLink: { members: {} } },
    }),
    data =>
      Array.dedupe([
        ...Option.match(S.decodeUnknownOption(MembersData)(data), {
          onNone: () => [],
          onSome: ({ $users }) =>
            Array.flatMap($users, user =>
              Array.flatMap(
                user.accountLink === undefined
                  ? []
                  : Array.ensure(user.accountLink),
                link => Array.map(link.members ?? [], member => member.id),
              ),
            ),
        }),
        userId,
      ]),
  )

const Tables = S.Record(S.String, S.Unknown)

const Rows = S.Array(S.Unknown)

const rowsIn = (data: unknown, table: string): ReadonlyArray<unknown> =>
  Option.getOrElse(
    Option.flatMap(S.decodeUnknownOption(Tables)(data), tables =>
      Option.flatMap(Record_.get(tables, table), S.decodeUnknownOption(Rows)),
    ),
    () => [],
  )

const endOrNowMs = (stretch: TimelineStretch, nowMs: number): number =>
  Option.match(stretch.maybeEnd, {
    onNone: () => nowMs,
    onSome: end => end.endedAtMs,
  })

/** The owners' recordings begun between two moments. */
const recordingsBetween = (
  database: ProgramLogDatabase,
  owners: ReadonlyArray<string>,
  fromMs: number,
  toMs: number,
) =>
  Effect.map(
    answered(database, {
      recordings: {
        $: {
          where: {
            and: [
              { ownerUserID: { $in: owners } },
              { startedAtMs: { $gte: fromMs } },
              { startedAtMs: { $lte: toMs } },
            ],
          },
          limit: recordingsLimit,
          fields: recordingFields,
        },
      },
    }),
    data =>
      Array.getSomes(Array.map(rowsIn(data, 'recordings'), recordingOfRow)),
  )

/** His recordings that could cover a stretch: begun up to 36 h before it, and before it ended. */
const recordingsAround = (
  database: ProgramLogDatabase,
  owners: ReadonlyArray<string>,
  stretch: TimelineStretch,
  nowMs: number,
) =>
  recordingsBetween(
    database,
    owners,
    stretch.startedAtMs - lookBackMs,
    endOrNowMs(stretch, nowMs),
  )

/** Every mediaPlay event on these recordings, any app's. */
const playRowsOn = (
  database: ProgramLogDatabase,
  recordings: ReadonlyArray<TimelineRecording>,
) =>
  Effect.map(
    answered(database, {
      recordingRuntimeEvents: {
        $: {
          where: {
            and: [
              {
                recordingID: {
                  $in: Array.map(
                    recordings,
                    recording => recording.recordingId,
                  ),
                },
              },
              { kind: mediaPlayKind },
            ],
          },
          limit: playRowsLimit,
        },
      },
    }),
    data => rowsIn(data, 'recordingRuntimeEvents'),
  )

const startIdOn = (stretch: TimelineStretch, recording: TimelineRecording) =>
  mediaPlayEventIdOf(
    mediaPlayIdOf(stretch.stretchId, recording.recordingId),
    'start',
  )

const IdOfRow = S.Struct({ id: S.String })

type WrittenRow = Readonly<{ id: string; row: unknown }>

/**
 * The rows among these ids that Instant already has. A row once written
 * never changes, so Books writes only the ones missing: an end is placed
 * from the start already there, and a retry of a written row writes
 * nothing, however the recording's clock moved since.
 */
const writtenRowsOf = (
  database: ProgramLogDatabase,
  ids: ReadonlyArray<string>,
) =>
  Array.isReadonlyArrayEmpty(ids)
    ? Effect.succeed(Array.empty<WrittenRow>())
    : Effect.map(
        answered(database, {
          recordingRuntimeEvents: {
            $: { where: { id: { $in: Array.fromIterable(ids) } } },
          },
        }),
        (data): ReadonlyArray<WrittenRow> =>
          Array.getSomes(
            Array.map(rowsIn(data, 'recordingRuntimeEvents'), row =>
              Option.map(S.decodeUnknownOption(IdOfRow)(row), ({ id }) => ({
                id,
                row,
              })),
            ),
          ),
      )

const playIdsOn = (stretch: TimelineStretch, recording: TimelineRecording) => {
  const playId = mediaPlayIdOf(stretch.stretchId, recording.recordingId)
  return Option.isSome(stretch.maybeEnd)
    ? [mediaPlayEventIdOf(playId, 'start'), mediaPlayEventIdOf(playId, 'end')]
    : [mediaPlayEventIdOf(playId, 'start')]
}

const stepOf = (database: ProgramLogDatabase, row: InstantRow) =>
  Option.match(Option.fromNullishOr(database.tx[row.namespace]?.[row.id]), {
    onNone: () =>
      Effect.fail(
        new ScribeTimelineError({
          reason: `Scribe’s Instant app has no ${row.namespace} table`,
        }),
      ),
    onSome: entity => Effect.succeed(entity.update(row.attrs).link(row.links)),
  })

const written = (
  database: ProgramLogDatabase,
  rows: ReadonlyArray<InstantRow>,
) =>
  Effect.flatMap(
    Effect.forEach(rows, row => stepOf(database, row)),
    steps => attempted(() => database.transact(steps)),
  )

/**
 * Scribe's timeline on Scribe's Instant app, as the signed-in member: for
 * each stretch, his account's recordings from the 36 h before it, placed on
 * their own clocks, then one transaction of Scribe Videos' rows on every
 * recording it played during, each owned by the recording's sign-in. An
 * end reads the starts already in Instant first and writes only what is
 * missing. Reports go out one at a time, so an end never races its start.
 * Offline, Instant keeps the write and sends it once back online. The plays
 * a closed page left open are the account's Books starts from the last
 * 36 h with no end; closing one writes its end, unless another device
 * already did.
 *
 * @example
 * ```typescript
 * Layer.effect(ScribeTimeline, makeInstantScribeTimeline(database, { origin: 'https://books.pisspoursoftware.xyz' }))
 * ```
 */
export const makeInstantScribeTimeline = (
  database: ProgramLogDatabase,
  config: Readonly<{ origin: string }>,
) =>
  Effect.gen(function* () {
    const semaphore = yield* Semaphore.make(1)
    const knownMembers = yield* Ref.make(
      new Map<string, ReadonlyArray<string>>(),
    )

    const membersOf = (userId: string) =>
      Effect.flatMap(Ref.get(knownMembers), known =>
        Option.match(Option.fromNullishOr(known.get(userId)), {
          onSome: Effect.succeed,
          onNone: () =>
            Effect.tap(accountMembersOf(database, userId), members =>
              Ref.set(knownMembers, new Map(known).set(userId, members)),
            ),
        }),
      )

    const report = (title: Title, event: StretchEvent) =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          const nowMs = yield* Clock.currentTimeMillis
          const userId = yield* signedInUserOf(database)
          const owners = yield* membersOf(userId)
          const stretch = timelineStretchOf(title, event)
          const recordings = Array.filter(
            yield* recordingsAround(database, owners, stretch, nowMs),
            recording => isPlacedOn(recording, stretch, nowMs),
          )
          const existing = yield* writtenRowsOf(
            database,
            Array.flatMap(recordings, recording =>
              playIdsOn(stretch, recording),
            ),
          )
          const existingIds = new Set(Array.map(existing, ({ id }) => id))
          const facts = bookPlayFactsOf(title, config.origin)
          const rows = Array.flatMap(recordings, recording =>
            rowsOnRecording({
              recording,
              stretch,
              facts,
              openUrlAt: mediaSeconds =>
                bookPlayOpenUrlOf(title, config.origin, mediaSeconds),
              nowMs,
              maybeWrittenStart: Option.flatMap(
                Array.findFirst(
                  existing,
                  ({ id }) => id === startIdOn(stretch, recording),
                ),
                ({ row }) => writtenStartOfRow(row),
              ),
            }),
          )
          const missing = Array.filter(rows, row => !existingIds.has(row.id))
          if (Array.isReadonlyArrayNonEmpty(missing)) {
            yield* written(database, missing)
          }
          return recordings.length
        }),
      )

    const unendedPlays = semaphore.withPermits(1)(
      Effect.gen(function* () {
        const nowMs = yield* Clock.currentTimeMillis
        const userId = yield* signedInUserOf(database)
        const owners = yield* membersOf(userId)
        const recordings = yield* recordingsBetween(
          database,
          owners,
          nowMs - lookBackMs,
          nowMs,
        )
        if (Array.isReadonlyArrayEmpty(recordings)) {
          return []
        }
        const rows = yield* playRowsOn(database, recordings)
        return unendedPlaysOf(rows, recordings, booksPlayer)
      }),
    )

    const closePlays = (closings: ReadonlyArray<PlayClosing>) =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          const nowMs = yield* Clock.currentTimeMillis
          const rows = Array.getSomes(
            Array.map(closings, closing =>
              closingRowOf({
                play: closing.play,
                end: {
                  mediaEndSeconds: closing.mediaEndMs / 1000,
                  endedAtMs: closing.endedAtMs,
                  reason: wireReasonOf(closing.reason),
                },
                nowMs,
              }),
            ),
          )
          const existing = yield* writtenRowsOf(
            database,
            Array.map(rows, row => row.id),
          )
          const existingIds = new Set(Array.map(existing, ({ id }) => id))
          const missing = Array.filter(rows, row => !existingIds.has(row.id))
          if (Array.isReadonlyArrayNonEmpty(missing)) {
            yield* written(database, missing)
          }
          return missing.length
        }),
      )

    return ScribeTimeline.of({ report, unendedPlays, closePlays })
  })

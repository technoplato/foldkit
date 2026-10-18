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
  ScribeTimeline,
  ScribeTimelineError,
  type TimelineRecording,
  type TimelineStretch,
  type WrittenStart,
  bookPlayFactsOf,
  bookPlayOpenUrlOf,
  isPlacedOn,
  lookBackMs,
  mediaPlayEventIdOf,
  mediaPlayIdOf,
  recordingOfRow,
  rowsOnRecording,
  timelineStretchOf,
  writtenStartOfRow,
} from './scribeTimeline.js'
import type { StretchEvent } from './stretch.js'

// INSTANT SCRIBE TIMELINE

const recordingsLimit = 50

const recordingFields = [
  'ownerUserID',
  'startedAtMs',
  'durationSeconds',
  'activityKind',
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

/** His recordings that could cover a stretch: begun up to 36 h before it, and before it ended. */
const recordingsAround = (
  database: ProgramLogDatabase,
  owners: ReadonlyArray<string>,
  stretch: TimelineStretch,
  nowMs: number,
) =>
  Effect.map(
    answered(database, {
      recordings: {
        $: {
          where: {
            and: [
              { ownerUserID: { $in: owners } },
              { startedAtMs: { $gte: stretch.startedAtMs - lookBackMs } },
              { startedAtMs: { $lte: endOrNowMs(stretch, nowMs) } },
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

const startIdOn = (stretch: TimelineStretch, recording: TimelineRecording) =>
  mediaPlayEventIdOf(
    mediaPlayIdOf(stretch.stretchId, recording.recordingId),
    'start',
  )

const IdOfRow = S.Struct({ id: S.String })

type WrittenStartRow = Readonly<{ id: string; written: WrittenStart }>

/**
 * The starts Instant already has for a stretch that ended, with their ids:
 * an end is written from them, since a start never changes.
 */
const writtenStartsOf = (
  database: ProgramLogDatabase,
  stretch: TimelineStretch,
  recordings: ReadonlyArray<TimelineRecording>,
) =>
  Option.isNone(stretch.maybeEnd) || Array.isReadonlyArrayEmpty(recordings)
    ? Effect.succeed(Array.empty<WrittenStartRow>())
    : Effect.map(
        answered(database, {
          recordingRuntimeEvents: {
            $: {
              where: {
                id: {
                  $in: Array.map(recordings, recording =>
                    startIdOn(stretch, recording),
                  ),
                },
              },
            },
          },
        }),
        (data): ReadonlyArray<WrittenStartRow> =>
          Array.getSomes(
            Array.map(rowsIn(data, 'recordingRuntimeEvents'), row =>
              Option.flatMap(S.decodeUnknownOption(IdOfRow)(row), ({ id }) =>
                Option.map(writtenStartOfRow(row), written => ({
                  id,
                  written,
                })),
              ),
            ),
          ),
      )

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
 * Offline, Instant keeps the write and sends it once back online.
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
          const writtenStarts = yield* writtenStartsOf(
            database,
            stretch,
            recordings,
          )
          const facts = bookPlayFactsOf(title, config.origin)
          const rows = Array.flatMap(recordings, recording =>
            rowsOnRecording({
              recording,
              stretch,
              facts,
              openUrlAt: mediaSeconds =>
                bookPlayOpenUrlOf(title, config.origin, mediaSeconds),
              nowMs,
              maybeWrittenStart: Option.map(
                Array.findFirst(
                  writtenStarts,
                  ({ id }) => id === startIdOn(stretch, recording),
                ),
                ({ written }) => written,
              ),
            }),
          )
          if (Array.isReadonlyArrayNonEmpty(rows)) {
            yield* written(database, rows)
          }
          return recordings.length
        }),
      )

    return ScribeTimeline.of({ report })
  })

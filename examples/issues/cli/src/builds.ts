import {
  Array,
  Duration,
  Effect,
  Match as M,
  Option,
  Order,
  Predicate,
  Result,
  Schema as S,
  String,
} from 'effect'

import { describeIssueTrackerCause } from '@foldkit/instant-tools/issues'

/**
 * A build job's state in Scribe's `buildJobs` entity (Scribe ADR 0104):
 * `queued`, then `running`, then `passed`, `failed`, `stalled`, or
 * `cancelled`. The values are Scribe's stored strings.
 */
export const BuildJobState = S.Literals([
  'queued',
  'running',
  'passed',
  'failed',
  'stalled',
  'cancelled',
])

/** The machine a build job ran on, as Scribe stores it. */
export const BuildMachine = S.Literals(['laptop', 'mini'])

const OptionalNumber = S.optionalKey(S.NullOr(S.Number))

/**
 * The parts of one Scribe `buildJobs` row that `issues show` prints, as
 * Instant stores them, such as `measure-1412-cold`: passed on the mini's slot
 * 1 with a warm build cache, exit 0, queued by agent `build-sh-1412`. Scribe
 * sets `machine`, `slot`, and `warm` when the job starts, `endedAtMs` and
 * `exitCode` when it ends, and `heartbeatAtMs` on every write from the machine
 * that holds it.
 */
export const BuildJob = S.Struct({
  agent: S.optionalKey(S.NullOr(S.String)),
  endedAtMs: OptionalNumber,
  exitCode: OptionalNumber,
  heartbeatAtMs: OptionalNumber,
  id: S.String,
  issueNumber: OptionalNumber,
  label: S.String,
  machine: S.optionalKey(S.NullOr(BuildMachine)),
  queuedAtMs: S.Number,
  slot: OptionalNumber,
  startedAtMs: OptionalNumber,
  state: BuildJobState,
  warm: S.optionalKey(S.NullOr(S.Boolean)),
})
/** One Scribe `buildJobs` row, as `issues show` reads it. */
export type BuildJob = typeof BuildJob.Type

/** A `buildJobs` row that did not decode: its id, or `(no id)`, and why. */
export const UnreadableBuildJob = S.Struct({ id: S.String, reason: S.String })
/** A `buildJobs` row that did not decode: its id, or `(no id)`, and why. */
export type UnreadableBuildJob = typeof UnreadableBuildJob.Type

/** Scribe answered: the Issue's newest jobs, newest first, and any row that did not decode. */
export const FoundBuildJobs = S.TaggedStruct('FoundBuildJobs', {
  jobs: S.Array(BuildJob),
  unreadable: S.Array(UnreadableBuildJob),
})

/**
 * The jobs could not be read, and why, such as
 * `Scribe's Instant app did not answer within 5 seconds.`
 */
export const UnavailableBuildJobs = S.TaggedStruct('UnavailableBuildJobs', {
  reason: S.String,
})

/** What `issues show` learned of an Issue's build jobs. */
export const BuildJobsRead = S.Union([FoundBuildJobs, UnavailableBuildJobs])
/** What `issues show` learned of an Issue's build jobs. */
export type BuildJobsRead = typeof BuildJobsRead.Type

/**
 * Reads an Issue's build jobs by its number, such as 1412. It never fails: a
 * job that cannot be read is `UnavailableBuildJobs` with its reason.
 */
export type BuildJobsReader = (
  issueNumber: number,
) => Effect.Effect<BuildJobsRead>

/**
 * Sends one InstaQL query to Scribe's Instant app and resolves with its
 * answer. Aborting `signal` abandons the request.
 */
export type ScribeQuery = (
  query: unknown,
  signal: AbortSignal,
) => PromiseLike<unknown>

/** How many of an Issue's jobs `issues show` lists: the newest 10. */
export const shownBuildJobsLimit = 10

/**
 * How long `issues show` waits for Scribe's Instant app: 5 seconds, the bound
 * on every wait (Scribe #1412). A slower answer is abandoned, and the Issue is
 * shown without its jobs.
 */
export const buildJobsTimeout = Duration.seconds(5)

/**
 * The InstaQL query for an Issue's newest jobs, newest first:
 * `{ buildJobs: { $: { where: { issueNumber: 1412 }, order: { queuedAtMs: 'desc' }, limit: 10 } } }`.
 */
export const buildJobsQuery = (issueNumber: number) => ({
  buildJobs: {
    $: {
      limit: shownBuildJobsLimit,
      order: { queuedAtMs: 'desc' },
      where: { issueNumber },
    },
  },
})

const MAXIMUM_REASON_LENGTH = 400

const oneLine = (text: string): string => {
  const line = text.replace(/\s+/g, ' ').trim()
  if (line.length > MAXIMUM_REASON_LENGTH) {
    return `${line.slice(0, MAXIMUM_REASON_LENGTH)}…`
  } else {
    return line
  }
}

const BuildJobsAnswer = S.Struct({ buildJobs: S.Array(S.Unknown) })

const decodeBuildJobsAnswer = S.decodeUnknownResult(BuildJobsAnswer)

const decodeBuildJob = S.decodeUnknownResult(BuildJob)

const idOf = (row: unknown): string =>
  Predicate.hasProperty(row, 'id') && Predicate.isString(row.id)
    ? row.id
    : '(no id)'

const readRow = (row: unknown): Result.Result<BuildJob, UnreadableBuildJob> =>
  Result.mapError(decodeBuildJob(row), error =>
    UnreadableBuildJob.make({ id: idOf(row), reason: oneLine(error.message) }),
  )

const buildJobsOfAnswer = (answer: unknown): BuildJobsRead =>
  Result.match(decodeBuildJobsAnswer(answer), {
    onFailure: () =>
      UnavailableBuildJobs.make({
        reason: "Scribe's Instant app answered without a buildJobs list.",
      }),
    onSuccess: ({ buildJobs }) => {
      const [unreadable, jobs] = Array.partition(buildJobs, readRow)
      return FoundBuildJobs.make({
        jobs: Array.sortWith(
          jobs,
          job => job.queuedAtMs,
          Order.flip(Order.Number),
        ),
        unreadable,
      })
    },
  })

/**
 * Reads an Issue's newest build jobs from Scribe's Instant app with `send`,
 * waiting at most `timeout` (5 seconds), then abandoning the request. It never
 * fails: a refused query, no answer, or an answer without a `buildJobs` list
 * is `UnavailableBuildJobs` with its reason, and a row that does not decode is
 * named in `unreadable` while the others are read.
 */
export const readBuildJobs = (
  send: ScribeQuery,
  issueNumber: number,
  timeout: Duration.Duration = buildJobsTimeout,
): Effect.Effect<BuildJobsRead> =>
  Effect.tryPromise({
    try: signal => send(buildJobsQuery(issueNumber), signal),
    catch: describeIssueTrackerCause,
  }).pipe(
    Effect.timeoutOption(timeout),
    Effect.map(maybeAnswer =>
      Option.match(maybeAnswer, {
        onNone: () =>
          UnavailableBuildJobs.make({
            reason: `Scribe's Instant app did not answer within ${Duration.toSeconds(timeout).toString()} seconds.`,
          }),
        onSome: buildJobsOfAnswer,
      }),
    ),
    Effect.catch(cause =>
      Effect.succeed(
        UnavailableBuildJobs.make({
          reason: `the buildJobs query to Scribe's Instant app failed: ${oneLine(cause)}`,
        }),
      ),
    ),
  )

// OUTPUT

const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const SECONDS_SHOWN_BELOW_MS = 90 * SECOND_MS
const MINUTES_SHOWN_BELOW_MS = 90 * MINUTE_MS
const SILENT_HEARTBEAT_MS = 3 * MINUTE_MS

/**
 * A duration as `issues show` and Scribe's build script print it: whole
 * seconds under 90 s (`25 s`), whole minutes under 90 minutes (`6 min`), then
 * hours to one decimal (`1.7 h`). A negative duration, from two machines'
 * clocks, reads `0 s`.
 */
export const durationText = (durationMs: number): string => {
  const clampedMs = Math.max(0, durationMs)
  if (clampedMs < SECONDS_SHOWN_BELOW_MS) {
    return `${Math.floor(clampedMs / SECOND_MS).toString()} s`
  } else if (clampedMs < MINUTES_SHOWN_BELOW_MS) {
    return `${Math.floor(clampedMs / MINUTE_MS).toString()} min`
  } else {
    return `${(clampedMs / HOUR_MS).toFixed(1)} h`
  }
}

const localTimeOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  month: '2-digit',
}

const localTimeFormat = (timeZone: string): Intl.DateTimeFormat =>
  Result.getOrElse(
    Result.try(
      () => new Intl.DateTimeFormat('en-US', { ...localTimeOptions, timeZone }),
    ),
    () => new Intl.DateTimeFormat('en-US', localTimeOptions),
  )

const localTimeText = (timeMs: number, format: Intl.DateTimeFormat): string => {
  const parts = format.formatToParts(timeMs)
  const partOf = (type: Intl.DateTimeFormatPartTypes): string =>
    Option.getOrElse(
      Option.map(
        Array.findFirst(parts, part => part.type === type),
        part => part.value,
      ),
      () => '',
    )
  return `${partOf('month')}-${partOf('day')} ${partOf('hour')}:${partOf('minute')}`
}

const placeText = (job: BuildJob): string =>
  Option.match(Option.fromNullishOr(job.machine), {
    onNone: () => '-',
    onSome: machine =>
      Array.join(
        [
          machine,
          ...Option.toArray(
            Option.map(
              Option.fromNullishOr(job.slot),
              slot => `slot ${slot.toString()}`,
            ),
          ),
          ...Option.toArray(
            Option.map(Option.fromNullishOr(job.warm), isWarm =>
              isWarm ? 'warm' : 'cold',
            ),
          ),
        ],
        ' ',
      ),
  })

const waitedParts = (job: BuildJob): ReadonlyArray<string> =>
  Option.toArray(
    Option.map(
      Option.orElse(Option.fromNullishOr(job.startedAtMs), () =>
        Option.fromNullishOr(job.endedAtMs),
      ),
      leftQueueAtMs => `waited ${durationText(leftQueueAtMs - job.queuedAtMs)}`,
    ),
  )

const ranParts = (job: BuildJob): ReadonlyArray<string> =>
  Option.toArray(
    Option.zipWith(
      Option.fromNullishOr(job.startedAtMs),
      Option.fromNullishOr(job.endedAtMs),
      (startedAtMs, endedAtMs) =>
        `ran ${durationText(endedAtMs - startedAtMs)}`,
    ),
  )

const silentHeartbeatParts = (
  job: BuildJob,
  nowMs: number,
): ReadonlyArray<string> =>
  Option.toArray(
    Option.map(
      Option.filter(
        Option.fromNullishOr(job.heartbeatAtMs),
        heartbeatAtMs => nowMs - heartbeatAtMs > SILENT_HEARTBEAT_MS,
      ),
      heartbeatAtMs =>
        `last heartbeat ${durationText(nowMs - heartbeatAtMs)} ago`,
    ),
  )

const runningText = (job: BuildJob, nowMs: number): string =>
  Array.join(
    [
      Option.match(Option.fromNullishOr(job.startedAtMs), {
        onNone: () => 'running',
        onSome: startedAtMs => `running ${durationText(nowMs - startedAtMs)}`,
      }),
      ...waitedParts(job),
      ...silentHeartbeatParts(job, nowMs),
    ],
    ', ',
  )

const endedText = (job: BuildJob): string =>
  Array.join(
    Array.filter(
      [
        ...Option.toArray(
          Option.map(
            Option.fromNullishOr(job.exitCode),
            exitCode => `exit ${exitCode.toString()}`,
          ),
        ),
        Array.join([...ranParts(job), ...waitedParts(job)], ', '),
      ],
      String.isNonEmpty,
    ),
    '  ',
  )

const outcomeText = (job: BuildJob, nowMs: number): string =>
  M.value(job.state).pipe(
    M.withReturnType<string>(),
    M.when('queued', () => `waiting ${durationText(nowMs - job.queuedAtMs)}`),
    M.when('running', () => runningText(job, nowMs)),
    M.whenOr('passed', 'failed', 'stalled', 'cancelled', () => endedText(job)),
    M.exhaustive,
  )

const cellsOf = (
  job: BuildJob,
  nowMs: number,
  format: Intl.DateTimeFormat,
): ReadonlyArray<string> => [
  localTimeText(job.queuedAtMs, format),
  job.state,
  placeText(job),
  job.label,
  outcomeText(job, nowMs),
  job.agent ?? '',
]

const INDENT = '  '
const COLUMN_GAP = '  '

const columnWidths = (
  rows: ReadonlyArray<ReadonlyArray<string>>,
): ReadonlyArray<number> =>
  Array.reduce(rows, Array.empty<number>(), (widths, row) =>
    Array.map(row, (cell, column) =>
      Math.max(
        cell.length,
        Option.getOrElse(Array.get(widths, column), () => 0),
      ),
    ),
  )

const alignedLines = (
  rows: ReadonlyArray<ReadonlyArray<string>>,
): ReadonlyArray<string> => {
  const widths = columnWidths(rows)
  return Array.map(rows, row =>
    `${INDENT}${Array.join(
      Array.map(row, (cell, column) =>
        cell.padEnd(Option.getOrElse(Array.get(widths, column), () => 0)),
      ),
      COLUMN_GAP,
    )}`.trimEnd(),
  )
}

const BUILDS_HEADING = "Builds (Scribe's buildJobs, newest first)"

/**
 * The Builds section of `issues show`, after Now working and Work in progress:
 * one line per job, newest first, with when it was queued in `timeZone`, its
 * state, where it ran, its label, how it ended and how long it ran and waited,
 * and its agent:
 *
 * `10-30 12:06  passed   mini slot 1 warm  measure-1412-cold  exit 0  ran 4 min, waited 6 min  build-sh-1412`
 *
 * A time zone this Mac cannot name, such as `Etc/Unknown` under an empty
 * `TZ`, prints in the default zone instead of failing the command.
 * A running job whose heartbeat is older than 3 minutes adds
 * `last heartbeat 10 min ago`: its machine stopped writing (Scribe ADR 0104).
 * No jobs print nothing; jobs that could not be read print one line saying
 * why.
 */
export const buildJobsSection = (
  read: BuildJobsRead,
  nowMs: number,
  timeZone: string,
): ReadonlyArray<string> =>
  M.value(read).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      FoundBuildJobs: ({ jobs, unreadable }) => {
        const format = localTimeFormat(timeZone)
        return Array.match(
          [
            ...alignedLines(
              Array.map(jobs, job => cellsOf(job, nowMs, format)),
            ),
            ...Array.map(
              unreadable,
              row => `${INDENT}${row.id} could not be read: ${row.reason}`,
            ),
            ...(jobs.length + unreadable.length >= shownBuildJobsLimit
              ? [
                  `${INDENT}Only the newest ${shownBuildJobsLimit.toString()} are shown.`,
                ]
              : []),
          ],
          {
            onEmpty: () => [],
            onNonEmpty: lines => ['', BUILDS_HEADING, ...lines],
          },
        )
      },
      UnavailableBuildJobs: ({ reason }) => ['', `Builds not shown: ${reason}`],
    }),
  )

const encodeBuildJob = S.encodeSync(BuildJob)

/**
 * The keys `issues show --json` adds to the Issue: `builds`, the jobs as
 * Scribe stores them, newest first, and `buildsUnreadable` when a row did not
 * decode; or `buildsNotShown`, why the jobs could not be read.
 */
export const buildJobsJson = (
  read: BuildJobsRead,
): Readonly<Record<string, unknown>> =>
  M.value(read).pipe(
    M.withReturnType<Readonly<Record<string, unknown>>>(),
    M.tagsExhaustive({
      FoundBuildJobs: ({ jobs, unreadable }) => ({
        builds: Array.map(jobs, job => encodeBuildJob(job)),
        ...(Array.isReadonlyArrayNonEmpty(unreadable)
          ? { buildsUnreadable: unreadable }
          : {}),
      }),
      UnavailableBuildJobs: ({ reason }) => ({ buildsNotShown: reason }),
    }),
  )

import {
  Array,
  Match as M,
  Number as Number_,
  Option,
  Order,
  Record,
  Schema as S,
  pipe,
} from 'effect'

import { RuntimeFailureSource } from '../runtime/runtimeDiagnostic.js'
import type { TelemetryEvent } from './event.js'
import { TelemetryRole, TelemetrySurface } from './surface.js'

// MODEL

/** How many rows each ranked table of a summary keeps by default. */
export const defaultSummaryRowLimit = 10

const millisecondsPerMinute = 60_000

const minimumAveragedMinutes = 1

/**
 * The time a summary covers, as epoch milliseconds. Either end may be
 * open: `{ fromMs: Some(t), toMs: None }` is everything since `t`.
 */
export type TelemetryWindow = Readonly<{
  maybeFromMs: Option.Option<number>
  maybeToMs: Option.Option<number>
}>

/** A window with both ends open: the whole file. */
export const wholeWindow: TelemetryWindow = {
  maybeFromMs: Option.none(),
  maybeToMs: Option.none(),
}

/** Percentiles of one set of durations, in milliseconds. */
export const DurationSummary = S.Struct({
  count: S.Int,
  p50Ms: S.Number,
  p95Ms: S.Number,
  p99Ms: S.Number,
  maxMs: S.Number,
})

/** Percentiles of one set of durations, in milliseconds. */
export type DurationSummary = typeof DurationSummary.Type

/** One row of a count ranking, such as a Message tag and how often it ran. */
export const CountRow = S.Struct({ name: S.String, count: S.Int })

/** One row of a count ranking. */
export type CountRow = typeof CountRow.Type

/** One Command's durations. */
export const CommandDurations = S.Struct({
  command: S.String,
  ...DurationSummary.fields,
})

/** One Command's durations. */
export type CommandDurations = typeof CommandDurations.Type

/**
 * How often one Command failed one way: a `Defect`, when its Effect died,
 * or a `FailedMessage`, when it produced a Message whose tag starts with
 * `Failed`, such as `FailedFetchWeather`. `detail` is the last cause or
 * the Message tag.
 */
export const CommandFailure = S.Struct({
  command: S.String,
  kind: S.Literals(['Defect', 'FailedMessage']),
  count: S.Int,
  detail: S.String,
})

/** How often one Command failed one way. */
export type CommandFailure = typeof CommandFailure.Type

/**
 * One Subscription's lifecycle: how many times it started, how many of
 * those were restarts within a session, and how many times it failed.
 */
export const SubscriptionLifecycle = S.Struct({
  name: S.String,
  starts: S.Int,
  restarts: S.Int,
  failures: S.Int,
})

/** One Subscription's lifecycle. */
export type SubscriptionLifecycle = typeof SubscriptionLifecycle.Type

/**
 * One telemetry session in a summary, with the app, surface, and role it
 * declared. `stoppedAt` is absent for a session that never recorded
 * SessionStopped, such as one still running or a process that was killed;
 * `lastEventAt` says when it was last heard from.
 */
export const SessionRow = S.Struct({
  session: S.String,
  app: S.String,
  surface: TelemetrySurface,
  role: S.optionalKey(TelemetryRole),
  programId: S.String,
  programVersion: S.Number,
  startedAt: S.String,
  stoppedAt: S.optionalKey(S.String),
  lastEventAt: S.String,
})

/** One telemetry session in a summary. */
export type SessionRow = typeof SessionRow.Type

/**
 * One Command whose spans started in the window and never finished, such
 * as a share that waits forever on a permission prompt. `lastStartedAt` is
 * when the latest of them started.
 */
export const UnfinishedCommand = S.Struct({
  command: S.String,
  count: S.Int,
  lastStartedAt: S.String,
})

/** One Command whose spans started and never finished. */
export type UnfinishedCommand = typeof UnfinishedCommand.Type

/** One crash in a summary. */
export const CrashRow = S.Struct({
  at: S.String,
  source: RuntimeFailureSource,
  message: S.optionalKey(S.String),
  cause: S.String,
})

/** One crash in a summary. */
export type CrashRow = typeof CrashRow.Type

/**
 * What one surface's sessions did in a window: which roles they had, the
 * busiest Messages and Actions, the slowest Commands, the Commands that
 * failed or never finished, update and render durations, how many
 * transitions ran per minute, how often each Subscription restarted, and
 * every crash. `fromAt` and `toAt` are the surface's own first and last
 * events.
 */
export const SurfaceSummary = S.Struct({
  surface: TelemetrySurface,
  roles: S.Array(TelemetryRole),
  sessionCount: S.Int,
  eventCount: S.Int,
  fromAt: S.String,
  toAt: S.String,
  topMessages: S.Array(CountRow),
  topActions: S.Array(CountRow),
  slowestCommands: S.Array(CommandDurations),
  commandFailures: S.Array(CommandFailure),
  unfinishedCommands: S.Array(UnfinishedCommand),
  updateDurations: S.optionalKey(DurationSummary),
  renderDurations: S.optionalKey(DurationSummary),
  transitionCount: S.Int,
  transitionsPerMinute: S.Number,
  peakTransitionsPerMinute: S.Int,
  peakMinute: S.optionalKey(S.String),
  subscriptions: S.Array(SubscriptionLifecycle),
  crashes: S.Array(CrashRow),
})

/** What one surface's sessions did in a window. */
export type SurfaceSummary = typeof SurfaceSummary.Type

/**
 * What telemetry files say about the Programs that wrote them, for one
 * window: every session with the surface it declared, then one
 * {@link SurfaceSummary} for each surface with events, in the order
 * {@link TelemetrySurface} lists them, so the TUI and the React page of
 * one app never blur into one set of numbers.
 */
export const TelemetrySummary = S.Struct({
  fromAt: S.optionalKey(S.String),
  toAt: S.optionalKey(S.String),
  eventCount: S.Int,
  sessions: S.Array(SessionRow),
  surfaces: S.Array(SurfaceSummary),
})

/** What telemetry files say about the Programs that wrote them. */
export type TelemetrySummary = typeof TelemetrySummary.Type

// SUMMARY

type TimedEvent = Readonly<{ atMs: number; event: TelemetryEvent }>

const isInWindow =
  (window: TelemetryWindow) =>
  (atMs: number): boolean =>
    Option.match(window.maybeFromMs, {
      onNone: () => true,
      onSome: fromMs => atMs >= fromMs,
    }) &&
    Option.match(window.maybeToMs, {
      onNone: () => true,
      onSome: toMs => atMs <= toMs,
    })

const percentileOf = (
  sorted: Array.NonEmptyReadonlyArray<number>,
  quantile: number,
): number =>
  pipe(
    sorted,
    Array.get(Math.max(0, Math.ceil(quantile * sorted.length) - 1)),
    Option.getOrElse(() => Array.lastNonEmpty(sorted)),
  )

/**
 * Percentiles of a set of durations by the nearest-rank method, or None
 * when there are none.
 *
 * @example
 * ```typescript
 * durationSummaryOf([4, 1, 3, 2]) // Some({ count: 4, p50Ms: 2, p95Ms: 4, p99Ms: 4, maxMs: 4 })
 * ```
 */
export const durationSummaryOf = (
  durations: ReadonlyArray<number>,
): Option.Option<DurationSummary> =>
  Array.match(Array.sort(durations, Order.Number), {
    onEmpty: () => Option.none(),
    onNonEmpty: sorted =>
      Option.some({
        count: sorted.length,
        p50Ms: percentileOf(sorted, 0.5),
        p95Ms: percentileOf(sorted, 0.95),
        p99Ms: percentileOf(sorted, 0.99),
        maxMs: Array.lastNonEmpty(sorted),
      }),
  })

const byCountDescending = Order.flip(
  Order.mapInput(Order.Number, (row: CountRow) => row.count),
)

const countRows = (
  names: ReadonlyArray<string>,
  limit: number,
): ReadonlyArray<CountRow> =>
  pipe(
    names,
    Array.groupBy(name => name),
    Record.toEntries,
    Array.map(([name, occurrences]) => ({ name, count: occurrences.length })),
    Array.sort(byCountDescending),
    Array.take(limit),
  )

const syncEngineMessages: ReadonlySet<string> = new Set([
  'SnapshotReceived',
  'RemoteMessageReceived',
  'LogRefolded',
  'SyncFailed',
])

const actionNameOf = (
  event: Extract<TelemetryEvent, { _tag: 'Transition' }>,
): Option.Option<string> => {
  const source = event.source
  if (source._tag === 'Host' && !syncEngineMessages.has(event.message)) {
    return Option.some(source.actionName ?? event.message)
  } else {
    return Option.none()
  }
}

const spanKeyOf = (
  event: Readonly<{ session: string; span: number }>,
): string => `${event.session}\u0000${event.span}`

const unfinishedCommandsOf = (
  events: ReadonlyArray<TelemetryEvent>,
): ReadonlyArray<UnfinishedCommand> => {
  const finishedSpans = new Set(
    Array.flatMap(events, event =>
      event._tag === 'CommandFinished' ? [spanKeyOf(event)] : [],
    ),
  )
  return pipe(
    events,
    Array.flatMap(event =>
      event._tag === 'CommandStarted' && !finishedSpans.has(spanKeyOf(event))
        ? [event]
        : [],
    ),
    Array.groupBy(started => started.command),
    Record.toEntries,
    Array.flatMap(([command, started]) =>
      Option.match(Array.last(started), {
        onNone: () => [],
        onSome: last => [
          { command, count: started.length, lastStartedAt: last.at },
        ],
      }),
    ),
    Array.sort(
      Order.flip(
        Order.mapInput(Order.Number, (row: UnfinishedCommand) => row.count),
      ),
    ),
  )
}

const commandDurationsOf = (
  finished: ReadonlyArray<Extract<TelemetryEvent, { _tag: 'CommandFinished' }>>,
  limit: number,
): ReadonlyArray<CommandDurations> =>
  pipe(
    finished,
    Array.groupBy(event => event.command),
    Record.toEntries,
    Array.flatMap(([command, events]) =>
      Option.match(
        durationSummaryOf(Array.map(events, event => event.durationMs)),
        {
          onNone: () => [],
          onSome: durations => [{ command, ...durations }],
        },
      ),
    ),
    Array.sort(
      Order.flip(
        Order.mapInput(Order.Number, (row: CommandDurations) => row.p95Ms),
      ),
    ),
    Array.take(limit),
  )

const failurePrefix = 'Failed'

const firstLineOf = (text: string): string =>
  Option.getOrElse(Array.head(text.split('\n')), () => text)

const failureOf = (
  event: Extract<TelemetryEvent, { _tag: 'CommandFinished' }>,
): Option.Option<
  Readonly<{ kind: CommandFailure['kind']; detail: string }>
> => {
  if (event.outcome === 'Failure') {
    return Option.some({
      kind: 'Defect',
      detail: firstLineOf(event.cause ?? 'Defect'),
    })
  } else if (event.result?.startsWith(failurePrefix) === true) {
    return Option.some({ kind: 'FailedMessage', detail: event.result })
  } else {
    return Option.none()
  }
}

const commandFailuresOf = (
  finished: ReadonlyArray<Extract<TelemetryEvent, { _tag: 'CommandFinished' }>>,
): ReadonlyArray<CommandFailure> =>
  pipe(
    finished,
    Array.flatMap(event =>
      Option.match(failureOf(event), {
        onNone: () => [],
        onSome: failure => [{ command: event.command, ...failure }],
      }),
    ),
    Array.groupBy(failure => `${failure.command}\u0000${failure.kind}`),
    Record.values,
    Array.flatMap(failures =>
      Option.match(Array.last(failures), {
        onNone: () => [],
        onSome: last => [
          {
            command: last.command,
            kind: last.kind,
            count: failures.length,
            detail: last.detail,
          },
        ],
      }),
    ),
    Array.sort(
      Order.flip(
        Order.mapInput(Order.Number, (row: CommandFailure) => row.count),
      ),
    ),
  )

const subscriptionLifecyclesOf = (
  diagnostics: ReadonlyArray<Extract<TelemetryEvent, { _tag: 'Diagnostic' }>>,
): ReadonlyArray<SubscriptionLifecycle> =>
  pipe(
    diagnostics,
    Array.filter(
      diagnostic =>
        diagnostic.kind === 'StartedSubscription' ||
        diagnostic.kind === 'FailedSubscription',
    ),
    Array.groupBy(diagnostic => diagnostic.name),
    Record.toEntries,
    Array.map(([name, events]) => {
      const starts = Array.filter(
        events,
        event => event.kind === 'StartedSubscription',
      )
      const sessionsStarted = Array.dedupe(
        Array.map(starts, event => event.session),
      ).length
      return {
        name,
        starts: starts.length,
        restarts: starts.length - sessionsStarted,
        failures: events.length - starts.length,
      }
    }),
    Array.sort(
      Order.flip(
        Order.mapInput(
          Order.Number,
          (row: SubscriptionLifecycle) => row.restarts,
        ),
      ),
    ),
  )

const sessionRowsOf = (
  events: ReadonlyArray<TelemetryEvent>,
): ReadonlyArray<SessionRow> => {
  const stoppedAtBySession = Record.fromEntries(
    Array.flatMap(
      events,
      (event): ReadonlyArray<readonly [string, string]> =>
        event._tag === 'SessionStopped' ? [[event.session, event.at]] : [],
    ),
  )
  const lastEventAtBySession = Record.fromEntries(
    Array.map(events, (event): readonly [string, string] => [
      event.session,
      event.at,
    ]),
  )
  return Array.flatMap(events, event =>
    event._tag === 'SessionStarted'
      ? [
          {
            session: event.session,
            app: event.app,
            surface: event.surface,
            ...(event.role === undefined ? {} : { role: event.role }),
            programId: event.programId,
            programVersion: event.programVersion,
            startedAt: event.at,
            ...Option.match(Record.get(stoppedAtBySession, event.session), {
              onNone: () => ({}),
              onSome: stoppedAt => ({ stoppedAt }),
            }),
            lastEventAt: Option.getOrElse(
              Record.get(lastEventAtBySession, event.session),
              () => event.at,
            ),
          },
        ]
      : [],
  )
}

const minuteLabelOf = (minute: number): string =>
  `${new Date(minute * millisecondsPerMinute).toISOString().slice(0, 16)}Z`

const surfaceSummaryOf = (
  surface: TelemetrySurface,
  timed: Array.NonEmptyReadonlyArray<TimedEvent>,
  limit: number,
): SurfaceSummary => {
  const included = Array.map(timed, ({ event }) => event)
  const transitions = Array.filter(
    included,
    (event): event is Extract<TelemetryEvent, { _tag: 'Transition' }> =>
      event._tag === 'Transition',
  )
  const finished = Array.filter(
    included,
    (event): event is Extract<TelemetryEvent, { _tag: 'CommandFinished' }> =>
      event._tag === 'CommandFinished',
  )
  const diagnostics = Array.filter(
    included,
    (event): event is Extract<TelemetryEvent, { _tag: 'Diagnostic' }> =>
      event._tag === 'Diagnostic',
  )
  const rendered = Array.filter(
    included,
    (event): event is Extract<TelemetryEvent, { _tag: 'Rendered' }> =>
      event._tag === 'Rendered',
  )
  const crashes = Array.flatMap(included, event =>
    event._tag === 'Crashed'
      ? [
          {
            at: event.at,
            source: event.source,
            ...(event.message === undefined ? {} : { message: event.message }),
            cause: firstLineOf(event.cause),
          },
        ]
      : [],
  )
  const first = Array.headNonEmpty(timed)
  const last = Array.lastNonEmpty(timed)
  const transitionMinutes = Array.map(
    Array.filter(timed, ({ event }) => event._tag === 'Transition'),
    ({ atMs }) => Math.floor(atMs / millisecondsPerMinute),
  )
  const perMinute = countRows(
    Array.map(transitionMinutes, minute => minute.toString()),
    1,
  )
  const spanMinutes = (last.atMs - first.atMs) / millisecondsPerMinute
  const transitionsPerMinute =
    transitions.length / Math.max(spanMinutes, minimumAveragedMinutes)
  const maybePeak = Array.head(perMinute)
  return {
    surface,
    roles: Array.dedupe(
      Array.flatMap(included, event =>
        event.role === undefined ? [] : [event.role],
      ),
    ),
    sessionCount: Array.dedupe(Array.map(included, event => event.session))
      .length,
    eventCount: included.length,
    fromAt: first.event.at,
    toAt: last.event.at,
    topMessages: countRows(
      Array.map(transitions, transition => transition.message),
      limit,
    ),
    topActions: countRows(
      Array.getSomes(Array.map(transitions, actionNameOf)),
      limit,
    ),
    slowestCommands: commandDurationsOf(finished, limit),
    commandFailures: commandFailuresOf(finished),
    unfinishedCommands: unfinishedCommandsOf(included),
    ...Option.match(
      durationSummaryOf(
        Array.flatMap(transitions, transition =>
          transition.updateDurationMs === undefined
            ? []
            : [transition.updateDurationMs],
        ),
      ),
      {
        onNone: () => ({}),
        onSome: updateDurations => ({ updateDurations }),
      },
    ),
    ...Option.match(
      durationSummaryOf(Array.map(rendered, render => render.durationMs)),
      {
        onNone: () => ({}),
        onSome: renderDurations => ({ renderDurations }),
      },
    ),
    transitionCount: transitions.length,
    transitionsPerMinute: Number_.round(transitionsPerMinute, 1),
    peakTransitionsPerMinute: Option.match(maybePeak, {
      onNone: () => 0,
      onSome: peak => peak.count,
    }),
    ...Option.match(maybePeak, {
      onNone: () => ({}),
      onSome: peak => ({ peakMinute: minuteLabelOf(Number(peak.name)) }),
    }),
    subscriptions: subscriptionLifecyclesOf(diagnostics),
    crashes,
  }
}

/**
 * Summarizes telemetry events for one window, surface by surface. For each
 * surface: the busiest Messages and Actions, the slowest Commands by p95
 * with p50 and max, every Command failure, every Command started and never
 * finished, update and render duration percentiles, transitions per minute
 * on average and at the peak, Subscription restarts, and crashes. An
 * Action is a Message the Host sent, named by its Action name when it has
 * one, other than the Messages a sync engine sends itself, such as
 * `SnapshotReceived`. Ranked tables keep `limit` rows.
 *
 * @example
 * ```typescript
 * const summary = summarize(events, { maybeFromMs: Option.some(Date.now() - 30 * 60_000), maybeToMs: Option.none() })
 * summary.surfaces.map(surface => surface.surface) // ['terminal-tui', 'web-react']
 * ```
 */
export const summarize = (
  events: ReadonlyArray<TelemetryEvent>,
  window: TelemetryWindow = wholeWindow,
  limit: number = defaultSummaryRowLimit,
): TelemetrySummary => {
  const isIncluded = isInWindow(window)
  const timed: ReadonlyArray<TimedEvent> = pipe(
    events,
    Array.map(event => ({ atMs: Date.parse(event.at), event })),
    Array.filter(({ atMs }) => Number.isFinite(atMs) && isIncluded(atMs)),
    Array.sort(
      Order.mapInput(Order.Number, (timedEvent: TimedEvent) => timedEvent.atMs),
    ),
  )
  const surfaces = Array.flatMap(TelemetrySurface.literals, surface =>
    Array.match(
      Array.filter(timed, ({ event }) => event.surface === surface),
      {
        onEmpty: () => [],
        onNonEmpty: surfaceEvents => [
          surfaceSummaryOf(surface, surfaceEvents, limit),
        ],
      },
    ),
  )
  return {
    ...Option.match(Array.head(timed), {
      onNone: () => ({}),
      onSome: first => ({ fromAt: first.event.at }),
    }),
    ...Option.match(Array.last(timed), {
      onNone: () => ({}),
      onSome: last => ({ toAt: last.event.at }),
    }),
    eventCount: timed.length,
    sessions: sessionRowsOf(Array.map(timed, ({ event }) => event)),
    surfaces,
  }
}

// VIEW

const columnGap = '  '

const formatMs = (durationMs: number): string =>
  durationMs >= 100
    ? `${Number_.round(durationMs, 0)}ms`
    : `${Number_.round(durationMs, 2)}ms`

const tableLines = (
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): ReadonlyArray<string> => {
  const widths = Array.map(headers, (header, column) =>
    Array.reduce(rows, header.length, (widest, row) =>
      Math.max(
        widest,
        Option.match(Array.get(row, column), {
          onNone: () => 0,
          onSome: cell => cell.length,
        }),
      ),
    ),
  )
  const lineOf = (cells: ReadonlyArray<string>): string =>
    Array.join(
      Array.map(cells, (cell, column) =>
        cell.padEnd(
          Option.getOrElse(Array.get(widths, column), () => cell.length),
        ),
      ),
      columnGap,
    ).trimEnd()
  return [lineOf(headers), ...Array.map(rows, lineOf)]
}

const section = (
  title: string,
  lines: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Array.isReadonlyArrayEmpty(lines)
    ? [title, '  none', '']
    : [title, ...Array.map(lines, line => `  ${line}`), '']

const durationLine = (
  label: string,
  durations: DurationSummary | undefined,
): string =>
  durations === undefined
    ? `${label}: none recorded`
    : `${label}: p50 ${formatMs(durations.p50Ms)}  p95 ${formatMs(durations.p95Ms)}  p99 ${formatMs(durations.p99Ms)}  max ${formatMs(durations.maxMs)}  (${durations.count} recorded)`

const crashSourceOf = (crash: CrashRow): string =>
  M.value(crash.source).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Update: ({ messageTag }) => `update of ${messageTag}`,
      Command: ({ name }) => `Command ${name}`,
      Subscription: ({ name }) => `Subscription ${name}`,
      ManagedResource: ({ name }) => `ManagedResource ${name}`,
    }),
  )

const crashLine = (crash: CrashRow): string =>
  `${crash.at}  ${crashSourceOf(crash)}: ${crash.cause}`

const indented = (lines: ReadonlyArray<string>): ReadonlyArray<string> =>
  Array.map(lines, line => (line === '' ? line : `  ${line}`))

const rolesLabelOf = (roles: ReadonlyArray<TelemetryRole>): string =>
  Array.match(roles, {
    onEmpty: () => '-',
    onNonEmpty: nonEmptyRoles => Array.join(nonEmptyRoles, ', '),
  })

const countLabelOf = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

const surfaceLines = (summary: SurfaceSummary): ReadonlyArray<string> => [
  `Surface ${summary.surface}, ${countLabelOf(summary.sessionCount, 'session')}, ${countLabelOf(summary.eventCount, 'event')}, from ${summary.fromAt} to ${summary.toAt}`,
  ...(Array.isReadonlyArrayEmpty(summary.roles)
    ? []
    : [`  roles: ${rolesLabelOf(summary.roles)}`]),
  '',
  ...indented([
    ...section(
      'Top Messages',
      Array.match(summary.topMessages, {
        onEmpty: () => [],
        onNonEmpty: rows =>
          tableLines(
            ['count', 'message'],
            Array.map(rows, row => [row.count.toString(), row.name]),
          ),
      }),
    ),
    ...section(
      'Top Actions',
      Array.match(summary.topActions, {
        onEmpty: () => [],
        onNonEmpty: rows =>
          tableLines(
            ['count', 'action'],
            Array.map(rows, row => [row.count.toString(), row.name]),
          ),
      }),
    ),
    ...section(
      'Slowest Commands',
      Array.match(summary.slowestCommands, {
        onEmpty: () => [],
        onNonEmpty: rows =>
          tableLines(
            ['command', 'count', 'p50', 'p95', 'max'],
            Array.map(rows, row => [
              row.command,
              row.count.toString(),
              formatMs(row.p50Ms),
              formatMs(row.p95Ms),
              formatMs(row.maxMs),
            ]),
          ),
      }),
    ),
    ...section(
      'Command failures',
      Array.match(summary.commandFailures, {
        onEmpty: () => [],
        onNonEmpty: rows =>
          tableLines(
            ['count', 'command', 'kind', 'last'],
            Array.map(rows, row => [
              row.count.toString(),
              row.command,
              row.kind,
              row.detail,
            ]),
          ),
      }),
    ),
    ...section(
      'Unfinished Commands',
      Array.match(summary.unfinishedCommands, {
        onEmpty: () => [],
        onNonEmpty: rows =>
          tableLines(
            ['count', 'command', 'last started'],
            Array.map(rows, row => [
              row.count.toString(),
              row.command,
              row.lastStartedAt,
            ]),
          ),
      }),
    ),
    ...section('Durations', [
      durationLine('update', summary.updateDurations),
      durationLine('render', summary.renderDurations),
    ]),
    ...section('Transitions', [
      `${countLabelOf(summary.transitionCount, 'transition')}, ${summary.transitionsPerMinute} per minute on average`,
      ...(summary.peakMinute === undefined
        ? []
        : [
            `peak ${summary.peakTransitionsPerMinute} in the minute from ${summary.peakMinute}`,
          ]),
    ]),
    ...section(
      'Subscription restarts',
      Array.match(summary.subscriptions, {
        onEmpty: () => [],
        onNonEmpty: rows =>
          tableLines(
            ['subscription', 'starts', 'restarts', 'failures'],
            Array.map(rows, row => [
              row.name,
              row.starts.toString(),
              row.restarts.toString(),
              row.failures.toString(),
            ]),
          ),
      }),
    ),
    ...section('Crashes', Array.map(summary.crashes, crashLine)),
  ]),
]

/**
 * Prints a summary as text a person reads in a terminal: the surfaces at a
 * glance, every session with the surface it declared, then one section
 * per surface, each with the same questions, with columns aligned.
 *
 * @example
 * ```typescript
 * console.log(formatSummary(summarize(events), 'books-terminal-tui.ndjson, books-web-react.ndjson'))
 * // Telemetry for books-terminal-tui.ndjson, books-web-react.ndjson
 * // From 2026-10-04T20:15:02.114Z to 2026-10-04T20:31:40.002Z, 412 events
 * //
 * // Surfaces
 * //   surface       roles  sessions  events  transitions  per minute
 * //   terminal-tui  -      1         112     40           20.1
 * //   web-react     -      2         300     120          38
 * // …
 * ```
 */
export const formatSummary = (
  summary: TelemetrySummary,
  title: string,
): string => {
  const windowLine =
    summary.fromAt === undefined || summary.toAt === undefined
      ? 'No events in this window'
      : `From ${summary.fromAt} to ${summary.toAt}, ${summary.eventCount} events`
  const lines = [
    `Telemetry for ${title}`,
    windowLine,
    '',
    ...section(
      'Surfaces',
      Array.match(summary.surfaces, {
        onEmpty: () => [],
        onNonEmpty: surfaces =>
          tableLines(
            [
              'surface',
              'roles',
              'sessions',
              'events',
              'transitions',
              'per minute',
            ],
            Array.map(surfaces, surface => [
              surface.surface,
              rolesLabelOf(surface.roles),
              surface.sessionCount.toString(),
              surface.eventCount.toString(),
              surface.transitionCount.toString(),
              surface.transitionsPerMinute.toString(),
            ]),
          ),
      }),
    ),
    ...section(
      'Sessions',
      Array.match(summary.sessions, {
        onEmpty: () => [],
        onNonEmpty: sessions =>
          tableLines(
            [
              'session',
              'app',
              'surface',
              'role',
              'program',
              'started',
              'stopped',
              'last event',
            ],
            Array.map(sessions, session => [
              session.session,
              session.app,
              session.surface,
              session.role ?? '-',
              `${session.programId}@${session.programVersion}`,
              session.startedAt,
              session.stoppedAt ?? 'not recorded',
              session.lastEventAt,
            ]),
          ),
      }),
    ),
    ...Array.flatMap(summary.surfaces, surfaceLines),
  ]
  return Array.join(lines, '\n').trimEnd()
}

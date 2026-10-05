import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  CommandFinished,
  CommandStarted,
  Crashed,
  Diagnostic,
  Rendered,
  SessionStarted,
  SessionStopped,
  type TelemetryEvent,
  Transition,
} from './event.js'
import { durationSummaryOf, formatSummary, summarize } from './summary.js'
import type { TelemetryRole, TelemetrySurface } from './surface.js'

const startMs = Date.UTC(2026, 9, 4, 20, 0, 0)

type Session = Readonly<{
  session: string
  app: string
  surface: TelemetrySurface
  role?: TelemetryRole
}>

const reactTab: Session = {
  session: 'aaaa0001',
  app: 'books',
  surface: 'web-react',
}

const secondReactTab: Session = {
  session: 'bbbb0002',
  app: 'books',
  surface: 'web-react',
}

const terminalTui: Session = {
  session: 'cccc0003',
  app: 'books',
  surface: 'terminal-tui',
}

const cliDaemon: Session = {
  session: 'dddd0004',
  app: 'books',
  surface: 'terminal-cli',
  role: 'daemon',
}

let nextSequence = 1

const envelopeAt = (secondsAfterStart: number, session: Session = reactTab) => {
  const sequence = nextSequence
  nextSequence += 1
  return {
    at: new Date(startMs + secondsAfterStart * 1_000).toISOString(),
    sequence,
    ...session,
  }
}

const transition = (
  secondsAfterStart: number,
  message: string,
  source: Transition['source'] = { _tag: 'Host' },
  updateDurationMs = 0.1,
  session: Session = reactTab,
): TelemetryEvent =>
  Transition.make({
    ...envelopeAt(secondsAfterStart, session),
    transition: 1,
    message,
    source,
    commands: [],
    isModelChanged: true,
    changedPathCount: 1,
    updateDurationMs,
  })

const finished = (
  secondsAfterStart: number,
  command: string,
  durationMs: number,
  outcome: CommandFinished['outcome'] = 'Success',
  result?: string,
  session: Session = reactTab,
): TelemetryEvent =>
  CommandFinished.make({
    ...envelopeAt(secondsAfterStart, session),
    command,
    span: 1,
    durationMs,
    outcome,
    ...(result === undefined ? {} : { result }),
    ...(outcome === 'Failure'
      ? { cause: 'Error: socket closed\n    at read (net.js:1:1)' }
      : {}),
  })

const started = (
  secondsAfterStart: number,
  session: Session,
  instanceId: number,
): TelemetryEvent =>
  Diagnostic.make({
    ...envelopeAt(secondsAfterStart, session),
    kind: 'StartedSubscription',
    name: 'playback',
    instanceId,
  })

const sessionStarted = (
  secondsAfterStart: number,
  session: Session,
): TelemetryEvent =>
  SessionStarted.make({
    ...envelopeAt(secondsAfterStart, session),
    programId: 'sync:books',
    programVersion: 1,
  })

const sessionStopped = (
  secondsAfterStart: number,
  session: Session,
  durationMs: number,
): TelemetryEvent =>
  SessionStopped.make({
    ...envelopeAt(secondsAfterStart, session),
    programId: 'sync:books',
    programVersion: 1,
    durationMs,
  })

const events: ReadonlyArray<TelemetryEvent> = [
  sessionStarted(0, reactTab),
  transition(0.5, 'SnapshotReceived', { _tag: 'Host' }, 0.1),
  transition(1, 'PressedPlay', { _tag: 'Host', actionName: 'Play' }, 0.2),
  transition(
    2,
    'UpdatedTime',
    { _tag: 'Subscription', name: 'playback' },
    0.05,
  ),
  transition(
    3,
    'UpdatedTime',
    { _tag: 'Subscription', name: 'playback' },
    0.05,
  ),
  transition(
    4,
    'UpdatedTime',
    { _tag: 'Subscription', name: 'playback' },
    0.05,
  ),
  transition(70, 'PressedPause', { _tag: 'Host' }, 3),
  transition(75, 'PressedPlay', { _tag: 'Host', actionName: 'Play' }, 0.2),
  finished(2, 'PlayAudio', 100),
  finished(3, 'PlayAudio', 200),
  finished(4, 'PlayAudio', 300),
  finished(5, 'PlayAudio', 400),
  finished(6, 'SaveProgress', 5),
  finished(7, 'SaveProgress', 7, 'Success', 'FailedSaveProgress'),
  finished(8, 'SaveProgress', 9, 'Failure'),
  CommandStarted.make({ ...envelopeAt(20), command: 'ShareLink', span: 9 }),
  started(1, reactTab, 1),
  started(50, reactTab, 2),
  started(60, reactTab, 3),
  started(61, secondReactTab, 1),
  Rendered.make({ ...envelopeAt(9), painter: 'React', durationMs: 4 }),
  Rendered.make({ ...envelopeAt(10), painter: 'React', durationMs: 12 }),
  Crashed.make({
    ...envelopeAt(80),
    source: { _tag: 'Command', name: 'SaveProgress' },
    message: 'PressedSave',
    cause: 'Error: socket closed\n    at read (net.js:1:1)',
  }),
  sessionStopped(90, reactTab, 90_000),
  sessionStarted(30, terminalTui),
  transition(
    31,
    'PressedNextChapter',
    { _tag: 'Host', actionName: 'NextChapter' },
    0.3,
    terminalTui,
  ),
  finished(32, 'PlayAudio', 50, 'Success', undefined, terminalTui),
  sessionStopped(40, terminalTui, 10_000),
  sessionStarted(5, cliDaemon),
  transition(6, 'SnapshotReceived', { _tag: 'Host' }, 0.4, cliDaemon),
]

describe('durationSummaryOf', () => {
  it('reads percentiles by nearest rank', () => {
    expect(durationSummaryOf([4, 1, 3, 2])).toStrictEqual(
      Option.some({ count: 4, p50Ms: 2, p95Ms: 4, p99Ms: 4, maxMs: 4 }),
    )
    expect(durationSummaryOf([])).toStrictEqual(Option.none())
  })
})

describe('summarize', () => {
  it('answers what each surface did, for the whole file', () => {
    const summary = summarize(events)
    expect(summary).toMatchObject({
      fromAt: '2026-10-04T20:00:00.000Z',
      toAt: '2026-10-04T20:01:30.000Z',
      eventCount: events.length,
      sessions: [
        {
          session: 'aaaa0001',
          app: 'books',
          surface: 'web-react',
          programId: 'sync:books',
          startedAt: '2026-10-04T20:00:00.000Z',
          stoppedAt: '2026-10-04T20:01:30.000Z',
          lastEventAt: '2026-10-04T20:01:30.000Z',
        },
        {
          session: 'dddd0004',
          surface: 'terminal-cli',
          role: 'daemon',
          startedAt: '2026-10-04T20:00:05.000Z',
          lastEventAt: '2026-10-04T20:00:06.000Z',
        },
        {
          session: 'cccc0003',
          surface: 'terminal-tui',
          startedAt: '2026-10-04T20:00:30.000Z',
          stoppedAt: '2026-10-04T20:00:40.000Z',
        },
      ],
    })
    expect(summary.sessions).not.toContainEqual(
      expect.objectContaining({
        session: 'dddd0004',
        stoppedAt: expect.any(String),
      }),
    )
    expect(summary.surfaces.map(surface => surface.surface)).toStrictEqual([
      'terminal-cli',
      'terminal-tui',
      'web-react',
    ])
    expect(summary.surfaces).toMatchObject([
      {
        surface: 'terminal-cli',
        roles: ['daemon'],
        sessionCount: 1,
        eventCount: 2,
        fromAt: '2026-10-04T20:00:05.000Z',
        toAt: '2026-10-04T20:00:06.000Z',
        topMessages: [{ name: 'SnapshotReceived', count: 1 }],
        topActions: [],
        slowestCommands: [],
        transitionCount: 1,
      },
      {
        surface: 'terminal-tui',
        roles: [],
        sessionCount: 1,
        eventCount: 4,
        topMessages: [{ name: 'PressedNextChapter', count: 1 }],
        topActions: [{ name: 'NextChapter', count: 1 }],
        slowestCommands: [
          { command: 'PlayAudio', count: 1, p50Ms: 50, p95Ms: 50, maxMs: 50 },
        ],
        updateDurations: { count: 1, p50Ms: 0.3 },
        transitionCount: 1,
        subscriptions: [],
        crashes: [],
      },
      {
        surface: 'web-react',
        roles: [],
        sessionCount: 2,
        eventCount: 24,
        fromAt: '2026-10-04T20:00:00.000Z',
        toAt: '2026-10-04T20:01:30.000Z',
        topMessages: [
          { name: 'UpdatedTime', count: 3 },
          { name: 'PressedPlay', count: 2 },
          { name: 'SnapshotReceived', count: 1 },
          { name: 'PressedPause', count: 1 },
        ],
        topActions: [
          { name: 'Play', count: 2 },
          { name: 'PressedPause', count: 1 },
        ],
        slowestCommands: [
          {
            command: 'PlayAudio',
            count: 4,
            p50Ms: 200,
            p95Ms: 400,
            maxMs: 400,
          },
          { command: 'SaveProgress', count: 3, p50Ms: 7, p95Ms: 9, maxMs: 9 },
        ],
        commandFailures: [
          {
            command: 'SaveProgress',
            kind: 'FailedMessage',
            count: 1,
            detail: 'FailedSaveProgress',
          },
          {
            command: 'SaveProgress',
            kind: 'Defect',
            count: 1,
            detail: 'Error: socket closed',
          },
        ],
        unfinishedCommands: [
          {
            command: 'ShareLink',
            count: 1,
            lastStartedAt: '2026-10-04T20:00:20.000Z',
          },
        ],
        updateDurations: { count: 7, p50Ms: 0.1, p95Ms: 3, maxMs: 3 },
        renderDurations: { count: 2, p50Ms: 4, maxMs: 12 },
        transitionCount: 7,
        transitionsPerMinute: 4.7,
        peakTransitionsPerMinute: 5,
        peakMinute: '2026-10-04T20:00Z',
        subscriptions: [
          { name: 'playback', starts: 4, restarts: 2, failures: 0 },
        ],
        crashes: [
          {
            at: '2026-10-04T20:01:20.000Z',
            source: { _tag: 'Command', name: 'SaveProgress' },
            message: 'PressedSave',
            cause: 'Error: socket closed',
          },
        ],
      },
    ])
  })

  it('keeps only the window asked for', () => {
    const summary = summarize(events, {
      maybeFromMs: Option.some(startMs + 60_000),
      maybeToMs: Option.some(startMs + 76_000),
    })
    expect(summary.sessions).toStrictEqual([])
    expect(summary.surfaces).toHaveLength(1)
    expect(summary.surfaces).toMatchObject([
      {
        surface: 'web-react',
        sessionCount: 2,
        transitionCount: 2,
        topMessages: [
          { name: 'PressedPause', count: 1 },
          { name: 'PressedPlay', count: 1 },
        ],
        slowestCommands: [],
        subscriptions: [
          { name: 'playback', starts: 2, restarts: 0, failures: 0 },
        ],
      },
    ])
  })
})

describe('formatSummary', () => {
  it('prints the surfaces and sessions, then one section per surface', () => {
    expect(
      formatSummary(
        summarize(events),
        'books-terminal-cli.ndjson, books-terminal-tui.ndjson, books-web-react.ndjson',
      ),
    ).toBe(
      [
        'Telemetry for books-terminal-cli.ndjson, books-terminal-tui.ndjson, books-web-react.ndjson',
        'From 2026-10-04T20:00:00.000Z to 2026-10-04T20:01:30.000Z, 30 events',
        '',
        'Surfaces',
        '  surface       roles   sessions  events  transitions  per minute',
        '  terminal-cli  daemon  1         2       1            1',
        '  terminal-tui  -       1         4       1            1',
        '  web-react     -       2         24      7            4.7',
        '',
        'Sessions',
        '  session   app    surface       role    program       started                   stopped                   last event',
        '  aaaa0001  books  web-react     -       sync:books@1  2026-10-04T20:00:00.000Z  2026-10-04T20:01:30.000Z  2026-10-04T20:01:30.000Z',
        '  dddd0004  books  terminal-cli  daemon  sync:books@1  2026-10-04T20:00:05.000Z  not recorded              2026-10-04T20:00:06.000Z',
        '  cccc0003  books  terminal-tui  -       sync:books@1  2026-10-04T20:00:30.000Z  2026-10-04T20:00:40.000Z  2026-10-04T20:00:40.000Z',
        '',
        'Surface terminal-cli, 1 session, 2 events, from 2026-10-04T20:00:05.000Z to 2026-10-04T20:00:06.000Z',
        '  roles: daemon',
        '',
        '  Top Messages',
        '    count  message',
        '    1      SnapshotReceived',
        '',
        '  Top Actions',
        '    none',
        '',
        '  Slowest Commands',
        '    none',
        '',
        '  Command failures',
        '    none',
        '',
        '  Unfinished Commands',
        '    none',
        '',
        '  Durations',
        '    update: p50 0.4ms  p95 0.4ms  p99 0.4ms  max 0.4ms  (1 recorded)',
        '    render: none recorded',
        '',
        '  Transitions',
        '    1 transition, 1 per minute on average',
        '    peak 1 in the minute from 2026-10-04T20:00Z',
        '',
        '  Subscription restarts',
        '    none',
        '',
        '  Crashes',
        '    none',
        '',
        'Surface terminal-tui, 1 session, 4 events, from 2026-10-04T20:00:30.000Z to 2026-10-04T20:00:40.000Z',
        '',
        '  Top Messages',
        '    count  message',
        '    1      PressedNextChapter',
        '',
        '  Top Actions',
        '    count  action',
        '    1      NextChapter',
        '',
        '  Slowest Commands',
        '    command    count  p50   p95   max',
        '    PlayAudio  1      50ms  50ms  50ms',
        '',
        '  Command failures',
        '    none',
        '',
        '  Unfinished Commands',
        '    none',
        '',
        '  Durations',
        '    update: p50 0.3ms  p95 0.3ms  p99 0.3ms  max 0.3ms  (1 recorded)',
        '    render: none recorded',
        '',
        '  Transitions',
        '    1 transition, 1 per minute on average',
        '    peak 1 in the minute from 2026-10-04T20:00Z',
        '',
        '  Subscription restarts',
        '    none',
        '',
        '  Crashes',
        '    none',
        '',
        'Surface web-react, 2 sessions, 24 events, from 2026-10-04T20:00:00.000Z to 2026-10-04T20:01:30.000Z',
        '',
        '  Top Messages',
        '    count  message',
        '    3      UpdatedTime',
        '    2      PressedPlay',
        '    1      SnapshotReceived',
        '    1      PressedPause',
        '',
        '  Top Actions',
        '    count  action',
        '    2      Play',
        '    1      PressedPause',
        '',
        '  Slowest Commands',
        '    command       count  p50    p95    max',
        '    PlayAudio     4      200ms  400ms  400ms',
        '    SaveProgress  3      7ms    9ms    9ms',
        '',
        '  Command failures',
        '    count  command       kind           last',
        '    1      SaveProgress  FailedMessage  FailedSaveProgress',
        '    1      SaveProgress  Defect         Error: socket closed',
        '',
        '  Unfinished Commands',
        '    count  command    last started',
        '    1      ShareLink  2026-10-04T20:00:20.000Z',
        '',
        '  Durations',
        '    update: p50 0.1ms  p95 3ms  p99 3ms  max 3ms  (7 recorded)',
        '    render: p50 4ms  p95 12ms  p99 12ms  max 12ms  (2 recorded)',
        '',
        '  Transitions',
        '    7 transitions, 4.7 per minute on average',
        '    peak 5 in the minute from 2026-10-04T20:00Z',
        '',
        '  Subscription restarts',
        '    subscription  starts  restarts  failures',
        '    playback      4       2         0',
        '',
        '  Crashes',
        '    2026-10-04T20:01:20.000Z  Command SaveProgress: Error: socket closed',
      ].join('\n'),
    )
  })

  it('says when a window holds no events', () => {
    expect(formatSummary(summarize([]), 'books')).toBe(
      [
        'Telemetry for books',
        'No events in this window',
        '',
        'Surfaces',
        '  none',
        '',
        'Sessions',
        '  none',
      ].join('\n'),
    )
  })
})

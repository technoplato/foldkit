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

const startMs = Date.UTC(2026, 9, 4, 20, 0, 0)

let nextSequence = 1

const envelopeAt = (secondsAfterStart: number, session = 'aaaa0001') => {
  const sequence = nextSequence
  nextSequence += 1
  return {
    at: new Date(startMs + secondsAfterStart * 1_000).toISOString(),
    sequence,
    session,
  }
}

const transition = (
  secondsAfterStart: number,
  message: string,
  source: Transition['source'] = { _tag: 'Host' },
  updateDurationMs = 0.1,
): TelemetryEvent =>
  Transition.make({
    ...envelopeAt(secondsAfterStart),
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
): TelemetryEvent =>
  CommandFinished.make({
    ...envelopeAt(secondsAfterStart),
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
  session: string,
  instanceId: number,
): TelemetryEvent =>
  Diagnostic.make({
    ...envelopeAt(secondsAfterStart, session),
    kind: 'StartedSubscription',
    name: 'playback',
    instanceId,
  })

const events: ReadonlyArray<TelemetryEvent> = [
  SessionStarted.make({
    ...envelopeAt(0),
    app: 'books',
    host: 'react',
    programId: 'sync:books',
    programVersion: 1,
  }),
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
  started(1, 'aaaa0001', 1),
  started(50, 'aaaa0001', 2),
  started(60, 'aaaa0001', 3),
  started(61, 'bbbb0002', 1),
  Rendered.make({ ...envelopeAt(9), painter: 'React', durationMs: 4 }),
  Rendered.make({ ...envelopeAt(10), painter: 'React', durationMs: 12 }),
  Crashed.make({
    ...envelopeAt(80),
    source: { _tag: 'Command', name: 'SaveProgress' },
    message: 'PressedSave',
    cause: 'Error: socket closed\n    at read (net.js:1:1)',
  }),
  SessionStopped.make({
    ...envelopeAt(90),
    app: 'books',
    host: 'react',
    programId: 'sync:books',
    programVersion: 1,
    durationMs: 90_000,
  }),
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
  it('answers what a session did, for the whole file', () => {
    const summary = summarize(events)
    expect(summary).toMatchObject({
      fromAt: '2026-10-04T20:00:00.000Z',
      toAt: '2026-10-04T20:01:30.000Z',
      eventCount: events.length,
      sessions: [
        {
          session: 'aaaa0001',
          app: 'books',
          host: 'react',
          programId: 'sync:books',
          startedAt: '2026-10-04T20:00:00.000Z',
          stoppedAt: '2026-10-04T20:01:30.000Z',
          lastEventAt: '2026-10-04T20:01:30.000Z',
        },
      ],
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
        { command: 'PlayAudio', count: 4, p50Ms: 200, p95Ms: 400, maxMs: 400 },
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
    })
  })

  it('keeps only the window asked for', () => {
    const summary = summarize(events, {
      maybeFromMs: Option.some(startMs + 60_000),
      maybeToMs: Option.some(startMs + 76_000),
    })
    expect(summary.transitionCount).toBe(2)
    expect(summary.topMessages).toStrictEqual([
      { name: 'PressedPause', count: 1 },
      { name: 'PressedPlay', count: 1 },
    ])
    expect(summary.slowestCommands).toStrictEqual([])
    expect(summary.subscriptions).toStrictEqual([
      { name: 'playback', starts: 2, restarts: 0, failures: 0 },
    ])
  })

  it('prints one section per question', () => {
    expect(formatSummary(summarize(events), 'books-react.ndjson')).toBe(
      [
        'Telemetry for books-react.ndjson',
        'From 2026-10-04T20:00:00.000Z to 2026-10-04T20:01:30.000Z, 24 events',
        '',
        'Sessions',
        '  session   app    host   program       started                   stopped                   last event',
        '  aaaa0001  books  react  sync:books@1  2026-10-04T20:00:00.000Z  2026-10-04T20:01:30.000Z  2026-10-04T20:01:30.000Z',
        '',
        'Top Messages',
        '  count  message',
        '  3      UpdatedTime',
        '  2      PressedPlay',
        '  1      SnapshotReceived',
        '  1      PressedPause',
        '',
        'Top Actions',
        '  count  action',
        '  2      Play',
        '  1      PressedPause',
        '',
        'Slowest Commands',
        '  command       count  p50    p95    max',
        '  PlayAudio     4      200ms  400ms  400ms',
        '  SaveProgress  3      7ms    9ms    9ms',
        '',
        'Command failures',
        '  count  command       kind           last',
        '  1      SaveProgress  FailedMessage  FailedSaveProgress',
        '  1      SaveProgress  Defect         Error: socket closed',
        '',
        'Unfinished Commands',
        '  count  command    last started',
        '  1      ShareLink  2026-10-04T20:00:20.000Z',
        '',
        'Durations',
        '  update: p50 0.1ms  p95 3ms  p99 3ms  max 3ms  (7 recorded)',
        '  render: p50 4ms  p95 12ms  p99 12ms  max 12ms  (2 recorded)',
        '',
        'Transitions',
        '  7 transitions, 4.7 per minute on average',
        '  peak 5 in the minute from 2026-10-04T20:00Z',
        '',
        'Subscription restarts',
        '  subscription  starts  restarts  failures',
        '  playback      4       2         0',
        '',
        'Crashes',
        '  2026-10-04T20:01:20.000Z  Command SaveProgress: Error: socket closed',
      ].join('\n'),
    )
  })
})

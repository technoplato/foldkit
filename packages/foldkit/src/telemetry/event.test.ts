import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  CommandFinished,
  Crashed,
  Diagnostic,
  Rendered,
  SessionStarted,
  TelemetryBatch,
  type TelemetryEvent,
  TelemetryLine,
  Transition,
  decodeLine,
  encodeLine,
  isTelemetryName,
} from './event.js'

const envelope = (sequence: number) => ({
  at: '2026-10-04T20:15:02.114Z',
  sequence,
  session: '9f3c2a71',
})

const events: ReadonlyArray<TelemetryEvent> = [
  SessionStarted.make({
    ...envelope(1),
    app: 'books',
    host: 'react',
    programId: 'sync:books',
    programVersion: 1,
  }),
  Transition.make({
    ...envelope(2),
    transition: 1,
    message: 'PressedPlay',
    payload: { bookId: 'a-new-earth', via: { _tag: 'Button', label: 'Play' } },
    source: { _tag: 'Host', actionName: 'Play' },
    commands: [{ name: 'PlayAudio', args: { bookId: 'a-new-earth' } }],
    isModelChanged: true,
    changedPathCount: 2,
    updateDurationMs: 0.05,
  }),
  CommandFinished.make({
    ...envelope(3),
    command: 'PlayAudio',
    span: 1,
    durationMs: 212.4,
    outcome: 'Success',
    result: 'StartedPlayback',
  }),
  Diagnostic.make({
    ...envelope(4),
    kind: 'FailedSubscription',
    name: 'playback',
    instanceId: 2,
    cause: 'Error: audio device went away',
  }),
  Crashed.make({
    ...envelope(5),
    source: { _tag: 'Command', name: 'PlayAudio' },
    message: 'PressedPlay',
    cause: 'Error: boom',
  }),
  Rendered.make({
    ...envelope(6),
    painter: 'React',
    durationMs: 3.2,
    phase: 'update',
  }),
]

describe('telemetry lines', () => {
  it('encode one event per line and decode back to an equal event', () => {
    Array.forEach(events, event => {
      const line = encodeLine(event)
      expect(line).not.toContain('\n')
      expect(decodeLine(line)).toStrictEqual(Option.some(event))
    })
  })

  it('encode exactly as the Schema JSON codec does', () => {
    Array.forEach(events, event => {
      expect(encodeLine(event)).toBe(S.encodeSync(TelemetryLine)(event))
    })
  })

  it('start every line with its tag, ISO time, sequence, and session', () => {
    const maybeLine = Option.map(Array.head(events), encodeLine)
    expect(maybeLine).toStrictEqual(
      Option.some(
        '{"_tag":"SessionStarted","at":"2026-10-04T20:15:02.114Z","sequence":1,"session":"9f3c2a71","app":"books","host":"react","programId":"sync:books","programVersion":1}',
      ),
    )
  })

  it('refuse a line cut short, an unknown tag, and a sequence below 1', () => {
    const maybeLine = Option.map(Array.get(events, 1), encodeLine)
    expect(
      Option.flatMap(maybeLine, line => decodeLine(line.slice(0, 40))),
    ).toStrictEqual(Option.none())
    expect(
      decodeLine(
        '{"_tag":"Painted","at":"2026-10-04T20:15:02.114Z","sequence":1,"session":"x"}',
      ),
    ).toStrictEqual(Option.none())
    expect(
      decodeLine(
        '{"_tag":"Rendered","at":"2026-10-04T20:15:02.114Z","sequence":0,"session":"x","painter":"React","durationMs":1}',
      ),
    ).toStrictEqual(Option.none())
  })

  it('names apps and hosts as file names allow', () => {
    expect(isTelemetryName('books')).toBe(true)
    expect(isTelemetryName('expo-ios')).toBe(true)
    expect(isTelemetryName('Books')).toBe(false)
    expect(isTelemetryName('../react')).toBe(false)
    expect(isTelemetryName('')).toBe(false)
    expect(
      S.decodeUnknownOption(TelemetryBatch)({
        app: 'books',
        host: '../etc',
        events: [],
      }),
    ).toStrictEqual(Option.none())
  })
})

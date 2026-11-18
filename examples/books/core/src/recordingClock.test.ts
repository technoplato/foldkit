import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  Before,
  type CaptureGap,
  type RecordingClock,
  Running,
  Waiting,
  gapsOfJson,
  normalizedGaps,
  positionAt,
  runningPartsOf,
  wallClockMsAt,
} from './recordingClock.js'

// The YouTube companion's cases (realtime-voice scripts/youtube-companion/test/clock.test.ts), which Scribe Videos'
// RecordingClock.swift ports too: Recording 186's first gap, the microphone held by another app for 5.7 s at 29.2 s,
// and a one-minute pause when the clock reads 100 s.
const start = 1_791_048_479_707

const gapOf = (
  offsetSeconds: number,
  startedAtMs: number,
  maybeEndedAtMs: Option.Option<number>,
): CaptureGap => ({ offsetSeconds, startedAtMs, maybeEndedAtMs })

const clock: RecordingClock = {
  startedAtMs: start,
  gaps: [
    gapOf(29.2038, 1_791_048_509_227, Option.none()),
    gapOf(29.2038, 1_791_048_509_227, Option.some(1_791_048_514_936)),
    gapOf(100, 1_791_048_585_732, Option.some(1_791_048_645_732)),
  ],
}

const isNear = (actual: number, expected: number, tolerance: number) =>
  Math.abs(actual - expected) < tolerance

describe('a recording’s clock', () => {
  it('reads an open gap and its closed record as one gap', () => {
    const gaps = normalizedGaps(clock.gaps)
    expect(gaps.length).toBe(2)
    expect(Option.flatMap(Array.head(gaps), gap => gap.maybeEndedAtMs)).toEqual(
      Option.some(1_791_048_514_936),
    )
  })

  it('counts from the start before the first gap', () => {
    expect(positionAt(clock, start + 10_000)).toEqual(
      Running({ offsetSeconds: 10 }),
    )
    expect(positionAt(clock, start - 1)).toEqual(Before())
  })

  it('stands still inside a gap, and runs on from its offset after it', () => {
    expect(positionAt(clock, 1_791_048_512_000)).toEqual(
      Waiting({ offsetSeconds: 29.2038, gapStartedAtMs: 1_791_048_509_227 }),
    )
    const after = positionAt(clock, 1_791_048_514_936 + 10_000)
    expect(
      after._tag === 'Running' && isNear(after.offsetSeconds, 39.2038, 1e-9),
    ).toBe(true)
  })

  it('waits now while its last gap is open', () => {
    const waiting: RecordingClock = {
      startedAtMs: start,
      gaps: [gapOf(50, start + 50_000, Option.none())],
    }
    expect(positionAt(waiting, start + 90_000)).toEqual(
      Waiting({ offsetSeconds: 50, gapStartedAtMs: start + 50_000 }),
    )
  })

  it('maps an offset to the wall clock and back again', () => {
    Array.forEach([0, 5, 29, 29.5, 60, 99.9, 100.5, 400], offset => {
      const back = positionAt(clock, wallClockMsAt(clock, offset))
      expect(
        back._tag === 'Running' && isNear(back.offsetSeconds, offset, 1e-6),
      ).toBe(true)
    })
    expect(wallClockMsAt(clock, 10)).toBe(start + 10_000)
    expect(
      isNear(wallClockMsAt(clock, 39.2038), 1_791_048_524_936, 0.001),
    ).toBe(true)
  })

  it('splits a stretch across a pause into a running part on each side', () => {
    const parts = runningPartsOf(clock, 1_791_048_530_000, 1_791_048_675_732)
    expect(parts.length).toBe(2)
    const [before, after] = parts
    expect(before?.toMs).toBe(1_791_048_585_732)
    expect(isNear(before?.endSeconds ?? 0, 100, 0.01)).toBe(true)
    expect(after?.fromMs).toBe(1_791_048_645_732)
    expect(isNear(after?.startSeconds ?? 0, 100, 1e-9)).toBe(true)
    expect(isNear(after?.endSeconds ?? 0, 130, 0.01)).toBe(true)
  })

  it('has no running part inside a gap, before the recording, or for no time', () => {
    expect(runningPartsOf(clock, 1_791_048_600_000, 1_791_048_640_000)).toEqual(
      [],
    )
    expect(runningPartsOf(clock, start - 20_000, start - 10_000)).toEqual([])
    expect(runningPartsOf(clock, start + 5_000, start + 5_000)).toEqual([])
  })

  it('reads the gaps of a recording row, and none from a value that does not read', () => {
    expect(
      gapsOfJson(
        Option.some(
          JSON.stringify([
            {
              cause: 'microphone',
              id: 'g1',
              offsetSeconds: 29.2038,
              startedAtMs: 1_791_048_509_227,
              endedAtMs: 1_791_048_514_936,
            },
            { cause: 'pause', id: 'g2', offsetSeconds: 100, startedAtMs: 1 },
            { cause: 'broken' },
          ]),
        ),
      ),
    ).toEqual([
      gapOf(29.2038, 1_791_048_509_227, Option.some(1_791_048_514_936)),
      gapOf(100, 1, Option.none()),
    ])
    expect(gapsOfJson(Option.some('not json'))).toEqual([])
    expect(gapsOfJson(Option.none())).toEqual([])
  })
})

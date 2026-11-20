import { describe, expect, it } from 'vitest'

import {
  clockPlaceAt,
  positionReportIntervalMs,
  progressFractionOf,
} from './playbackClock.js'

const playing = {
  placeSeconds: 12,
  rate: 1,
  durationSeconds: 60,
}

const paused = { ...playing, rate: 0 }

describe('the playback clock', () => {
  it('has the place reported about once a second', () => {
    expect(positionReportIntervalMs).toBe(1000)
  })

  it('reads on from the reported place while it plays, and stays there while paused', () => {
    expect(clockPlaceAt(playing, 1_000, 1_000)).toBe(12)
    expect(clockPlaceAt(playing, 1_000, 1_450)).toBeCloseTo(12.45)
    expect(clockPlaceAt(paused, 1_000, 1_450)).toBe(12)
  })

  it('never reads more than a second and a half past a report, nor past the end', () => {
    expect(clockPlaceAt(playing, 1_000, 9_000)).toBeCloseTo(13.5)
    expect(clockPlaceAt({ ...playing, placeSeconds: 59.5 }, 1_000, 2_400)).toBe(
      60,
    )
  })

  it('says how far along the scrubber is', () => {
    expect(progressFractionOf(15, 60)).toBe(0.25)
    expect(progressFractionOf(90, 60)).toBe(1)
    expect(progressFractionOf(3, 0)).toBe(0)
  })
})

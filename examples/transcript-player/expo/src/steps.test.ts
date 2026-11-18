import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import { type PlayerStatus, isResumeOf, notHeardYet, stepOf } from './steps'

const playingAt = (currentTimeMs: number): PlayerStatus => ({
  currentTimeMs,
  isPlaying: true,
  isLoaded: true,
  didJustFinish: false,
  maybeFailure: undefined,
})

const tagsOf = (step: ReturnType<typeof stepOf>): ReadonlyArray<string> =>
  Array.map(step.events, event => event._tag)

describe('what a phone player reports while it sounds a track', () => {
  it('reports each new second it reaches once, with the wall clock', () => {
    const first = stepOf(notHeardYet, playingAt(12_040), 1_000)
    expect(first.events).toEqual([
      { _tag: 'Advanced', placeMs: 12_040, wallClockMs: 1_000 },
    ])
    const same = stepOf(first.heard, playingAt(12_540), 1_500)
    expect(same.events).toEqual([])
    const next = stepOf(same.heard, playingAt(13_010), 2_000)
    expect(next.events).toEqual([
      { _tag: 'Advanced', placeMs: 13_010, wallClockMs: 2_000 },
    ])
  })

  it('reports the place again after a skip from the lock screen, forward or back', () => {
    const before = stepOf(notHeardYet, playingAt(40_200), 1_000)
    const skippedBack = stepOf(before.heard, playingAt(10_300), 1_500)
    expect(tagsOf(skippedBack)).toEqual(['Advanced'])
    expect(skippedBack.events).toEqual([
      { _tag: 'Advanced', placeMs: 10_300, wallClockMs: 1_500 },
    ])
  })

  it('ends when the audio finishes, and is done', () => {
    const ended = stepOf(
      stepOf(notHeardYet, playingAt(59_200), 1_000).heard,
      { ...playingAt(60_000), isPlaying: false, didJustFinish: true },
      2_000,
    )
    expect(tagsOf(ended)).toEqual(['Ended'])
    expect(ended.isDone).toBe(true)
    expect(ended.isPausedByDevice).toBe(false)
  })

  it('fails with the reason when the audio cannot be played', () => {
    const failed = stepOf(
      notHeardYet,
      { ...playingAt(0), isPlaying: false, maybeFailure: 'the file is gone' },
      1_000,
    )
    expect(failed.events).toEqual([
      { _tag: 'Failed', reason: 'the file is gone' },
    ])
    expect(failed.isDone).toBe(true)
  })

  it('says the device paused it, once it had played: a lock screen pause is a fact for the Program', () => {
    const playing = stepOf(notHeardYet, playingAt(5_100), 1_000)
    const paused = stepOf(
      playing.heard,
      { ...playingAt(5_600), isPlaying: false },
      1_500,
    )
    expect(paused.isPausedByDevice).toBe(true)
    expect(paused.isDone).toBe(false)
    expect(paused.events).toEqual([])
  })

  it('does not take the moment before it starts, while it loads, for a pause', () => {
    const loading = stepOf(
      notHeardYet,
      { ...playingAt(0), isPlaying: false, isLoaded: false },
      1_000,
    )
    expect(loading.isPausedByDevice).toBe(false)
    const loaded = stepOf(
      loading.heard,
      { ...playingAt(0), isPlaying: false },
      1_200,
    )
    expect(loaded.isPausedByDevice).toBe(false)
  })
})

describe('whether a player already holds the place it is asked to play from', () => {
  it('keeps playing where the device resumed it, and seeks for a real move', () => {
    expect(isResumeOf({ currentTimeMs: 61_200, fromMs: 61_000 })).toBe(true)
    expect(isResumeOf({ currentTimeMs: 61_000, fromMs: 120_000 })).toBe(false)
    expect(isResumeOf({ currentTimeMs: 61_000, fromMs: 58_000 })).toBe(false)
  })
})

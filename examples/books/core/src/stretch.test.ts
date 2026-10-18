import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import { Milliseconds, type Speed } from './ids.js'
import {
  Begun,
  Quiet,
  Starting,
  type StretchEvent,
  type StretchState,
  finishedAt,
  reachedPlace,
  stoppedAt,
} from './stretch.js'

const startMs = Date.UTC(2026, 9, 18, 19, 15, 0)

type Step = Readonly<{ placeMs: number; wallClockMs: number }>

type Heard = readonly [StretchState, ReadonlyArray<StretchEvent>]

const heard = (
  state: StretchState,
  steps: ReadonlyArray<Step>,
  speed: Speed = 1,
): Heard => {
  const initial: Heard = [state, []]
  return Array.reduce(
    steps,
    initial,
    ([current, events], { placeMs, wallClockMs }): Heard => {
      const [next, more] = reachedPlace(current, {
        placeMs: Milliseconds.make(placeMs),
        wallClockMs,
        speed,
      })
      return [next, [...events, ...more]]
    },
  )
}

const secondsFrom = (
  placeMs: number,
  count: number,
  speed = 1,
): ReadonlyArray<Step> =>
  Array.makeBy(count + 1, second => ({
    placeMs: placeMs + Math.round(second * 1000 * speed),
    wallClockMs: startMs + second * 1000,
  }))

const stretchAt = (
  mediaStartMs: number,
  lastPlaceMs: number,
  lastAtMs: number,
  speed: Speed = 1,
) => ({
  mediaStartMs: Milliseconds.make(mediaStartMs),
  startedAtMs: startMs,
  speed,
  lastPlaceMs: Milliseconds.make(lastPlaceMs),
  lastAtMs,
})

describe('a stretch of listening', () => {
  it('opens at the first second the audio reports, and counts once it has played 3 s', () => {
    const [opened, none] = heard(Quiet(), secondsFrom(723_000, 2))
    expect(none).toEqual([])
    expect(opened).toEqual(
      Starting({ stretch: stretchAt(723_000, 725_000, startMs + 2_000) }),
    )
    const [begun, events] = heard(opened, [
      { placeMs: 726_000, wallClockMs: startMs + 3_000 },
    ])
    expect(begun).toEqual(
      Begun({ stretch: stretchAt(723_000, 726_000, startMs + 3_000) }),
    )
    expect(events).toEqual([
      {
        _tag: 'StretchBegan',
        stretch: stretchAt(723_000, 726_000, startMs + 3_000),
      },
    ])
    expect(
      heard(begun, [{ placeMs: 727_000, wallClockMs: startMs + 4_000 }])[1],
    ).toEqual([])
  })

  it('ends where the audio was last heard when it pauses, with the reason', () => {
    const [playing] = heard(Quiet(), secondsFrom(723_000, 89))
    expect(stoppedAt(playing, 'Paused')).toEqual([
      Quiet(),
      [
        {
          _tag: 'StretchEnded',
          stretch: stretchAt(723_000, 812_000, startMs + 89_000),
          end: {
            mediaEndMs: Milliseconds.make(812_000),
            endedAtMs: startMs + 89_000,
            reason: 'Paused',
          },
        },
      ],
    ])
  })

  it('is no stretch at all when it played under 3 s, as a tap on Play then Pause', () => {
    const [briefly] = heard(Quiet(), secondsFrom(0, 2))
    expect(stoppedAt(briefly, 'Paused')).toEqual([Quiet(), []])
    expect(stoppedAt(Quiet(), 'Paused')).toEqual([Quiet(), []])
  })

  it('ends at a jump of more than 2 s from where the clock and the speed put it, and opens the next', () => {
    const [playing] = heard(Quiet(), secondsFrom(723_000, 10))
    const [next, events] = heard(playing, [
      { placeMs: 900_000, wallClockMs: startMs + 11_000 },
    ])
    expect(events).toEqual([
      {
        _tag: 'StretchEnded',
        stretch: stretchAt(723_000, 733_000, startMs + 10_000),
        end: {
          mediaEndMs: Milliseconds.make(733_000),
          endedAtMs: startMs + 10_000,
          reason: 'Seeked',
        },
      },
    ])
    expect(next).toEqual(
      Starting({
        stretch: {
          mediaStartMs: Milliseconds.make(900_000),
          startedAtMs: startMs + 11_000,
          speed: 1,
          lastPlaceMs: Milliseconds.make(900_000),
          lastAtMs: startMs + 11_000,
        },
      }),
    )
  })

  it('keeps one stretch at 1.5× when the audio moves at that speed', () => {
    const [playing, events] = heard(Quiet(), secondsFrom(0, 20, 1.5), 1.5)
    expect(playing._tag).toBe('Begun')
    expect(Array.map(events, event => event._tag)).toEqual(['StretchBegan'])
  })

  it('ends at the end of the book, at its length, the moment it reached it', () => {
    const [playing] = heard(Quiet(), secondsFrom(4_790_000, 9))
    expect(finishedAt(playing, Milliseconds.make(4_800_000))).toEqual([
      Quiet(),
      [
        {
          _tag: 'StretchEnded',
          stretch: stretchAt(4_790_000, 4_799_000, startMs + 9_000),
          end: {
            mediaEndMs: Milliseconds.make(4_800_000),
            endedAtMs: startMs + 10_000,
            reason: 'Ended',
          },
        },
      ],
    ])
  })
})

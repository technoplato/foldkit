import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  Device,
  Free,
  Sampled,
  Settled,
  Step,
  Synced,
  arrived,
  defaultPace,
  due,
  empty,
  isSynced,
  slotTold,
  told,
} from './pace.js'

// Made-up fields and drags: nothing here is from a real screen.

type Arrival = Parameters<typeof arrived>[1]

const typed = (atMs: number): Arrival => ({
  part: 'Search',
  key: 'Search.Typed',
  sync: Settled({ afterMs: defaultPace.typingSettleMs }),
  atMs,
})

const dragged = (atMs: number, everyMs: number): Arrival => ({
  part: 'Canvas',
  key: 'Canvas.DraggedTo',
  sync: Sampled({ everyMs }),
  atMs,
})

const writtenThrough = (
  arrivals: ReadonlyArray<Arrival>,
  untilMs: number,
): ReadonlyArray<string> => {
  const folded = Array.reduce(
    arrivals,
    { queue: empty, written: Array.empty<string>() },
    (state, arrival) => {
      const waited = due(state.queue, arrival.atMs)
      const next = arrived(waited.queue, arrival)
      return {
        queue: next.queue,
        written: [...state.written, ...waited.write, ...next.write],
      }
    },
  )
  return [...folded.written, ...due(folded.queue, untilMs).write]
}

describe('typing settles', () => {
  it('writes one row for a burst of five, 200 ms after the last, with the field never left', () => {
    const burst = Array.map([0, 60, 120, 180, 240], typed)
    expect(writtenThrough(burst, 439)).toEqual([])
    expect(writtenThrough(burst, 440)).toEqual(['Search.Typed'])
  })

  it('says when to look again while a keystroke waits', () => {
    const { queue } = arrived(empty, typed(1000))
    expect(due(queue, 1050).maybeNextAtMs).toEqual(Option.some(1200))
    expect(due(due(queue, 1200).queue, 1200).maybeNextAtMs).toEqual(
      Option.none(),
    )
  })

  it('writes a waiting keystroke before a synced Message of the same part, then that Message', () => {
    const { queue } = arrived(empty, typed(0))
    const submitted = arrived(queue, {
      part: 'Search',
      key: 'Search.Submitted',
      sync: Synced(),
      atMs: 50,
    })
    expect(submitted.write).toEqual(['Search.Typed', 'Search.Submitted'])
    expect(due(submitted.queue, 5000).write).toEqual([])
  })

  it('writes a waiting keystroke before a synced Message of any part, such as the Send that read it', () => {
    const { queue } = arrived(empty, typed(0))
    const elsewhere = arrived(queue, {
      part: 'Composer',
      key: 'Composer.Send',
      sync: Synced(),
      atMs: 50,
    })
    expect(elsewhere.write).toEqual(['Search.Typed', 'Composer.Send'])
    expect(due(elsewhere.queue, 200).write).toEqual([])
  })

  it('never writes a Message that stays on the device', () => {
    const held = arrived(empty, {
      part: 'Shelf',
      key: 'Hold.PressedDown',
      sync: Device({ because: 'InputInProgress' }),
      atMs: 0,
    })
    expect(held.write).toEqual([])
    expect(due(held.queue, 60_000).write).toEqual([])
  })
})

describe('a free drag is sampled', () => {
  const everyFrame = (everyMs: number): ReadonlyArray<Arrival> =>
    Array.map(Array.range(0, 187), frame =>
      dragged(Math.round(frame * 16), everyMs),
    )

  it('writes at most 61 rows for three seconds at the default rate', () => {
    const rows = writtenThrough(everyFrame(defaultPace.dragSampleMs), 3000)
    expect(rows.length).toBeLessThanOrEqual(61)
    expect(rows.length).toBeGreaterThan(40)
  })

  it('writes at most 13 for the same drag when a part sets 250 ms', () => {
    const rows = writtenThrough(everyFrame(250), 3000)
    expect(rows.length).toBeLessThanOrEqual(13)
    expect(rows.length).toBeGreaterThan(10)
  })

  it('writes the first sample at once, so a drag shows as it starts', () => {
    expect(arrived(empty, dragged(0, 50)).write).toEqual(['Canvas.DraggedTo'])
  })

  it('always writes the drop, after the newest sample that waited', () => {
    const first = arrived(empty, dragged(0, 50))
    const second = arrived(first.queue, dragged(16, 50))
    const dropped = arrived(second.queue, {
      part: 'Canvas',
      key: 'Canvas.Dropped',
      sync: Synced(),
      atMs: 20,
    })
    expect(second.write).toEqual([])
    expect(dropped.write).toEqual(['Canvas.DraggedTo', 'Canvas.Dropped'])
  })
})

describe('a drag with a grain tells each step once', () => {
  const toldAlong = (
    grain: Parameters<typeof told>[0],
    samples: ReadonlyArray<number>,
    start: number,
  ): ReadonlyArray<number> =>
    Array.reduce(
      samples,
      { toldValue: start, all: Array.empty<number>() },
      (state, sample) =>
        Option.match(told(grain, state.toldValue, sample), {
          onNone: () => state,
          onSome: value => ({ toldValue: value, all: [...state.all, value] }),
        }),
    ).all

  it('a slider with a step of 5 dragged from 0 to 12 tells 5 and 10', () => {
    expect(
      toldAlong(Step({ size: 5, origin: 0 }), Array.range(0, 12), 0),
    ).toEqual([5, 10])
  })

  it('a seek bar tells one value for each whole second crossed', () => {
    expect(
      toldAlong(
        Step({ size: 1000, origin: 0 }),
        [10, 400, 999, 1000, 1700, 2001, 2999],
        0,
      ),
    ).toEqual([1000, 2000])
  })

  it('a drag back tells the steps on the way back', () => {
    expect(toldAlong(Step({ size: 5, origin: 0 }), [12, 9, 4, 0], 10)).toEqual([
      5, 0,
    ])
  })

  it('counts its steps from the slider’s lowest value', () => {
    expect(
      toldAlong(Step({ size: 5, origin: 3 }), [4, 7, 8, 12, 13.5], 3),
    ).toEqual([8, 13])
  })

  it('lands on the step a fraction means', () => {
    expect(toldAlong(Step({ size: 0.1, origin: 0 }), [0.3], 0)).toEqual([0.3])
  })

  it('a free drag tells every sample that moved', () => {
    expect(toldAlong(Free(), [3, 3, 4.5], 0)).toEqual([3, 4.5])
  })

  it('a row dragged across three slots tells three', () => {
    const over = ['first', 'first', 'second', 'second', 'third', 'third']
    const slots = Array.reduce(
      over,
      { maybeTold: Option.none<string>(), all: Array.empty<string>() },
      (state, slot) =>
        Option.match(slotTold(state.maybeTold, slot), {
          onNone: () => state,
          onSome: next => ({
            maybeTold: Option.some(next),
            all: [...state.all, next],
          }),
        }),
    ).all
    expect(slots).toEqual(['first', 'second', 'third'])
  })
})

describe('the defaults are the quick end', () => {
  it('settles typing after 200 ms, samples a free drag every 50 ms, and steps by 1', () => {
    expect(defaultPace).toEqual({
      typingSettleMs: 200,
      dragGrain: Step({ size: 1, origin: 0 }),
      dragSampleMs: 50,
    })
  })

  it('counts everything but a device Message as synced', () => {
    expect(isSynced(Synced())).toBe(true)
    expect(isSynced(Settled({ afterMs: 200 }))).toBe(true)
    expect(isSynced(Sampled({ everyMs: 50 }))).toBe(true)
    expect(isSynced(Device({ because: 'Secret' }))).toBe(false)
  })
})

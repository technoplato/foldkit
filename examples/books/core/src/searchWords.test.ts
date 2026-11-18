import { Array, Effect, Fiber, Option, Stream } from 'effect'
import {
  type SearchReading,
  TranscriptSource,
} from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'

import { MediaId, Milliseconds } from './ids.js'
import { instantTranscriptSource, searchPartsOf } from './instantTranscript.js'

const hourMs = 3_600_000

const sixteenHoursMs = Milliseconds.make(16 * hourMs)

const mediaId = MediaId.make('the-lantern-keeper-long')

type Asked = Readonly<{
  fromMs: number
  maybeToMs: Option.Option<number>
  answer: (rows: ReadonlyArray<unknown>) => void
  refuse: () => void
}>

type PartQuery = Readonly<{
  librarySegments: Readonly<{
    $: Readonly<{
      where: Readonly<{
        and: ReadonlyArray<
          Readonly<{
            relativeStartMs: Readonly<{ $gte?: number; $lt?: number }>
          }>
        >
      }>
    }>
  }>
}>

/** An Instant that holds each request open until a test answers it. */
const heldInstant = () => {
  const asked: Array<Asked> = []
  const database = {
    queryOnce: (query: PartQuery) =>
      new Promise((resolve, reject) => {
        const bounds = query.librarySegments.$.where.and
        asked.push({
          fromMs: Array.reduce(
            bounds,
            0,
            (found, bound) => bound.relativeStartMs.$gte ?? found,
          ),
          maybeToMs: Array.findFirst(bounds, bound =>
            Option.fromNullishOr(bound.relativeStartMs.$lt),
          ),
          answer: rows => {
            resolve({ data: { librarySegments: rows } })
          },
          refuse: () => {
            reject(new Error('offline'))
          },
        })
      }),
  }
  return { asked, database }
}

const segmentAt = (startMs: number, text: string) => ({
  id: `segment-${startMs.toString()}`,
  relativeStartMs: startMs,
  relativeEndMs: startMs + 60_000,
  wordsJSON: JSON.stringify([
    { text, relativeStartMs: startMs + 100, relativeEndMs: startMs + 500 },
  ]),
})

/** Waits until `isSo` holds, looking every few milliseconds, a second at most. */
const until = async (isSo: () => boolean): Promise<void> => {
  const tries = Array.range(1, 200)
  for (const _ of tries) {
    if (isSo()) {
      return
    }
    await new Promise(resolve => {
      setTimeout(resolve, 5)
    })
  }
}

const sourceOf = (database: unknown, now: () => number = () => 0) =>
  instantTranscriptSource(
    // NOTE: the fake answers only `queryOnce`, the one call a search makes.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    database as ProgramLogDatabase,
    { now },
  )

const reading = (
  words: ReturnType<typeof sourceOf>,
  seen: Array<SearchReading>,
) =>
  Effect.runFork(
    Effect.gen(function* () {
      const source = yield* TranscriptSource
      yield* Stream.runForEach(
        source.searchWordsOf(mediaId, sixteenHoursMs),
        each => Effect.sync(() => seen.push(each)),
      )
    }).pipe(Effect.provide(words)),
  )

const held = (words: ReturnType<typeof sourceOf>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const source = yield* TranscriptSource
      return yield* source.passagesMatching(mediaId, 'lamp')
    }).pipe(Effect.provide(words)),
  )

describe('the words for a search, from Instant, in parts', () => {
  it('splits a long title into parts of about two and a half hours, eight at most', () => {
    expect(searchPartsOf(Milliseconds.make(20 * 60_000))).toBe(1)
    expect(searchPartsOf(sixteenHoursMs)).toBe(7)
    expect(searchPartsOf(Milliseconds.make(60 * hourMs))).toBe(8)
  })

  it('asks for every part at once, says how many are in as each lands, and holds what is in', async () => {
    const { asked, database } = heldInstant()
    const words = sourceOf(database)
    const seen: Array<SearchReading> = []
    const fiber = reading(words, seen)
    await until(() => asked.length === 7 && seen.length === 1)
    expect(asked.length).toBe(7)
    expect(Array.map(asked, each => Option.isSome(each.maybeToMs))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
    ])
    expect(seen).toEqual([{ partsRead: 0, partsTotal: 7 }])
    expect(await held(words)).toEqual({
      passages: [],
      partsRead: 0,
      partsTotal: 7,
    })
    asked[4]?.answer([segmentAt(asked[4].fromMs + 1_000, 'lamp')])
    await until(() => seen.length === 2)
    expect(seen).toEqual([
      { partsRead: 0, partsTotal: 7 },
      { partsRead: 1, partsTotal: 7 },
    ])
    asked[0]?.answer([segmentAt(2_000, 'dusk')])
    await until(() => seen.length === 3)
    const some = await held(words)
    expect(some.partsRead).toBe(2)
    expect(
      Array.map(some.passages, passage =>
        Array.map(passage.words, word => word.text),
      ),
    ).toEqual([['dusk'], ['lamp']])
    Array.forEach(asked, (each, index) => {
      if (index !== 0 && index !== 4) {
        each.answer([])
      }
    })
    await until(() => seen.length === 8)
    expect(Array.last(seen)).toEqual(
      Option.some({ partsRead: 7, partsTotal: 7 }),
    )
    await Effect.runPromise(Fiber.interrupt(fiber))
  })

  it('asks nothing for a title whose words it still holds, and reads again ten minutes after the last listener left', async () => {
    const clock = { nowMs: 0 }
    const { asked, database } = heldInstant()
    const words = sourceOf(database, () => clock.nowMs)
    const first: Array<SearchReading> = []
    const fiber = reading(words, first)
    await until(() => asked.length === 7)
    Array.forEach(asked, each => {
      each.answer([])
    })
    await until(() => first.length === 8)
    await Effect.runPromise(Fiber.interrupt(fiber))
    clock.nowMs = 9 * 60_000
    const second: Array<SearchReading> = []
    const again = reading(words, second)
    await until(() => second.length === 1)
    expect(asked.length).toBe(7)
    expect(second).toEqual([{ partsRead: 7, partsTotal: 7 }])
    await Effect.runPromise(Fiber.interrupt(again))
    clock.nowMs = 9 * 60_000 + 11 * 60_000
    expect((await held(words)).partsTotal).toBe(0)
    const third: Array<SearchReading> = []
    const later = reading(words, third)
    await until(() => third.length === 1 && asked.length === 14)
    expect(asked.length).toBe(14)
    expect(third).toEqual([{ partsRead: 0, partsTotal: 7 }])
    await Effect.runPromise(Fiber.interrupt(later))
  })

  it('keeps the parts that landed when the search closes, and asks only for the rest next time', async () => {
    const { asked, database } = heldInstant()
    const words = sourceOf(database)
    const before: Array<SearchReading> = []
    const fiber = reading(words, before)
    await until(() => asked.length === 7)
    asked[0]?.answer([segmentAt(2_000, 'dusk')])
    asked[1]?.answer([])
    await until(() => before.length === 3)
    await Effect.runPromise(Fiber.interrupt(fiber))
    const seen: Array<SearchReading> = []
    const again = reading(words, seen)
    await until(() => seen.length === 1 && asked.length === 12)
    expect(seen).toEqual([{ partsRead: 2, partsTotal: 7 }])
    expect(asked.length).toBe(7 + 5)
    await Effect.runPromise(Fiber.interrupt(again))
  })

  it('fails as a fact when a part cannot be read', async () => {
    const { asked, database } = heldInstant()
    const words = sourceOf(database)
    const outcome = Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* TranscriptSource
        return yield* Effect.flip(
          Stream.runDrain(source.searchWordsOf(mediaId, sixteenHoursMs)),
        )
      }).pipe(Effect.provide(words)),
    )
    await until(() => asked.length === 7)
    asked[2]?.refuse()
    expect((await outcome).reason).toBe('the transcript could not be read')
  })
})

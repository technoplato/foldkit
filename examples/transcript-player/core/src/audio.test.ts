import { Array, Duration, Effect, Fiber, Option, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

import { Track, countedSound } from './audio.js'
import { MediaId, Milliseconds } from './ids.js'

const startedAtMs = Date.UTC(2026, 9, 18, 19, 5, 0)

const track = Track.make({
  mediaId: MediaId.make('evocation'),
  cue: 1,
  fromMs: Milliseconds.make(12_000),
  durationMs: Milliseconds.make(15_000),
  maybeAudioUrl: Option.none(),
})

describe('the counted audio output', () => {
  it('reports each second it reaches with the moment it reached it, then the end', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(startedAtMs)
        const fiber = yield* Effect.forkChild(
          Stream.runCollect(countedSound(track, () => 1)),
        )
        yield* TestClock.adjust(Duration.seconds(3))
        const events = Array.fromIterable(yield* Fiber.join(fiber))
        expect(events).toEqual([
          {
            _tag: 'Advanced',
            placeMs: 13_000,
            wallClockMs: startedAtMs + 1000,
          },
          {
            _tag: 'Advanced',
            placeMs: 14_000,
            wallClockMs: startedAtMs + 2000,
          },
          {
            _tag: 'Advanced',
            placeMs: 15_000,
            wallClockMs: startedAtMs + 3000,
          },
          { _tag: 'Ended' },
        ])
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    ))
})

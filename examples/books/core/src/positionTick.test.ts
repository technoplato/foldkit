import { Interaction, Processor } from 'foldkit'
import * as TranscriptPlayer from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import { Milliseconds } from './ids.js'
import { startMadeUpBooks } from './madeUp.js'
import { Loaded } from './model.js'
import { SyncedBooks, bindBooks, whenShelfOpened } from './synced.js'

// NOTE: While a title plays, the place arrives once a second. It changes
// one number. Making the loaded title again for it checked and copied
// everything the player holds, the words and sections of a sixteen-hour
// book: about 0.8 ms of a 0.82 ms update here, and about 19 ms on a
// phone's engine, every second.

const settleMs = 5_000

const playing = async () => {
  const handle = await startMadeUpBooks({
    host: Processor.Host.ExpoIos(),
    shelf: 'Long',
  })
  const bound = bindBooks(handle)
  await Interaction.whenSettled(bound, settleMs)
  await whenShelfOpened(handle, settleMs)
  expect(bound.press('Listen:the-long-way-round')).toBe(true)
  const deadline = Date.now() + settleMs
  const playerOf = (model: ReturnType<typeof handle.readModel>) =>
    model._tag === 'Ready' && model.listening._tag === 'Loaded'
      ? model.listening.player
      : undefined
  while (
    playerOf(handle.readModel())?.transcript._tag !== 'TranscriptLoaded' &&
    Date.now() < deadline
  ) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  const model = handle.readModel()
  await handle.stop()
  return { model, playerOf }
}

describe('a position tick while a long title plays', () => {
  it('moves the place and leaves everything else the player holds as the very same objects', async () => {
    const { model, playerOf } = await playing()
    const before = playerOf(model)
    expect(before?.transcript._tag).toBe('TranscriptLoaded')
    const [ticked] = SyncedBooks.update(
      model,
      TranscriptPlayer.ReachedPlace({
        placeMs: Milliseconds.make(4_000),
        wallClockMs: 1_795_000_000_000,
      }),
    )
    const after = playerOf(ticked)
    expect(after?.transcript).toBe(before?.transcript)
    expect(after?.media).toBe(before?.media)
    expect(
      after === undefined ? undefined : TranscriptPlayer.currentPlaceOf(after),
    ).toBe(4_000)
    expect(ticked._tag === 'Ready' ? ticked.library : undefined).toBe(
      model._tag === 'Ready' ? model.library : undefined,
    )
  })

  it('costs a small part of what making the loaded title again costs, however busy the machine', async () => {
    const { model } = await playing()
    const tick = TranscriptPlayer.ReachedPlace({
      placeMs: Milliseconds.make(4_000),
      wallClockMs: 1_795_000_000_000,
    })
    const loaded =
      model._tag === 'Ready' && model.listening._tag === 'Loaded'
        ? model.listening
        : undefined
    expect(loaded).toBeDefined()
    const timed = (run: () => unknown): number => {
      const times = 300
      for (let warm = 0; warm < 100; warm += 1) {
        run()
      }
      const startedAt = performance.now()
      for (let index = 0; index < times; index += 1) {
        run()
      }
      return (performance.now() - startedAt) / times
    }
    // What a tick cost before: the loaded title made again, which checks
    // and copies everything the player holds. Both are timed in the same
    // run, so a busy machine slows them alike.
    const made = timed(() => (loaded === undefined ? loaded : Loaded(loaded)))
    const each = timed(() => SyncedBooks.update(model, tick))
    expect(each).toBeLessThan(made / 3)
  })
})

// NOTE: A device that takes longer over a tick than a second fell behind:
// on 2026-11-19 an iPad was taking places 10 to 14 seconds after the
// audio reported them, and a pause from the terminal waited behind them.
// The whole Program, as every Client runs it, says a newer place makes a
// waiting one pointless, so the runtime keeps one.
describe('the places the player reports, as the whole Program queues them', () => {
  const place = (seconds: number) =>
    TranscriptPlayer.ReachedPlace({
      placeMs: Milliseconds.make(seconds * 1_000),
      wallClockMs: 1_795_000_000_000 + seconds * 1_000,
    })
  const clock = SyncedBooks.subscriptions?.['clock']

  it('lets a newer place take a waiting place’s turn', () => {
    expect(clock?.supersedes?.(place(4), place(5))).toBe(true)
  })

  it('never lets a place take the turn of the end, of a failure, or the other way round', () => {
    const end = TranscriptPlayer.ReachedEnd()
    const failure = TranscriptPlayer.FailedPlayAudio({ reason: 'no sound' })
    expect(clock?.supersedes?.(end, place(5))).toBe(false)
    expect(clock?.supersedes?.(failure, place(5))).toBe(false)
    expect(clock?.supersedes?.(place(4), end)).toBe(false)
  })

  it('says nothing of the kind for the shelf, whose every fact must be taken', () => {
    expect(SyncedBooks.subscriptions?.['shelf']?.supersedes).toBeUndefined()
  })
})

import { Array, Effect, Layer, Option, Stream } from 'effect'
import { Interaction, Runtime } from 'foldkit'
import {
  AudioEvent,
  AudioOutput,
  noTranscripts,
} from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import { Milliseconds, TitleSlug } from './ids.js'
import { InProgress, chaptersOf, placeOf } from './model.js'
import {
  makeTestLibraryStore,
  makeTestScribeTimeline,
  noReadAloud,
  noScribeTimeline,
  sampleShelf,
} from './sample.js'
import type { UnendedPlay } from './scribeTimeline.js'
import { makeTestLinkSharing } from './share.js'
import { SyncedBooks, bindBooks } from './synced.js'

const pollMs = 10
const pollAttempts = 200

const eventually = async (
  isDone: () => boolean,
  attemptsLeft = pollAttempts,
): Promise<void> => {
  if (isDone()) {
    return
  } else if (attemptsLeft === 0) {
    throw new Error('never happened')
  } else {
    await new Promise(resolve => setTimeout(resolve, pollMs))
    return eventually(isDone, attemptsLeft - 1)
  }
}

const quickAudio = Layer.succeed(AudioOutput, {
  sound: track =>
    Stream.make(
      AudioEvent.Advanced({
        placeMs: Milliseconds.make(track.fromMs + 5_000),
        wallClockMs: Date.now(),
      }),
      AudioEvent.Advanced({
        placeMs: Milliseconds.make(track.fromMs + 35_000),
        wallClockMs: Date.now(),
      }),
    ),
})

const startBooks = async () => {
  const store = await Effect.runPromise(makeTestLibraryStore(sampleShelf))
  const sharing = await Effect.runPromise(makeTestLinkSharing())
  const handle = Runtime.startHandle({
    program: SyncedBooks,
    sync: Runtime.Memory({ processor: 'books-test' }),
    resources: Layer.mergeAll(
      store.layer,
      quickAudio,
      noTranscripts,
      sharing.layer,
      noReadAloud,
      noScribeTimeline,
    ),
  })
  return { store, handle, bound: bindBooks(handle) }
}

describe('live Books', () => {
  it('loads the chapters of the title in the player, and the player takes them as sections', async () => {
    const { handle, bound } = await startBooks()
    await Interaction.whenSettled(bound, 2_000)
    await eventually(() =>
      Array.some(
        bound.entries(),
        entry =>
          entry.tag === 'Listen' && entry.availability._tag === 'Enabled',
      ),
    )
    const before = handle.readModel()
    expect(before._tag === 'Ready' ? before.chapters : {}).toEqual({})
    bound.press('Listen:the-lantern-keeper')
    await eventually(() => {
      const model = handle.readModel()
      return (
        model._tag === 'Ready' &&
        Option.isSome(chaptersOf(model, TitleSlug.make('the-lantern-keeper')))
      )
    })
    const model = handle.readModel()
    expect(
      model._tag === 'Ready' && model.listening._tag === 'Loaded'
        ? Array.map(
            model.listening.player.media.sections,
            section => section.title,
          )
        : [],
    ).toEqual(['The Tide', 'The Light', 'The Storm', 'The Keeper'])
    await handle.stop()
  })

  it('reads the shelf, plays, and saves the place to the library store', async () => {
    const { store, handle, bound } = await startBooks()
    await Interaction.whenSettled(bound, 2_000)
    await eventually(() =>
      Array.some(
        bound.entries(),
        entry =>
          entry.tag === 'Listen' && entry.availability._tag === 'Enabled',
      ),
    )
    bound.press('Listen:the-lantern-keeper')
    await eventually(() => {
      const model = handle.readModel()
      return (
        model._tag === 'Ready' &&
        model.listening._tag === 'Loaded' &&
        placeOf(model.listening) === 35_000
      )
    })
    await eventually(() =>
      Array.isReadonlyArrayNonEmpty(Effect.runSync(store.writes)),
    )
    const writes = await Effect.runPromise(store.writes)
    expect(Array.map(writes, write => write._tag)).toEqual(['SavePlace'])
    const shelf = await Effect.runPromise(store.shelf)
    expect(
      Option.map(Array.head(shelf.progress), progress => progress._tag),
    ).toEqual(Option.some('InProgress'))
    await handle.stop()
  })

  it('tells Scribe’s timeline what it plays: the start 3 s in, the end at the pause', async () => {
    const heardFromMs = Date.UTC(2026, 9, 18, 19, 30, 0)
    const secondsHeard = 6
    const timedAudio = Layer.succeed(AudioOutput, {
      sound: track =>
        Stream.concat(
          Stream.fromIterable(
            Array.makeBy(secondsHeard, second =>
              AudioEvent.Advanced({
                placeMs: Milliseconds.make(track.fromMs + second * 1000),
                wallClockMs: heardFromMs + second * 1000,
              }),
            ),
          ),
          Stream.never,
        ),
    })
    const store = await Effect.runPromise(makeTestLibraryStore(sampleShelf))
    const sharing = await Effect.runPromise(makeTestLinkSharing())
    const timeline = await Effect.runPromise(makeTestScribeTimeline())
    const handle = Runtime.startHandle({
      program: SyncedBooks,
      sync: Runtime.Memory({ processor: 'books-timeline-test' }),
      resources: Layer.mergeAll(
        store.layer,
        timedAudio,
        noTranscripts,
        sharing.layer,
        noReadAloud,
        timeline.layer,
      ),
    })
    const bound = bindBooks(handle)
    await Interaction.whenSettled(bound, 2_000)
    await eventually(() =>
      Array.some(
        bound.entries(),
        entry =>
          entry.tag === 'Listen' && entry.availability._tag === 'Enabled',
      ),
    )
    const reportTags = () =>
      Array.map(Effect.runSync(timeline.reports), ({ event }) => event._tag)
    bound.press('Listen:the-lantern-keeper')
    await eventually(() => Array.isReadonlyArrayNonEmpty(reportTags()))
    bound.press('Pause')
    await eventually(() => reportTags().length === 2)
    const reports = Effect.runSync(timeline.reports)
    expect(reportTags()).toEqual(['StretchBegan', 'StretchEnded'])
    expect(Array.map(reports, ({ title }) => title.slug)).toEqual([
      'the-lantern-keeper',
      'the-lantern-keeper',
    ])
    expect(Option.map(Array.last(reports), ({ event }) => event)).toEqual(
      Option.some({
        _tag: 'StretchEnded',
        stretch: {
          mediaStartMs: 0,
          startedAtMs: heardFromMs,
          speed: 1,
          lastPlaceMs: (secondsHeard - 1) * 1000,
          lastAtMs: heardFromMs + (secondsHeard - 1) * 1000,
        },
        end: {
          mediaEndMs: (secondsHeard - 1) * 1000,
          endedAtMs: heardFromMs + (secondsHeard - 1) * 1000,
          reason: 'Paused',
        },
      }),
    )
    const model = handle.readModel()
    expect(
      model._tag === 'Ready' ? model.maybeTimelineProblem : 'not ready',
    ).toEqual(Option.none())
    await handle.stop()
  })

  it('ends a play a closed page left open once the shelf is here', async () => {
    const lantern = TitleSlug.make('the-lantern-keeper')
    const playedAtMs = Date.now() - 7_200_000
    const play: UnendedPlay = {
      playId: 'play-1',
      recording: {
        recordingId: 'recording-1',
        ownerUserId: 'owner-1',
        clock: { startedAtMs: playedAtMs - 600_000, gaps: [] },
        durationSeconds: 3_600,
        status: 'Listed',
      },
      mediaKey: 'audiobook:the-lantern-keeper',
      mediaStartSeconds: 60,
      startedAtMs: playedAtMs,
      playbackRate: 1,
      startSeconds: 600,
      startPayload: '{}',
      maybeNextPlayStartedAtMs: Option.none(),
    }
    const store = await Effect.runPromise(
      makeTestLibraryStore({
        ...sampleShelf,
        progress: [
          InProgress({
            slug: lantern,
            placeMs: Milliseconds.make(240_000),
            savedAtMs: playedAtMs + 180_000,
          }),
        ],
      }),
    )
    const sharing = await Effect.runPromise(makeTestLinkSharing())
    const timeline = await Effect.runPromise(makeTestScribeTimeline([play]))
    const handle = Runtime.startHandle({
      program: SyncedBooks,
      sync: Runtime.Memory({ processor: 'books-closing-test' }),
      resources: Layer.mergeAll(
        store.layer,
        Layer.succeed(AudioOutput, { sound: () => Stream.never }),
        noTranscripts,
        sharing.layer,
        noReadAloud,
        timeline.layer,
      ),
    })
    await eventually(() =>
      Array.isReadonlyArrayNonEmpty(Effect.runSync(timeline.closings)),
    )
    expect(Effect.runSync(timeline.closings)).toEqual([
      {
        play,
        mediaEndMs: 240_000,
        endedAtMs: playedAtMs + 180_000,
        reason: 'PageClosed',
      },
    ])
    await handle.stop()
  })
})

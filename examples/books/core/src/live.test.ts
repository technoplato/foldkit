import { Array, Effect, Layer, Option, Stream } from 'effect'
import { Interaction, Runtime } from 'foldkit'
import {
  AudioEvent,
  AudioOutput,
  noTranscripts,
} from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import { Milliseconds } from './ids.js'
import { makeTestLibraryStore, noReadAloud, sampleShelf } from './sample.js'
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
      AudioEvent.Advanced({ placeMs: Milliseconds.make(track.fromMs + 5_000) }),
      AudioEvent.Advanced({
        placeMs: Milliseconds.make(track.fromMs + 35_000),
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
    ),
  })
  return { store, handle, bound: bindBooks(handle) }
}

describe('live Books', () => {
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
        model.listening.player.placeMs === 35_000
      )
    })
    const writes = await Effect.runPromise(store.writes)
    expect(Array.map(writes, write => write._tag)).toEqual(['SavePlace'])
    const shelf = await Effect.runPromise(store.shelf)
    expect(
      Option.map(Array.head(shelf.progress), progress => progress._tag),
    ).toEqual(Option.some('InProgress'))
    await handle.stop()
  })
})

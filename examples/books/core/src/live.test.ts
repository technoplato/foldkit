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

const startProcessor = (
  processor: string,
  store: Effect.Success<ReturnType<typeof makeTestLibraryStore>>,
  memory: ReturnType<typeof Runtime.makeMemoryStore>,
) =>
  Effect.runPromise(makeTestLinkSharing()).then(sharing => {
    const handle = Runtime.startHandle({
      program: SyncedBooks,
      sync: Runtime.Memory({ processor, store: memory }),
      resources: Layer.mergeAll(
        store.layer,
        Layer.succeed(AudioOutput, { sound: () => Stream.never }),
        noTranscripts,
        sharing.layer,
        noReadAloud,
      ),
    })
    return { handle, bound: bindBooks(handle) }
  })

const uriOf = (bound: ReturnType<typeof bindBooks>): string =>
  Option.getOrElse(
    Option.map(bound.navigation(), plan => plan.uri),
    () => 'no plan',
  )

const loadedSlugOf = (bound: ReturnType<typeof bindBooks>) => {
  const model = bound.readModel()
  return model._tag === 'Ready' && model.listening._tag === 'Loaded'
    ? Option.some(model.listening.slug)
    : Option.none()
}

describe('live Books', () => {
  it('keeps a terminal on its own screen and player while a browser mirrors', async () => {
    const store = await Effect.runPromise(makeTestLibraryStore(sampleShelf))
    const memory = Runtime.makeMemoryStore()
    const browser = await startProcessor('react-ad55df2e', store, memory)
    const terminal = await startProcessor('cli-4f2a9c1e', store, memory)
    await Interaction.whenSettled(browser.bound, 2_000)
    await Interaction.whenSettled(terminal.bound, 2_000)
    await eventually(() =>
      Array.every([browser, terminal], ({ handle }) => {
        const model = handle.readModel()
        return model._tag === 'Ready' && model.library._tag === 'ShelfReady'
      }),
    )
    browser.bound.press('MirrorNavigation')
    await eventually(() => {
      const model = terminal.handle.readModel()
      return model._tag === 'Ready' && model.session.mode === 'Mirror'
    })
    terminal.bound.press('Listen:small-hours')
    browser.bound.press('Open:the-lantern-keeper')
    browser.bound.press('ShowContents')
    await eventually(
      () => uriOf(browser.bound) === '/books/the-lantern-keeper/contents',
    )
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(uriOf(terminal.bound)).toBe('/books/small-hours/listen/0s')
    expect(loadedSlugOf(terminal.bound)).toEqual(Option.some('small-hours'))
    expect(loadedSlugOf(browser.bound)).toEqual(Option.none())
    await browser.handle.stop()
    await terminal.handle.stop()
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
        model.listening.player.placeMs === 35_000
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
})

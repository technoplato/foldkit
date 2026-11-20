import { Duration, Effect, Layer, Option, Stream } from 'effect'
import { ActionMenu, Runtime } from 'foldkit'
import { AudioOutput, noTranscripts } from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import { TitleSlug } from './ids.js'
import { LibraryStore } from './library.js'
import { SetSpeed } from './message.js'
import {
  makeTestLibraryStore,
  noReadAloud,
  noScribeTimeline,
  sampleChapters,
  sampleShelf,
} from './sample.js'
import { makeTestLinkSharing } from './share.js'
import { SyncedBooks, bindBooks } from './synced.js'

const lanternKeeper = TitleSlug.make('the-lantern-keeper')

const idleResources = async () => {
  const sharing = await Effect.runPromise(makeTestLinkSharing())
  return Layer.mergeAll(
    Layer.succeed(LibraryStore, {
      shelf: Stream.never,
      chapters: () => Stream.never,
      member: Stream.never,
      savePlace: () => Effect.void,
      saveFinished: () => Effect.void,
      addBookmark: () => Effect.void,
      setBookmarkNote: () => Effect.void,
      removeBookmark: () => Effect.void,
    }),
    Layer.succeed(AudioOutput, { sound: () => Stream.never }),
    noTranscripts,
    sharing.layer,
    noReadAloud,
    noScribeTimeline,
  )
}

describe('Books force-close state restoration', () => {
  it('restores the warm shelf, chapters, open player screen, and paused player at 0 ms before network or LibraryStore answers', async () => {
    const syncStore = Runtime.makeMemoryStore()
    const snapshots = Runtime.LocalSnapshot.memory()
    const library = await Effect.runPromise(
      makeTestLibraryStore(sampleShelf, sampleChapters),
    )
    const sharing = await Effect.runPromise(makeTestLinkSharing())
    const liveResources = Layer.mergeAll(
      library.layer,
      Layer.succeed(AudioOutput, { sound: () => Stream.never }),
      noTranscripts,
      sharing.layer,
      noReadAloud,
      noScribeTimeline,
    )

    // Session 1: load shelf, open player for The Lantern Keeper (playing!), open action menu, then close.
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.start({
            program: SyncedBooks,
            sync: Runtime.Memory({ processor: 'expo-ios-run-1', store: syncStore }),
            resources: liveResources,
            localSnapshot: snapshots,
          })
          yield* runtime.caughtUp
          yield* Effect.sleep(Duration.millis(20))
          const handle = {
            readModel: () => runtime.readModel(),
            subscribe: runtime.observeModel,
            send: (message: Parameters<typeof runtime.send>[0]) => {
              runtime.send(message)
            },
            stop: () => Promise.resolve(),
          }
          const bound = bindBooks(handle)
          bound.press(`Listen:${lanternKeeper}`)
          yield* Effect.sleep(Duration.millis(20))
          yield* runtime.run(ActionMenu.OpenedActionMenu())
          const beforeClose = runtime.readModel()
          expect(beforeClose._tag).toBe('Ready')
          if (beforeClose._tag === 'Ready') {
            expect(beforeClose.library._tag).toBe('ShelfReady')
            expect(beforeClose.listening._tag).toBe('Loaded')
            if (beforeClose.listening._tag === 'Loaded') {
              expect(beforeClose.listening.player.transport._tag).toBe('Playing')
            }
          }
        }),
      ),
    )

    // Session 2: reopen completely offline (sync never answers, LibraryStore never emits).
    const offlineResources = await idleResources()
    const offlineEngine = Runtime.Memory({
      processor: 'expo-ios-run-2',
      store: syncStore,
    })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.start({
            program: SyncedBooks,
            sync: {
              ...offlineEngine,
              read: () => Effect.never,
              readSince: () => Effect.never,
            },
            resources: offlineResources,
            localSnapshot: snapshots,
          })
          const atBoot = runtime.readModel()
          expect(atBoot._tag).toBe('Ready')
          if (atBoot._tag === 'Ready') {
            expect(atBoot.library._tag).toBe('ShelfReady')
            if (atBoot.library._tag === 'ShelfReady') {
              expect(atBoot.library.shelf.titles).toHaveLength(
                sampleShelf.titles.length,
              )
            }
            expect(atBoot.listening._tag).toBe('Loaded')
            if (atBoot.listening._tag === 'Loaded') {
              expect(atBoot.listening.slug).toBe(lanternKeeper)
              // Restored player is paused so reopening never starts audio on its own.
              expect(atBoot.listening.player.transport._tag).toBe('Paused')
              expect(atBoot.listening.stretch._tag).toBe('Quiet')
            }
          }
          const bound = bindBooks({
            readModel: () => runtime.readModel(),
            subscribe: runtime.observeModel,
            send: message => {
              runtime.send(message)
            },
            stop: () => Promise.resolve(),
          })
          // Restored directly to the open player screen, with the transient action menu dismissed.
          expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
            Option.some(`/books/${lanternKeeper}/listen/0s`),
          )
          expect(bound.menu()).toEqual(Option.none())
        }),
      ),
    )

    // Session 3: another device changes speed while closed; Session 4 catches up without losing the open screen.
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const other = yield* Runtime.start({
            program: SyncedBooks,
            sync: Runtime.Memory({ processor: 'react-web-other', store: syncStore }),
            resources: liveResources,
            localSnapshot: Runtime.LocalSnapshot.disabled,
          })
          yield* other.caughtUp
          yield* other.run(SetSpeed({ speed: 1.5 }))
        }),
      ),
    )

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.start({
            program: SyncedBooks,
            sync: Runtime.Memory({ processor: 'expo-ios-run-3', store: syncStore }),
            resources: offlineResources,
            localSnapshot: snapshots,
          })
          yield* runtime.caughtUp
          yield* Effect.sleep(Duration.millis(10))
          const bound = bindBooks({
            readModel: () => runtime.readModel(),
            subscribe: runtime.observeModel,
            send: message => {
              runtime.send(message)
            },
            stop: () => Promise.resolve(),
          })
          const afterSync = runtime.readModel()
          expect(afterSync._tag).toBe('Ready')
          if (afterSync._tag === 'Ready') {
            expect(afterSync.library._tag).toBe('ShelfReady')
            expect(afterSync.listening._tag).toBe('Loaded')
          }
          expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
            Option.some(`/books/${lanternKeeper}/listen/0s`),
          )
        }),
      ),
    )
  })
})

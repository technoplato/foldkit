import {
  Array,
  Duration,
  Effect,
  Layer,
  Option,
  Record as Record_,
  Stream,
} from 'effect'
import { ActionMenu, Runtime } from 'foldkit'
import { AudioOutput, noTranscripts } from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'

import { TitleSlug } from './ids.js'
import { init } from './init.js'
import { chaptersQueryOf, makeInstantLibraryStore } from './instantLibrary.js'
import { LibraryStore } from './library.js'
import { SetSpeed } from './message.js'
import { ChaptersReady, ChaptersUnavailable } from './model.js'
import { BooksProgram } from './program.js'
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
      write: () => Effect.void,
    }),
    Layer.succeed(AudioOutput, { sound: () => Stream.never }),
    noTranscripts,
    sharing.layer,
    noReadAloud,
    noScribeTimeline,
  )
}

const waitTries = 200

const waitStepMs = 10

// NOTE: under a busy test run the shelf and the player arrive later than
// any fixed pause allows for, so each step waits for what it needs.
const waitedUntil = (isSo: () => boolean): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (const _ of Array.range(1, waitTries)) {
      if (isSo()) {
        return
      }
      yield* Effect.sleep(Duration.millis(waitStepMs))
    }
  })

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
            sync: Runtime.Memory({
              processor: 'expo-ios-run-1',
              store: syncStore,
            }),
            resources: liveResources,
            localSnapshot: snapshots,
          })
          yield* runtime.caughtUp
          yield* waitedUntil(() => {
            const model = runtime.readModel()
            return model._tag === 'Ready' && model.library._tag === 'ShelfReady'
          })
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
          yield* waitedUntil(() => {
            const model = runtime.readModel()
            return model._tag === 'Ready' && model.listening._tag === 'Loaded'
          })
          yield* runtime.run(ActionMenu.OpenedActionMenu())
          const beforeClose = runtime.readModel()
          expect(beforeClose._tag).toBe('Ready')
          if (beforeClose._tag === 'Ready') {
            expect(beforeClose.library._tag).toBe('ShelfReady')
            expect(beforeClose.listening._tag).toBe('Loaded')
            if (beforeClose.listening._tag === 'Loaded') {
              expect(beforeClose.listening.player.transport._tag).toBe(
                'Playing',
              )
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
            sync: Runtime.Memory({
              processor: 'react-web-other',
              store: syncStore,
            }),
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
            sync: Runtime.Memory({
              processor: 'expo-ios-run-3',
              store: syncStore,
            }),
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

  it('waits for the live Instant shelf on warm reopen instead of failing chapters with that title is not in the library', async () => {
    const newEarth = TitleSlug.make('a-new-earth')
    const itemRow = {
      id: 'item-1',
      addedAtMs: 1,
      book: [
        {
          id: 'book-of-item-1',
          title: 'A New Earth',
          authors: [{ name: 'Eckhart Tolle' }],
          narrators: [{ name: 'Eckhart Tolle' }],
          cover: [],
        },
      ],
      preferredAudio: [
        {
          id: 'rendition-1',
          durationMs: 2_400_000,
          files: [{ blob: [{ url: 'https://files.example/earth.m4b' }] }],
        },
      ],
    }
    const progressRow = {
      id: 'progress-1',
      relativeMs: 54_000,
      finishedKind: 'unfinished',
      startedAtMs: 1,
      updatedAtMs: 100,
      item: [{ id: 'item-1' }],
    }
    const makeFakeDb = () => {
      const subscriptions: Array<
        Readonly<{ query: unknown; respond: (response: unknown) => void }>
      > = []
      const database = {
        subscribeQuery: (
          query: unknown,
          respond: (response: unknown) => void,
        ) => {
          subscriptions.push({ query, respond })
          return () => undefined
        },
        subscribeAuth: () => () => undefined,
      }
      const queryFor = (table: string) =>
        Array.findFirst(subscriptions, subscription =>
          JSON.stringify(subscription.query).startsWith(`{"${table}"`),
        )
      return {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        database: database as unknown as ProgramLogDatabase,
        subscriptions,
        queryFor,
      }
    }
    const resourcesFor = (database: ProgramLogDatabase) =>
      Effect.gen(function* () {
        const sharing = yield* makeTestLinkSharing()
        return Layer.mergeAll(
          Layer.effect(LibraryStore, makeInstantLibraryStore(database)),
          Layer.succeed(AudioOutput, { sound: () => Stream.never }),
          noTranscripts,
          sharing.layer,
          noReadAloud,
          noScribeTimeline,
        )
      })
    const syncStore = Runtime.makeMemoryStore()
    const snapshots = Runtime.LocalSnapshot.memory()

    // Session 1: boot cold, answer live shelf + chapters, persist warm local snapshot on close.
    const fakeDb1 = makeFakeDb()
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const resources = yield* resourcesFor(fakeDb1.database)
          const runtime = yield* Runtime.start({
            program: SyncedBooks,
            sync: Runtime.Memory({
              processor: 'expo-ios-run-1',
              store: syncStore,
            }),
            resources,
            localSnapshot: snapshots,
          })
          yield* runtime.caughtUp
          yield* waitedUntil(
            () =>
              Option.isSome(fakeDb1.queryFor('libraryItems')) &&
              Option.isSome(fakeDb1.queryFor('libraryProgress')) &&
              Option.isSome(fakeDb1.queryFor('libraryBookmarks')),
          )
          Option.getOrThrow(fakeDb1.queryFor('libraryItems')).respond({
            data: { libraryItems: [itemRow] },
          })
          Option.getOrThrow(fakeDb1.queryFor('libraryProgress')).respond({
            data: { libraryProgress: [progressRow] },
          })
          Option.getOrThrow(fakeDb1.queryFor('libraryBookmarks')).respond({
            data: { libraryBookmarks: [] },
          })
          yield* waitedUntil(() =>
            Option.isSome(fakeDb1.queryFor('libraryChapters')),
          )
          Option.getOrThrow(fakeDb1.queryFor('libraryChapters')).respond({
            data: {
              libraryChapters: [
                {
                  id: 'book-of-item-1-chapter-0',
                  index: 0,
                  title: 'The Flowering of Human Consciousness',
                  startMs: 0,
                  endMs: 1_200_000,
                },
                {
                  id: 'book-of-item-1-chapter-1',
                  index: 1,
                  title: 'Ego: The Current State of Humanity',
                  startMs: 1_200_000,
                  endMs: 2_400_000,
                },
              ],
            },
          })
          yield* waitedUntil(() => {
            const model = runtime.readModel()
            return (
              model._tag === 'Ready' &&
              Option.exists(
                Record_.get(model.chapters, newEarth),
                state => state._tag === 'ChaptersReady',
              )
            )
          })
        }),
      ),
    )

    // Session 2: fresh Instant store with empty latest Ref reopens from the warm local snapshot.
    const fakeDb2 = makeFakeDb()
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const resources = yield* resourcesFor(fakeDb2.database)
          const runtime = yield* Runtime.start({
            program: SyncedBooks,
            sync: Runtime.Memory({
              processor: 'expo-ios-run-2',
              store: syncStore,
            }),
            resources,
            localSnapshot: snapshots,
          })
          yield* runtime.caughtUp
          // Give shelf and chapters subscriptions time to run before Instant answers.
          yield* Effect.sleep(Duration.millis(40))
          const whileWaiting = runtime.readModel()
          expect(whileWaiting._tag).toBe('Ready')
          if (whileWaiting._tag === 'Ready') {
            expect(
              Option.map(
                Record_.get(whileWaiting.chapters, newEarth),
                state => state._tag,
              ),
            ).toEqual(Option.some('ChaptersReady'))
          }

          yield* waitedUntil(
            () =>
              Option.isSome(fakeDb2.queryFor('libraryItems')) &&
              Option.isSome(fakeDb2.queryFor('libraryProgress')) &&
              Option.isSome(fakeDb2.queryFor('libraryBookmarks')),
          )
          Option.getOrThrow(fakeDb2.queryFor('libraryItems')).respond({
            data: { libraryItems: [itemRow] },
          })
          Option.getOrThrow(fakeDb2.queryFor('libraryProgress')).respond({
            data: { libraryProgress: [progressRow] },
          })
          Option.getOrThrow(fakeDb2.queryFor('libraryBookmarks')).respond({
            data: { libraryBookmarks: [] },
          })

          yield* waitedUntil(() =>
            Option.isSome(fakeDb2.queryFor('libraryChapters')),
          )
          const chaptersSubscription = Option.getOrThrow(
            fakeDb2.queryFor('libraryChapters'),
          )
          expect(chaptersSubscription.query).toEqual(
            chaptersQueryOf('book-of-item-1'),
          )
          chaptersSubscription.respond({
            data: {
              libraryChapters: [
                {
                  id: 'book-of-item-1-chapter-0',
                  index: 0,
                  title: 'Updated Chapter One',
                  startMs: 0,
                  endMs: 1_200_000,
                },
              ],
            },
          })
          yield* waitedUntil(() => {
            const model = runtime.readModel()
            if (model._tag !== 'Ready') {
              return false
            }
            const state = Record_.get(model.chapters, newEarth)
            return Option.exists(
              state,
              chapters =>
                chapters._tag === 'ChaptersReady' &&
                Array.headNonEmpty(chapters.chapters).name ===
                  'Updated Chapter One',
            )
          })
          const afterLive = runtime.readModel()
          expect(afterLive._tag).toBe('Ready')
          if (afterLive._tag === 'Ready') {
            expect(
              Option.map(Record_.get(afterLive.chapters, newEarth), state =>
                state._tag === 'ChaptersReady'
                  ? Array.map(state.chapters, chapter => chapter.name)
                  : [state.reason],
              ),
            ).toEqual(Option.some(['Updated Chapter One']))
          }
        }),
      ),
    )
  })

  it('drops ChaptersUnavailable entries in projectLocal while keeping ChaptersReady entries', () => {
    const [initial] = init()
    const readySlug = TitleSlug.make('the-lantern-keeper')
    const failedSlug = TitleSlug.make('small-hours')
    const readyChapters = Option.getOrThrow(
      Record_.get(sampleChapters, readySlug),
    )
    const modelWithBoth = {
      ...initial,
      chapters: Record_.fromEntries([
        [readySlug, ChaptersReady({ chapters: readyChapters })],
        [
          failedSlug,
          ChaptersUnavailable({ reason: 'that title is not in the library' }),
        ],
      ]),
    }
    const projectLocal = BooksProgram.synchronization?.projectLocal
    expect(projectLocal).toBeDefined()
    if (projectLocal !== undefined) {
      const projected = projectLocal(modelWithBoth)
      expect(Record_.has(projected.chapters, readySlug)).toBe(true)
      expect(Record_.has(projected.chapters, failedSlug)).toBe(false)
    }
  })
})

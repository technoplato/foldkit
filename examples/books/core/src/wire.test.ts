import { Effect, Layer, Option, Schema as S, Stream } from 'effect'
import { Runtime } from 'foldkit'
import { AudioOutput, noTranscripts } from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import { ChapterId, Speed } from './ids.js'
import { LibraryStore } from './library.js'
import { JumpToChapter, SetSpeed } from './message.js'
import { noReadAloud, noScribeTimeline } from './sample.js'
import { makeTestLinkSharing } from './share.js'
import { SyncedBooks } from './synced.js'
import { MessageWire } from './wire.js'

const idleResources = Effect.gen(function* () {
  const sharing = yield* makeTestLinkSharing()
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
})

describe('Books MessageWire', () => {
  it('round-trips JumpToChapter by chapterId', () => {
    const chapterId = ChapterId.make('1202837f-801f-5351-9997-ed544c007093')
    const encoded = S.encodeSync(MessageWire)(JumpToChapter({ chapterId }))
    expect(encoded.tag).toBe(
      'JumpToChapter:{"chapterId":"1202837f-801f-5351-9997-ed544c007093"}',
    )
    expect(S.decodeUnknownSync(MessageWire)(encoded)).toEqual(
      JumpToChapter({ chapterId }),
    )
  })

  it('decodes legacy JumpToChapter log rows that only carry chapterNumber', () => {
    const decoded = S.decodeUnknownSync(MessageWire)({
      id: 'legacy-row-1',
      tag: 'JumpToChapter:{"chapterNumber":3}',
      from: 'old-device',
      createdAtMs: 1_000,
    })
    expect(decoded._tag).toBe('JumpToChapter')
  })

  it('still fails closed on malformed JumpToChapter rows', () => {
    expect(
      S.decodeUnknownOption(MessageWire)({
        id: 'bad-1',
        tag: 'JumpToChapter:{"chapterNumber":0}',
        from: 'old-device',
        createdAtMs: 1_000,
      }),
    ).toEqual(Option.none())
    expect(
      S.decodeUnknownOption(MessageWire)({
        id: 'bad-2',
        tag: 'JumpToChapter:{}',
        from: 'old-device',
        createdAtMs: 1_000,
      }),
    ).toEqual(Option.none())
    expect(
      S.decodeUnknownOption(MessageWire)({
        id: 'bad-3',
        tag: 'JumpToChapter:{"chapterId":""}',
        from: 'new-device',
        createdAtMs: 1_000,
      }),
    ).toEqual(Option.none())
  })

  it('folds historical and live legacy JumpToChapter:{chapterNumber} sync rows cleanly', async () => {
    const store = Runtime.makeMemoryStore()
    store.messages.push(
      {
        id: 'row-1',
        tag: 'JumpToChapter:{"chapterNumber":3}',
        from: 'new-phone',
        createdAtMs: 1_000,
      },
      {
        ...S.encodeSync(MessageWire)(SetSpeed({ speed: Speed.make(1.5) })),
        id: 'row-2',
        from: 'new-phone',
        createdAtMs: 2_000,
      },
    )

    const engine = Runtime.Memory({ processor: 'new-phone', store })
    const decodeFailures: Array<unknown> = []

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const resources = yield* idleResources
          const runtime = yield* Runtime.start({
            program: SyncedBooks,
            sync: engine,
            resources,
          })
          runtime.observeSync(event => {
            if (event._tag === 'DroppedRow') {
              decodeFailures.push(event)
            }
          })
          yield* runtime.caughtUp

          const afterColdFold = runtime.readModel()
          expect(afterColdFold._tag).toBe('Ready')
          if (afterColdFold._tag === 'Ready') {
            expect(afterColdFold.speed).toBe(1.5)
          }

          engine.injectMessage({
            id: 'row-3',
            tag: 'JumpToChapter:{"chapterNumber":2}',
            from: 'legacy-phone',
            createdAtMs: 3_000,
          })
          yield* runtime.caughtUp

          const afterLiveRow = runtime.readModel()
          expect(afterLiveRow._tag).toBe('Ready')
          expect(decodeFailures).toEqual([])
        }),
      ),
    )
  })
})

import { Array, type Context, Effect, Layer } from 'effect'
import { type Processor, Runtime } from 'foldkit'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { MediaId, Milliseconds } from './ids.js'
import { LibraryStore } from './library.js'
import {
  makeTestLibraryStore,
  noReadAloud,
  noScribeTimeline,
  sampleShelf,
  sampleTitles,
} from './sample.js'
import { makeTestLinkSharing } from './share.js'
import type { BooksHandleOnHost } from './startConfig.js'
import { SyncedBooks } from './synced.js'

type LibraryStoreService = Context.Service.Shape<typeof LibraryStore>

// WORDS

// Made-up sentences: nothing here is from a real book or recording.
const madeUpSentences: ReadonlyArray<string> = [
  'The keeper climbed the stairs at dusk.',
  'He trimmed the wick and waited.',
  'Far out a bell answered the lamp.',
  'The tide came in slow and patient.',
  'Nobody on the shore was awake to see it.',
  'By morning the fog had gone and the lamp was cold.',
]

const wordMs = 400

const wordGapMs = 100

const passageGapMs = 1_500

const madeUpPassageCount = 120

type Passages = Readonly<{
  passages: ReadonlyArray<TranscriptPlayer.Passage>
  nextMs: number
}>

const noPassages: Passages = { passages: [], nextMs: 0 }

/**
 * Made-up words for a made-up title: the same few sentences over and
 * over, a passage each, every word half a second after the last, for the
 * first ten minutes or so. They are the words of no book.
 */
const madeUpPassages: ReadonlyArray<TranscriptPlayer.Passage> = Array.reduce(
  Array.range(0, madeUpPassageCount - 1),
  noPassages,
  (state, index) => {
    const sentence =
      madeUpSentences[index % madeUpSentences.length] ?? 'The lamp was lit.'
    const words = Array.map(sentence.split(' '), (text, at) => {
      const startMs = state.nextMs + at * (wordMs + wordGapMs)
      return {
        wordId: TranscriptPlayer.WordId.make(
          `p${index.toString()}w${at.toString()}`,
        ),
        text,
        startMs: Milliseconds.make(startMs),
        endMs: Milliseconds.make(startMs + wordMs),
      }
    })
    const endMs = state.nextMs + words.length * (wordMs + wordGapMs)
    return {
      passages: [
        ...state.passages,
        {
          passageId: `p${index.toString()}`,
          startMs: Milliseconds.make(state.nextMs),
          endMs: Milliseconds.make(endMs),
          words,
        },
      ],
      nextMs: endMs + passageGapMs,
    }
  },
).passages

// START

/**
 * How a terminal starts the made-up Books: the Host it runs on, and a
 * wrapper around the library store, as `startBooks` takes.
 */
export type MadeUpBooksConfig = Readonly<{
  host: Processor.Host.Host
  library?: (store: LibraryStoreService) => LibraryStoreService
}>

/**
 * Starts Books on the made-up library: three titles nobody wrote, with
 * made-up words, that play without a sound and keep nothing once the
 * process ends. No one is signed in and nothing is read from or written
 * to a real library, so a person can try a command, and a test can run
 * the very command a person types, with no account at all. `books` opens
 * it when `BOOKS_MADE_UP` is set.
 *
 * @example
 * ```typescript
 * const handle = await startMadeUpBooks({ host: Processor.Host.Cli() })
 * ```
 */
export const startMadeUpBooks = async (
  config: MadeUpBooksConfig,
): Promise<BooksHandleOnHost> => {
  const store = await Effect.runPromise(makeTestLibraryStore(sampleShelf))
  const sharing = await Effect.runPromise(makeTestLinkSharing())
  const wrap = config.library ?? ((service: LibraryStoreService) => service)
  return Runtime.startHandle({
    program: SyncedBooks,
    sync: Runtime.Memory({ processor: 'made-up' }),
    resources: Layer.mergeAll(
      Layer.effect(LibraryStore, Effect.map(LibraryStore, wrap)).pipe(
        Layer.provide(store.layer),
      ),
      Layer.succeed(TranscriptPlayer.AudioOutput, {
        sound: TranscriptPlayer.countedSound,
      }),
      TranscriptPlayer.transcriptsInMemory(
        new Map(
          Array.map(sampleTitles, title => [
            MediaId.make(title.slug),
            madeUpPassages,
          ]),
        ),
      ),
      sharing.layer,
      noReadAloud,
      noScribeTimeline,
    ),
    host: config.host,
  })
}

import { Array, type Context, Effect, Layer, Option } from 'effect'
import { type Processor, Runtime } from 'foldkit'
import { noCodeUpdates } from 'foldkit/code-updates'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { MediaId, Milliseconds } from './ids.js'
import { LibraryStore } from './library.js'
import {
  demoSampleChapters,
  demoSampleShelf,
  longSampleChapters,
  longSampleShelf,
  makeTestLibraryStore,
  noReadAloud,
  noScribeTimeline,
  sampleChapters,
  sampleShelf,
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

const madeUpPassageCount = 60

// One sentence, then five, then three, and round again.
const passageLengths: ReadonlyArray<number> = [1, 5, 3]

const sentencesInPassage = (index: number): number =>
  passageLengths[index % passageLengths.length] ?? 1

type Passages = Readonly<{
  passages: ReadonlyArray<TranscriptPlayer.Passage>
  nextMs: number
}>

const noPassages: Passages = { passages: [], nextMs: 0 }

const madeUpPassagesOf = (
  passageCount: number,
  sentencesIn: (index: number) => number = sentencesInPassage,
): ReadonlyArray<TranscriptPlayer.Passage> =>
  Array.reduce(Array.range(0, passageCount - 1), noPassages, (state, index) => {
    // A paragraph is a few of the sentences, starting one further on
    // each time, so paragraphs differ and are long enough to wrap.
    const sentence = Array.join(
      Array.map(
        Array.range(0, sentencesIn(index) - 1),
        at =>
          madeUpSentences[(index + at) % madeUpSentences.length] ??
          'The lamp was lit.',
      ),
      ' ',
    )
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
  }).passages

/**
 * Made-up words for a made-up title: the same few sentences over and
 * over, a paragraph of one, of five and of three in turn, every word half
 * a second after the last, for the first ten minutes or so. They are the
 * words of no book. A host that wants a voice for them, such as a phone
 * proving its sound, makes one from these words and their times.
 */
export const madeUpPassages: ReadonlyArray<TranscriptPlayer.Passage> =
  madeUpPassagesOf(madeUpPassageCount)

const longMadeUpPassageCount = 12

const sentencesInLongPassage = 260

/**
 * Made-up words in passages as long as a real recording's can be: twelve
 * passages of about two thousand words each, with no pause inside one. A
 * reader is handed the passage being read and its neighbours, so here it
 * is handed about ten thousand words at once: a chapter no painter should
 * lay out whole. The long made-up shelf gives them to one title.
 */
export const longMadeUpPassages: ReadonlyArray<TranscriptPlayer.Passage> =
  madeUpPassagesOf(longMadeUpPassageCount, () => sentencesInLongPassage)

/** The title of the long made-up shelf whose passages are the long ones. */
export const longWordedSlug = 'a-field-guide-to-weather'

// Made-up reflective sentences for the Demo shelf: nothing here is from a real book or recording.
const demoSentences: ReadonlyArray<string> = [
  'Stillness begins the moment you notice the space between one thought and the next.',
  'Watch the breath settle as the noise of the afternoon fades into quiet attention.',
  'When awareness rests in the present moment, ordinary things feel clear and unhurried.',
  'A single pause is enough to step out of habit and return to what is right in front of you.',
  'Listen without rushing ahead to the next sentence, letting each word land on its own.',
  'By evening the room is calm, and presence feels less like effort than like coming home.',
]

const demoPassageLengths: ReadonlyArray<number> = [1, 3, 2]

const demoPassagesAt = (
  prefix: string,
  startMs: number,
  passageCount: number,
): ReadonlyArray<TranscriptPlayer.Passage> => {
  const initial: Passages = { passages: [], nextMs: startMs }
  return Array.reduce(
    Array.range(0, passageCount - 1),
    initial,
    (state, index) => {
      const sentenceCount = Option.getOrElse(
        Array.get(demoPassageLengths, index % demoPassageLengths.length),
        () => 2,
      )
      const sentence = Array.join(
        Array.map(Array.range(0, sentenceCount - 1), at =>
          Option.getOrElse(
            Array.get(demoSentences, (index + at) % demoSentences.length),
            () => 'Stillness begins right here.',
          ),
        ),
        ' ',
      )
      const words = Array.map(sentence.split(' '), (text, at) => {
        const wordStartMs = state.nextMs + at * (wordMs + wordGapMs)
        return {
          wordId: TranscriptPlayer.WordId.make(
            `${prefix}p${index.toString()}w${at.toString()}`,
          ),
          text,
          startMs: Milliseconds.make(wordStartMs),
          endMs: Milliseconds.make(wordStartMs + wordMs),
        }
      })
      const endMs = state.nextMs + words.length * (wordMs + wordGapMs)
      return {
        passages: [
          ...state.passages,
          {
            passageId: `${prefix}p${index.toString()}`,
            startMs: Milliseconds.make(state.nextMs),
            endMs: Milliseconds.make(endMs),
            words,
          },
        ],
        nextMs: endMs + passageGapMs,
      }
    },
  ).passages
}

const demoHourOffsetMs = 68 * 60_000 + 30_000

/**
 * Made-up reflective passages for the Demo shelf: opening passages from 0:00
 * plus hour-long passages around 1:09:00 so terminal demos can inspect both
 * opening playback and hour-long timestamps.
 */
export const demoMadeUpPassages: ReadonlyArray<TranscriptPlayer.Passage> = [
  ...demoPassagesAt('start-', 0, 20),
  ...demoPassagesAt('hour-', demoHourOffsetMs, 6),
]

/** The demo shelf's featured slug. */
export const demoFeaturedSlug = 'a-new-earth'

// SESSION

/**
 * The name the made-up library's session is kept under when every device
 * shares it: rows of its own on the shared log, apart from every other
 * app's and never under the name a person's library is kept under.
 */
export const madeUpSessionLog = 'books-made-up'

// START

/**
 * How a Client starts the made-up Books: the Host it runs on, and a
 * wrapper around the library store, as `startBooks` takes. `resources`
 * are services of the host's own that replace the made-up ones of the
 * same kind, such as a phone's audio output, its report of the system's
 * appearance, and which update it runs. `sync` is the engine the session
 * runs on; without one it stays in this process. `shelf` is how long the
 * made-up shelf is: three short titles, or `Long`, 65 titles with one of
 * about 16 hours in 134 chapters, for measuring a Client on a real-sized
 * library.
 */
export type MadeUpBooksConfig = Readonly<{
  host: Processor.Host.Host
  library?: (store: LibraryStoreService) => LibraryStoreService
  resources?: Layer.Layer<never>
  sync?: Runtime.SyncEngine
  shelf?: 'Three' | 'Long' | 'Demo'
  clientMetadata?: Runtime.ClientMetadataSource
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
const shelfSelectionOf = (shelfKind: MadeUpBooksConfig['shelf']) => {
  if (shelfKind === 'Long') {
    return { shelf: longSampleShelf, chapters: longSampleChapters }
  } else if (shelfKind === 'Demo') {
    return { shelf: demoSampleShelf, chapters: demoSampleChapters }
  } else {
    return { shelf: sampleShelf, chapters: sampleChapters }
  }
}

export const startMadeUpBooks = async (
  config: MadeUpBooksConfig,
): Promise<BooksHandleOnHost> => {
  const isLong = config.shelf === 'Long'
  const isDemo = config.shelf === 'Demo'
  const { shelf, chapters } = shelfSelectionOf(config.shelf)
  const store = await Effect.runPromise(makeTestLibraryStore(shelf, chapters))
  const sharing = await Effect.runPromise(makeTestLinkSharing())
  const wrap = config.library ?? ((service: LibraryStoreService) => service)
  const passagesFor = (
    slug: string,
  ): ReadonlyArray<TranscriptPlayer.Passage> => {
    if (isLong && slug === longWordedSlug) {
      return longMadeUpPassages
    } else if (isDemo && slug === demoFeaturedSlug) {
      return demoMadeUpPassages
    } else {
      return madeUpPassages
    }
  }
  return Runtime.startHandle({
    program: SyncedBooks,
    sync: config.sync ?? Runtime.Memory({ processor: 'made-up' }),
    resources: Layer.mergeAll(
      Layer.effect(LibraryStore, Effect.map(LibraryStore, wrap)).pipe(
        Layer.provide(store.layer),
      ),
      Layer.succeed(TranscriptPlayer.AudioOutput, {
        sound: TranscriptPlayer.countedSound,
      }),
      TranscriptPlayer.transcriptsInMemory(
        new Map(
          Array.map(shelf.titles, title => [
            MediaId.make(title.slug),
            passagesFor(title.slug),
          ]),
        ),
      ),
      sharing.layer,
      noReadAloud,
      noScribeTimeline,
      noCodeUpdates,
      config.resources ?? Layer.empty,
    ),
    host: config.host,
    ...(config.clientMetadata === undefined
      ? {}
      : { clientMetadata: config.clientMetadata }),
  })
}

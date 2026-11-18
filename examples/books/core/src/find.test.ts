import { Array, Effect, Option, Record as Record_, Schema as S } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import { transcriptsOf } from 'foldkit/renderers'
import {
  PlayFrom,
  ReachedPlace,
  ReceivedMatches,
  ReceivedPassages,
  SearchFor,
  SearchQuery,
  TranscriptSource,
  WordId,
} from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'

import { App, type AppMessage, type AppModel } from './app.js'
import {
  BookSearchJson,
  bookSearchLines,
  bookSearchOf,
  currentWordLinkOf,
  readerTranscriptOf,
} from './find.js'
import { MediaId, Milliseconds, TitleSlug } from './ids.js'
import { instantTranscriptSource } from './instantTranscript.js'
import { wordPathOf } from './links.js'
import { OpenedPlace, ReceivedChapters, ReceivedShelf } from './message.js'
import { isLocalOnlyMessage } from './program.js'
import { sampleChapters, sampleShelf } from './sample.js'
import { addressCueOfModel } from './subscriptions.js'
import { SpokenWordsJson, spokenWordsOf } from './words.js'

type Written = Readonly<{ name: string; args: string }>

const bindApp = () => {
  let model: AppModel = Array.reduce(
    Record_.toEntries(sampleChapters),
    App.update(App.init()[0], ReceivedShelf({ shelf: sampleShelf }))[0],
    (current, [slug, chapters]) =>
      App.update(
        current,
        ReceivedChapters({ slug: TitleSlug.make(slug), chapters }),
      )[0],
  )
  const written: Array<Written> = []
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: AppMessage) => {
      const [next, commands] = App.update(model, message)
      model = next
      Array.forEach(commands, command => {
        written.push({ name: command.name, args: JSON.stringify(command.args) })
      })
      Option.map(addressCueOfModel(model), cue => {
        handle.send(OpenedPlace(cue))
      })
    },
    stop: () => Promise.resolve(),
  }
  return { bound: Interaction.bind(App, handle), written, send: handle.send }
}

type Bound = ReturnType<typeof bindApp>['bound']

const lanternKeeper = TitleSlug.make('the-lantern-keeper')

const sentences = [
  'The keeper climbed the stairs at dusk.',
  'He trimmed the wick and waited.',
  'Far out a bell answered the lamp.',
]

const sentencePauseMs = 2_000

const wordMs = 500

const passageStartMs = 30_000

/** Made-up words from 0:30: `the` of the first sentence starts at 0:31.5. */
const madeUpPassage = () => {
  const spoken = Array.flatMap(sentences, (sentence, sentenceIndex) =>
    Array.map(sentence.split(' '), text => ({ text, sentenceIndex })),
  )
  return {
    passageId: 'p1',
    startMs: Milliseconds.make(passageStartMs),
    endMs: Milliseconds.make(60_000),
    words: Array.map(spoken, (word, index) => {
      const startMs =
        passageStartMs + index * wordMs + word.sentenceIndex * sentencePauseMs
      return {
        wordId: WordId.make(`w${index.toString()}`),
        text: word.text,
        startMs: Milliseconds.make(startMs),
        endMs: Milliseconds.make(startMs + 400),
      }
    }),
  }
}

const uriOf = (bound: Bound) => Option.map(bound.navigation(), plan => plan.uri)

const playerOf = (bound: Bound) => {
  const { listening } = bound.readModel()
  return listening._tag === 'Loaded'
    ? Option.some(listening.player)
    : Option.none()
}

const placeOf = (bound: Bound): number =>
  Option.match(playerOf(bound), {
    onNone: () => -1,
    onSome: player => player.placeMs,
  })

const transportOf = (bound: Bound): string =>
  Option.match(playerOf(bound), {
    onNone: () => 'Idle',
    onSome: player => player.transport._tag,
  })

const currentWordOf = (bound: Bound): Option.Option<string> => {
  const words = spokenWordsOf(bound.readModel())
  return words._tag === 'WordsNow'
    ? words.excerpt.maybeCurrentWord
    : Option.none()
}

describe('a link to one word', () => {
  it('prints the time the word starts to the millisecond, and a whole second as the player prints it', () => {
    expect(wordPathOf(lanternKeeper, Milliseconds.make(723_450))).toBe(
      '/books/the-lantern-keeper/listen/12m03.45s',
    )
    expect(wordPathOf(lanternKeeper, Milliseconds.make(723_000))).toBe(
      '/books/the-lantern-keeper/listen/12m03s',
    )
  })

  it('opens on that word, marked and paused, and keeps the word in the address until it plays on', () => {
    const { bound, send } = bindApp()
    bound.openUri('/books/the-lantern-keeper/listen/31.5s', Navigation.Link())
    send(ReceivedPassages({ passages: [madeUpPassage()] }))
    expect(placeOf(bound)).toBe(31_500)
    expect(transportOf(bound)).toBe('Paused')
    expect(currentWordOf(bound)).toEqual(Option.some('the'))
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen/31.5s'),
    )
    bound.pressKey(Interaction.keyInput('p'))
    expect(transportOf(bound)).toBe('Playing')
    send(
      ReachedPlace({
        placeMs: Milliseconds.make(32_400),
        wallClockMs: Date.UTC(2026, 9, 18, 19, 0, 0),
      }),
    )
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen/32s'),
    )
  })

  it('moves to the word when the player is already within a second of it', () => {
    const { bound, send } = bindApp()
    bound.openUri('/books/the-lantern-keeper/listen/31s', Navigation.Link())
    send(ReceivedPassages({ passages: [madeUpPassage()] }))
    expect(placeOf(bound)).toBe(31_000)
    expect(currentWordOf(bound)).toEqual(Option.some('climbed'))
    bound.openUri('/books/the-lantern-keeper/listen/31.5s', Navigation.Link())
    expect(placeOf(bound)).toBe(31_500)
    expect(currentWordOf(bound)).toEqual(Option.some('the'))
  })

  it('still opens a whole-second link on its second, and a link between words on the word being spoken then', () => {
    const { bound, send } = bindApp()
    bound.openUri('/books/small-hours/listen/12m03s', Navigation.Link())
    expect(placeOf(bound)).toBe(723_000)
    expect(uriOf(bound)).toEqual(
      Option.some('/books/small-hours/listen/12m03s'),
    )
    bound.openUri('/books/the-lantern-keeper/listen/31.75s', Navigation.Link())
    send(ReceivedPassages({ passages: [madeUpPassage()] }))
    expect(currentWordOf(bound)).toEqual(Option.some('the'))
  })

  it('copies the link to a word from the word’s menu, and to the word being read', () => {
    const { bound, send, written } = bindApp()
    bound.press(`Listen:${lanternKeeper}`)
    send(ReceivedPassages({ passages: [madeUpPassage()] }))
    send(
      ReachedPlace({
        placeMs: Milliseconds.make(32_100),
        wallClockMs: Date.UTC(2026, 9, 18, 19, 0, 0),
      }),
    )
    const model = bound.readModel()
    const transcript =
      model.listening._tag === 'Loaded'
        ? Array.head(transcriptsOf(readerTranscriptOf(model.listening)))
        : Option.none()
    expect(Option.map(transcript, node => node.wordMenuAction)).toEqual(
      Option.some('ShowWordMenu'),
    )
    bound.press('ShowWordMenu:w3')
    const menuOf = () => {
      const now = bound.readModel()
      return now.listening._tag === 'Loaded'
        ? Option.flatMap(
            Array.head(transcriptsOf(readerTranscriptOf(now.listening))),
            node => Option.fromNullishOr(node.wordMenu),
          )
        : Option.none()
    }
    expect(Option.map(menuOf(), menu => menu.items)).toEqual(
      Option.some([
        { action: 'SeekToWord:w3', label: 'Play from here', icon: 'Play' },
        {
          action: 'CopyWordLink:w3',
          label: 'Copy link to this word',
          icon: 'Link',
        },
        {
          action: 'BookmarkWord:w3',
          label: 'Bookmark this word',
          icon: 'Bookmark',
        },
      ]),
    )
    bound.press('CopyWordLink:w3')
    expect(menuOf()).toEqual(Option.none())
    expect(written).toContainEqual({
      name: 'CopyLink',
      args: JSON.stringify({
        path: '/books/the-lantern-keeper/listen/31.5s',
        title: 'The Lantern Keeper, at 0:31',
      }),
    })
    expect(currentWordLinkOf(bound.readModel())).toEqual(
      Option.some('/books/the-lantern-keeper/listen/32s'),
    )
    expect(
      Array.findFirst(bound.entries(), entry => entry.tag === 'CopyWordLink'),
    ).not.toEqual(Option.none())
  })

  it('prints the link to the word being read in the JSON a follower reads', () => {
    const { bound, send } = bindApp()
    bound.press(`Listen:${lanternKeeper}`)
    send(ReceivedPassages({ passages: [madeUpPassage()] }))
    send(
      ReachedPlace({
        placeMs: Milliseconds.make(31_700),
        wallClockMs: Date.UTC(2026, 9, 18, 19, 0, 0),
      }),
    )
    const header: unknown = JSON.parse(
      S.encodeSync(SpokenWordsJson)(spokenWordsOf(bound.readModel())),
    ).header
    expect(header).toMatchObject({
      link: '/books/the-lantern-keeper/listen/31s',
      wordLink: '/books/the-lantern-keeper/listen/31.5s',
    })
  })
})

const lamp = SearchQuery.make('lamp')

const twoMatches = ReceivedMatches({
  query: lamp,
  total: 2,
  matches: [
    {
      startMs: Milliseconds.make(43_500),
      text: 'lamp.',
      before: 'Far out a bell answered the',
      after: '',
    },
    {
      startMs: Milliseconds.make(25 * 60_000 + 450),
      text: 'lamp',
      before: 'She carried the',
      after: 'down to the water.',
    },
  ],
})

describe('searching a book', () => {
  it('searches the title in the player, and reads each match with its time, chapter and link', () => {
    const { bound, send, written } = bindApp()
    expect(bookSearchOf(bound.readModel())).toEqual({
      _tag: 'NoBookSearch',
      sentence: 'Nothing is in the player.',
    })
    bound.press(`Listen:${lanternKeeper}`)
    bound.press('SearchFor:lamp')
    expect(written).toContainEqual({
      name: 'SearchRecording',
      args: JSON.stringify({ mediaId: 'the-lantern-keeper', query: 'lamp' }),
    })
    expect(bookSearchOf(bound.readModel())._tag).toBe('SearchingBook')
    send(twoMatches)
    const found = bookSearchOf(bound.readModel())
    expect(bookSearchLines(found)).toEqual([
      '# 2 matches for “lamp” in The Lantern Keeper',
      '0:43 · The Tide · Far out a bell answered the [lamp.] · /books/the-lantern-keeper/listen/43.5s',
      '25:00 · The Light · She carried the [lamp] down to the water. · /books/the-lantern-keeper/listen/25m00.45s',
    ])
    const json = S.encodeSync(BookSearchJson)(found)
    expect(json).not.toContain('\n')
    expect(JSON.parse(json)).toEqual({
      _tag: 'BookMatches',
      slug: 'the-lantern-keeper',
      title: 'The Lantern Keeper',
      query: 'lamp',
      total: 2,
      matches: [
        {
          placeMs: 43_500,
          place: '0:43',
          chapter: 'The Tide',
          before: 'Far out a bell answered the',
          text: 'lamp.',
          after: '',
          link: '/books/the-lantern-keeper/listen/43.5s',
        },
        {
          placeMs: 1_500_450,
          place: '25:00',
          chapter: 'The Light',
          before: 'She carried the',
          text: 'lamp',
          after: 'down to the water.',
          link: '/books/the-lantern-keeper/listen/25m00.45s',
        },
      ],
    })
  })

  it('opens a match’s link from the search on that word, in the same player', () => {
    const { bound, send } = bindApp()
    bound.press(`Listen:${lanternKeeper}`)
    bound.press('SearchFor:lamp')
    send(twoMatches)
    bound.press('PlayFrom:1500450')
    expect(placeOf(bound)).toBe(1_500_450)
    expect(transportOf(bound)).toBe('Playing')
  })

  it('keeps a search on the device that made it, while a move of the audio goes to every device', () => {
    expect(isLocalOnlyMessage(SearchFor({ query: lamp }))).toBe(true)
    expect(isLocalOnlyMessage(twoMatches)).toBe(true)
    expect(
      isLocalOnlyMessage(PlayFrom({ placeMs: Milliseconds.make(43_500) })),
    ).toBe(false)
  })
})

type SegmentRow = Readonly<{
  id: string
  relativeStartMs: number
  relativeEndMs: number
  wordsJSON: string
}>

const segmentMs = 216_000

const segmentCount = 85

const madeUpSegments: ReadonlyArray<SegmentRow> = Array.makeBy(
  segmentCount,
  index => ({
    id: `segment-${index.toString()}`,
    relativeStartMs: index * segmentMs,
    relativeEndMs: (index + 1) * segmentMs,
    wordsJSON: JSON.stringify([
      {
        text: index === 84 ? 'lamp' : 'tide',
        relativeStartMs: index * segmentMs + 100,
        relativeEndMs: index * segmentMs + 500,
      },
    ]),
  }),
)

type PageQuery = Readonly<{
  librarySegments: Readonly<{
    $: Readonly<{
      where: Readonly<{ relativeStartMs: Readonly<{ $gt: number }> }>
      limit: number
    }>
  }>
}>

/** An Instant that answers a page of made-up segments and counts the reads. */
const fakeInstant = () => {
  const asked: Array<number> = []
  const database = {
    queryOnce: (query: PageQuery) => {
      const { where, limit } = query.librarySegments.$
      asked.push(where.relativeStartMs.$gt)
      return Promise.resolve({
        data: {
          librarySegments: Array.take(
            Array.filter(
              madeUpSegments,
              segment => segment.relativeStartMs > where.relativeStartMs.$gt,
            ),
            limit,
          ),
        },
      })
    },
  }
  return { asked, database }
}

describe('the words for a search, from Instant', () => {
  it('reads the whole recording in pages of forty, only when a search is made, and keeps it for the next search', async () => {
    const { asked, database } = fakeInstant()
    const mediaId = MediaId.make('the-lantern-keeper')
    // NOTE: the fake answers only `queryOnce`, the one call a search makes.
    const words = instantTranscriptSource(
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      database as unknown as ProgramLogDatabase,
    )
    const search = (query: string) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const source = yield* TranscriptSource
          return yield* source.passagesMatching(mediaId, query)
        }).pipe(Effect.provide(words)),
      )
    expect(asked).toEqual([])
    const passages = await search('lamp')
    expect(passages.length).toBe(segmentCount)
    expect(asked).toEqual([-1, 39 * segmentMs, 79 * segmentMs])
    expect(
      Array.map(Array.takeRight(passages, 1), passage =>
        Array.map(passage.words, word => [word.text, word.startMs]),
      ),
    ).toEqual([[['lamp', 84 * segmentMs + 100]]])
    await search('tide')
    expect(asked.length).toBe(3)
  })
})

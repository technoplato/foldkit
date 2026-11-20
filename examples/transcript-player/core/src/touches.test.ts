import { Array, Option } from 'effect'
import { Catalog } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { MediaId, Milliseconds, SearchQuery, WordId } from './ids.js'
import {
  BackToPlayhead,
  LeavePlayhead,
  type Message,
  NextMatch,
  Pause,
  Play,
  PlayFrom,
  ReachedPlace,
  ReceivedMatches,
  ReceivedPassages,
  SearchFor,
  SeekTo,
  SeekToWord,
  ShowWordMenu,
  catalog,
} from './message.js'
import { type Model, type Passage, init } from './model.js'
import { update } from './update.js'

// A made-up recording of ten minutes in two chapters, with ten words in
// two paragraphs around the place.

const minuteMs = 60_000

const media = {
  mediaId: MediaId.make('evocation'),
  durationMs: Milliseconds.make(10 * minuteMs),
  maybeAudioUrl: Option.some('https://audio.invalid/evocation.mp3'),
  sections: [
    {
      title: 'Evocation',
      startMs: Milliseconds.make(18_700),
      endMs: Milliseconds.make(24_000),
    },
    {
      title: 'The Purpose',
      startMs: Milliseconds.make(24_000),
      endMs: Milliseconds.make(10 * minuteMs),
    },
  ],
}

const passageOf = (
  passageId: string,
  startMs: number,
  texts: ReadonlyArray<string>,
): Passage => ({
  passageId,
  startMs: Milliseconds.make(startMs),
  endMs: Milliseconds.make(startMs + texts.length * 1000),
  words: Array.map(texts, (text, index) => ({
    wordId: WordId.make(`${passageId}.${index.toString()}`),
    text,
    startMs: Milliseconds.make(startMs + index * 1000),
    endMs: Milliseconds.make(startMs + index * 1000 + 800),
  })),
})

const passages = [
  passageOf('a', 19_000, ['Evocation', 'Earth,', '114', 'million', 'years']),
  passageOf('b', 24_000, ['ago,', 'one', 'morning', 'just', 'after']),
]

const after = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  Array.reduce(messages, model, (state, message) => update(state, message)[0])

const query = SearchQuery.make('morning')

const matchAt = (startMs: number, text: string) => ({
  startMs: Milliseconds.make(startMs),
  text,
  before: '',
  after: '',
})

/** Paused at the start, its words on their way. */
const fresh = init(media)

/** Paused at the end of the recording. */
const atEnd = init(media, { placeMs: media.durationMs })

/**
 * Sounding in the middle of the first chapter, the audio having reported
 * its place, with a search that found two places, the words on screen at
 * the second of them, and a word's menu open.
 */
const busy = after(
  init(media, { placeMs: Milliseconds.make(22_500) }),
  ReceivedPassages({ passages }),
  SearchFor({ query }),
  ReceivedMatches({
    query,
    total: 2,
    matches: [matchAt(19_000, 'Evocation'), matchAt(24_000, 'ago,')],
    partsRead: 1,
    partsTotal: 1,
  }),
  ShowWordMenu({ wordId: WordId.make('a.2') }),
  Play(),
  ReachedPlace({
    placeMs: Milliseconds.make(22_500),
    wallClockMs: 1_792_350_000_000,
  }),
)

/** The same, paused after the audio reported its place. */
const pausedAfterSounding = after(busy, Pause())

/** Sounding, the words scrolled away from the word sounding. */
const scrolledAway = after(
  init(media, { placeMs: Milliseconds.make(22_500) }),
  ReceivedPassages({ passages }),
  Play(),
  LeavePlayhead(),
)

/**
 * Sounding with a search that found two places, the words scrolled away
 * from the voice after a look at one of them.
 */
const foundThenAway = after(busy, BackToPlayhead(), LeavePlayhead())

const models: ReadonlyArray<Model> = [
  fresh,
  atEnd,
  busy,
  pausedAfterSounding,
  scrolledAway,
  foundThenAway,
]

/** The Messages a person types or presses that no menu lists. */
const typed: ReadonlyArray<typeof catalog.Message.Type> = [
  SeekTo({ placeMs: Milliseconds.make(5 * minuteMs) }),
  SeekToWord({ wordId: WordId.make('a.0') }),
  PlayFrom({ placeMs: Milliseconds.make(19_000) }),
  SearchFor({ query: SearchQuery.make('dusk') }),
  ShowWordMenu({ wordId: WordId.make('b.1') }),
]

describe('what the Transcript Player’s Actions touch', () => {
  it('is said by every Action', () => {
    expect(
      Array.filter(catalog.actions, action =>
        Option.isNone(action.maybeTouches),
      ).map(action => action.tag),
    ).toEqual([])
  })

  it('names the state as typed paths and the Command by its definition', () => {
    expect(Catalog.declarationOf(Pause).touches).toEqual({
      mutates: ['transport'],
      triggers: [],
    })
    expect(Catalog.declarationOf(SearchFor).touches).toEqual({
      mutates: ['maybeSearch'],
      triggers: ['SearchRecording'],
    })
    expect(Catalog.declarationOf(NextMatch).touches).toEqual({
      mutates: ['maybeSearch.maybeSelectedMs', 'reader', 'maybeLeftAtMs'],
      triggers: [],
    })
  })

  it('is all update does', () => {
    expect(Catalog.undeclaredTouches(catalog, update, models, typed)).toEqual(
      [],
    )
  })

  it('is no more than update does', () => {
    expect(Catalog.unseenTouches(catalog, update, models, typed)).toEqual([])
  })
})

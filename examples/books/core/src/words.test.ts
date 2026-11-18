import { Array, Option, Record as Record_, Schema as S } from 'effect'
import { Interaction } from 'foldkit'
import {
  ReachedPlace,
  ReceivedPassages,
  WordId,
} from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import { App, type AppModel } from './app.js'
import { Milliseconds, TitleSlug } from './ids.js'
import { OpenedPlace, ReceivedChapters, ReceivedShelf } from './message.js'
import { sampleChapters, sampleShelf } from './sample.js'
import { addressCueOfModel } from './subscriptions.js'
import {
  SpokenWordsJson,
  isSameParagraph,
  spokenWordsLines,
  spokenWordsOf,
} from './words.js'

const lanternKeeper = TitleSlug.make('the-lantern-keeper')

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
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: typeof App.Message.Type) => {
      model = App.update(model, message)[0]
      Option.map(addressCueOfModel(model), cue => {
        handle.send(OpenedPlace(cue))
      })
    },
    stop: () => Promise.resolve(),
  }
  return { bound: Interaction.bind(App, handle), send: handle.send }
}

const sentences = [
  'The keeper climbed the stairs at dusk.',
  'He trimmed the wick and waited.',
  'Far out a bell answered the lamp.',
  'Then the fog came in.',
]

const sentencePauseMs = 2_000

const wordMs = 500

const passageStartMs = 30_000

const madeUpPassage = () => {
  const spoken = Array.flatMap(sentences, (sentence, sentenceIndex) =>
    Array.map(sentence.split(' '), (text, wordIndex) => ({
      text,
      sentenceIndex,
      wordIndex,
    })),
  )
  const words = Array.map(spoken, (word, index) => {
    const startMs =
      passageStartMs + index * wordMs + word.sentenceIndex * sentencePauseMs
    return {
      wordId: WordId.make(`w${index.toString()}`),
      text: word.text,
      startMs: Milliseconds.make(startMs),
      endMs: Milliseconds.make(startMs + 400),
    }
  })
  return {
    passageId: 'p1',
    startMs: Milliseconds.make(passageStartMs),
    endMs: Milliseconds.make(60_000),
    words,
  }
}

const playingAt = (placeMs: number) => {
  const { bound, send } = bindApp()
  bound.press(`Listen:${lanternKeeper}`)
  send(ReceivedPassages({ passages: [madeUpPassage()] }))
  send(
    ReachedPlace({
      placeMs: Milliseconds.make(placeMs),
      wallClockMs: Date.UTC(2026, 9, 18, 19, 0, 0),
    }),
  )
  return { bound, send }
}

const secondSentenceMs = 36_100

describe('the words being read', () => {
  it('names the title, chapter, place and link, then the paragraph being read with one either side', () => {
    const { bound } = playingAt(secondSentenceMs)
    expect(spokenWordsLines(spokenWordsOf(bound.readModel()))).toEqual([
      '# The Lantern Keeper · The Tide · 0:36 of 1:20:00 · playing · /books/the-lantern-keeper/listen/36s',
      '- 0:30 The keeper climbed the stairs at dusk.',
      '> 0:35 He [trimmed] the wick and waited.',
      '+ 0:40 Far out a bell answered the lamp.',
    ])
  })

  it('takes as many paragraphs before and after as asked', () => {
    const { bound } = playingAt(secondSentenceMs)
    expect(
      spokenWordsLines(
        spokenWordsOf(bound.readModel(), { leading: 0, trailing: 2 }),
      ),
    ).toEqual([
      '# The Lantern Keeper · The Tide · 0:36 of 1:20:00 · playing · /books/the-lantern-keeper/listen/36s',
      '> 0:35 He [trimmed] the wick and waited.',
      '+ 0:40 Far out a bell answered the lamp.',
      '+ 0:46 Then the fog came in.',
    ])
  })

  it('says paused once it is, and that nothing is in the player before a title is', () => {
    const { bound } = playingAt(secondSentenceMs)
    bound.press('Pause')
    expect(spokenWordsLines(spokenWordsOf(bound.readModel()))[0]).toBe(
      '# The Lantern Keeper · The Tide · 0:36 of 1:20:00 · paused · /books/the-lantern-keeper/listen/36s',
    )
    expect(
      spokenWordsLines(spokenWordsOf(bindApp().bound.readModel())),
    ).toEqual(['# Nothing is in the player.'])
  })

  it('says the words are on their way, or that this part has none', () => {
    const { bound, send } = bindApp()
    bound.press(`Listen:${lanternKeeper}`)
    expect(spokenWordsLines(spokenWordsOf(bound.readModel()))).toEqual([
      '# The Lantern Keeper · The Tide · 0:00 of 1:20:00 · playing · /books/the-lantern-keeper/listen/0s',
      '# Loading the words…',
    ])
    send(ReceivedPassages({ passages: [] }))
    expect(spokenWordsLines(spokenWordsOf(bound.readModel()))[1]).toBe(
      '# There is no transcript for this part yet.',
    )
  })

  it('is the same paragraph while only the word and the second move', () => {
    const { bound, send } = playingAt(secondSentenceMs)
    const before = spokenWordsOf(bound.readModel())
    send(
      ReachedPlace({
        placeMs: Milliseconds.make(secondSentenceMs + 1_000),
        wallClockMs: Date.UTC(2026, 9, 18, 19, 0, 1),
      }),
    )
    const sameParagraph = spokenWordsOf(bound.readModel())
    send(
      ReachedPlace({
        placeMs: Milliseconds.make(41_000),
        wallClockMs: Date.UTC(2026, 9, 18, 19, 0, 5),
      }),
    )
    const nextParagraph = spokenWordsOf(bound.readModel())
    expect(isSameParagraph(before, sameParagraph)).toBe(true)
    expect(isSameParagraph(before, nextParagraph)).toBe(false)
    bound.press('Pause')
    expect(
      isSameParagraph(nextParagraph, spokenWordsOf(bound.readModel())),
    ).toBe(false)
  })

  it('says the word being spoken at a moment between the reports the player makes once a second', () => {
    const reportedAtMs = Date.UTC(2026, 9, 18, 19, 0, 0)
    const { bound } = playingAt(secondSentenceMs)
    const currentLineAt = (nowMs: number): string | undefined =>
      spokenWordsLines(spokenWordsOf(bound.readModel(), {}, nowMs)).find(line =>
        line.startsWith('> '),
      )
    expect(currentLineAt(reportedAtMs)).toBe(
      '> 0:35 He [trimmed] the wick and waited.',
    )
    expect(currentLineAt(reportedAtMs + 500)).toBe(
      '> 0:35 He trimmed [the] wick and waited.',
    )
    expect(currentLineAt(reportedAtMs + 1_000)).toBe(
      '> 0:35 He trimmed the [wick] and waited.',
    )
    bound.press('Pause')
    expect(currentLineAt(reportedAtMs + 1_000)).toBe(
      '> 0:35 He [trimmed] the wick and waited.',
    )
  })

  it('encodes as one line of JSON with the same facts', () => {
    const { bound } = playingAt(secondSentenceMs)
    const json = S.encodeSync(SpokenWordsJson)(
      spokenWordsOf(bound.readModel(), { leading: 0, trailing: 0 }),
    )
    expect(json).not.toContain('\n')
    expect(JSON.parse(json)).toEqual({
      _tag: 'WordsNow',
      header: {
        slug: 'the-lantern-keeper',
        title: 'The Lantern Keeper',
        chapter: 'The Tide',
        placeMs: 36_100,
        place: '0:36',
        durationMs: 4_800_000,
        isPlaying: true,
        link: '/books/the-lantern-keeper/listen/36s',
        wordLink: '/books/the-lantern-keeper/listen/36s',
      },
      excerpt: {
        paragraphs: [
          {
            key: 'w7',
            position: 'Current',
            label: '0:35',
            text: 'He trimmed the wick and waited.',
          },
        ],
        currentWord: 'trimmed',
        currentWordIndex: 1,
      },
    })
  })
})

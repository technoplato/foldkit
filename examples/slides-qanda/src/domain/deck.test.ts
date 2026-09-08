import { Array, Effect, Option, Schema as S } from 'effect'
import { describe, expect, test } from 'vitest'

import { Deck, classifyPaste, decodeDeck, maybeDeckFromText } from './deck'
import { SlideId, neighbor } from './slide'

const twoSlidesJson = {
  title: 'DEATH',
  roots: [
    {
      id: '01',
      title: 'WHO PLAYS?',
      mapLines: ['PAY WRITE READY POKE', 'fail = 0'],
      story: 'Alice pays. Dave pokes.',
      question: 'Is this the game?',
      options: [
        { letter: 'A', text: 'Yes' },
        { letter: 'B', text: 'Skip pay' },
        { letter: 'C', text: 'No contest' },
      ],
      prompt: 'Paste A, B, or C.',
      followUps: [],
    },
    {
      id: '02',
      title: 'HOW DOES DAVE POKE?',
      mapLines: ['ONE poke list'],
      story: 'Alice Foldkit. Bob Swift.',
      question: 'What does Dave send?',
      options: [
        { letter: 'A', text: 'Messages' },
        { letter: 'B', text: 'URLs' },
        { letter: 'C', text: 'show plus minus' },
      ],
      prompt: 'Paste A, B, or C.',
      followUps: [],
    },
  ],
}

const twoSlideDeck = S.decodeUnknownSync(Deck)(twoSlidesJson)

describe('neighbor', () => {
  test('wraps from last to first', () => {
    Array.match(twoSlideDeck.roots, {
      onEmpty: () => {
        throw new Error('expected slides')
      },
      onNonEmpty: slides => {
        const maybeNext = neighbor(slides, SlideId.make('02'), 'Next')
        expect(Option.isSome(maybeNext)).toBe(true)
        if (Option.isSome(maybeNext)) {
          expect(maybeNext.value.id).toBe('01')
        }
      },
    })
  })

  test('an unknown id on Next goes to the first slide', () => {
    Array.match(twoSlideDeck.roots, {
      onEmpty: () => {
        throw new Error('expected slides')
      },
      onNonEmpty: slides => {
        const maybeNext = neighbor(slides, SlideId.make('hello'), 'Next')
        expect(Option.isSome(maybeNext)).toBe(true)
        if (Option.isSome(maybeNext)) {
          expect(maybeNext.value.id).toBe('01')
        }
      },
    })
  })

  test('wraps from first to last', () => {
    Array.match(twoSlideDeck.roots, {
      onEmpty: () => {
        throw new Error('expected slides')
      },
      onNonEmpty: slides => {
        const maybePrev = neighbor(slides, SlideId.make('01'), 'Prev')
        expect(Option.isSome(maybePrev)).toBe(true)
        if (Option.isSome(maybePrev)) {
          expect(maybePrev.value.id).toBe('02')
        }
      },
    })
  })
})

describe('maybeDeckFromText', () => {
  test('reads a deck JSON object', () => {
    const maybeDeck = maybeDeckFromText(JSON.stringify(twoSlidesJson))
    expect(Option.isSome(maybeDeck)).toBe(true)
  })

  test('rejects an answer sentence', () => {
    expect(maybeDeckFromText('A')).toStrictEqual(Option.none())
  })
})

describe('decodeDeck', () => {
  test('names the missing slides key', () => {
    const error = Effect.runSync(Effect.result(decodeDeck({ title: 'DEATH' })))
    expect(error._tag).toBe('Failure')
    if (error._tag === 'Failure') {
      expect(error.failure).toContain('This JSON is not a deck.')
      expect(error.failure).toContain('A deck needs a roots array.')
      expect(error.failure).toContain('at roots')
    }
  })

  test('names a missing slide title', () => {
    const error = Effect.runSync(
      Effect.result(
        decodeDeck({
          title: 'DEATH',
          roots: [
            {
              id: '01',
              mapLines: ['one'],
              story: 'story',
              question: 'q',
              options: [{ letter: 'A', text: 'yes' }],
              prompt: 'paste',
            },
          ],
        }),
      ),
    )
    expect(error._tag).toBe('Failure')
    if (error._tag === 'Failure') {
      expect(error.failure).toContain('Each slide needs a title.')
    }
  })
})

describe('classifyPaste', () => {
  test('a JSON object that is not a deck is a broken deck', () => {
    const kind = classifyPaste('{"title":"DEATH"}')
    expect(kind._tag).toBe('PastedBrokenDeck')
  })

  test('a sentence is an answer', () => {
    expect(classifyPaste('A')._tag).toBe('PastedAnswer')
  })
})

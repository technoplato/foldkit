import { Array, Option, Schema as S } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  neighborProposition,
  propositionFromJson,
  propositionsOf,
} from './explore'
import { Deck, ExploreStamp, PropositionId, SlideId } from './index'
import { hasAnswer, unansweredSlideIds } from './nav'

const exploreDeck = S.decodeUnknownSync(Deck)({
  title: 'DEATH',
  roots: [
    {
      id: '04',
      title: 'HOW DOES START WORK?',
      mapLines: ['start'],
      story: 'The hospital starts a device.',
      question: 'What does start do?',
      options: [
        { letter: 'A', text: 'New device' },
        { letter: 'B', text: 'Same device' },
        { letter: 'C', text: 'Later' },
      ],
      prompt: 'Paste A, B, or C.',
      followUps: [
        {
          id: '04h',
          title: 'WHAT DOES THE START STRING NAME?',
          mapLines: ['string'],
          story: 'The hospital passes a string.',
          question: 'What does the start string name?',
          options: [
            { letter: 'A', text: 'device/framework/language' },
            { letter: 'B', text: 'Homework list' },
            { letter: 'C', text: 'Bundle names' },
          ],
          prompt: 'Paste A, B, or C.',
          propositions: [
            {
              id: 'show',
              title: 'SHOW START',
              markdown: '# show\n\n`counter:level:show`',
            },
            {
              id: 'ios-expo',
              title: 'EXPO IOS',
              file: 'explore/04h/ios-expo.md',
            },
          ],
        },
      ],
    },
  ],
})

const card04h = () => {
  const maybeRoot = Array.head(exploreDeck.roots)
  if (Option.isNone(maybeRoot)) {
    throw new Error('expected root 04')
  }
  const maybeFollowUp = Array.head(maybeRoot.value.followUps)
  if (Option.isNone(maybeFollowUp)) {
    throw new Error('expected 04h')
  }
  return maybeFollowUp.value
}

describe('propositionsOf', () => {
  test('tags written and file bodies from deck JSON', () => {
    const props = propositionsOf(card04h())
    const maybeFirst = Array.head(props)
    const maybeSecond = Array.get(props, 1)
    expect(Option.isSome(maybeFirst)).toBe(true)
    if (Option.isSome(maybeFirst)) {
      expect(maybeFirst.value._tag).toBe('Written')
      expect(maybeFirst.value.id).toBe('show')
    }
    expect(Option.isSome(maybeSecond)).toBe(true)
    if (Option.isSome(maybeSecond)) {
      expect(maybeSecond.value._tag).toBe('File')
    }
  })
})

describe('neighborProposition', () => {
  test('Next from show is ios-expo and does not wrap', () => {
    const props = propositionsOf(card04h())
    const maybeNext = neighborProposition(
      props,
      PropositionId.make('show'),
      'Next',
    )
    expect(Option.isSome(maybeNext)).toBe(true)
    if (Option.isSome(maybeNext)) {
      expect(maybeNext.value.id).toBe('ios-expo')
    }
    const maybePastEnd = neighborProposition(
      props,
      PropositionId.make('ios-expo'),
      'Next',
    )
    expect(Option.isNone(maybePastEnd)).toBe(true)
  })
})

describe('hasAnswer', () => {
  test('explore notes alone leave 04h unanswered', () => {
    const logs = [
      {
        slideId: SlideId.make('04h'),
        answers: [],
        explores: [
              ExploreStamp.make({
                  at: '2026-09-08T13:00:00-04:00',
                  verbatim: 'ios/expo/ts looks right',
                  cleaned: '',
                  scope: 'explore',
                }),
        ],
      },
    ]
    expect(hasAnswer(logs, SlideId.make('04h'))).toBe(false)
    expect(unansweredSlideIds(exploreDeck, logs)).toStrictEqual([
      SlideId.make('04'),
      SlideId.make('04h'),
    ])
  })
})

describe('propositionFromJson', () => {
  test('file path stays relative to public/', () => {
    const tagged = propositionFromJson({
      id: PropositionId.make('ios-expo'),
      title: 'EXPO IOS',
      file: 'explore/04h/ios-expo.md',
    })
    expect(tagged._tag).toBe('File')
    if (tagged._tag === 'File') {
      expect(tagged.file).toBe('explore/04h/ios-expo.md')
    }
  })
})

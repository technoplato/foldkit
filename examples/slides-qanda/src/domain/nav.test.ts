import { Array, Option, Schema as S } from 'effect'
import { describe, expect, test } from 'vitest'

import { Deck, locate } from './deck'
import {
  ShowAll,
  ShowFollowUp,
  cycleFilter,
  latestUnansweredFollowUp,
  neighborRoot,
  nextFollowUp,
  nextNeededFollowUp,
  unansweredSlideIds,
  visibleRoots,
} from './nav'
import { SlideId, cardOf, rootOf } from './slide'

const deck = S.decodeUnknownSync(Deck)({
  title: 'DEATH',
  roots: [
    {
      id: '01',
      title: 'WHO PLAYS?',
      mapLines: ['one'],
      story: 'Alice pays.',
      question: 'Is this the game?',
      options: [
        { letter: 'A', text: 'Yes' },
        { letter: 'B', text: 'No' },
        { letter: 'C', text: 'Wait' },
      ],
      prompt: 'Paste A, B, or C.',
      followUps: [],
    },
    {
      id: '03',
      title: 'MONEY IN V1?',
      mapLines: ['prepaid'],
      story: 'Alice prepay.',
      question: 'Live money?',
      options: [
        { letter: 'A', text: 'Paper' },
        { letter: 'B', text: 'Bank' },
        { letter: 'C', text: 'Sim' },
      ],
      prompt: 'Paste A, B, or C.',
      followUps: [
        {
          id: '03a',
          title: 'WHO PAYS THE SIM?',
          mapLines: ['follow-up'],
          story: 'Dave asks Alice.',
          question: 'Is the sim scored?',
          options: [
            { letter: 'A', text: 'Yes' },
            { letter: 'B', text: 'No' },
            { letter: 'C', text: 'Later' },
          ],
          prompt: 'Paste A, B, or C.',
        },
      ],
    },
  ],
})

describe('locate', () => {
  test('a follow-up id carries its root', () => {
    const maybeAt = locate(deck, SlideId.make('03a'))
    expect(Option.isSome(maybeAt)).toBe(true)
    if (Option.isNone(maybeAt)) {
      return
    }
    expect(maybeAt.value._tag).toBe('AtFollowUp')
    expect(rootOf(maybeAt.value).id).toBe('03')
    expect(cardOf(maybeAt.value).id).toBe('03a')
  })

  test('a root id is AtRoot', () => {
    const maybeAt = locate(deck, SlideId.make('01'))
    expect(Option.isSome(maybeAt)).toBe(true)
    if (Option.isNone(maybeAt)) {
      return
    }
    expect(maybeAt.value._tag).toBe('AtRoot')
    expect(cardOf(maybeAt.value).id).toBe('01')
  })
})

describe('neighborRoot', () => {
  test('Prev from a follow-up of 03 lands on 01', () => {
    const maybeAt = locate(deck, SlideId.make('03a'))
    expect(Option.isSome(maybeAt)).toBe(true)
    if (Option.isNone(maybeAt)) {
      return
    }
    const maybePrev = neighborRoot(deck, [], ShowAll(), maybeAt.value, 'Prev')
    expect(Option.isSome(maybePrev)).toBe(true)
    if (Option.isSome(maybePrev)) {
      expect(maybePrev.value.id).toBe('01')
    }
  })
})

describe('cycleFilter', () => {
  test('walks All to OPEN to DONE to FOLLOW', () => {
    expect(cycleFilter(ShowAll())._tag).toBe('Unanswered')
    expect(cycleFilter(cycleFilter(ShowAll()))._tag).toBe('Answered')
    expect(cycleFilter(cycleFilter(cycleFilter(ShowAll())))._tag).toBe(
      'FollowUp',
    )
  })
})

describe('visibleRoots', () => {
  test('FollowUp keeps only roots that have an unanswered child', () => {
    const visible = visibleRoots(deck, [], ShowFollowUp())
    const maybeFirst = Array.head(visible)
    expect(Option.isSome(maybeFirst)).toBe(true)
    if (Option.isSome(maybeFirst)) {
      expect(maybeFirst.value.id).toBe('03')
    }
    expect(Option.isNone(Array.get(visible, 1))).toBe(true)
  })

  test('FollowUp drops a root whose children are all answered', () => {
    const visible = visibleRoots(
      deck,
      [
        {
          slideId: SlideId.make('03a'),
          answers: [
            { at: '2026-09-07T17:00:00-04:00', verbatim: 'A', cleaned: 'A' },
          ],
        },
      ],
      ShowFollowUp(),
    )
    expect(Array.isArrayEmpty(visible)).toBe(true)
  })
})

describe('unansweredSlideIds', () => {
  test('OPEN keeps an unanswered child after its root is answered', () => {
    const open = unansweredSlideIds(deck, [
      {
        slideId: SlideId.make('01'),
        answers: [
          { at: '2026-09-07T17:00:00-04:00', verbatim: 'A', cleaned: 'A' },
        ],
      },
      {
        slideId: SlideId.make('03'),
        answers: [
          { at: '2026-09-07T17:00:00-04:00', verbatim: 'B', cleaned: 'B' },
        ],
      },
    ])
    expect(open).toStrictEqual([SlideId.make('03a')])
  })

  test('OPEN is empty when every card has a stamp', () => {
    const open = unansweredSlideIds(deck, [
      {
        slideId: SlideId.make('01'),
        answers: [
          { at: '2026-09-07T17:00:00-04:00', verbatim: 'A', cleaned: 'A' },
        ],
      },
      {
        slideId: SlideId.make('03'),
        answers: [
          { at: '2026-09-07T17:00:00-04:00', verbatim: 'B', cleaned: 'B' },
        ],
      },
      {
        slideId: SlideId.make('03a'),
        answers: [
          { at: '2026-09-07T17:00:00-04:00', verbatim: 'A', cleaned: 'A' },
        ],
      },
    ])
    expect(Array.isArrayEmpty(open)).toBe(true)
  })
})

describe('latestUnansweredFollowUp', () => {
  test('FOLLOW lands on the last unanswered child in deck order', () => {
    const maybeLatest = latestUnansweredFollowUp(deck, [])
    expect(Option.isSome(maybeLatest)).toBe(true)
    if (Option.isSome(maybeLatest)) {
      expect(maybeLatest.value.id).toBe('03a')
    }
  })
})

describe('nextFollowUp', () => {
  test('Down from root 03 opens 03a', () => {
    const maybeAt = locate(deck, SlideId.make('03'))
    expect(Option.isSome(maybeAt)).toBe(true)
    if (Option.isNone(maybeAt)) {
      return
    }
    const maybeFollowUp = nextFollowUp(maybeAt.value)
    expect(Option.isSome(maybeFollowUp)).toBe(true)
    if (Option.isSome(maybeFollowUp)) {
      expect(maybeFollowUp.value.id).toBe('03a')
    }
  })

  test('Down from 03a has no later child', () => {
    const maybeAt = locate(deck, SlideId.make('03a'))
    expect(Option.isSome(maybeAt)).toBe(true)
    if (Option.isNone(maybeAt)) {
      return
    }
    expect(maybeAt.value._tag).toBe('AtFollowUp')
    expect(nextFollowUp(maybeAt.value)).toStrictEqual(Option.none())
  })
})

describe('nextNeededFollowUp', () => {
  test('down from a root skips an answered child', () => {
    const maybeAt = locate(deck, SlideId.make('03'))
    expect(Option.isSome(maybeAt)).toBe(true)
    if (Option.isNone(maybeAt)) {
      return
    }
    expect(
      nextNeededFollowUp(maybeAt.value, [
        {
          slideId: SlideId.make('03a'),
          answers: [
            { at: '2026-09-07T17:00:00-04:00', verbatim: 'A', cleaned: 'A' },
          ],
        },
      ]),
    ).toStrictEqual(Option.none())
  })
})

import { Option, Schema as S } from 'effect'
import { describe, expect, test } from 'vitest'

import { type MachineState, Shares } from './data'
import { samplePipeline } from './main.fixtures'
import {
  amountParts,
  formatAmount,
  formatHour,
  formatSpan,
  formatTarget,
  headlineAfterState,
  plainMetricLabel,
  presenceSentence,
  sharesSentence,
  waitingWords,
} from './view/format'

describe('the words the summary shows', () => {
  test.each([
    [0, '0 min'],
    [43, '43 min'],
    [59.6, '1 h'],
    [98, '1 h 38 min'],
    [180, '3 h'],
    [2880, '2 days'],
  ])('%d minutes reads %s', (minutes, words) => {
    expect(formatSpan(minutes)).toBe(words)
  })

  test('a percent joins its number, any other unit follows it', () => {
    expect(formatAmount(62, 0, '% of minutes')).toBe('62% of minutes')
    expect(formatAmount(35.2, 1, 'min')).toBe('35.2 min')
    expect(formatAmount(1858, 0, 'GiB')).toBe('1,858 GiB')
  })

  test('a percent is part of the number, its unit is the small print', () => {
    expect(amountParts(62, 0, '% of minutes')).toStrictEqual([
      '62%',
      ' of minutes',
    ])
    expect(amountParts(25, 0, 'an hour')).toStrictEqual(['25', ' an hour'])
  })

  test('a target says its direction and is never rounded away', () => {
    expect(formatTarget(Option.some(30), 'AtLeast')).toBe('target at least 30')
    expect(formatTarget(Option.some(2.5), 'AtMost')).toBe('target at most 2.5')
    expect(formatTarget(Option.none(), 'AtMost')).toBe('no target')
  })

  test('an hour reads in New York', () => {
    expect(formatHour('2026-11-22T16:00:00Z')).toBe('Sun, 11 AM')
  })

  test('the headline does not repeat the word above it', () => {
    expect(
      headlineAfterState('UnderUsed', 'Under-used: 10 builds are waiting.'),
    ).toBe('10 builds are waiting.')
    expect(
      headlineAfterState('JustRight', 'Just right: builds start at once.'),
    ).toBe('Builds start at once.')
    expect(headlineAfterState('Blocked', 'No build has started.')).toBe(
      'No build has started.',
    )
  })

  test.each<readonly [MachineState, string, string]>([
    [
      'OverUsed',
      'Over-used: the Mac is short of memory.',
      'The Mac is short of memory.',
    ],
    [
      'Idle',
      'Idle: no build is running or waiting.',
      'No build is running or waiting.',
    ],
    [
      'Unknown',
      "Not known: this minute's readings are missing.",
      "This minute's readings are missing.",
    ],
    [
      'OverUsed',
      'Memory: the Mac is out of it.',
      'Memory: the Mac is out of it.',
    ],
  ])(
    '%s also drops the name the exporter calls it: %s',
    (state, headline, words) => {
      expect(headlineAfterState(state, headline)).toBe(words)
    },
  )

  test('presence says what the file measures: how long the queue has counted him so', () => {
    const away = samplePipeline.presence
    expect(
      presenceSentence({ ...away, maybeSinceMinutes: Option.some(0) }),
    ).toBe('The queue has just counted you as away.')
    expect(
      presenceSentence({ ...away, maybeSinceMinutes: Option.none() }),
    ).toBe('The queue counts you as away.')
  })

  test('a waiting build the exporter gave no class reads in words', () => {
    expect(waitingWords(2, [{ class: 'unclassed', count: 2 }])).toBe(
      '2 (2 with no priority)',
    )
  })

  test('a class of waiting build reads in words', () => {
    expect(
      waitingWords(8, [
        { class: 'release', count: 1 },
        { class: 'main', count: 3 },
        { class: 'P0', count: 4 },
      ]),
    ).toBe('8 (1 release, 3 landing checks, 4 P0)')
  })

  test('a metric drops the technical name in parentheses', () => {
    expect(plainMetricLabel('Phone work in front (CPU in front)')).toBe(
      'Phone work in front',
    )
    expect(plainMetricLabel('CPU in front')).toBe('CPU in front')
  })

  test('the shares are one sentence', () => {
    expect(sharesSentence(samplePipeline.shares)).toBe(
      'Just right 62% of the last 24 hours, idle with builds waiting 21%, overloaded 9%, nothing to build 6%, not measured 2%.',
    )
    const onlyThree = S.decodeUnknownSync(Shares)({
      window: 'last 24 hours',
      justRightPct: 100,
      underUsedPct: 0,
      overUsedPct: 0,
      idlePct: 0,
      unknownPct: null,
    })
    expect(sharesSentence(onlyThree)).toBe(
      'Just right 100% of the last 24 hours, idle with builds waiting 0%, overloaded 0%.',
    )
  })
})

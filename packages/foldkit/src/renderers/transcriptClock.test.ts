import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { Transcript } from './elements.js'
import {
  currentWordTokenAt,
  transcriptAt,
  transcriptPlaceAt,
} from './transcriptClock.js'

const reportedAtMs = 1_000_000

const wordsOf = (
  prefix: string,
  texts: ReadonlyArray<string>,
  firstStartMs: number,
) =>
  texts.map((text, index) => ({
    token: `${prefix}${index.toString()}`,
    text,
    startMs: firstStartMs + index * 300,
  }))

const reading = (rate: number) =>
  Transcript({
    label: 'Transcript',
    action: 'SeekToWord',
    emptyText: 'No words yet.',
    clock: { placeMs: 10_000, atMs: reportedAtMs, rate },
    passages: [
      {
        key: 'a',
        label: '0:09',
        isCurrent: true,
        words: wordsOf('a', ['The', 'lamp', 'was', 'lit'], 9_400).map(word =>
          word.token === 'a2' ? { ...word, isCurrent: true } : word,
        ),
      },
      {
        key: 'b',
        label: '0:10',
        words: wordsOf('b', ['Gulls', 'settled'], 10_600),
      },
    ],
  })

describe('the place a transcript clock has reached', () => {
  it('moves on from the reported place at its rate while it runs', () => {
    const clock = { placeMs: 10_000, atMs: reportedAtMs, rate: 1 }
    expect(transcriptPlaceAt(clock, reportedAtMs)).toBe(10_000)
    expect(transcriptPlaceAt(clock, reportedAtMs + 400)).toBe(10_400)
    expect(transcriptPlaceAt({ ...clock, rate: 1.5 }, reportedAtMs + 400)).toBe(
      10_600,
    )
  })

  it('stays at the reported place while paused, and before the report', () => {
    const paused = { placeMs: 10_000, atMs: reportedAtMs, rate: 0 }
    expect(transcriptPlaceAt(paused, reportedAtMs + 5_000)).toBe(10_000)
    expect(
      transcriptPlaceAt({ ...paused, rate: 1 }, reportedAtMs - 5_000),
    ).toBe(10_000)
  })

  it('never runs more than a second and a half past a report that stopped coming', () => {
    const clock = { placeMs: 10_000, atMs: reportedAtMs, rate: 1 }
    expect(transcriptPlaceAt(clock, reportedAtMs + 60_000)).toBe(11_500)
  })
})

describe('the word being spoken at a moment', () => {
  it('is the last word to start at or before the place the clock has reached', () => {
    expect(currentWordTokenAt(reading(1), reportedAtMs)).toEqual(
      Option.some('a2'),
    )
    expect(currentWordTokenAt(reading(1), reportedAtMs + 350)).toEqual(
      Option.some('a3'),
    )
    expect(currentWordTokenAt(reading(1), reportedAtMs + 700)).toEqual(
      Option.some('b0'),
    )
    expect(currentWordTokenAt(reading(0), reportedAtMs + 700)).toEqual(
      Option.some('a2'),
    )
  })

  it('is none for a transcript with no clock or no word times', () => {
    const { clock: _clock, ...unclocked } = reading(1)
    expect(currentWordTokenAt(unclocked, reportedAtMs)).toEqual(Option.none())
  })

  it('marks that word and its passage current, and no other', () => {
    const later = transcriptAt(reading(1), reportedAtMs + 700)
    expect(
      later.passages.map(passage => [
        passage.key,
        passage.isCurrent === true,
        passage.words.filter(word => word.isCurrent === true).map(w => w.token),
      ]),
    ).toEqual([
      ['a', false, []],
      ['b', true, ['b0']],
    ])
  })

  it('hands back, untouched, every passage the word neither left nor entered, so a painter repaints only those that changed', () => {
    const given = reading(1)
    const sameWord = transcriptAt(given, reportedAtMs)
    const nextPassage = transcriptAt(given, reportedAtMs + 700)

    expect(sameWord.passages[0]).toBe(given.passages[0])
    expect(sameWord.passages[1]).toBe(given.passages[1])
    expect(nextPassage.passages[0]).not.toBe(given.passages[0])
    expect(nextPassage.passages[1]).not.toBe(given.passages[1])
  })

  it('leaves a transcript with no clock exactly as it is', () => {
    const { clock: _clock, ...unclocked } = reading(1)
    expect(transcriptAt(unclocked, reportedAtMs + 700)).toBe(unclocked)
  })

  it('hands back the exact same transcript node when the spoken word has not moved', () => {
    const given = reading(1)
    expect(transcriptAt(given, reportedAtMs)).toBe(given)
  })

  it('steps across passages in a large transcript without rebuilding untouched passages', () => {
    const passages = globalThis.Array.from({ length: 200 }, (_, pIndex) => ({
      key: `p${pIndex.toString()}`,
      label: `${pIndex.toString()}:00`,
      words: globalThis.Array.from({ length: 50 }, (__, wIndex) => {
        const globalWord = pIndex * 50 + wIndex
        return {
          token: `w${globalWord.toString()}`,
          text: `word${globalWord.toString()}`,
          startMs: globalWord * 250,
        }
      }),
    }))
    const large = Transcript({
      label: 'Large Transcript',
      action: 'SeekToWord',
      emptyText: 'No words yet.',
      clock: { placeMs: 50 * 250 + 100, atMs: reportedAtMs, rate: 1 },
      passages,
    })

    const firstStep = transcriptAt(large, reportedAtMs)
    expect(firstStep.passages.at(0)).toBe(large.passages.at(0))
    expect(firstStep.passages.at(1)?.isCurrent).toBe(true)
    expect(
      firstStep.passages
        .at(1)
        ?.words.filter(word => word.isCurrent === true)
        .map(word => word.token),
    ).toEqual(['w50'])
    expect(firstStep.passages.at(199)).toBe(large.passages.at(199))

    const secondStep = transcriptAt(firstStep, reportedAtMs + 250)
    expect(secondStep.passages.at(0)).toBe(firstStep.passages.at(0))
    expect(
      secondStep.passages
        .at(1)
        ?.words.filter(word => word.isCurrent === true)
        .map(word => word.token),
    ).toEqual(['w51'])

    const jumped = transcriptAt(
      {
        ...secondStep,
        clock: { placeMs: 120 * 50 * 250, atMs: reportedAtMs, rate: 1 },
      },
      reportedAtMs,
    )
    expect(jumped.passages.at(1)?.isCurrent).toBeUndefined()
    expect(jumped.passages.at(120)?.isCurrent).toBe(true)
    expect(jumped.passages.at(50)).toBe(secondStep.passages.at(50))
  })

  it('still finds the last matching word when timestamps are out of order', () => {
    const outOfOrder = Transcript({
      label: 'Out of order',
      action: 'SeekToWord',
      emptyText: 'No words yet.',
      clock: { placeMs: 500, atMs: reportedAtMs, rate: 0 },
      passages: [
        {
          key: 'p0',
          label: '0:00',
          words: [
            { token: 'a', text: 'first', startMs: 1000 },
            { token: 'b', text: 'second', startMs: 400 },
          ],
        },
      ],
    })
    expect(currentWordTokenAt(outOfOrder, reportedAtMs)).toEqual(
      Option.some('b'),
    )
  })
})

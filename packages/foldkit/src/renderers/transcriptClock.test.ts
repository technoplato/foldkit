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

  it('leaves a transcript with no clock exactly as it is', () => {
    const { clock: _clock, ...unclocked } = reading(1)
    expect(transcriptAt(unclocked, reportedAtMs + 700)).toBe(unclocked)
  })
})

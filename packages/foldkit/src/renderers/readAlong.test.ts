import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { Seek, Transcript } from './elements.js'
import {
  matchStepOf,
  matchesIn,
  searchTranscript,
  seekLandingAt,
  transcriptDefectOf,
  transcriptWithMatches,
  wordAddressOf,
  wordAtAddress,
  wordStepOf,
} from './readAlong.js'

const paragraph = (
  key: string,
  label: string,
  firstStartMs: number,
  text: string,
) => ({
  key,
  label,
  words: Array.map(text.split(' '), (word, index) => ({
    token: `${key}${index.toString()}`,
    text: word,
    startMs: firstStartMs + index * 400,
  })),
})

const lighthouse = Transcript({
  label: 'Transcript',
  action: 'SeekToWord',
  emptyText: 'No words yet.',
  clock: { placeMs: 0, atMs: 0, rate: 0 },
  passages: [
    paragraph('a', '0:00', 0, 'The lamp was lit at dusk.'),
    paragraph('b', '0:12', 12_000, 'Gulls settled on the Lamp rail.'),
    paragraph('c', '0:31', 31_000, 'A boat rounded the point.'),
  ],
})

describe('searching a transcript', () => {
  it('finds each place the words are spoken, whatever their case or punctuation, in order', () => {
    expect(
      Array.map(searchTranscript(lighthouse, 'LAMP'), match => [
        match.token,
        match.label,
        match.startMs,
      ]),
    ).toEqual([
      ['a1', '0:00', 400],
      ['b4', '0:12', 13_600],
    ])
  })

  it('matches several words in a row, and nothing for an empty search', () => {
    expect(
      Array.map(searchTranscript(lighthouse, 'lit at dusk'), match => [
        match.token,
        match.text,
      ]),
    ).toEqual([['a3', 'lit at dusk.']])
    expect(searchTranscript(lighthouse, '  ')).toEqual([])
    expect(searchTranscript(lighthouse, 'harbour')).toEqual([])
  })
})

describe('what a search finds', () => {
  it('takes the last word typed as the start of a word, and the words before it whole', () => {
    expect(
      Array.map(searchTranscript(lighthouse, 'la'), match => match.text),
    ).toEqual(['lamp', 'Lamp'])
    expect(
      Array.map(searchTranscript(lighthouse, 'the la'), match => match.text),
    ).toEqual(['The lamp', 'the Lamp'])
    expect(searchTranscript(lighthouse, 'th lamp')).toEqual([])
  })

  it('carries a few words either side, and each word it found, to show and to mark', () => {
    expect(
      Array.map(
        searchTranscript(lighthouse, 'lamp rail', { contextWords: 2 }),
        match => [match.before, match.text, match.after, match.tokens],
      ),
    ).toEqual([['on the', 'Lamp rail.', 'A boat', ['b4', 'b5']]])
    expect(
      Array.map(searchTranscript(lighthouse, 'the lamp'), match => [
        match.before,
        match.after,
      ]),
    ).toEqual([
      ['', 'was lit at dusk. Gulls settled on the'],
      ['was lit at dusk. Gulls settled on', 'rail. A boat rounded the point.'],
    ])
  })

  it('reads over a word that is only punctuation', () => {
    expect(matchesIn(['lit', '—', 'at', 'dusk.'], 'lit at')).toEqual([
      { index: 0, length: 3 },
    ])
    expect(matchesIn(['lit', 'at'], '— …')).toEqual([])
  })

  it('searches sixteen hours of words fast enough to answer as a person types', () => {
    const vocabulary = [
      'lamp',
      'harbour',
      'keeper',
      'tide',
      'gull',
      'lantern',
      'the',
      'and',
      'of',
      'weather,',
      'Stairs.',
      'rope',
    ]
    const sixteenHoursOfWords = 150_000
    const texts = Array.makeBy(
      sixteenHoursOfWords,
      index =>
        `${vocabulary[(index * 7 + Math.floor(index / 13)) % vocabulary.length] ?? ''}${index % 97 === 0 ? 'x' : ''}`,
    )
    const startedAt = performance.now()
    const found = matchesIn(texts, 'the lantern keep')
    const tookMs = performance.now() - startedAt
    expect(found.length).toBeGreaterThan(0)
    expect(tookMs).toBeLessThan(400)
  })
})

describe('marking what a search found', () => {
  const marksOf = (transcript: ReturnType<typeof transcriptWithMatches>) =>
    Array.flatMap(transcript.passages, passage =>
      Array.flatMap(passage.words, word =>
        word.mark === undefined ? [] : [[word.token, word.mark]],
      ),
    )

  it('marks every word found, and the match a person is on apart from the rest', () => {
    expect(marksOf(transcriptWithMatches(lighthouse, 'the lamp', 13_200))).toEqual(
      [
        ['a0', 'Found'],
        ['a1', 'Found'],
        ['b3', 'Selected'],
        ['b4', 'Selected'],
      ],
    )
    expect(marksOf(transcriptWithMatches(lighthouse, 'lamp'))).toEqual([
      ['a1', 'Found'],
      ['b4', 'Found'],
    ])
  })

  it('leaves a transcript as it is when nothing is searched for', () => {
    expect(transcriptWithMatches(lighthouse, '')).toBe(lighthouse)
  })
})

describe('stepping through matches', () => {
  const matches = [{ startMs: 400 }, { startMs: 13_600 }, { startMs: 40_000 }]

  it('goes to the next match after a place and the one before it, and around the ends', () => {
    expect(matchStepOf(matches, 400, 'Next')).toEqual(
      Option.some({ startMs: 13_600 }),
    )
    expect(matchStepOf(matches, 20_000, 'Previous')).toEqual(
      Option.some({ startMs: 13_600 }),
    )
    expect(matchStepOf(matches, 40_000, 'Next')).toEqual(
      Option.some({ startMs: 400 }),
    )
    expect(matchStepOf(matches, 400, 'Previous')).toEqual(
      Option.some({ startMs: 40_000 }),
    )
    expect(matchStepOf([], 0, 'Next')).toEqual(Option.none())
  })
})

describe('where a drag of the seek bar will land', () => {
  const bar = Seek({
    value: 0,
    max: 60_000,
    action: 'SeekTo',
    label: 'Place',
    valueText: '0:00 of 1:00',
    landings: [
      { value: 0, text: '0:00 · The lamp was lit at dusk.' },
      { value: 12_000, text: '0:12 · Gulls settled on the Lamp rail.' },
      { value: 31_000, text: '0:31 · A boat rounded the point.' },
    ],
  })

  it('is the paragraph that starts at or before the place under the drag', () => {
    expect(
      Option.map(seekLandingAt(bar, 20_000), landing => landing.text),
    ).toEqual(Option.some('0:12 · Gulls settled on the Lamp rail.'))
    expect(
      Option.map(seekLandingAt(bar, 31_000), landing => landing.text),
    ).toEqual(Option.some('0:31 · A boat rounded the point.'))
  })

  it('is nothing for a bar that names no landings', () => {
    expect(
      seekLandingAt(
        Seek({
          value: 0,
          max: 60_000,
          action: 'SeekTo',
          label: 'Place',
          valueText: '0:00 of 1:00',
        }),
        20_000,
      ),
    ).toEqual(Option.none())
  })
})

describe('scrubbing a transcript', () => {
  const tokenOf = (maybeWord: ReturnType<typeof wordStepOf>) =>
    Option.map(maybeWord, word => word.token)

  it('steps a word forward and back, across paragraphs', () => {
    expect(tokenOf(wordStepOf(lighthouse, 'a1', 'Word', 'Next'))).toEqual(
      Option.some('a2'),
    )
    expect(tokenOf(wordStepOf(lighthouse, 'b0', 'Word', 'Previous'))).toEqual(
      Option.some('a5'),
    )
    expect(tokenOf(wordStepOf(lighthouse, 'c4', 'Word', 'Next'))).toEqual(
      Option.none(),
    )
  })

  it('steps to the start of the next paragraph, and back to the start of this one, then the one before', () => {
    expect(tokenOf(wordStepOf(lighthouse, 'b3', 'Paragraph', 'Next'))).toEqual(
      Option.some('c0'),
    )
    expect(
      tokenOf(wordStepOf(lighthouse, 'b3', 'Paragraph', 'Previous')),
    ).toEqual(Option.some('b0'))
    expect(
      tokenOf(wordStepOf(lighthouse, 'b0', 'Paragraph', 'Previous')),
    ).toEqual(Option.some('a0'))
  })
})

describe('the address of a word', () => {
  it('is the time the word starts, which survives a transcript made again', () => {
    const [first] = searchTranscript(lighthouse, 'rounded')
    expect(Option.fromNullishOr(first?.startMs)).toEqual(Option.some(31_800))
    expect(
      Option.flatMap(
        Array.findFirst(
          Array.flatMap(lighthouse.passages, passage => passage.words),
          word => word.token === 'c2',
        ),
        wordAddressOf,
      ),
    ).toEqual(Option.some(31_800))
  })

  it('opens on the word being spoken at that time', () => {
    expect(
      Option.map(wordAtAddress(lighthouse, 31_800), word => word.text),
    ).toEqual(Option.some('rounded'))
    expect(
      Option.map(wordAtAddress(lighthouse, 31_950), word => word.text),
    ).toEqual(Option.some('rounded'))
    expect(
      wordAtAddress(Transcript({ ...lighthouse, passages: [] }), 0),
    ).toEqual(Option.none())
  })
})

describe('a transcript stored without word times', () => {
  it('says so as a defect to fix where it was ingested, and offers no coarser reading', () => {
    const untimed = Transcript({
      ...lighthouse,
      passages: [
        {
          key: 'a',
          label: '0:00',
          words: [
            { token: 'a0', text: 'The' },
            { token: 'a1', text: 'lamp' },
          ],
        },
      ],
    })
    expect(transcriptDefectOf(untimed)).toEqual(
      Option.some(
        'These words were stored without a time for each word, so they cannot follow the voice. The transcript has to be made again with word times.',
      ),
    )
    expect(transcriptDefectOf(lighthouse)).toEqual(Option.none())
    expect(searchTranscript(untimed, 'lamp')).toEqual([])
    expect(wordAtAddress(untimed, 0)).toEqual(Option.none())
  })
})

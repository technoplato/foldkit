import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { Transcript } from './elements.js'
import {
  searchTranscript,
  transcriptDefectOf,
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

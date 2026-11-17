import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { Column, Text, Transcript } from './elements.js'
import { transcriptsOf } from './query.js'
import {
  TranscriptExcerptJson,
  transcriptExcerptLines,
  transcriptExcerptOf,
} from './transcriptExcerpt.js'
import type { TranscriptPassage } from './types.js'

const paragraphOf = (
  label: string,
  text: string,
  current: Readonly<{
    isCurrent?: boolean
    word?: string
    heading?: string
  }> = {},
): TranscriptPassage => ({
  key: `p-${label}`,
  label,
  ...(current.heading === undefined ? {} : { heading: current.heading }),
  ...(current.isCurrent === undefined ? {} : { isCurrent: current.isCurrent }),
  words: Array.map(text.split(' '), (word, index) => ({
    token: `${label}-${index.toString()}`,
    text: word,
    isCurrent: word === current.word,
  })),
})

const lighthouse = Transcript({
  label: 'Transcript',
  action: 'SeekToWord',
  emptyText: 'There is no transcript for this part yet.',
  passages: [
    paragraphOf('0:00', 'The lamp was lit at dusk.'),
    paragraphOf('0:12', 'Gulls settled on the rail.'),
    paragraphOf('0:31', 'A boat rounded the point slowly.', {
      isCurrent: true,
      word: 'rounded',
      heading: 'Chapter 2: Landfall',
    }),
    paragraphOf('0:48', 'Nobody waved from the deck.'),
    paragraphOf('1:05', 'The keeper went down the stairs.'),
    paragraphOf('1:20', 'Morning came grey and quiet.'),
  ],
})

describe('the paragraph being read, with those around it', () => {
  it('takes the current paragraph with as many before and after as asked', () => {
    const excerpt = Option.getOrThrow(
      transcriptExcerptOf(lighthouse, { leading: 1, trailing: 2 }),
    )
    expect(
      Array.map(excerpt.paragraphs, paragraph => [
        paragraph.position,
        paragraph.label,
        paragraph.text,
      ]),
    ).toEqual([
      ['Leading', '0:12', 'Gulls settled on the rail.'],
      ['Current', '0:31', 'A boat rounded the point slowly.'],
      ['Trailing', '0:48', 'Nobody waved from the deck.'],
      ['Trailing', '1:05', 'The keeper went down the stairs.'],
    ])
    expect(excerpt.maybeCurrentWord).toEqual(Option.some('rounded'))
    expect(excerpt.maybeCurrentWordIndex).toEqual(Option.some(2))
  })

  it('takes one before and one after unless told otherwise, and what there is at an edge', () => {
    const atStart = Transcript({
      ...lighthouse,
      passages: [
        paragraphOf('0:00', 'The lamp was lit at dusk.', { isCurrent: true }),
        paragraphOf('0:12', 'Gulls settled on the rail.'),
        paragraphOf('0:31', 'A boat rounded the point slowly.'),
      ],
    })
    const excerpt = Option.getOrThrow(transcriptExcerptOf(atStart))
    expect(
      Array.map(excerpt.paragraphs, paragraph => paragraph.position),
    ).toEqual(['Current', 'Trailing'])
    expect(excerpt.maybeCurrentWord).toEqual(Option.none())
  })

  it('carries the heading of the section the current paragraph opens', () => {
    const excerpt = Option.getOrThrow(transcriptExcerptOf(lighthouse))
    expect(
      Array.map(excerpt.paragraphs, paragraph => paragraph.maybeHeading),
    ).toEqual([
      Option.none(),
      Option.some('Chapter 2: Landfall'),
      Option.none(),
    ])
  })

  it('is none while no paragraph is being read', () => {
    const silent = Transcript({ ...lighthouse, passages: [] })
    expect(transcriptExcerptOf(silent)).toEqual(Option.none())
    const unmarked = Transcript({
      ...lighthouse,
      passages: [paragraphOf('0:00', 'The lamp was lit at dusk.')],
    })
    expect(transcriptExcerptOf(unmarked)).toEqual(Option.none())
  })

  it('prints one line per paragraph, the current one marked, for a pipe', () => {
    const excerpt = Option.getOrThrow(
      transcriptExcerptOf(lighthouse, { leading: 1, trailing: 1 }),
    )
    expect(transcriptExcerptLines(excerpt)).toEqual([
      '- 0:12 Gulls settled on the rail.',
      '## Chapter 2: Landfall',
      '> 0:31 A boat [rounded] the point slowly.',
      '+ 0:48 Nobody waved from the deck.',
    ])
  })

  it('brackets the word sounding, not an earlier one spelled the same', () => {
    const echo = Transcript({
      ...lighthouse,
      passages: [
        {
          key: 'p-echo',
          label: '2:00',
          isCurrent: true,
          words: [
            { token: 'e0', text: 'the' },
            { token: 'e1', text: 'lamp' },
            { token: 'e2', text: 'and' },
            { token: 'e3', text: 'the', isCurrent: true },
            { token: 'e4', text: 'sea' },
          ],
        },
      ],
    })
    expect(
      transcriptExcerptLines(Option.getOrThrow(transcriptExcerptOf(echo))),
    ).toEqual(['> 2:00 the lamp and [the] sea'])
  })

  it('encodes as one line of JSON another program can read', () => {
    const excerpt = Option.getOrThrow(
      transcriptExcerptOf(lighthouse, { leading: 0, trailing: 0 }),
    )
    const json = S.encodeSync(TranscriptExcerptJson)(excerpt)
    expect(json).not.toContain('\n')
    expect(JSON.parse(json)).toEqual({
      paragraphs: [
        {
          key: 'p-0:31',
          position: 'Current',
          label: '0:31',
          heading: 'Chapter 2: Landfall',
          text: 'A boat rounded the point slowly.',
        },
      ],
      currentWord: 'rounded',
      currentWordIndex: 2,
    })
  })
})

describe('the transcripts on a screen', () => {
  it('finds every Transcript in the tree, depth first', () => {
    const screen = Column({}, Text('Now playing'), Column({}, lighthouse))
    expect(transcriptsOf(screen)).toEqual([lighthouse])
    expect(transcriptsOf(Text('Library'))).toEqual([])
  })
})

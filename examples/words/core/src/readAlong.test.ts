import { Array, Option } from 'effect'
import {
  searchTranscript,
  transcriptAt,
  transcriptExcerptLines,
  transcriptExcerptOf,
  wordAddressOf,
  wordAtAddress,
  wordStepOf,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { readAlongOf } from './readAlong.js'
import type { Section } from './recording.js'
import { sectionAt, wordAt } from './transcript.js'

// Made-up words: nothing here is from a real recording.
const sectionOf = (
  id: string,
  index: number,
  startSeconds: number,
  texts: ReadonlyArray<string>,
): Section => ({
  id,
  index,
  startSeconds,
  endSeconds: startSeconds + texts.length * 0.5,
  maybeSpeakerID: Option.none(),
  text: texts.join(' '),
  words: Array.map(texts, (text, at) => ({
    id: `${id}.${at.toString()}`,
    text,
    startSeconds: startSeconds + at * 0.5,
    endSeconds: startSeconds + at * 0.5 + 0.4,
  })),
  isFinal: true,
  maybeWordsSeal: Option.none(),
})

const sections: ReadonlyArray<Section> = [
  sectionOf('dusk', 0, 5, [
    'The',
    'keeper',
    'lit',
    'the',
    'lamp',
    'at',
    'dusk.',
  ]),
  sectionOf('bell', 1, 12, [
    'Far',
    'out',
    'a',
    'bell',
    'answered',
    'the',
    'lamp.',
  ]),
  sectionOf('fog', 2, 70, ['Then', 'the', 'fog', 'came', 'in.']),
]

const paused = (positionSeconds: number) =>
  readAlongOf(sections, {
    positionSeconds,
    isPlaying: false,
    reportedAtMs: 1_000_000,
    rate: 1,
  })

describe('a recording, read along with', () => {
  it('is the shared Transcript: a passage for each section, each word with its token and its start', () => {
    const transcript = paused(0)
    expect(Array.map(transcript.passages, passage => passage.key)).toEqual([
      'dusk',
      'bell',
      'fog',
    ])
    expect(Array.map(transcript.passages, passage => passage.label)).toEqual([
      '0:05',
      '0:12',
      '1:10',
    ])
    expect(transcript.passages[1]?.words[3]).toEqual({
      token: 'bell.3',
      text: 'bell',
      startMs: 13_500,
    })
  })

  it('marks the same word the recording’s own readings name, wherever a word is being spoken', () => {
    Array.forEach([5, 6.2, 8, 12, 14.9, 70.4, 72], seconds => {
      const own = Option.flatMap(sectionAt(sections, seconds), section =>
        Option.map(wordAt(section, seconds), word => word.id),
      )
      const shared = Array.findFirst(
        Array.flatMap(
          transcriptAt(paused(seconds), 1_000_000).passages,
          passage => passage.words,
        ),
        word => word.isCurrent === true,
      )
      expect(Option.map(shared, word => word.token)).toEqual(own)
    })
  })

  it('moves the mark on the word while it plays, between reports of the place', () => {
    const playing = readAlongOf(sections, {
      positionSeconds: 12,
      isPlaying: true,
      reportedAtMs: 1_000_000,
      rate: 1,
    })
    const tokenAt = (nowMs: number) =>
      Option.map(
        Array.findFirst(
          Array.flatMap(
            transcriptAt(playing, nowMs).passages,
            passage => passage.words,
          ),
          word => word.isCurrent === true,
        ),
        word => word.token,
      )
    expect(tokenAt(1_000_000)).toEqual(Option.some('bell.0'))
    expect(tokenAt(1_000_600)).toEqual(Option.some('bell.1'))
    expect(tokenAt(1_001_100)).toEqual(Option.some('bell.2'))
  })

  it('is searched, stepped through and linked to with the shared readings', () => {
    const transcript = paused(0)
    expect(
      Array.map(searchTranscript(transcript, 'lamp'), match => [
        match.token,
        match.startMs,
      ]),
    ).toEqual([
      ['dusk.4', 7_000],
      ['bell.6', 15_000],
    ])
    expect(
      Option.map(
        wordStepOf(transcript, 'dusk.4', 'Word', 'Next'),
        word => word.token,
      ),
    ).toEqual(Option.some('dusk.5'))
    const lamp = Option.getOrThrow(wordAtAddress(transcript, 15_000))
    expect(lamp.token).toBe('bell.6')
    expect(wordAddressOf(lamp)).toEqual(Option.some(15_000))
  })

  it('prints for a terminal as any Transcript does: the paragraph being spoken, with those around it', () => {
    const lines = Option.match(
      transcriptExcerptOf(transcriptAt(paused(13.6), 1_000_000), {
        leading: 1,
        trailing: 1,
      }),
      { onNone: () => [], onSome: transcriptExcerptLines },
    )
    expect(lines.join('\n')).toContain('Far out a [bell] answered the lamp.')
    expect(lines.join('\n')).toContain('The keeper lit the lamp at dusk.')
    expect(lines.join('\n')).toContain('Then the fog came in.')
  })

  it('gives a sealed section its place and no words', () => {
    const sealed: Section = {
      ...sectionOf('held', 3, 90, []),
      text: '[checking the voice]',
      maybeWordsSeal: Option.some('Held'),
    }
    const transcript = readAlongOf([...sections, sealed], {
      positionSeconds: 0,
      isPlaying: false,
      reportedAtMs: 0,
      rate: 1,
    })
    expect(Array.last(transcript.passages)).toEqual(
      Option.some({ key: 'held', label: '1:30', words: [] }),
    )
  })
})

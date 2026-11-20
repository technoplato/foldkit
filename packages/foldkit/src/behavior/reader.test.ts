import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { Transcript } from '../renderers/elements.js'
import type { TranscriptNode } from '../renderers/types.js'
import {
  type Context,
  Detached,
  type Fact,
  FinishedLive,
  Following,
  ForgotPassage,
  ForgotWord,
  LeftVoice,
  MovedVoice,
  NamedPlace,
  Passage,
  ReturnedToVoice,
  State,
  Word,
  initial,
  isFollowing,
  placeOf,
  project,
  returnControlOf,
  returnLabelOf,
  step,
} from './reader.js'

// Made-up words: nothing here is from a real recording or book.

const sounding: Context = { isLive: false }

const live: Context = { isLive: true }

const away = Detached({ maybePlace: Option.none() })

const atWord = Detached({ maybePlace: Option.some(Word({ startMs: 4_000 })) })

const atPassage = Detached({
  maybePlace: Option.some(Passage({ key: 's7' })),
})

const everyState = [Following(), away, atWord, atPassage]

const steppedFromEach = (context: Context, fact: Fact) =>
  Array.map(everyState, state => step(state, context, fact))

describe('how a reader stands to the voice, one fact at a time', () => {
  it('starts following the voice', () => {
    expect(initial).toEqual(Following())
    expect(isFollowing(initial)).toBe(true)
    expect(placeOf(initial)).toEqual(Option.none())
  })

  it('the reader leaving stops the words following, with no place named', () => {
    expect(step(Following(), sounding, LeftVoice())).toEqual(away)
  })

  it('a reader already away keeps the place they are at when a painter says they left', () => {
    expect(step(away, sounding, LeftVoice())).toBe(away)
    expect(step(atWord, sounding, LeftVoice())).toBe(atWord)
    expect(step(atPassage, sounding, LeftVoice())).toBe(atPassage)
  })

  it('asking for the voice follows again from anywhere, and names no place', () => {
    expect(steppedFromEach(sounding, ReturnedToVoice())).toEqual([
      Following(),
      Following(),
      Following(),
      Following(),
    ])
  })

  it('moving the voice follows again from anywhere: a picked word, a seek and a skip are one answer', () => {
    expect(steppedFromEach(sounding, MovedVoice())).toEqual([
      Following(),
      Following(),
      Following(),
      Following(),
    ])
  })

  it('a reader who already follows is the same value after asking again, so nothing is drawn again', () => {
    const following = Following()
    expect(step(following, sounding, ReturnedToVoice())).toBe(following)
    expect(step(following, sounding, MovedVoice())).toBe(following)
  })

  it('naming a place stops the words following and shows that place, from anywhere', () => {
    const match = Word({ startMs: 9_500 })
    expect(steppedFromEach(sounding, NamedPlace({ place: match }))).toEqual(
      Array.map(everyState, () => Detached({ maybePlace: Option.some(match) })),
    )
  })

  it('holds one place at a time: a match named over a linked passage replaces it', () => {
    const next = step(
      atPassage,
      sounding,
      NamedPlace({ place: Word({ startMs: 4_000 }) }),
    )
    expect(placeOf(next)).toEqual(Option.some(Word({ startMs: 4_000 })))
  })

  it('forgetting the word leaves the reader away with no place, and leaves a passage alone', () => {
    expect(steppedFromEach(sounding, ForgotWord())).toEqual([
      Following(),
      away,
      away,
      atPassage,
    ])
  })

  it('forgetting the passage leaves the reader away with no place, and leaves a word alone', () => {
    expect(steppedFromEach(sounding, ForgotPassage())).toEqual([
      Following(),
      away,
      atWord,
      away,
    ])
  })

  it('a recording that finishes while its newest word is followed stops following when the place has something said', () => {
    expect(
      step(Following(), live, FinishedLive({ isPlaceSpoken: true })),
    ).toEqual(away)
  })

  it('keeps following when it finishes with its place before anything said: nothing would move', () => {
    expect(
      step(Following(), live, FinishedLive({ isPlaceSpoken: false })),
    ).toEqual(Following())
  })

  it('keeps following when the word sounding was followed, not the newest word', () => {
    expect(
      step(Following(), sounding, FinishedLive({ isPlaceSpoken: true })),
    ).toEqual(Following())
  })

  it('a reader away when it finishes stays where they are, at the place they had', () => {
    expect(step(atWord, live, FinishedLive({ isPlaceSpoken: true }))).toBe(
      atWord,
    )
  })
})

describe('the reader’s state as data', () => {
  it('goes to JSON and back, so a Model that holds it can be kept', () => {
    const codec = S.toCodecJson(State)
    Array.forEach(everyState, state => {
      const encoded = JSON.parse(JSON.stringify(S.encodeSync(codec)(state)))
      expect(S.decodeUnknownSync(codec)(encoded)).toEqual(state)
    })
  })
})

const words: TranscriptNode = Transcript({
  label: 'Words',
  action: 'SeekToWord',
  emptyText: 'No words yet.',
  passages: [
    {
      key: 's6',
      label: '0:00',
      words: [
        { token: 'a1', text: 'The', startMs: 400 },
        { token: 'a2', text: 'keeper', startMs: 900 },
      ],
    },
    {
      key: 's7',
      label: '0:04',
      words: [
        { token: 'b1', text: 'lit', startMs: 4_000 },
        { token: 'b2', text: 'the', startMs: 4_300 },
        { token: 'b3', text: 'lamp', startMs: 4_300 },
      ],
    },
  ],
})

const drawn = { leaveAction: 'LeavePlayhead' }

describe('what the reader’s state says on the Transcript every painter draws', () => {
  it('says the words follow, and names the press for leaving, with no word to show', () => {
    const told = project(Following(), words, drawn)
    expect(told.isFollowing).toBe(true)
    expect(told.leaveAction).toBe('LeavePlayhead')
    expect(told.focusToken).toBeUndefined()
    expect(told.passages).toBe(words.passages)
  })

  it('says the words do not follow once the reader left, still with the press for leaving', () => {
    const told = project(away, words, drawn)
    expect(told.isFollowing).toBe(false)
    expect(told.leaveAction).toBe('LeavePlayhead')
    expect(told.focusToken).toBeUndefined()
  })

  it('names the word that starts at the named time for a painter to bring into view', () => {
    expect(project(atWord, words, drawn).focusToken).toBe('b1')
  })

  it('names the first of two words that start on the same millisecond', () => {
    const tied = Detached({
      maybePlace: Option.some(Word({ startMs: 4_300 })),
    })
    expect(project(tied, words, drawn).focusToken).toBe('b2')
  })

  it('names the last word before the time while no word starts on it, as while a match’s passage is still loading', () => {
    const notHere = Detached({
      maybePlace: Option.some(Word({ startMs: 10_802_400 })),
    })
    expect(project(notHere, words, drawn).focusToken).toBe('b3')
  })

  it('names no word for a time before the first word', () => {
    const before = Detached({ maybePlace: Option.some(Word({ startMs: 100 })) })
    expect(project(before, words, drawn).focusToken).toBeUndefined()
  })

  it('finds the word again each time, so words made again under the same time are named by their new token', () => {
    const remade: TranscriptNode = {
      ...words,
      passages: [
        {
          key: 's9',
          label: '0:04',
          words: [{ token: 'c1', text: 'lit', startMs: 4_000 }],
        },
      ],
    }
    expect(project(atWord, remade, drawn).focusToken).toBe('c1')
  })

  it('marks the named passage, and keeps every other passage the value it was', () => {
    const told = project(atPassage, words, drawn)
    expect(Array.map(told.passages, passage => passage.isFocused)).toEqual([
      undefined,
      true,
    ])
    expect(Array.get(told.passages, 0)).toEqual(Array.get(words.passages, 0))
    expect(Option.getOrUndefined(Array.get(told.passages, 0))).toBe(
      Option.getOrUndefined(Array.get(words.passages, 0)),
    )
    expect(told.focusToken).toBeUndefined()
    expect(told.isFollowing).toBe(false)
  })

  it('marks nothing for a passage that is not in the Transcript', () => {
    const gone = Detached({ maybePlace: Option.some(Passage({ key: 's99' })) })
    expect(
      Array.some(
        project(gone, words, drawn).passages,
        passage => passage.isFocused === true,
      ),
    ).toBe(false)
  })
})

describe('the way back to the voice', () => {
  it('does not show while the words follow', () => {
    expect(returnControlOf(Following(), sounding)).toEqual(Option.none())
    expect(returnControlOf(Following(), live)).toEqual(Option.none())
  })

  it('shows whenever the words do not follow, at a place or not, and is called Back to Playhead', () => {
    expect(
      Array.map([away, atWord, atPassage], state =>
        returnControlOf(state, sounding),
      ),
    ).toEqual([
      Option.some({ target: 'Playhead', label: 'Back to Playhead' }),
      Option.some({ target: 'Playhead', label: 'Back to Playhead' }),
      Option.some({ target: 'Playhead', label: 'Back to Playhead' }),
    ])
  })

  it('is called Back to Live while the word followed is the newest of a recording in progress', () => {
    expect(returnControlOf(away, live)).toEqual(
      Option.some({ target: 'Live', label: 'Back to Live' }),
    )
  })

  it('spells its two labels in one place', () => {
    expect(returnLabelOf('Playhead')).toBe('Back to Playhead')
    expect(returnLabelOf('Live')).toBe('Back to Live')
  })
})

import { Array, Option, Schema as S } from 'effect'
import { Catalog } from 'foldkit'
import { m } from 'foldkit/message'

import {
  Milliseconds,
  PlaceToken,
  SearchQuery,
  Speed,
  SpeedToken,
  WordId,
  clockOf,
} from './ids.js'
import {
  Match,
  type Model,
  Passage,
  SeekScope,
  hasAudio,
  isFollowingPlayhead,
  isSounding,
  matchesOf,
  nextSectionOf,
  passagesOf,
  previousSectionOf,
  searchQueryOf,
  wordOf,
} from './model.js'
import { nextParagraphOf, previousParagraphOf } from './paragraphs.js'

// MESSAGE

const noAudio = 'its audio is not in the library yet'

/** Plays from the place. `p` presses it, and pauses while it plays. */
export const Play = Catalog.action('Play', {
  what: 'Plays from the place',
  why: 'The person wants to listen',
  enabled: (model: Model) => {
    if (isSounding(model)) {
      return Catalog.Disabled({ because: 'it is playing' })
    } else if (!hasAudio(model)) {
      return Catalog.Disabled({ because: noAudio })
    } else {
      return Catalog.Enabled()
    }
  },
  meta: { label: 'Play', keys: ['p'] },
})

/** Pauses where it is. `p` or `k` presses it. */
export const Pause = Catalog.action('Pause', {
  what: 'Pauses where it is',
  why: 'The person wants to stop listening for now',
  enabled: (model: Model) =>
    isSounding(model)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'nothing is playing' }),
  meta: { label: 'Pause', keys: ['p', 'k'] },
})

/** Goes back 30 seconds. `[` presses it. */
export const SkipBack = Catalog.action('SkipBack', {
  what: 'Goes back 30 seconds',
  why: 'The person missed something',
  enabled: (model: Model) =>
    model.placeMs === 0
      ? Catalog.Disabled({ because: 'it is at the start' })
      : Catalog.Enabled(),
  meta: { label: '−30s', keys: ['['], title: 'Skip back' },
})

/** Goes forward 30 seconds. `]` presses it. */
export const SkipForward = Catalog.action('SkipForward', {
  what: 'Goes forward 30 seconds',
  why: 'The person wants to skip ahead',
  enabled: (model: Model) =>
    model.placeMs >= model.media.durationMs
      ? Catalog.Disabled({ because: 'it is at the end' })
      : Catalog.Enabled(),
  meta: { label: '+30s', keys: [']'], title: 'Skip forward' },
})

const passageTitleOf = (passage: Passage): string =>
  Array.join(
    Array.map(Array.take(passage.words, 6), word => word.text),
    ' ',
  )

/**
 * Moves to any place in the recording, as a seek bar does: `SeekTo:723000`
 * moves to 12:03, and a person can type the place, `seek-to 1h00m00s` or
 * `seek-to 12:03`. It offers the passage starts in a menu, and takes any
 * place from the start to the end.
 */
export const SeekTo = Catalog.action('SeekTo', {
  fields: { placeMs: Milliseconds },
  choose: {
    field: 'placeMs',
    prompt: 'Where to?',
    token: PlaceToken,
    choicesOf: (model: Model) =>
      Array.map(passagesOf(model), passage => ({
        value: passage.startMs,
        title: clockOf(passage.startMs),
        detail: passageTitleOf(passage),
      })),
    accepts: (model: Model, placeMs: Milliseconds) =>
      placeMs <= model.media.durationMs
        ? Catalog.Enabled()
        : Catalog.Disabled({ because: 'that is past the end' }),
    nothingToChoose: 'there is nowhere to go',
  },
  what: 'Moves to a place in the recording',
  why: 'The person wants to hear another part',
  meta: { label: 'Seek', keys: [], title: 'Seek to' },
})

/**
 * Plays from one word of the transcript, as pressing the word does:
 * `SeekToWord:w4012`. It takes any word near the place.
 */
export const SeekToWord = Catalog.action('SeekToWord', {
  fields: { wordId: WordId },
  choose: {
    field: 'wordId',
    prompt: 'Which word?',
    token: WordId,
    choicesOf: () => [],
    accepts: (model: Model, wordId: WordId) => {
      if (!hasAudio(model)) {
        return Catalog.Disabled({ because: noAudio })
      } else if (Option.isSome(wordOf(model, wordId))) {
        return Catalog.Enabled()
      } else {
        return Catalog.Disabled({ because: 'that word is not near the place' })
      }
    },
    nothingToChoose: 'there are no words yet',
  },
  what: 'Plays from a word of the transcript',
  why: 'The person wants to hear that part',
  meta: { label: 'Play from here', keys: [], title: 'Play from word' },
})

/** Goes to the start of this chapter, or the one before it. */
export const PreviousSection = Catalog.action('PreviousSection', {
  what: 'Goes to the start of this chapter, or the one before',
  why: 'The person wants to hear the chapter again, or the last one',
  enabled: (model: Model) =>
    Option.isSome(previousSectionOf(model))
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'there is no chapter before' }),
  meta: { label: 'Previous chapter', keys: [',', '<'] },
})

/** Goes to the start of the next chapter. */
export const NextSection = Catalog.action('NextSection', {
  what: 'Goes to the start of the next chapter',
  why: 'The person wants to skip to what comes next',
  enabled: (model: Model) =>
    Option.isSome(nextSectionOf(model))
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'this is the last chapter' }),
  meta: { label: 'Next chapter', keys: ['.', '>'] },
})

/** Makes the seek bar span this chapter or the whole recording. */
export const SetSeekScope = Catalog.action('SetSeekScope', {
  fields: { scope: SeekScope },
  choose: {
    field: 'scope',
    prompt: 'What should the bar span?',
    token: SeekScope,
    choicesOf: (model: Model) =>
      Array.map(SeekScope.literals, scope => ({
        value: scope,
        title: scope === 'Section' ? 'Chapter' : 'Whole book',
        availability:
          scope === model.seekScope
            ? Catalog.Disabled({ because: 'the bar spans it now' })
            : Catalog.Enabled(),
      })),
    nothingToChoose: 'there is nothing to span',
  },
  what: 'Makes the seek bar span this chapter or the whole recording',
  why: 'The person wants fine control in a chapter, or to move far',
  meta: { label: 'Bar spans', keys: [], title: 'Set what the bar spans' },
})

/** Plays at one speed. */
export const SetSpeed = Catalog.action('SetSpeed', {
  fields: { speed: Speed },
  choose: {
    field: 'speed',
    prompt: 'Which speed?',
    token: SpeedToken,
    choicesOf: (model: Model) =>
      Array.map(Speed.literals, speed => ({
        value: speed,
        title: `${speed.toString()}×`,
        availability:
          speed === model.speed
            ? Catalog.Disabled({ because: 'it is the speed' })
            : Catalog.Enabled(),
      })),
    nothingToChoose: 'there are no speeds',
  },
  what: 'Plays faster or slower',
  why: 'The person wants it faster or slower',
  meta: { label: 'Speed', keys: [], title: 'Set speed' },
})

/**
 * Goes to the start of the paragraph being heard, or of the one before
 * when it has only just begun. `{` presses it.
 */
export const PreviousParagraph = Catalog.action('PreviousParagraph', {
  what: 'Goes to the start of this paragraph, or the one before',
  why: 'The person wants to hear the paragraph again, or the last one',
  enabled: (model: Model) =>
    Option.isSome(previousParagraphOf(model))
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'there is no paragraph before' }),
  meta: { label: 'Previous paragraph', keys: ['{'] },
})

/** Goes to the start of the next paragraph. `}` presses it. */
export const NextParagraph = Catalog.action('NextParagraph', {
  what: 'Goes to the start of the next paragraph',
  why: 'The person wants to move on a paragraph',
  enabled: (model: Model) =>
    Option.isSome(nextParagraphOf(model))
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'there is no paragraph after' }),
  meta: { label: 'Next paragraph', keys: ['}'] },
})

/** Opens the search for words in the recording. `/` presses it. */
export const ShowSearch = Catalog.action('ShowSearch', {
  what: 'Opens the search for words in the recording',
  why: 'The person wants to find where something was said',
  enabled: (model: Model) =>
    Option.isSome(model.maybeSearch)
      ? Catalog.Disabled({ because: 'the search is open' })
      : Catalog.Enabled(),
  meta: { label: 'Search', keys: ['/'], title: 'Search the words' },
})

/** Closes the search. The words stay where the person was looking. */
export const CloseSearch = Catalog.action('CloseSearch', {
  what: 'Closes the search',
  why: 'The person has found what they wanted',
  enabled: (model: Model) =>
    Option.isSome(model.maybeSearch)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'the search is not open' }),
  meta: { label: 'Done', keys: [], title: 'Close the search' },
})

/**
 * Finds every place words are spoken in the whole recording, as typing
 * them into the search does: `SearchFor:lit at dusk`. It opens the search
 * when it is closed, and shows the first match after the place being
 * heard without moving the audio.
 */
export const SearchFor = Catalog.action('SearchFor', {
  fields: { query: SearchQuery },
  choose: {
    field: 'query',
    prompt: 'Search for what?',
    token: SearchQuery,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'type the words to find',
  },
  what: 'Finds every place the words are spoken in the recording',
  why: 'The person wants to find where something was said',
  meta: { label: 'Search', keys: [], title: 'Search for' },
})

/** Empties the search, ready for other words. */
export const ClearSearch = Catalog.action('ClearSearch', {
  what: 'Empties the search',
  why: 'The person wants to search for something else',
  enabled: (model: Model) =>
    Option.isSome(searchQueryOf(model))
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'nothing is searched for' }),
  meta: { label: 'Clear', keys: [], title: 'Clear the search' },
})

const whenMatches = (model: Model): Catalog.Availability =>
  Array.isReadonlyArrayEmpty(matchesOf(model))
    ? Catalog.Disabled({ because: 'there are no matches' })
    : Catalog.Enabled()

/** Shows the match after the one on screen, and the first after the last. `n` presses it. */
export const NextMatch = Catalog.action('NextMatch', {
  what: 'Shows the next place the words were found',
  why: 'The person is looking for one place among the matches',
  enabled: whenMatches,
  meta: { label: 'Next match', keys: ['n'] },
})

/** Shows the match before the one on screen, and the last before the first. `N` presses it. */
export const PreviousMatch = Catalog.action('PreviousMatch', {
  what: 'Shows the place before, where the words were found',
  why: 'The person is looking for one place among the matches',
  enabled: whenMatches,
  meta: { label: 'Previous match', keys: ['N'] },
})

const matchTitleOf = (match: Match): string =>
  Array.join(
    Array.filter([match.before, match.text, match.after], part => part !== ''),
    ' ',
  )

const matchChoicesOf = (model: Model) =>
  Array.map(matchesOf(model), match => ({
    value: match.startMs,
    title: clockOf(match.startMs),
    detail: matchTitleOf(match),
  }))

/**
 * Shows one match in the words, by the time it starts, without moving
 * the audio: `ShowMatch:10802400`.
 */
export const ShowMatch = Catalog.action('ShowMatch', {
  fields: { placeMs: Milliseconds },
  choose: {
    field: 'placeMs',
    prompt: 'Which match?',
    token: PlaceToken,
    choicesOf: matchChoicesOf,
    nothingToChoose: 'there are no matches',
  },
  what: 'Shows one place the words were found',
  why: 'The person wants to read around that match',
  meta: { label: 'Show', keys: [], title: 'Show a match' },
})

/**
 * Plays from a place, such as a match: `PlayFrom:10802400` moves there
 * and plays, and the words follow the voice again. It offers the matches
 * in a menu and takes any place from the start to the end.
 */
export const PlayFrom = Catalog.action('PlayFrom', {
  fields: { placeMs: Milliseconds },
  choose: {
    field: 'placeMs',
    prompt: 'Play from where?',
    token: PlaceToken,
    choicesOf: matchChoicesOf,
    accepts: (model: Model, placeMs: Milliseconds) => {
      if (!hasAudio(model)) {
        return Catalog.Disabled({ because: noAudio })
      } else if (placeMs > model.media.durationMs) {
        return Catalog.Disabled({ because: 'that is past the end' })
      } else {
        return Catalog.Enabled()
      }
    },
    nothingToChoose: 'there is nowhere to play from',
  },
  what: 'Plays from a place in the recording',
  why: 'The person wants to hear that part',
  meta: { label: 'Play from here', keys: [], title: 'Play from a place' },
})

/**
 * Lets the words stay where the person put them while the audio plays
 * on, as scrolling the words away from the word sounding does.
 */
export const LeavePlayhead = Catalog.action('LeavePlayhead', {
  what: 'Lets the words stay where they are while it plays on',
  why: 'The person wants to read somewhere else than what is sounding',
  enabled: (model: Model) =>
    isFollowingPlayhead(model)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'the words are away from the playhead' }),
  meta: {
    label: 'Read elsewhere',
    keys: [],
    title: 'Stop following the voice',
  },
})

/** Shows the words being read again, and follows them. */
export const BackToPlayhead = Catalog.action('BackToPlayhead', {
  what: 'Shows the words being read again, and follows them',
  why: 'The person has read elsewhere and wants to follow the voice again',
  enabled: (model: Model) =>
    isFollowingPlayhead(model)
      ? Catalog.Disabled({ because: 'the words follow the playhead' })
      : Catalog.Enabled(),
  meta: { label: 'Back to playhead', keys: [] },
})

/** Every Action the Transcript Player offers, in the order surfaces list them. */
export const catalog = Catalog.make([
  Play,
  Pause,
  SkipBack,
  SkipForward,
  PreviousSection,
  NextSection,
  SeekTo,
  SeekToWord,
  SetSeekScope,
  SetSpeed,
  PreviousParagraph,
  NextParagraph,
  ShowSearch,
  CloseSearch,
  SearchFor,
  ClearSearch,
  NextMatch,
  PreviousMatch,
  ShowMatch,
  PlayFrom,
  LeavePlayhead,
  BackToPlayhead,
])

/**
 * The audio reached a place, at a moment by the wall clock: `placeMs` into
 * the recording at `wallClockMs` since 1970, so a holder knows what played
 * when, such as 12:03 into a book at 15:20:03.
 */
export const ReachedPlace = m('ReachedPlace', {
  placeMs: Milliseconds,
  wallClockMs: S.Number,
})
/** The audio reached the end of the recording. */
export const ReachedEnd = m('ReachedEnd')
/** The audio would not play, and why, safe to show. */
export const FailedPlayAudio = m('FailedPlayAudio', { reason: S.String })
/** The words near the place arrived. */
export const ReceivedPassages = m('ReceivedPassages', {
  passages: S.Array(Passage),
})
/** The words near the place could not be read, and why, safe to show. */
export const FailedLoadTranscript = m('FailedLoadTranscript', {
  reason: S.String,
})
/**
 * A search of the recording for `query` finished: how many places it
 * found, and the first of them, each with its time and a few words
 * around it.
 */
export const ReceivedMatches = m('ReceivedMatches', {
  query: SearchQuery,
  total: S.Int,
  matches: S.Array(Match),
})
/** The recording could not be searched for `query`, and why, safe to show. */
export const FailedSearch = m('FailedSearch', {
  query: SearchQuery,
  reason: S.String,
})

/** Every Message the Transcript Player accepts. */
export const Message = S.Union([
  ...catalog.Message.members,
  ReachedPlace,
  ReachedEnd,
  FailedPlayAudio,
  ReceivedPassages,
  FailedLoadTranscript,
  ReceivedMatches,
  FailedSearch,
])
/** A Transcript Player Message. */
export type Message = typeof Message.Type

/** True for a Transcript Player Message, so a parent can hand it down. */
export const isMessage = S.is(Message)

const searchTags: ReadonlySet<string> = new Set([
  ShowSearch.tag,
  CloseSearch.tag,
  SearchFor.tag,
  ClearSearch.tag,
  NextMatch.tag,
  PreviousMatch.tag,
  ShowMatch.tag,
  LeavePlayhead.tag,
  BackToPlayhead.tag,
  'ReceivedMatches',
  'FailedSearch',
])

/**
 * True for a Message about what one person is looking at: the search,
 * its matches, and whether the words follow the playhead. A Program that
 * shares its player between devices keeps these on the device that sent
 * them, so a search on a phone never moves the words on a desk.
 *
 * @example
 * ```typescript
 * isViewMessage(SearchFor({ query })) // true
 * isViewMessage(PlayFrom({ placeMs })) // false, the audio moves everywhere
 * ```
 */
export const isViewMessage = (message: Readonly<{ _tag: string }>): boolean =>
  searchTags.has(message._tag)

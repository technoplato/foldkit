import { Array, Option, Order } from 'effect'
import { Catalog } from 'foldkit'
import { Reader } from 'foldkit/behavior'
import {
  type ButtonNode,
  Column,
  type IconName,
  List,
  type ListItem,
  Row,
  Seek,
  type SeekLanding,
  Text,
  TextInput,
  Transcript,
  type TranscriptPassage,
  type TranscriptWordAction,
  type TranscriptWordMark,
  type UiNode,
  actionButtons,
  transcriptWithMatches,
} from 'foldkit/renderers'

import { Milliseconds, clockOf } from './ids.js'
import {
  BackToPlayhead,
  ClearSearch,
  CloseSearch,
  CloseWordMenu,
  LeavePlayhead,
  NextMatch,
  NextSection,
  Pause,
  Play,
  PlayFrom,
  PreviousMatch,
  PreviousSection,
  SearchFor,
  SeekTo,
  SeekToWord,
  SetSeekScope,
  ShowMatch,
  ShowSearch,
  ShowWordMenu,
  SkipBack,
  SkipForward,
} from './message.js'
import {
  type Match,
  type Model,
  type Passage,
  type Search,
  type SearchParts,
  type Section,
  currentPlaceOf,
  currentWordOf,
  isSounding,
  passagesOf,
  playbackClockOf,
  readerContext,
  searchQueryOf,
  sectionAt,
  selectedMatchOf,
  viewPlaceOf,
} from './model.js'
import { type Paragraph, paragraphsOf, startsSection } from './paragraphs.js'

// VIEW

type AnyAction = Readonly<{ tag: string }>

const passagesBefore = 1

const passagesAfter = 3

const buttonOf = (
  entries: ReadonlyArray<Catalog.Entry>,
  action: AnyAction,
  variant: ButtonNode['variant'],
): ReadonlyArray<ButtonNode> =>
  Array.map(
    actionButtons(Array.filter(entries, entry => entry.tag === action.tag)),
    button => ({ ...button, ...(variant === undefined ? {} : { variant }) }),
  )

const millisecondsPerMinute = 60_000

const minutesPerHour = 60

/**
 * How long is left as a person says it: `7h 34m left`, `12m left`.
 *
 * @example
 * ```typescript
 * leftWordsOf(Milliseconds.make(27_240_000)) // '7h 34m left'
 * ```
 */
export const leftWordsOf = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.round(ms / millisecondsPerMinute))
  const hours = Math.floor(totalMinutes / minutesPerHour)
  const minutes = totalMinutes % minutesPerHour
  return hours > 0
    ? `${hours.toString()}h ${minutes.toString()}m left`
    : `${minutes.toString()}m left`
}

const spannedSectionOf = (model: Model): Option.Option<Section> =>
  model.seekScope === 'Section'
    ? sectionAt(model.media, currentPlaceOf(model))
    : Option.none()

const landingWords = 8

const paragraphLandingOf = (paragraph: Paragraph): SeekLanding => {
  const first = Array.headNonEmpty(paragraph)
  const opening = Array.join(
    Array.map(Array.take(paragraph, landingWords), word => word.text),
    ' ',
  )
  return {
    value: first.startMs,
    text: `${clockOf(first.startMs)} · ${opening}${paragraph.length > landingWords ? '…' : ''}`,
  }
}

const wordsGapMs = 5000

const sectionLandingAt = (
  model: Model,
  placeMs: Milliseconds,
): ReadonlyArray<SeekLanding> =>
  Array.fromOption(
    Option.map(sectionAt(model.media, placeMs), section => ({
      value: placeMs,
      text: section.title,
    })),
  )

/**
 * What a drag of the seek bar will land on, in order of place: each
 * paragraph near the place, by the time it starts and its first words,
 * and outside the words at hand only the chapter, since the words there
 * have not been read yet.
 */
const landingsOf = (model: Model): ReadonlyArray<SeekLanding> => {
  const passages = passagesOf(model)
  return Array.sortWith(
    [
      ...Array.map(model.media.sections, section => ({
        value: section.startMs,
        text: section.title,
      })),
      ...Array.flatMap(passages, (passage, index) => [
        ...Array.map(
          paragraphsOf(model.media.sections, passage.words),
          paragraphLandingOf,
        ),
        ...(Option.exists(
          Array.get(passages, index + 1),
          next => next.startMs - passage.endMs <= wordsGapMs,
        )
          ? []
          : sectionLandingAt(model, passage.endMs)),
      ]),
    ],
    landing => landing.value,
    Order.Number,
  )
}

/**
 * The seek bar over this section, such as the chapter being heard, or the
 * whole recording, as the player's scope says. Moving it presses
 * `SeekTo:<place>`, a place in the whole recording either way. It names
 * what a drag will land on: the paragraph, where the words are at hand,
 * else the chapter.
 */
export const seekBarOf = (model: Model): UiNode => {
  const placeMs = currentPlaceOf(model)
  return Option.match(spannedSectionOf(model), {
    onNone: () =>
      Seek({
        value: placeMs,
        max: model.media.durationMs,
        step: 1000,
        action: SeekTo.tag,
        label: 'Place in the recording',
        valueText: `${clockOf(placeMs)} of ${clockOf(model.media.durationMs)}`,
        landings: landingsOf(model),
      }),
    onSome: section =>
      Seek({
        value: placeMs,
        min: section.startMs,
        max: section.endMs,
        step: 1000,
        action: SeekTo.tag,
        label: `Place in ${section.title}`,
        valueText: `${clockOf(Milliseconds.make(placeMs - section.startMs))} of ${clockOf(Milliseconds.make(section.endMs - section.startMs))} in ${section.title}`,
        landings: landingsOf(model),
      }),
  })
}

/**
 * Where the player is under the bar: in a chapter, how far into it, how
 * long the whole recording has left, and how long the chapter has left,
 * `3:13`, `7h 34m left`, `−1:30`; over the whole recording, the place and
 * what is left.
 */
export const timesOf = (model: Model): UiNode => {
  const placeMs = currentPlaceOf(model)
  return Option.match(spannedSectionOf(model), {
    onNone: () =>
      Row(
        { gap: 1 },
        Text(clockOf(placeMs), { mono: true, dim: true }),
        Text(
          `−${clockOf(Milliseconds.make(model.media.durationMs - placeMs))}`,
          { mono: true, dim: true, label: 'time left' },
        ),
      ),
    onSome: section =>
      Row(
        { gap: 1 },
        Text(clockOf(Milliseconds.make(placeMs - section.startMs)), {
          mono: true,
          dim: true,
          label: 'time into the chapter',
        }),
        Text(leftWordsOf(model.media.durationMs - placeMs), {
          dim: true,
        }),
        Text(
          `−${clockOf(Milliseconds.make(Math.max(0, section.endMs - placeMs)))}`,
          { mono: true, dim: true, label: 'time left in the chapter' },
        ),
      ),
  })
}

const ghost: ButtonNode['variant'] = 'Ghost'

const iconButtonOf = (
  entries: ReadonlyArray<Catalog.Entry>,
  action: AnyAction,
  icon: IconName,
  variant: ButtonNode['variant'],
): ReadonlyArray<ButtonNode> =>
  Array.map(buttonOf(entries, action, variant), button => ({
    ...button,
    icon,
    isIconOnly: true,
  }))

/** Play or Pause, as the player is, as one round icon. */
export const playPauseOf = (
  model: Model,
  entries: ReadonlyArray<Catalog.Entry>,
): ReadonlyArray<ButtonNode> =>
  isSounding(model)
    ? iconButtonOf(entries, Pause, 'Pause', 'Primary')
    : iconButtonOf(entries, Play, 'Play', 'Primary')

/** Back 30 seconds and Play or Pause, for a bar that has little room. */
export const miniTransportOf = (
  model: Model,
  entries: ReadonlyArray<Catalog.Entry>,
): ReadonlyArray<ButtonNode> => [
  ...iconButtonOf(entries, SkipBack, 'Back30', 'Ghost'),
  ...playPauseOf(model, entries),
]

/**
 * The transport as icons: the chapter before, back 30 seconds, Play or
 * Pause, forward 30 seconds, and the next chapter, from the entries the
 * Program that holds the player offers, so its own rules hold.
 */
export const transportOf = (
  model: Model,
  entries: ReadonlyArray<Catalog.Entry>,
): UiNode =>
  Row(
    { gap: 1 },
    ...(Array.isReadonlyArrayEmpty(model.media.sections)
      ? []
      : iconButtonOf(entries, PreviousSection, 'PreviousChapter', 'Ghost')),
    ...iconButtonOf(entries, SkipBack, 'Back30', 'Ghost'),
    ...playPauseOf(model, entries),
    ...iconButtonOf(entries, SkipForward, 'Forward30', 'Ghost'),
    ...(Array.isReadonlyArrayEmpty(model.media.sections)
      ? []
      : iconButtonOf(entries, NextSection, 'NextChapter', 'Ghost')),
  )

/**
 * Whether the bar spans this chapter or the whole book, as two buttons,
 * the current one marked. None for a recording without sections.
 */
export const seekScopeOf = (
  model: Model,
  entries: ReadonlyArray<Catalog.Entry>,
): ReadonlyArray<UiNode> =>
  Array.isReadonlyArrayEmpty(model.media.sections)
    ? []
    : [
        Row(
          { gap: 1 },
          ...Array.map(
            actionButtons(
              Array.flatMap(
                Array.filter(entries, entry => entry.tag === SetSeekScope.tag),
                Catalog.choicesAsEntries,
              ),
            ),
            button => ({
              ...button,
              variant: ghost,
              isCurrent: Option.exists(
                Catalog.parseChoiceTag(button.action ?? ''),
                choice => choice.token === model.seekScope,
              ),
              disabled: false,
            }),
          ),
        ),
      ]

const spokenWordsBefore = 4

const spokenWordsAfter = 8

/**
 * The words being spoken now as one short line, the word sounding in
 * brackets with a few on either side, for a surface with no room for the
 * transcript, such as a terminal's few lines after `books pause`. None
 * while no word near the place is known.
 *
 * @example
 * ```typescript
 * spokenLineOf(player) // Some('Evocation Earth, 114 [million] years ago, one morning just after')
 * ```
 */
export const spokenLineOf = (model: Model): Option.Option<string> =>
  Option.flatMap(currentWordOf(model), current => {
    const words = Array.flatMap(passagesOf(model), passage => passage.words)
    return Option.map(
      Array.findFirstIndex(words, word => word.wordId === current.wordId),
      index =>
        Array.join(
          Array.map(
            Array.take(
              Array.drop(words, Math.max(0, index - spokenWordsBefore)),
              Math.min(index, spokenWordsBefore) + 1 + spokenWordsAfter,
            ),
            word =>
              word.wordId === current.wordId ? `[${word.text}]` : word.text,
          ),
          ' ',
        ),
    )
  })

/** Why the audio would not play, while it would not. */
export const problemOf = (model: Model): ReadonlyArray<UiNode> =>
  model.transport._tag === 'Unplayable'
    ? [
        Text(`The audio would not play: ${model.transport.reason}`, {
          dim: true,
        }),
      ]
    : []

const indexOfPlace = (
  passages: ReadonlyArray<Passage>,
  placeMs: Milliseconds,
): number =>
  Option.getOrElse(
    Array.findLastIndex(passages, passage => passage.startMs <= placeMs),
    () => 0,
  )

const shownPassagesOf = (model: Model): ReadonlyArray<Passage> => {
  const passages = passagesOf(model)
  const index = indexOfPlace(passages, viewPlaceOf(model))
  return passages.slice(
    Math.max(0, index - passagesBefore),
    index + passagesAfter + 1,
  )
}

const headingLookbackMs = 5000

const emptyTextOf = (model: Model): string => {
  if (model.transcript._tag === 'TranscriptLoading') {
    return 'Loading the words…'
  } else if (model.transcript._tag === 'TranscriptUnavailable') {
    return `The words could not be read: ${model.transcript.reason}`
  } else {
    return 'There is no transcript for this part yet.'
  }
}

const playIcon: IconName = 'Play'

const picked: TranscriptWordMark = 'Picked'

/**
 * The words around the place on screen, a passage before and a few
 * after, the one sounding marked. Pressing a word plays from it; pressing
 * a passage's time moves there. It carries the player's clock and each
 * word's start, so a painter moves the mark on the word between the
 * once-a-second reports of the place, with `transcriptAt` from
 * `foldkit/renderers`.
 *
 * The words are the ones around the place being heard while they follow
 * it. Once the person scrolls away (a painter presses `LeavePlayhead`)
 * they stay put while the audio plays on, and at a match of a search
 * they are the words around the match, with the match to bring into
 * view. What a search found is marked, the match the person is on apart.
 * A word's menu opens when a painter presses `ShowWordMenu` with the
 * word; while one is open the Transcript carries it: `Play from here`,
 * then `wordActions`, what the Program that holds the player adds, such
 * as `Copy link to this word`, each pressed with the word.
 *
 * @example
 * ```typescript
 * transcriptOf(player)
 * // Transcript: [0:19] Evocation Earth, [114] million years ago…
 * ```
 */
export const transcriptOf = (
  model: Model,
  options: Readonly<{
    wordActions?: ReadonlyArray<TranscriptWordAction>
  }> = {},
): UiNode => {
  const sections = model.media.sections
  const maybeCurrentWordId = Option.map(
    currentWordOf(model),
    word => word.wordId,
  )
  const paragraphOf = (
    words: Paragraph,
    endMs: Milliseconds,
    afterMs: number,
  ): TranscriptPassage => {
    const first = Array.headNonEmpty(words)
    const maybeHeading = startsSection(sections, afterMs, first.startMs)
    return {
      key: first.wordId,
      ...Option.match(maybeHeading, {
        onNone: () => ({}),
        onSome: section => ({ heading: section.title }),
      }),
      label: clockOf(first.startMs),
      labelAction: `${SeekTo.tag}:${first.startMs.toString()}`,
      isCurrent:
        first.startMs <= currentPlaceOf(model) && currentPlaceOf(model) < endMs,
      words: Array.map(words, word => ({
        token: word.wordId,
        text: word.text,
        isCurrent: Option.contains(maybeCurrentWordId, word.wordId),
        startMs: word.startMs,
      })),
    }
  }
  const groups = Array.flatMap(shownPassagesOf(model), passage =>
    Array.map(paragraphsOf(sections, passage.words), words => ({
      words,
      passageEndMs: passage.endMs,
    })),
  )
  const paragraphs = Array.map(groups, ({ words, passageEndMs }, index) =>
    paragraphOf(
      words,
      Option.getOrElse(
        Option.map(
          Array.get(groups, index + 1),
          next => Array.headNonEmpty(next.words).startMs,
        ),
        () => passageEndMs,
      ),
      Option.getOrElse(
        Option.map(
          Array.get(groups, index - 1),
          previous => Array.lastNonEmpty(previous.words).startMs,
        ),
        () => Array.headNonEmpty(words).startMs - headingLookbackMs,
      ),
    ),
  )
  const plain = Transcript({
    label: 'Transcript',
    action: SeekToWord.tag,
    emptyText: emptyTextOf(model),
    passages: paragraphs,
    clock: playbackClockOf(model),
    wordMenuAction: ShowWordMenu.tag,
    ...Option.match(
      Option.filter(model.maybeWordMenu, wordId =>
        Array.some(paragraphs, paragraph =>
          Array.some(paragraph.words, word => word.token === wordId),
        ),
      ),
      {
        onNone: () => ({}),
        onSome: wordId => ({
          wordMenu: {
            token: wordId,
            dismissAction: CloseWordMenu.tag,
            items: [
              {
                action: `${SeekToWord.tag}:${wordId}`,
                label: 'Play from here',
                icon: playIcon,
              },
              ...Array.map(options.wordActions ?? [], wordAction => ({
                ...wordAction,
                action: `${wordAction.action}:${wordId}`,
              })),
            ],
          },
        }),
      },
    ),
  })
  const focused = Reader.project(model.reader, plain, {
    leaveAction: LeavePlayhead.tag,
  })
  const searched = Option.match(searchQueryOf(model), {
    onNone: () => focused,
    onSome: query =>
      transcriptWithMatches(
        focused,
        query,
        Option.getOrUndefined(
          Option.map(selectedMatchOf(model), match => match.startMs),
        ),
      ),
  })
  return Option.match(Option.fromNullishOr(searched.wordMenu), {
    onNone: () => searched,
    onSome: menu => ({
      ...searched,
      passages: Array.map(searched.passages, passage =>
        Array.some(passage.words, word => word.token === menu.token)
          ? {
              ...passage,
              words: Array.map(passage.words, word =>
                word.token === menu.token ? { ...word, mark: picked } : word,
              ),
            }
          : passage,
      ),
    }),
  })
}

// SEARCH

const matchTitleOf = (match: Match): string =>
  Array.join(
    Array.filter([match.before, match.text, match.after], part => part !== ''),
    ' ',
  )

const rowWordsBefore = 4

/**
 * The words before a match as a row shows them: the last few, so the
 * match stands near the start of the row and stays in view on a narrow
 * screen, with `…` where words were left off.
 */
const rowLeadOf = (before: string): string => {
  const words = Array.filter(before.split(' '), word => word !== '')
  return words.length > rowWordsBefore
    ? `… ${Array.join(Array.takeRight(words, rowWordsBefore), ' ')}`
    : before
}

const matchItemOf = (
  model: Model,
  entries: ReadonlyArray<Catalog.Entry>,
  match: Match,
): ListItem => {
  const token = match.startMs.toString()
  const lead = rowLeadOf(match.before)
  const markStart = lead === '' ? 0 : lead.length + 1
  return {
    key: token,
    title: matchTitleOf({ ...match, before: lead }),
    titleMark: { start: markStart, end: markStart + match.text.length },
    lines: [
      Array.join(
        [
          clockOf(match.startMs),
          ...Array.fromOption(
            Option.map(
              sectionAt(model.media, match.startMs),
              section => section.title,
            ),
          ),
        ],
        ' · ',
      ),
    ],
    action: `${ShowMatch.tag}:${token}`,
    isCurrent: Option.exists(
      selectedMatchOf(model),
      selected => selected.startMs === match.startMs,
    ),
    trailing: Array.map(
      actionButtons(
        Array.filter(
          Array.flatMap(
            Array.filter(entries, entry => entry.tag === PlayFrom.tag),
            Catalog.choicesAsEntries,
          ),
          entry => entry.tag === `${PlayFrom.tag}:${token}`,
        ),
      ),
      button => ({ ...button, icon: 'Play', isIconOnly: true, variant: ghost }),
    ),
  }
}

const searchFieldWidth = 28

const countOf = (count: number): string => count.toLocaleString('en-US')

const foundTextOf = (
  model: Model,
  search: Extract<Search, { _tag: 'SearchFound' }>,
): string => {
  const maybePosition = Option.flatMap(selectedMatchOf(model), selected =>
    Array.findFirstIndex(
      search.matches,
      match => match.startMs === selected.startMs,
    ),
  )
  if (search.total === 0) {
    return `No matches for “${search.query}”`
  } else {
    return Option.match(maybePosition, {
      onNone: () =>
        `${countOf(search.total)} ${search.total === 1 ? 'match' : 'matches'}`,
      onSome: position =>
        `${countOf(position + 1)} of ${countOf(search.total)}`,
    })
  }
}

/**
 * The line under the search field while only some of the recording's
 * words are in: how many parts of them, so a slow read is said, and the
 * matches above it are known to be only those found so far.
 */
const partsLineOf = (search: Search): ReadonlyArray<UiNode> =>
  Option.match(
    search._tag === 'Searching' || search._tag === 'SearchFound'
      ? search.maybeParts
      : Option.none<SearchParts>(),
    {
      onNone: () => [],
      onSome: parts => [
        Text(
          `Searching… ${parts.partsRead.toString()} of ${parts.partsTotal.toString()} parts`,
          { dim: true },
        ),
      ],
    },
  )

const searchTextOf = (model: Model, search: Search): string => {
  if (search._tag === 'SearchIdle') {
    return 'Type words, then Enter'
  } else if (search._tag === 'Searching') {
    return 'Searching…'
  } else if (search._tag === 'SearchFailed') {
    return `Could not search: ${search.reason}`
  } else {
    return foundTextOf(model, search)
  }
}

/**
 * The search while it is open, for a Program to place by the words: the
 * field to type in, which presses `SearchFor:<words>` on Enter and
 * `NextMatch` on Enter again; how the
 * search stands, `2 of 4`, `No matches for “lamp”`; the buttons to step
 * to the match before and after and to close; and each match as a row
 * with a few words around it, its time and its chapter. Pressing a row
 * shows that match in the words without moving the audio, and its play
 * button plays from it. Nothing while the search is closed.
 *
 * @example
 * ```typescript
 * searchPanelOf(player, entries)
 * // [Column: [lamp] 2 of 4 [↑] [↓] [Done], Matches: The keeper lit the lamp at dusk… · 0:11 · The Light [▶] …]
 * ```
 */
export const searchPanelOf = (
  model: Model,
  entries: ReadonlyArray<Catalog.Entry>,
): ReadonlyArray<UiNode> =>
  Option.match(model.maybeSearch, {
    onNone: () => [],
    onSome: search => [
      Column(
        { gap: 1 },
        Row(
          { gap: 1 },
          TextInput({
            value: Option.getOrElse(searchQueryOf(model), () => ''),
            placeholder: 'Search the words',
            label: 'Search the words',
            action: SearchFor.tag,
            clearAction: ClearSearch.tag,
            againAction: NextMatch.tag,
            focused: true,
            width: searchFieldWidth,
          }),
          Text(searchTextOf(model, search), { dim: true }),
          ...iconButtonOf(entries, PreviousMatch, 'PreviousMatch', 'Ghost'),
          ...iconButtonOf(entries, NextMatch, 'NextMatch', 'Ghost'),
          ...buttonOf(entries, CloseSearch, 'Ghost'),
        ),
        ...(search._tag === 'SearchFound' &&
        Array.isReadonlyArrayNonEmpty(search.matches)
          ? [
              List({
                label: 'Matches',
                items: Array.map(search.matches, match =>
                  matchItemOf(model, entries, match),
                ),
              }),
              ...(search.total > search.matches.length
                ? [
                    Text(
                      `Showing the first ${countOf(search.matches.length)} of ${countOf(search.total)}. Add a word to narrow it.`,
                      { dim: true },
                    ),
                  ]
                : []),
            ]
          : []),
        ...partsLineOf(search),
      ),
    ],
  })

const pill: ButtonNode['variant'] = 'Pill'

const withIconOf =
  (icon: IconName) =>
  (button: ButtonNode): ButtonNode => ({ ...button, icon })

const playheadIcon: IconName = 'Playhead'

/**
 * The reader's own buttons, for a Program to place by the words: `Back
 * to Playhead` while the words are away from the word sounding, and
 * `Search` while the search is closed. Whether the way back shows, and
 * what it is called, is Foldkit's reader rule's to say.
 *
 * @example
 * ```typescript
 * readerButtonsOf(player, entries) // [Search], or [Back to Playhead, Search] after scrolling away
 * ```
 */
export const readerButtonsOf = (
  model: Model,
  entries: ReadonlyArray<Catalog.Entry>,
): ReadonlyArray<ButtonNode> => [
  ...Option.match(Reader.returnControlOf(model.reader, readerContext), {
    onNone: () => [],
    onSome: control =>
      Array.map(buttonOf(entries, BackToPlayhead, pill), button => ({
        ...button,
        label: control.label,
        icon: playheadIcon,
      })),
  }),
  ...(Option.isSome(model.maybeSearch)
    ? []
    : Array.map(buttonOf(entries, ShowSearch, pill), withIconOf('Search'))),
]

/**
 * The whole player on one screen: the seek bar, the times, the transport,
 * why the audio would not play, and the words to read along with.
 */
export const playerScreen = (
  model: Model,
  entries: ReadonlyArray<Catalog.Entry>,
): UiNode =>
  Column(
    { gap: 1 },
    seekBarOf(model),
    timesOf(model),
    transportOf(model, entries),
    ...problemOf(model),
    transcriptOf(model),
  )

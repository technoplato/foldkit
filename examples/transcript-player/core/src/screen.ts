import { Array, Option } from 'effect'
import { Catalog } from 'foldkit'
import {
  type ButtonNode,
  Column,
  type IconName,
  Row,
  Seek,
  Text,
  Transcript,
  type TranscriptPassage,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'

import { Milliseconds, clockOf } from './ids.js'
import {
  NextSection,
  Pause,
  Play,
  PreviousSection,
  SeekTo,
  SeekToWord,
  SetSeekScope,
  SkipBack,
  SkipForward,
} from './message.js'
import {
  type Model,
  type Passage,
  type Section,
  type Word,
  currentWordOf,
  isSounding,
  passagesOf,
  sectionAt,
} from './model.js'

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
    ? sectionAt(model.media, model.placeMs)
    : Option.none()

/**
 * The seek bar over this section, such as the chapter being heard, or the
 * whole recording, as the player's scope says. Moving it presses
 * `SeekTo:<place>`, a place in the whole recording either way.
 */
export const seekBarOf = (model: Model): UiNode =>
  Option.match(spannedSectionOf(model), {
    onNone: () =>
      Seek({
        value: model.placeMs,
        max: model.media.durationMs,
        step: 1000,
        action: SeekTo.tag,
        label: 'Place in the recording',
        valueText: `${clockOf(model.placeMs)} of ${clockOf(model.media.durationMs)}`,
      }),
    onSome: section =>
      Seek({
        value: model.placeMs,
        min: section.startMs,
        max: section.endMs,
        step: 1000,
        action: SeekTo.tag,
        label: `Place in ${section.title}`,
        valueText: `${clockOf(Milliseconds.make(model.placeMs - section.startMs))} of ${clockOf(Milliseconds.make(section.endMs - section.startMs))} in ${section.title}`,
      }),
  })

/**
 * Where the player is under the bar: in a chapter, how far into it, how
 * long the whole recording has left, and how long the chapter has left,
 * `3:13`, `7h 34m left`, `−1:30`; over the whole recording, the place and
 * what is left.
 */
export const timesOf = (model: Model): UiNode =>
  Option.match(spannedSectionOf(model), {
    onNone: () =>
      Row(
        { gap: 1 },
        Text(clockOf(model.placeMs), { mono: true, dim: true }),
        Text(
          `−${clockOf(Milliseconds.make(model.media.durationMs - model.placeMs))}`,
          { mono: true, dim: true, label: 'time left' },
        ),
      ),
    onSome: section =>
      Row(
        { gap: 1 },
        Text(clockOf(Milliseconds.make(model.placeMs - section.startMs)), {
          mono: true,
          dim: true,
          label: 'time into the chapter',
        }),
        Text(leftWordsOf(model.media.durationMs - model.placeMs), {
          dim: true,
        }),
        Text(
          `−${clockOf(Milliseconds.make(Math.max(0, section.endMs - model.placeMs)))}`,
          { mono: true, dim: true, label: 'time left in the chapter' },
        ),
      ),
  })

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
  const index = indexOfPlace(passages, model.placeMs)
  return passages.slice(
    Math.max(0, index - passagesBefore),
    index + passagesAfter + 1,
  )
}

const paragraphPauseMs = 1500

const paragraphWords = 70

const sentenceEnd = /[.!?…]["”’')\]]*$/u

const startsSection = (
  sections: ReadonlyArray<Section>,
  afterMs: number,
  atMs: number,
): Option.Option<Section> =>
  Array.findFirst(
    sections,
    section => section.startMs > afterMs && section.startMs <= atMs,
  )

const endsParagraph = (
  sections: ReadonlyArray<Section>,
  word: Word,
  maybeNext: Option.Option<Word>,
  count: number,
): boolean =>
  Option.match(maybeNext, {
    onNone: () => true,
    onSome: next =>
      next.startMs - word.endMs >= paragraphPauseMs ||
      Option.isSome(startsSection(sections, word.startMs, next.startMs)) ||
      (count >= paragraphWords && sentenceEnd.test(word.text)),
  })

type Paragraphs = Readonly<{
  done: ReadonlyArray<Array.NonEmptyReadonlyArray<Word>>
  open: ReadonlyArray<Word>
}>

const noParagraphs: Paragraphs = { done: [], open: [] }

/**
 * A passage's words in paragraphs, so a five-minute passage reads as
 * prose: a paragraph ends at a pause of a second and a half, where a
 * section starts, or at the end of a sentence once it has 70 words.
 */
const paragraphsOf = (
  sections: ReadonlyArray<Section>,
  words: ReadonlyArray<Word>,
): ReadonlyArray<Array.NonEmptyReadonlyArray<Word>> =>
  Array.reduce(words, noParagraphs, (state, word, index): Paragraphs => {
    const open = Array.append(state.open, word)
    return endsParagraph(
      sections,
      word,
      Array.get(words, index + 1),
      open.length,
    )
      ? { done: Array.append(state.done, open), open: [] }
      : { done: state.done, open }
  }).done

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

/**
 * The words around the place, a passage before and a few after, the one
 * sounding marked. Pressing a word plays from it; pressing a passage's
 * time moves there.
 *
 * @example
 * ```typescript
 * transcriptOf(player)
 * // Transcript: [0:19] Evocation Earth, [114] million years ago…
 * ```
 */
export const transcriptOf = (model: Model): UiNode => {
  const sections = model.media.sections
  const maybeCurrentWordId = Option.map(
    currentWordOf(model),
    word => word.wordId,
  )
  const paragraphOf = (
    words: Array.NonEmptyReadonlyArray<Word>,
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
      isCurrent: first.startMs <= model.placeMs && model.placeMs < endMs,
      words: Array.map(words, word => ({
        token: word.wordId,
        text: word.text,
        isCurrent: Option.contains(maybeCurrentWordId, word.wordId),
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
  return Transcript({
    label: 'Transcript',
    action: SeekToWord.tag,
    emptyText: emptyTextOf(model),
    passages: paragraphs,
  })
}

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

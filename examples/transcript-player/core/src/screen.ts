import { Array, Option } from 'effect'
import type { Catalog } from 'foldkit'
import {
  type ButtonNode,
  Column,
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
  Pause,
  Play,
  SeekTo,
  SeekToWord,
  SkipBack,
  SkipForward,
} from './message.js'
import {
  type Model,
  type Passage,
  type Word,
  currentWordOf,
  isSounding,
  passagesOf,
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

/**
 * The seek bar over the whole recording. Moving it presses
 * `SeekTo:<place>`.
 */
export const seekBarOf = (model: Model): UiNode =>
  Seek({
    value: model.placeMs,
    max: model.media.durationMs,
    step: 1000,
    action: SeekTo.tag,
    label: 'Place in the recording',
    valueText: `${clockOf(model.placeMs)} of ${clockOf(model.media.durationMs)}`,
  })

/** Where the player is, and how long is left: `12:03` and `−9:01:00`. */
export const timesOf = (model: Model): UiNode =>
  Row(
    { gap: 24 },
    Text(clockOf(model.placeMs), { mono: true, dim: true }),
    Text(
      `−${clockOf(Milliseconds.make(model.media.durationMs - model.placeMs))}`,
      { mono: true, dim: true, label: 'time left' },
    ),
  )

/**
 * Back 30 seconds, Play or Pause, and forward 30 seconds, from the entries
 * the Program that holds the player offers, so its own rules hold.
 */
export const transportOf = (
  model: Model,
  entries: ReadonlyArray<Catalog.Entry>,
): UiNode =>
  Row(
    { gap: 12 },
    ...buttonOf(entries, SkipBack, 'Ghost'),
    ...buttonOf(entries, isSounding(model) ? Pause : Play, 'Primary'),
    ...buttonOf(entries, SkipForward, 'Ghost'),
  )

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

const endsParagraph = (
  word: Word,
  maybeNext: Option.Option<Word>,
  count: number,
): boolean =>
  Option.match(maybeNext, {
    onNone: () => true,
    onSome: next =>
      next.startMs - word.endMs >= paragraphPauseMs ||
      (count >= paragraphWords && sentenceEnd.test(word.text)),
  })

/**
 * A passage's words in paragraphs, so a five-minute passage reads as
 * prose: a paragraph ends at a pause of a second and a half, or at the
 * end of a sentence once it has 70 words.
 */
type Paragraphs = Readonly<{
  done: ReadonlyArray<Array.NonEmptyReadonlyArray<Word>>
  open: ReadonlyArray<Word>
}>

const noParagraphs: Paragraphs = { done: [], open: [] }

const paragraphsOf = (
  words: ReadonlyArray<Word>,
): ReadonlyArray<Array.NonEmptyReadonlyArray<Word>> =>
  Array.reduce(words, noParagraphs, (state, word, index): Paragraphs => {
    const open = Array.append(state.open, word)
    return endsParagraph(word, Array.get(words, index + 1), open.length)
      ? { done: Array.append(state.done, open), open: [] }
      : { done: state.done, open }
  }).done

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
  const maybeCurrentWordId = Option.map(
    currentWordOf(model),
    word => word.wordId,
  )
  const paragraphOf = (
    words: Array.NonEmptyReadonlyArray<Word>,
    endMs: Milliseconds,
  ): TranscriptPassage => {
    const first = Array.headNonEmpty(words)
    return {
      key: first.wordId,
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
  const paragraphs = Array.flatMap(shownPassagesOf(model), passage => {
    const groups = paragraphsOf(passage.words)
    return Array.map(groups, (words, index) =>
      paragraphOf(
        words,
        Option.getOrElse(
          Option.map(
            Array.get(groups, index + 1),
            next => Array.headNonEmpty(next).startMs,
          ),
          () => passage.endMs,
        ),
      ),
    )
  })
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
    { gap: 20 },
    seekBarOf(model),
    timesOf(model),
    transportOf(model, entries),
    ...problemOf(model),
    transcriptOf(model),
  )

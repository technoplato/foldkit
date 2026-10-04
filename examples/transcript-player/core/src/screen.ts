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
  const passageOf = (passage: Passage): TranscriptPassage => ({
    key: passage.passageId,
    label: clockOf(passage.startMs),
    labelAction: `${SeekTo.tag}:${passage.startMs.toString()}`,
    isCurrent:
      passage.startMs <= model.placeMs && model.placeMs < passage.endMs,
    words: Array.map(passage.words, word => ({
      token: word.wordId,
      text: word.text,
      isCurrent: Option.contains(maybeCurrentWordId, word.wordId),
    })),
  })
  return Transcript({
    label: 'Transcript',
    action: SeekToWord.tag,
    emptyText: emptyTextOf(model),
    passages: Array.map(shownPassagesOf(model), passageOf),
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

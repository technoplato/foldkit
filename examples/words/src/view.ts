import { Array, Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'

import {
  ClickedJumpBackward,
  ClickedJumpForward,
  ClickedPlayPause,
  ClickedWord,
  type Message,
  ScrubbedPlayback,
} from './message.js'
import {
  type Model,
  type Word,
  activeWordAt,
  audioFailureMessage,
  wordsDataFailureMessage,
} from './model.js'

const formatTime = (seconds: number): string => {
  const roundedSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(roundedSeconds / 60)
  const remainingSeconds = roundedSeconds % 60
  return `${minutes.toString()}:${remainingSeconds.toString().padStart(2, '0')}`
}

const maybeDurationForModel = (model: Model): Option.Option<number> => {
  if (Option.isSome(model.maybeDuration)) {
    return model.maybeDuration
  }
  if (model.load._tag !== 'LoadedWordsData') {
    return Option.none()
  }
  return Option.map(Array.last(model.load.data.words), word => word.end)
}

const playbackLabel = (model: Model): string =>
  M.value(model.playback).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      WaitingPlayback: () => 'Preparing',
      PausedPlayback: () => 'Play',
      PlayingPlayback: () => 'Pause',
      EndedPlayback: () => 'Replay',
      FailedPlayback: () => 'Retry',
    }),
  )

const wordLabel = (word: Word): string => {
  const speaker = word.speaker === undefined ? '' : `${word.speaker}, `
  return `${speaker}${word.text}, ${formatTime(word.start)}`
}

const wordView = (
  word: Word,
  maybeActiveWordID: Option.Option<string>,
): Html => {
  const h = html<Message>()
  const isActive =
    Option.isSome(maybeActiveWordID) && maybeActiveWordID.value === word.id
  const attributes = [
    h.AriaCurrent(isActive ? 'true' : 'false'),
    h.AriaLabel(wordLabel(word)),
    h.Class(
      isActive
        ? 'words-example__word words-example__word--active'
        : 'words-example__word',
    ),
    h.Key(word.id),
    h.OnClick(ClickedWord.make({ wordID: word.id })),
    h.Title(wordLabel(word)),
    h.Type('button'),
  ]
  return h.button(attributes, [word.text])
}

const controlsView = (model: Model): Html => {
  const h = html<Message>()
  const maybeDuration = maybeDurationForModel(model)
  const duration = Option.getOrElse(maybeDuration, () => 0)
  const isWaiting = model.playback._tag === 'WaitingPlayback'
  const isPlaying = model.playback._tag === 'PlayingPlayback'
  return h.div(
    [
      h.AriaLabel('Audio playback'),
      h.Class('words-example__controls'),
      h.Role('group'),
    ],
    [
      h.button(
        [
          h.AriaLabel('Jump backward 10 seconds'),
          h.Class('words-example__button'),
          h.Disabled(isWaiting),
          h.OnClick(ClickedJumpBackward.make({})),
          h.Type('button'),
        ],
        ['−10'],
      ),
      h.button(
        [
          h.AriaLabel(`${playbackLabel(model)} audio`),
          h.AriaPressed(isPlaying ? 'true' : 'false'),
          h.Class('words-example__button words-example__button--primary'),
          h.Disabled(isWaiting),
          h.OnClick(ClickedPlayPause.make({})),
          h.Type('button'),
        ],
        [playbackLabel(model)],
      ),
      h.input([
        h.AriaLabel('Audio position'),
        h.AriaValuemax(duration),
        h.AriaValuemin(0),
        h.AriaValuenow(model.currentTime),
        h.AriaValuetext(
          `${formatTime(model.currentTime)} of ${formatTime(duration)}`,
        ),
        h.Class('words-example__scrubber'),
        h.Disabled(isWaiting),
        h.Max(duration.toString()),
        h.Min('0'),
        h.OnInput(value =>
          ScrubbedPlayback.make({ seconds: globalThis.Number(value) }),
        ),
        h.Step('0.01'),
        h.Type('range'),
        h.Value(model.currentTime.toString()),
      ]),
      h.output(
        [h.AriaLive('polite'), h.Class('words-example__time')],
        [`${formatTime(model.currentTime)} / ${formatTime(duration)}`],
      ),
      h.button(
        [
          h.AriaLabel('Jump forward 10 seconds'),
          h.Class('words-example__button'),
          h.Disabled(isWaiting),
          h.OnClick(ClickedJumpForward.make({})),
          h.Type('button'),
        ],
        ['+10'],
      ),
    ],
  )
}

const loadedView = (model: Model): Html => {
  const h = html<Message>()
  if (model.load._tag !== 'LoadedWordsData') {
    return h.empty
  }
  const maybeActiveWordID = Option.map(
    activeWordAt(model.load.data.words, model.currentTime),
    word => word.id,
  )
  const maybePlaybackError =
    model.playback._tag === 'FailedPlayback'
      ? Option.some(audioFailureMessage(model.playback.failure))
      : Option.none()
  return h.section(
    [h.AriaLabel('Recording transcript'), h.Class('words-example__panel')],
    [
      controlsView(model),
      Option.match(maybePlaybackError, {
        onNone: () => h.empty,
        onSome: reason =>
          h.p([h.Class('words-example__error'), h.Role('alert')], [reason]),
      }),
      h.p(
        [h.Class('words-example__transcript')],
        Array.map(model.load.data.words, word =>
          wordView(word, maybeActiveWordID),
        ),
      ),
    ],
  )
}

const contentView = (model: Model): Html => {
  const h = html<Message>()
  return M.value(model.load).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      LoadingWordsData: () =>
        h.p(
          [h.AriaLive('polite'), h.Class('words-example__status')],
          ['Loading transcript…'],
        ),
      LoadedWordsData: () => loadedView(model),
      FailedWordsData: ({ failure }) =>
        h.p(
          [h.Class('words-example__error'), h.Role('alert')],
          [wordsDataFailureMessage(failure)],
        ),
    }),
  )
}

/** Renders the complete accessible Words element. */
export const view = (model: Model): Html => {
  const h = html<Message>()
  return h.main(
    [h.Class('words-example')],
    [
      h.header(
        [h.Class('words-example__header')],
        [
          h.p([h.Class('words-example__eyebrow')], ['Clip transcript']),
          h.h1([], ['Read and listen word by word']),
        ],
      ),
      contentView(model),
    ],
  )
}

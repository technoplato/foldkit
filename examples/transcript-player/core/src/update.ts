import { Match as M, Option } from 'effect'
import type { Command } from 'foldkit'

import { Milliseconds, type WordId } from './ids.js'
import type { Message } from './message.js'
import {
  type Model,
  Paused,
  Playing,
  TranscriptLoaded,
  TranscriptUnavailable,
  type Transport,
  Unplayable,
  hasAudio,
  isSounding,
  nextSectionOf,
  previousSectionOf,
  wordOf,
} from './model.js'
import {
  Advanced,
  Finished,
  Moved,
  type OutMessage,
  Stopped,
} from './outMessage.js'

// UPDATE

/** The Model, its Commands, and what it tells the Program holding it. */
export type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
  Option.Option<OutMessage>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const skipMs = 30_000

const unchanged = (model: Model): UpdateReturn => [model, [], Option.none()]

const clamped = (model: Model, placeMs: number): Milliseconds =>
  Milliseconds.make(
    Math.round(Math.min(model.media.durationMs, Math.max(0, placeMs))),
  )

const sounding = (model: Model, placeMs: Milliseconds): Model => ({
  ...model,
  placeMs,
  transport: Playing({ cue: model.nextCue }),
  nextCue: model.nextCue + 1,
})

const played = (model: Model): UpdateReturn => {
  if (isSounding(model) || !hasAudio(model)) {
    return unchanged(model)
  } else {
    const placeMs =
      model.placeMs >= model.media.durationMs
        ? Milliseconds.make(0)
        : model.placeMs
    return [sounding(model, placeMs), [], Option.none()]
  }
}

const stoppedAs = (model: Model, transport: Transport): UpdateReturn =>
  isSounding(model)
    ? [
        { ...model, transport },
        [],
        Option.some(Stopped({ placeMs: model.placeMs })),
      ]
    : unchanged(model)

const movedTo = (model: Model, placeMs: Milliseconds): UpdateReturn => [
  isSounding(model) ? sounding(model, placeMs) : { ...model, placeMs },
  [],
  Option.some(Moved({ placeMs })),
]

const playedFromWord = (model: Model, wordId: WordId): UpdateReturn =>
  Option.match(
    Option.filter(wordOf(model, wordId), () => hasAudio(model)),
    {
      onNone: () => unchanged(model),
      onSome: word => [
        sounding(model, word.startMs),
        [],
        Option.some(Moved({ placeMs: word.startMs })),
      ],
    },
  )

const reachedPlace = (model: Model, placeMs: Milliseconds): UpdateReturn =>
  isSounding(model)
    ? [{ ...model, placeMs }, [], Option.some(Advanced({ placeMs }))]
    : unchanged(model)

const reachedEnd = (model: Model): UpdateReturn =>
  isSounding(model)
    ? [
        { ...model, placeMs: model.media.durationMs, transport: Paused() },
        [],
        Option.some(Finished()),
      ]
    : unchanged(model)

/**
 * The Transcript Player's update. Play starts from the place, or from the
 * start once it has reached the end; a skip, a seek, or a word moves the
 * place and keeps playing if it was; the audio's own place, end, and
 * failure come back as facts. What a parent may act on, such as saving the
 * place, comes out as an OutMessage.
 *
 * @example
 * ```typescript
 * update(player, SeekTo({ placeMs: Milliseconds.make(60_000) }))
 * // [{ ...player, placeMs: 60000 }, [], Some(Moved({ placeMs: 60000 }))]
 * ```
 */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Play: () => played(model),
      Pause: () => stoppedAs(model, Paused()),
      SkipBack: () => movedTo(model, clamped(model, model.placeMs - skipMs)),
      SkipForward: () => movedTo(model, clamped(model, model.placeMs + skipMs)),
      SeekTo: ({ placeMs }) => movedTo(model, clamped(model, placeMs)),
      SeekToWord: ({ wordId }) => playedFromWord(model, wordId),
      PreviousSection: () =>
        Option.match(previousSectionOf(model), {
          onNone: () => unchanged(model),
          onSome: section => movedTo(model, section.startMs),
        }),
      NextSection: () =>
        Option.match(nextSectionOf(model), {
          onNone: () => unchanged(model),
          onSome: section => movedTo(model, section.startMs),
        }),
      SetSeekScope: ({ scope }) => [
        { ...model, seekScope: scope },
        [],
        Option.none(),
      ],
      SetSpeed: ({ speed }) => [{ ...model, speed }, [], Option.none()],
      ReachedPlace: ({ placeMs }) => reachedPlace(model, placeMs),
      ReachedEnd: () => reachedEnd(model),
      FailedPlayAudio: ({ reason }) => stoppedAs(model, Unplayable({ reason })),
      ReceivedPassages: ({ passages }) => [
        { ...model, transcript: TranscriptLoaded({ passages }) },
        [],
        Option.none(),
      ],
      FailedLoadTranscript: ({ reason }) => [
        { ...model, transcript: TranscriptUnavailable({ reason }) },
        [],
        Option.none(),
      ],
    }),
  )

import {
  CompletedPauseAudio,
  CompletedPlayAudio,
  CompletedSeekAudio,
  FailedFollowAlong,
  HeardFollowAlong,
  Message,
  Model,
  Word,
  initialModel,
  restore,
  update as coreUpdate,
} from 'books-core-example'
import { Effect, Schema as S } from 'effect'
import { Command, Program } from 'foldkit'

const FollowAlongPayload = S.Struct({
  itemId: S.String,
  body: S.String,
  words: S.Array(Word),
})

const readerAudio = (): HTMLAudioElement | undefined => {
  const element = document.getElementById('books-reader-audio')
  return element instanceof HTMLAudioElement ? element : undefined
}

/** Loads the local A New Earth word map for the Foldkit demo host. */
export const LoadFollowAlong = Command.define(
  'LoadFollowAlong',
  HeardFollowAlong,
  FailedFollowAlong,
)(
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch('/a-new-earth-evocation.words.json'),
      catch: () => new Error('follow-along request failed'),
    }).pipe(Effect.option)
    if (response._tag === 'None' || !response.value.ok) {
      return FailedFollowAlong()
    }
    const json = yield* Effect.tryPromise({
      try: () => response.value.json() as Promise<unknown>,
      catch: () => new Error('follow-along json failed'),
    }).pipe(Effect.option)
    if (json._tag === 'None') {
      return FailedFollowAlong()
    }
    const decoded = S.decodeUnknownOption(FollowAlongPayload)(json.value)
    if (decoded._tag === 'None') {
      return FailedFollowAlong()
    }
    return HeardFollowAlong(decoded.value)
  }),
)

/** Starts the mounted reader audio element. */
export const PlayAudio = Command.define(
  'PlayAudio',
  CompletedPlayAudio,
)(
  Effect.gen(function* () {
    const element = readerAudio()
    if (element !== undefined) {
      yield* Effect.promise(() => element.play().then(() => undefined, () => undefined))
    }
    return CompletedPlayAudio()
  }),
)

/** Pauses the mounted reader audio element. */
export const PauseAudio = Command.define(
  'PauseAudio',
  CompletedPauseAudio,
)(
  Effect.sync(() => {
    readerAudio()?.pause()
    return CompletedPauseAudio()
  }),
)

/** Seeks the mounted reader audio element. */
export const SeekAudio = Command.define(
  'SeekAudio',
  { seconds: S.Number },
  CompletedSeekAudio,
)(({ seconds }) =>
  Effect.sync(() => {
    const element = readerAudio()
    if (element !== undefined) {
      element.currentTime = seconds
    }
    return CompletedSeekAudio()
  }),
)

type Result = readonly [Model, ReadonlyArray<Command.Command<Message>>]

/** Core update plus host audio Commands. */
export const update = (model: Model, message: Message): Result => {
  const [next, commands] = coreUpdate(model, message)
  if (message._tag === 'PressedStartPlayback' && next.play._tag === 'PlayPlaying') {
    return [next, [...commands, PlayAudio()]]
  }
  if (message._tag === 'PressedResumePlayback' && next.play._tag === 'PlayPlaying') {
    return [next, [...commands, PlayAudio()]]
  }
  if (message._tag === 'PressedPausePlayback' && next.play._tag === 'PlayPaused') {
    return [next, [...commands, PauseAudio()]]
  }
  if (message._tag === 'PressedStopPlayback') {
    return [next, [...commands, PauseAudio()]]
  }
  if (message._tag === 'PressedSeekWord') {
    return [next, [...commands, SeekAudio({ seconds: message.start })]]
  }
  return [next, commands]
}

/** Foldkit host Program: loads the local follow-along map and drives audio. */
export const BooksFoldkitProgram = Program.make({
  id: 'books',
  version: 2,
  Model,
  Message,
  init: (): Result => [initialModel, [LoadFollowAlong()]],
  restore,
  update,
})

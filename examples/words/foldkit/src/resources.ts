import { Effect, Match as M, Schema as S, type Scope } from 'effect'
import { ManagedResource } from 'foldkit'
import {
  AcquiredAudioPlayer,
  AudioPlayer,
  type AudioPlayerHandle,
  AudioSource,
  Capture,
  type CompressedCopyReader,
  FailedAcquireAudioPlayer,
  GotCaptureMessage,
  type Message,
  type Model,
  ReleasedAudioPlayer,
  type WordsOriginService,
  audioSourceOf,
  captureSessionRequirementsOf,
} from 'words-core-example'

import { openFileAudio } from './audio.js'
import { openCaptureSession } from './capture.js'
import { openCopyAudio } from './copyAudio.js'

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Opens what the page asks to play: the recording's audio file, or its
 * compressed copy (Scribe ADR 0091), streamed while the recording runs.
 */
const openAudio = (
  source: AudioSource,
  copyReader: CompressedCopyReader,
): Effect.Effect<AudioPlayerHandle, Error, Scope.Scope> =>
  M.value(source).pipe(
    M.withReturnType<Effect.Effect<AudioPlayerHandle, Error, Scope.Scope>>(),
    M.tagsExhaustive({
      FileAudioSource: ({ url }) => openFileAudio(url),
      CopyAudioSource: copy => openCopyAudio(copy, copyReader),
    }),
  )

/**
 * The browser resources the Model asks for: the open recording's audio
 * element (its file, or its compressed copy read through `copyReader` while
 * it records), and the microphone with its live transcriber from Record until
 * the recording's audio is saved.
 */
export const makeManagedResources = (
  origin: WordsOriginService,
  copyReader: CompressedCopyReader,
) =>
  ManagedResource.make<Model, Message>()(entry => ({
    audioPlayer: entry(
      S.Option(S.Struct({ source: AudioSource, attempt: S.Number })),
      {
        resource: AudioPlayer,
        modelToMaybeRequirements: audioSourceOf,
        acquire: ({ source }) => openAudio(source, copyReader),
        release: player => player.close,
        onAcquired: () => AcquiredAudioPlayer(),
        onReleased: () => ReleasedAudioPlayer(),
        onAcquireError: error =>
          FailedAcquireAudioPlayer({ reason: reasonOf(error) }),
      },
    ),
    captureSession: entry(S.Option(S.Struct({ recordingID: S.String })), {
      resource: Capture.CaptureSession,
      modelToMaybeRequirements: captureSessionRequirementsOf,
      acquire: () => openCaptureSession(origin),
      release: session => session.close,
      onAcquired: () =>
        GotCaptureMessage({
          message: Capture.reportSessionAcquired(),
        }),
      onReleased: () =>
        GotCaptureMessage({
          message: Capture.reportSessionReleased(),
        }),
      onAcquireError: error =>
        GotCaptureMessage({
          message: Capture.reportSessionFailure({
            reason: reasonOf(error),
          }),
        }),
    }),
  }))

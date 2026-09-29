import { Schema as S } from 'effect'
import { ManagedResource } from 'foldkit'
import {
  AcquiredAudioPlayer,
  AudioPlayer,
  Capture,
  FailedAcquireAudioPlayer,
  GotCaptureMessage,
  type Message,
  type Model,
  ReleasedAudioPlayer,
  type WordsOriginService,
  audioSourceOf,
  captureSessionRequirementsOf,
} from 'words-core-example'

import { openAudio } from './audio.js'
import { openCaptureSession } from './capture.js'

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * The browser resources the Model asks for: the open recording's audio
 * element, and the microphone with its live transcriber from Record until the
 * recording's audio is saved.
 */
export const makeManagedResources = (origin: WordsOriginService) =>
  ManagedResource.make<Model, Message>()(entry => ({
    audioPlayer: entry(
      S.Option(S.Struct({ url: S.String, attempt: S.Number })),
      {
        resource: AudioPlayer,
        modelToMaybeRequirements: audioSourceOf,
        acquire: ({ url }) => openAudio(url),
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

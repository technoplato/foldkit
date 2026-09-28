import { Effect, Option, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { AudioPlayer, type AudioPlayerService } from './audioPlayer.js'
import {
  FailedObserveFileUrls,
  FailedObserveIdentity,
  FailedObserveRecording,
  FailedObserveRecordings,
  type Message,
  ObservedFileUrls,
  ObservedIdentity,
  ObservedRecording,
  ObservedRecordings,
} from './message.js'
import type { Model } from './model.js'
import { WordsStore, type WordsStoreError } from './store.js'
import { fileIDsOf, observedRecordingIDOf } from './update.js'

const reasonOf = (error: WordsStoreError): string =>
  `${error.operation}: ${String(error.cause)}`

/**
 * Live Instant observations: who is signed in, the recording list, the open
 * recording, and its file URLs, plus the audio player's events while it is
 * open. Each restarts when the Model value it depends on changes.
 */
export const subscriptions = Subscription.make<
  Model,
  Message,
  WordsStore | AudioPlayerService
>()(entry => ({
  identity: Subscription.persistent(
    Stream.unwrap(
      WordsStore.pipe(
        Effect.map(store =>
          store.observeIdentity.pipe(
            Stream.map(identity => ObservedIdentity({ identity })),
            Stream.catch(error =>
              Stream.make(FailedObserveIdentity({ reason: reasonOf(error) })),
            ),
          ),
        ),
      ),
    ),
  ),
  recordings: entry(
    { limit: S.Number },
    {
      modelToDependencies: model => ({ limit: model.recordingListLimit }),
      dependenciesToStream: ({ limit }) =>
        Stream.unwrap(
          WordsStore.pipe(
            Effect.map(store =>
              store.observeRecordings(limit).pipe(
                Stream.map(list =>
                  ObservedRecordings({
                    recordings: list.recordings,
                    skippedCount: list.skipped.count,
                    maybeSkippedReason: list.skipped.maybeFirstReason,
                  }),
                ),
                Stream.catch(error =>
                  Stream.make(
                    FailedObserveRecordings({ reason: reasonOf(error) }),
                  ),
                ),
              ),
            ),
          ),
        ),
    },
  ),
  recording: entry(
    { maybeRecordingID: S.Option(S.String) },
    {
      modelToDependencies: model => ({
        maybeRecordingID: observedRecordingIDOf(model),
      }),
      dependenciesToStream: ({ maybeRecordingID }) =>
        Option.match(maybeRecordingID, {
          onNone: () => Stream.empty,
          onSome: recordingID =>
            Stream.unwrap(
              WordsStore.pipe(
                Effect.map(store =>
                  store.observeRecording(recordingID).pipe(
                    Stream.map(decoded =>
                      ObservedRecording({
                        recordingID,
                        maybeDetail: decoded.maybeDetail,
                        skippedCount: decoded.skipped.count,
                        maybeSkippedReason: decoded.skipped.maybeFirstReason,
                      }),
                    ),
                    Stream.catch(error =>
                      Stream.make(
                        FailedObserveRecording({
                          recordingID,
                          reason: reasonOf(error),
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        }),
    },
  ),
  fileUrls: entry(
    { fileIDs: S.Array(S.String) },
    {
      modelToDependencies: model => ({ fileIDs: fileIDsOf(model) }),
      dependenciesToStream: ({ fileIDs }) =>
        Stream.unwrap(
          WordsStore.pipe(
            Effect.map(store =>
              store.observeFileUrls(fileIDs).pipe(
                Stream.map(fileUrls => ObservedFileUrls({ fileUrls })),
                Stream.catch(error =>
                  Stream.make(
                    FailedObserveFileUrls({ reason: reasonOf(error) }),
                  ),
                ),
              ),
            ),
          ),
        ),
    },
  ),
  audioEvents: entry(
    { isAudioPlayerReady: S.Boolean },
    {
      modelToDependencies: model => ({
        isAudioPlayerReady:
          model.playback._tag === 'ReadyPlayback' &&
          model.playback.audioPlayer._tag === 'AudioPlayerReady',
      }),
      dependenciesToStream: ({ isAudioPlayerReady }) =>
        Stream.when(
          Stream.unwrap(
            AudioPlayer.get.pipe(
              Effect.map(player => player.events),
              Effect.catchTag('ResourceNotAvailable', () =>
                Effect.succeed(Stream.empty),
              ),
            ),
          ),
          Effect.sync(() => isAudioPlayerReady),
        ),
    },
  ),
}))

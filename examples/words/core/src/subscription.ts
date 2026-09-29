import { Effect, Match as M, Option, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import * as Account from './account/index.js'
import { AudioPlayer, type AudioPlayerService } from './audioPlayer.js'
import * as Capture from './capture/index.js'
import {
  FailedObserveFileUrls,
  FailedObserveIdentity,
  FailedObserveRecording,
  FailedObserveRecordings,
  GotAccountMessage,
  GotCaptureMessage,
  GotShareMessage,
  type Message,
  ObservedFileUrls,
  ObservedIdentity,
  ObservedRecording,
  ObservedRecordings,
} from './message.js'
import type { Model } from './model.js'
import * as Share from './share/index.js'
import { WordsStore, type WordsStoreError } from './store.js'
import { fileIDsOf, observedRecordingIDOf, shareLinkTokenOf } from './update.js'

const reasonOf = (error: WordsStoreError): string =>
  `${error.operation}: ${String(error.cause)}`

const signedInUserIDOf = (model: Model): Option.Option<string> =>
  M.value(model.identity).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tag('SignedIn', ({ userID }) => Option.some(userID)),
    M.orElse(() => Option.none()),
  )

const accountSubscriptions = Subscription.lift(Account.subscriptions)<
  Model,
  Message
>({
  toChildModel: model => model.account,
  toParentMessage: message => GotAccountMessage({ message }),
})

const captureSubscriptions = Subscription.lift(Capture.subscriptions)<
  Model,
  Message
>({
  toChildModel: model => model.capture,
  toParentMessage: message => GotCaptureMessage({ message }),
})

/**
 * Live Instant observations: who is signed in, the recording list, the open
 * recording, and its file URLs, plus the audio player's events while it is
 * open. Each restarts when the Model value it depends on changes, including
 * the signed-in user, so signing in reloads what the account can read.
 */
const instantSubscriptions = Subscription.make<
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
    { limit: S.Number, maybeUserID: S.Option(S.String) },
    {
      modelToDependencies: model => ({
        limit: model.recordingListLimit,
        maybeUserID: signedInUserIDOf(model),
      }),
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
    { maybeRecordingID: S.Option(S.String), maybeUserID: S.Option(S.String) },
    {
      modelToDependencies: model => ({
        maybeRecordingID: observedRecordingIDOf(model),
        maybeUserID: signedInUserIDOf(model),
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

const openShareSheetRecordingIDOf = (model: Model): Option.Option<string> =>
  model.account.features.sharing === 'Enabled'
    ? M.value(model.share.sheet).pipe(
        M.withReturnType<Option.Option<string>>(),
        M.tag('ShareSheetOpen', ({ recordingID }) => Option.some(recordingID)),
        M.orElse(() => Option.none()),
      )
    : Option.none()

const openShareIDOf = (model: Model): Option.Option<string> =>
  M.value(model.route).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tag('Share', ({ shareID }) => Option.some(shareID)),
    M.orElse(() => Option.none()),
  )

const shareSubscriptions = Subscription.make<Model, Message, WordsStore>()(
  entry => ({
    recordingShares: entry(
      {
        maybeKey: S.Option(
          S.Struct({ recordingID: S.String, ownerUserID: S.String }),
        ),
      },
      {
        modelToDependencies: model => ({
          maybeKey: Option.all({
            recordingID: openShareSheetRecordingIDOf(model),
            ownerUserID: signedInUserIDOf(model),
          }),
        }),
        dependenciesToStream: ({ maybeKey }) =>
          Option.match(maybeKey, {
            onNone: () => Stream.empty,
            onSome: ({ recordingID, ownerUserID }) =>
              Stream.unwrap(
                WordsStore.pipe(
                  Effect.map(store =>
                    store.observeRecordingShares(recordingID, ownerUserID).pipe(
                      Stream.map(shares =>
                        GotShareMessage({
                          message: Share.reportShares({
                            shares,
                          }),
                        }),
                      ),
                      Stream.catch(error =>
                        Stream.make(
                          GotShareMessage({
                            message: Share.reportSharesFailure({
                              reason: reasonOf(error),
                            }),
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
    shareRecipients: entry(
      { maybeOwnerUserID: S.Option(S.String) },
      {
        modelToDependencies: model => ({
          maybeOwnerUserID: Option.flatMap(
            openShareSheetRecordingIDOf(model),
            () => signedInUserIDOf(model),
          ),
        }),
        dependenciesToStream: ({ maybeOwnerUserID }) =>
          Option.match(maybeOwnerUserID, {
            onNone: () => Stream.empty,
            onSome: ownerUserID =>
              Stream.unwrap(
                WordsStore.pipe(
                  Effect.map(store =>
                    store.observeShareRecipients(ownerUserID).pipe(
                      Stream.map(recipients =>
                        GotShareMessage({
                          message: Share.reportRecipients({
                            recipients,
                          }),
                        }),
                      ),
                      Stream.catch(() => Stream.empty),
                    ),
                  ),
                ),
              ),
          }),
      },
    ),
    sharedRange: entry(
      {
        maybeShare: S.Option(
          S.Struct({
            shareID: S.String,
            maybeLinkToken: S.Option(S.String),
            maybeViewerUserID: S.Option(S.String),
          }),
        ),
      },
      {
        modelToDependencies: model => ({
          maybeShare: Option.map(openShareIDOf(model), shareID => ({
            shareID,
            maybeLinkToken: shareLinkTokenOf(model),
            maybeViewerUserID: signedInUserIDOf(model),
          })),
        }),
        dependenciesToStream: ({ maybeShare }) =>
          Option.match(maybeShare, {
            onNone: () => Stream.empty,
            onSome: ({ shareID, maybeLinkToken, maybeViewerUserID }) =>
              Stream.unwrap(
                WordsStore.pipe(
                  Effect.map(store =>
                    store
                      .observeSharedRange(
                        shareID,
                        maybeLinkToken,
                        maybeViewerUserID,
                      )
                      .pipe(
                        Stream.map(maybeRange =>
                          GotShareMessage({
                            message: Share.reportSharedRange({
                              shareID,
                              maybeRange,
                            }),
                          }),
                        ),
                        Stream.catch(error =>
                          Stream.make(
                            GotShareMessage({
                              message: Share.reportSharedRangeFailure({
                                shareID,
                                reason: reasonOf(error),
                              }),
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
  }),
)

/** Every web Scribe Subscription: the Instant observations, the account recheck, the recorder, and sharing. */
export const subscriptions = Subscription.aggregate<
  Model,
  Message,
  | WordsStore
  | AudioPlayerService
  | Capture.CaptureSessionService
  | Capture.CaptureEnvironment
>()(
  instantSubscriptions,
  accountSubscriptions,
  captureSubscriptions,
  shareSubscriptions,
)

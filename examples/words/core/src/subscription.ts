import {
  Array,
  Clock,
  Duration,
  Effect,
  Match as M,
  Option,
  Schema as S,
  Stream,
} from 'effect'
import { Subscription } from 'foldkit'

import * as Account from './account/index.js'
import { AudioPlayer, type AudioPlayerService } from './audioPlayer.js'
import * as Capture from './capture/index.js'
import { KeyboardInput, ShortcutContext, shortcutFor } from './keyboard.js'
import { RecordingWindow } from './listWindow.js'
import {
  ChangedConnectivity,
  ElapsedOpeningPatience,
  FailedObserveFileUrls,
  FailedObserveIdentity,
  FailedObserveRecording,
  FailedObserveRecordings,
  GotAccountMessage,
  GotCaptureMessage,
  GotQuestionsMessage,
  GotShareMessage,
  type Message,
  ObservedFileUrls,
  ObservedIdentity,
  ObservedLiveBeat,
  ObservedRecording,
  ObservedRecordings,
  PressedShortcut,
  TickedLiveClock,
} from './message.js'
import type { Model } from './model.js'
import { NetworkStatus } from './network.js'
import { WordsOrigin } from './origin.js'
import * as Questions from './questions/index.js'
import * as Share from './share/index.js'
import {
  WordsStore,
  type WordsStoreError,
  storeFailureReasonOf,
} from './store.js'
import {
  audioOwnerOf,
  fileIDsOf,
  guestReaderShareIDOf,
  isCountingLiveOf,
  liveRoomRecordingIDsOf,
  observedRecordingIDOf,
  openingWaitOf,
  shareLinkTokenOf,
  shortcutContextOf,
} from './update.js'

const reasonOf = (error: WordsStoreError): string => storeFailureReasonOf(error)

const LIVE_CLOCK_INTERVAL = Duration.seconds(1)
const LIVE_BEAT_INTERVAL = Duration.seconds(5)

/** How long a recording opens before the page says it is still loading and offers Try Again. */
export const OPENING_PATIENCE = Duration.seconds(8)

const signedInUserIDOf = (model: Model): Option.Option<string> =>
  M.value(model.identity).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tag('SignedIn', ({ userID }) => Option.some(userID)),
    M.orElse(() => Option.none()),
  )

/**
 * The list window's snapshots as Messages, each tagged with the window it
 * answers, so a snapshot that arrives after the window moved is not taken for
 * the new window's rows.
 */
export const observeRecordingWindow = (
  window: RecordingWindow,
): Stream.Stream<Message, never, WordsStore> =>
  Stream.unwrap(
    WordsStore.pipe(
      Effect.map(store =>
        store.observeRecordings(window).pipe(
          Stream.map(snapshot =>
            ObservedRecordings({
              window,
              recordings: snapshot.recordings,
              skippedCount: snapshot.skipped.count,
              maybeSkippedReason: snapshot.skipped.maybeFirstReason,
              hasOlder: snapshot.hasOlder,
            }),
          ),
          Stream.catch(error =>
            Stream.make(
              FailedObserveRecordings({ window, reason: reasonOf(error) }),
            ),
          ),
        ),
      ),
    ),
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
 * Live Instant observations: who is signed in, the recording list's window,
 * the open recording, and its file URLs, plus the audio player's events while
 * it is open. Each restarts when the Model value it depends on changes,
 * including the signed-in user, so signing in reloads what the account can
 * read, and a moved list window asks for its pages.
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
    { window: RecordingWindow, maybeUserID: S.Option(S.String) },
    {
      modelToDependencies: model => ({
        window: model.recordingWindow,
        maybeUserID: signedInUserIDOf(model),
      }),
      dependenciesToStream: ({ window }) => observeRecordingWindow(window),
    },
  ),
  recording: entry(
    {
      maybeRecordingID: S.Option(S.String),
      maybeUserID: S.Option(S.String),
      attempt: S.Number,
    },
    {
      modelToDependencies: model => ({
        maybeRecordingID: observedRecordingIDOf(model),
        maybeUserID: signedInUserIDOf(model),
        attempt: model.recordingAttempt,
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
        isAudioPlayerReady: Option.exists(
          audioOwnerOf(model),
          owner => owner.audioPlayer._tag === 'AudioPlayerReady',
        ),
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
  Account.Model.isSharingEnabled(model.account)
    ? M.value(model.share.sheet).pipe(
        M.withReturnType<Option.Option<string>>(),
        M.tag('ShareSheetOpen', ({ recordingID }) => Option.some(recordingID)),
        M.orElse(() => Option.none()),
      )
    : Option.none()

/** Who is signed in, for the shares made to them; only once the origin says sharing is on. */
const receivingViewerOf = (
  model: Model,
): Option.Option<
  Readonly<{ userID: string; maybeEmail: Option.Option<string> }>
> =>
  Account.Model.isSharingEnabled(model.account)
    ? M.value(model.identity).pipe(
        M.withReturnType<
          Option.Option<
            Readonly<{ userID: string; maybeEmail: Option.Option<string> }>
          >
        >(),
        M.tag('SignedIn', ({ userID, maybeEmail }) =>
          Option.some({ userID, maybeEmail }),
        ),
        M.orElse(() => Option.none()),
      )
    : Option.none()

const openShareIDOf = (model: Model): Option.Option<string> =>
  M.value(model.route).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tag('Share', ({ shareID }) => Option.some(shareID)),
    M.orElse(() => Option.none()),
  )

/**
 * The share to read now. A link holder who is signed out reads it once they
 * have an identity (the guest sign-in, or the owner's account connecting):
 * Scribe's rules show a signed-out reader nothing, so reading earlier would
 * only flash "not found" (#754).
 */
const readableShareIDOf = (model: Model): Option.Option<string> =>
  Option.isSome(shareLinkTokenOf(model)) && model.identity._tag === 'SignedOut'
    ? Option.none()
    : openShareIDOf(model)

/**
 * Signs a share link's reader with no login in as an anonymous guest, once:
 * nothing more on success (the identity Subscription reports the guest), the
 * share page's failure when it does not land (#754).
 */
export const signInGuestReader = (
  maybeShareID: Option.Option<string>,
): Stream.Stream<Message, never, WordsStore> =>
  Option.match(maybeShareID, {
    onNone: () => Stream.empty,
    onSome: shareID =>
      Stream.unwrap(
        WordsStore.pipe(
          Effect.map(store =>
            Stream.fromEffect(store.signInAsGuest).pipe(
              Stream.drain,
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
  })

const shareSubscriptions = Subscription.make<Model, Message, WordsStore>()(
  entry => ({
    /**
     * Signs a share link's reader with no login in as an anonymous guest, so
     * the share's rules let them read its scrubbed copy (#754). The identity
     * Subscription reports the guest; a failure shows on the share page.
     */
    guestReader: entry(
      { maybeShareID: S.Option(S.String) },
      {
        modelToDependencies: model => ({
          maybeShareID: guestReaderShareIDOf(model),
        }),
        dependenciesToStream: ({ maybeShareID }) =>
          signInGuestReader(maybeShareID),
      },
    ),
    questions: entry(
      { isObserving: S.Boolean },
      {
        modelToDependencies: model => ({
          isObserving:
            model.route._tag === 'Questions' &&
            Option.isSome(signedInUserIDOf(model)),
        }),
        dependenciesToStream: ({ isObserving }) =>
          Stream.when(
            Stream.unwrap(
              WordsStore.pipe(
                Effect.map(store =>
                  store.observeQuestions.pipe(
                    Stream.map(observed =>
                      GotQuestionsMessage({
                        message: Questions.reportQuestions(observed),
                      }),
                    ),
                    Stream.catch(error =>
                      Stream.make(
                        GotQuestionsMessage({
                          message: Questions.reportQuestionsFailure({
                            reason: reasonOf(error),
                          }),
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Effect.sync(() => isObserving),
          ),
      },
    ),
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
    receivedShares: entry(
      {
        maybeViewer: S.Option(
          S.Struct({ userID: S.String, maybeEmail: S.Option(S.String) }),
        ),
      },
      {
        modelToDependencies: model => ({
          maybeViewer: receivingViewerOf(model),
        }),
        dependenciesToStream: ({ maybeViewer }) =>
          Option.match(maybeViewer, {
            onNone: () => Stream.empty,
            onSome: ({ userID, maybeEmail }) =>
              Stream.unwrap(
                WordsStore.pipe(
                  Effect.map(store =>
                    store.observeReceivedShares(userID, maybeEmail).pipe(
                      Stream.map(shares =>
                        GotShareMessage({
                          message: Share.reportReceivedShares({ shares }),
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
          maybeShare: Option.map(readableShareIDOf(model), shareID => ({
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

/**
 * The page's own inputs: keyboard shortcuts, answered only where they apply
 * (Space plays on a recording page with audio, R starts a recording where
 * New Recording shows), the wait before a slow recording says it is still
 * loading, the live clock and the live beats it counts from, and the
 * browser's network connection.
 */
const pageSubscriptions = Subscription.make<
  Model,
  Message,
  KeyboardInput | NetworkStatus | WordsOrigin
>()(entry => ({
  shortcuts: entry(
    { context: ShortcutContext },
    {
      modelToDependencies: model => ({ context: shortcutContextOf(model) }),
      dependenciesToStream: ({ context }) =>
        Stream.unwrap(
          KeyboardInput.pipe(
            Effect.map(keyboard =>
              keyboard.claimKeyPresses(press =>
                Option.map(shortcutFor(context, press), shortcut =>
                  PressedShortcut({ shortcut }),
                ),
              ),
            ),
          ),
        ),
    },
  ),
  openingPatience: entry(
    {
      maybeWait: S.Option(
        S.Struct({ recordingID: S.String, attempt: S.Number }),
      ),
    },
    {
      modelToDependencies: model => ({ maybeWait: openingWaitOf(model) }),
      dependenciesToStream: ({ maybeWait }) =>
        Option.match(maybeWait, {
          onNone: () => Stream.empty,
          onSome: ({ recordingID, attempt }) =>
            Stream.fromEffect(
              Effect.sleep(OPENING_PATIENCE).pipe(
                Effect.as(ElapsedOpeningPatience({ recordingID, attempt })),
              ),
            ),
        }),
    },
  ),
  liveClock: entry(
    { isCountingLive: S.Boolean },
    {
      modelToDependencies: model => ({
        isCountingLive: isCountingLiveOf(model),
      }),
      dependenciesToStream: ({ isCountingLive }) =>
        Stream.when(
          Stream.tick(LIVE_CLOCK_INTERVAL).pipe(
            Stream.mapEffect(() => Clock.currentTimeMillis),
            Stream.map(nowMs => TickedLiveClock({ nowMs })),
          ),
          Effect.sync(() => isCountingLive),
        ),
    },
  ),
  liveBeats: entry(
    { recordingIDs: S.Array(S.String) },
    {
      modelToDependencies: model => ({
        recordingIDs: liveRoomRecordingIDsOf(model),
      }),
      dependenciesToStream: ({ recordingIDs }) =>
        Array.isReadonlyArrayEmpty(recordingIDs)
          ? Stream.empty
          : Stream.unwrap(
              WordsOrigin.pipe(
                Effect.map(origin =>
                  Stream.tick(LIVE_BEAT_INTERVAL).pipe(
                    Stream.flatMap(() => Stream.fromIterable(recordingIDs)),
                    Stream.mapEffect(recordingID =>
                      origin.readLiveBeat(recordingID).pipe(
                        Effect.map(maybeBeat =>
                          Option.toArray(
                            Option.map(maybeBeat, beat =>
                              ObservedLiveBeat({ recordingID, beat }),
                            ),
                          ),
                        ),
                        Effect.catch(() => Effect.succeed([])),
                      ),
                    ),
                    Stream.flattenIterable,
                  ),
                ),
              ),
            ),
    },
  ),
  connectivity: Subscription.persistent(
    Stream.unwrap(
      NetworkStatus.pipe(
        Effect.map(network =>
          network.changes.pipe(
            Stream.map(connectivity => ChangedConnectivity({ connectivity })),
          ),
        ),
      ),
    ),
  ),
}))

/** Every web Scribe Subscription: the Instant observations, the account recheck, the recorder, sharing, the keyboard, the live clock and its beats, and the network. */
export const subscriptions = Subscription.aggregate<
  Model,
  Message,
  | WordsStore
  | AudioPlayerService
  | Capture.CaptureSessionService
  | Capture.CaptureEnvironment
  | KeyboardInput
  | NetworkStatus
  | WordsOrigin
>()(
  instantSubscriptions,
  accountSubscriptions,
  captureSubscriptions,
  shareSubscriptions,
  pageSubscriptions,
)

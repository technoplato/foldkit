import { Effect, Option, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import {
  IssueTracker,
  ProductCatalog,
  TriageInbox,
  describeIssueTrackerCause,
  describeIssueTrackerError,
} from '@foldkit/instant-tools/issues'
import {
  LeftoverPresence,
  LeftoverPresenceError,
} from '@foldkit/instant-tools/leftover'
import { Logger } from '@foldkit/instant-tools/logging'

import { IssueFiles, describeIssueFilesError } from './issueFiles.js'
import { catalogIssueQuery } from './issueQuery.js'
import {
  FailedObserveIssue,
  FailedObserveIssueFiles,
  FailedObserveIssueLogs,
  FailedObserveIssues,
  FailedObserveLeftoverPeers,
  FailedObserveProducts,
  FailedObserveTriageCandidates,
  type Message,
  ObservedIssue,
  ObservedIssueFiles,
  ObservedIssueLogs,
  ObservedIssues,
  ObservedLeftoverPeers,
  ObservedProducts,
  ObservedTriageCandidates,
} from './message.js'
import { type Model } from './model.js'

type Resources =
  | IssueFiles
  | IssueTracker
  | LeftoverPresence
  | Logger
  | ProductCatalog
  | TriageInbox

const leftoverPresenceFailureReason = (
  error: LeftoverPresenceError,
): string => {
  const cause =
    error.cause instanceof Error ? error.cause.message : String(error.cause)
  return `${error.operation}: ${cause}`
}

/** Observes the Issue collection, filing catalog, and selected Issue. */
export const subscriptions = Subscription.make<Model, Message, Resources>()(
  entry => ({
    issues: Subscription.persistent(
      Stream.unwrap(
        IssueTracker.pipe(
          Effect.map(tracker =>
            tracker.observe(catalogIssueQuery).pipe(
              Stream.map(issues => ObservedIssues.make({ issues })),
              Stream.catch(error =>
                Stream.make(
                  FailedObserveIssues.make({
                    reason: describeIssueTrackerError(error),
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    products: Subscription.persistent(
      Stream.unwrap(
        ProductCatalog.pipe(
          Effect.map(catalog =>
            catalog.observe.pipe(
              Stream.map(products => ObservedProducts.make({ products })),
              Stream.catch(error =>
                Stream.make(
                  FailedObserveProducts.make({
                    reason: describeIssueTrackerCause(error),
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    triageCandidates: Subscription.persistent(
      Stream.unwrap(
        TriageInbox.pipe(
          Effect.map(inbox =>
            inbox.observeCandidates.pipe(
              Stream.map(candidates =>
                ObservedTriageCandidates.make({ candidates }),
              ),
              Stream.catch(error =>
                Stream.make(
                  FailedObserveTriageCandidates.make({
                    reason: describeIssueTrackerCause(error),
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    selectedIssue: entry(
      { maybeIssueId: S.Option(S.String) },
      {
        modelToDependencies: model => ({
          maybeIssueId:
            model.navigation._tag === 'IssueDetail'
              ? Option.some(model.navigation.issueId)
              : Option.none(),
        }),
        dependenciesToStream: ({ maybeIssueId }) => {
          if (Option.isNone(maybeIssueId)) {
            return Stream.empty
          }
          const issueId = maybeIssueId.value
          return Stream.unwrap(
            IssueTracker.pipe(
              Effect.map(tracker =>
                tracker.observeIssue(issueId).pipe(
                  Stream.map(issue => ObservedIssue.make({ issue, issueId })),
                  Stream.catch(error =>
                    Stream.make(
                      FailedObserveIssue.make({
                        issueId,
                        reason: describeIssueTrackerError(error),
                      }),
                    ),
                  ),
                ),
              ),
            ),
          )
        },
      },
    ),
    // Scribe #1345: the open Issue's stored files, so its page draws the pictures.
    selectedIssueFiles: entry(
      { maybeIssueId: S.Option(S.String) },
      {
        modelToDependencies: model => ({
          maybeIssueId:
            model.navigation._tag === 'IssueDetail'
              ? Option.some(model.navigation.issueId)
              : Option.none(),
        }),
        dependenciesToStream: ({ maybeIssueId }) => {
          if (Option.isNone(maybeIssueId)) {
            return Stream.empty
          }
          const issueId = maybeIssueId.value
          return Stream.unwrap(
            IssueFiles.pipe(
              Effect.map(issueFiles =>
                issueFiles.observeIssueFiles(issueId).pipe(
                  Stream.map(files =>
                    ObservedIssueFiles.make({ files, issueId }),
                  ),
                  Stream.catch(error =>
                    Stream.make(
                      FailedObserveIssueFiles.make({
                        issueId,
                        reason: describeIssueFilesError(error),
                      }),
                    ),
                  ),
                ),
              ),
            ),
          )
        },
      },
    ),
    selectedIssueLogs: entry(
      { maybeIssueId: S.Option(S.String) },
      {
        modelToDependencies: model => ({
          maybeIssueId:
            model.navigation._tag === 'IssueDetail'
              ? Option.some(model.navigation.issueId)
              : Option.none(),
        }),
        dependenciesToStream: ({ maybeIssueId }) => {
          if (Option.isNone(maybeIssueId)) {
            return Stream.empty
          }
          const issueId = maybeIssueId.value
          return Stream.unwrap(
            Logger.pipe(
              Effect.map(logger =>
                logger.observeIssue(issueId).pipe(
                  Stream.map(logs => ObservedIssueLogs.make({ issueId, logs })),
                  Stream.catch(error =>
                    Stream.make(
                      FailedObserveIssueLogs.make({
                        issueId,
                        reason: describeIssueTrackerCause(error),
                      }),
                    ),
                  ),
                ),
              ),
            ),
          )
        },
      },
    ),
    leftoverPresence: entry(
      { maybeLeftoverId: S.Option(S.String) },
      {
        modelToDependencies: model => ({
          maybeLeftoverId:
            model.navigation._tag === 'IssueDetail'
              ? Option.some(model.navigation.issueId)
              : Option.none(),
        }),
        dependenciesToStream: ({ maybeLeftoverId }) => {
          if (Option.isNone(maybeLeftoverId)) {
            return Stream.empty
          }
          const leftoverId = maybeLeftoverId.value
          return Stream.unwrap(
            LeftoverPresence.pipe(
              Effect.map(presence =>
                presence.observeLeftoverRoom(leftoverId).pipe(
                  Stream.map(peers =>
                    ObservedLeftoverPeers.make({ leftoverId, peers }),
                  ),
                  Stream.catch(error =>
                    Stream.make(
                      FailedObserveLeftoverPeers.make({
                        leftoverId,
                        reason:
                          error instanceof LeftoverPresenceError
                            ? leftoverPresenceFailureReason(error)
                            : String(error),
                      }),
                    ),
                  ),
                ),
              ),
            ),
          )
        },
      },
    ),
  }),
)

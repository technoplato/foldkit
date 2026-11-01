import { Clock, Effect, Option, Schema as S, Stream } from 'effect'
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

import { PageEntity } from './entityGraph.js'
import { IssueFiles, describeIssueFilesError } from './issueFiles.js'
import {
  type IssueLandingError,
  IssueLandings,
  type IssueLandingsService,
  type PageFacts,
  describeIssueLandingError,
} from './issueLandings.js'
import { catalogIssueQuery } from './issueQuery.js'
import {
  FailedObserveBuilds,
  FailedObserveIssue,
  FailedObserveIssueFiles,
  FailedObserveIssueLanding,
  FailedObserveIssueLogs,
  FailedObserveIssues,
  FailedObserveLeftoverPeers,
  FailedObservePageFacts,
  FailedObserveProducts,
  FailedObserveTriageCandidates,
  type Message,
  ObservedBuilds,
  ObservedIssue,
  ObservedIssueFiles,
  ObservedIssueLanding,
  ObservedIssueLogs,
  ObservedLeftoverPeers,
  ObservedPageFacts,
  ObservedProducts,
  ObservedTriageCandidates,
  TickedClock,
  observedIssuesOf,
} from './message.js'
import { type Model } from './model.js'

type Resources =
  | IssueFiles
  | IssueLandings
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

const clockReadEvery = '1 minute'

/**
 * The reader's clock: once when the tracker opens, then each minute, so
 * `3 h ago` stays true while a page is open.
 */
const clockStream: Stream.Stream<Message> = Stream.tick(clockReadEvery).pipe(
  Stream.mapEffect(() =>
    Effect.map(Clock.currentTimeMillis, nowMs =>
      TickedClock.make({
        nowMs,
        offsetMinutes: -new Date(nowMs).getTimezoneOffset(),
      }),
    ),
  ),
)

/** Observes the Issue collection, filing catalog, and selected Issue. */
export const subscriptions = Subscription.make<Model, Message, Resources>()(
  entry => ({
    clock: Subscription.persistent(clockStream),
    issues: Subscription.persistent(
      Stream.unwrap(
        IssueTracker.pipe(
          Effect.map(tracker =>
            tracker.observe(catalogIssueQuery).pipe(
              Stream.map(observedIssuesOf),
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

const factsStream = (
  landings: IssueLandingsService,
  entity: PageEntity,
): Stream.Stream<PageFacts, IssueLandingError> => {
  if (entity._tag === 'BuildEntity') {
    return landings.observeBuildFacts(entity.number)
  } else if (entity._tag === 'CommitEntity') {
    return landings.observeCommitFacts(entity.sha)
  } else if (entity._tag === 'RecordingEntity') {
    return landings.observeRecordingFacts(entity.recordingId)
  } else if (entity._tag === 'SegmentEntity') {
    return landings.observeSegmentFacts(entity.segmentId)
  } else {
    return Stream.empty
  }
}

/**
 * Observes what Scribe's rows say about the page open: where its Issue landed,
 * or what its build or commit is.
 */
export const graphSubscriptions = Subscription.make<
  Model,
  Message,
  IssueLandings
>()(entry => ({
  selectedIssueLanding: entry(
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
          IssueLandings.pipe(
            Effect.map(landings =>
              landings.observeIssueLanding(issueId).pipe(
                Stream.map(landing =>
                  ObservedIssueLanding.make({ issueId, landing }),
                ),
                Stream.catch(error =>
                  Stream.make(
                    FailedObserveIssueLanding.make({
                      issueId,
                      reason: describeIssueLandingError(error),
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
  selectedEntityFacts: entry(
    { maybeEntity: S.Option(PageEntity) },
    {
      modelToDependencies: model => ({
        maybeEntity:
          model.navigation._tag === 'EntityPage'
            ? Option.some(model.navigation.entity)
            : Option.none(),
      }),
      dependenciesToStream: ({ maybeEntity }) => {
        if (Option.isNone(maybeEntity)) {
          return Stream.empty
        }
        const entity = maybeEntity.value
        return Stream.unwrap(
          IssueLandings.pipe(
            Effect.map(landings =>
              factsStream(landings, entity).pipe(
                Stream.map(facts => ObservedPageFacts.make({ entity, facts })),
                Stream.catch(error =>
                  Stream.make(
                    FailedObservePageFacts.make({
                      entity,
                      reason: describeIssueLandingError(error),
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
  knownBuilds: entry(
    { isPageWithChips: S.Boolean },
    {
      modelToDependencies: model => ({
        isPageWithChips:
          model.navigation._tag === 'IssueDetail' ||
          model.navigation._tag === 'EntityPage',
      }),
      dependenciesToStream: ({ isPageWithChips }) =>
        isPageWithChips
          ? Stream.unwrap(
              IssueLandings.pipe(
                Effect.map(landings =>
                  landings.observeBuilds.pipe(
                    Stream.map(builds => ObservedBuilds.make({ builds })),
                    Stream.catch(error =>
                      Stream.make(
                        FailedObserveBuilds.make({
                          reason: describeIssueLandingError(error),
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : Stream.empty,
    },
  ),
}))

import { Array, Clock, Effect, Option, Schema as S, Stream } from 'effect'
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

import { PageEntity, recordingNumbersOf } from './entityGraph.js'
import { GraphRows, type GraphRowsService } from './graphRows.js'
import { IssueFiles, describeIssueFilesError } from './issueFiles.js'
import {
  type IssueLandingError,
  IssueLandings,
  type IssueLandingsService,
  type PageFacts,
  describeIssueLandingError,
} from './issueLandings.js'
import { catalogIssueQuery } from './issueQuery.js'
import { IssueViews, describeIssueViewError } from './issueViews.js'
import { loadedIssuesIn, shownIssueIdOf } from './listing.js'
import {
  FailedObserveAgentChips,
  FailedObserveBuilds,
  FailedObserveDecisions,
  FailedObserveFeatureChips,
  FailedObserveFeatures,
  FailedObserveFindings,
  FailedObserveIssue,
  FailedObserveIssueAgents,
  FailedObserveIssueChildren,
  FailedObserveIssueFiles,
  FailedObserveIssueGraph,
  FailedObserveIssueLanding,
  FailedObserveIssueLogs,
  FailedObserveIssueReferences,
  FailedObserveIssues,
  FailedObserveLeftoverPeers,
  FailedObservePageFacts,
  FailedObserveProducts,
  FailedObserveQuestions,
  FailedObserveReminders,
  FailedObserveSavedViews,
  FailedObserveTriageCandidates,
  type Message,
  ObservedAgentChips,
  ObservedBuilds,
  ObservedFeatureChips,
  ObservedFeatures,
  ObservedFindings,
  ObservedIssue,
  ObservedIssueAgents,
  ObservedIssueChildren,
  ObservedIssueFiles,
  ObservedIssueGraph,
  ObservedIssueLanding,
  ObservedIssueLogs,
  ObservedIssueReferences,
  ObservedLeftoverPeers,
  ObservedPageFacts,
  ObservedProducts,
  ObservedSavedViews,
  ObservedTriageCandidates,
  TickedClock,
  observedDecisionsOf,
  observedIssuesOf,
  observedQuestionsOf,
  observedRemindersOf,
} from './message.js'
import { type Model } from './model.js'
import {
  agentHandlesOfPage,
  issueNumberOfPage,
  pageCites,
  pageReadsDecisions,
} from './pageAgents.js'

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
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    ),
  ),
)

/** Observes the Issue collection, filing catalog, and selected Issue. */
export const subscriptions: Readonly<
  Record<
    | 'clock'
    | 'issues'
    | 'products'
    | 'triageCandidates'
    | 'selectedIssue'
    | 'selectedIssueFiles'
    | 'selectedIssueLogs'
    | 'leftoverPresence',
    Subscription.Subscriptions<Model, Message, Resources>[string]
  >
> = Subscription.make<Model, Message, Resources>()(entry => ({
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
}))

/**
 * The Recording a page shows: its id, or for `/recordings/208` the id the
 * catalog's mentions give that number, once they are loaded.
 */
const recordingIdOfPage = (model: Model): Option.Option<string> => {
  if (model.navigation._tag !== 'EntityPage') {
    return Option.none()
  }
  const { entity } = model.navigation
  if (entity._tag === 'RecordingEntity') {
    return Option.some(entity.recordingId)
  } else if (entity._tag === 'RecordingNumberEntity') {
    return Option.fromUndefinedOr(
      recordingNumbersOf(loadedIssuesIn(model)).idOfNumber.get(
        entity.recordingNumber,
      ),
    )
  }
  return Option.none()
}

const factsStream = (
  landings: IssueLandingsService,
  graph: GraphRowsService,
  entity: PageEntity,
  maybeRecordingId: Option.Option<string>,
): Stream.Stream<PageFacts, IssueLandingError> => {
  if (entity._tag === 'AgentEntity') {
    return graph.observeAgentFacts(entity.agentId)
  } else if (entity._tag === 'DecisionEntity') {
    return graph.observeDecisionFacts(entity.decisionId)
  } else if (entity._tag === 'QuestionEntity') {
    return graph.observeQuestionFacts(entity.questionId)
  } else if (entity._tag === 'ReminderEntity') {
    return graph.observeReminderFacts(entity.reminderId)
  } else if (entity._tag === 'SessionEntity') {
    return graph.observeSessionFacts(entity.sessionId)
  } else if (entity._tag === 'FindingEntity') {
    return graph.observeFindingFacts(entity.findingId)
  } else if (entity._tag === 'FeatureEntity') {
    return graph.observeFeatureFacts(entity.slug)
  } else if (entity._tag === 'ProductEntity') {
    return graph.observeProductFacts(entity.productId)
  } else if (entity._tag === 'BuildEntity') {
    return landings.observeBuildFacts(entity.number)
  } else if (entity._tag === 'CommitEntity') {
    return landings.observeCommitFacts(entity.sha)
  } else if (
    entity._tag === 'RecordingEntity' ||
    entity._tag === 'RecordingNumberEntity'
  ) {
    return Option.match(maybeRecordingId, {
      onNone: () => Stream.empty,
      onSome: landings.observeRecordingFacts,
    })
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
export const graphSubscriptions: Readonly<
  Record<
    | 'selectedIssueLanding'
    | 'selectedEntityFacts'
    | 'decisions'
    | 'questions'
    | 'reminders'
    | 'features'
    | 'findings'
    | 'knownAgents'
    | 'knownBuilds'
    | 'selectedIssueGraph'
    | 'selectedIssueAgents'
    | 'selectedIssueChildren'
    | 'selectedIssueReferences'
    | 'knownFeatures',
    Subscription.Subscriptions<
      Model,
      Message,
      GraphRows | IssueLandings
    >[string]
  >
> = Subscription.make<Model, Message, GraphRows | IssueLandings>()(entry => ({
  selectedIssueLanding: entry(
    { maybeIssueId: S.Option(S.String) },
    {
      modelToDependencies: model => ({
        maybeIssueId: shownIssueIdOf(model),
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
    {
      maybeEntity: S.Option(PageEntity),
      maybeRecordingId: S.Option(S.String),
    },
    {
      modelToDependencies: model => ({
        maybeEntity:
          model.navigation._tag === 'EntityPage'
            ? Option.some(model.navigation.entity)
            : Option.none(),
        maybeRecordingId: recordingIdOfPage(model),
      }),
      dependenciesToStream: ({ maybeEntity, maybeRecordingId }) => {
        if (Option.isNone(maybeEntity)) {
          return Stream.empty
        }
        const entity = maybeEntity.value
        return Stream.unwrap(
          Effect.gen(function* () {
            const landings = yield* IssueLandings
            const graph = yield* GraphRows
            return factsStream(landings, graph, entity, maybeRecordingId).pipe(
              Stream.map(facts => ObservedPageFacts.make({ entity, facts })),
              Stream.catch(error =>
                Stream.make(
                  FailedObservePageFacts.make({
                    entity,
                    reason: describeIssueLandingError(error),
                  }),
                ),
              ),
            )
          }),
        )
      },
    },
  ),
  findings: entry(
    { isFindingsPage: S.Boolean },
    {
      modelToDependencies: model => ({
        isFindingsPage: model.navigation._tag === 'Findings',
      }),
      dependenciesToStream: ({ isFindingsPage }) =>
        isFindingsPage
          ? Stream.unwrap(
              GraphRows.pipe(
                Effect.map(graph =>
                  graph.observeFindings.pipe(
                    Stream.map(findings => ObservedFindings.make({ findings })),
                    Stream.catch(error =>
                      Stream.make(
                        FailedObserveFindings.make({
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
  decisions: entry(
    { isReadingDecisions: S.Boolean },
    {
      modelToDependencies: model => ({
        isReadingDecisions: pageReadsDecisions(model),
      }),
      dependenciesToStream: ({ isReadingDecisions }) =>
        isReadingDecisions
          ? Stream.unwrap(
              GraphRows.pipe(
                Effect.map(graph =>
                  graph.observeDecisions.pipe(
                    Stream.map(observedDecisionsOf),
                    Stream.catch(error =>
                      Stream.make(
                        FailedObserveDecisions.make({
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
  questions: entry(
    { isReadingQuestions: S.Boolean },
    {
      modelToDependencies: model => ({
        isReadingQuestions:
          model.navigation._tag === 'Questions' ||
          pageCites(model, 'QuestionEntity'),
      }),
      dependenciesToStream: ({ isReadingQuestions }) =>
        isReadingQuestions
          ? Stream.unwrap(
              GraphRows.pipe(
                Effect.map(graph =>
                  graph.observeQuestions.pipe(
                    Stream.map(observedQuestionsOf),
                    Stream.catch(error =>
                      Stream.make(
                        FailedObserveQuestions.make({
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
  reminders: entry(
    { isReadingReminders: S.Boolean },
    {
      modelToDependencies: model => ({
        isReadingReminders:
          model.navigation._tag === 'Reminders' ||
          pageCites(model, 'ReminderEntity'),
      }),
      dependenciesToStream: ({ isReadingReminders }) =>
        isReadingReminders
          ? Stream.unwrap(
              GraphRows.pipe(
                Effect.map(graph =>
                  graph.observeReminders.pipe(
                    Stream.map(observedRemindersOf),
                    Stream.catch(error =>
                      Stream.make(
                        FailedObserveReminders.make({
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
  features: entry(
    { isFeaturesPage: S.Boolean },
    {
      modelToDependencies: model => ({
        isFeaturesPage: model.navigation._tag === 'Features',
      }),
      dependenciesToStream: ({ isFeaturesPage }) =>
        isFeaturesPage
          ? Stream.unwrap(
              GraphRows.pipe(
                Effect.map(graph =>
                  graph.observeFeatures.pipe(
                    Stream.map(features => ObservedFeatures.make({ features })),
                    Stream.catch(error =>
                      Stream.make(
                        FailedObserveFeatures.make({
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
  knownFeatures: entry(
    { isPageWithChips: S.Boolean },
    {
      modelToDependencies: model => ({
        isPageWithChips:
          model.navigation._tag === 'IssueDetail' ||
          model.navigation._tag === 'EntityPage' ||
          model.layer._tag === 'ChoiceLayer',
      }),
      dependenciesToStream: ({ isPageWithChips }) =>
        isPageWithChips
          ? Stream.unwrap(
              GraphRows.pipe(
                Effect.map(graph =>
                  graph.observeFeatureChips.pipe(
                    Stream.map(features =>
                      ObservedFeatureChips.make({ features }),
                    ),
                    Stream.catch(error =>
                      Stream.make(
                        FailedObserveFeatureChips.make({
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
  selectedIssueChildren: entry(
    { maybeIssueId: S.Option(S.String) },
    {
      modelToDependencies: model => ({
        maybeIssueId: shownIssueIdOf(model),
      }),
      dependenciesToStream: ({ maybeIssueId }) => {
        if (Option.isNone(maybeIssueId)) {
          return Stream.empty
        }
        const issueId = maybeIssueId.value
        return Stream.unwrap(
          GraphRows.pipe(
            Effect.map(graph =>
              graph.observeIssueChildren(issueId).pipe(
                Stream.map(children =>
                  ObservedIssueChildren.make({ children, issueId }),
                ),
                Stream.catch(error =>
                  Stream.make(
                    FailedObserveIssueChildren.make({
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
  selectedIssueReferences: entry(
    { maybeIssueId: S.Option(S.String) },
    {
      modelToDependencies: model => ({
        maybeIssueId: shownIssueIdOf(model),
      }),
      dependenciesToStream: ({ maybeIssueId }) => {
        if (Option.isNone(maybeIssueId)) {
          return Stream.empty
        }
        const issueId = maybeIssueId.value
        return Stream.unwrap(
          GraphRows.pipe(
            Effect.map(graph =>
              graph.observeIssueReferences(issueId).pipe(
                Stream.map(references =>
                  ObservedIssueReferences.make({ issueId, references }),
                ),
                Stream.catch(error =>
                  Stream.make(
                    FailedObserveIssueReferences.make({
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
  selectedIssueAgents: entry(
    { maybeIssueId: S.Option(S.String) },
    {
      modelToDependencies: model => ({
        maybeIssueId: shownIssueIdOf(model),
      }),
      dependenciesToStream: ({ maybeIssueId }) => {
        if (Option.isNone(maybeIssueId)) {
          return Stream.empty
        }
        const issueId = maybeIssueId.value
        return Stream.unwrap(
          GraphRows.pipe(
            Effect.map(graph =>
              graph.observeIssueAgents(issueId).pipe(
                Stream.map(agents =>
                  ObservedIssueAgents.make({ agents, issueId }),
                ),
                Stream.catch(error =>
                  Stream.make(
                    FailedObserveIssueAgents.make({
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
  selectedIssueGraph: entry(
    { maybeIssueId: S.Option(S.String) },
    {
      modelToDependencies: model => ({
        maybeIssueId: shownIssueIdOf(model),
      }),
      dependenciesToStream: ({ maybeIssueId }) => {
        if (Option.isNone(maybeIssueId)) {
          return Stream.empty
        }
        const issueId = maybeIssueId.value
        return Stream.unwrap(
          GraphRows.pipe(
            Effect.map(graph =>
              graph.observeIssueGraph(issueId).pipe(
                Stream.map(found =>
                  ObservedIssueGraph.make({ graph: found, issueId }),
                ),
                Stream.catch(error =>
                  Stream.make(
                    FailedObserveIssueGraph.make({
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
  knownAgents: entry(
    {
      handles: S.Array(S.String),
      maybeIssueNumber: S.Option(S.Number),
    },
    {
      modelToDependencies: model => ({
        handles: agentHandlesOfPage(model),
        maybeIssueNumber: issueNumberOfPage(model),
      }),
      dependenciesToStream: ({ handles, maybeIssueNumber }) =>
        Array.isReadonlyArrayEmpty(handles) && Option.isNone(maybeIssueNumber)
          ? Stream.empty
          : Stream.unwrap(
              GraphRows.pipe(
                Effect.map(graph =>
                  graph.observeAgentChips(handles, maybeIssueNumber).pipe(
                    Stream.map(runs => ObservedAgentChips.make({ runs })),
                    Stream.catch(error =>
                      Stream.make(
                        FailedObserveAgentChips.make({
                          reason: describeIssueLandingError(error),
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
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

/** Observes a person's saved views, from whichever page they are on. */
export const viewSubscriptions = Subscription.make<
  Model,
  Message,
  IssueViews
>()(() => ({
  savedViews: Subscription.persistent(
    Stream.unwrap(
      IssueViews.pipe(
        Effect.map(views =>
          views.observeViews.pipe(
            Stream.map(stored => ObservedSavedViews.make({ views: stored })),
            Stream.catch(error =>
              Stream.make(
                FailedObserveSavedViews.make({
                  reason: describeIssueViewError(error),
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
}))

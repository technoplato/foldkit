import { Effect, Option, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'

import {
  IssueQuery,
  IssueTracker,
  ProductCatalog,
  TriageInbox,
} from '@foldkit/instant-tools/issues'

import {
  FailedObserveIssue,
  FailedObserveIssues,
  FailedObserveProducts,
  FailedObserveTriageCandidates,
  type Message,
  ObservedIssue,
  ObservedIssues,
  ObservedProducts,
  ObservedTriageCandidates,
} from './message.js'
import { type Model } from './model.js'

type Resources = IssueTracker | ProductCatalog | TriageInbox

/** Observes the Issue collection, filing catalog, and selected Issue. */
export const subscriptions = Subscription.make<Model, Message, Resources>()(
  entry => ({
    issues: Subscription.persistent(
      Stream.unwrap(
        IssueTracker.pipe(
          Effect.map(tracker =>
            tracker
              .observe(
                IssueQuery.make({
                  limit: 500,
                  productId: Option.none(),
                  projectId: Option.none(),
                  statuses: [],
                }),
              )
              .pipe(
                Stream.map(issues => ObservedIssues.make({ issues })),
                Stream.catch(error =>
                  Stream.make(
                    FailedObserveIssues.make({ reason: String(error) }),
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
                  FailedObserveProducts.make({ reason: String(error) }),
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
                    reason: String(error),
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
                        reason: String(error),
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

import { Array, Clock, Effect, Match as M, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'

import {
  AgentReference,
  ApplicationProduct,
  CatalogIssueReference,
  Issue,
  IssueMention,
  IssueQuery,
  IssueTracker,
  IssueWorkLogEntry,
  ProductCatalog,
  ProductCatalogEntry,
  RecordingMention,
  RecordingReference,
  TrackedProduct,
  TriageCandidate,
  TriageInbox as TriageInboxServiceTag,
  UriReference,
} from '@foldkit/instant-tools/issues'
import { Logger } from '@foldkit/instant-tools/logging'

import { IssueIdentity } from './issueIdentity.js'
import {
  LeftoverStatus,
  catalogIssueRefsOf,
  leftoverMayClose,
  storedStatusOf,
} from './leftover.js'
import {
  FailedReviewTriageCandidate,
  FailedSaveIssue,
  FailedSaveIssueWorkLog,
  type Message,
  SucceededReviewTriageCandidate,
  SucceededSaveIssue,
  SucceededSaveIssueWorkLog,
} from './message.js'
import {
  EditingIssueDraft,
  FailedIssue,
  FailedIssueDraft,
  FailedIssueLogs,
  FailedIssueMutation,
  FailedIssues,
  FailedProducts,
  FailedTriageCandidates,
  FileIssue,
  IdleIssueMutation,
  IssueDetail,
  IssueDraft,
  IssueList,
  LoadedIssue,
  LoadedIssueLogs,
  LoadedIssues,
  LoadedProducts,
  LoadedTriageCandidates,
  LoadingIssue,
  LoadingIssueLogs,
  Model,
  type Navigation,
  NotObservingIssue,
  NotObservingIssueLogs,
  SavingIssueDraft,
  SavingIssueMutation,
  TriageInbox,
} from './model.js'

// COMMAND

/** Persists one filed Issue through the controlled tracker and identity dependencies. */
export const SaveIssue = Command.define(
  'SaveIssue',
  {
    details: Issue.fields.details,
    priority: Issue.fields.priority,
    product: TrackedProduct,
    title: Issue.fields.title,
  },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ details, priority, product, title }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const { id, nowMs } = yield* identity.next
    const issue = Issue.make({
      area: Option.none(),
      attachments: [],
      claimantId: Option.none(),
      complexity: Option.none(),
      createdAtMs: nowMs,
      details,
      id,
      issueType: Option.none(),
      mentions: [],
      priority,
      product,
      projectId: Option.none(),
      reportedDate: Option.none(),
      sourceDocument: Option.none(),
      status: 'Open',
      successCriteria: [],
      title,
      updatedAtMs: nowMs,
      viewerURL: Option.some(`https://issues.knophy.com/issues/${id}`),
      workLog: [],
    })
    yield* tracker.save(issue)
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: String(error) })),
    ),
  ),
)

/** Applies an explicit human review decision to one transcript draft. */
export const ReviewTriageCandidate = Command.define(
  'ReviewTriageCandidate',
  {
    candidate: TriageCandidate,
    decision: S.Literals(['Dismiss', 'Promote']),
  },
  SucceededReviewTriageCandidate,
  FailedReviewTriageCandidate,
)(({ candidate, decision }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const inbox = yield* TriageInboxServiceTag
    const { id, nowMs } = yield* identity.next
    const reviewed = TriageCandidate.make({
      ...candidate,
      status: decision === 'Promote' ? 'Promoted' : 'Dismissed',
      updatedAtMs: nowMs,
    })
    if (decision === 'Dismiss') {
      yield* inbox.saveCandidate(reviewed)
      return SucceededReviewTriageCandidate.make({
        candidate: reviewed,
        issue: Option.none(),
      })
    }
    const tracker = yield* IssueTracker
    const source = RecordingReference.make({
      recording: RecordingMention.make({
        endMilliseconds: Option.some(candidate.segment.endMilliseconds),
        recordingId: candidate.segment.recordingId,
        screenshotIds: [],
        startMilliseconds: candidate.segment.startMilliseconds,
      }),
    })
    const issue = Issue.make({
      area: Option.none(),
      attachments: [],
      claimantId: Option.none(),
      complexity: Option.none(),
      createdAtMs: nowMs,
      details: candidate.suggestedDetails,
      id,
      issueType: Option.none(),
      mentions: [
        IssueMention.make({
          capturedAtMs: candidate.createdAtMs,
          directQuote: Option.some(candidate.segment.transcript),
          id: `mention-${id}`,
          issueId: id,
          related: Option.match(candidate.segment.publicUrl, {
            onNone: () => [],
            onSome: value => [UriReference.make({ value })],
          }),
          reporter: Option.none(),
          source,
        }),
      ],
      priority: candidate.suggestedPriority,
      product: candidate.product,
      projectId: Option.none(),
      reportedDate: Option.none(),
      sourceDocument: Option.none(),
      status: 'Open',
      successCriteria: [],
      title: candidate.suggestedTitle,
      updatedAtMs: nowMs,
      viewerURL: Option.some(`https://issues.knophy.com/issues/${id}`),
      workLog: [],
    })
    yield* tracker.save(issue)
    yield* inbox.saveCandidate(reviewed)
    return SucceededReviewTriageCandidate.make({
      candidate: reviewed,
      issue: Option.some(issue),
    })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedReviewTriageCandidate.make({ reason: String(error) }),
      ),
    ),
  ),
)

const COMMENT_AGENT_ID = 'issues-245-grok'
const WORK_LOG_AGENT_ID = 'issues-245-grok'
const ISSUE_QUERY_LIMIT = 500

const loadTrackedIssue = (issueId: string) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const issues = yield* tracker.fetch(
      IssueQuery.make({
        limit: ISSUE_QUERY_LIMIT,
        productId: Option.none(),
        projectId: Option.none(),
        statuses: [],
      }),
    )
    return Array.findFirst(issues, candidate => candidate.id === issueId)
  })

/** Persists one already-built Issue through the tracker. */
export const PersistIssue = Command.define(
  'PersistIssue',
  { issue: Issue },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issue }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    yield* tracker.save(issue)
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: String(error) })),
    ),
  ),
)

/** Appends one IssueWorkLogEntry and persists the Issue. */
export const CommentOnIssue = Command.define(
  'CommentOnIssue',
  { issueId: S.String, summary: S.String },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId, summary }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const maybeIssue = yield* loadTrackedIssue(issueId)
    if (Option.isNone(maybeIssue)) {
      return FailedSaveIssue.make({
        reason: `Issue ${issueId} was not found.`,
      })
    }
    const { nowMs } = yield* identity.next
    const issue = maybeIssue.value
    const next = Issue.make({
      ...issue,
      updatedAtMs: nowMs,
      workLog: Array.append(
        issue.workLog,
        IssueWorkLogEntry.make({
          agentId: Option.some(COMMENT_AGENT_ID),
          commitSha: Option.none(),
          durationSeconds: Option.none(),
          id: `work-${issue.id}-${nowMs.toString()}`,
          occurredAtMs: nowMs,
          state: Option.none(),
          summary,
        }),
      ),
    })
    yield* tracker.save(next)
    return SucceededSaveIssue.make({ issue: next })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: String(error) })),
    ),
  ),
)

/** Appends one IssueWorkLogEntry without changing Issue.status. */
export const SaveIssueWorkLog = Command.define(
  'SaveIssueWorkLog',
  { issue: Issue, summary: S.String },
  SucceededSaveIssueWorkLog,
  FailedSaveIssueWorkLog,
)(({ issue, summary }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const next = Issue.make({
      ...issue,
      updatedAtMs: nowMs,
      workLog: Array.append(
        issue.workLog,
        IssueWorkLogEntry.make({
          agentId: Option.some(WORK_LOG_AGENT_ID),
          commitSha: Option.none(),
          durationSeconds: Option.none(),
          id: `work-${issue.id}-${nowMs.toString()}`,
          occurredAtMs: nowMs,
          state: Option.none(),
          summary,
        }),
      ),
    })
    yield* tracker.save(next)
    return SucceededSaveIssueWorkLog.make({ issue: next })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssueWorkLog.make({ reason: String(error) })),
    ),
  ),
)

/** Adds one CatalogIssueReference on mentions.related and persists. */
export const LinkCatalogIssue = Command.define(
  'LinkCatalogIssue',
  { sourceIssueId: S.String, targetIssueId: S.String },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ sourceIssueId, targetIssueId }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const maybeIssue = yield* loadTrackedIssue(sourceIssueId)
    if (Option.isNone(maybeIssue)) {
      return FailedSaveIssue.make({
        reason: `Issue ${sourceIssueId} was not found.`,
      })
    }
    const issue = maybeIssue.value
    const { nowMs } = yield* identity.next
    const alreadyLinked = Array.some(
      catalogIssueRefsOf(issue),
      ref => ref.id === targetIssueId,
    )
    const next = alreadyLinked
      ? issue
      : Issue.make({
          ...issue,
          mentions: Array.append(
            issue.mentions,
            IssueMention.make({
              capturedAtMs: nowMs,
              directQuote: Option.none(),
              id: `link-${issue.id}-${targetIssueId}`,
              issueId: issue.id,
              related: [CatalogIssueReference.make({ id: targetIssueId })],
              reporter: Option.some(
                AgentReference.make({ id: COMMENT_AGENT_ID }),
              ),
              source: AgentReference.make({ id: COMMENT_AGENT_ID }),
            }),
          ),
          updatedAtMs: nowMs,
        })
    yield* tracker.save(next)
    return SucceededSaveIssue.make({ issue: next })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: String(error) })),
    ),
  ),
)

/** Stores leftover status without shrinking the wide IssueStatus union. */
export const SetLeftoverStatus = Command.define(
  'SetLeftoverStatus',
  {
    issueId: S.String,
    leftover: LeftoverStatus,
  },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId, leftover }) =>
  Effect.gen(function* () {
    if (leftover === 'Closed' && !leftoverMayClose(issueId)) {
      return FailedSaveIssue.make({
        reason: `Issue ${issueId} cannot be Closed.`,
      })
    }
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const maybeIssue = yield* loadTrackedIssue(issueId)
    if (Option.isNone(maybeIssue)) {
      return FailedSaveIssue.make({
        reason: `Issue ${issueId} was not found.`,
      })
    }
    const issue = maybeIssue.value
    const { nowMs } = yield* identity.next
    const next = Issue.make({
      ...issue,
      status: storedStatusOf(leftover),
      updatedAtMs: nowMs,
    })
    yield* tracker.save(next)
    return SucceededSaveIssue.make({ issue: next })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: String(error) })),
    ),
  ),
)

/** Moves one leftover onto another live catalog product without closing it. */
export const RetargetIssueProduct = Command.define(
  'RetargetIssueProduct',
  { issue: Issue, product: TrackedProduct },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issue, product }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const { nowMs } = yield* identity.next
    const next = Issue.make({
      ...issue,
      product,
      updatedAtMs: nowMs,
    })
    yield* tracker.save(next)
    return SucceededSaveIssue.make({ issue: next })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: String(error) })),
    ),
  ),
)

type Resources =
  | IssueTracker
  | Logger
  | ProductCatalog
  | TriageInboxServiceTag
  | IssueIdentity
type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, Resources>>,
]

const withNavigation = (model: Model, navigation: Navigation): Model =>
  Model.make({
    ...model,
    issueMutation: IdleIssueMutation.make({}),
    issueDetail:
      navigation._tag === 'IssueDetail'
        ? LoadingIssue.make({ issueId: navigation.issueId })
        : NotObservingIssue.make({}),
    issueLogs:
      navigation._tag === 'IssueDetail'
        ? LoadingIssueLogs.make({ issueId: navigation.issueId })
        : NotObservingIssueLogs.make({}),
    navigation,
  })

const selectedProduct = (model: Model) => {
  if (model.products._tag !== 'LoadedProducts') {
    return Option.none<typeof TrackedProduct.Type>()
  }
  return Option.map(
    Array.findFirst(
      model.products.products,
      entry => entry.product.id === model.draft.productId,
    ),
    entry => entry.product,
  )
}

const saveDraft = (model: Model): UpdateReturn => {
  if (model.navigation._tag !== 'FileIssue') {
    return [model, []]
  }
  if (model.draft.title.trim() === '') {
    return [
      Model.make({
        ...model,
        draftState: FailedIssueDraft.make({ reason: 'A title is required.' }),
      }),
      [],
    ]
  }
  const maybeProduct = selectedProduct(model)
  if (Option.isNone(maybeProduct)) {
    return [
      Model.make({
        ...model,
        draftState: FailedIssueDraft.make({
          reason: 'Choose an Application or Library.',
        }),
      }),
      [],
    ]
  }
  return [
    Model.make({ ...model, draftState: SavingIssueDraft.make({}) }),
    [
      SaveIssue({
        details: model.draft.details,
        priority: model.draft.priority,
        product: maybeProduct.value,
        title: model.draft.title,
      }),
    ],
  ]
}

const updateDraft = (
  model: Model,
  transform: (draft: IssueDraft) => IssueDraft,
): UpdateReturn => [
  Model.make({
    ...model,
    draft: transform(model.draft),
    draftState: EditingIssueDraft.make({}),
  }),
  [],
]

const casinoProduct = ProductCatalogEntry.make({
  product: ApplicationProduct.make({ id: 'casino', name: 'Casino' }),
  updatedAtMs: 1_753_800_000_000,
})

const productsFromIssues = (
  issues: ReadonlyArray<typeof Issue.Type>,
): ReadonlyArray<typeof ProductCatalogEntry.Type> => {
  const seen = new Map<string, typeof ProductCatalogEntry.Type>()
  for (const issue of issues) {
    if (!seen.has(issue.product.id)) {
      seen.set(
        issue.product.id,
        ProductCatalogEntry.make({
          product: issue.product,
          updatedAtMs: issue.updatedAtMs,
        }),
      )
    }
  }
  return [...seen.values()]
}

const mergeCatalog = (
  left: ReadonlyArray<typeof ProductCatalogEntry.Type>,
  right: ReadonlyArray<typeof ProductCatalogEntry.Type>,
): ReadonlyArray<typeof ProductCatalogEntry.Type> => {
  const seen = new Map<string, typeof ProductCatalogEntry.Type>()
  for (const entry of [...left, ...right, casinoProduct]) {
    if (!seen.has(entry.product.id)) {
      seen.set(entry.product.id, entry)
    }
  }
  return [...seen.values()]
}

const reviewTriageCandidate = (
  model: Model,
  candidateId: string,
  decision: 'Dismiss' | 'Promote',
): UpdateReturn => {
  if (model.triageCandidates._tag !== 'LoadedTriageCandidates') {
    return [model, []]
  }
  const maybeCandidate = Array.findFirst(
    model.triageCandidates.candidates,
    candidate => candidate.id === candidateId && candidate.status === 'Draft',
  )
  if (Option.isNone(maybeCandidate)) return [model, []]
  return [
    model,
    [ReviewTriageCandidate({ candidate: maybeCandidate.value, decision })],
  ]
}

const patchIssues = (
  state: typeof LoadedIssues.Type | Model['issues'],
  issue: typeof Issue.Type,
): Model['issues'] => {
  if (state._tag !== 'LoadedIssues') {
    return state
  }
  const exists = Array.some(state.issues, current => current.id === issue.id)
  return LoadedIssues.make({
    issues: exists
      ? Array.map(state.issues, current =>
          current.id === issue.id ? issue : current,
        )
      : Array.append(state.issues, issue),
  })
}

const loadedDetailIssue = (
  model: Model,
  issueId: string,
): Option.Option<typeof Issue.Type> => {
  if (
    model.navigation._tag !== 'IssueDetail' ||
    model.navigation.issueId !== issueId ||
    model.issueDetail._tag !== 'LoadedIssue'
  ) {
    return Option.none()
  }
  return model.issueDetail.issue
}

const startLeftoverCommand = (
  model: Model,
  command: Command.Command<Message, never, Resources>,
): UpdateReturn => [
  Model.make({ ...model, issueMutation: SavingIssueMutation.make({}) }),
  [command],
]

/** Restores destination-specific observation state from a Model snapshot. */
export const restore = (model: Model): UpdateReturn => [
  withNavigation(model, model.navigation),
  [],
]

// UPDATE

/** Applies one Issue Tracker Message to the Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      ObservedIssues: ({ issues }) => {
        const current =
          model.products._tag === 'LoadedProducts'
            ? model.products.products
            : []
        const merged = mergeCatalog(current, productsFromIssues(issues))
        return [
          Model.make({
            ...model,
            issues: LoadedIssues.make({ issues }),
            products:
              merged.length === 0
                ? model.products
                : LoadedProducts.make({ products: merged }),
          }),
          [],
        ]
      },
      FailedObserveIssues: ({ reason }) => [
        Model.make({ ...model, issues: FailedIssues.make({ reason }) }),
        [],
      ],
      ObservedProducts: ({ products }) => {
        const nextProductId =
          model.draft.productId === ''
            ? Option.match(Array.head(products), {
                onNone: () => '',
                onSome: entry => entry.product.id,
              })
            : model.draft.productId
        return [
          Model.make({
            ...model,
            draft: IssueDraft.make({
              ...model.draft,
              productId: nextProductId,
            }),
            products: LoadedProducts.make({ products }),
          }),
          [],
        ]
      },
      FailedObserveProducts: ({ reason }) => [
        Model.make({ ...model, products: FailedProducts.make({ reason }) }),
        [],
      ],
      ObservedTriageCandidates: ({ candidates }) => [
        Model.make({
          ...model,
          triageCandidates: LoadedTriageCandidates.make({ candidates }),
        }),
        [],
      ],
      FailedObserveTriageCandidates: ({ reason }) => [
        Model.make({
          ...model,
          triageCandidates: FailedTriageCandidates.make({ reason }),
        }),
        [],
      ],
      ObservedIssue: ({ issue, issueId }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== issueId
        ) {
          return [model, []]
        }
        return [
          Model.make({
            ...model,
            issueDetail: LoadedIssue.make({ issue, issueId }),
          }),
          [],
        ]
      },
      FailedObserveIssue: ({ issueId, reason }) => [
        Model.make({
          ...model,
          issueDetail: FailedIssue.make({ issueId, reason }),
        }),
        [],
      ],
      ObservedIssueLogs: ({ issueId, logs }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== issueId
        ) {
          return [model, []]
        }
        return [
          Model.make({
            ...model,
            issueLogs: LoadedIssueLogs.make({ issueId, logs }),
          }),
          [],
        ]
      },
      FailedObserveIssueLogs: ({ issueId, reason }) => [
        Model.make({
          ...model,
          issueLogs: FailedIssueLogs.make({ issueId, reason }),
        }),
        [],
      ],
      SelectedIssue: ({ issueId }) => [
        withNavigation(model, IssueDetail.make({ issueId })),
        [],
      ],
      DismissedIssueDetail: () => [
        withNavigation(model, IssueList.make({})),
        [],
      ],
      ClickedFileIssue: () => [withNavigation(model, FileIssue.make({})), []],
      ClickedOpenTriage: () => [
        withNavigation(model, TriageInbox.make({})),
        [],
      ],
      ClickedPromoteTriageCandidate: ({ candidateId }) =>
        reviewTriageCandidate(model, candidateId, 'Promote'),
      ClickedDismissTriageCandidate: ({ candidateId }) =>
        reviewTriageCandidate(model, candidateId, 'Dismiss'),
      UpdatedIssueTitle: ({ value }) =>
        updateDraft(model, draft =>
          IssueDraft.make({ ...draft, title: value }),
        ),
      UpdatedIssueDetails: ({ value }) =>
        updateDraft(model, draft =>
          IssueDraft.make({ ...draft, details: value }),
        ),
      SelectedIssueProduct: ({ productId }) =>
        updateDraft(model, draft => IssueDraft.make({ ...draft, productId })),
      SelectedIssuePriority: ({ priority }) =>
        updateDraft(model, draft => IssueDraft.make({ ...draft, priority })),
      SubmittedIssue: () => saveDraft(model),
      SucceededSaveIssue: ({ issue }) => {
        if (
          model.navigation._tag === 'IssueDetail' &&
          model.navigation.issueId === issue.id
        ) {
          return [
            Model.make({
              ...model,
              issueDetail: LoadedIssue.make({
                issue: Option.some(issue),
                issueId: issue.id,
              }),
              issueMutation: IdleIssueMutation.make({}),
              issues: patchIssues(model.issues, issue),
            }),
            [],
          ]
        }
        return [
          withNavigation(
            Model.make({
              ...model,
              draftState: EditingIssueDraft.make({}),
              issueMutation: IdleIssueMutation.make({}),
              issues: patchIssues(model.issues, issue),
            }),
            IssueDetail.make({ issueId: issue.id }),
          ),
          [],
        ]
      },
      FailedSaveIssue: ({ reason }) =>
        model.navigation._tag === 'FileIssue'
          ? [
              Model.make({
                ...model,
                draftState: FailedIssueDraft.make({ reason }),
                issueMutation: IdleIssueMutation.make({}),
              }),
              [],
            ]
          : [
              Model.make({
                ...model,
                issueMutation: FailedIssueMutation.make({ reason }),
              }),
              [],
            ],
      SucceededReviewTriageCandidate: ({ candidate, issue }) => {
        const nextCandidates =
          model.triageCandidates._tag === 'LoadedTriageCandidates'
            ? Array.map(model.triageCandidates.candidates, current =>
                current.id === candidate.id ? candidate : current,
              )
            : []
        const nextModel = Model.make({
          ...model,
          triageCandidates: LoadedTriageCandidates.make({
            candidates: nextCandidates,
          }),
        })
        return Option.match(issue, {
          onNone: () => [nextModel, []],
          onSome: promoted => [
            withNavigation(
              nextModel,
              IssueDetail.make({ issueId: promoted.id }),
            ),
            [],
          ],
        })
      },
      FailedReviewTriageCandidate: ({ reason }) => [
        Model.make({
          ...model,
          triageCandidates: FailedTriageCandidates.make({ reason }),
        }),
        [],
      ],
      SubmittedIssueComment: ({ issueId, summary }) => {
        if (summary.trim() === '') {
          return [model, []]
        }
        return startLeftoverCommand(model, CommentOnIssue({ issueId, summary }))
      },
      AppendedIssueWorkLog: ({ summary }) => {
        if (summary.trim() === '') {
          return [model, []]
        }
        if (model.navigation._tag !== 'IssueDetail') {
          return [model, []]
        }
        return Option.match(
          loadedDetailIssue(model, model.navigation.issueId),
          {
            onNone: () => [model, []],
            onSome: issue =>
              startLeftoverCommand(model, SaveIssueWorkLog({ issue, summary })),
          },
        )
      },
      SucceededSaveIssueWorkLog: ({ issue }) => [
        Model.make({
          ...model,
          issueDetail:
            model.navigation._tag === 'IssueDetail' &&
            model.navigation.issueId === issue.id
              ? LoadedIssue.make({
                  issue: Option.some(issue),
                  issueId: issue.id,
                })
              : model.issueDetail,
          issueMutation: IdleIssueMutation.make({}),
          issues: patchIssues(model.issues, issue),
        }),
        [],
      ],
      FailedSaveIssueWorkLog: ({ reason }) => [
        Model.make({
          ...model,
          issueMutation: FailedIssueMutation.make({ reason }),
        }),
        [],
      ],
      LinkedCatalogIssue: ({ sourceIssueId, targetIssueId }) => {
        if (targetIssueId.trim() === '' || targetIssueId === sourceIssueId) {
          return [model, []]
        }
        return startLeftoverCommand(
          model,
          LinkCatalogIssue({ sourceIssueId, targetIssueId }),
        )
      },
      ClickedLeftoverStatus: ({ issueId, status }) =>
        startLeftoverCommand(
          model,
          SetLeftoverStatus({ issueId, leftover: status }),
        ),
      SelectedProductFilter: ({ filter }) => [
        Model.make({ ...model, productFilter: filter }),
        [],
      ],
      RetargetedIssueProduct: ({ issueId, productId }) => {
        if (model.products._tag !== 'LoadedProducts') {
          return [model, []]
        }
        const maybeProduct = Array.findFirst(
          model.products.products,
          entry => entry.product.id === productId,
        )
        if (Option.isNone(maybeProduct)) {
          return [model, []]
        }
        return Option.match(loadedDetailIssue(model, issueId), {
          onNone: () => [model, []],
          onSome: issue =>
            startLeftoverCommand(
              model,
              RetargetIssueProduct({
                issue,
                product: maybeProduct.value.product,
              }),
            ),
        })
      },
      OpenedNavigation: ({ navigation }) => [
        withNavigation(model, navigation),
        [],
      ],
    }),
  )

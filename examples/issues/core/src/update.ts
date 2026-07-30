import { Array, Effect, Match as M, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'

import {
  Issue,
  IssueMention,
  IssueTracker,
  ProductCatalog,
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
  FailedReviewTriageCandidate,
  FailedSaveIssue,
  type Message,
  SucceededReviewTriageCandidate,
  SucceededSaveIssue,
} from './message.js'
import {
  EditingIssueDraft,
  FailedIssue,
  FailedIssueDraft,
  FailedIssueLogs,
  FailedIssues,
  FailedProducts,
  FailedTriageCandidates,
  FileIssue,
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
      ObservedIssues: ({ issues }) => [
        Model.make({ ...model, issues: LoadedIssues.make({ issues }) }),
        [],
      ],
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
      SucceededSaveIssue: ({ issue }) => [
        withNavigation(model, IssueDetail.make({ issueId: issue.id })),
        [],
      ],
      FailedSaveIssue: ({ reason }) => [
        Model.make({
          ...model,
          draftState: FailedIssueDraft.make({ reason }),
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
      OpenedNavigation: ({ navigation }) => [
        withNavigation(model, navigation),
        [],
      ],
    }),
  )

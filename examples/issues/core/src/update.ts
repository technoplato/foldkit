import { Array, Effect, Match as M, Option } from 'effect'
import { Command } from 'foldkit'

import {
  Issue,
  IssueTracker,
  ProductCatalog,
  TrackedProduct,
} from '@foldkit/instant-tools/issues'

import { IssueIdentity } from './issueIdentity.js'
import { FailedSaveIssue, type Message, SucceededSaveIssue } from './message.js'
import {
  EditingIssueDraft,
  FailedIssue,
  FailedIssueDraft,
  FailedIssues,
  FailedProducts,
  FileIssue,
  IssueDetail,
  IssueDraft,
  IssueList,
  LoadedIssue,
  LoadedIssues,
  LoadedProducts,
  LoadingIssue,
  Model,
  type Navigation,
  NotObservingIssue,
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
      attachments: [],
      createdAtMs: nowMs,
      details,
      id,
      mentions: [],
      priority,
      product,
      projectId: Option.none(),
      sourceDocument: Option.none(),
      status: 'Open',
      successCriteria: [],
      title,
      updatedAtMs: nowMs,
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

type Resources = IssueTracker | ProductCatalog | IssueIdentity
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
      OpenedNavigation: ({ navigation }) => [
        withNavigation(model, navigation),
        [],
      ],
    }),
  )

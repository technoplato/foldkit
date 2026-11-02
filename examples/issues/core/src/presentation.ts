import { Array, Match as M, Option, Schema as S } from 'effect'

import { Issue, IssuePriority } from '@foldkit/instant-tools/issues'

import { BacklogListing, backlogIssues } from './backlog.js'
import { droppedCardOfToken } from './board.js'
import {
  claimantFilterChoicesOf,
  groupingChoices,
  inboxChoices,
  landingChoices,
  layoutChoices,
  listMenuInteractions,
  priorityFilterChoices,
  productMenuInteraction,
  sortChoices,
  statusFilterChoices,
} from './choices.js'
import { PageEntity, issuesOfPage } from './entityGraph.js'
import { type AgentFinding } from './graphFacts.js'
import { PROMOTE_FINDING_TOKEN_PREFIX } from './graphPageParts.js'
import { type Interaction, interaction, uniqueByToken } from './interaction.js'
import { keyInteractionsOf, navigationInteractionsOf } from './keys.js'
import {
  AllProducts,
  LeftoverStatus,
  OneProduct,
  catalogIssueRefsOf,
  leftoverStatusesForIssue,
} from './leftover.js'
import {
  SELECT_TOKEN_PREFIX,
  SELECT_TO_TOKEN_PREFIX,
  rowFieldOfToken,
} from './listRows.js'
import { listedBacklog, listedIssues, loadedIssuesIn } from './listing.js'
import {
  AppendedIssueWorkLog,
  AppliedRowChange,
  ClickedDeleteView,
  ClickedDismissTriageCandidate,
  ClickedLeftoverStatus,
  ClickedMoveView,
  ClickedPromoteFinding,
  ClickedPromoteTriageCandidate,
  ClickedRenameView,
  ClickedUpdateView,
  DismissedViewFailure,
  DroppedCard,
  ExtendedRowSelectionTo,
  LinkedCatalogIssue,
  type Message,
  OpenedRowField,
  PickedMenuRow,
  RetargetedIssueProduct,
  SelectedIssuePriority,
  SelectedIssueProduct,
  SelectedProductFilter,
  SubmittedIssue,
  SubmittedIssueComment,
  SubmittedSearch,
  ToggledRowSelection,
  UpdatedIssueDetails,
  UpdatedIssueTitle,
  UpdatedLeftoverComment,
  UpdatedLeftoverLink,
  UpdatedMenuQuery,
  UpdatedSearchQuery,
  UpdatedViewName,
} from './message.js'
import {
  FailedIssues,
  DecisionFilter,
  DecisionsObservation,
  FeaturesObservation,
  QuestionFilter,
  QuestionsObservation,
  ReminderFilter,
  RemindersObservation,
  FindingFilter,
  FindingsObservation,
  IssueDetailState,
  IssueDraft,
  IssueDraftState,
  IssuesState,
  LoadingIssues,
  type Model,
  ProductsState,
  TriageCandidatesState,
  loadedIssuesOf,
} from './model.js'
import { ChangedStatus } from './rowEdit.js'
import { selectIssueMessageOf } from './selection.js'

/** Presents the live Issue collection to a host. */
export const IssueListDestination = S.TaggedStruct('IssueListDestination', {
  state: IssuesState,
})
/** Presents one independently observed Issue to a host. */
export const IssueDetailDestination = S.TaggedStruct('IssueDetailDestination', {
  issueId: S.String,
  state: IssueDetailState,
})
/** Presents the shared filing form to a host. */
export const FileIssueDestination = S.TaggedStruct('FileIssueDestination', {
  draft: IssueDraft,
  draftState: IssueDraftState,
  products: ProductsState,
})
/** Presents transcript-derived draft candidates. */
export const TriageInboxDestination = S.TaggedStruct('TriageInboxDestination', {
  state: TriageCandidatesState,
})
/** The backlog, read from the loaded Issue collection. */
export const LoadedBacklog = S.TaggedStruct('LoadedBacklog', {
  backlog: BacklogListing,
})
/** The backlog while the Issue collection loads, fails, or has loaded. */
export const BacklogState = S.Union([
  LoadingIssues,
  FailedIssues,
  LoadedBacklog,
])
/** The backlog while the Issue collection loads, fails, or has loaded. */
export type BacklogState = typeof BacklogState.Type
/** Presents the backlog: build lanes, then priority sections. */
export const BacklogDestination = S.TaggedStruct('BacklogDestination', {
  state: BacklogState,
})
/**
 * Presents one entity's page: the entity, such as Recording 208, and the
 * loaded Issues, from which a host reads the Issues that point at it.
 */
export const EntityPageDestination = S.TaggedStruct('EntityPageDestination', {
  entity: PageEntity,
  state: IssuesState,
})
/** Presents how long asks take, read from the loaded Issues. */
export const AskFlowDestination = S.TaggedStruct('AskFlowDestination', {
  state: IssuesState,
})
/** Presents what agents reported: which ones show and every one read. */
export const FindingsDestination = S.TaggedStruct('FindingsDestination', {
  filter: FindingFilter,
  state: FindingsObservation,
})
/** Presents what he decided: which ones show and every one read. */
export const DecisionsDestination = S.TaggedStruct('DecisionsDestination', {
  filter: DecisionFilter,
  state: DecisionsObservation,
})
/** Presents what he asked: which ones show and every one read. */
export const QuestionsDestination = S.TaggedStruct('QuestionsDestination', {
  filter: QuestionFilter,
  state: QuestionsObservation,
})
/** Presents his reminders: which ones show and every one read. */
export const RemindersDestination = S.TaggedStruct('RemindersDestination', {
  filter: ReminderFilter,
  state: RemindersObservation,
})
/** Presents the products' feature contracts, every line read. */
export const FeaturesDestination = S.TaggedStruct('FeaturesDestination', {
  state: FeaturesObservation,
})
/** Presents the catalog of products with the loaded Issues. */
export const ProductsDestination = S.TaggedStruct('ProductsDestination', {
  products: ProductsState,
  state: IssuesState,
})
/** Presents what happened to the Issues, read from the loaded Issues. */
export const InboxDestination = S.TaggedStruct('InboxDestination', {
  state: IssuesState,
})
/** Every host-neutral Issue Tracker destination. */
export const Destination = S.Union([
  IssueListDestination,
  IssueDetailDestination,
  FileIssueDestination,
  TriageInboxDestination,
  BacklogDestination,
  AskFlowDestination,
  InboxDestination,
  EntityPageDestination,
  FindingsDestination,
  DecisionsDestination,
  QuestionsDestination,
  RemindersDestination,
  FeaturesDestination,
  ProductsDestination,
])
/** Every host-neutral Issue Tracker destination. */
export type Destination = typeof Destination.Type

// NOTE: Destinations that carry the loaded Issues are typed literals, not
// `.make`, which would re-validate all 1,535 Issues (about 105 ms) per call.
/** Exhaustively projects the Model into one host-neutral destination. */
export const destinationForModel = (model: Model): Destination =>
  M.value(model.navigation).pipe(
    M.withReturnType<Destination>(),
    M.tagsExhaustive({
      IssueList: () => ({
        _tag: 'IssueListDestination',
        state:
          model.issues._tag === 'LoadedIssues'
            ? loadedIssuesOf(listedIssues(model, model.issues.issues))
            : model.issues,
      }),
      IssueDetail: ({ issueId }) =>
        IssueDetailDestination.make({
          issueId,
          state: model.issueDetail,
        }),
      FileIssue: () =>
        FileIssueDestination.make({
          draft: model.draft,
          draftState: model.draftState,
          products: model.products,
        }),
      TriageInbox: () =>
        TriageInboxDestination.make({ state: model.triageCandidates }),
      Backlog: () => ({
        _tag: 'BacklogDestination',
        state: M.value(model.issues).pipe(
          M.withReturnType<BacklogState>(),
          M.tagsExhaustive({
            LoadingIssues: state => state,
            FailedIssues: state => state,
            LoadedIssues: ({ issues }) => ({
              _tag: 'LoadedBacklog',
              backlog: listedBacklog(model, issues),
            }),
          }),
        ),
      }),
      AskFlow: () => ({
        _tag: 'AskFlowDestination',
        state: model.issues,
      }),
      Inbox: () => ({
        _tag: 'InboxDestination',
        state: model.issues,
      }),
      EntityPage: ({ entity }) => ({
        _tag: 'EntityPageDestination',
        entity,
        state: model.issues,
      }),
      Findings: ({ filter }) => ({
        _tag: 'FindingsDestination',
        filter,
        state: model.findingsList,
      }),
      Decisions: ({ filter }) => ({
        _tag: 'DecisionsDestination',
        filter,
        state: model.knownDecisions,
      }),
      Questions: ({ filter }) => ({
        _tag: 'QuestionsDestination',
        filter,
        state: model.questionsList,
      }),
      Reminders: ({ filter }) => ({
        _tag: 'RemindersDestination',
        filter,
        state: model.remindersList,
      }),
      Features: () => ({
        _tag: 'FeaturesDestination',
        state: model.featuresList,
      }),
      Products: () => ({
        _tag: 'ProductsDestination',
        products: model.products,
        state: model.issues,
      }),
    }),
  )

const productFilterInteractions = (
  model: Model,
): ReadonlyArray<Interaction> => [
  interaction(
    'product:all',
    'All products',
    SelectedProductFilter.make({ filter: AllProducts.make({}) }),
  ),
  ...(model.products._tag === 'LoadedProducts'
    ? Array.map(model.products.products, entry =>
        interaction(
          `product:${entry.product.id}`,
          entry.product.name,
          SelectedProductFilter.make({
            filter: OneProduct.make({ productId: entry.product.id }),
          }),
        ),
      )
    : []),
]

const OPEN_TOKEN_PREFIX = 'open:'
const SEARCH_TOKEN_PREFIX = 'search:'
const STATUS_TOKEN_PREFIX = 'status:'
const PALETTE_TOKEN_PREFIX = 'palette:'
const PALETTE_RUN_TOKEN_PREFIX = 'palette-run:'
const SEARCH_SUBMIT_TOKEN = 'search-submit'

const VIEW_NAME_TOKEN_PREFIX = 'view-name:'

const VIEW_TOKEN_MESSAGES: ReadonlyArray<
  readonly [string, (viewId: string) => Message]
> = [
  ['view-rename:', viewId => ClickedRenameView.make({ viewId })],
  ['view-update:', viewId => ClickedUpdateView.make({ viewId })],
  [
    'view-up:',
    viewId => ClickedMoveView.make({ direction: 'Previous', viewId }),
  ],
  ['view-down:', viewId => ClickedMoveView.make({ direction: 'Next', viewId })],
  ['view-delete:', viewId => ClickedDeleteView.make({ viewId })],
]

const viewMessageOfToken = (token: string): Option.Option<Message> =>
  Option.map(
    Array.findFirst(VIEW_TOKEN_MESSAGES, ([prefix]) =>
      token.startsWith(prefix),
    ),
    ([prefix, messageOf]) => messageOf(token.slice(prefix.length)),
  )

const openInteractions = new Map<string, Interaction>()

/**
 * The interaction that opens one Issue, `open:1538`, made once per Issue
 * number: a list offers one for each of its 1,535 Issues, and building
 * them again, each with a Schema parse, on every press would cost more
 * than the press.
 */
const openInteractionOf = (issueId: string): Interaction =>
  Option.getOrElse(
    Option.fromUndefinedOr(openInteractions.get(issueId)),
    () => {
      const opening = interaction(
        `${OPEN_TOKEN_PREFIX}${issueId}`,
        `Open ${issueId}`,
        selectIssueMessageOf(issueId),
      )
      openInteractions.set(issueId, opening)
      return opening
    },
  )

const openInteraction = (issue: Issue): Interaction =>
  openInteractionOf(issue.id)

const promoteInteractions = new WeakMap<AgentFinding, Interaction>()

const promoteInteractionOf = (finding: AgentFinding): Interaction =>
  Option.getOrElse(
    Option.fromUndefinedOr(promoteInteractions.get(finding)),
    () => {
      const promoting = interaction(
        `${PROMOTE_FINDING_TOKEN_PREFIX}${finding.findingId}`,
        `Turn finding ${finding.findingId} into an Issue`,
        ClickedPromoteFinding.make({ findingId: finding.findingId }),
      )
      promoteInteractions.set(finding, promoting)
      return promoting
    },
  )

/** Returns every currently valid high-level host interaction. */
export const interactionsForModel = (
  model: Model,
): ReadonlyArray<Interaction> =>
  M.value(model.navigation).pipe(
    M.withReturnType<ReadonlyArray<Interaction>>(),
    M.tagsExhaustive({
      IssueList: () => [
        ...navigationInteractionsOf(model),
        ...productFilterInteractions(model),
        ...landingChoices,
        ...statusFilterChoices,
        ...priorityFilterChoices,
        ...claimantFilterChoicesOf(model),
        ...sortChoices,
        ...groupingChoices,
        ...layoutChoices,
        ...listMenuInteractions,
        ...Array.map(
          listedIssues(model, loadedIssuesIn(model)),
          openInteraction,
        ),
      ],
      IssueDetail: ({ issueId }) => {
        const leftover: Array<Interaction> = []
        leftover.push(
          interaction(
            'comment-submit',
            'Comment',
            SubmittedIssueComment.make({
              issueId,
              summary: model.leftoverComment,
            }),
          ),
          interaction(
            'link-submit',
            'Link',
            LinkedCatalogIssue.make({
              sourceIssueId: issueId,
              targetIssueId: model.leftoverLink,
            }),
          ),
        )
        if (
          model.issueDetail._tag === 'LoadedIssue' &&
          Option.isSome(model.issueDetail.issue)
        ) {
          const issue = model.issueDetail.issue.value
          leftover.push(
            ...Array.map(leftoverStatusesForIssue(issue.id), status =>
              interaction(
                `status:${status}`,
                status,
                ClickedLeftoverStatus.make({ issueId: issue.id, status }),
              ),
            ),
            ...Array.map(catalogIssueRefsOf(issue), ref =>
              openInteractionOf(ref.id),
            ),
          )
        }
        return [...navigationInteractionsOf(model), ...leftover]
      },
      FileIssue: () => [
        interaction('submit', 'Submit issue', SubmittedIssue.make({})),
        ...navigationInteractionsOf(model),
        ...(model.products._tag === 'LoadedProducts'
          ? Array.map(model.products.products, entry =>
              interaction(
                `product:${entry.product.id}`,
                entry.product.name,
                SelectedIssueProduct.make({ productId: entry.product.id }),
              ),
            )
          : []),
        ...Array.map(IssuePriority.literals, priority =>
          interaction(
            `priority:${priority}`,
            priority,
            SelectedIssuePriority.make({ priority }),
          ),
        ),
      ],
      Backlog: () => [
        ...navigationInteractionsOf(model),
        ...productFilterInteractions(model),
        productMenuInteraction,
        ...Array.map(
          backlogIssues(listedBacklog(model, loadedIssuesIn(model))),
          openInteraction,
        ),
      ],
      AskFlow: () => navigationInteractionsOf(model),
      Inbox: () => [...navigationInteractionsOf(model), ...inboxChoices],
      EntityPage: ({ entity }) => [
        ...navigationInteractionsOf(model),
        ...Array.map(
          issuesOfPage(loadedIssuesIn(model), entity),
          openInteraction,
        ),
      ],
      Decisions: () => navigationInteractionsOf(model),
      Questions: () => navigationInteractionsOf(model),
      Reminders: () => navigationInteractionsOf(model),
      Features: () => navigationInteractionsOf(model),
      Products: () => navigationInteractionsOf(model),
      Findings: () => [
        ...navigationInteractionsOf(model),
        ...(model.findingsList._tag === 'LoadedFindings'
          ? Array.flatMap(model.findingsList.findings, finding =>
              finding.status === 'open' ? [promoteInteractionOf(finding)] : [],
            )
          : []),
      ],
      TriageInbox: () => [
        ...navigationInteractionsOf(model),
        ...(model.triageCandidates._tag === 'LoadedTriageCandidates'
          ? Array.flatMap(model.triageCandidates.candidates, candidate =>
              candidate.status === 'Draft'
                ? [
                    interaction(
                      `promote:${candidate.id}`,
                      `Promote ${candidate.id}`,
                      ClickedPromoteTriageCandidate.make({
                        candidateId: candidate.id,
                      }),
                    ),
                    interaction(
                      `dismiss:${candidate.id}`,
                      `Dismiss ${candidate.id}`,
                      ClickedDismissTriageCandidate.make({
                        candidateId: candidate.id,
                      }),
                    ),
                  ]
                : [],
            )
          : []),
      ],
    }),
  )

/**
 * What the page offers and what the keyboard offers, each token once: what
 * `Program.valid` projects for every host, each action with its keys.
 */
export const everyInteractionOf = (model: Model): ReadonlyArray<Interaction> =>
  uniqueByToken([...keyInteractionsOf(model), ...interactionsForModel(model)])

const messageOfTokenIn = (
  interactions: ReadonlyArray<Interaction>,
  token: string,
): Option.Option<Message> =>
  Option.map(
    Array.findFirst(interactions, candidate => candidate.token === token),
    candidate => candidate.message,
  )

/** Resolves one CLI or host token only when valid in the current state. */
export const messageForInteractionToken = (
  model: Model,
  token: string,
): Option.Option<Message> =>
  Option.orElse(messageOfTokenIn(keyInteractionsOf(model), token), () =>
    messageOfTokenIn(interactionsForModel(model), token),
  )

const draftMessageForToken = (token: string): Option.Option<Message> => {
  if (token.startsWith('title:')) {
    return Option.some(
      UpdatedIssueTitle.make({ value: token.slice('title:'.length) }),
    )
  }
  if (token.startsWith('details:')) {
    return Option.some(
      UpdatedIssueDetails.make({ value: token.slice('details:'.length) }),
    )
  }
  if (token.startsWith('product:')) {
    return Option.some(
      SelectedIssueProduct.make({ productId: token.slice('product:'.length) }),
    )
  }
  if (token.startsWith('priority:')) {
    return Option.map(
      S.decodeUnknownOption(IssuePriority)(token.slice('priority:'.length)),
      priority => SelectedIssuePriority.make({ priority }),
    )
  }
  return Option.none()
}

/**
 * Resolves a screen or CLI token, including the prefixes that carry text: on
 * the filing form `title:Audio stops`, `details:<text>`, `product:scribe` (an
 * id or a name), and `priority:P1`; on an Issue `comment:`, `link:`, `log:`,
 * and `status:`. On the list `search:heart rate` is what the search field
 * holds, and on the list and the backlog `open:1250` opens Issue 1250, both
 * without building the list's interactions.
 */
export const messageForScreenToken = (
  model: Model,
  token: string,
): Option.Option<Message> => {
  if (model.layer._tag === 'ChoiceLayer') {
    if (token.startsWith(PALETTE_TOKEN_PREFIX)) {
      return Option.some(
        UpdatedMenuQuery.make({
          query: token.slice(PALETTE_TOKEN_PREFIX.length),
        }),
      )
    }
    if (token.startsWith(PALETTE_RUN_TOKEN_PREFIX)) {
      return Option.some(
        PickedMenuRow.make({
          token: token.slice(PALETTE_RUN_TOKEN_PREFIX.length),
        }),
      )
    }
  }
  if (
    model.layer._tag === 'PeekLayer' &&
    token.startsWith(STATUS_TOKEN_PREFIX)
  ) {
    return Option.map(
      S.decodeUnknownOption(LeftoverStatus)(
        token.slice(STATUS_TOKEN_PREFIX.length),
      ),
      status =>
        AppliedRowChange.make({ change: ChangedStatus.make({ status }) }),
    )
  }
  if (token === SEARCH_SUBMIT_TOKEN && model.navigation._tag === 'IssueList') {
    return Option.some(SubmittedSearch.make({}))
  }
  if (
    token.startsWith(SEARCH_TOKEN_PREFIX) &&
    model.navigation._tag === 'IssueList'
  ) {
    return Option.some(
      UpdatedSearchQuery.make({
        query: token.slice(SEARCH_TOKEN_PREFIX.length),
      }),
    )
  }
  if (token.startsWith(PROMOTE_FINDING_TOKEN_PREFIX)) {
    return Option.some(
      ClickedPromoteFinding.make({
        findingId: token.slice(PROMOTE_FINDING_TOKEN_PREFIX.length),
      }),
    )
  }
  if (
    token.startsWith(OPEN_TOKEN_PREFIX) &&
    (model.navigation._tag === 'IssueList' ||
      model.navigation._tag === 'Backlog')
  ) {
    return Option.some(
      selectIssueMessageOf(token.slice(OPEN_TOKEN_PREFIX.length)),
    )
  }
  if (
    model.layer._tag === 'NamingViewLayer' &&
    token.startsWith(VIEW_NAME_TOKEN_PREFIX)
  ) {
    return Option.some(
      UpdatedViewName.make({
        name: token.slice(VIEW_NAME_TOKEN_PREFIX.length),
      }),
    )
  }
  const maybeViewMessage = viewMessageOfToken(token)
  if (Option.isSome(maybeViewMessage)) {
    return maybeViewMessage
  }
  const maybeDroppedCard = droppedCardOfToken(token)
  if (
    Option.isSome(maybeDroppedCard) &&
    model.navigation._tag === 'IssueList'
  ) {
    return Option.some(DroppedCard.make(maybeDroppedCard.value))
  }
  if (token === 'view-failure-dismiss') {
    return Option.some(DismissedViewFailure.make({}))
  }
  const maybeRowField = rowFieldOfToken(token)
  if (Option.isSome(maybeRowField)) {
    return Option.some(OpenedRowField.make(maybeRowField.value))
  }
  if (
    model.navigation._tag === 'IssueList' ||
    model.navigation._tag === 'Backlog'
  ) {
    if (token.startsWith(SELECT_TO_TOKEN_PREFIX)) {
      return Option.some(
        ExtendedRowSelectionTo.make({
          issueId: token.slice(SELECT_TO_TOKEN_PREFIX.length),
        }),
      )
    }
    if (token.startsWith(SELECT_TOKEN_PREFIX)) {
      return Option.some(
        ToggledRowSelection.make({
          issueId: token.slice(SELECT_TOKEN_PREFIX.length),
        }),
      )
    }
  }
  const known = messageForInteractionToken(model, token)
  if (Option.isSome(known)) {
    return known
  }
  if (
    model.navigation._tag === 'IssueList' ||
    model.navigation._tag === 'Backlog'
  ) {
    if (token === 'product:all') {
      return Option.some(
        SelectedProductFilter.make({ filter: AllProducts.make({}) }),
      )
    }
    if (token.startsWith('product:')) {
      return Option.some(
        SelectedProductFilter.make({
          filter: OneProduct.make({
            productId: token.slice('product:'.length),
          }),
        }),
      )
    }
    return Option.none()
  }
  if (model.navigation._tag === 'FileIssue') {
    return draftMessageForToken(token)
  }
  if (model.navigation._tag !== 'IssueDetail') {
    return Option.none()
  }
  const issueId = model.navigation.issueId
  if (token.startsWith('retarget:')) {
    return Option.some(
      RetargetedIssueProduct.make({
        issueId,
        productId: token.slice('retarget:'.length),
      }),
    )
  }
  if (token.startsWith('log:')) {
    return Option.some(
      AppendedIssueWorkLog.make({
        summary: token.slice('log:'.length),
      }),
    )
  }
  if (token.startsWith('comment-draft:')) {
    return Option.some(
      UpdatedLeftoverComment.make({
        value: token.slice('comment-draft:'.length),
      }),
    )
  }
  if (token.startsWith('link-draft:')) {
    return Option.some(
      UpdatedLeftoverLink.make({
        value: token.slice('link-draft:'.length),
      }),
    )
  }
  if (token.startsWith('comment:')) {
    return Option.some(
      SubmittedIssueComment.make({
        issueId,
        summary: token.slice('comment:'.length),
      }),
    )
  }
  if (token.startsWith('link:')) {
    return Option.some(
      LinkedCatalogIssue.make({
        sourceIssueId: issueId,
        targetIssueId: token.slice('link:'.length),
      }),
    )
  }
  if (token.startsWith('status:')) {
    return Option.map(
      S.decodeUnknownOption(LeftoverStatus)(token.slice('status:'.length)),
      status =>
        ClickedLeftoverStatus.make({
          issueId,
          status,
        }),
    )
  }
  return Option.none()
}

import { Array, Match as M, Option, Schema as S } from 'effect'

import { Issue, IssuePriority } from '@foldkit/instant-tools/issues'

import { AllWork, CloseToLanding, issuesForLandingFilter } from './landing.js'
import {
  AllProducts,
  LeftoverStatus,
  OneProduct,
  catalogIssueRefsOf,
  issuesForProductFilter,
  leftoverStatusesForIssue,
} from './leftover.js'
import {
  AppendedIssueWorkLog,
  ClickedDismissTriageCandidate,
  ClickedFileIssue,
  ClickedLeftoverStatus,
  ClickedOpenTriage,
  ClickedPromoteTriageCandidate,
  DismissedIssueDetail,
  LinkedCatalogIssue,
  Message,
  RetargetedIssueProduct,
  SelectedIssue,
  SelectedIssuePriority,
  SelectedIssueProduct,
  SelectedLandingFilter,
  SelectedProductFilter,
  SubmittedIssue,
  SubmittedIssueComment,
  UpdatedIssueDetails,
  UpdatedIssueTitle,
  UpdatedLeftoverComment,
  UpdatedLeftoverLink,
} from './message.js'
import {
  IssueDetailState,
  IssueDraft,
  IssueDraftState,
  IssuesState,
  LoadedIssues,
  type Model,
  ProductsState,
  TriageCandidatesState,
} from './model.js'

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
/** Every host-neutral Issue Tracker destination. */
export const Destination = S.Union([
  IssueListDestination,
  IssueDetailDestination,
  FileIssueDestination,
  TriageInboxDestination,
])
/** Every host-neutral Issue Tracker destination. */
export type Destination = typeof Destination.Type

/** One currently valid interaction and its canonical Message. */
export const Interaction = S.Struct({
  label: S.String,
  message: Message,
  token: S.String,
})
/** One currently valid interaction. */
export type Interaction = typeof Interaction.Type

const loadedIssues = (state: IssuesState): ReadonlyArray<Issue> =>
  state._tag === 'LoadedIssues' ? state.issues : []

/**
 * The Issues the list shows: those of the chosen product, then only the work
 * close to landing when that filter is on.
 */
export const listedIssues = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<Issue> =>
  issuesForLandingFilter(
    issuesForProductFilter(issues, model.productFilter),
    model.landingFilter,
  )

/** Exhaustively projects the Model into one host-neutral destination. */
export const destinationForModel = (model: Model): Destination =>
  M.value(model.navigation).pipe(
    M.withReturnType<Destination>(),
    M.tagsExhaustive({
      IssueList: () =>
        IssueListDestination.make({
          state:
            model.issues._tag === 'LoadedIssues'
              ? LoadedIssues.make({
                  issues: listedIssues(model, model.issues.issues),
                })
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
    }),
  )

const interaction = (
  token: string,
  label: string,
  message: Message,
): Interaction => Interaction.make({ label, message, token })

/** Returns every currently valid high-level host interaction. */
export const interactionsForModel = (
  model: Model,
): ReadonlyArray<Interaction> =>
  M.value(model.navigation).pipe(
    M.withReturnType<ReadonlyArray<Interaction>>(),
    M.tagsExhaustive({
      IssueList: () => [
        interaction('file', 'File issue', ClickedFileIssue.make({})),
        interaction('triage', 'Open triage', ClickedOpenTriage.make({})),
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
        interaction(
          'landing:all',
          'All work',
          SelectedLandingFilter.make({ filter: AllWork.make({}) }),
        ),
        interaction(
          'landing:close',
          'Close to landing',
          SelectedLandingFilter.make({ filter: CloseToLanding.make({}) }),
        ),
        ...Array.map(listedIssues(model, loadedIssues(model.issues)), issue =>
          interaction(
            `open:${issue.id}`,
            `Open ${issue.id}`,
            SelectedIssue.make({ issueId: issue.id }),
          ),
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
              interaction(
                `open:${ref.id}`,
                `Open ${ref.id}`,
                SelectedIssue.make({ issueId: ref.id }),
              ),
            ),
          )
        }
        return [
          interaction('back', 'Back to issues', DismissedIssueDetail.make({})),
          ...leftover,
        ]
      },
      FileIssue: () => [
        interaction('submit', 'Submit issue', SubmittedIssue.make({})),
        interaction('back', 'Back to issues', DismissedIssueDetail.make({})),
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
      TriageInbox: () => [
        interaction('back', 'Back to issues', DismissedIssueDetail.make({})),
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

/** Resolves one CLI or host token only when valid in the current state. */
export const messageForInteractionToken = (
  model: Model,
  token: string,
): Option.Option<Message> =>
  Option.map(
    Array.findFirst(
      interactionsForModel(model),
      candidate => candidate.token === token,
    ),
    candidate => candidate.message,
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
 * and `status:`.
 */
export const messageForScreenToken = (
  model: Model,
  token: string,
): Option.Option<Message> => {
  const known = messageForInteractionToken(model, token)
  if (Option.isSome(known)) {
    return known
  }
  if (model.navigation._tag === 'IssueList') {
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

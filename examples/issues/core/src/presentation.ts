import { Array, Match as M, Option, Schema as S } from 'effect'

import { Issue } from '@foldkit/instant-tools/issues'

import {
  ClickedDismissTriageCandidate,
  ClickedFileIssue,
  ClickedOpenTriage,
  ClickedPromoteTriageCandidate,
  DismissedIssueDetail,
  Message,
  SelectedIssue,
  SubmittedIssue,
} from './message.js'
import {
  IssueDetailState,
  IssueDraft,
  IssueDraftState,
  IssuesState,
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

/** Exhaustively projects the Model into one host-neutral destination. */
export const destinationForModel = (model: Model): Destination =>
  M.value(model.navigation).pipe(
    M.withReturnType<Destination>(),
    M.tagsExhaustive({
      IssueList: () =>
        IssueListDestination.make({
          state: model.issues,
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
        ...Array.map(loadedIssues(model.issues), issue =>
          interaction(
            `open:${issue.id}`,
            `Open ${issue.id}`,
            SelectedIssue.make({ issueId: issue.id }),
          ),
        ),
      ],
      IssueDetail: () => [
        interaction('back', 'Back to issues', DismissedIssueDetail.make({})),
      ],
      FileIssue: () => [
        interaction('submit', 'Submit issue', SubmittedIssue.make({})),
        interaction('back', 'Back to issues', DismissedIssueDetail.make({})),
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

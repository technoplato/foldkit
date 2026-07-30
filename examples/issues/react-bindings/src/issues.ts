import { type Layer } from 'effect'
import { Program } from 'foldkit'
import {
  ClickedDismissTriageCandidate,
  ClickedFileIssue,
  ClickedOpenTriage,
  ClickedPromoteTriageCandidate,
  DismissedIssueDetail,
  FileIssue,
  type Interaction,
  IssueTrackerProgram,
  type IssueTrackerResources,
  type Message,
  type Model,
  type Navigation,
  OpenedNavigation,
  SelectedIssue,
  SelectedIssuePriority,
  SelectedIssueProduct,
  StaticIssueTrackerResources,
  SubmittedIssue,
  UpdatedIssueDetails,
  UpdatedIssueTitle,
  modelForNavigation,
} from 'issues-core-example'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

import { type IssuePriority } from '@foldkit/instant-tools/issues'

/** Stable actions exposed to React and React Native Issue Tracker Clients. */
export type IssueTrackerActions = Readonly<{
  clickedFileIssue: () => void
  clickedOpenTriage: () => void
  dismissedTriageCandidate: (candidateId: string) => void
  dismissedDestination: () => void
  openedNavigation: (navigation: Navigation) => void
  performed: (interaction: Interaction) => void
  selectedIssue: (issueId: string) => void
  selectedPriority: (priority: IssuePriority) => void
  selectedProduct: (productId: string) => void
  submittedIssue: () => void
  promotedTriageCandidate: (candidateId: string) => void
  updatedDetails: (value: string) => void
  updatedTitle: (value: string) => void
}>

/** One state or replay route accepted by an Issue Tracker Client. */
export type IssueTrackerInitialRoute = Program.ResolvedProgramRoute<
  Model,
  Message
>

/** Creates a React Client over host-selected live or deterministic resources. */
export const makeIssueTrackerReactClient = (
  resources: Layer.Layer<IssueTrackerResources>,
) =>
  createReplayableReactProgramClient<
    Model,
    Message,
    IssueTrackerActions,
    IssueTrackerInitialRoute,
    IssueTrackerResources
  >({
    createActions: enqueueMessage => ({
      clickedFileIssue: () => enqueueMessage(ClickedFileIssue.make({})),
      clickedOpenTriage: () => enqueueMessage(ClickedOpenTriage.make({})),
      dismissedTriageCandidate: candidateId =>
        enqueueMessage(ClickedDismissTriageCandidate.make({ candidateId })),
      dismissedDestination: () => enqueueMessage(DismissedIssueDetail.make({})),
      openedNavigation: navigation =>
        enqueueMessage(OpenedNavigation.make({ navigation })),
      performed: interaction => enqueueMessage(interaction.message),
      selectedIssue: issueId => enqueueMessage(SelectedIssue.make({ issueId })),
      selectedPriority: priority =>
        enqueueMessage(SelectedIssuePriority.make({ priority })),
      selectedProduct: productId =>
        enqueueMessage(SelectedIssueProduct.make({ productId })),
      submittedIssue: () => enqueueMessage(SubmittedIssue.make({})),
      promotedTriageCandidate: candidateId =>
        enqueueMessage(ClickedPromoteTriageCandidate.make({ candidateId })),
      updatedDetails: value =>
        enqueueMessage(UpdatedIssueDetails.make({ value })),
      updatedTitle: value => enqueueMessage(UpdatedIssueTitle.make({ value })),
    }),
    name: 'IssueTracker',
    program: IssueTrackerProgram,
    resources,
    route: initialRoute => initialRoute,
  })

/** Deterministic Client used by React Native previews and offline hosts. */
export const StaticIssueTrackerClient = makeIssueTrackerReactClient(
  StaticIssueTrackerResources,
)

/** Canonical fresh filing route helper for host carriers. */
export const initialIssueTrackerRoute = Program.state(
  modelForNavigation(FileIssue.make({})),
)

import { Array, Effect, Option, Stream } from 'effect'
import { buttonsOf, inputsOf, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { InstantEntityStoreError } from '@foldkit/instant-tools/instant'
import {
  ActiveWork,
  ApplicationProduct,
  CheckedSubtask,
  ConversationReference,
  InstantStorageAttachmentSource,
  Issue,
  IssueAttachment,
  IssueSubtask,
  IssueTracker,
  IssueTrackerError,
  type IssueTrackerService,
  LibraryProduct,
  ProductCatalog,
  ProductCatalogEntry,
  ProductCatalogError,
  type ProductCatalogService,
  RecordingMention,
  RecordingReference,
  RecordingSegment,
  StuckWork,
  type TrackedProduct,
  TriageCandidate,
  UncheckedSubtask,
  UriReference,
} from '@foldkit/instant-tools/issues'
import { LeftoverPeer } from '@foldkit/instant-tools/leftover'
import { IssueLogEvidence } from '@foldkit/instant-tools/logging'

import { modelForNavigation } from './init.js'
import { IssueIdentity, type IssueIdentityService } from './issueIdentity.js'
import { OneProduct, leftoverStatusOf, newestWorkLog } from './leftover.js'
import {
  AppendedIssueWorkLog,
  ClearedIssueWorkInProgress,
  ClickedFileIssue,
  ClickedLeftoverStatus,
  ClickedOpenTriage,
  ClickedPromoteTriageCandidate,
  ComposedIssueDraft,
  ConfirmedIssueDeletion,
  DismissedIssueDetail,
  LinkedCatalogIssue,
  ObservedIssue,
  ObservedIssueLogs,
  ObservedIssues,
  ObservedLeftoverPeers,
  ObservedProducts,
  ObservedTriageCandidates,
  SelectedIssue,
  SelectedIssueStatus,
  SelectedProductFilter,
  SubmittedIssue,
  SubmittedIssueAttachment,
  SubmittedIssueComment,
  SubmittedIssueEdit,
  SubmittedIssueMention,
  SubmittedIssueSubtasks,
  SubmittedIssueSuccessCriterion,
  SubmittedIssueWorkInProgress,
  SubmittedIssueWorkLogEntry,
  SubmittedProduct,
  SubmittedSubtaskMarks,
  SubmittedSuccessCriteriaMarks,
  UpdatedIssueTitle,
  UpdatedLeftoverComment,
  UpdatedLeftoverLink,
} from './message.js'
import {
  Backlog,
  DraftMention,
  DraftSuccessCriterion,
  DraftWorkLogEntry,
  FailedProductAddition,
  FileIssue,
  IssueDetail,
  IssueDraft,
  IssueList,
  LoadedLeftoverPresence,
  LoadingIssue,
  LoadingIssueLogs,
  LoadingLeftoverPresence,
  NotObservingLeftoverPresence,
  RefusedProductAddition,
  SavedProductAddition,
  SavingProductAddition,
  TriageInbox,
  UnchangedProductAddition,
  WorkInProgressEdit,
} from './model.js'
import {
  destinationForModel,
  interactionsForModel,
  messageForScreenToken,
} from './presentation.js'
import { type IssueTrackerResources, issuesScreen } from './program.js'
import {
  StaticIssueTrackerResources,
  makeMemoryIssueTracker,
  makeMemoryProductCatalog,
  signedInAuthor,
} from './resources.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { subscriptions } from './subscription.js'
import {
  CommentOnIssue,
  SaveIssueWorkLog,
  SetLeftoverStatus,
  update,
} from './update.js'

const product = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })
const productEntry = ProductCatalogEntry.make({
  product,
  updatedAtMs: 1_000,
})
const issue = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_000,
  details: 'The transcript shifted sideways.',
  id: 'issue-021',
  issueType: Option.none(),
  mentions: [],
  priority: 'P1',
  product,
  projectId: Option.none(),
  reportedDate: Option.none(),
  sourceDocument: Option.none(),
  status: 'Open',
  successCriteria: [],
  title: 'Keep transcript aligned',
  updatedAtMs: 1_000,
  viewerURL: Option.none(),
  workLog: [],
})
const segment = RecordingSegment.make({
  createdAtMs: 1_000,
  endMilliseconds: 9_000,
  id: 'segment-001',
  publicUrl: Option.some('/segments/segment-001'),
  recordingId: 'recording-001',
  startMilliseconds: 4_000,
  transcript: 'The transcript shifted sideways.',
})
const candidate = TriageCandidate.make({
  createdAtMs: 1_000,
  id: 'candidate-001',
  product,
  segment,
  status: 'Draft',
  suggestedDetails: segment.transcript,
  suggestedPriority: 'P1',
  suggestedTitle: 'Keep transcript aligned',
  updatedAtMs: 1_000,
})

const runNow = <A, E>(effect: Effect.Effect<A, E>): A => Effect.runSync(effect)

const authoredBy = (author: string): IssueIdentityService => ({
  author: Effect.succeed(author),
  next: Effect.succeed({ id: 'issue-preview', nowMs: 2_000 }),
})

const unusedTracker = (): IssueTrackerService =>
  runNow(makeMemoryIssueTracker([]))

describe('Issue Tracker Program', () => {
  it.each([
    IssueList.make({}),
    IssueDetail.make({ issueId: 'issue-021' }),
    FileIssue.make({}),
    TriageInbox.make({}),
    Backlog.make({}),
  ])('round trips each navigation path', navigation => {
    const path = navigationToPath(navigation)
    expect(pathToNavigation(path)).toEqual(navigation)
    expect(navigationToPath(pathToNavigation(path))).toBe(path)
  })

  it('models list, detail, and independent detail observation as state', () => {
    const initial = modelForNavigation(IssueList.make({}))
    const [selected, selectedCommands] = update(
      initial,
      SelectedIssue.make({ issueId: issue.id }),
    )
    expect(selected.navigation).toEqual(IssueDetail.make({ issueId: issue.id }))
    expect(selected.issueDetail).toEqual(
      LoadingIssue.make({ issueId: issue.id }),
    )
    expect(selected.issueLogs).toEqual(
      LoadingIssueLogs.make({ issueId: issue.id }),
    )
    expect(selected.leftoverPresence).toEqual(
      LoadingLeftoverPresence.make({ leftoverId: issue.id }),
    )
    expect(selectedCommands[0]?.name).toBe('JoinLeftoverRoom')

    const [observed] = update(
      selected,
      ObservedIssue.make({ issue: Option.some(issue), issueId: issue.id }),
    )
    expect(destinationForModel(observed)).toMatchObject({
      _tag: 'IssueDetailDestination',
      state: {
        _tag: 'LoadedIssue',
        issue: Option.some(issue),
      },
    })

    const [ignored] = update(
      observed,
      ObservedIssue.make({
        issue: Option.none(),
        issueId: 'different-issue',
      }),
    )
    expect(ignored).toEqual(observed)

    const evidence = IssueLogEvidence.make({
      category: 'issues',
      contributingPaths: [],
      issueID: issue.id,
      level: 'Info',
      logID: 'log-021',
      logNamespace: 'instantToolsLogs',
      message: 'Investigating issue #021.',
      name: 'issue.investigation.started',
      timestampMs: 1_001,
      viewerURL: 'https://issues.knophy.com/issues/021',
    })
    const [withEvidence] = update(
      observed,
      ObservedIssueLogs.make({ issueId: issue.id, logs: [evidence] }),
    )
    expect(withEvidence.issueLogs).toMatchObject({
      _tag: 'LoadedIssueLogs',
      logs: [evidence],
    })
  })

  it('joins leftover presence and paints peers on IssueDetail', () => {
    const initial = modelForNavigation(IssueList.make({}))
    const [selected] = update(
      initial,
      SelectedIssue.make({ issueId: issue.id }),
    )
    const peer = LeftoverPeer.make({
      agentId: 'issues-viewer',
      leftoverId: issue.id,
      origin: 'issues.knophy.com',
      peerId: 'issues-viewer',
      role: 'viewer',
    })
    const [withPeers] = update(
      selected,
      ObservedLeftoverPeers.make({ leftoverId: issue.id, peers: [peer] }),
    )
    expect(withPeers.leftoverPresence).toEqual(
      LoadedLeftoverPresence.make({ leftoverId: issue.id, peers: [peer] }),
    )
    expect(
      Array.map(textsOf(issuesScreen(withPeers)), text => text.content),
    ).toContain('issues-viewer  viewer  issues.knophy.com')
    expect(
      Array.map(textsOf(issuesScreen(withPeers)), text => text.content),
    ).toContain('Quorum present')
    const [dismissed, dismissedCommands] = update(
      withPeers,
      DismissedIssueDetail.make({}),
    )
    expect(dismissed.leftoverPresence).toEqual(
      NotObservingLeftoverPresence.make({}),
    )
    expect(dismissedCommands[0]?.name).toBe('LeaveLeftoverRoom')
    const [switched, switchedCommands] = update(
      selected,
      SelectedIssue.make({ issueId: '240' }),
    )
    expect(switched.leftoverPresence).toEqual(
      LoadingLeftoverPresence.make({ leftoverId: '240' }),
    )
    expect(Array.map(switchedCommands, command => command.name)).toEqual([
      'LeaveLeftoverRoom',
      'JoinLeftoverRoom',
    ])
  })

  it('delivers collection and detail decode failures to visible state', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const failingIssueTracker: IssueTrackerService = {
          ...unusedTracker(),
          fetch: () => Effect.succeed([]),
          observe: () =>
            Stream.fail(
              new IssueTrackerError({
                cause: new Error('Issue collection payload failed to decode.'),
                operation: 'Observe',
              }),
            ),
          observeIssue: () =>
            Stream.fail(
              new IssueTrackerError({
                cause: new Error('Issue detail payload failed to decode.'),
                operation: 'ObserveIssue',
              }),
            ),
          save: () => Effect.void,
        }

        const maybeCollectionFailure = yield* subscriptions.issues
          .dependenciesToStream({})
          .pipe(
            Stream.runHead,
            Effect.provideService(IssueTracker, failingIssueTracker),
            Effect.provide(StaticIssueTrackerResources),
          )
        const collectionFailure = Option.getOrThrow(maybeCollectionFailure)
        expect(collectionFailure).toMatchObject({
          _tag: 'FailedObserveIssues',
          reason: 'Observe: Issue collection payload failed to decode.',
        })
        const [failedList] = update(
          modelForNavigation(IssueList.make({})),
          collectionFailure,
        )
        expect(destinationForModel(failedList)).toMatchObject({
          _tag: 'IssueListDestination',
          state: { _tag: 'FailedIssues' },
        })

        const maybeDetailFailure = yield* subscriptions.selectedIssue
          .dependenciesToStream({ maybeIssueId: Option.some(issue.id) })
          .pipe(
            Stream.runHead,
            Effect.provideService(IssueTracker, failingIssueTracker),
            Effect.provide(StaticIssueTrackerResources),
          )
        const detailFailure = Option.getOrThrow(maybeDetailFailure)
        expect(detailFailure).toMatchObject({
          _tag: 'FailedObserveIssue',
          issueId: issue.id,
          reason: 'ObserveIssue: Issue detail payload failed to decode.',
        })
        const [failedDetail] = update(
          modelForNavigation(IssueDetail.make({ issueId: issue.id })),
          detailFailure,
        )
        expect(destinationForModel(failedDetail)).toMatchObject({
          _tag: 'IssueDetailDestination',
          state: { _tag: 'FailedIssue' },
        })
      }),
    )
  })

  it('requires a first-class product and title before filing', () => {
    const initial = modelForNavigation(IssueList.make({}))
    const [withProducts] = update(
      initial,
      ObservedProducts.make({ products: [productEntry] }),
    )
    const [filing] = update(withProducts, ClickedFileIssue.make({}))
    const [invalid, invalidCommands] = update(filing, SubmittedIssue.make({}))
    expect(invalid.draftState).toMatchObject({
      _tag: 'FailedIssueDraft',
      reason: 'A title is required.',
    })
    expect(invalidCommands).toEqual([])

    const [titled] = update(
      invalid,
      UpdatedIssueTitle.make({ value: 'Audio stops unexpectedly' }),
    )
    const [saving, commands] = update(titled, SubmittedIssue.make({}))
    expect(saving.draftState._tag).toBe('SavingIssueDraft')
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('SaveIssue')
  })

  it('keeps transcript candidates as drafts until a review Message', () => {
    const initial = modelForNavigation(IssueList.make({}))
    const [observed] = update(
      initial,
      ObservedTriageCandidates.make({ candidates: [candidate] }),
    )
    const [triage] = update(observed, ClickedOpenTriage.make({}))
    expect(interactionsForModel(triage).map(action => action.token)).toEqual([
      'back',
      'promote:candidate-001',
      'dismiss:candidate-001',
    ])

    const [reviewing, commands] = update(
      triage,
      ClickedPromoteTriageCandidate.make({ candidateId: candidate.id }),
    )
    expect(reviewing).toEqual(triage)
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('ReviewTriageCandidate')
  })

  it('projects leftover status and newest workLog outside details', () => {
    const withLog = Issue.make({
      ...issue,
      status: 'InProgress',
      workLog: [
        {
          agentId: Option.some('issues-245-grok'),
          commitSha: Option.none(),
          durationSeconds: Option.none(),
          id: 'work-old',
          occurredAtMs: 1_000,
          state: Option.none(),
          summary: 'older leftover',
        },
        {
          agentId: Option.some('issues-245-grok'),
          commitSha: Option.none(),
          durationSeconds: Option.none(),
          id: 'work-new',
          occurredAtMs: 2_000,
          state: Option.none(),
          summary: 'newer leftover',
        },
      ],
    })
    expect(leftoverStatusOf(withLog.status)).toBe('Open')
    expect(newestWorkLog(withLog.workLog).map(entry => entry.summary)).toEqual([
      'newer leftover',
      'older leftover',
    ])
    const initial = modelForNavigation(
      IssueDetail.make({ issueId: withLog.id }),
    )
    const [observed] = update(
      initial,
      ObservedIssue.make({ issue: Option.some(withLog), issueId: withLog.id }),
    )
    const tokens = interactionsForModel(observed).map(action => action.token)
    expect(leftoverStatusOf('VerificationNeeded')).toBe('Open')
    expect(leftoverStatusOf('Fixed')).toBe('Closed')
    expect(tokens.filter(token => token.startsWith('status:'))).toEqual([
      'status:Open',
      'status:Blocked',
      'status:Closed',
    ])
    expect(tokens).not.toContain('status:Verify')
    const screenTexts = textsOf(issuesScreen(observed)).map(
      node => node.content,
    )
    const detailsIndex = screenTexts.indexOf(withLog.details)
    const progressIndex = screenTexts.indexOf('Work log')
    const newerIndex = screenTexts.findIndex(text =>
      text.includes('newer leftover'),
    )
    const olderIndex = screenTexts.findIndex(text =>
      text.includes('older leftover'),
    )
    expect(detailsIndex).toBeGreaterThan(-1)
    expect(progressIndex).toBeGreaterThan(detailsIndex)
    expect(newerIndex).toBeGreaterThan(progressIndex)
    expect(olderIndex).toBeGreaterThan(newerIndex)
  })

  it('comments, links CatalogIssueReference, and sets leftover status', () => {
    const initial = modelForNavigation(IssueDetail.make({ issueId: issue.id }))
    const [observed] = update(
      initial,
      ObservedIssue.make({ issue: Option.some(issue), issueId: issue.id }),
    )
    const [commenting, commentCommands] = update(
      observed,
      SubmittedIssueComment.make({
        issueId: issue.id,
        summary: 'Painted leftover progress.',
      }),
    )
    expect(commenting.issueMutation._tag).toBe('SavingIssueMutation')
    expect(commentCommands[0]?.name).toBe('CommentOnIssue')

    const [linking, linkCommands] = update(
      observed,
      LinkedCatalogIssue.make({
        sourceIssueId: issue.id,
        targetIssueId: '240',
      }),
    )
    expect(linking.issueMutation._tag).toBe('SavingIssueMutation')
    expect(linkCommands[0]?.name).toBe('LinkCatalogIssue')

    const [statusing, statusCommands] = update(
      observed,
      ClickedLeftoverStatus.make({ issueId: issue.id, status: 'Blocked' }),
    )
    expect(statusing.issueMutation._tag).toBe('SavingIssueMutation')
    expect(statusCommands[0]?.name).toBe('SetLeftoverStatus')

    const linked = Issue.make({
      ...issue,
      mentions: [
        {
          capturedAtMs: Option.some(2_000),
          directQuote: Option.none(),
          id: 'link-issue-021-240',
          issueId: issue.id,
          related: [{ _tag: 'Issue', id: '240' }],
          reporter: Option.none(),
          source: { _tag: 'Agent', id: 'issues-245-grok' },
        },
      ],
    })
    const [withLink] = update(
      observed,
      ObservedIssue.make({ issue: Option.some(linked), issueId: linked.id }),
    )
    const openTokens = interactionsForModel(withLink)
      .map(action => action.token)
      .filter(token => token.startsWith('open:'))
    expect(openTokens).toContain('open:240')
    const screenButtons = buttonsOf(issuesScreen(withLink)).map(
      button => button.token ?? '',
    )
    expect(screenButtons).toContain('open:240')
  })

  it('paints leftover comment and link TextInputs from Model drafts', () => {
    const initial = modelForNavigation(IssueDetail.make({ issueId: issue.id }))
    const [observed] = update(
      initial,
      ObservedIssue.make({ issue: Option.some(issue), issueId: issue.id }),
    )
    const [commenting] = update(
      observed,
      UpdatedLeftoverComment.make({ value: 'Painted leftover progress.' }),
    )
    const [linking] = update(
      commenting,
      UpdatedLeftoverLink.make({ value: '240' }),
    )
    expect(linking.leftoverComment).toBe('Painted leftover progress.')
    expect(linking.leftoverLink).toBe('240')
    expect(
      messageForScreenToken(
        observed,
        'comment-draft:Painted leftover progress.',
      ),
    ).toEqual(
      Option.some(
        UpdatedLeftoverComment.make({ value: 'Painted leftover progress.' }),
      ),
    )
    expect(messageForScreenToken(linking, 'comment-submit')).toEqual(
      Option.some(
        SubmittedIssueComment.make({
          issueId: issue.id,
          summary: 'Painted leftover progress.',
        }),
      ),
    )
    expect(messageForScreenToken(linking, 'link-submit')).toEqual(
      Option.some(
        LinkedCatalogIssue.make({
          sourceIssueId: issue.id,
          targetIssueId: '240',
        }),
      ),
    )
    const screen = issuesScreen(linking)
    expect(Array.map(inputsOf(screen), input => input.token ?? '')).toEqual([
      'comment-draft:',
      'link-draft:',
    ])
    expect(Array.map(inputsOf(screen), input => input.value)).toEqual([
      'Painted leftover progress.',
      '240',
    ])
    const [submitting, commentCommands] = update(
      linking,
      SubmittedIssueComment.make({
        issueId: issue.id,
        summary: linking.leftoverComment,
      }),
    )
    expect(submitting.leftoverComment).toBe('')
    expect(commentCommands[0]?.name).toBe('CommentOnIssue')
    const [away] = update(linking, SelectedIssue.make({ issueId: '240' }))
    expect(away.leftoverComment).toBe('')
    expect(away.leftoverLink).toBe('')
  })

  it('offers leftover Open | Blocked | Closed and never Closed on 240-243', () => {
    const closable = modelForNavigation(IssueDetail.make({ issueId: issue.id }))
    const [observedClosable] = update(
      closable,
      ObservedIssue.make({ issue: Option.some(issue), issueId: issue.id }),
    )
    expect(
      interactionsForModel(observedClosable)
        .map(action => action.token)
        .filter(token => token.startsWith('status:')),
    ).toEqual(['status:Open', 'status:Blocked', 'status:Closed'])

    const unclosableIssue = Issue.make({ ...issue, id: '240' })
    const unclosable = modelForNavigation(
      IssueDetail.make({ issueId: unclosableIssue.id }),
    )
    const [observedUnclosable] = update(
      unclosable,
      ObservedIssue.make({
        issue: Option.some(unclosableIssue),
        issueId: unclosableIssue.id,
      }),
    )
    const unclosableTokens = interactionsForModel(observedUnclosable).map(
      action => action.token,
    )
    expect(
      unclosableTokens.filter(token => token.startsWith('status:')),
    ).toEqual(['status:Open', 'status:Blocked'])
    expect(unclosableTokens).not.toContain('status:Closed')
    expect(unclosableTokens).not.toContain('status:Verify')
    const screenButtons = buttonsOf(issuesScreen(observedUnclosable)).map(
      button => button.token ?? '',
    )
    expect(screenButtons).toContain('status:Open')
    expect(screenButtons).toContain('status:Blocked')
    expect(screenButtons).not.toContain('status:Closed')
    expect(screenButtons).not.toContain('status:Verify')
  })

  it('filters leftover cards by live catalog product', () => {
    const foldkit = ProductCatalogEntry.make({
      product: LibraryProduct.make({ id: 'foldkit', name: 'Foldkit' }),
      updatedAtMs: 1_000,
    })
    const scribeIssue = Issue.make({
      ...issue,
      id: 'issue-scribe',
      title: 'Scribe transcript card',
    })
    const foldkitIssue = Issue.make({
      ...issue,
      id: 'issue-041',
      product: foldkit.product,
      title: 'Foldkit leftover',
    })
    const initial = modelForNavigation(IssueList.make({}))
    const [withProducts] = update(
      initial,
      ObservedProducts.make({ products: [productEntry, foldkit] }),
    )
    const [loaded] = update(
      withProducts,
      ObservedIssues.make({ issues: [scribeIssue, foldkitIssue] }),
    )
    const [filtered] = update(
      loaded,
      SelectedProductFilter.make({
        filter: OneProduct.make({ productId: 'foldkit' }),
      }),
    )
    const destination = destinationForModel(filtered)
    expect(destination._tag).toBe('IssueListDestination')
    if (
      destination._tag === 'IssueListDestination' &&
      destination.state._tag === 'LoadedIssues'
    ) {
      expect(destination.state.issues.map(item => item.id)).toEqual([
        'issue-041',
      ])
    }
    const labels = buttonsOf(issuesScreen(filtered)).map(button => button.label)
    expect(labels.some(label => label.includes('Scribe transcript card'))).toBe(
      false,
    )
    expect(labels.some(label => label.includes('Foldkit leftover'))).toBe(true)
  })

  it('emits SaveIssueWorkLog from AppendedIssueWorkLog on a loaded IssueDetail', () => {
    const initial = modelForNavigation(IssueDetail.make({ issueId: issue.id }))
    const [observed] = update(
      initial,
      ObservedIssue.make({ issue: Option.some(issue), issueId: issue.id }),
    )
    const [saving, commands] = update(
      observed,
      AppendedIssueWorkLog.make({ summary: 'Logged leftover progress.' }),
    )
    expect(saving.issueMutation._tag).toBe('SavingIssueMutation')
    expect(commands).toHaveLength(1)
    expect(Option.map(Array.head(commands), command => command.name)).toEqual(
      Option.some('SaveIssueWorkLog'),
    )
  })

  it('ignores AppendedIssueWorkLog without IssueDetail LoadedIssue Some', () => {
    const list = modelForNavigation(IssueList.make({}))
    const [fromList, listCommands] = update(
      list,
      AppendedIssueWorkLog.make({ summary: 'Should be ignored.' }),
    )
    expect(fromList).toEqual(list)
    expect(listCommands).toEqual([])

    const loading = modelForNavigation(IssueDetail.make({ issueId: issue.id }))
    const [fromLoading, loadingCommands] = update(
      loading,
      AppendedIssueWorkLog.make({ summary: 'Should be ignored.' }),
    )
    expect(fromLoading).toEqual(loading)
    expect(loadingCommands).toEqual([])
  })

  it('SaveIssueWorkLog keeps status and records who wrote the entry', async () => {
    const tracker = await Effect.runPromise(makeMemoryIssueTracker([issue]))
    const result = await Effect.runPromise(
      SaveIssueWorkLog({
        issue,
        summary: 'Keep leftover Open.',
      }).effect.pipe(
        Effect.provideService(IssueTracker, tracker),
        Effect.provideService(IssueIdentity, authoredBy('owner@example.com')),
      ),
    )
    expect(result._tag).toBe('SucceededSaveIssueWorkLog')
    if (result._tag !== 'SucceededSaveIssueWorkLog') {
      return
    }
    expect(result.issue.status).toBe('Open')
    expect(result.issue.status).not.toBe('Closed')
    expect(result.issue.status).not.toBe('Resolved')
    expect(result.issue.status).not.toBe('Fixed')
    expect(result.issue.status).not.toBe('Verified')
    const maybeEntry = Array.last(result.issue.workLog)
    expect(Option.isSome(maybeEntry)).toBe(true)
    if (Option.isSome(maybeEntry)) {
      expect(maybeEntry.value.summary).toBe('Keep leftover Open.')
      expect(maybeEntry.value.agentId).toEqual(Option.some('owner@example.com'))
    }
    expect(
      Option.map(runNow(tracker.fetchIssue(issue.id)), stored =>
        stored.workLog.map(entry => entry.summary),
      ),
    ).toEqual(Option.some(['Keep leftover Open.']))
  })

  it('refuses Closed leftover status on 240-243 without saving', async () => {
    const unclosable = Issue.make({ ...issue, id: '242' })
    const saved: Array<typeof Issue.Type> = []
    const tracker: IssueTrackerService = {
      ...unusedTracker(),
      fetch: () => Effect.succeed([unclosable]),
      observe: () => Stream.empty,
      observeIssue: () => Stream.empty,
      save: next =>
        Effect.sync(() => {
          saved.push(next)
        }),
    }
    const result = await Effect.runPromise(
      SetLeftoverStatus({
        issueId: unclosable.id,
        leftover: 'Closed',
      }).effect.pipe(
        Effect.provideService(IssueTracker, tracker),
        Effect.provide(StaticIssueTrackerResources),
      ),
    )
    expect(result._tag).toBe('FailedSaveIssue')
    expect(saved).toEqual([])
    expect(unclosable.status).toBe('Open')
  })

  const stored = (id: string, title: string) =>
    Issue.make({ ...issue, id, title, workLog: [] })

  const runWith = <A>(
    tracker: IssueTrackerService,
    effect: Effect.Effect<A, never, IssueTrackerResources>,
  ) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provideService(IssueTracker, tracker),
        Effect.provide(StaticIssueTrackerResources),
      ),
    )

  const filingModel = () => {
    const [withProducts] = update(
      modelForNavigation(FileIssue.make({})),
      ObservedProducts.make({
        products: [
          productEntry,
          ProductCatalogEntry.make({
            product: LibraryProduct.make({ id: 'foldkit', name: 'Foldkit' }),
            updatedAtMs: 1_000,
          }),
        ],
      }),
    )
    return withProducts
  }

  const composedDraft = (productId: string) =>
    IssueDraft.make({
      area: Option.some('Issue tracker / CLI'),
      claimantId: Option.some('claude-code/issues-one-way'),
      details: 'Filing fails with a bare IssueTrackerError.',
      issueType: Option.some('defect'),
      leftoverKind: Option.none(),
      mentions: [
        DraftMention.make({
          capturedAtMs: Option.some(1_791_640_000_000),
          directQuote: Option.some('Recording 208 #1884: "the save failed"'),
          note: Option.none(),
          related: [
            UriReference.make({
              value:
                'https://words.pisspoursoftware.xyz/recording/faa684c2/section/60f587e4?t=10130.35',
            }),
          ],
          reporter: Option.none(),
          source: RecordingReference.make({
            recording: RecordingMention.make({
              endMilliseconds: Option.some(10_151_528),
              recordingId: 'faa684c2-34e4-47e5-8f9b-3b2196da9463',
              screenshotIds: [],
              startMilliseconds: 10_130_348,
            }),
          }),
        }),
        DraftMention.make({
          capturedAtMs: Option.some(1_791_713_374_021),
          directQuote: Option.some('Make sure there is only one way.'),
          note: Option.none(),
          related: [],
          reporter: Option.none(),
          source: ConversationReference.make({
            conversation: {
              harness: 'claude-code',
              messageId: '82fc7bc4',
              note: 'Typed in the Claude chat.',
              sessionId: 'f1283b96',
            },
          }),
        }),
      ],
      priority: 'P1',
      productId,
      relatedIssueIds: ['502', '691'],
      status: 'InProgress',
      successCriteria: [
        DraftSuccessCriterion.make({
          outcome: 'issues file names the real cause of a failed save.',
          requiredEvidence: ['FocusedTest'],
        }),
      ],
      title: 'issues file hides the cause of a failed save',
      workLog: [
        DraftWorkLogEntry.make({
          agentId: Option.some('claude-code/issues-one-way'),
          commitSha: Option.none(),
          occurredAtMs: 1_791_640_000_000,
          state: Option.some('filed'),
          summary: 'Filed from the session that hit the failure.',
        }),
      ],
    })

  it('files a composed draft with every field under the next free number', async () => {
    const [composed] = update(
      filingModel(),
      ComposedIssueDraft.make({ draft: composedDraft('scribe') }),
    )
    const [saving, commands] = update(composed, SubmittedIssue.make({}))
    expect(saving.draftState._tag).toBe('SavingIssueDraft')
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([stored('001', 'One'), stored('005', 'Five')]),
    )

    const result = await runWith(
      tracker,
      Option.getOrThrow(Array.head(commands)).effect,
    )

    expect(result).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: {
        area: Option.some('Issue tracker / CLI'),
        claimantId: Option.some('claude-code/issues-one-way'),
        id: '006',
        issueType: Option.some('defect'),
        priority: 'P1',
        product: { id: 'scribe' },
        relatedIssueIds: ['502', '691'],
        status: 'InProgress',
        successCriteria: [
          {
            id: 'issue-006-criterion-1',
            isSatisfied: false,
            outcome: 'issues file names the real cause of a failed save.',
          },
        ],
        title: 'issues file hides the cause of a failed save',
        viewerURL: Option.some(
          'https://issues.pisspoursoftware.xyz/issues/006',
        ),
        workLog: [
          { id: 'work-006-filed-1791640000000', summary: expect.any(String) },
        ],
      },
    })
    if (result._tag !== 'SucceededSaveIssue') {
      return
    }
    expect(
      Array.map(result.issue.evidenceLogQueries, query => query.viewerURL),
    ).toEqual(['https://issues.pisspoursoftware.xyz/issues/006#evidence-logs'])
    expect(Array.map(result.issue.mentions, mention => mention.id)).toEqual([
      'mention-006-1',
      'mention-006-2',
    ])
    expect(
      Array.map(result.issue.mentions, mention => mention.issueId),
    ).toEqual(['006', '006'])
    expect(
      Option.map(runNow(tracker.fetchIssue('006')), found => found.title),
    ).toEqual(Option.some('issues file hides the cause of a failed save'))
    const [filed] = update(saving, result)
    expect(filed.navigation).toEqual(IssueDetail.make({ issueId: '006' }))
  })

  it('names the operation and the real cause when the save fails', async () => {
    const [composed] = update(
      filingModel(),
      ComposedIssueDraft.make({ draft: composedDraft('scribe') }),
    )
    const [saving, commands] = update(composed, SubmittedIssue.make({}))
    const working = await Effect.runPromise(makeMemoryIssueTracker([]))
    const refusing: IssueTrackerService = {
      ...working,
      file: () =>
        Effect.fail(
          new IssueTrackerError({
            cause: new InstantEntityStoreError({
              cause: new Error('Permission denied: instantToolsIssues'),
              operation: 'CreateIssue',
            }),
            operation: 'File',
          }),
        ),
    }

    const result = await runWith(
      refusing,
      Option.getOrThrow(Array.head(commands)).effect,
    )

    expect(result).toEqual({
      _tag: 'FailedSaveIssue',
      reason: 'File: CreateIssue: Permission denied: instantToolsIssues',
    })
    const [failed] = update(saving, result)
    expect(failed.draftState).toEqual({
      _tag: 'FailedIssueDraft',
      reason: 'File: CreateIssue: Permission denied: instantToolsIssues',
    })
  })

  it('takes a product by its name in any case and lists the valid ids for one it does not know', () => {
    const [byName] = update(
      filingModel(),
      ComposedIssueDraft.make({ draft: composedDraft('SCRIBE') }),
    )
    const [saving, commands] = update(byName, SubmittedIssue.make({}))
    expect(saving.draftState._tag).toBe('SavingIssueDraft')
    expect(commands[0]?.name).toBe('SaveIssue')

    const [unknown] = update(
      filingModel(),
      ComposedIssueDraft.make({ draft: composedDraft('Scribee') }),
    )
    const [refused, refusedCommands] = update(unknown, SubmittedIssue.make({}))
    expect(refusedCommands).toEqual([])
    expect(refused.draftState).toEqual({
      _tag: 'FailedIssueDraft',
      reason:
        'Choose an Application or Library: "Scribee" names none. Valid: scribe (Scribe), foldkit (Foldkit), casino (Casino).',
    })
  })

  const acaga = ApplicationProduct.make({ id: 'acaga', name: 'ACAGA' })

  const runWithCatalog = <A>(
    catalog: ProductCatalogService,
    effect: Effect.Effect<A, never, IssueTrackerResources>,
  ) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provideService(ProductCatalog, catalog),
        Effect.provide(StaticIssueTrackerResources),
      ),
    )

  it('adds a product to the catalog and reads it back', async () => {
    const [saving, commands] = update(
      filingModel(),
      SubmittedProduct.make({ product: acaga }),
    )
    expect(saving.productAddition).toEqual(
      SavingProductAddition.make({ product: acaga }),
    )
    expect(Array.map(commands, command => command.name)).toEqual([
      'SaveProduct',
    ])
    const catalog = await Effect.runPromise(
      makeMemoryProductCatalog([productEntry]),
    )

    const result = await runWithCatalog(
      catalog,
      Option.getOrThrow(Array.head(commands)).effect,
    )

    expect(result).toMatchObject({
      _tag: 'SucceededSaveProduct',
      entry: { product: acaga },
    })
    expect(
      Array.map(await Effect.runPromise(catalog.fetch), entry => entry.product),
    ).toEqual([product, acaga])
    const [saved] = update(saving, result)
    expect(saved.productAddition).toEqual(
      SavedProductAddition.make({ product: acaga }),
    )
    expect(saved.products).toMatchObject({
      _tag: 'LoadedProducts',
      products: expect.arrayContaining([
        expect.objectContaining({ product: acaga }),
      ]),
    })
  })

  it('refuses a malformed id, a blank name, and an id or name another product holds', () => {
    const additionOf = (submitted: TrackedProduct) => {
      const [refused, commands] = update(
        filingModel(),
        SubmittedProduct.make({ product: submitted }),
      )
      expect(commands).toEqual([])
      return refused.productAddition
    }

    expect(
      additionOf(ApplicationProduct.make({ id: 'ACAGA', name: 'ACAGA' })),
    ).toEqual(
      RefusedProductAddition.make({
        reason:
          '"ACAGA" is not a product id: use lowercase letters and digits joined by hyphens, such as acaga or instant-data-swift.',
      }),
    )
    expect(
      additionOf(ApplicationProduct.make({ id: 'acaga', name: ' ' })),
    ).toEqual(
      RefusedProductAddition.make({
        reason: 'A product needs a name, such as ACAGA.',
      }),
    )
    expect(
      additionOf(LibraryProduct.make({ id: 'scribe', name: 'Scribe' })),
    ).toEqual(
      RefusedProductAddition.make({
        reason:
          'Product scribe is already Scribe (Application); nothing changed.',
      }),
    )
    expect(
      additionOf(ApplicationProduct.make({ id: 'scribe-app', name: 'SCRIBE' })),
    ).toEqual(
      RefusedProductAddition.make({
        reason: 'Product scribe is already named Scribe; nothing was added.',
      }),
    )
  })

  it('changes nothing for a product the catalog holds as given, and adds nothing before the catalog loads', () => {
    const [unchanged, unchangedCommands] = update(
      filingModel(),
      SubmittedProduct.make({ product }),
    )
    const [early, earlyCommands] = update(
      modelForNavigation(FileIssue.make({})),
      SubmittedProduct.make({ product: acaga }),
    )

    expect(unchangedCommands).toEqual([])
    expect(unchanged.productAddition).toEqual(
      UnchangedProductAddition.make({ product }),
    )
    expect(earlyCommands).toEqual([])
    expect(early.productAddition).toEqual(
      FailedProductAddition.make({
        reason: 'The product catalog has not loaded; nothing was added.',
      }),
    )
  })

  it('names the real cause when the catalog refuses a product or does not read it back', async () => {
    const [saving, commands] = update(
      filingModel(),
      SubmittedProduct.make({ product: acaga }),
    )
    const save = Option.getOrThrow(Array.head(commands)).effect
    const refusing: ProductCatalogService = {
      fetch: Effect.succeed([productEntry]),
      observe: Stream.succeed([productEntry]),
      save: () =>
        Effect.fail(
          new ProductCatalogError({
            cause: new InstantEntityStoreError({
              cause: new Error('Permission denied: instantToolsProducts'),
              operation: 'SaveProduct',
            }),
            operation: 'Save',
          }),
        ),
    }
    const forgetting: ProductCatalogService = {
      ...refusing,
      save: () => Effect.void,
    }

    const refused = await runWithCatalog(refusing, save)
    const forgotten = await runWithCatalog(forgetting, save)

    expect(refused).toEqual({
      _tag: 'FailedSaveProduct',
      reason: 'Save: SaveProduct: Permission denied: instantToolsProducts',
    })
    expect(forgotten).toEqual({
      _tag: 'FailedSaveProduct',
      reason: 'Product acaga was saved but does not read back.',
    })
    const [failed] = update(saving, refused)
    expect(failed.productAddition).toEqual(
      FailedProductAddition.make({
        reason: 'Save: SaveProduct: Permission denied: instantToolsProducts',
      }),
    )
  })

  it('appends a work-log entry with its state, agent, commit, claim, and status, and reads it back', async () => {
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([stored('692', 'Bare IssueTrackerError')]),
    )
    const detail = modelForNavigation(IssueDetail.make({ issueId: '692' }))
    const [observed] = update(
      detail,
      ObservedIssue.make({
        issue: Option.some(stored('692', 'Bare IssueTrackerError')),
        issueId: '692',
      }),
    )
    const [saving, commands] = update(
      observed,
      SubmittedIssueWorkLogEntry.make({
        agentId: Option.some('claude-code/issues-one-way'),
        claimantId: Option.some('claude-code/issues-one-way'),
        commitSha: Option.some('e27b023ea'),
        issueId: '692',
        state: 'claimed',
        status: Option.some('InProgress'),
        summary: 'Claimed; red tests next.',
      }),
    )
    expect(saving.issueMutation._tag).toBe('SavingIssueMutation')

    const result = await runWith(
      tracker,
      Option.getOrThrow(Array.head(commands)).effect,
    )

    expect(result).toMatchObject({
      _tag: 'SucceededAppendIssueWorkLogEntry',
      issue: {
        claimantId: Option.some('claude-code/issues-one-way'),
        status: 'InProgress',
      },
    })
    if (result._tag !== 'SucceededAppendIssueWorkLogEntry') {
      return
    }
    expect(Array.last(result.issue.workLog)).toEqual(
      Option.some({
        agentId: Option.some('claude-code/issues-one-way'),
        commitSha: Option.some('e27b023ea'),
        durationSeconds: Option.none(),
        id: result.entryId,
        occurredAtMs: expect.any(Number),
        state: Option.some('claimed'),
        summary: 'Claimed; red tests next.',
      }),
    )
    const [saved] = update(saving, result)
    expect(saved.issueMutation).toEqual({
      _tag: 'SavedIssueMutation',
      entryId: Option.some(result.entryId),
      issueId: '692',
    })
  })

  it('reports a work-log write that did not land, with its reason', async () => {
    const working = await Effect.runPromise(makeMemoryIssueTracker([]))
    const dropping: IssueTrackerService = {
      ...working,
      update: issueId =>
        Effect.fail(
          new IssueTrackerError({
            cause: new Error(
              `Issue ${issueId}: the change did not land after 3 writes; the stored Issue still reads without it.`,
            ),
            operation: 'Update',
          }),
        ),
    }
    const [observed] = update(
      modelForNavigation(IssueDetail.make({ issueId: '692' })),
      ObservedIssue.make({
        issue: Option.some(stored('692', 'Bare IssueTrackerError')),
        issueId: '692',
      }),
    )
    const [saving, commands] = update(
      observed,
      SubmittedIssueWorkLogEntry.make({
        agentId: Option.none(),
        claimantId: Option.none(),
        commitSha: Option.none(),
        issueId: '692',
        state: 'progress',
        status: Option.none(),
        summary: 'Still going.',
      }),
    )

    const result = await runWith(
      dropping,
      Option.getOrThrow(Array.head(commands)).effect,
    )
    const [failed] = update(saving, result)

    expect(failed.issueMutation).toEqual({
      _tag: 'FailedIssueMutation',
      reason:
        'Update: Issue 692: the change did not land after 3 writes; the stored Issue still reads without it.',
    })
  })

  it('sets any stored status, not only the leftover three', async () => {
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([stored('692', 'Bare IssueTrackerError')]),
    )
    const [observed] = update(
      modelForNavigation(IssueDetail.make({ issueId: '692' })),
      ObservedIssue.make({
        issue: Option.some(stored('692', 'Bare IssueTrackerError')),
        issueId: '692',
      }),
    )
    const [, commands] = update(
      observed,
      SelectedIssueStatus.make({
        issueId: '692',
        status: 'VerificationNeeded',
      }),
    )

    const result = await runWith(
      tracker,
      Option.getOrThrow(Array.head(commands)).effect,
    )

    expect(result).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: { status: 'VerificationNeeded' },
    })
  })

  it('links related Issue numbers where the stored Issues keep them', async () => {
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([stored('692', 'Bare IssueTrackerError')]),
    )
    const [observed] = update(
      modelForNavigation(IssueDetail.make({ issueId: '692' })),
      ObservedIssue.make({
        issue: Option.some(stored('692', 'Bare IssueTrackerError')),
        issueId: '692',
      }),
    )
    const [, commands] = update(
      observed,
      LinkedCatalogIssue.make({ sourceIssueId: '692', targetIssueId: '502' }),
    )

    const result = await runWith(
      tracker,
      Option.getOrThrow(Array.head(commands)).effect,
    )

    expect(result).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: { relatedIssueIds: ['502'] },
    })
    if (result._tag !== 'SucceededSaveIssue') {
      return
    }
    const [linked] = update(
      observed,
      ObservedIssue.make({ issue: Option.some(result.issue), issueId: '692' }),
    )
    expect(
      interactionsForModel(linked).map(interaction => interaction.token),
    ).toContain('open:502')
  })

  it('stores a comment under the person who wrote it, not under another agent', async () => {
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([stored('692', 'Bare IssueTrackerError')]),
    )

    const result = await Effect.runPromise(
      CommentOnIssue({
        issueId: '692',
        summary: 'Still fails on my phone.',
      }).effect.pipe(
        Effect.provideService(IssueTracker, tracker),
        Effect.provideService(IssueIdentity, authoredBy('owner@example.com')),
      ),
    )

    expect(result._tag).toBe('SucceededSaveIssue')
    expect(
      Option.map(runNow(tracker.fetchIssue('692')), found =>
        found.workLog.map(entry => [entry.agentId, entry.summary]),
      ),
    ).toEqual(
      Option.some([
        [Option.some('owner@example.com'), 'Still fails on my phone.'],
      ]),
    )
  })

  it('names the person signed in on the site as the author, and the site when no one is', async () => {
    const signedIn = await Effect.runPromise(
      signedInAuthor({
        getAuth: () => Promise.resolve({ email: 'owner@example.com' }),
      }),
    )
    const signedOut = await Effect.runPromise(
      signedInAuthor({ getAuth: () => Promise.resolve(null) }),
    )
    const guest = await Effect.runPromise(
      signedInAuthor({ getAuth: () => Promise.resolve({ email: null }) }),
    )

    expect(signedIn).toBe('owner@example.com')
    expect(signedOut).toBe('issues.pisspoursoftware.xyz')
    expect(guest).toBe('issues.pisspoursoftware.xyz')
  })

  it('comments on an Issue the catalog read does not hold', async () => {
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([stored('692', 'Bare IssueTrackerError')]),
    )
    const outsideTheCatalog: IssueTrackerService = {
      ...tracker,
      fetch: () => Effect.succeed([]),
    }

    const result = await runWith(
      outsideTheCatalog,
      CommentOnIssue({ issueId: '692', summary: 'Written.' }).effect,
    )

    expect(result._tag).toBe('SucceededSaveIssue')
    expect(
      Option.map(runNow(tracker.fetchIssue('692')), found =>
        found.workLog.map(entry => entry.summary),
      ),
    ).toEqual(Option.some(['Written.']))
  })

  it('deletes an Issue and returns to the list', async () => {
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([stored('693', 'Throwaway')]),
    )
    const [observed] = update(
      modelForNavigation(IssueDetail.make({ issueId: '693' })),
      ObservedIssue.make({
        issue: Option.some(stored('693', 'Throwaway')),
        issueId: '693',
      }),
    )
    const [deleting, commands] = update(
      observed,
      ConfirmedIssueDeletion.make({ issueId: '693' }),
    )
    expect(deleting.issueMutation._tag).toBe('SavingIssueMutation')

    const result = await runWith(
      tracker,
      Option.getOrThrow(Array.head(commands)).effect,
    )

    expect(result).toMatchObject({
      _tag: 'SucceededDeleteIssue',
      issue: { id: '693', title: 'Throwaway' },
    })
    expect(runNow(tracker.fetchIssue('693'))).toEqual(Option.none())
    const [deleted] = update(deleting, result)
    expect(deleted.navigation).toEqual(IssueList.make({}))
    expect(deleted.issueMutation).toMatchObject({
      _tag: 'DeletedIssueMutation',
      issue: { id: '693' },
    })
  })

  it('adds an uploaded file to the Issue and reads it back', async () => {
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([stored('662', 'Not Synced')]),
    )
    const attachment = IssueAttachment.make({
      byteCount: Option.some(334_048),
      capturedAtMs: Option.some(1_792_000_000_000),
      contentType: 'image/png',
      fileName: 'not-synced.png',
      id: 'file-1',
      issueId: '662',
      kind: 'Screenshot',
      sha256: Option.some('ab'),
      source: InstantStorageAttachmentSource.make({ fileId: 'file-1' }),
    })
    const [observed] = update(
      modelForNavigation(IssueDetail.make({ issueId: '662' })),
      ObservedIssue.make({
        issue: Option.some(stored('662', 'Not Synced')),
        issueId: '662',
      }),
    )
    const [, commands] = update(
      observed,
      SubmittedIssueAttachment.make({ attachment, issueId: '662' }),
    )

    const result = await runWith(
      tracker,
      Option.getOrThrow(Array.head(commands)).effect,
    )

    expect(result).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: { attachments: [{ fileName: 'not-synced.png', id: 'file-1' }] },
    })
  })

  it('names each product the way most of its Issues do', () => {
    const foldkitApplication = ApplicationProduct.make({
      id: 'foldkit',
      name: 'FoldKit',
    })
    const foldkitLibrary = LibraryProduct.make({
      id: 'foldkit',
      name: 'Foldkit',
    })
    const [observed] = update(
      modelForNavigation(FileIssue.make({})),
      ObservedIssues.make({
        issues: [
          Issue.make({ ...issue, id: '692', product: foldkitApplication }),
          Issue.make({ ...issue, id: '600', product: foldkitLibrary }),
          Issue.make({ ...issue, id: '601', product: foldkitLibrary }),
        ],
      }),
    )
    const [cataloged] = update(
      observed,
      ObservedProducts.make({ products: [] }),
    )

    expect(
      cataloged.products._tag === 'LoadedProducts'
        ? cataloged.products.products.map(entry => entry.product)
        : [],
    ).toContainEqual(foldkitLibrary)
  })

  const withCriteria = () =>
    Issue.make({
      ...stored('692', 'Bare IssueTrackerError'),
      successCriteria: [
        {
          id: 'issue-692-criterion-1',
          isSatisfied: false,
          outcome: 'A failed save names its cause.',
          requiredEvidence: ['FocusedTest'],
        },
        {
          id: 'issue-692-criterion-2',
          isSatisfied: false,
          outcome: 'A product reads by name.',
          requiredEvidence: ['FocusedTest'],
        },
      ],
    })

  const runOnDetail = async (
    seed: ReadonlyArray<typeof Issue.Type>,
    message: Parameters<typeof update>[1],
  ) => {
    const tracker = await Effect.runPromise(makeMemoryIssueTracker(seed))
    const [first] = seed
    const [observed] = update(
      modelForNavigation(IssueDetail.make({ issueId: first?.id ?? '' })),
      ObservedIssue.make({
        issue: Option.fromUndefinedOr(first),
        issueId: first?.id ?? '',
      }),
    )
    const [saving, commands] = update(observed, message)
    const maybeCommand = Array.head(commands)
    if (Option.isNone(maybeCommand)) {
      return { model: saving, result: Option.none(), tracker }
    }
    const result = await runWith(tracker, maybeCommand.value.effect)
    const [settled] = update(saving, result)
    return { model: settled, result: Option.some(result), tracker }
  }

  it('edits the title, details, priority, type, area, and product, and reads them back', async () => {
    const [withProducts] = update(
      modelForNavigation(IssueDetail.make({ issueId: '692' })),
      ObservedProducts.make({
        products: [
          productEntry,
          ProductCatalogEntry.make({
            product: LibraryProduct.make({ id: 'foldkit', name: 'Foldkit' }),
            updatedAtMs: 1_000,
          }),
        ],
      }),
    )
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([stored('692', 'Bare IssueTrackerError')]),
    )
    const [, commands] = update(
      withProducts,
      SubmittedIssueEdit.make({
        area: Option.some('issues CLI'),
        details: Option.some('The save failed on a lookup write.'),
        issueId: '692',
        issueType: Option.some('defect'),
        priority: Option.some('P1'),
        productId: Option.some('Foldkit'),
        title: Option.some('issues file hid the cause'),
      }),
    )

    const result = await runWith(
      tracker,
      Option.getOrThrow(Array.head(commands)).effect,
    )

    expect(result).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: {
        area: Option.some('issues CLI'),
        details: 'The save failed on a lookup write.',
        issueType: Option.some('defect'),
        priority: 'P1',
        product: { id: 'foldkit', name: 'Foldkit' },
        title: 'issues file hid the cause',
      },
    })
  })

  it('adds a success criterion with the next criterion id', async () => {
    const { result } = await runOnDetail(
      [withCriteria()],
      SubmittedIssueSuccessCriterion.make({
        issueId: '692',
        outcome: 'issues list counts every stored issue.',
        requiredEvidence: ['FocusedTest', 'Log'],
      }),
    )

    expect(Option.getOrThrow(result)).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: {
        successCriteria: [
          { id: 'issue-692-criterion-1' },
          { id: 'issue-692-criterion-2' },
          {
            id: 'issue-692-criterion-3',
            isSatisfied: false,
            outcome: 'issues list counts every stored issue.',
            requiredEvidence: ['FocusedTest', 'Log'],
          },
        ],
      },
    })
  })

  it('marks criteria satisfied and refuses one the issue does not have', async () => {
    const { result } = await runOnDetail(
      [withCriteria()],
      SubmittedSuccessCriteriaMarks.make({
        criterionIds: ['issue-692-criterion-2'],
        isSatisfied: true,
        issueId: '692',
      }),
    )
    expect(Option.getOrThrow(result)).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: {
        successCriteria: [{ isSatisfied: false }, { isSatisfied: true }],
      },
    })

    const { model } = await runOnDetail(
      [withCriteria()],
      SubmittedSuccessCriteriaMarks.make({
        criterionIds: ['issue-692-criterion-9'],
        isSatisfied: true,
        issueId: '692',
      }),
    )
    expect(model.issueMutation).toMatchObject({
      _tag: 'FailedIssueMutation',
      reason: expect.stringContaining(
        'Issue 692 has no criterion issue-692-criterion-9',
      ),
    })
  })

  it('adds a Mention with the next mention id', async () => {
    const { result } = await runOnDetail(
      [stored('692', 'Bare IssueTrackerError')],
      SubmittedIssueMention.make({
        issueId: '692',
        mention: DraftMention.make({
          capturedAtMs: Option.some(1_792_000_000_000),
          directQuote: Option.some(
            'Fix the error as well in the issues thing.',
          ),
          note: Option.none(),
          related: [],
          reporter: Option.none(),
          source: ConversationReference.make({
            conversation: { note: 'Typed in the Claude chat.' },
          }),
        }),
      }),
    )

    expect(Option.getOrThrow(result)).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: {
        mentions: [
          {
            directQuote: Option.some(
              'Fix the error as well in the issues thing.',
            ),
            id: 'mention-692-1',
            issueId: '692',
          },
        ],
      },
    })
  })

  it('numbers an added criterion after the ones an older writer named differently', async () => {
    const older = Issue.make({
      ...withCriteria(),
      successCriteria: [
        {
          id: 'issue-692-crit-1',
          isSatisfied: true,
          outcome: 'First.',
          requiredEvidence: ['FocusedTest'],
        },
        {
          id: 'issue-692-crit-2',
          isSatisfied: false,
          outcome: 'Second.',
          requiredEvidence: ['FocusedTest'],
        },
      ],
    })
    const { result } = await runOnDetail(
      [older],
      SubmittedIssueSuccessCriterion.make({
        issueId: '692',
        outcome: 'Third.',
        requiredEvidence: ['Log'],
      }),
    )

    expect(Option.getOrThrow(result)).toMatchObject({
      issue: {
        successCriteria: [{}, {}, { id: 'issue-692-criterion-3' }],
      },
    })
  })

  const withSubtasks = () =>
    Issue.make({
      ...stored('835', 'Track work in progress'),
      subtasks: [
        IssueSubtask.make({
          id: 'issue-835-subtask-1',
          state: UncheckedSubtask.make({}),
          title: 'Red tests',
        }),
        IssueSubtask.make({
          id: 'issue-835-subtask-2',
          state: CheckedSubtask.make({ checkedAtMs: 5 }),
          title: 'Green',
        }),
      ],
    })

  const noEdit = WorkInProgressEdit.make({
    activity: Option.none(),
    agentId: Option.none(),
    branch: Option.none(),
    commitSha: Option.none(),
    landingState: Option.none(),
    lastStep: Option.none(),
    repository: Option.none(),
    targetBuild: Option.none(),
    worktree: Option.none(),
  })

  it('adds subtasks under the next subtask ids, each title once', async () => {
    const { result } = await runOnDetail(
      [withSubtasks()],
      SubmittedIssueSubtasks.make({
        issueId: '835',
        titles: ['Install the CLI', 'Green', 'Install the CLI'],
      }),
    )

    expect(Option.getOrThrow(result)).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: {
        subtasks: [
          { id: 'issue-835-subtask-1', title: 'Red tests' },
          { id: 'issue-835-subtask-2', title: 'Green' },
          {
            id: 'issue-835-subtask-3',
            state: { _tag: 'Unchecked' },
            title: 'Install the CLI',
          },
        ],
      },
    })
  })

  it('checks and unchecks subtasks, keeps when one was first checked, and refuses one the Issue does not have', async () => {
    const { result: checked } = await runOnDetail(
      [withSubtasks()],
      SubmittedSubtaskMarks.make({
        issueId: '835',
        mark: 'Checked',
        subtaskIds: ['issue-835-subtask-1', 'issue-835-subtask-2'],
      }),
    )
    expect(Option.getOrThrow(checked)).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: {
        subtasks: [
          { state: { _tag: 'Checked', checkedAtMs: expect.any(Number) } },
          { state: { _tag: 'Checked', checkedAtMs: 5 } },
        ],
      },
    })

    const { result: unchecked } = await runOnDetail(
      [withSubtasks()],
      SubmittedSubtaskMarks.make({
        issueId: '835',
        mark: 'Unchecked',
        subtaskIds: ['issue-835-subtask-2'],
      }),
    )
    expect(Option.getOrThrow(unchecked)).toMatchObject({
      issue: {
        subtasks: [
          { state: { _tag: 'Unchecked' } },
          { state: { _tag: 'Unchecked' } },
        ],
      },
    })

    const { model } = await runOnDetail(
      [withSubtasks()],
      SubmittedSubtaskMarks.make({
        issueId: '835',
        mark: 'Checked',
        subtaskIds: ['issue-835-subtask-9'],
      }),
    )
    expect(model.issueMutation).toMatchObject({
      _tag: 'FailedIssueMutation',
      reason: expect.stringContaining(
        'Issue 835 has no subtask issue-835-subtask-9. Its subtasks: 1 issue-835-subtask-1 "Red tests", 2 issue-835-subtask-2 "Green"',
      ),
    })
  })

  it('records work in progress, starting at Exploring and active, and keeps what a later change leaves out', async () => {
    const { result: first } = await runOnDetail(
      [stored('835', 'Track work in progress')],
      SubmittedIssueWorkInProgress.make({
        edit: WorkInProgressEdit.make({
          ...noEdit,
          agentId: Option.some('claude-code/wip-835'),
          branch: Option.some('agent/claude/issues-wip-835'),
          lastStep: Option.some('Red tests written'),
          repository: Option.some('foldkit'),
          worktree: Option.some(
            '/Users/laptop/Sync/worktrees/foldkit-issues-wip-835',
          ),
        }),
        issueId: '835',
      }),
    )
    const recorded = Option.getOrThrow(first)
    expect(recorded).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: {
        workInProgress: Option.some({
          activity: { _tag: 'Active' },
          agentId: Option.some('claude-code/wip-835'),
          branch: Option.some('agent/claude/issues-wip-835'),
          commitSha: Option.none(),
          landingState: 'Exploring',
          lastStep: Option.some('Red tests written'),
          repository: Option.some('foldkit'),
          targetBuild: Option.none(),
          updatedAtMs: expect.any(Number),
          worktree: Option.some(
            '/Users/laptop/Sync/worktrees/foldkit-issues-wip-835',
          ),
        }),
      },
    })
    if (recorded._tag !== 'SucceededSaveIssue') {
      return
    }

    const { result: second } = await runOnDetail(
      [recorded.issue],
      SubmittedIssueWorkInProgress.make({
        edit: WorkInProgressEdit.make({
          ...noEdit,
          activity: Option.some(
            StuckWork.make({ reason: 'Waits on a review' }),
          ),
          agentId: Option.some('claude-code/other'),
          commitSha: Option.some('5e1f00d'),
          landingState: Option.some('Green'),
          targetBuild: Option.some('106'),
        }),
        issueId: '835',
      }),
    )
    expect(Option.getOrThrow(second)).toMatchObject({
      issue: {
        workInProgress: Option.some({
          activity: { _tag: 'Stuck', reason: 'Waits on a review' },
          agentId: Option.some('claude-code/other'),
          branch: Option.some('agent/claude/issues-wip-835'),
          commitSha: Option.some('5e1f00d'),
          landingState: 'Green',
          lastStep: Option.some('Red tests written'),
          repository: Option.some('foldkit'),
          targetBuild: Option.some('106'),
        }),
      },
    })

    const { result: active } = await runOnDetail(
      [recorded.issue],
      SubmittedIssueWorkInProgress.make({
        edit: WorkInProgressEdit.make({
          ...noEdit,
          activity: Option.some(ActiveWork.make({})),
        }),
        issueId: '835',
      }),
    )
    expect(Option.getOrThrow(active)).toMatchObject({
      issue: {
        workInProgress: Option.some({
          activity: { _tag: 'Active' },
          landingState: 'Exploring',
        }),
      },
    })
  })

  it('clears the work in progress of an Issue', async () => {
    const { result: recorded } = await runOnDetail(
      [stored('835', 'Track work in progress')],
      SubmittedIssueWorkInProgress.make({
        edit: WorkInProgressEdit.make({
          ...noEdit,
          landingState: Option.some('Red'),
        }),
        issueId: '835',
      }),
    )
    const working = Option.getOrThrow(recorded)
    if (working._tag !== 'SucceededSaveIssue') {
      throw new Error('Expected the work in progress to be recorded')
    }

    const { result } = await runOnDetail(
      [working.issue],
      ClearedIssueWorkInProgress.make({ issueId: '835' }),
    )

    expect(Option.getOrThrow(result)).toMatchObject({
      _tag: 'SucceededSaveIssue',
      issue: { workInProgress: Option.none() },
    })
  })
})

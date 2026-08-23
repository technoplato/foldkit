import { Array, Effect, Option, Stream } from 'effect'
import { buttonsOf, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueTracker,
  IssueTrackerError,
  type IssueTrackerService,
  LibraryProduct,
  ProductCatalogEntry,
  RecordingSegment,
  TriageCandidate,
} from '@foldkit/instant-tools/issues'
import { IssueLogEvidence } from '@foldkit/instant-tools/logging'

import { modelForNavigation } from './init.js'
import { OneProduct, leftoverStatusOf, newestWorkLog } from './leftover.js'
import {
  AppendedIssueWorkLog,
  ClickedFileIssue,
  ClickedLeftoverStatus,
  ClickedOpenTriage,
  ClickedPromoteTriageCandidate,
  LinkedCatalogIssue,
  ObservedIssue,
  ObservedIssueLogs,
  ObservedIssues,
  ObservedProducts,
  ObservedTriageCandidates,
  SelectedIssue,
  SelectedProductFilter,
  SubmittedIssue,
  SubmittedIssueComment,
  UpdatedIssueTitle,
} from './message.js'
import {
  FileIssue,
  IssueDetail,
  IssueList,
  LoadingIssue,
  LoadingIssueLogs,
  TriageInbox,
} from './model.js'
import { destinationForModel, interactionsForModel } from './presentation.js'
import { issuesScreen } from './program.js'
import { StaticIssueTrackerResources } from './resources.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { subscriptions } from './subscription.js'
import { SaveIssueWorkLog, SetLeftoverStatus, update } from './update.js'

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

describe('Issue Tracker Program', () => {
  it.each([
    IssueList.make({}),
    IssueDetail.make({ issueId: 'issue-021' }),
    FileIssue.make({}),
    TriageInbox.make({}),
  ])('round trips each navigation path', navigation => {
    const path = navigationToPath(navigation)
    expect(pathToNavigation(path)).toEqual(navigation)
    expect(navigationToPath(pathToNavigation(path))).toBe(path)
  })

  it('models list, detail, and independent detail observation as state', () => {
    const initial = modelForNavigation(IssueList.make({}))
    const [selected] = update(
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

  it('delivers collection and detail decode failures to visible state', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const failingIssueTracker: IssueTrackerService = {
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
          capturedAtMs: 2_000,
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

  it('SaveIssueWorkLog keeps status and records issues-245-grok', async () => {
    const saved: Array<typeof Issue.Type> = []
    const tracker: IssueTrackerService = {
      fetch: () => Effect.succeed([]),
      observe: () => Stream.empty,
      observeIssue: () => Stream.empty,
      save: next =>
        Effect.sync(() => {
          saved.push(next)
        }),
    }
    const result = await Effect.runPromise(
      SaveIssueWorkLog({
        issue,
        summary: 'Keep leftover Open.',
      }).effect.pipe(Effect.provideService(IssueTracker, tracker)),
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
      expect(maybeEntry.value.agentId).toEqual(Option.some('issues-245-grok'))
    }
    expect(saved).toHaveLength(1)
  })

  it('refuses Closed leftover status on 240-243 without saving', async () => {
    const unclosable = Issue.make({ ...issue, id: '242' })
    const saved: Array<typeof Issue.Type> = []
    const tracker: IssueTrackerService = {
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
})

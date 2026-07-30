import { Effect, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueTracker,
  IssueTrackerError,
  type IssueTrackerService,
  ProductCatalogEntry,
  RecordingSegment,
  TriageCandidate,
} from '@foldkit/instant-tools/issues'
import { IssueLogEvidence } from '@foldkit/instant-tools/logging'

import { modelForNavigation } from './init.js'
import {
  ClickedFileIssue,
  ClickedOpenTriage,
  ClickedPromoteTriageCandidate,
  ObservedIssue,
  ObservedIssueLogs,
  ObservedProducts,
  ObservedTriageCandidates,
  SelectedIssue,
  SubmittedIssue,
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
import { StaticIssueTrackerResources } from './resources.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { subscriptions } from './subscription.js'
import { update } from './update.js'

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
})

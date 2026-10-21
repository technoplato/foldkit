import { Array, Effect, Option } from 'effect'
import { buttonsOf, inputsOf, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { InstantEntityStoreError } from '@foldkit/instant-tools/instant'
import {
  AbandonedWork,
  ActiveWork,
  ApplicationProduct,
  CheckedSubtask,
  ConversationReference,
  Issue,
  IssueAttachment,
  type IssueLandingState,
  IssueMention,
  IssueSubtask,
  IssueTracker,
  IssueTrackerError,
  type IssueTrackerService,
  type IssueWorkActivity,
  IssueWorkInProgress,
  LibraryProduct,
  ProductCatalogEntry,
  RecordingMention,
  RecordingReference,
  StuckWork,
  UncheckedSubtask,
  UriAttachmentSource,
  UriReference,
} from '@foldkit/instant-tools/issues'
import { IssueLogEvidence } from '@foldkit/instant-tools/logging'

import { modelForNavigation } from './init.js'
import {
  ClickedFileIssue,
  type Message,
  ObservedIssue,
  ObservedIssueLogs,
  ObservedIssues,
  ObservedProducts,
  SelectedIssuePriority,
  SelectedIssueProduct,
  SubmittedIssue,
  UpdatedIssueDetails,
  UpdatedIssueTitle,
} from './message.js'
import {
  Backlog,
  FileIssue,
  IssueDetail,
  IssueList,
  type Model,
} from './model.js'
import { messageForScreenToken } from './presentation.js'
import { type IssueTrackerResources, issuesScreen } from './program.js'
import {
  StaticIssueTrackerResources,
  makeMemoryIssueTracker,
} from './resources.js'
import { update } from './update.js'

const scribe = ProductCatalogEntry.make({
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  updatedAtMs: 1_000,
})
const foldkit = ProductCatalogEntry.make({
  product: LibraryProduct.make({ id: 'foldkit', name: 'Foldkit' }),
  updatedAtMs: 1_000,
})

const filingModel = (): Model =>
  update(
    modelForNavigation(FileIssue.make({})),
    ObservedProducts.make({ products: [scribe, foldkit] }),
  )[0]

const applyAll = (model: Model, messages: ReadonlyArray<Message>): Model =>
  Array.reduce(
    messages,
    model,
    (current, message) => update(current, message)[0],
  )

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const primaryTokensOf = (model: Model): ReadonlyArray<string> =>
  Array.flatMap(buttonsOf(issuesScreen(model)), button =>
    button.variant === 'Primary' && button.token !== undefined
      ? [button.token]
      : [],
  )

const stored = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_000,
  details: 'The transcript shifted sideways.',
  id: '021',
  issueType: Option.none(),
  mentions: [],
  priority: 'P1',
  product: scribe.product,
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

const opened = (issue: Issue): Model =>
  update(
    modelForNavigation(IssueDetail.make({ issueId: issue.id })),
    ObservedIssue.make({ issue: Option.some(issue), issueId: issue.id }),
  )[0]

const runWith = <A>(
  tracker: IssueTrackerService,
  effect: Effect.Effect<A, never, IssueTrackerResources>,
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(IssueTracker, tracker),
      Effect.provide(StaticIssueTrackerResources),
    ),
  )

describe('Issue Tracker screen: the File form', () => {
  it('gives a person fields for the title and details and choices for the product and priority', () => {
    const screen = issuesScreen(filingModel())

    expect(Array.map(inputsOf(screen), input => input.token ?? '')).toEqual([
      'title:',
      'details:',
    ])
    expect(Array.map(buttonsOf(screen), button => button.token ?? '')).toEqual(
      expect.arrayContaining([
        'product:scribe',
        'product:foldkit',
        'priority:P0',
        'priority:P1',
        'priority:P2',
        'priority:P3',
        'priority:P4',
        'submit',
      ]),
    )
    expect(
      Array.filter(buttonsOf(screen), button => button.token === 'submit'),
    ).toHaveLength(1)
  })

  it('reads what the fields send as the draft Messages', () => {
    const filing = filingModel()

    expect(messageForScreenToken(filing, 'title:Audio stops: twice')).toEqual(
      Option.some(UpdatedIssueTitle.make({ value: 'Audio stops: twice' })),
    )
    expect(
      messageForScreenToken(filing, 'details:It stops after 30 s.'),
    ).toEqual(
      Option.some(UpdatedIssueDetails.make({ value: 'It stops after 30 s.' })),
    )
    expect(messageForScreenToken(filing, 'product:foldkit')).toEqual(
      Option.some(SelectedIssueProduct.make({ productId: 'foldkit' })),
    )
    expect(messageForScreenToken(filing, 'priority:P1')).toEqual(
      Option.some(SelectedIssuePriority.make({ priority: 'P1' })),
    )
    expect(messageForScreenToken(filing, 'priority:P9')).toEqual(Option.none())
  })

  it('shows what was typed and marks the chosen product and priority', () => {
    const filled = applyAll(filingModel(), [
      UpdatedIssueTitle.make({ value: 'Audio stops' }),
      UpdatedIssueDetails.make({ value: 'It stops after 30 s.' }),
      SelectedIssueProduct.make({ productId: 'Foldkit' }),
      SelectedIssuePriority.make({ priority: 'P1' }),
    ])

    expect(
      Array.map(inputsOf(issuesScreen(filled)), input => input.value),
    ).toEqual(['Audio stops', 'It stops after 30 s.'])
    expect(primaryTokensOf(filled)).toEqual(
      expect.arrayContaining(['product:foldkit', 'priority:P1']),
    )
    expect(primaryTokensOf(filled)).not.toContain('product:scribe')
    expect(primaryTokensOf(filled)).not.toContain('priority:P2')
  })

  it('says why an Issue was not filed, in words a person reads', async () => {
    const [untitled] = update(filingModel(), SubmittedIssue.make({}))
    expect(contentsOf(untitled)).toContain('Not filed: A title is required.')

    const titled = applyAll(filingModel(), [
      UpdatedIssueTitle.make({ value: 'Audio stops' }),
    ])
    const [saving, commands] = update(titled, SubmittedIssue.make({}))
    expect(contentsOf(saving)).toContain('Filing…')
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
    const [failed] = update(saving, result)

    expect(contentsOf(failed)).toContain(
      'Not filed: File: CreateIssue: Permission denied: instantToolsIssues',
    )
    expect(contentsOf(failed)).not.toContain('State: FailedIssueDraft')
  })

  it('starts the next Issue empty once one is filed', async () => {
    const filled = applyAll(filingModel(), [
      UpdatedIssueTitle.make({ value: 'Audio stops' }),
      UpdatedIssueDetails.make({ value: 'It stops after 30 s.' }),
      SelectedIssueProduct.make({ productId: 'foldkit' }),
    ])
    const [saving, commands] = update(filled, SubmittedIssue.make({}))
    const tracker = await Effect.runPromise(makeMemoryIssueTracker([]))

    const result = await runWith(
      tracker,
      Option.getOrThrow(Array.head(commands)).effect,
    )
    const [filed] = update(saving, result)
    const [next] = update(filed, ClickedFileIssue.make({}))

    expect(filed.navigation._tag).toBe('IssueDetail')
    expect(
      Array.map(inputsOf(issuesScreen(next)), input => input.value),
    ).toEqual(['', ''])
    expect(primaryTokensOf(next)).toContain('product:foldkit')
  })
})

describe('Issue Tracker screen: an Issue as it is stored', () => {
  it('shows each Issue with its stored status, in the list and on its page', () => {
    const verifying = Issue.make({
      ...stored,
      id: '692',
      status: 'VerificationNeeded',
    })
    const [listed] = update(
      modelForNavigation(IssueList.make({})),
      ObservedIssues.make({ issues: [verifying] }),
    )

    expect(
      Array.map(buttonsOf(issuesScreen(listed)), button => button.label),
    ).toContain(
      '692  P1  VerificationNeeded  Keep transcript aligned  [Scribe]',
    )
    expect(contentsOf(opened(verifying))).toContain(
      '692  P1  VerificationNeeded',
    )
    expect(
      Array.filter(primaryTokensOf(opened(verifying)), token =>
        token.startsWith('status:'),
      ),
    ).toEqual([])
    expect(
      Array.filter(
        primaryTokensOf(opened(Issue.make({ ...stored, status: 'Blocked' }))),
        token => token.startsWith('status:'),
      ),
    ).toEqual(['status:Blocked'])
  })

  it('shows on the page of an Issue who said what, where it came from, and its links', () => {
    const wordsLink =
      'https://words.pisspoursoftware.xyz/recording/b24165ca-0c53-449c-b690-55344173b844/section/d6a6b86b-477c-4349-bcea-425fb10638a3?t=1961.74'
    const quoted = Issue.make({
      ...stored,
      area: Option.some('Issue tracker web'),
      attachments: [
        IssueAttachment.make({
          byteCount: Option.none(),
          capturedAtMs: Option.none(),
          contentType: 'image/png',
          fileName: 'file-form.png',
          id: 'attachment-695-1',
          issueId: '695',
          kind: 'Screenshot',
          sha256: Option.none(),
          source: UriAttachmentSource.make({
            value: 'https://issues.pisspoursoftware.xyz/files/file-form.png',
          }),
        }),
      ],
      claimantId: Option.some('claude-code/claude-opus-5.5/issues-site'),
      id: '695',
      issueType: Option.some('defect'),
      mentions: [
        IssueMention.make({
          capturedAtMs: Option.some(1_792_028_655_000),
          directQuote: Option.some('Fix all the issues stuff with the site'),
          id: 'mention-695-1',
          issueId: '695',
          related: [UriReference.make({ value: 'javascript:alert(1)' })],
          reporter: Option.none(),
          source: ConversationReference.make({
            conversation: {
              harness: 'claude-code',
              messageId: 'b7d408cb',
              note: 'Typed in the Claude chat, Claude Code session f1283b96.',
              sessionId: 'f1283b96',
            },
          }),
        }),
        IssueMention.make({
          capturedAtMs: Option.some(1_791_197_694_898),
          directQuote: Option.some(
            "Well, now it's going to be issues.pissport software. XYZ.",
          ),
          id: 'mention-695-2',
          issueId: '695',
          related: [UriReference.make({ value: wordsLink })],
          reporter: Option.none(),
          source: RecordingReference.make({
            recording: RecordingMention.make({
              endMilliseconds: Option.some(1_964_800),
              recordingId: 'b24165ca-0c53-449c-b690-55344173b844',
              screenshotIds: [],
              startMilliseconds: 1_961_740,
            }),
          }),
        }),
      ],
      reportedDate: Option.some('2026-10-14'),
    })
    const screen = issuesScreen(opened(quoted))

    expect(contentsOf(opened(quoted))).toEqual(
      expect.arrayContaining([
        'Type: defect',
        'Area: Issue tracker web',
        'Claimed by: claude-code/claude-opus-5.5/issues-site',
        'Reported: 2026-10-14',
        'Mentions',
        '2026-10-15T01:44:15.000Z  Fix all the issues stuff with the site',
        'from Typed in the Claude chat, Claude Code session f1283b96.',
        "2026-10-05T10:54:54.898Z  Well, now it's going to be issues.pissport software. XYZ.",
        'from recording b24165ca-0c53-449c-b690-55344173b844 1961.74 s-1964.8 s',
        wordsLink,
        'Attachments',
        'file-form.png (Screenshot)',
      ]),
    )
    const links = Array.flatMap(textsOf(screen), text =>
      text.href === undefined ? [] : [text.href],
    )
    expect(links).toContain(wordsLink)
    expect(links).toContain(
      'https://issues.pisspoursoftware.xyz/files/file-form.png',
    )
    expect(links).not.toContain('javascript:alert(1)')
  })

  it('lists above the Mentions every recording and line that mentioned the Issue, each range linked to its words', () => {
    const wordsLink =
      'https://words.pisspoursoftware.xyz/recording/77314e54-340e-446d-a0c4-94c1117f94eb/section/e98a8032-ea7e-4d0e-bcd9-a7463612ed4f?t=14266.38'
    const mentioned = Issue.make({
      ...stored,
      id: '721',
      mentions: [
        IssueMention.make({
          capturedAtMs: Option.some(1_792_257_466_000),
          directQuote: Option.some(
            'Recording 243 (77314e54-340e-446d-a0c4-94c1117f94eb) #2273: "Okay, yeah, definitely get the topics out."',
          ),
          id: 'mention-721-4',
          issueId: '721',
          related: [UriReference.make({ value: wordsLink })],
          reporter: Option.none(),
          source: RecordingReference.make({
            recording: RecordingMention.make({
              endMilliseconds: Option.none(),
              recordingId: '77314e54-340e-446d-a0c4-94c1117f94eb',
              screenshotIds: [],
              startMilliseconds: 14_266_380,
            }),
          }),
        }),
      ],
    })
    const contents = contentsOf(opened(mentioned))

    expect(contents).toEqual(
      expect.arrayContaining([
        'Mentioned in',
        'Recording 243  2026-10-17',
        '#2273  "Okay, yeah, definitely get the topics out."',
      ]),
    )
    expect(contents.indexOf('Mentioned in')).toBeLessThan(
      contents.indexOf('Mentions'),
    )
    const rangeLink = textsOf(issuesScreen(opened(mentioned))).find(text =>
      text.content.startsWith('#2273'),
    )
    expect(rangeLink?.href).toBe(wordsLink)
  })
})

describe('Issue Tracker screen: the logs tagged with an Issue', () => {
  it('shows the logs tagged with an Issue on its page', () => {
    const [tagged] = update(
      opened(stored),
      ObservedIssueLogs.make({
        issueId: stored.id,
        logs: [
          IssueLogEvidence.make({
            category: 'transcript',
            contributingPaths: [],
            issueID: stored.id,
            level: 'Warning',
            logID: 'log-001',
            logNamespace: 'instantToolsLogs',
            message: 'Transcript content exceeded its available width.',
            name: 'transcript.wrapping.failed',
            timestampMs: 1_753_825_167_000,
            viewerURL: 'https://issues.pisspoursoftware.xyz/issues/021',
          }),
        ],
      }),
    )
    const [untagged] = update(
      opened(stored),
      ObservedIssueLogs.make({ issueId: stored.id, logs: [] }),
    )

    expect(contentsOf(tagged)).toEqual(
      expect.arrayContaining([
        'Tagged logs',
        '2025-07-29T21:39:27.000Z  Warning  transcript.wrapping.failed  Transcript content exceeded its available width.',
      ]),
    )
    expect(contentsOf(untagged)).toContain(
      'No logs have been tagged with this Issue yet.',
    )
  })
})

const workingAt = (
  id: string,
  landingState: IssueLandingState,
  activity: IssueWorkActivity = ActiveWork.make({}),
): Issue =>
  Issue.make({
    ...stored,
    id,
    status: 'InProgress',
    workInProgress: Option.some(
      IssueWorkInProgress.make({
        activity,
        agentId: Option.some('claude-code/wip-835'),
        branch: Option.some(`agent/claude/issue-${id}`),
        commitSha: Option.some('5e1f00d'),
        landingState,
        lastStep: Option.some('Green: 37 focused tests pass'),
        repository: Option.some('realtime-voice'),
        targetBuild: Option.some('106'),
        updatedAtMs: 1_792_260_000_000,
        worktree: Option.some(`/Users/laptop/Sync/worktrees/scribe-${id}`),
      }),
    ),
  })

const openTokensOf = (model: Model): ReadonlyArray<string> =>
  Array.flatMap(buttonsOf(issuesScreen(model)), button =>
    button.token !== undefined && button.token.startsWith('open:')
      ? [button.label]
      : [],
  )

describe('Issue Tracker screen: work in progress', () => {
  it('shows on the page of an Issue where its work is and its subtasks', () => {
    const working = Issue.make({
      ...workingAt(
        '804',
        'Green',
        StuckWork.make({ reason: 'Waits on a review' }),
      ),
      subtasks: [
        IssueSubtask.make({
          id: 'issue-804-subtask-1',
          state: CheckedSubtask.make({ checkedAtMs: 1_792_250_000_000 }),
          title: 'Red: the window census',
        }),
        IssueSubtask.make({
          id: 'issue-804-subtask-2',
          state: UncheckedSubtask.make({}),
          title: 'Merge for build 106',
        }),
      ],
    })

    expect(contentsOf(opened(working))).toEqual(
      expect.arrayContaining([
        'Work in progress',
        'State: Green for build 106',
        'Stuck: Waits on a review',
        'Branch: agent/claude/issue-804 in realtime-voice',
        'Worktree: /Users/laptop/Sync/worktrees/scribe-804',
        'Commit: 5e1f00d',
        'Last step: Green: 37 focused tests pass',
        'Recorded 2026-10-17T18:00:00.000Z by claude-code/wip-835',
        'Subtasks: 1 of 2 done',
        'done  Red: the window census',
        'todo  Merge for build 106',
      ]),
    )
    expect(contentsOf(opened(stored))).not.toContain('Work in progress')
  })

  it('names where the work is beside each Issue in the list, and lists only the work close to landing when asked', () => {
    const [listed] = update(
      modelForNavigation(IssueList.make({})),
      ObservedIssues.make({
        issues: [
          workingAt('804', 'Green'),
          workingAt(
            '805',
            'Pushed',
            StuckWork.make({ reason: 'Waits on Michael' }),
          ),
          workingAt('806', 'Red'),
          workingAt(
            '807',
            'Green',
            AbandonedWork.make({ reason: 'Replaced by #804' }),
          ),
          workingAt('808', 'Merged'),
          stored,
        ],
      }),
    )

    expect(openTokensOf(listed)).toEqual([
      '804  P1  InProgress  Keep transcript aligned  [Scribe]  Green for build 106',
      '805  P1  InProgress  Keep transcript aligned  [Scribe]  Pushed for build 106, stuck',
      '806  P1  InProgress  Keep transcript aligned  [Scribe]  Red for build 106',
      '807  P1  InProgress  Keep transcript aligned  [Scribe]  Green for build 106, abandoned',
      '808  P1  InProgress  Keep transcript aligned  [Scribe]  Merged for build 106',
      '021  P1  Open  Keep transcript aligned  [Scribe]',
    ])

    const [landing] = update(
      listed,
      Option.getOrThrow(messageForScreenToken(listed, 'landing:close')),
    )
    expect(openTokensOf(landing)).toEqual([
      '804  P1  InProgress  Keep transcript aligned  [Scribe]  Green for build 106',
      '805  P1  InProgress  Keep transcript aligned  [Scribe]  Pushed for build 106, stuck',
    ])
    expect(primaryTokensOf(landing)).toContain('landing:close')

    const [all] = update(
      landing,
      Option.getOrThrow(messageForScreenToken(landing, 'landing:all')),
    )
    expect(openTokensOf(all)).toHaveLength(6)
    expect(primaryTokensOf(all)).toContain('landing:all')
  })
})

const queuedFor = (
  id: string,
  priority: Issue['priority'],
  build: string,
  landingState: IssueLandingState,
  createdAtMs: number,
): Issue =>
  Issue.make({
    ...workingAt(id, landingState),
    createdAtMs,
    priority,
    workInProgress: Option.map(workingAt(id, landingState).workInProgress, work =>
      IssueWorkInProgress.make({ ...work, targetBuild: Option.some(build) }),
    ),
  })

describe('Issue Tracker screen: backlog', () => {
  const backlogIssues = [
    queuedFor('901', 'P1', '110', 'Shipped', 1_000),
    queuedFor('902', 'P2', '111', 'Green', 2_000),
    queuedFor('903', 'P0', '111', 'Red', 3_000),
    queuedFor('904', 'P1', '112', 'Exploring', 4_000),
    Issue.make({ ...stored, id: '905', priority: 'P0', createdAtMs: 5_000 }),
    Issue.make({ ...stored, id: '906', priority: 'P0', createdAtMs: 500 }),
    Issue.make({ ...stored, id: '907', priority: 'P3', createdAtMs: 100 }),
    Issue.make({ ...stored, id: '908', priority: 'P0', status: 'Fixed' }),
  ]

  it('opens from the list and leads with the next build, then each priority oldest first', () => {
    const [listed] = update(
      modelForNavigation(IssueList.make({})),
      ObservedIssues.make({ issues: backlogIssues }),
    )
    const [backlog] = update(
      listed,
      Option.getOrThrow(messageForScreenToken(listed, 'backlog')),
    )

    expect(backlog.navigation).toEqual(Backlog.make({}))
    expect(contentsOf(backlog)).toEqual(
      expect.arrayContaining([
        'Backlog',
        'Build 111, the next build: 2 Issues',
        'Build 112: 1 Issue',
        'P0: 2 Issues',
        'P1: 1 Issue',
        'P3: 1 Issue',
      ]),
    )
    expect(openTokensOf(backlog)).toEqual([
      '903  P0  InProgress  Keep transcript aligned  [Scribe]  Red for build 111',
      '902  P2  InProgress  Keep transcript aligned  [Scribe]  Green for build 111',
      '904  P1  InProgress  Keep transcript aligned  [Scribe]  Exploring for build 112',
      '906  P0  Open  Keep transcript aligned  [Scribe]',
      '905  P0  Open  Keep transcript aligned  [Scribe]',
      '901  P1  InProgress  Keep transcript aligned  [Scribe]  Shipped for build 110',
      '907  P3  Open  Keep transcript aligned  [Scribe]',
    ])
    expect(
      Option.isSome(messageForScreenToken(backlog, 'open:906')),
    ).toBe(true)
  })

  it('keeps the product filter on the backlog', () => {
    const foldkitIssue = Issue.make({
      ...stored,
      id: '909',
      priority: 'P0',
      product: foldkit.product,
    })
    const backlog = applyAll(modelForNavigation(Backlog.make({})), [
      ObservedIssues.make({ issues: [...backlogIssues, foldkitIssue] }),
    ])
    const [onlyFoldkit] = update(
      backlog,
      Option.getOrThrow(messageForScreenToken(backlog, 'product:foldkit')),
    )

    expect(openTokensOf(onlyFoldkit)).toEqual([
      '909  P0  Open  Keep transcript aligned  [Foldkit]',
    ])
  })
})

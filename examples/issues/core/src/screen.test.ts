import { Array, Effect, Match as M, Option } from 'effect'
import {
  type ListItem,
  type UiNode,
  buttonsOf,
  inputsOf,
  textsOf,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { InstantEntityStoreError } from '@foldkit/instant-tools/instant'
import {
  AbandonedWork,
  ActiveWork,
  ApplicationProduct,
  CheckedSubtask,
  ConversationReference,
  InstantStorageAttachmentSource,
  Issue,
  IssueAgentPresence,
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
  RunningAgent,
  StaleAgent,
  StuckWork,
  UncheckedSubtask,
  UriAttachmentSource,
  UriReference,
} from '@foldkit/instant-tools/issues'
import { IssueLogEvidence } from '@foldkit/instant-tools/logging'

import { modelForNavigation } from './init.js'
import {
  ClickedFileIssue,
  FailedObserveIssueFiles,
  type Message,
  ObservedIssue,
  ObservedIssueFiles,
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

const pageRowsOf = (node: UiNode): ReadonlyArray<ListItem> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ListItem>>(),
    M.tagsExhaustive({
      List: list => list.items,
      Row: row => Array.flatMap(row.children, pageRowsOf),
      Column: column => Array.flatMap(column.children, pageRowsOf),
      Box: box =>
        box.layer === undefined ? Array.flatMap(box.children, pageRowsOf) : [],
      DeviceShell: shell => Array.flatMap(shell.children, pageRowsOf),
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Progress: () => [],
      Seek: () => [],
      Transcript: () => [],
    }),
  )

const rowWordsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(pageRowsOf(issuesScreen(model)), row =>
    Array.join(
      [
        row.title,
        ...(row.lines ?? []),
        ...Array.map(row.trailing ?? [], button => button.label),
      ],
      '  ',
    ),
  )

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

    expect(rowWordsOf(listed)).toContain(
      'Keep transcript aligned  #692  VerificationNeeded  P1  Unclaimed  Scribe',
    )
    expect(contentsOf(opened(verifying))).toEqual(
      expect.arrayContaining(['#692', 'Scribe']),
    )
    expect(
      Array.filter(
        buttonsOf(issuesScreen(opened(verifying))),
        button => button.token === 'menu:set-status',
      ).map(button => button.label),
    ).toEqual(['VerificationNeeded'])
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
        'defect  Scribe  Issue tracker web  claude-opus-5.5/issues-site claude-code',
        'Filed 1970-01-01 00:00  ·  updated 1970-01-01 00:00  ·  reported 2026-10-14',
        'Mentioned in',
        'Recording b24165ca  2026-10-05',
        "Line  Well, now it's going to be issues.pissport software. XYZ.",
        'Mentions',
        'Fix all the issues stuff with the site  Typed in the Claude chat, Claude Code session f1283b96.  2026-10-15 01:44',
        'Attachments',
        'file-form.png (Screenshot)',
      ]),
    )
    const links = Array.flatMap(textsOf(screen), text => [
      ...(text.href === undefined ? [] : [text.href]),
      ...Array.flatMap(text.parts ?? [], part =>
        part._tag === 'Reference' && part.href !== undefined ? [part.href] : [],
      ),
    ])
    expect(links).toContain(wordsLink)
    expect(links).toContain(
      'https://issues.pisspoursoftware.xyz/files/file-form.png',
    )
    expect(links).not.toContain('javascript:alert(1)')
  })

  // Scribe #1345: an Issue carries the screenshots and screen frames of the moment it quotes,
  // above all when the Issue is about design.
  it('draws the pictures stored with an Issue once Instant gives their addresses, and links its other files', () => {
    const storedFile = (
      fileId: string,
      fileName: string,
      contentType: string,
      kind: 'File' | 'Screenshot',
    ) =>
      IssueAttachment.make({
        byteCount: Option.none(),
        capturedAtMs: Option.none(),
        contentType,
        fileName,
        id: fileId,
        issueId: stored.id,
        kind,
        sha256: Option.none(),
        source: InstantStorageAttachmentSource.make({ fileId }),
      })
    const pictured = Issue.make({
      ...stored,
      attachments: [
        storedFile(
          'file-1',
          '11-27-16-+15-17-a51178e8.jpg',
          'image/jpeg',
          'Screenshot',
        ),
        storedFile('file-2', 'crash.log', 'text/plain', 'File'),
        storedFile('file-3', 'not-yet.png', 'image/png', 'Screenshot'),
      ],
    })
    const pictureUrl = 'https://files.instantdb.com/app/0/file-1?signature'
    const logUrl = 'https://files.instantdb.com/app/0/file-2?signature'
    const model = applyAll(opened(pictured), [
      ObservedIssueFiles.make({
        files: [
          { fileId: 'file-1', url: pictureUrl },
          { fileId: 'file-2', url: logUrl },
        ],
        issueId: stored.id,
      }),
      // Another Issue's files never reach this page.
      ObservedIssueFiles.make({
        files: [{ fileId: 'file-3', url: 'https://files.instantdb.com/other' }],
        issueId: '999',
      }),
    ])
    const drawn = (content: string) =>
      Option.map(
        Array.findFirst(
          textsOf(issuesScreen(model)),
          text => text.content === content,
        ),
        text => ({ href: text.href, picture: text.image?.src }),
      )

    expect(drawn('11-27-16-+15-17-a51178e8.jpg (Screenshot)')).toEqual(
      Option.some({ href: pictureUrl, picture: pictureUrl }),
    )
    expect(drawn('crash.log (File)')).toEqual(
      Option.some({ href: logUrl, picture: undefined }),
    )
    expect(drawn('not-yet.png (Screenshot)')).toEqual(
      Option.some({ href: undefined, picture: undefined }),
    )
  })

  it('says on the page when its pictures cannot be read, and why', () => {
    const withPicture = Issue.make({
      ...stored,
      attachments: [
        IssueAttachment.make({
          byteCount: Option.none(),
          capturedAtMs: Option.none(),
          contentType: 'image/png',
          fileName: 'shot.png',
          id: 'file-1',
          issueId: stored.id,
          kind: 'Screenshot',
          sha256: Option.none(),
          source: InstantStorageAttachmentSource.make({ fileId: 'file-1' }),
        }),
      ],
    })
    const model = applyAll(opened(withPicture), [
      FailedObserveIssueFiles.make({
        issueId: stored.id,
        reason: 'Permission denied: $files view',
      }),
    ])

    expect(contentsOf(model)).toContain(
      "This Issue's pictures could not be read: Permission denied: $files view",
    )
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
    const rangeLink = Array.flatMap(
      textsOf(issuesScreen(opened(mentioned))),
      text => text.parts ?? [],
    ).find(part => part._tag === 'Reference' && part.label === '#2273')
    expect(rangeLink?._tag === 'Reference' ? rangeLink.href : undefined).toBe(
      wordsLink,
    )
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
        'State: Green for Build 106',
        'Stuck: Waits on a review',
        'Branch: agent/claude/issue-804 in realtime-voice',
        'Worktree: worktrees/scribe-804',
        'Commit: 5e1f00d',
        'Last step: Green: 37 focused tests pass',
        'Recorded 2026-10-17 18:00 by wip-835 claude-code',
        'Subtasks: 1 of 2 done',
        'done  Red: the window census',
        'todo  Merge for Build 106',
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

    expect(rowWordsOf(listed)).toEqual([
      'Keep transcript aligned  #804  Green for build 106  InProgress  P1  Unclaimed  Scribe',
      'Keep transcript aligned  #805  Pushed for build 106, stuck  InProgress  P1  Unclaimed  Scribe',
      'Keep transcript aligned  #806  Red for build 106  InProgress  P1  Unclaimed  Scribe',
      'Keep transcript aligned  #807  Green for build 106, abandoned  InProgress  P1  Unclaimed  Scribe',
      'Keep transcript aligned  #808  Merged for build 106  InProgress  P1  Unclaimed  Scribe',
      'Keep transcript aligned  #021  Open  P1  Unclaimed  Scribe',
    ])

    const [landing] = update(
      listed,
      Option.getOrThrow(messageForScreenToken(listed, 'landing:close')),
    )
    expect(rowWordsOf(landing)).toEqual([
      'Keep transcript aligned  #804  Green for build 106  InProgress  P1  Unclaimed  Scribe',
      'Keep transcript aligned  #805  Pushed for build 106, stuck  InProgress  P1  Unclaimed  Scribe',
    ])
    expect(primaryTokensOf(landing)).toContain('landing:close')

    const [all] = update(
      landing,
      Option.getOrThrow(messageForScreenToken(landing, 'landing:all')),
    )
    expect(rowWordsOf(all)).toHaveLength(6)
    expect(primaryTokensOf(all)).toContain('landing:all')
  })
})

const presentAs = (issue: Issue, run: IssueAgentPresence['run']): Issue =>
  Issue.make({
    ...issue,
    agentPresence: Option.some(
      IssueAgentPresence.make({
        account: Option.some('max'),
        agentId: `claude-code/issue-${issue.id}@max`,
        branch: Option.some(`agent/claude/issue-${issue.id}`),
        harness: Option.some('claude'),
        run,
        startedAtMs: Option.some(1_793_312_008_000),
        touchedFiles: Option.none(),
        worktree: Option.some(
          `/Users/laptop/Sync/worktrees/scribe-${issue.id}`,
        ),
      }),
    ),
  })

describe('Issue Tracker screen: now working', () => {
  it('shows on the page of an Issue who is working on it, whether it runs, and where', () => {
    const running = presentAs(
      workingAt('1374', 'Red'),
      RunningAgent.make({ sinceMs: 1_793_312_400_000 }),
    )

    const contents = contentsOf(opened(running))

    expect(contents).toEqual(
      expect.arrayContaining([
        'Now working',
        'Agent: issue-1374@max claude-code (account max)',
        'Running: yes, seen since 2026-10-29 22:20 (started 2026-10-29 22:13)',
        'Branch: agent/claude/issue-1374 in realtime-voice',
        'Worktree: worktrees/scribe-1374',
        'Last step: Green: 37 focused tests pass (2026-10-17 18:00)',
      ]),
    )
    expect(contents.indexOf('Now working')).toBeLessThan(
      contents.indexOf('Work in progress'),
    )
    expect(contentsOf(opened(stored))).not.toContain('Now working')
  })

  it('names the running agent beside each Issue in the list, and lists only the Issues an agent works on now when asked', () => {
    const [listed] = update(
      modelForNavigation(IssueList.make({})),
      ObservedIssues.make({
        issues: [
          presentAs(
            workingAt('1374', 'Red'),
            RunningAgent.make({ sinceMs: 1_793_312_400_000 }),
          ),
          presentAs(
            workingAt('1201', 'Green'),
            StaleAgent.make({ reason: 'not running', sinceMs: 1 }),
          ),
          stored,
        ],
      }),
    )

    expect(rowWordsOf(listed)).toEqual([
      'Keep transcript aligned  #1374  Red for build 106  running claude-code/issue-1374@max  InProgress  P1  Unclaimed  Scribe',
      'Keep transcript aligned  #1201  Green for build 106  InProgress  P1  Unclaimed  Scribe',
      'Keep transcript aligned  #021  Open  P1  Unclaimed  Scribe',
    ])

    const [working] = update(
      listed,
      Option.getOrThrow(messageForScreenToken(listed, 'landing:working')),
    )
    expect(rowWordsOf(working)).toEqual([
      'Keep transcript aligned  #1374  Red for build 106  running claude-code/issue-1374@max  InProgress  P1  Unclaimed  Scribe',
    ])
    expect(primaryTokensOf(working)).toContain('landing:working')
    expect(
      Array.map(
        Array.filter(
          buttonsOf(issuesScreen(working)),
          button => button.token === 'landing:working',
        ),
        button => button.label,
      ),
    ).toEqual(['Working now'])
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
    workInProgress: Option.map(
      workingAt(id, landingState).workInProgress,
      work =>
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
    expect(rowWordsOf(backlog)).toEqual([
      'Keep transcript aligned  #903  Red for build 111  InProgress  P0  Unclaimed  Scribe',
      'Keep transcript aligned  #902  Green for build 111  InProgress  P2  Unclaimed  Scribe',
      'Keep transcript aligned  #904  Exploring for build 112  InProgress  P1  Unclaimed  Scribe',
      'Keep transcript aligned  #906  Open  P0  Unclaimed  Scribe',
      'Keep transcript aligned  #905  Open  P0  Unclaimed  Scribe',
      'Keep transcript aligned  #901  Shipped for build 110  InProgress  P1  Unclaimed  Scribe',
      'Keep transcript aligned  #907  Open  P3  Unclaimed  Scribe',
    ])
    expect(Option.isSome(messageForScreenToken(backlog, 'open:906'))).toBe(true)
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

    expect(rowWordsOf(onlyFoldkit)).toEqual([
      'Keep transcript aligned  #909  Open  P0  Unclaimed  Foldkit',
    ])
  })
})

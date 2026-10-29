import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ActiveWork,
  ApplicationProduct,
  BinaryFile,
  ChangedFile,
  EndedAgent,
  Issue,
  IssueAgentPresence,
  type IssueLandingState,
  IssueTouchedFiles,
  IssueWorkInProgress,
  IssueWorkLogEntry,
  RunningAgent,
  StaleAgent,
  UntrackedFile,
} from '@foldkit/instant-tools/issues'

import {
  AgentSurvey,
  EndedRun,
  LiveAgent,
  agentNameOf,
  nowWorkingLines,
  observedIssue,
  staleAfterMs,
  workingSyncAgent,
  worktreeToCount,
} from './nowWorking.js'

const observedAtMs = 1_793_312_400_000
const startedAtMs = 1_793_312_008_000

const issue = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.some('claude-code/issue-wip-1374@max'),
  complexity: Option.none(),
  createdAtMs: 1_793_311_000_000,
  details: '',
  id: '1374',
  issueType: Option.none(),
  mentions: [],
  priority: 'P2',
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  projectId: Option.none(),
  reportedDate: Option.none(),
  sourceDocument: Option.none(),
  status: 'InProgress',
  successCriteria: [],
  title: 'Show who is working on each Issue',
  updatedAtMs: 1_793_312_000_000,
  viewerURL: Option.none(),
  workLog: [],
})

const liveAgent = LiveAgent.make({
  account: Option.some('max'),
  agentId: 'claude-code/issue-wip-1374@max',
  branch: Option.some('agent/claude/issue-wip-1374'),
  harness: Option.some('claude'),
  issueId: Option.some('1374'),
  name: 'issue-wip-1374',
  startedAtMs: Option.some(startedAtMs),
  worktree: Option.some('/Users/laptop/Sync/worktrees/foldkit-issue-wip-1374'),
})

const surveyOf = (
  live: ReadonlyArray<LiveAgent>,
  ended: ReadonlyArray<EndedRun> = [],
  atMs: number = observedAtMs,
) => AgentSurvey.make({ ended, live, observedAtMs: atMs })

const touched = (checkedAtMs: number) =>
  IssueTouchedFiles.make({
    base: 'technoplato/main',
    checkedAtMs,
    fileCount: 3,
    files: [
      ChangedFile.make({
        deletions: 2,
        insertions: 40,
        path: 'packages/instant-tools/src/issues/domain.ts',
      }),
      BinaryFile.make({ path: 'docs/shot.png' }),
      UntrackedFile.make({ path: 'examples/issues/core/src/nowWorking.ts' }),
    ],
  })

const workAt = (landingState: IssueLandingState) =>
  IssueWorkInProgress.make({
    activity: ActiveWork.make({}),
    agentId: Option.some('claude-code/issue-wip-1374@max'),
    branch: Option.some('agent/claude/issue-wip-1374'),
    commitSha: Option.some('5e1f00d'),
    landingState,
    lastStep: Option.some('Red: the Now working block'),
    repository: Option.some('foldkit'),
    targetBuild: Option.none(),
    updatedAtMs: 1_793_312_300_000,
    worktree: Option.some('/Users/laptop/Sync/worktrees/foldkit-issue-wip-1374'),
  })

const encoded = (value: Issue) => S.encodeSync(Issue)(value)

describe('Now working', () => {
  it('reads the agent name inside a full agent id', () => {
    expect(agentNameOf('claude-code/issue-wip-1374@max')).toBe(
      'issue-wip-1374',
    )
    expect(agentNameOf('grok/privacy-tests-1350@grok')).toBe(
      'privacy-tests-1350',
    )
    expect(agentNameOf('claude-code/claude/sweep-1201')).toBe('sweep-1201')
    expect(agentNameOf('issue-wip-1374')).toBe('issue-wip-1374')
  })

  it('names the running claimant, its account, branch, worktree and touched files, and keeps when it started', () => {
    const first = observedIssue(
      issue,
      surveyOf([liveAgent]),
      Option.some(touched(observedAtMs)),
    )

    expect(first.agentPresence).toEqual(
      Option.some(
        IssueAgentPresence.make({
          account: Option.some('max'),
          agentId: 'claude-code/issue-wip-1374@max',
          branch: Option.some('agent/claude/issue-wip-1374'),
          harness: Option.some('claude'),
          run: RunningAgent.make({ sinceMs: observedAtMs }),
          startedAtMs: Option.some(startedAtMs),
          touchedFiles: Option.some(touched(observedAtMs)),
          worktree: Option.some(
            '/Users/laptop/Sync/worktrees/foldkit-issue-wip-1374',
          ),
        }),
      ),
    )
    expect(first.claimantId).toEqual(issue.claimantId)
    expect(first.workLog).toEqual([])
    expect(first.updatedAtMs).toBe(issue.updatedAtMs)

    const later = observedIssue(
      first,
      surveyOf([liveAgent], [], observedAtMs + 120_000),
      Option.some(touched(observedAtMs + 120_000)),
    )
    expect(encoded(later)).toEqual(encoded(first))
  })

  it('prefers the claimant among several agents running on the Issue', () => {
    const helper = LiveAgent.make({
      ...liveAgent,
      agentId: 'codex/helper-1374@ld',
      name: 'helper-1374',
      startedAtMs: Option.some(startedAtMs + 60_000),
    })

    const observed = observedIssue(
      issue,
      surveyOf([helper, liveAgent]),
      Option.none(),
    )

    expect(
      Option.map(observed.agentPresence, presence => presence.agentId),
    ).toEqual(Option.some('claude-code/issue-wip-1374@max'))
  })

  it('releases the claim of an agent whose run ended, once, and says so in the work log', () => {
    const running = observedIssue(issue, surveyOf([liveAgent]), Option.none())
    const ended = surveyOf(
      [],
      [
        EndedRun.make({
          endedAtMs: Option.some(observedAtMs - 30_000),
          how: 'done',
          issueId: Option.some('1374'),
          name: 'issue-wip-1374',
        }),
      ],
      observedAtMs + 600_000,
    )

    const released = observedIssue(running, ended, Option.none())

    expect(released.claimantId).toEqual(Option.none())
    expect(
      Option.map(released.agentPresence, presence => presence.run),
    ).toEqual(
      Option.some(EndedAgent.make({ how: 'done', sinceMs: observedAtMs + 600_000 })),
    )
    expect(released.workLog).toEqual([
      IssueWorkLogEntry.make({
        agentId: Option.some(workingSyncAgent),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: `work-1374-released-${String(observedAtMs + 600_000)}`,
        occurredAtMs: observedAtMs + 600_000,
        state: Option.some('released'),
        summary:
          'Released the claim of claude-code/issue-wip-1374@max: its run ended (done) and no agent is running on #1374.',
      }),
    ])
    expect(released.updatedAtMs).toBe(observedAtMs + 600_000)
    expect(
      encoded(
        observedIssue(
          released,
          surveyOf([], ended.ended, observedAtMs + 720_000),
          Option.none(),
        ),
      ),
    ).toEqual(encoded(released))
  })

  it('says an agent that holds no claim ended once it no longer runs', () => {
    const unclaimed = Issue.make({ ...issue, claimantId: Option.none() })
    const running = observedIssue(
      unclaimed,
      surveyOf([liveAgent]),
      Option.none(),
    )

    const gone = observedIssue(
      running,
      surveyOf([], [], observedAtMs + 300_000),
      Option.none(),
    )

    expect(Option.map(gone.agentPresence, presence => presence.run)).toEqual(
      Option.some(
        EndedAgent.make({
          how: 'no longer running',
          sinceMs: observedAtMs + 300_000,
        }),
      ),
    )
    expect(gone.workLog).toEqual([])
  })

  it('marks a claim stale when its agent is unknown and nothing happened for twelve hours, and keeps the claim', () => {
    const quiet = Issue.make({
      ...issue,
      claimantId: Option.some('claude-code/backlog-sweep'),
      updatedAtMs: observedAtMs - staleAfterMs - 1,
    })

    const stale = observedIssue(quiet, surveyOf([]), Option.none())

    expect(stale.claimantId).toEqual(quiet.claimantId)
    expect(stale.agentPresence).toEqual(
      Option.some(
        IssueAgentPresence.make({
          account: Option.none(),
          agentId: 'claude-code/backlog-sweep',
          branch: Option.none(),
          harness: Option.none(),
          run: StaleAgent.make({
            reason:
              'no agent named backlog-sweep is running, and nothing changed on the Issue since 2026-10-29T10:19:59.999Z',
            sinceMs: observedAtMs,
          }),
          startedAtMs: Option.none(),
          touchedFiles: Option.none(),
          worktree: Option.none(),
        }),
      ),
    )
    expect(
      encoded(
        observedIssue(stale, surveyOf([], [], observedAtMs + 120_000), Option.none()),
      ),
    ).toEqual(encoded(stale))

    const recent = Issue.make({
      ...quiet,
      updatedAtMs: observedAtMs - 60_000,
    })
    expect(encoded(observedIssue(recent, surveyOf([]), Option.none()))).toEqual(
      encoded(recent),
    )
  })

  it('moves an Issue whose work merged or shipped to VerificationNeeded, and leaves a closed one', () => {
    const merged = Issue.make({
      ...issue,
      claimantId: Option.none(),
      workInProgress: Option.some(workAt('Merged')),
    })

    const moved = observedIssue(merged, surveyOf([]), Option.none())

    expect(moved.status).toBe('VerificationNeeded')
    expect(moved.workLog).toEqual([
      IssueWorkLogEntry.make({
        agentId: Option.some(workingSyncAgent),
        commitSha: Option.some('5e1f00d'),
        durationSeconds: Option.none(),
        id: `work-1374-status-${String(observedAtMs)}`,
        occurredAtMs: observedAtMs,
        state: Option.some('status'),
        summary:
          'Status InProgress → VerificationNeeded: the work is Merged (agent/claude/issue-wip-1374 at 5e1f00d); verify it.',
      }),
    ])

    const closed = Issue.make({ ...merged, status: 'Closed' })
    expect(encoded(observedIssue(closed, surveyOf([]), Option.none()))).toEqual(
      encoded(closed),
    )
    const red = Issue.make({
      ...merged,
      workInProgress: Option.some(workAt('Red')),
    })
    expect(observedIssue(red, surveyOf([]), Option.none()).status).toBe(
      'InProgress',
    )
  })

  it('counts files in the recorded worktree, else in the running agent’s', () => {
    const recorded = Issue.make({
      ...issue,
      workInProgress: Option.some(
        IssueWorkInProgress.make({
          ...workAt('Red'),
          worktree: Option.some('/Users/laptop/Sync/worktrees/recorded'),
        }),
      ),
    })
    expect(worktreeToCount(recorded, surveyOf([liveAgent]))).toEqual(
      Option.some('/Users/laptop/Sync/worktrees/recorded'),
    )
    expect(worktreeToCount(issue, surveyOf([liveAgent]))).toEqual(
      Option.some('/Users/laptop/Sync/worktrees/foldkit-issue-wip-1374'),
    )
    expect(worktreeToCount(issue, surveyOf([]))).toEqual(Option.none())
  })

  it('says who is working, whether it runs, where, which files and the last step', () => {
    const working = observedIssue(
      Issue.make({ ...issue, workInProgress: Option.some(workAt('Red')) }),
      surveyOf([liveAgent]),
      Option.some(touched(observedAtMs)),
    )

    expect(nowWorkingLines(working)).toEqual([
      'Agent: claude-code/issue-wip-1374@max (account max)',
      'Running: yes, seen 2026-10-29T22:20:00.000Z (started 2026-10-29T22:13:28.000Z)',
      'Branch: agent/claude/issue-wip-1374 in foldkit',
      'Worktree: /Users/laptop/Sync/worktrees/foldkit-issue-wip-1374',
      'Files: 3 touched against technoplato/main (counted 2026-10-29T22:20:00.000Z)',
      '  packages/instant-tools/src/issues/domain.ts  +40 -2',
      '  docs/shot.png  binary',
      '  examples/issues/core/src/nowWorking.ts  new, not yet added',
      'Last step: Red: the Now working block (2026-10-29T22:18:20.000Z)',
    ])

    expect(
      nowWorkingLines(
        Issue.make({
          ...issue,
          workLog: [
            IssueWorkLogEntry.make({
              agentId: Option.some('claude-code/issue-wip-1374@max'),
              commitSha: Option.none(),
              durationSeconds: Option.none(),
              id: 'work-1374-progress-1',
              occurredAtMs: 1_793_312_202_516,
              state: Option.some('progress'),
              summary: 'Plan logged; next: red tests',
            }),
          ],
        }),
      ),
    ).toEqual([
      'Agent: claude-code/issue-wip-1374@max',
      'Running: not checked yet',
      'Last step: Plan logged; next: red tests (2026-10-29T22:16:42.516Z)',
    ])

    const unclaimed = Issue.make({ ...issue, claimantId: Option.none() })
    expect(nowWorkingLines(unclaimed)).toEqual([])
  })
})

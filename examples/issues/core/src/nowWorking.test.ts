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
  abandonedAfterMs,
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
    worktree: Option.some(
      '/Users/laptop/Sync/worktrees/foldkit-issue-wip-1374',
    ),
  })

const encoded = (value: Issue) => S.encodeSync(Issue)(value)

describe('Now working', () => {
  it('reads the agent name inside a full agent id', () => {
    expect(agentNameOf('claude-code/issue-wip-1374@max')).toBe('issue-wip-1374')
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
      Option.none(),
    )
    expect(encoded(later)).toEqual(encoded(first))

    const recounted = observedIssue(
      first,
      surveyOf([liveAgent], [], observedAtMs + 600_000),
      Option.some(touched(observedAtMs + 600_000)),
    )
    expect(
      Option.flatMap(
        recounted.agentPresence,
        presence => presence.touchedFiles,
      ),
    ).toEqual(Option.some(touched(observedAtMs + 600_000)))
    expect(
      Option.map(recounted.agentPresence, presence => presence.run),
    ).toEqual(Option.some(RunningAgent.make({ sinceMs: observedAtMs })))
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
      Option.some(
        EndedAgent.make({ how: 'done', sinceMs: observedAtMs + 600_000 }),
      ),
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

  // Scribe #2264: on 2026-11-11 a watchdog's resume of a replaced run claimed an
  // Issue from the agent working on it, stopped ten seconds later, and the sync
  // released the claim to nobody while that agent worked on, three times.
  const laneAgent = (name: string, startedAt: number) =>
    LiveAgent.make({
      ...liveAgent,
      agentId: `claude-code/${name}@max`,
      name,
      startedAtMs: Option.some(startedAt),
    })
  const claimedBy = (agentId: string, atMs: number) =>
    IssueWorkLogEntry.make({
      agentId: Option.some(agentId),
      commitSha: Option.none(),
      durationSeconds: Option.none(),
      id: `work-1374-claimed-${String(atMs)}`,
      occurredAtMs: atMs,
      state: Option.some('claimed'),
      summary: `${agentId} claims #1374`,
    })
  const takenByAFailedRun = (workLog: ReadonlyArray<IssueWorkLogEntry>) =>
    Issue.make({
      ...issue,
      claimantId: Option.some('claude-code/issue-wip-1374b@max'),
      workLog: [
        ...workLog,
        claimedBy(
          'claude-code/issue-wip-1374b@max',
          observedAtMs - 30_000,
        ),
      ],
    })
  const failedRun = EndedRun.make({
    endedAtMs: Option.some(observedAtMs - 20_000),
    how: 'failed (exit 1)',
    issueId: Option.some('1374'),
    name: 'issue-wip-1374b',
  })
  const releasedBy = (summary: string) =>
    IssueWorkLogEntry.make({
      agentId: Option.some(workingSyncAgent),
      commitSha: Option.none(),
      durationSeconds: Option.none(),
      id: `work-1374-released-${String(observedAtMs)}`,
      occurredAtMs: observedAtMs,
      state: Option.some('released'),
      summary,
    })

  it('hands a released claim back to the newest earlier claimant still running on the Issue', () => {
    const successor = laneAgent('issue-wip-1374c', startedAtMs)
    const helper = laneAgent('cut-1374', startedAtMs + 120_000)
    const taken = takenByAFailedRun([
      claimedBy(successor.agentId, observedAtMs - 60_000),
    ])
    const survey = surveyOf([helper, successor], [failedRun])

    const observed = observedIssue(taken, survey, Option.none())

    expect(observed.claimantId).toEqual(Option.some(successor.agentId))
    expect(
      Option.map(observed.agentPresence, presence => [
        presence.agentId,
        presence.run._tag,
      ]),
    ).toEqual(Option.some([successor.agentId, 'Running']))
    expect(observed.workLog.slice(taken.workLog.length)).toEqual([
      releasedBy(
        'Released the claim of claude-code/issue-wip-1374b@max: its run ended (failed (exit 1)); the claim goes back to claude-code/issue-wip-1374c@max, which is running on #1374.',
      ),
    ])
    expect(encoded(observedIssue(observed, survey, Option.none()))).toEqual(
      encoded(observed),
    )
  })

  it('hands a released claim to the newest agent running on the Issue when none of them claimed it', () => {
    const older = laneAgent('issue-wip-1374c', startedAtMs)
    const newer = laneAgent('cut-1374', startedAtMs + 120_000)

    const observed = observedIssue(
      takenByAFailedRun([]),
      surveyOf([older, newer], [failedRun]),
      Option.none(),
    )

    expect(observed.claimantId).toEqual(Option.some(newer.agentId))
    expect(observed.workLog.at(-1)?.summary).toBe(
      'Released the claim of claude-code/issue-wip-1374b@max: its run ended (failed (exit 1)); the claim goes back to claude-code/cut-1374@max, which is running on #1374.',
    )
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
        observedIssue(
          stale,
          surveyOf([], [], observedAtMs + 120_000),
          Option.none(),
        ),
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

  it('releases the claim on a finished Issue once no agent of that name runs, though no run of it is on record', () => {
    const finishedStatuses = [
      'Closed',
      'Fixed',
      'Resolved',
      'Verified',
    ] as const
    for (const status of finishedStatuses) {
      const finished = Issue.make({
        ...issue,
        claimantId: Option.some('claude-code/landscape-265@max'),
        id: '265',
        status,
      })

      const released = observedIssue(finished, surveyOf([]), Option.none())

      expect(released.claimantId).toEqual(Option.none())
      expect(released.status).toBe(status)
      expect(
        Option.map(released.agentPresence, presence => presence.run),
      ).toEqual(
        Option.some(
          EndedAgent.make({ how: 'no longer running', sinceMs: observedAtMs }),
        ),
      )
      expect(released.workLog).toEqual([
        IssueWorkLogEntry.make({
          agentId: Option.some(workingSyncAgent),
          commitSha: Option.none(),
          durationSeconds: Option.none(),
          id: `work-265-released-${String(observedAtMs)}`,
          occurredAtMs: observedAtMs,
          state: Option.some('released'),
          summary: `Released the claim of claude-code/landscape-265@max: #265 is ${status} and no agent named landscape-265 is running.`,
        }),
      ])
      expect(
        encoded(
          observedIssue(
            released,
            surveyOf([], [], observedAtMs + 120_000),
            Option.none(),
          ),
        ),
      ).toEqual(encoded(released))
    }

    const stillRunning = Issue.make({
      ...issue,
      status: 'Verified',
    })
    expect(
      observedIssue(stillRunning, surveyOf([liveAgent]), Option.none())
        .claimantId,
    ).toEqual(stillRunning.claimantId)

    const awaitingVerification = Issue.make({
      ...issue,
      claimantId: Option.some('claude-code/landscape-265@max'),
      status: 'VerificationNeeded',
    })
    expect(
      observedIssue(awaitingVerification, surveyOf([]), Option.none())
        .claimantId,
    ).toEqual(awaitingVerification.claimantId)
  })

  it('releases a claim on unfinished work once its agent is gone and wrote nothing on the Issue for a week', () => {
    const lastWroteAtMs = observedAtMs - abandonedAfterMs - 1
    const entry = (
      agentId: string,
      occurredAtMs: number,
      summary: string,
    ): IssueWorkLogEntry =>
      IssueWorkLogEntry.make({
        agentId: Option.some(agentId),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: `work-645-progress-${String(occurredAtMs)}`,
        occurredAtMs,
        state: Option.some('progress'),
        summary,
      })
    const abandoned = Issue.make({
      ...issue,
      claimantId: Option.some('claude-code/capture-timing@max'),
      id: '645',
      status: 'Open',
      updatedAtMs: observedAtMs - 60_000,
      workLog: [
        entry(
          'claude-code/capture-timing@max',
          lastWroteAtMs,
          'Red on agent/claude/capture-timing',
        ),
        entry(
          'claude-code/p-1618-hj@max',
          observedAtMs - 60_000,
          'Audit: not done; stays Open.',
        ),
      ],
    })

    const released = observedIssue(abandoned, surveyOf([]), Option.none())

    expect(released.claimantId).toEqual(Option.none())
    expect(released.status).toBe('Open')
    expect(released.workLog.at(-1)).toEqual(
      IssueWorkLogEntry.make({
        agentId: Option.some(workingSyncAgent),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: `work-645-released-${String(observedAtMs)}`,
        occurredAtMs: observedAtMs,
        state: Option.some('released'),
        summary: `Released the claim of claude-code/capture-timing@max: no agent named capture-timing is running, and it wrote nothing on #645 since ${new Date(lastWroteAtMs).toISOString()}.`,
      }),
    )
    expect(
      encoded(
        observedIssue(
          released,
          surveyOf([], [], observedAtMs + 120_000),
          Option.none(),
        ),
      ),
    ).toEqual(encoded(released))

    const wroteThisWeek = Issue.make({
      ...abandoned,
      workLog: [
        entry(
          'claude-code/capture-timing@max',
          observedAtMs - abandonedAfterMs + 3_600_000,
          'Green on agent/claude/capture-timing',
        ),
      ],
    })
    expect(
      observedIssue(wroteThisWeek, surveyOf([]), Option.none()).claimantId,
    ).toEqual(wroteThisWeek.claimantId)

    const stillRunning = Issue.make({
      ...abandoned,
      claimantId: Option.some('claude-code/issue-wip-1374@max'),
    })
    expect(
      observedIssue(stillRunning, surveyOf([liveAgent]), Option.none())
        .claimantId,
    ).toEqual(stillRunning.claimantId)
  })

  it('keeps a newly claimed Issue InProgress though an earlier run recorded its work Merged', () => {
    const earlierWork = workAt('Merged')
    const claimedAtMs = earlierWork.updatedAtMs + 3_600_000
    const newAgent = LiveAgent.make({
      ...liveAgent,
      agentId: 'claude-code/p-1057-hj@max',
      name: 'p-1057-hj',
    })
    const reclaimed = Issue.make({
      ...issue,
      claimantId: Option.some('claude-code/p-1057-hj@max'),
      workInProgress: Option.some(earlierWork),
      workLog: [
        IssueWorkLogEntry.make({
          agentId: Option.some('claude-code/p-1057-hj@max'),
          commitSha: Option.none(),
          durationSeconds: Option.none(),
          id: `work-1374-claimed-${String(claimedAtMs)}`,
          occurredAtMs: claimedAtMs,
          state: Option.some('claimed'),
          summary: 'Claimed by claude-code/p-1057-hj@max.',
        }),
      ],
    })

    const observed = observedIssue(
      reclaimed,
      surveyOf([newAgent], [], claimedAtMs + 60_000),
      Option.none(),
    )

    expect(observed.status).toBe('InProgress')
    expect(observed.workLog).toEqual(reclaimed.workLog)

    const landedAgain = Issue.make({
      ...observed,
      workInProgress: Option.some(
        IssueWorkInProgress.make({
          ...earlierWork,
          updatedAtMs: claimedAtMs + 120_000,
        }),
      ),
    })
    expect(
      observedIssue(
        landedAgain,
        surveyOf([newAgent], [], claimedAtMs + 180_000),
        Option.none(),
      ).status,
    ).toBe('VerificationNeeded')
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
      'Running: yes, seen since 2026-10-29T22:20:00.000Z (started 2026-10-29T22:13:28.000Z)',
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

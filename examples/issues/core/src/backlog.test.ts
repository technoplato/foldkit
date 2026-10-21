import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AbandonedWork,
  ActiveWork,
  ApplicationProduct,
  Issue,
  type IssueLandingState,
  type IssuePriority,
  type IssueStatus,
  IssueWorkInProgress,
} from '@foldkit/instant-tools/issues'

import {
  BuildLane,
  DifferentPriority,
  NoRoom,
  PrioritySection,
  RankedAt,
  backlogIssues,
  backlogOf,
  nextBuild,
  rankAfter,
  rankBefore,
  rankTop,
} from './backlog.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })

const DAY_MS = 86_400_000
const FIRST_FILED_MS = 1_790_000_000_000

const issueAt = (
  id: string,
  priority: IssuePriority,
  overrides: Partial<typeof Issue.Type> = {},
): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: FIRST_FILED_MS + Number(id) * DAY_MS,
    details: `Details of ${id}.`,
    id,
    issueType: Option.none(),
    mentions: [],
    priority,
    product: scribe,
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title: `Issue ${id}`,
    updatedAtMs: FIRST_FILED_MS,
    viewerURL: Option.none(),
    workLog: [],
    ...overrides,
  })

const forBuild = (
  build: string,
  landingState: IssueLandingState,
  isAbandoned = false,
): Partial<typeof Issue.Type> => ({
  status: 'InProgress',
  workInProgress: Option.some(
    IssueWorkInProgress.make({
      activity: isAbandoned
        ? AbandonedWork.make({ reason: 'Replaced' })
        : ActiveWork.make({}),
      agentId: Option.none(),
      branch: Option.none(),
      commitSha: Option.none(),
      landingState,
      lastStep: Option.none(),
      repository: Option.none(),
      targetBuild: Option.some(build),
      updatedAtMs: FIRST_FILED_MS,
      worktree: Option.none(),
    }),
  ),
})

const idsOf = (issues: ReadonlyArray<Issue>): ReadonlyArray<string> =>
  Array.map(issues, issue => issue.id)

const withStatus = (status: IssueStatus): Partial<typeof Issue.Type> => ({
  status,
})

describe('backlog order', () => {
  it('orders by priority, then by rank within a priority, then oldest first', () => {
    const issues = [
      issueAt('005', 'P1'),
      issueAt('001', 'P2'),
      issueAt('003', 'P1'),
      issueAt('004', 'P0'),
      issueAt('002', 'P1', {
        backlogRank: Option.some(FIRST_FILED_MS + 6 * DAY_MS),
      }),
    ]

    expect(idsOf(backlogIssues(backlogOf(issues)))).toEqual([
      '004',
      '003',
      '005',
      '002',
      '001',
    ])
    expect(backlogOf(issues).sections).toEqual([
      PrioritySection.make({ issues: [issues[3]!], priority: 'P0' }),
      PrioritySection.make({
        issues: [issues[2]!, issues[0]!, issues[4]!],
        priority: 'P1',
      }),
      PrioritySection.make({ issues: [issues[1]!], priority: 'P2' }),
    ])
  })

  it('leaves out finished Issues and Issues waiting only on verification', () => {
    const issues = [
      issueAt('001', 'P0', withStatus('Fixed')),
      issueAt('002', 'P0', withStatus('Closed')),
      issueAt('003', 'P0', withStatus('Resolved')),
      issueAt('004', 'P0', withStatus('Verified')),
      issueAt('005', 'P0', withStatus('VerificationNeeded')),
      issueAt('006', 'P0', withStatus('PartiallyDone')),
      issueAt('007', 'P0', withStatus('Blocked')),
    ]

    expect(idsOf(backlogIssues(backlogOf(issues)))).toEqual(['006', '007'])
  })
})

describe('next build', () => {
  it('is the lowest target build above every build that shipped work', () => {
    const issues = [
      issueAt('001', 'P1', forBuild('106', 'Shipped')),
      issueAt('002', 'P1', forBuild('107', 'Exploring')),
      issueAt('003', 'P1', forBuild('110', 'Shipped')),
      issueAt('004', 'P1', forBuild('112', 'Exploring')),
      issueAt('005', 'P2', forBuild('111', 'Green')),
    ]

    expect(nextBuild(issues)).toEqual(Option.some('111'))
  })

  it('is the lowest target build when no build has shipped, and none when no work targets one', () => {
    expect(
      nextBuild([
        issueAt('001', 'P1', forBuild('12', 'Red')),
        issueAt('002', 'P1', forBuild('9', 'Exploring')),
      ]),
    ).toEqual(Option.some('9'))
    expect(nextBuild([issueAt('001', 'P1')])).toEqual(Option.none())
  })

  it('leads the backlog with one lane per upcoming build, the next build first, and lists each Issue once', () => {
    const issues = [
      issueAt('001', 'P1', forBuild('110', 'Shipped')),
      issueAt('002', 'P0', forBuild('107', 'Exploring')),
      issueAt('003', 'P2', forBuild('111', 'Green')),
      issueAt('004', 'P0', forBuild('111', 'Red')),
      issueAt('005', 'P1', forBuild('112', 'Exploring')),
      issueAt('006', 'P1', forBuild('111', 'Green', true)),
      issueAt('007', 'P1', {
        ...forBuild('111', 'Merged'),
        status: 'VerificationNeeded',
      }),
      issueAt('008', 'P3'),
    ]

    const backlog = backlogOf(issues)

    expect(backlog.lanes).toEqual([
      BuildLane.make({
        build: '111',
        isNext: true,
        issues: [issues[3]!, issues[6]!, issues[2]!],
      }),
      BuildLane.make({ build: '112', isNext: false, issues: [issues[4]!] }),
    ])
    expect(idsOf(backlogIssues(backlog))).toEqual([
      '004',
      '007',
      '003',
      '005',
      '002',
      '001',
      '006',
      '008',
    ])
  })
})

describe('ranking', () => {
  const p1 = [
    issueAt('001', 'P1'),
    issueAt('002', 'P1'),
    issueAt('003', 'P1'),
    issueAt('004', 'P1'),
  ]

  it('places an Issue between the one it goes before and that one’s predecessor', () => {
    const ranked = rankBefore([...p1, issueAt('009', 'P0')], '004', '002')

    expect(ranked).toEqual(
      RankedAt.make({ rank: FIRST_FILED_MS + 1.5 * DAY_MS }),
    )
    const moved = Array.map(p1, issue =>
      issue.id === '004' && ranked._tag === 'RankedAt'
        ? Issue.make({ ...issue, backlogRank: Option.some(ranked.rank) })
        : issue,
    )
    expect(idsOf(backlogIssues(backlogOf(moved)))).toEqual([
      '001',
      '004',
      '002',
      '003',
    ])
  })

  it('places an Issue first in its priority, before the first one, or after one', () => {
    expect(rankBefore(p1, '004', '001')).toEqual(
      RankedAt.make({ rank: FIRST_FILED_MS }),
    )
    expect(rankTop(p1, '003')).toEqual(RankedAt.make({ rank: FIRST_FILED_MS }))
    expect(rankAfter(p1, '001', '004')).toEqual(
      RankedAt.make({ rank: FIRST_FILED_MS + 5 * DAY_MS }),
    )
    expect(rankAfter(p1, '004', '002')).toEqual(
      RankedAt.make({ rank: FIRST_FILED_MS + 2.5 * DAY_MS }),
    )
  })

  it('ranks only within one priority', () => {
    expect(rankBefore([...p1, issueAt('009', 'P0')], '001', '009')).toEqual(
      DifferentPriority.make({ anchorPriority: 'P0', issuePriority: 'P1' }),
    )
  })

  it('says when two neighbors leave no room between them', () => {
    const crowded = [
      issueAt('001', 'P1', { createdAtMs: FIRST_FILED_MS }),
      issueAt('002', 'P1', {
        createdAtMs: FIRST_FILED_MS,
        backlogRank: Option.some(FIRST_FILED_MS),
      }),
      issueAt('003', 'P1'),
    ]
    expect(rankBefore(crowded, '003', '002')).toEqual(NoRoom.make({}))
  })
})

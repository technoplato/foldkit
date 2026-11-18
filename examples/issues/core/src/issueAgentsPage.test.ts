import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import { agentChipsOf } from './graphFacts.js'
import { modelForNavigation } from './init.js'
import { issueAgentsOf, issueAgentsQuery } from './issueAgents.js'
import {
  FailedObserveIssueAgents,
  ObservedAgentChips,
  ObservedIssue,
  ObservedIssueAgents,
  ObservedIssues,
  TickedClock,
} from './message.js'
import { IssueDetail, type Model } from './model.js'
import { issuesScreen } from './program.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-12T15:00:00Z')
const ASKED_MS = Date.parse('2026-11-12T12:39:50Z')
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DISPATCHER = 'claude-code/dispatcher@al'

const issue = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: ASKED_MS,
  details: '',
  evidenceLogQueries: [],
  id: '2303',
  issueType: Option.none(),
  mentions: [],
  priority: 'P1',
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  projectId: Option.none(),
  reportedDate: Option.none(),
  sourceDocument: Option.none(),
  status: 'InProgress',
  successCriteria: [],
  title: 'Agents on their Issue',
  updatedAtMs: ASKED_MS,
  viewerURL: Option.none(),
  workLog: [
    IssueWorkLogEntry.make({
      agentId: Option.some(DISPATCHER),
      commitSha: Option.none(),
      durationSeconds: Option.none(),
      id: 'work-2303-1',
      occurredAtMs: NOW_MS - HOUR_MS,
      state: Option.some('progress'),
      summary: 'Started the run for it.',
    }),
  ],
})

const storedAgents = [
  {
    id: 'issue-agents-2303',
    agentID: 'claude-code/issue-agents-2303@max',
    account: 'max',
    harness: 'claude-code',
    issueNumber: 2303,
    kind: 'headless',
    name: 'issue-agents-2303',
    remoteURL: 'https://claude.ai/code/session_EXAMPLE_RUN',
    status: 'running',
    startedAtMs: ASKED_MS + 107 * MINUTE_MS,
    children: [
      {
        id: 'sub',
        agentID: 'claude-code/issue-agents-2303@max/Explore-ab73110a',
        name: 'issue-agents-2303:ab73110a',
        status: 'done',
        startedAtMs: ASKED_MS + 108 * MINUTE_MS,
        endedAtMs: ASKED_MS + 121 * MINUTE_MS,
        task: 'Map FoldKit issues site agents',
      },
    ],
  },
  {
    id: 'older-run',
    agentID: 'claude-code/older-run@al',
    account: 'al',
    harness: 'claude-code',
    issueNumber: 2303,
    kind: 'headless',
    name: 'older-run',
    status: 'done',
    startedAtMs: ASKED_MS + HOUR_MS,
    endedAtMs: ASKED_MS + 2 * HOUR_MS,
  },
]

const agents = Option.getOrThrow(
  Array.head(issueAgentsOf([2303], { agentRuns: storedAgents })),
).agents

// The page's chips: the dispatcher wrote on the Issue while it ran, and the
// chips' query also answers the run started for it.
const chips = agentChipsOf({
  agentRuns: [
    {
      id: 'the-dispatcher',
      agentID: DISPATCHER,
      account: 'al',
      harness: 'claude-code',
      kind: 'interactive',
      name: 'dispatcher',
      status: 'running',
      startedAtMs: NOW_MS - 3 * HOUR_MS,
    },
    { ...storedAgents[1], issueNumber: 2303 },
  ],
})

const opened = (): Model =>
  [
    TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
    ObservedIssues.make({ issues: [issue] }),
    ObservedIssue.make({ issue: Option.some(issue), issueId: '2303' }),
    ObservedAgentChips.make({ runs: chips }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(IssueDetail.make({ issueId: '2303' })),
  )

const withAgents = (): Model =>
  update(opened(), ObservedIssueAgents.make({ agents, issueId: '2303' }))[0]

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const referencesOf = (model: Model): ReadonlyArray<ReferencePart> =>
  Array.flatMap(textsOf(issuesScreen(model)), text =>
    Array.filter(
      text.parts ?? [],
      (part): part is ReferencePart => part._tag === 'Reference',
    ),
  )

describe('an Issue’s agents on its page (Scribe #2303)', () => {
  it('reads them with the one query the command reads', () => {
    expect(issueAgentsQuery([2303]).agentRuns.$.where).toEqual({
      issueNumber: { $in: [2303] },
    })
  })

  it('lists every agent started for it, then each run that only wrote on it while running, once each', () => {
    const contents = contentsOf(withAgents())
    expect(contents).toContain('Runs: 3')
    expect(
      Array.filter(
        referencesOf(withAgents()),
        reference =>
          reference.kind === 'Agent' &&
          reference.href ===
            `/agents/${encodeURIComponent('claude-code/older-run@al')}`,
      ),
    ).toHaveLength(1)
    expect(
      referencesOf(withAgents()).some(
        reference =>
          reference.kind === 'Agent' &&
          reference.href === `/agents/${encodeURIComponent(DISPATCHER)}`,
      ),
    ).toBe(true)
  })

  it('gives each its claude.ai link, or why it has none, and the link that opens its chat in the app', () => {
    const references = referencesOf(withAgents())
    expect(
      references.some(
        reference =>
          reference.kind === 'Session' &&
          reference.label === 'claude.ai' &&
          reference.href === 'https://claude.ai/code/session_EXAMPLE_RUN',
      ),
    ).toBe(true)
    expect(
      references.some(
        reference =>
          reference.label === 'Chat' &&
          reference.href === 'scribe-shared://agent/issue-agents-2303',
      ),
    ).toBe(true)
    expect(contentsOf(withAgents())).toContainEqual(
      expect.stringContaining(
        'No Claude link: no claude.ai link was recorded for it',
      ),
    )
  })

  it('shows each subagent under the run it works in, with what it was asked to do', () => {
    expect(contentsOf(withAgents())).toContainEqual(
      expect.stringContaining('Map FoldKit issues site agents'),
    )
    expect(
      referencesOf(withAgents()).some(
        reference =>
          reference.kind === 'Agent' &&
          reference.href ===
            `/agents/${encodeURIComponent('claude-code/issue-agents-2303@max/Explore-ab73110a')}`,
      ),
    ).toBe(true)
  })

  it('keeps the runs it lists today until the agents are read, and says why when they cannot be', () => {
    expect(contentsOf(opened())).toContain('Runs: 2')
    const [failed] = update(
      opened(),
      FailedObserveIssueAgents.make({ issueId: '2303', reason: 'Refused' }),
    )
    expect(contentsOf(failed)).toContainEqual(
      expect.stringContaining('Its agents could not be read: Refused'),
    )
    expect(contentsOf(failed)).toContain('Runs: 2')
  })

  it('ignores the agents of an Issue no longer open', () => {
    const [ignored] = update(
      modelForNavigation(IssueDetail.make({ issueId: '0041' })),
      ObservedIssueAgents.make({ agents, issueId: '2303' }),
    )
    expect(ignored.issueAgents._tag).toBe('NotObservingIssueAgents')
  })
})

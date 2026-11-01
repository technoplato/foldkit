import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import { AgentEntity, SessionEntity } from './entityGraph.js'
import {
  agentChipsOf,
  agentChipsQuery,
  agentFactsOf,
  agentFactsQuery,
  agentNameOfHandle,
  harnessOfHandle,
  sessionFactsOf,
  sessionFactsQuery,
} from './graphFacts.js'
import { modelForNavigation } from './init.js'
import { NoPageFacts, type PageFacts } from './issueLandings.js'
import {
  ObservedAgentChips,
  ObservedIssue,
  ObservedIssues,
  ObservedPageFacts,
  TickedClock,
} from './message.js'
import { EntityPage, IssueDetail, type Model } from './model.js'
import { issuesScreen } from './program.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-01T17:00:00Z')
const STARTED_AT_MS = Date.parse('2026-11-01T14:00:00Z')
const ENDED_AT_MS = Date.parse('2026-11-01T15:27:00Z')
const HANDLE = 'claude-code/issues-linear-1538@cedar'
const OLD_HANDLE = 'claude-code/issues-linear-1538@al'
const RUN_ID = '83c82131-c571-535a-8f96-82bbe89b65ba'
const RESUMED_RUN_ID = '1c7906f1-a4b7-515b-8d4d-5c175d9e07c3'
const SESSION_ID = '2914b977-312b-4d93-a41c-4681d1255fe1'
const TRANSCRIPT = `/Users/laptop/.claude/projects/-Users-laptop-Sync-worktrees-foldkit-issues-linear-1538/${SESSION_ID}.jsonl`
const REMOTE_URL = 'https://claude.ai/code/session_016zSfVXXKGBhPLNYEDNGsK5'
const COMMIT_SHA = 'a020bb4735690e424fba8421749bdf32eb0c3c33'

const storedSession = {
  account: 'al',
  agentID: OLD_HANDLE,
  configDir: '/Users/laptop/.claude-al',
  effort: 'max',
  endedAtMs: ENDED_AT_MS,
  entrypoint: 'sdk-cli',
  harness: 'claude-code',
  hostSessionID: SESSION_ID,
  id: '3a0596db-a633-5508-9079-6673f1305d16',
  model: 'claude-opus-5-5',
  remoteURL: REMOTE_URL,
  startedAtMs: STARTED_AT_MS,
  title: 'An issues site as good as Linear',
  transcriptPath: TRANSCRIPT,
}

const storedFinding = {
  agentID: OLD_HANDLE,
  deepLink: 'https://issues.pisspoursoftware.xyz/issues/1538#work-1538-1',
  id: '1adc23b2-451d-5dd5-9cf9-3b79405661fe',
  issueNumber: 1538,
  kind: 'environment',
  occurredAtMs: STARTED_AT_MS,
  quote: 'claude/al stopped (quota: exit 1) at 12:33',
  sessionID: SESSION_ID,
  source: 'agentRunStop',
  status: 'open',
}

const storedChild = {
  agentID: `${HANDLE}/general-purpose-a3aa9d1e`,
  harness: 'claude-code',
  id: '7cd65b70-4623-5434-b521-e357c9af4141',
  kind: 'subagent',
  model: 'claude-opus-5-5',
  name: 'issues-linear-1538:a3aa9d1e',
  startedAtMs: STARTED_AT_MS,
  status: 'done',
}

const storedRun = {
  account: 'cedar',
  agentID: HANDLE,
  askedIn: 'Recording 272 #48',
  branch: 'agent/claude/issues-linear-1538',
  briefPath: '/Users/laptop/Scribe/agents/headless/issues-linear-1538.brief.md',
  children: [storedChild],
  effort: 'max',
  endedAtMs: ENDED_AT_MS,
  endedReason: 'it died mid-work: no runner, no exit file',
  exitCode: 143,
  findings: [storedFinding],
  harness: 'claude-code',
  host: 'laptop',
  id: RUN_ID,
  issueNumber: 1538,
  issueNumbersJSON: '[1538,41]',
  kind: 'headless',
  logPath: '/Users/laptop/Scribe/agents/headless/issues-linear-1538.log',
  model: 'claude-opus-5-5',
  name: 'issues-linear-1538',
  resumesRunID: RESUMED_RUN_ID,
  sessionID: SESSION_ID,
  sessions: [storedSession],
  startedAtMs: STARTED_AT_MS,
  startedBy: 'claude-code',
  status: 'stopped',
  task: '# issues-linear-1538: an issues site as good as Linear',
  tmux: 'scribe-agents:agent-issues-linear-1538',
  worktree: '/Users/laptop/Sync/worktrees/foldkit-issues-linear-1538',
}

const storedResumed = {
  agentID: 'claude-code/issues-linear-1538@birch',
  harness: 'claude-code',
  id: RESUMED_RUN_ID,
  name: 'issues-linear-1538',
  startedAtMs: STARTED_AT_MS - 7_200_000,
  status: 'stopped',
}

const facts = agentFactsOf({ agentRuns: [storedResumed, storedRun] })

const blank = (id: string, title: string): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: STARTED_AT_MS,
    details: '',
    evidenceLogQueries: [],
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'InProgress',
    successCriteria: [],
    title,
    updatedAtMs: STARTED_AT_MS,
    viewerURL: Option.none(),
    workLog: [],
  })

const entry = (
  id: string,
  agentId: string,
  summary: string,
  commitSha: Option.Option<string>,
): IssueWorkLogEntry =>
  IssueWorkLogEntry.make({
    agentId: Option.some(agentId),
    commitSha,
    durationSeconds: Option.none(),
    id,
    occurredAtMs: STARTED_AT_MS,
    state: Option.some('progress'),
    summary,
  })

const catalog: ReadonlyArray<Issue> = [
  Issue.make({
    ...blank('1538', 'An issues site as good as Linear'),
    workLog: [
      entry(
        'work-1538-1',
        OLD_HANDLE,
        'Green: the list reads from the URL.',
        Option.some(COMMIT_SHA),
      ),
      entry(
        'work-1538-2',
        'claude-code/someone-else@ld',
        'Unrelated, at 852f55fe95ec2790e5728c3391743b79bacecb7e.',
        Option.none(),
      ),
    ],
  }),
  blank('041', 'Old defect'),
]

const pageOf = (entity: AgentEntity, pageFacts: PageFacts): Model =>
  [
    ObservedIssues.make({ issues: catalog }),
    TickedClock.make({ nowMs: NOW_MS, offsetMinutes: -300 }),
    ObservedPageFacts.make({ entity, facts: pageFacts }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(EntityPage.make({ entity })),
  )

type AgentEntity = typeof AgentEntity.Type

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const chipsOf = (model: Model): ReadonlyArray<ReferencePart> =>
  Array.flatMap(textsOf(issuesScreen(model)), text =>
    Array.filter(
      text.parts ?? [],
      (part): part is ReferencePart => part._tag === 'Reference',
    ),
  )

const page = pageOf(AgentEntity.make({ agentId: HANDLE }), facts)

describe('a handle', () => {
  it('names a run by its last path part, without its account', () => {
    expect(agentNameOfHandle(OLD_HANDLE)).toBe('issues-linear-1538')
    expect(agentNameOfHandle('grok-mac-skinny-window')).toBe(
      'grok-mac-skinny-window',
    )
    expect(agentNameOfHandle(`${HANDLE}/Explore-afb857fb`)).toBe(
      'Explore-afb857fb',
    )
  })

  it('names its harness when it has one', () => {
    expect(harnessOfHandle(OLD_HANDLE)).toEqual(Option.some('claude-code'))
    expect(harnessOfHandle('tools/agent-run')).toEqual(Option.none())
    expect(harnessOfHandle('grok-mac-skinny-window')).toEqual(Option.none())
  })
})

describe('an agent’s page reads one handle’s runs by indexed fields', () => {
  it('asks for the agent id and the name, with each run’s links', () => {
    const { $, ...links } = agentFactsQuery(OLD_HANDLE).agentRuns
    expect($.where).toEqual({
      or: [{ agentID: OLD_HANDLE }, { name: 'issues-linear-1538' }],
    })
    expect(Object.keys(links).sort()).toEqual([
      'children',
      'findings',
      'parent',
      'sessions',
    ])
  })

  it('asks a session by the harness’s own id', () => {
    expect(sessionFactsQuery(SESSION_ID).agentSessions.$.where).toEqual({
      hostSessionID: SESSION_ID,
    })
  })

  it('reads the eight characters text gives by a range on the same index', () => {
    expect(sessionFactsQuery('2914b977').agentSessions.$.where).toEqual({
      and: [
        { hostSessionID: { $gte: '2914b977' } },
        { hostSessionID: { $lte: '2914b977g' } },
      ],
    })
  })
})

describe('an agent’s page, from Scribe’s rows', () => {
  it('routes a handle and a session to their pages', () => {
    expect(
      navigationToPath(
        EntityPage.make({ entity: AgentEntity.make({ agentId: HANDLE }) }),
      ),
    ).toBe(`/agents/${encodeURIComponent(HANDLE)}`)
    expect(pathToNavigation(`/sessions/${SESSION_ID}`)).toEqual(
      EntityPage.make({
        entity: SessionEntity.make({ sessionId: SESSION_ID }),
      }),
    )
  })

  it('says how it ran: harness, account, model, effort, status and exit', () => {
    const contents = contentsOf(page)
    expect(contents).toContainEqual(expect.stringContaining('claude-code'))
    expect(contents).toContainEqual(expect.stringContaining('cedar'))
    expect(contents).toContainEqual(expect.stringContaining('claude-opus-5-5'))
    expect(contents).toContainEqual(expect.stringContaining('max'))
    expect(contents).toContainEqual(expect.stringContaining('stopped'))
    expect(contents).toContainEqual(expect.stringContaining('exit 143'))
    expect(contents).toContainEqual(
      expect.stringContaining('it died mid-work: no runner, no exit file'),
    )
  })

  it('says when it started and ended, how long ago, and how long it ran', () => {
    const contents = contentsOf(page)
    expect(contents).toContainEqual(
      expect.stringContaining('Started 2026-11-01 09:00 (3 h ago)'),
    )
    expect(contents).toContainEqual(
      expect.stringContaining('ended 2026-11-01 10:27 (1 h ago)'),
    )
    expect(contents).toContainEqual(expect.stringContaining('ran 1 h 27 min'))
  })

  it('says a run with no end is still going', () => {
    const running = pageOf(
      AgentEntity.make({ agentId: HANDLE }),
      agentFactsOf({
        agentRuns: [
          { ...storedRun, endedAtMs: null, exitCode: null, status: 'running' },
        ],
      }),
    )
    expect(contentsOf(running)).toContainEqual(
      expect.stringContaining('running for 3 h'),
    )
  })

  it('names its worktree, branch, brief and log in full, to copy', () => {
    const contents = contentsOf(page)
    expect(contents).toContain(storedRun.worktree)
    expect(contents).toContain(storedRun.branch)
    expect(contents).toContain(storedRun.briefPath)
    expect(contents).toContain(storedRun.logPath)
  })

  it('lists its sessions: the id’s page, the claude.ai link, the transcript', () => {
    const chips = chipsOf(page)
    expect(
      chips.some(
        chip =>
          chip.kind === 'Session' &&
          chip.label === SESSION_ID.slice(0, 8) &&
          chip.href === `/sessions/${SESSION_ID}`,
      ),
    ).toBe(true)
    expect(
      chips.some(chip => chip.kind === 'Session' && chip.href === REMOTE_URL),
    ).toBe(true)
    expect(contentsOf(page)).toContain(TRANSCRIPT)
  })

  it('links what it resumes, and what resumed it from the older run', () => {
    expect(
      chipsOf(page).some(
        chip =>
          chip.kind === 'Agent' &&
          chip.href === `/agents/${encodeURIComponent(storedResumed.agentID)}`,
      ),
    ).toBe(true)
    expect(contentsOf(page)).toContainEqual(expect.stringContaining('Resumes'))
    expect(contentsOf(page)).toContainEqual(
      expect.stringContaining('Resumed by'),
    )
  })

  it('lists its sub-agents as chips with their state and harness', () => {
    expect(
      chipsOf(page).some(
        chip =>
          chip.kind === 'Agent' &&
          chip.state === 'done' &&
          chip.title === 'claude-code' &&
          chip.href === `/agents/${encodeURIComponent(storedChild.agentID)}`,
      ),
    ).toBe(true)
  })

  it('lists the Issues it touched, with their titles', () => {
    const contents = contentsOf(page)
    expect(contents).toContainEqual(
      expect.stringContaining('#1538 An issues site as good as Linear'),
    )
    expect(contents).toContainEqual(expect.stringContaining('#041 Old defect'))
  })

  it('lists the commits its handles logged, every account’s, and no one else’s', () => {
    const chips = chipsOf(page)
    expect(
      chips.some(
        chip =>
          chip.kind === 'Commit' && chip.href === `/commits/${COMMIT_SHA}`,
      ),
    ).toBe(true)
    expect(
      chips.some(chip => chip.href?.startsWith('/commits/852f55fe9')),
    ).toBe(false)
  })

  it('lists the findings it reported, with their words and kind', () => {
    const contents = contentsOf(page)
    expect(contents).toContainEqual(
      expect.stringContaining('claude/al stopped (quota: exit 1) at 12:33'),
    )
    expect(contents).toContainEqual(expect.stringContaining('environment'))
  })

  it('lists every run the handle names, the newest first', () => {
    expect(Array.map(facts.runs, ({ run }) => run.runId)).toEqual([
      RUN_ID,
      RESUMED_RUN_ID,
    ])
  })

  it('says when Scribe’s rows hold no such agent, and keeps what text says', () => {
    const missing = pageOf(
      AgentEntity.make({ agentId: 'tools/agent-run' }),
      NoPageFacts.make({}),
    )
    expect(contentsOf(missing)).toContain('Scribe’s rows hold no such agent.')
    expect(contentsOf(missing)).toContainEqual(
      expect.stringContaining('No Issue points here yet.'),
    )
  })
})

describe('a session’s page, from Scribe’s rows', () => {
  it('shows the session and links its run', () => {
    const entity = SessionEntity.make({ sessionId: SESSION_ID })
    const maybeFacts = sessionFactsOf({
      agentSessions: [{ ...storedSession, run: [storedChild] }],
    })
    const model = [
      TickedClock.make({ nowMs: NOW_MS, offsetMinutes: -300 }),
      ObservedIssues.make({ issues: catalog }),
      ObservedPageFacts.make({
        entity,
        facts: Option.getOrThrow(maybeFacts),
      }),
    ].reduce(
      (current, message) => update(current, message)[0],
      modelForNavigation(EntityPage.make({ entity })),
    )
    const contents = contentsOf(model)
    expect(contents).toContainEqual(expect.stringContaining(SESSION_ID))
    expect(contents).toContain(TRANSCRIPT)
    expect(
      chipsOf(model).some(
        chip =>
          chip.kind === 'Agent' &&
          chip.href === `/agents/${encodeURIComponent(storedChild.agentID)}`,
      ),
    ).toBe(true)
  })

  it('reads no row as none', () => {
    expect(sessionFactsOf({ agentSessions: [] })).toEqual(Option.none())
  })
})

describe('an agent’s chip anywhere', () => {
  const issuePage = (runs: ReadonlyArray<unknown>): Model =>
    [
      TickedClock.make({ nowMs: NOW_MS, offsetMinutes: -300 }),
      ObservedIssues.make({ issues: catalog }),
      ObservedIssue.make({
        issue: Array.head(catalog),
        issueId: '1538',
      }),
      ObservedAgentChips.make({ runs: agentChipsOf({ agentRuns: runs }) }),
    ].reduce(
      (current, message) => update(current, message)[0],
      modelForNavigation(IssueDetail.make({ issueId: '1538' })),
    )

  it('shows the state and harness of the run its handle names', () => {
    const chip = Array.findFirst(
      chipsOf(issuePage([{ ...storedRun, status: 'running' }])),
      part => part.kind === 'Agent' && part.detail?.[0] === OLD_HANDLE,
    )
    expect(Option.map(chip, part => part.state)).toEqual(Option.some('running'))
    expect(Option.map(chip, part => part.title)).toEqual(
      Option.some('claude-code'),
    )
  })

  it('shows its harness from the handle before any row is read', () => {
    const chip = Array.findFirst(
      chipsOf(issuePage([])),
      part => part.kind === 'Agent' && part.detail?.[0] === OLD_HANDLE,
    )
    expect(Option.map(chip, part => part.title)).toEqual(
      Option.some('claude-code'),
    )
  })

  it('asks only for the handles and names a page holds', () => {
    expect(agentChipsQuery([OLD_HANDLE, HANDLE]).agentRuns.$.where).toEqual({
      or: [
        { agentID: { $in: [OLD_HANDLE, HANDLE] } },
        { name: { $in: ['issues-linear-1538'] } },
      ],
    })
  })
})

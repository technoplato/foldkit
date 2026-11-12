import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  agentChatLink,
  agentRunAskedForLinksFromMs,
  issueAgentsOf,
  issueAgentsQuery,
  recordingAgentsOf,
  recordingIssuesOf,
  recordingIssuesQuery,
} from './issueAgents.js'

const ASKED_MS = Date.parse('2026-11-12T12:39:50Z')
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const RECORDING = 'b619ec79-8d48-474e-8dc3-7d7d4862b48a'

const storedRun = (id: string, fields: object = {}) => ({
  id,
  agentID: `claude-code/${id}@max`,
  harness: 'claude-code',
  issueNumber: 2303,
  kind: 'headless',
  name: id,
  status: 'done',
  startedAtMs: ASKED_MS + HOUR_MS,
  ...fields,
})

const storedSession = (hostSessionID: string, fields: object = {}) => ({
  hostSessionID,
  account: 'max',
  startedAtMs: ASKED_MS + HOUR_MS,
  ...fields,
})

const agentsOfOneIssue = (rows: ReadonlyArray<object>) =>
  Option.getOrThrow(Array.head(issueAgentsOf([2303], { agentRuns: rows })))
    .agents

describe('issueAgentsQuery', () => {
  it('asks for every run started for the Issues, newest first, with its sessions, its subagents that name no Issue of their own, and its parent', () => {
    expect(issueAgentsQuery([2303])).toEqual({
      agentRuns: {
        $: {
          where: { issueNumber: { $in: [2303] } },
          order: { startedAtMs: 'desc' },
          fields: [
            'name',
            'agentID',
            'harness',
            'account',
            'kind',
            'status',
            'startedAtMs',
            'endedAtMs',
            'remoteURL',
            'issueNumber',
          ],
        },
        sessions: {
          $: {
            order: { startedAtMs: 'desc' },
            fields: [
              'hostSessionID',
              'account',
              'remoteURL',
              'startedAtMs',
              'endedAtMs',
            ],
          },
        },
        children: {
          $: {
            where: { kind: 'subagent', issueNumber: { $isNull: true } },
            order: { startedAtMs: 'desc' },
            fields: [
              'name',
              'agentID',
              'account',
              'status',
              'startedAtMs',
              'endedAtMs',
              'task',
            ],
          },
        },
        parent: { $: { fields: ['name'] } },
      },
    })
  })

  it('asks for several Issues at once, as a recording does', () => {
    expect(issueAgentsQuery([1652, 2077]).agentRuns.$.where).toEqual({
      issueNumber: { $in: [1652, 2077] },
    })
  })
})

describe('agentRunAskedForLinksFromMs', () => {
  it('is when tools/agent-run began asking Claude Code for each run’s link', () => {
    expect(agentRunAskedForLinksFromMs).toBe(ASKED_MS)
  })
})

describe('agentChatLink', () => {
  it('opens a run’s chat in the app by its name', () => {
    expect(agentChatLink('issue-agents-2303')).toEqual(
      Option.some('scribe-shared://agent/issue-agents-2303'),
    )
  })

  it('has none for a name the app’s link would refuse', () => {
    expect(agentChatLink('issue-agents-2303:ab73110a')).toEqual(Option.none())
    expect(agentChatLink('claude-code/issue-agents-2303@max')).toEqual(
      Option.none(),
    )
    expect(agentChatLink('')).toEqual(Option.none())
  })
})

describe('issueAgentsOf', () => {
  it('lists an Issue’s runs newest first, each with its link, account, state, times and chat', () => {
    const agents = agentsOfOneIssue([
      storedRun('older-run', {
        account: 'al',
        remoteURL: 'https://claude.ai/code/session_EXAMPLE_OLDER',
        startedAtMs: ASKED_MS + HOUR_MS,
        endedAtMs: ASKED_MS + 2 * HOUR_MS,
        status: 'done',
      }),
      storedRun('newer-run', {
        account: 'max',
        remoteURL: 'https://claude.ai/code/session_EXAMPLE_NEWER',
        startedAtMs: ASKED_MS + 3 * HOUR_MS,
        status: 'running',
      }),
    ])
    expect(Array.map(agents, agent => agent.name)).toEqual([
      'newer-run',
      'older-run',
    ])
    const [newer] = agents
    expect(newer).toMatchObject({
      handle: 'claude-code/newer-run@max',
      harness: 'claude-code',
      state: 'running',
    })
    expect(newer?.maybeAccount).toEqual(Option.some('max'))
    expect(newer?.maybeStartedAtMs).toEqual(Option.some(ASKED_MS + 3 * HOUR_MS))
    expect(newer?.maybeEndedAtMs).toEqual(Option.none())
    expect(newer?.link).toEqual({
      _tag: 'ClaudeLink',
      url: 'https://claude.ai/code/session_EXAMPLE_NEWER',
    })
    expect(newer?.maybeChatLink).toEqual(
      Option.some('scribe-shared://agent/newer-run'),
    )
  })

  it('reads an interactive session’s link from its own session row', () => {
    const [agent] = agentsOfOneIssue([
      storedRun('6e895020', {
        agentID: 'claude-code/6e895020@al',
        kind: 'interactive',
        status: 'running',
        sessions: [
          storedSession('6e895020-0000-4000-8000-000000000001', {
            remoteURL: 'https://claude.ai/code/session_EXAMPLE_CHAT',
          }),
        ],
      }),
    ])
    expect(agent?.link).toEqual({
      _tag: 'ClaudeLink',
      url: 'https://claude.ai/code/session_EXAMPLE_CHAT',
    })
  })

  it('says why a run has no link, from the run’s own row', () => {
    const whys = Array.map(
      agentsOfOneIssue([
        storedRun('before-links', {
          startedAtMs: ASKED_MS - MINUTE_MS,
          status: 'stopped',
        }),
        storedRun('after-links', { startedAtMs: ASKED_MS + MINUTE_MS }),
        storedRun('a-pi-run', {
          harness: 'pi',
          startedAtMs: ASKED_MS + 2 * MINUTE_MS,
        }),
        storedRun('a-chat', {
          kind: 'interactive',
          startedAtMs: ASKED_MS + 3 * MINUTE_MS,
        }),
      ]),
      agent => [agent.name, agent.link],
    )
    expect(whys).toEqual([
      [
        'a-chat',
        { _tag: 'NoClaudeLink', why: 'this session has no Remote Control' },
      ],
      [
        'a-pi-run',
        { _tag: 'NoClaudeLink', why: 'a pi run has no claude.ai link' },
      ],
      [
        'after-links',
        { _tag: 'NoClaudeLink', why: 'no claude.ai link was recorded for it' },
      ],
      [
        'before-links',
        {
          _tag: 'NoClaudeLink',
          why: 'it started before agent-run asked Claude Code for its link',
        },
      ],
    ])
  })

  it('keeps every session of a run on a chain of accounts, newest first', () => {
    const [agent] = agentsOfOneIssue([
      storedRun('agent-chat-2-1652', {
        sessions: [
          storedSession('11111111-0000-4000-8000-000000000001', {
            account: 'al',
            startedAtMs: ASKED_MS - 3 * HOUR_MS,
            endedAtMs: ASKED_MS - 2 * HOUR_MS,
          }),
          storedSession('11111111-0000-4000-8000-000000000002', {
            account: 'ld',
            startedAtMs: ASKED_MS - HOUR_MS,
          }),
        ],
      }),
    ])
    expect(
      Array.map(agent?.sessions ?? [], session => [
        session.id,
        session.maybeAccount,
      ]),
    ).toEqual([
      ['11111111-0000-4000-8000-000000000002', Option.some('ld')],
      ['11111111-0000-4000-8000-000000000001', Option.some('al')],
    ])
  })

  it('shows each subagent under its run, newest first, opening the run’s chat, with what it was asked to do', () => {
    const [agent] = agentsOfOneIssue([
      storedRun('issue-agents-2303', {
        remoteURL: 'https://claude.ai/code/session_EXAMPLE_RUN',
        status: 'running',
        children: [
          {
            id: 'sub-old',
            agentID: 'claude-code/issue-agents-2303@max/Explore-ab73110a',
            name: 'issue-agents-2303:ab73110a',
            status: 'done',
            startedAtMs: ASKED_MS + HOUR_MS + MINUTE_MS,
            endedAtMs: ASKED_MS + HOUR_MS + 20 * MINUTE_MS,
            task: 'Map FoldKit issues site agents',
          },
          {
            id: 'sub-new',
            agentID: 'claude-code/issue-agents-2303@max/Explore-ad13c1a8',
            name: 'issue-agents-2303:ad13c1a8',
            status: 'running',
            startedAtMs: ASKED_MS + HOUR_MS + 2 * MINUTE_MS,
          },
        ],
      }),
    ])
    const subagents = agent?.subagents ?? []
    expect(Array.map(subagents, subagent => subagent.name)).toEqual([
      'issue-agents-2303:ad13c1a8',
      'issue-agents-2303:ab73110a',
    ])
    expect(subagents[1]).toMatchObject({
      handle: 'claude-code/issue-agents-2303@max/Explore-ab73110a',
      state: 'done',
      link: {
        _tag: 'NoClaudeLink',
        why: 'it runs inside issue-agents-2303’s session',
      },
    })
    expect(subagents[1]?.maybeTask).toEqual(
      Option.some('Map FoldKit issues site agents'),
    )
    expect(subagents[1]?.maybeChatLink).toEqual(
      Option.some('scribe-shared://agent/issue-agents-2303'),
    )
  })

  it('lists a subagent started for an Issue of its own on that Issue, naming its parent', () => {
    const [agent] = agentsOfOneIssue([
      storedRun('xcode-plugin-2078', {
        agentID: 'claude-code/claude-code-3@max/opus-max-a085bdf6',
        kind: 'subagent',
        parent: [{ id: 'the-listener', name: 'claude-code-3' }],
      }),
    ])
    expect(agent?.maybeParentName).toEqual(Option.some('claude-code-3'))
    expect(agent?.link).toEqual({
      _tag: 'NoClaudeLink',
      why: 'it runs inside claude-code-3’s session',
    })
    expect(agent?.maybeChatLink).toEqual(
      Option.some('scribe-shared://agent/claude-code-3'),
    )
  })

  it('leaves a tracker name with no run behind it out', () => {
    expect(
      agentsOfOneIssue([
        storedRun('a-claimant', { harness: 'grok', kind: 'claimant' }),
      ]),
    ).toEqual([])
  })

  it('answers each Issue asked for, in the order asked, an Issue with no run included', () => {
    const issues = issueAgentsOf([2077, 1652, 2062], {
      agentRuns: [
        storedRun('chat-markdown-2075', { issueNumber: 1652 }),
        storedRun('glass-2077', { issueNumber: 2077 }),
      ],
    })
    expect(
      Array.map(issues, ({ agents, issueNumber }) => [
        issueNumber,
        Array.map(agents, agent => agent.name),
      ]),
    ).toEqual([
      [2077, ['glass-2077']],
      [1652, ['chat-markdown-2075']],
      [2062, []],
    ])
  })
})

describe('recordingIssuesQuery', () => {
  it('asks for a recording’s mentions by its id as the rows hold it, each with its Issue and its recording', () => {
    expect(recordingIssuesQuery(RECORDING.toUpperCase())).toEqual({
      issueMentions: {
        $: {
          where: { recordingID: RECORDING },
          fields: ['id', 'capturedAtMs'],
        },
        issue: { $: { fields: ['number', 'title', 'status'] } },
        recording: { $: { fields: ['id', 'title', 'startedAtMs'] } },
      },
    })
  })
})

describe('recordingIssuesOf', () => {
  const mention = (id: string, issue: number, capturedAtMs: number) => ({
    id,
    capturedAtMs,
    issue: [
      { number: issue, title: `Issue ${issue.toString()}`, status: 'Open' },
    ],
    recording: [
      { id: RECORDING, title: 'Recording 398 — Nov 8, 2026', startedAtMs: 1 },
    ],
  })

  it('lists the Issues his lines in a recording mention, in the order he first said them, each with how many times', () => {
    const issues = recordingIssuesOf(RECORDING, {
      issueMentions: [
        mention('m3', 2077, 3_000),
        mention('m1', 1652, 1_000),
        mention('m2', 2077, 2_000),
      ],
    })
    expect(issues.recordingId).toBe(RECORDING)
    expect(issues.maybeTitle).toEqual(
      Option.some('Recording 398 — Nov 8, 2026'),
    )
    expect(issues.mentionCount).toBe(3)
    expect(
      Array.map(issues.issues, issue => [issue.number, issue.mentionCount]),
    ).toEqual([
      [1652, 1],
      [2077, 2],
    ])
  })

  it('reads a link answered as one row the same as a list of one, and a recording that is not a row has no title', () => {
    const issues = recordingIssuesOf(RECORDING, {
      issueMentions: [
        {
          id: 'm1',
          capturedAtMs: 1_000,
          issue: { number: 1652, title: 'Issue 1652', status: 'Open' },
        },
      ],
    })
    expect(issues.maybeTitle).toEqual(Option.none())
    expect(Array.map(issues.issues, issue => issue.number)).toEqual([1652])
  })
})

describe('recordingAgentsOf', () => {
  it('puts each Issue’s agents under it, an Issue with none kept', () => {
    const recording = recordingIssuesOf(RECORDING, {
      issueMentions: [
        {
          id: 'm1',
          capturedAtMs: 1_000,
          issue: [{ number: 1652, title: 'Agent chat', status: 'Open' }],
        },
        {
          id: 'm2',
          capturedAtMs: 2_000,
          issue: [{ number: 2062, title: 'Nobody yet', status: 'Open' }],
        },
      ],
    })
    const agents = issueAgentsOf([1652, 2062], {
      agentRuns: [storedRun('agent-chat-land-1652', { issueNumber: 1652 })],
    })
    expect(
      Array.map(recordingAgentsOf(recording, agents), ({ agents, issue }) => [
        issue.number,
        Array.map(agents, agent => agent.name),
      ]),
    ).toEqual([
      [1652, ['agent-chat-land-1652']],
      [2062, []],
    ])
  })
})

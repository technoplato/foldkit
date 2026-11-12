import { Duration, Effect } from 'effect'
import { issueAgentsOf, recordingIssuesOf } from 'issues-core-example'
import { describe, expect, it } from 'vitest'

import {
  FoundIssueAgents,
  FoundRecordingIssues,
  UnavailableIssueAgents,
  UnavailableRecordingIssues,
  issueAgentsJson,
  issueAgentsSection,
  readIssueAgents,
  readRecordingIssues,
  recordingAgentsJson,
  recordingAgentsLines,
} from './agents.js'

const ASKED_MS = Date.parse('2026-11-12T12:39:50Z')
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const TIME_ZONE = 'America/New_York'
const RECORDING = 'b619ec79-8d48-474e-8dc3-7d7d4862b48a'

const run = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect)

const storedRuns = [
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
    sessions: [
      {
        hostSessionID: '22222222-0000-4000-8000-000000000001',
        account: 'max',
        startedAtMs: ASKED_MS + 107 * MINUTE_MS,
      },
    ],
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
]

const found = FoundIssueAgents.make({
  issues: issueAgentsOf([2303], { agentRuns: storedRuns }),
})

describe('readIssueAgents', () => {
  it('asks Scribe the one query for the Issues’ agents and reads its rows', async () => {
    const asked: Array<unknown> = []
    const read = await run(
      readIssueAgents(
        query => {
          asked.push(query)
          return Promise.resolve({ agentRuns: storedRuns })
        },
        [2303],
      ),
    )
    expect(asked).toHaveLength(1)
    expect(read._tag).toBe('FoundIssueAgents')
  })

  it('says why when Scribe does not answer within its bound, refuses, or answers rows it cannot read', async () => {
    const silent = await run(
      readIssueAgents(
        () => new Promise(() => {}),
        [2303],
        Duration.millis(20),
      ),
    )
    const refused = await run(
      readIssueAgents(() => Promise.reject(new Error('Permission denied')), [
        2303,
      ]),
    )
    const unreadable = await run(
      readIssueAgents(() => Promise.resolve({ agentRuns: [{ id: 1 }] }), [
        2303,
      ]),
    )
    expect(silent).toEqual(
      UnavailableIssueAgents.make({
        reason: "Scribe's Instant app did not answer within 0.02 seconds.",
      }),
    )
    expect(refused._tag).toBe('UnavailableIssueAgents')
    expect(
      refused._tag === 'UnavailableIssueAgents' ? refused.reason : '',
    ).toContain('Permission denied')
    expect(unreadable).toEqual(
      UnavailableIssueAgents.make({
        reason:
          "Scribe's Instant app answered with rows this command cannot read.",
      }),
    )
  })

  it('sends nothing for no Issue', async () => {
    const read = await run(
      readIssueAgents(() => Promise.reject(new Error('sent')), []),
    )
    expect(read).toEqual(FoundIssueAgents.make({ issues: [] }))
  })
})

describe('issueAgentsSection', () => {
  it('lists each agent started for the Issue, newest first: its state and times, harness, account, handle, Claude link or why none, chat, and its subagents', () => {
    expect(issueAgentsSection(found, 2303, TIME_ZONE)).toEqual([
      '',
      "Agents (2 started for this Issue, newest first, from Scribe's rows)",
      '  issue-agents-2303  ·  running, started 11-12 09:26  ·  claude-code  ·  account max',
      '    claude-code/issue-agents-2303@max',
      '    Claude: https://claude.ai/code/session_EXAMPLE_RUN',
      '    Chat: scribe-shared://agent/issue-agents-2303',
      '    Subagents (1):',
      '      issue-agents-2303:ab73110a  ·  done, 11-12 09:27 to 11-12 09:40 (13 min)  ·  Map FoldKit issues site agents',
      '  older-run  ·  done, 11-12 08:39 to 11-12 09:39 (60 min)  ·  claude-code  ·  account al',
      '    claude-code/older-run@al',
      '    No Claude link: no claude.ai link was recorded for it',
      '    Chat: scribe-shared://agent/older-run',
    ])
  })

  it('lists every session of a run that has more than one, newest first', () => {
    const chained = FoundIssueAgents.make({
      issues: issueAgentsOf([1652], {
        agentRuns: [
          {
            id: 'agent-chat-2-1652',
            agentID: 'claude-code/agent-chat-2-1652@ld',
            account: 'ld',
            harness: 'claude-code',
            issueNumber: 1652,
            kind: 'headless',
            name: 'agent-chat-2-1652',
            status: 'stopped',
            startedAtMs: ASKED_MS - 3 * HOUR_MS,
            sessions: [
              {
                hostSessionID: '33333333-0000-4000-8000-000000000001',
                account: 'al',
                startedAtMs: ASKED_MS - 3 * HOUR_MS,
              },
              {
                hostSessionID: '33333333-0000-4000-8000-000000000002',
                account: 'ld',
                startedAtMs: ASKED_MS - HOUR_MS,
              },
            ],
          },
        ],
      }),
    })
    expect(issueAgentsSection(chained, 1652, TIME_ZONE)).toEqual([
      '',
      "Agents (1 started for this Issue, newest first, from Scribe's rows)",
      '  agent-chat-2-1652  ·  stopped, started 11-12 04:39  ·  claude-code  ·  account ld',
      '    claude-code/agent-chat-2-1652@ld',
      '    No Claude link: it started before agent-run asked Claude Code for its link',
      '    Chat: scribe-shared://agent/agent-chat-2-1652',
      '    Sessions (2, newest first):',
      '      33333333-0000-4000-8000-000000000002  ·  account ld  ·  started 11-12 06:39',
      '      33333333-0000-4000-8000-000000000001  ·  account al  ·  started 11-12 04:39',
    ])
  })

  it('says so when no agent was started for the Issue, and why when the rows cannot be read', () => {
    expect(
      issueAgentsSection(
        FoundIssueAgents.make({ issues: issueAgentsOf([2062], { agentRuns: [] }) }),
        2062,
        TIME_ZONE,
      ),
    ).toEqual(['', "Agents: none started for this Issue in Scribe's rows"])
    expect(
      issueAgentsSection(
        UnavailableIssueAgents.make({ reason: 'no answer.' }),
        2303,
        TIME_ZONE,
      ),
    ).toEqual(['', 'Agents not shown: no answer.'])
  })
})

describe('issueAgentsJson', () => {
  it('gives the agents with every fact the section prints, or why they could not be read', () => {
    const json = issueAgentsJson(found, 2303)
    expect(json.agents?.[0]).toEqual({
      name: 'issue-agents-2303',
      handle: 'claude-code/issue-agents-2303@max',
      harness: 'claude-code',
      kind: 'headless',
      state: 'running',
      account: 'max',
      startedAtMs: ASKED_MS + 107 * MINUTE_MS,
      claudeLink: 'https://claude.ai/code/session_EXAMPLE_RUN',
      chatLink: 'scribe-shared://agent/issue-agents-2303',
      sessions: [
        {
          id: '22222222-0000-4000-8000-000000000001',
          account: 'max',
          startedAtMs: ASKED_MS + 107 * MINUTE_MS,
        },
      ],
      subagents: [
        {
          name: 'issue-agents-2303:ab73110a',
          handle: 'claude-code/issue-agents-2303@max/Explore-ab73110a',
          state: 'done',
          task: 'Map FoldKit issues site agents',
          startedAtMs: ASKED_MS + 108 * MINUTE_MS,
          endedAtMs: ASKED_MS + 121 * MINUTE_MS,
          noClaudeLinkBecause: 'it runs inside issue-agents-2303’s session',
          chatLink: 'scribe-shared://agent/issue-agents-2303',
        },
      ],
    })
    expect(json.agents?.[1]).toMatchObject({
      name: 'older-run',
      noClaudeLinkBecause: 'no claude.ai link was recorded for it',
    })
    expect(json.agents?.[1]).not.toHaveProperty('claudeLink')
    expect(
      issueAgentsJson(UnavailableIssueAgents.make({ reason: 'no answer.' }), 2303),
    ).toEqual({ agentsNotShown: 'no answer.' })
  })
})

const recordingRows = {
  issueMentions: [
    {
      id: 'm2',
      capturedAtMs: 2_000,
      issue: [{ number: 2062, title: 'Nobody yet', status: 'Open' }],
      recording: [
        { id: RECORDING, title: 'Recording 398 — Nov 8, 2026', startedAtMs: 1 },
      ],
    },
    {
      id: 'm1',
      capturedAtMs: 1_000,
      issue: [{ number: 2303, title: 'Agents on their Issue', status: 'InProgress' }],
      recording: [
        { id: RECORDING, title: 'Recording 398 — Nov 8, 2026', startedAtMs: 1 },
      ],
    },
  ],
}

describe('readRecordingIssues', () => {
  it('asks Scribe for the recording’s mentions by its id as the rows hold it', async () => {
    const asked: Array<unknown> = []
    const read = await run(
      readRecordingIssues(query => {
        asked.push(query)
        return Promise.resolve(recordingRows)
      }, RECORDING.toUpperCase()),
    )
    expect(asked).toEqual([
      {
        issueMentions: {
          $: { where: { recordingID: RECORDING }, fields: ['id', 'capturedAtMs'] },
          issue: { $: { fields: ['number', 'title', 'status'] } },
          recording: { $: { fields: ['id', 'title', 'startedAtMs'] } },
        },
      },
    ])
    expect(read).toEqual(
      FoundRecordingIssues.make({
        recording: recordingIssuesOf(RECORDING, recordingRows),
      }),
    )
  })

  it('says why when Scribe does not answer', async () => {
    expect(
      await run(
        readRecordingIssues(
          () => new Promise(() => {}),
          RECORDING,
          Duration.millis(20),
        ),
      ),
    ).toEqual(
      UnavailableRecordingIssues.make({
        reason: "Scribe's Instant app did not answer within 0.02 seconds.",
      }),
    )
  })
})

describe('recordingAgentsLines', () => {
  const recording = recordingIssuesOf(RECORDING, recordingRows)
  const agents = FoundIssueAgents.make({
    issues: issueAgentsOf([2303, 2062], { agentRuns: storedRuns }),
  })

  it('lists the Issues his lines in the recording mention, in the order he said them, each with its agents', () => {
    expect(recordingAgentsLines(recording, agents, TIME_ZONE)).toEqual([
      `Recording 398 — Nov 8, 2026  ${RECORDING}`,
      "2 mentions of 2 Issues in Scribe's rows; agents started for 1 of them",
      '',
      '#2303  Agents on their Issue  [InProgress]  1 mention',
      '  issue-agents-2303  ·  running, started 11-12 09:26  ·  claude-code  ·  account max',
      '    claude-code/issue-agents-2303@max',
      '    Claude: https://claude.ai/code/session_EXAMPLE_RUN',
      '    Chat: scribe-shared://agent/issue-agents-2303',
      '    Subagents (1):',
      '      issue-agents-2303:ab73110a  ·  done, 11-12 09:27 to 11-12 09:40 (13 min)  ·  Map FoldKit issues site agents',
      '  older-run  ·  done, 11-12 08:39 to 11-12 09:39 (60 min)  ·  claude-code  ·  account al',
      '    claude-code/older-run@al',
      '    No Claude link: no claude.ai link was recorded for it',
      '    Chat: scribe-shared://agent/older-run',
      '',
      '#2062  Nobody yet  [Open]  1 mention',
      '  No agent was started for it.',
    ])
  })

  it('still lists the Issues when their agents cannot be read, and says why', () => {
    const lines = recordingAgentsLines(
      recording,
      UnavailableIssueAgents.make({ reason: 'no answer.' }),
      TIME_ZONE,
    )
    expect(lines).toContain('#2303  Agents on their Issue  [InProgress]  1 mention')
    expect(lines).toContain('Agents not shown: no answer.')
  })
})

describe('recordingAgentsJson', () => {
  it('gives the recording, its mention count, and each Issue with its count and agents', () => {
    const json = recordingAgentsJson(
      recordingIssuesOf(RECORDING, recordingRows),
      FoundIssueAgents.make({
        issues: issueAgentsOf([2303, 2062], { agentRuns: storedRuns }),
      }),
    )
    expect(json).toMatchObject({
      recording: { id: RECORDING, title: 'Recording 398 — Nov 8, 2026' },
      mentionCount: 2,
    })
    expect(
      json.issues.map(issue => [
        issue.number,
        issue.mentionCount,
        issue.agents?.map(agent => agent.name),
      ]),
    ).toEqual([
      [2303, 1, ['issue-agents-2303', 'older-run']],
      [2062, 1, []],
    ])
  })
})

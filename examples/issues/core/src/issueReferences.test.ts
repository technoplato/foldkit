import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  issueReferencesOf,
  issueReferencesQuery,
  recordingPlaceLink,
  recordingTitlesOf,
  referenceRecordingsQuery,
  referencedPlaceCount,
} from './issueReferences.js'

const MINUTE_MS = 60_000
const NAMED_MS = Date.parse('2026-11-13T14:20:00Z')
const RECORDING_428 = 'aa11bb22-0000-4000-8000-000000000428'
const RECORDING_430 = 'cc33dd44-0000-4000-8000-000000000430'
const SESSION_URL = 'https://claude.ai/code/session_01EXAMPLE'
const HOST_SESSION = 'ccfe2d8a-a388-4482-a7f8-78882e599f70'

const row = (id: string, fields: Readonly<Record<string, unknown>>) => ({
  id,
  issueNumber: 2348,
  matchedBy: 'number',
  quote: `quote ${id}`,
  source: 'test',
  ...fields,
})

const line = (
  id: string,
  recordingID: string,
  minutes: number,
  fields: Readonly<Record<string, unknown>> = {},
) =>
  row(id, {
    placeKind: 'line',
    recordingID,
    segmentID: `segment-${id}`,
    startSeconds: 202.144,
    lineIndex: 12,
    authorKind: 'person',
    authorName: 'Michael',
    atMs: NAMED_MS + minutes * MINUTE_MS,
    ...fields,
  })

const sessionRow = (
  id: string,
  minutes: number,
  fields: Readonly<Record<string, unknown>> = {},
) =>
  row(id, {
    placeKind: 'session',
    source: 'agentMessage',
    role: 'named',
    atMs: NAMED_MS + minutes * MINUTE_MS,
    ...fields,
  })

const stored = {
  issueReferences: [
    line('l1', RECORDING_428, 1),
    line('l2', RECORDING_428, 5, { startSeconds: null }),
    row('p1', {
      placeKind: 'threadPost',
      recordingID: RECORDING_428,
      segmentID: 'segment-l1',
      threadID: 'thread-1',
      responseID: 'response-1',
      authorKind: 'agent',
      authorName: 'listener',
      atMs: NAMED_MS + 3 * MINUTE_MS,
    }),
    line('l3', RECORDING_430, 30, { segmentID: null, startSeconds: null }),
    sessionRow('s1', 0, {
      hostSessionID: HOST_SESSION,
      claudeURL: SESSION_URL,
      account: 'pp',
      quote: 'And do we have true epic labels on issues?',
    }),
    sessionRow('s2', 40, {
      hostSessionID: HOST_SESSION,
      agentID: 'claude-code/tracker-epics-2348@pp',
      source: 'workLog',
      role: 'worked',
    }),
    sessionRow('s3', 50, {
      claudeURL: SESSION_URL,
      agentName: 'tracker-epics-2348-foldkit',
      agentID: 'claude-code/tracker-epics-2348-foldkit@pp',
      account: 'pp',
      source: 'workLog',
      role: 'worked',
    }),
    sessionRow('s4', 55, {
      claudeURL: SESSION_URL,
      agentName: 'tracker-epics-2348-foldkit',
      source: 'toolCall',
    }),
    sessionRow('s5', 20, {
      hostSessionID: 'other-host',
      agentID: 'claude-code/listener@max',
      account: 'max',
    }),
    row('x1', { placeKind: 'somewhereElse', atMs: NAMED_MS }),
  ],
}

const titles = recordingTitlesOf({
  recordings: [{ id: RECORDING_428, title: 'Recording 428 — Nov 12, 2026' }],
})

const references = issueReferencesOf(stored, titles)

describe('issueReferencesQuery (Scribe #2348)', () => {
  it('asks for every place that names the Issue, by its number, newest first', () => {
    const query = issueReferencesQuery(2348)
    expect(query.issueReferences.$.where).toEqual({ issueNumber: 2348 })
    expect(query.issueReferences.$.order).toEqual({ atMs: 'desc' })
  })

  it("asks the recordings' titles by their ids", () => {
    expect(referenceRecordingsQuery([RECORDING_428])).toEqual({
      recordings: {
        $: {
          where: { id: { $in: [RECORDING_428] } },
          fields: ['id', 'title'],
        },
      },
    })
  })
})

describe('issueReferencesOf: where an Issue is named in recordings', () => {
  it('groups lines and thread posts by recording, the newest recording first, each place newest first', () => {
    expect(
      references.recordings.map(recording => [
        recording.id,
        Option.getOrNull(recording.maybeTitle),
        recording.places.map(place => [place.id, place.kind]),
      ]),
    ).toEqual([
      [RECORDING_430, null, [['l3', 'Line']]],
      [
        RECORDING_428,
        'Recording 428 — Nov 12, 2026',
        [
          ['l2', 'Line'],
          ['p1', 'ThreadPost'],
          ['l1', 'Line'],
        ],
      ],
    ])
    expect(referencedPlaceCount(references)).toBe(4)
  })

  it('gives each place its deep link, who said it, when, and the quote word for word', () => {
    const recording428 = Option.getOrThrow(
      Array.findFirst(
        references.recordings,
        recording => recording.id === RECORDING_428,
      ),
    )
    const [newest, post, oldest] = recording428.places
    expect(oldest).toMatchObject({
      atMs: NAMED_MS + MINUTE_MS,
      link: `https://og.pisspoursoftware.xyz/recording/${RECORDING_428}/section/segment-l1?t=202.14`,
      quote: 'quote l1',
      maybeAuthorName: Option.some('Michael'),
      maybeAuthorKind: Option.some('person'),
      maybeLineIndex: Option.some(12),
    })
    expect(newest?.link).toBe(
      `https://og.pisspoursoftware.xyz/recording/${RECORDING_428}/section/segment-l2`,
    )
    expect(post).toMatchObject({
      kind: 'ThreadPost',
      maybeAuthorKind: Option.some('agent'),
      maybeThreadId: Option.some('thread-1'),
      maybeResponseId: Option.some('response-1'),
    })
    expect(references.recordings[0]?.places[0]?.link).toBe(
      `https://og.pisspoursoftware.xyz/recording/${RECORDING_430}`,
    )
  })

  it('builds the deep link of a line from its recording, its segment and its time, leaving out what is unknown', () => {
    expect(
      recordingPlaceLink('ABC', Option.some('seg'), Option.some(9.5)),
    ).toBe('https://og.pisspoursoftware.xyz/recording/abc/section/seg?t=9.5')
    expect(recordingPlaceLink('abc', Option.none(), Option.some(9))).toBe(
      'https://og.pisspoursoftware.xyz/recording/abc?t=9',
    )
  })
})

describe('issueReferencesOf: the Claude sessions that name an Issue', () => {
  it('groups a session’s rows into one session, its sub-agents under it, the newest session first', () => {
    expect(references.sessions.map(session => session.key)).toEqual([
      SESSION_URL,
      'other-host',
    ])
    const [mine, listener] = references.sessions
    expect(mine?.link).toEqual({ _tag: 'ClaudeLink', url: SESSION_URL })
    expect(mine?.maybeHostSessionId).toEqual(Option.some(HOST_SESSION))
    expect(mine?.maybeAccount).toEqual(Option.some('pp'))
    expect(
      Option.map(mine?.own ?? Option.none(), own => ({
        agentId: own.maybeAgentId,
        count: own.count,
        firstAtMs: own.firstAtMs,
        firstQuote: own.firstQuote,
        isWorked: own.isWorked,
        lastAtMs: own.lastAtMs,
      })),
    ).toEqual(
      Option.some({
        agentId: Option.some('claude-code/tracker-epics-2348@pp'),
        count: 2,
        firstAtMs: NAMED_MS,
        firstQuote: 'And do we have true epic labels on issues?',
        isWorked: true,
        lastAtMs: NAMED_MS + 40 * MINUTE_MS,
      }),
    )
    expect(
      mine?.subagents.map(subagent => [
        Option.getOrNull(subagent.maybeAgentName),
        Option.getOrNull(subagent.maybeAgentId),
        subagent.count,
        subagent.isWorked,
        subagent.firstAtMs,
        subagent.lastAtMs,
      ]),
    ).toEqual([
      [
        'tracker-epics-2348-foldkit',
        'claude-code/tracker-epics-2348-foldkit@pp',
        2,
        true,
        NAMED_MS + 50 * MINUTE_MS,
        NAMED_MS + 55 * MINUTE_MS,
      ],
    ])
    expect(listener?.link).toEqual({
      _tag: 'NoClaudeLink',
      why: 'no claude.ai link was recorded',
    })
    expect(
      Option.map(listener?.own ?? Option.none(), own => own.isWorked),
    ).toEqual(Option.some(false))
  })

  it('shows a session only its sub-agents named with no rows of its own', () => {
    const onlySubagent = issueReferencesOf({
      issueReferences: [
        sessionRow('s1', 0, {
          claudeURL: SESSION_URL,
          agentName: 'helper',
        }),
      ],
    })
    expect(onlySubagent.sessions).toHaveLength(1)
    expect(onlySubagent.sessions[0]?.own).toEqual(Option.none())
    expect(onlySubagent.sessions[0]?.subagents).toHaveLength(1)
  })

  it('reads no rows as no places and no sessions, and refuses rows it cannot read', () => {
    expect(issueReferencesOf({ issueReferences: [] })).toEqual({
      recordings: [],
      sessions: [],
    })
    expect(() => issueReferencesOf({ issueReferences: [{ id: 1 }] })).toThrow()
  })
})

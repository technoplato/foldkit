import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { issueChildrenOf } from './issueFamily.js'
import { issueReferencesOf } from './issueReferences.js'
import {
  FailedObserveIssueChildren,
  FailedObserveIssueReferences,
  ObservedIssue,
  ObservedIssueChildren,
  ObservedIssueReferences,
  ObservedIssues,
  TickedClock,
} from './message.js'
import { IssueDetail, type Model } from './model.js'
import { issuesScreen } from './program.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-13T16:00:00Z')
const NAMED_MS = Date.parse('2026-11-13T14:20:00Z')
const MINUTE_MS = 60_000
const RECORDING = 'aa11bb22-0000-4000-8000-000000000428'
const SESSION_URL = 'https://claude.ai/code/session_01EXAMPLE'

const issueOf = (
  id: string,
  title: string,
  fields: Partial<typeof Issue.Type> = {},
) =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: NAMED_MS,
    details: '',
    evidenceLogQueries: [],
    id,
    issueType: Option.some('feature'),
    mentions: [],
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title,
    updatedAtMs: NAMED_MS,
    viewerURL: Option.none(),
    workLog: [],
    ...fields,
  })

const epic = issueOf('2347', 'Epic: ready for release', {
  issueType: Option.some('epic'),
})
const child = issueOf('2332', 'QR sign-in', {
  parentIssueId: Option.some('2347'),
  status: 'InProgress',
})

const children = issueChildrenOf({
  issues: [
    { number: 2332, title: 'QR sign-in', status: 'InProgress', priority: 'P1' },
    {
      number: 2333,
      title: 'One scribe command',
      status: 'Closed',
      priority: 'P2',
    },
  ],
})

const references = issueReferencesOf({
  issueReferences: [
    {
      id: 'l1',
      issueNumber: 2347,
      placeKind: 'line',
      matchedBy: 'number',
      quote: 'Is 2347 a true epic?',
      atMs: NAMED_MS,
      recordingID: RECORDING,
      segmentID: 'segment-1',
      startSeconds: 12.5,
      lineIndex: 4,
      authorKind: 'person',
      authorName: 'Michael',
      source: 'test',
    },
    {
      id: 's1',
      issueNumber: 2347,
      placeKind: 'session',
      matchedBy: 'number',
      quote: 'Logged on #2347',
      atMs: NAMED_MS + MINUTE_MS,
      claudeURL: SESSION_URL,
      agentID: 'claude-code/tracker-epics-2348@pp',
      account: 'pp',
      role: 'worked',
      source: 'workLog',
    },
    {
      id: 's2',
      issueNumber: 2347,
      placeKind: 'session',
      matchedBy: 'number',
      quote: 'named #2347 in passing',
      atMs: NAMED_MS + 2 * MINUTE_MS,
      hostSessionID: 'other-host',
      source: 'agentMessage',
    },
  ],
})

const opened = (shown: Issue): Model =>
  [
    TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
    ObservedIssues.make({ issues: [epic, child] }),
    ObservedIssue.make({ issue: Option.some(shown), issueId: shown.id }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(IssueDetail.make({ issueId: shown.id })),
  )

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const referencesOf = (model: Model): ReadonlyArray<ReferencePart> =>
  Array.flatMap(textsOf(issuesScreen(model)), text =>
    Array.filter(
      text.parts ?? [],
      (part): part is ReferencePart => part._tag === 'Reference',
    ),
  )

const epicWithRows = (): Model =>
  [
    ObservedIssueChildren.make({ children, issueId: '2347' }),
    ObservedIssueReferences.make({ issueId: '2347', references }),
  ].reduce((model, message) => update(model, message)[0], opened(epic))

describe('an epic and its children on the Issue page (Scribe #2348)', () => {
  it('shows a child its parent, linked', () => {
    const model = opened(child)
    expect(contentsOf(model)).toContain('Parent')
    expect(
      referencesOf(model).some(
        reference =>
          reference.kind === 'Issue' && reference.href === '/issues/2347',
      ),
    ).toBe(true)
  })

  it('shows an epic its children with their status and how many are done', () => {
    const model = epicWithRows()
    const contents = contentsOf(model)
    expect(contents).toContain('Children: 1 of 2 done')
    expect(contents).toContainEqual(
      expect.stringContaining('InProgress  P1  QR sign-in'),
    )
    expect(contents).toContainEqual(
      expect.stringContaining('Closed  P2  One scribe command'),
    )
    expect(
      contents.findIndex(text => text.includes('QR sign-in')),
    ).toBeLessThan(
      contents.findIndex(text => text.includes('One scribe command')),
    )
    expect(
      referencesOf(model).some(
        reference =>
          reference.kind === 'Issue' && reference.href === '/issues/2333',
      ),
    ).toBe(true)
  })

  it('says why the children are not shown when they cannot be read', () => {
    const [failed] = update(
      opened(epic),
      FailedObserveIssueChildren.make({ issueId: '2347', reason: 'Refused' }),
    )
    expect(contentsOf(failed)).toContainEqual(
      expect.stringContaining('Children not shown: Refused'),
    )
  })

  it('ignores the children of an Issue no longer open', () => {
    const [ignored] = update(
      opened(child),
      ObservedIssueChildren.make({ children, issueId: '2347' }),
    )
    expect(ignored.issueChildren._tag).toBe('NotObservingIssueChildren')
  })
})

describe('where an Issue is named, on its page (Scribe #2348)', () => {
  it('lists each recording line that names it with its deep link and quote', () => {
    const model = epicWithRows()
    expect(contentsOf(model)).toContain(
      'Named in recordings: 1 place in 1 recording',
    )
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('Is 2347 a true epic?'),
    )
    expect(
      referencesOf(model).some(
        reference =>
          reference.href ===
          `https://og.pisspoursoftware.xyz/recording/${RECORDING}/section/segment-1?t=12.5`,
      ),
    ).toBe(true)
  })

  it('lists each session that names it, with its claude.ai link or why it has none', () => {
    const model = epicWithRows()
    expect(contentsOf(model)).toContain('Sessions: 2')
    expect(
      referencesOf(model).some(
        reference =>
          reference.kind === 'Session' && reference.href === SESSION_URL,
      ),
    ).toBe(true)
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('no claude.ai link was recorded'),
    )
    expect(contentsOf(model)).toContainEqual(expect.stringContaining('worked'))
  })

  it('says why they are not shown when they cannot be read', () => {
    const [failed] = update(
      opened(epic),
      FailedObserveIssueReferences.make({ issueId: '2347', reason: 'Refused' }),
    )
    expect(contentsOf(failed)).toContainEqual(
      expect.stringContaining(
        'Named in recordings and sessions not shown: Refused',
      ),
    )
  })
})

import { Array, Option } from 'effect'
import { textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import { askFlowOf } from './askFlow.js'
import { modelForNavigation } from './init.js'
import { ObservedIssues, TickedClock } from './message.js'
import { AskFlow, IssueList, type Model } from './model.js'
import { issuesScreen } from './program.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { update } from './update.js'

const MINUTE_MS = 60_000
const FILED_AT_MS = Date.parse('2026-10-30T12:00:00Z')
const NOW_MS = Date.parse('2026-11-01T14:00:00Z')

const claimedAfter = (id: string, minutes: number): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: FILED_AT_MS,
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
    status: 'Open',
    successCriteria: [],
    title: `Issue ${id}`,
    updatedAtMs: FILED_AT_MS,
    viewerURL: Option.none(),
    workLog: [
      IssueWorkLogEntry.make({
        agentId: Option.none(),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: `work-${id}-claimed`,
        occurredAtMs: FILED_AT_MS + minutes * MINUTE_MS,
        state: Option.some('claimed'),
        summary: `Claimed ${id}.`,
      }),
    ],
  })

const catalog = [
  claimedAfter('100', 1),
  claimedAfter('101', 3),
  claimedAfter('102', 300),
]

const pageOf = (issues: ReadonlyArray<Issue>): Model =>
  [
    ObservedIssues.make({ issues }),
    TickedClock.make({ nowMs: NOW_MS, offsetMinutes: -300 }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(AskFlow.make({})),
  )

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

describe('how long asks take', () => {
  it('reads each step’s median and its slowest asks across the catalog', () => {
    const claimed = Array.findFirst(
      askFlowOf(catalog),
      step => step.name === 'Claimed',
    )
    expect(Option.map(claimed, step => step.count)).toEqual(Option.some(3))
    expect(Option.map(claimed, step => step.medianMs)).toEqual(
      Option.some(3 * MINUTE_MS),
    )
    expect(
      Option.map(claimed, step =>
        Array.map(step.slowest, slow => slow.issueId),
      ),
    ).toEqual(Option.some(['102', '101', '100']))
  })

  it('leaves out a step no Issue reached', () => {
    expect(
      Array.findFirst(askFlowOf(catalog), step => step.name === 'Merged'),
    ).toEqual(Option.none())
  })

  it('reads the same answer for the same Issues', () => {
    expect(askFlowOf(catalog)).toBe(askFlowOf(catalog))
  })

  it('has a page at /asks with each step’s median and its slowest Issue', () => {
    const contents = contentsOf(pageOf(catalog))
    expect(contents).toContain('How long asks take')
    expect(contents).toContainEqual(
      expect.stringMatching(/^Claimed\s+median 3 min\s+3 Issues/),
    )
    expect(contents).toContainEqual(expect.stringContaining('#102 Issue 102'))
    expect(contents).toContainEqual(expect.stringContaining('5 h'))
  })

  it('is one press from the list, and its path round trips', () => {
    expect(navigationToPath(AskFlow.make({}))).toBe('/asks')
    expect(pathToNavigation('/asks')).toEqual(AskFlow.make({}))
    const listed = modelForNavigation(IssueList.make({}))
    expect(
      Array.findFirst(
        textsOf(issuesScreen(listed)),
        text => text.content === 'never',
      ),
    ).toEqual(Option.none())
  })
})

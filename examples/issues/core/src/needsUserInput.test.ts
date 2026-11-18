import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  type IssueStatus,
  IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import { needsUserInputLines, openQuestionsOf } from './needsUserInput.js'

const FILED_MS = Date.parse('2026-11-11T17:00:00Z')
const MINUTE_MS = 60_000

const entry = (
  minutes: number,
  state: string,
  summary: string,
): IssueWorkLogEntry =>
  IssueWorkLogEntry.make({
    agentId: Option.some('claude-code/needs-input-2263@max'),
    commitSha: Option.none(),
    durationSeconds: Option.none(),
    id: `work-2237-${state}-${minutes.toString()}`,
    occurredAtMs: FILED_MS + minutes * MINUTE_MS,
    state: Option.some(state),
    summary,
  })

const issue = (
  status: IssueStatus,
  workLog: ReadonlyArray<IssueWorkLogEntry>,
): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: FILED_MS,
    details: '',
    id: '2237',
    issueType: Option.none(),
    mentions: [],
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status,
    successCriteria: [],
    title: 'The pricing page',
    updatedAtMs: FILED_MS,
    viewerURL: Option.none(),
    workLog,
  })

const PRICE =
  'Is 12 dollars a month the price of the first paid plan?\nOptions: 1. Yes, 12 dollars (recommended: it covers the cost from the first user). 2. 8 dollars.'
const PUBLIC = 'May the pricing page go public?\nOptions: 1. Not yet. 2. Yes.'

describe('an Issue that waits on his answer', () => {
  it('holds each question asked on it, oldest first', () => {
    const waiting = issue('NeedsUserInput', [
      entry(1, 'filed', 'Filed.'),
      entry(5, 'question', PRICE),
      entry(6, 'progress', 'The page is built.'),
      entry(7, 'question', PUBLIC),
    ])

    expect(Array.map(openQuestionsOf(waiting), found => found.summary)).toEqual(
      [PRICE, PUBLIC],
    )
  })

  it('drops the questions asked before his newest answer', () => {
    const waiting = issue('NeedsUserInput', [
      entry(5, 'question', PRICE),
      entry(9, 'answer', 'He typed: 12 dollars.'),
      entry(12, 'question', PUBLIC),
    ])

    expect(Array.map(openQuestionsOf(waiting), found => found.summary)).toEqual(
      [PUBLIC],
    )
  })

  it('holds none once the Issue has left NeedsUserInput', () => {
    expect(
      openQuestionsOf(issue('InProgress', [entry(5, 'question', PRICE)])),
    ).toEqual([])
  })

  it('prints each question whole, with who asked and when, and says so when none is written', () => {
    expect(
      needsUserInputLines(
        issue('NeedsUserInput', [entry(5, 'question', PRICE)]),
      ),
    ).toEqual([
      'Is 12 dollars a month the price of the first paid plan?',
      'Options: 1. Yes, 12 dollars (recommended: it covers the cost from the first user). 2. 8 dollars.',
      'Asked by claude-code/needs-input-2263@max, 2026-11-11T17:05:00.000Z',
    ])
    expect(needsUserInputLines(issue('NeedsUserInput', []))).toEqual([
      'No question is written on this Issue yet: issues log 2237 question "<the question, its options, the recommended one first>"',
    ])
    expect(needsUserInputLines(issue('Open', []))).toEqual([])
  })
})

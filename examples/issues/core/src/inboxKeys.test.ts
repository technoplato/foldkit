import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import {
  DismissedIssueDetail,
  MovedRowCursor,
  ObservedIssues,
  OpenedRowUnderCursor,
} from './message.js'
import { type Model } from './model.js'
import { pathToNavigation } from './route.js'
import { update } from './update.js'

const statusMovedAt = (id: string, atMs: number): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: 1_000,
    details: '',
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P2',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'InProgress',
    successCriteria: [],
    title: `Issue ${id}`,
    updatedAtMs: atMs,
    viewerURL: Option.none(),
    workLog: [
      IssueWorkLogEntry.make({
        agentId: Option.some('claude-code/one@ld'),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: `work-${id}-status-${atMs.toString()}`,
        occurredAtMs: atMs,
        state: Option.some('status'),
        summary: 'Status Open → InProgress.',
      }),
    ],
  })

const inbox = (): Model =>
  update(
    modelForNavigation(pathToNavigation('/inbox')),
    ObservedIssues.make({
      issues: [statusMovedAt('101', 5_000), statusMovedAt('100', 9_000)],
    }),
  )[0]

describe('the inbox with the keyboard', () => {
  it('walks its Issues newest change first with j, and Enter opens the one under the cursor', () => {
    const walked = update(inbox(), MovedRowCursor.make({ direction: 'Next' }))[0]
    expect(Option.getOrNull(walked.maybeRowCursor)).toBe('100')

    const [opened] = update(walked, OpenedRowUnderCursor.make({}))

    expect(opened.navigation).toEqual({ _tag: 'IssueDetail', issueId: '100' })
  })

  it('goes back to the inbox on Esc from an Issue opened there', () => {
    const walked = update(inbox(), MovedRowCursor.make({ direction: 'Next' }))[0]
    const [opened] = update(walked, OpenedRowUnderCursor.make({}))

    const [back] = update(opened, DismissedIssueDetail.make({}))

    expect(back.navigation._tag).toBe('Inbox')
  })
})

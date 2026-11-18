import { Array, Option, Order } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueStatus,
} from '@foldkit/instant-tools/issues'

import { statusChangeChoices, statusFilterChoices } from './choices.js'
import { productStatusGroups } from './entityGraph.js'
import { STATUS_WORKFLOW } from './issueView.js'
import { navigationToPath, pathToNavigation } from './route.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })

const inStatus = (status: IssueStatus, index: number): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: 1_000 + index,
    details: '',
    id: (100 + index).toString(),
    issueType: Option.none(),
    mentions: [],
    priority: 'P2',
    product: scribe,
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status,
    successCriteria: [],
    title: `An Issue that is ${status}`,
    updatedAtMs: 1_000 + index,
    viewerURL: Option.none(),
    workLog: [],
  })

const declared = Array.sort(IssueStatus.literals, Order.String)

describe('the statuses the tracker declares', () => {
  it('holds each one once in the order work moves, an answer he owes after Blocked', () => {
    expect(Array.sort(STATUS_WORKFLOW, Order.String)).toEqual(declared)
    expect(
      Array.findFirstIndex(STATUS_WORKFLOW, status => status === 'Blocked'),
    ).toEqual(
      Option.map(
        Array.findFirstIndex(
          STATUS_WORKFLOW,
          status => status === 'NeedsUserInput',
        ),
        index => index - 1,
      ),
    )
  })

  it('offers each one in the set-status menu, in the order work moves, under a key of its own', () => {
    expect(Array.map(statusChangeChoices, choice => choice.token)).toEqual(
      Array.map(STATUS_WORKFLOW, status => `set-status:${status}`),
    )
    const keys = Array.flatMap(statusChangeChoices, choice => choice.keys)
    expect(Array.dedupe(keys)).toHaveLength(IssueStatus.literals.length)
    expect(
      Array.findFirst(
        statusChangeChoices,
        choice => choice.token === 'set-status:NeedsUserInput',
      ),
    ).toMatchObject(Option.some({ keys: ['u'], label: 'NeedsUserInput' }))
  })

  it('filters a list by each one', () => {
    expect(Array.map(statusFilterChoices, choice => choice.token)).toEqual([
      'filter-status:any',
      ...Array.map(STATUS_WORKFLOW, status => `filter-status:${status}`),
    ])
  })

  it('reads a list filtered to what waits on his answer from its link, and prints it back', () => {
    const path = '/issues?status=NeedsUserInput'
    expect(navigationToPath(pathToNavigation(path))).toBe(path)
  })

  it('groups a product’s page under each one, what waits on his answer first', () => {
    const issues = Array.map(IssueStatus.literals, inStatus)
    const groups = productStatusGroups(issues, 'scribe')
    expect(
      Array.sort(
        Array.map(groups, group => group.status),
        Order.String,
      ),
    ).toEqual(declared)
    expect(Option.map(Array.head(groups), group => group.status)).toEqual(
      Option.some('NeedsUserInput'),
    )
  })
})

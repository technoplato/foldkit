import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import {
  EPIC_ISSUE_TYPE,
  childrenProgressLabel,
  isEpic,
  isFinishedStatus,
  issueChildrenOf,
  issueChildrenQuery,
} from './issueFamily.js'

const child = (
  number: number,
  status: string,
  fields: Readonly<Record<string, unknown>> = {},
) => ({
  id: `row-${number.toString()}`,
  number,
  title: `Child ${number.toString()}`,
  status,
  priority: 'P2',
  issueType: 'feature',
  ...fields,
})

const issueOfType = (maybeIssueType: Option.Option<string>) =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: 1,
    details: '',
    evidenceLogQueries: [],
    id: '2347',
    issueType: maybeIssueType,
    mentions: [],
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title: 'Epic: ready for release',
    updatedAtMs: 1,
    viewerURL: Option.none(),
    workLog: [],
  })

describe('issueChildrenQuery (Scribe #2348)', () => {
  it("asks Scribe's issues rows for the Issues whose parent is this one, by its number, with the fields a child line shows", () => {
    expect(issueChildrenQuery(2347)).toEqual({
      issues: {
        $: {
          where: { parentNumber: 2347 },
          fields: ['number', 'title', 'status', 'priority', 'issueType'],
        },
      },
    })
  })
})

describe('issueChildrenOf', () => {
  it('lists the open children first, then the finished, each by number, and counts the finished', () => {
    const children = issueChildrenOf({
      issues: [
        child(2340, 'Verified'),
        child(2332, 'InProgress', { priority: 'P1' }),
        child(41, 'Open', { issueType: null }),
        child(2333, 'Closed'),
        child(2335, 'NeedsUserInput'),
      ],
    })
    expect(
      children.children.map(each => [each.id, each.status, each.priority]),
    ).toEqual([
      ['041', 'Open', 'P2'],
      ['2332', 'InProgress', 'P1'],
      ['2335', 'NeedsUserInput', 'P2'],
      ['2333', 'Closed', 'P2'],
      ['2340', 'Verified', 'P2'],
    ])
    expect(children.done).toBe(2)
    expect(children.total).toBe(5)
    expect(childrenProgressLabel(children)).toBe('2 of 5 done')
    expect(
      children.children.map(each => Option.getOrNull(each.maybeIssueType)),
    ).toEqual([null, 'feature', 'feature', 'feature', 'feature'])
  })

  it('reads no children as none of none done', () => {
    const children = issueChildrenOf({ issues: [] })
    expect(children.children).toEqual([])
    expect(childrenProgressLabel(children)).toBe('0 of 0 done')
  })

  it('refuses rows it cannot read', () => {
    expect(() => issueChildrenOf({ issues: [{ number: 'x' }] })).toThrow()
  })
})

describe('what counts as done, and what an epic is', () => {
  it("counts the tracker's finished statuses as done: Closed, Fixed, Resolved and Verified", () => {
    expect(
      ['Closed', 'Fixed', 'Resolved', 'Verified'].every(isFinishedStatus),
    ).toBe(true)
    expect(
      ['Open', 'InProgress', 'VerificationNeeded', 'PartiallyDone'].some(
        isFinishedStatus,
      ),
    ).toBe(false)
  })

  it('reads an Issue of type epic as an epic', () => {
    expect(EPIC_ISSUE_TYPE).toBe('epic')
    expect(isEpic(issueOfType(Option.some('epic')))).toBe(true)
    expect(isEpic(issueOfType(Option.some('feature')))).toBe(false)
    expect(isEpic(issueOfType(Option.none()))).toBe(false)
  })
})

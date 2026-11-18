import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { IssueView } from './issueView.js'
import {
  MovedRowCursor,
  ObservedIssues,
  ObservedProducts,
  OpenedChoiceMenu,
  OpenedRowField,
  PickedMenuRow,
} from './message.js'
import { IssueList, type Model } from './model.js'
import { pathToNavigation } from './route.js'
import { update } from './update.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })

const openIssue = (id: string, createdAtMs: number): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs,
    details: '',
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P2',
    product: scribe,
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title: `Issue ${id}`,
    updatedAtMs: createdAtMs,
    viewerURL: Option.none(),
    workLog: [],
  })

const issues = [
  openIssue('102', 3_000),
  openIssue('101', 2_000),
  openIssue('100', 1_000),
]

const openOnly = (): Model => {
  const navigation = pathToNavigation('/issues')
  const view =
    navigation._tag === 'IssueList'
      ? IssueView.make({ ...navigation.view, statuses: ['Open'] })
      : IssueView.make({ query: '', statuses: ['Open'] })
  return Array.reduce(
    [
      ObservedIssues.make({ issues }),
      ObservedProducts.make({ products: [{ product: scribe, updatedAtMs: 1 }] }),
      MovedRowCursor.make({ direction: 'Next' }),
      MovedRowCursor.make({ direction: 'Next' }),
    ],
    modelForNavigation(IssueList.make({ view })),
    (model, message) => update(model, message)[0],
  )
}

const editedIssueIds = (model: Model): ReadonlyArray<string> =>
  Array.map(model.rowEdits, edit => edit.issueId)

describe('a dialog keeps the Issues it named when it opened', () => {
  it('changes the Issue its title named, though that row left the list while it was open', () => {
    const atRow = openOnly()
    expect(Option.getOrNull(atRow.maybeRowCursor)).toBe('101')
    const [statusMenu] = update(
      atRow,
      OpenedChoiceMenu.make({ menu: 'SetStatus' }),
    )
    const [movedAway] = update(
      statusMenu,
      ObservedIssues.make({
        issues: Array.map(issues, issue =>
          issue.id === '101'
            ? Issue.make({ ...issue, status: 'InProgress' })
            : issue,
        ),
      }),
    )

    const [picked] = update(
      movedAway,
      PickedMenuRow.make({ token: 'set-status:Backlog' }),
    )

    expect(editedIssueIds(picked)).toEqual(['101'])
  })

  it('a row field pressed while it is open does not change what it changes', () => {
    const [statusMenu] = update(
      openOnly(),
      OpenedChoiceMenu.make({ menu: 'SetStatus' }),
    )
    const [strayPress] = update(
      statusMenu,
      OpenedRowField.make({ issueId: '100', menu: 'SetStatus' }),
    )

    const [picked] = update(
      strayPress,
      PickedMenuRow.make({ token: 'set-status:Backlog' }),
    )

    expect(editedIssueIds(picked)).toEqual(['101'])
  })
})

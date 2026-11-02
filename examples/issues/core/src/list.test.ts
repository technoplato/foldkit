import { Array, Match as M, Option } from 'effect'
import {
  type ListItem,
  type UiNode,
  buttonsOf,
  textsOf,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import {
  type Message,
  ObservedIssues,
  SelectedIssue,
  observedIssuesOf,
} from './message.js'
import { IssueList, type Model } from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { update } from './update.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })

const stored = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_000,
  details: 'The transcript shifted sideways.',
  id: '021',
  issueType: Option.none(),
  mentions: [],
  priority: 'P1',
  product: scribe,
  projectId: Option.none(),
  reportedDate: Option.none(),
  sourceDocument: Option.none(),
  status: 'Open',
  successCriteria: [],
  title: 'Keep transcript aligned',
  updatedAtMs: 1_000,
  viewerURL: Option.none(),
  workLog: [],
})

const FIRST_NUMBER = 1001

const numbered = (count: number): ReadonlyArray<Issue> =>
  Array.makeBy(count, index =>
    Issue.make({
      ...stored,
      createdAtMs: 100_000 - index,
      id: (FIRST_NUMBER + index).toString(),
      title: `Issue ${(FIRST_NUMBER + index).toString()}`,
    }),
  )

const applyAll = (model: Model, messages: ReadonlyArray<Message>): Model =>
  Array.reduce(
    messages,
    model,
    (current, message) => update(current, message)[0],
  )

const listed = (issues: ReadonlyArray<Issue>): Model =>
  applyAll(modelForNavigation(IssueList.make({})), [
    ObservedIssues.make({ issues }),
  ])

const pageRowsOf = (node: UiNode): ReadonlyArray<ListItem> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ListItem>>(),
    M.tagsExhaustive({
      List: list => list.items,
      Row: row => Array.flatMap(row.children, pageRowsOf),
      Column: column => Array.flatMap(column.children, pageRowsOf),
      Box: box =>
        box.layer === undefined ? Array.flatMap(box.children, pageRowsOf) : [],
      DeviceShell: shell => Array.flatMap(shell.children, pageRowsOf),
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Progress: () => [],
      Seek: () => [],
      Transcript: () => [],
    }),
  )

const rowsOf = (model: Model): ReadonlyArray<ListItem> =>
  pageRowsOf(issuesScreen(model))

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

describe('Issue Tracker screen: the list', () => {
  it('shows each Issue as a link to its page, with its number, priority, status, product, area and claimant under its title', () => {
    const model = listed([
      Issue.make({
        ...stored,
        area: Option.some('Recording / images'),
        claimantId: Option.some('claude-code/issues-linear-1538@ld'),
      }),
    ])

    expect(rowsOf(model)).toEqual([
      {
        check: {
          action: 'select:021',
          extendAction: 'select-to:021',
          isChecked: false,
          label: 'Select #021',
        },
        href: '/issues/021',
        key: '021',
        lines: ['#021', 'Recording / images'],
        title: 'Keep transcript aligned',
        trailing: [
          {
            _tag: 'Button',
            label: 'Open',
            token: 'field:status:021',
            variant: 'Ghost',
          },
          {
            _tag: 'Button',
            label: 'P1',
            token: 'field:priority:021',
            variant: 'Ghost',
          },
          {
            _tag: 'Button',
            label: 'claude-code/issues-linear-1538@ld',
            token: 'field:claim:021',
            variant: 'Ghost',
          },
          {
            _tag: 'Button',
            label: 'Scribe',
            token: 'field:product:021',
            variant: 'Ghost',
          },
        ],
      },
    ])
  })

  it('paints every Issue as a row, none held back, newest first', () => {
    const model = listed(numbered(250))

    expect(rowsOf(model)).toHaveLength(250)
    expect(Option.map(Array.head(rowsOf(model)), row => row.key)).toEqual(
      Option.some('1001'),
    )
    expect(Option.map(Array.last(rowsOf(model)), row => row.key)).toEqual(
      Option.some('1250'),
    )
    expect(contentsOf(model)).toContain('250 Issues')
    expect(
      Array.filter(
        buttonsOf(issuesScreen(model)),
        button => button.token === 'show-more',
      ),
    ).toEqual([])
  })

  it('repaints a row an Issue changed in, and reuses every other row', () => {
    const issues = numbered(250)
    const before = applyAll(modelForNavigation(IssueList.make({})), [
      observedIssuesOf(issues),
    ])
    const [changed] = update(
      before,
      observedIssuesOf(
        Array.map(issues, issue =>
          issue.id === '1007'
            ? Issue.make({ ...issue, status: 'Fixed' })
            : issue,
        ),
      ),
    )
    const rowsAfter = rowsOf(changed)

    expect(rowsAfter).toHaveLength(250)
    expect(
      Array.findFirst(rowsAfter, row => row.key === '1007').pipe(
        Option.map(row =>
          Array.map(row.trailing ?? [], button => button.label),
        ),
      ),
    ).toEqual(Option.some(['Fixed', 'P1', 'Unclaimed', 'Scribe']))
    expect(
      Array.map(
        Array.filter(
          Array.zip(rowsOf(before), rowsAfter),
          ([rowBefore, rowAfter]) => rowBefore !== rowAfter,
        ),
        ([, rowAfter]) => rowAfter.key,
      ),
    ).toEqual(['1007'])
  })

  it('opens any loaded Issue by its token, shown or not', () => {
    const model = listed(numbered(250))

    expect(messageForScreenToken(model, 'open:1250')).toEqual(
      Option.some(SelectedIssue.make({ issueId: '1250' })),
    )
    expect(messageForScreenToken(model, 'open:1001')).toEqual(
      Option.some(SelectedIssue.make({ issueId: '1001' })),
    )
  })
})

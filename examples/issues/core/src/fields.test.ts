import { Array, Effect, Match as M, Option } from 'effect'
import { type ButtonNode, type ListItem, type UiNode } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueTracker,
  type IssueTrackerService,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { IssueIdentity, type IssueIdentityService } from './issueIdentity.js'
import {
  AppliedRowChange,
  type Message,
  ObservedIssue,
  ObservedIssues,
  ObservedProducts,
  OpenedCommandPalette,
} from './message.js'
import { IssueDetail, IssueList, type Model } from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { makeMemoryIssueTracker } from './resources.js'
import { ChangedStatus } from './rowEdit.js'
import { update } from './update.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })
const foldkit = ApplicationProduct.make({ id: 'foldkit', name: 'Foldkit' })

const stored = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_000,
  details: 'What is wrong.',
  id: '021',
  issueType: Option.none(),
  mentions: [],
  priority: 'P2',
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

const issues = [
  Issue.make({ ...stored, createdAtMs: 4_000, id: '104', title: 'Fourth' }),
  Issue.make({
    ...stored,
    claimantId: Option.some('claude-code/one@ld'),
    createdAtMs: 3_000,
    id: '103',
    product: foldkit,
    title: 'Third',
  }),
  Issue.make({ ...stored, createdAtMs: 2_000, id: '102', title: 'Second' }),
]

const products = [
  { product: scribe, updatedAtMs: 1 },
  { product: foldkit, updatedAtMs: 1 },
]

const loadedAt = (
  navigation: Parameters<typeof modelForNavigation>[0],
): Model =>
  [
    ObservedIssues.make({ issues }),
    ObservedProducts.make({ products }),
  ].reduce<Model>(
    (model, message) => update(model, message)[0],
    modelForNavigation(navigation),
  )

const page = (): Model =>
  update(
    loadedAt(IssueDetail.make({ issueId: '104' })),
    ObservedIssue.make({
      issue: Array.head(issues),
      issueId: '104',
    }),
  )[0]
const list = (): Model => loadedAt(IssueList.make({}))

const childrenOf = (node: UiNode): ReadonlyArray<UiNode> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      List: () => [],
      Row: row => row.children,
      Column: column => column.children,
      Box: box => (box.layer === undefined ? box.children : []),
      DeviceShell: shell => shell.children,
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Progress: () => [],
      Seek: () => [],
      Transcript: () => [],
    }),
  )

const pageNodes = (node: UiNode): ReadonlyArray<UiNode> => [
  node,
  ...Array.flatMap(childrenOf(node), pageNodes),
]

const buttonsOf = (model: Model): ReadonlyArray<ButtonNode> =>
  Array.flatMap(pageNodes(issuesScreen(model)), node =>
    node._tag === 'Button' ? [node] : [],
  )

const rowsOf = (model: Model): ReadonlyArray<ListItem> =>
  Array.flatMap(pageNodes(issuesScreen(model)), node =>
    node._tag === 'List' ? node.items : [],
  )

const rowOf = (model: Model, issueId: string): ListItem =>
  Option.getOrThrow(Array.findFirst(rowsOf(model), row => row.key === issueId))

const fieldLabelsOf = (row: ListItem): ReadonlyArray<string> =>
  Array.map(row.trailing ?? [], button => button.label)

const headerButton = (model: Model, label: string): ButtonNode =>
  Option.getOrThrow(
    Array.findFirst(buttonsOf(model), button => button.label === label),
  )

const rowButton = (model: Model, issueId: string, label: string): ButtonNode =>
  Option.getOrThrow(
    Array.findFirst(
      rowOf(model, issueId).trailing ?? [],
      button => button.label === label,
    ),
  )

type Step = ReturnType<typeof update>

const clicked = (model: Model, button: ButtonNode): Step =>
  update(
    model,
    Option.getOrThrow(messageForScreenToken(model, button.token ?? '')),
  )

const pickedRow = (model: Model, title: string): Step => {
  if (model.layer._tag !== 'ChoiceLayer') {
    throw new Error('no menu is open')
  }
  return update(
    model,
    Option.getOrThrow(messageForScreenToken(model, `palette-run:${title}`)),
  )
}

const authoredBy = (author: string): IssueIdentityService => ({
  author: Effect.succeed(author),
  next: Effect.succeed({ id: 'issue-preview', nowMs: 2_000 }),
})

const settled = async (
  tracker: IssueTrackerService,
  [model, commands]: Step,
): Promise<Model> =>
  Option.match(Array.head(commands), {
    onNone: () => Promise.resolve(model),
    onSome: async command => {
      const message = await Effect.runPromise(
        command.effect.pipe(
          Effect.provideService(IssueTracker, tracker),
          Effect.provideService(IssueIdentity, authoredBy('owner@example.com')),
        ) as Effect.Effect<Message>,
      )
      return settled(tracker, update(model, message))
    },
  })

const memoryTracker = (): IssueTrackerService =>
  Effect.runSync(makeMemoryIssueTracker(issues))

const dialogRowsOf = (model: Model): ReadonlyArray<ListItem> => {
  const rowsInLayer = (node: UiNode): ReadonlyArray<ListItem> =>
    node._tag === 'Box' && node.layer !== undefined
      ? Array.flatMap(node.children, child =>
          child._tag === 'List' ? child.items : [],
        )
      : Array.flatMap(
          node._tag === 'Row' || node._tag === 'Column' ? node.children : [],
          rowsInLayer,
        )
  return rowsInLayer(issuesScreen(model))
}

describe('Issue Tracker fields on the Issue page', () => {
  it('shows status, priority, claim and product as the first controls on the page', () => {
    const labels = Array.map(buttonsOf(page()), button => button.label)
    expect(Array.take(Array.drop(labels, 1), 4)).toEqual([
      'Open',
      'P2',
      'Unclaimed',
      'Scribe',
    ])
  })

  it('offers all 14 statuses from the header, and two clicks set one, shown at once', async () => {
    const tracker = memoryTracker()
    const [menu] = clicked(page(), headerButton(page(), 'Open'))
    expect(dialogRowsOf(menu)).toHaveLength(14)
    const picked = pickedRow(menu, 'set-status:Blocked')
    expect(headerButton(picked[0], 'Blocked').token).toBe('menu:set-status')
    const done = await settled(tracker, picked)
    expect(headerButton(done, 'Blocked').token).toBe('menu:set-status')
    expect(
      Option.map(
        Effect.runSync(tracker.fetchIssue('104')),
        issue => issue.status,
      ),
    ).toEqual(Option.some('Blocked'))
  })

  it('sets a priority from the header in two clicks', async () => {
    const tracker = memoryTracker()
    const [menu] = clicked(page(), headerButton(page(), 'P2'))
    const picked = pickedRow(menu, 'set-priority:P0')
    expect(headerButton(picked[0], 'P0').token).toBe('menu:set-priority')
    await settled(tracker, picked)
    expect(
      Option.map(
        Effect.runSync(tracker.fetchIssue('104')),
        issue => issue.priority,
      ),
    ).toEqual(Option.some('P0'))
  })

  it('claims from the header in two clicks, as issues claim does', async () => {
    const tracker = memoryTracker()
    const [menu] = clicked(page(), headerButton(page(), 'Unclaimed'))
    const picked = pickedRow(menu, 'claim:me')
    expect(headerButton(picked[0], 'me').token).toBe('menu:claim')
    const done = await settled(tracker, picked)
    expect(headerButton(done, 'owner@example.com').token).toBe('menu:claim')
    const claimed = Option.getOrThrow(Effect.runSync(tracker.fetchIssue('104')))
    expect(claimed.claimantId).toEqual(Option.some('owner@example.com'))
    expect(claimed.status).toBe('InProgress')
  })

  it('keeps an Issue that must stay open from being Closed, and says so', () => {
    const unclosable = Issue.make({ ...stored, id: '240' })
    const [open] = update(
      update(
        modelForNavigation(IssueDetail.make({ issueId: '240' })),
        ObservedIssues.make({ issues: [unclosable] }),
      )[0],
      ObservedIssue.make({ issue: Option.some(unclosable), issueId: '240' }),
    )
    const [menu] = clicked(open, headerButton(open, 'Open'))
    expect(Array.map(dialogRowsOf(menu), row => row.title)).not.toContain(
      'Closed',
    )
    const [refused, commands] = update(
      menu,
      AppliedRowChange.make({
        change: ChangedStatus.make({ status: 'Closed' }),
      }),
    )
    expect(commands).toEqual([])
    expect(refused.rowEdits).toEqual([])
    expect(Array.map(refused.failedRowEdits, failed => failed.reason)).toEqual([
      'Issue 240 cannot be Closed.',
    ])
  })

  it('moves the Issue to another product from the header in two clicks', async () => {
    const tracker = memoryTracker()
    const [menu] = clicked(page(), headerButton(page(), 'Scribe'))
    const picked = pickedRow(menu, 'set-product:foldkit')
    expect(headerButton(picked[0], 'Foldkit').token).toBe('menu:set-product')
    await settled(tracker, picked)
    expect(
      Option.map(
        Effect.runSync(tracker.fetchIssue('104')),
        issue => issue.product.id,
      ),
    ).toEqual(Option.some('foldkit'))
  })
})

describe('Issue Tracker fields in the palette', () => {
  it('offers moving the Issue in hand to each product', () => {
    const [palette] = update(page(), OpenedCommandPalette.make({}))
    expect(Array.map(dialogRowsOf(palette), row => row.title)).toEqual(
      expect.arrayContaining(['Set product: Foldkit', 'Set product: Scribe']),
    )
  })
})

describe('Issue Tracker fields on a row', () => {
  it('carries its status, priority, claimant and product as buttons', () => {
    expect(fieldLabelsOf(rowOf(list(), '103'))).toEqual([
      'Open',
      'P2',
      'claude-code/one@ld',
      'Foldkit',
    ])
    expect(fieldLabelsOf(rowOf(list(), '104'))).toEqual([
      'Open',
      'P2',
      'Unclaimed',
      'Scribe',
    ])
  })

  it('changes that row in two clicks, and the row is where the cursor lands', async () => {
    const tracker = memoryTracker()
    const [menu] = clicked(list(), rowButton(list(), '103', 'P2'))
    expect(menu.maybeRowCursor).toEqual(Option.some('103'))
    const picked = pickedRow(menu, 'set-priority:P1')
    expect(fieldLabelsOf(rowOf(picked[0], '103'))).toContain('P1')
    await settled(tracker, picked)
    expect(
      Option.map(
        Effect.runSync(tracker.fetchIssue('103')),
        issue => issue.priority,
      ),
    ).toEqual(Option.some('P1'))
  })

  it('changes only the pressed row when other rows are selected', () => {
    const [selected] = update(
      list(),
      Option.getOrThrow(messageForScreenToken(list(), 'select:102')),
    )
    const [menu] = clicked(selected, rowButton(selected, '104', 'Open'))
    const [picked] = pickedRow(menu, 'set-status:Blocked')
    expect(fieldLabelsOf(rowOf(picked, '104'))).toContain('Blocked')
    expect(fieldLabelsOf(rowOf(picked, '102'))).toContain('Open')
    expect(picked.selectedIssueIds).toEqual(['102'])
  })

  it('changes every selected row when the pressed row is one of them', () => {
    const [one] = update(
      list(),
      Option.getOrThrow(messageForScreenToken(list(), 'select:102')),
    )
    const [both] = update(
      one,
      Option.getOrThrow(messageForScreenToken(one, 'select:104')),
    )
    const [menu] = clicked(both, rowButton(both, '104', 'Open'))
    const [picked] = pickedRow(menu, 'set-status:Blocked')
    expect(fieldLabelsOf(rowOf(picked, '104'))).toContain('Blocked')
    expect(fieldLabelsOf(rowOf(picked, '102'))).toContain('Blocked')
  })

  it('does not repeat a field in the words under the title', () => {
    expect(rowOf(list(), '104').lines).toEqual(['#104'])
  })
})

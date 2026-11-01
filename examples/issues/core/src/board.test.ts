import { Array, Effect, Match as M, Option } from 'effect'
import {
  type ListItem,
  type ListNode,
  type RowNode,
  type UiNode,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  type IssueStatus,
  IssueTracker,
  type IssueTrackerService,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { IssueIdentity, type IssueIdentityService } from './issueIdentity.js'
import { type KeyPress, tokenForKeyPress } from './keys.js'
import { type Message, ObservedIssues, ObservedProducts } from './message.js'
import { type Model } from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { makeMemoryIssueTracker } from './resources.js'
import { navigationToPath, pathToNavigation } from './route.js'
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
  Issue.make({ ...stored, createdAtMs: 6_000, id: '106', status: 'Open' }),
  Issue.make({ ...stored, createdAtMs: 5_000, id: '105', status: 'Open' }),
  Issue.make({
    ...stored,
    createdAtMs: 4_000,
    id: '104',
    priority: 'P1',
    status: 'InProgress',
  }),
  Issue.make({
    ...stored,
    claimantId: Option.some('claude-code/one@ld'),
    createdAtMs: 3_000,
    id: '103',
    priority: 'P1',
    product: foldkit,
    status: 'Blocked',
  }),
  Issue.make({
    ...stored,
    createdAtMs: 2_000,
    id: '102',
    product: foldkit,
    status: 'Closed',
  }),
]

const products = [
  { product: scribe, updatedAtMs: 1 },
  { product: foldkit, updatedAtMs: 1 },
]

const loadedAt = (path: string, catalog = issues): Model =>
  [
    ObservedIssues.make({ issues: catalog }),
    ObservedProducts.make({ products }),
  ].reduce<Model>(
    (model, message) => update(model, message)[0],
    modelForNavigation(pathToNavigation(path)),
  )

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

const nodesIn = (node: UiNode): ReadonlyArray<UiNode> => [
  node,
  ...Array.flatMap(childrenOf(node), nodesIn),
]

const boardOf = (model: Model): RowNode =>
  Option.getOrThrow(
    Array.findFirst(
      nodesIn(issuesScreen(model)),
      (node): node is RowNode => node._tag === 'Row' && node.isBoard === true,
    ),
  )

type Column = Readonly<{ heading: string; list: ListNode }>

const columnsOf = (model: Model): ReadonlyArray<Column> =>
  Array.map(boardOf(model).children, column => ({
    heading: Option.getOrThrow(
      Array.findFirst(nodesIn(column), node =>
        node._tag === 'Text' ? Option.some(node.content) : Option.none(),
      ),
    ),
    list: Option.getOrThrow(
      Array.findFirst(
        nodesIn(column),
        (node): node is ListNode => node._tag === 'List',
      ),
    ),
  }))

const keysByColumn = (model: Model): ReadonlyArray<ReadonlyArray<string>> =>
  Array.map(columnsOf(model), column =>
    Array.map(column.list.items, card => card.key),
  )

const cardIn = (model: Model, issueId: string): ListItem =>
  Option.getOrThrow(
    Array.findFirst(
      Array.flatMap(columnsOf(model), column => column.list.items),
      card => card.key === issueId,
    ),
  )

const on = (
  key: string,
  overrides: Partial<Omit<KeyPress, 'key'>> = {},
): KeyPress => ({
  isAlt: false,
  isControl: false,
  isMeta: false,
  isShift: false,
  key,
  target: 'Page',
  ...overrides,
})

type Step = ReturnType<typeof update>

const pressedWith = (model: Model, press: KeyPress): Step =>
  Option.match(tokenForKeyPress(model, press), {
    onNone: () => [model, []],
    onSome: token =>
      update(model, Option.getOrThrow(messageForScreenToken(model, token))),
  })

const pressed = (model: Model, press: KeyPress): Model =>
  pressedWith(model, press)[0]

const pressedAll = (model: Model, keys: ReadonlyArray<string>): Model =>
  Array.reduce(keys, model, (current, key) => pressed(current, on(key)))

const SHIFT = { isShift: true }

const sent = (model: Model, token: string): Step =>
  update(model, Option.getOrThrow(messageForScreenToken(model, token)))

const authoredBy = (author: string): IssueIdentityService => ({
  author: Effect.succeed(author),
  next: Effect.succeed({ id: 'issue-preview', nowMs: 2_000 }),
})

const settled = async (
  tracker: IssueTrackerService,
  [model, commands]: Step,
  ran: Array<string> = [],
): Promise<Readonly<{ model: Model; ran: ReadonlyArray<string> }>> =>
  Option.match(Array.head(commands), {
    onNone: () => Promise.resolve({ model, ran }),
    onSome: async command => {
      const message = await Effect.runPromise(
        command.effect.pipe(
          Effect.provideService(IssueTracker, tracker),
          Effect.provideService(IssueIdentity, authoredBy('owner@example.com')),
        ) as Effect.Effect<Message>,
      )
      return settled(tracker, update(model, message), [...ran, command.name])
    },
  })

const statusOf = (tracker: IssueTrackerService, issueId: string) =>
  Option.map(Effect.runSync(tracker.fetchIssue(issueId)), found => found.status)

const STATUS_COLUMNS: ReadonlyArray<IssueStatus> = [
  'Backlog',
  'Planned',
  'Open',
  'InProgress',
  'Addressing',
  'Blocked',
  'FeedbackRequested',
  'PartiallyDone',
  'Regressed',
  'VerificationNeeded',
  'Verified',
  'Fixed',
  'Resolved',
  'Closed',
]

describe('Issue Tracker board', () => {
  it('is a link like every other view', () => {
    Array.forEach(
      [
        '/issues?view=board',
        '/issues?group=priority&view=board',
        '/issues?product=foldkit&group=claimant&view=board',
      ],
      path => {
        expect(navigationToPath(pathToNavigation(path))).toBe(path)
      },
    )
  })

  it('opens from the list and goes back, keeping its filters', () => {
    const [board] = sent(loadedAt('/issues?product=foldkit'), 'view:board')
    expect(navigationToPath(board.navigation)).toBe(
      '/issues?product=foldkit&view=board',
    )
    expect(navigationToPath(sent(board, 'view:list')[0].navigation)).toBe(
      '/issues?product=foldkit',
    )
    expect(navigationToPath(pressed(board, on('B', SHIFT)).navigation)).toBe(
      '/issues?product=foldkit',
    )
  })

  it('has one column per status in the order work moves, empty ones too, each with a count', () => {
    const columns = columnsOf(loadedAt('/issues?view=board'))
    expect(Array.map(columns, column => column.heading)).toEqual(
      Array.map(STATUS_COLUMNS, status =>
        Array.contains(['InProgress', 'Blocked', 'Closed'], status)
          ? `${status}: 1 Issue`
          : status === 'Open'
            ? 'Open: 2 Issues'
            : `${status}: 0 Issues`,
      ),
    )
    expect(keysByColumn(loadedAt('/issues?view=board'))).toEqual(
      Array.map(STATUS_COLUMNS, status =>
        Array.map(
          Array.filter(issues, issue => issue.status === status),
          issue => issue.id,
        ),
      ),
    )
  })

  it('takes the columns from the grouping that is set', () => {
    expect(
      Array.map(
        columnsOf(loadedAt('/issues?group=priority&view=board')),
        column => column.list.label,
      ),
    ).toEqual(['P0', 'P1', 'P2', 'P3', 'P4'])
    expect(
      Array.map(
        columnsOf(loadedAt('/issues?group=product&view=board')),
        column => column.list.label,
      ),
    ).toEqual(['Foldkit', 'Scribe'])
    expect(
      Array.map(
        columnsOf(loadedAt('/issues?group=claimant&view=board')),
        column => column.list.label,
      ),
    ).toEqual(['claude-code/one@ld', 'Unclaimed'])
  })

  it('shows every card of a column, none held back', () => {
    const many = Array.makeBy(600, position =>
      Issue.make({
        ...stored,
        createdAtMs: 100_000 - position,
        id: (2_000 + position).toString(),
      }),
    )
    const board = loadedAt('/issues?view=board', many)
    expect(
      Array.flatMap(columnsOf(board), column => column.list.items),
    ).toHaveLength(600)
    expect(
      pressedAll(
        board,
        Array.makeBy(599, () => 'j'),
      ).maybeRowCursor,
    ).toEqual(Option.some('2598'))
  })

  it('walks the cards with j and k, and goes across the columns with h and l', () => {
    const board = pressedAll(loadedAt('/issues?view=board'), ['j'])
    expect(board.maybeRowCursor).toEqual(Option.some('106'))
    const down = pressedAll(board, ['j'])
    expect(down.maybeRowCursor).toEqual(Option.some('105'))
    const across = pressedAll(down, ['l'])
    expect(across.maybeRowCursor).toEqual(Option.some('104'))
    expect(pressedAll(across, ['l']).maybeRowCursor).toEqual(Option.some('103'))
    expect(pressedAll(across, ['h']).maybeRowCursor).toEqual(Option.some('106'))
    expect(pressed(down, on('ArrowRight')).maybeRowCursor).toEqual(
      Option.some('104'),
    )
  })

  it('moves a card to the next column with Shift+l, shown at once, written once', async () => {
    const tracker = Effect.runSync(makeMemoryIssueTracker(issues))
    const atCard = pressedAll(loadedAt('/issues?view=board'), ['j'])
    const moved = pressedWith(atCard, on('L', SHIFT))
    expect(Array.map(moved[1], command => command.name)).toEqual([
      'SetIssueStatus',
    ])
    expect(keysByColumn(moved[0])[3]).toEqual(['106', '104'])
    expect(moved[0].maybeRowCursor).toEqual(Option.some('106'))
    const { model } = await settled(tracker, moved)
    expect(model.rowEdits).toEqual([])
    expect(statusOf(tracker, '106')).toEqual(Option.some('InProgress'))
  })

  it('moves a card back with Shift+h, and every selected card one write at a time', async () => {
    const tracker = Effect.runSync(makeMemoryIssueTracker(issues))
    const selected = pressedAll(loadedAt('/issues?view=board'), [
      'j',
      'x',
      'j',
      'x',
    ])
    const moved = pressedWith(selected, on('H', SHIFT))
    expect(moved[1]).toHaveLength(1)
    expect(keysByColumn(moved[0])[1]).toEqual(['106', '105'])
    const { ran } = await settled(tracker, moved)
    expect(ran).toEqual(['SetIssueStatus', 'SetIssueStatus'])
    expect(statusOf(tracker, '105')).toEqual(Option.some('Planned'))
  })

  it('moves a card across the columns of the grouping that is set', async () => {
    const tracker = Effect.runSync(makeMemoryIssueTracker(issues))
    const atCard = pressedAll(loadedAt('/issues?group=priority&view=board'), [
      'j',
    ])
    expect(atCard.maybeRowCursor).toEqual(Option.some('104'))
    const moved = pressedWith(atCard, on('L', SHIFT))
    const { ran } = await settled(tracker, moved)
    expect(ran).toEqual(['EditIssue'])
    expect(
      Option.map(
        Effect.runSync(tracker.fetchIssue('104')),
        issue => issue.priority,
      ),
    ).toEqual(Option.some('P2'))
  })

  it('stays put at the last column', () => {
    const atLast = pressedAll(loadedAt('/issues?view=board'), [
      'j',
      'j',
      'j',
      'j',
      'j',
    ])
    expect(atLast.maybeRowCursor).toEqual(Option.some('102'))
    const [same, commands] = pressedWith(atLast, on('L', SHIFT))
    expect(commands).toEqual([])
    expect(same.rowEdits).toEqual([])
  })

  it('takes a card dropped on a column through the same write', async () => {
    const tracker = Effect.runSync(makeMemoryIssueTracker(issues))
    const board = loadedAt('/issues?view=board')
    const blocked = Option.getOrThrow(Array.get(columnsOf(board), 5)).list
    expect(blocked.dropAction).toBe('card-drop:Blocked')
    expect(cardIn(board, '106').isDraggable).toBe(true)
    const dropped = sent(board, `${blocked.dropAction ?? ''}:106`)
    expect(keysByColumn(dropped[0])[5]).toEqual(['106', '103'])
    await settled(tracker, dropped)
    expect(statusOf(tracker, '106')).toEqual(Option.some('Blocked'))
  })

  it('claims a card dropped on a claimant, and lets go of it on Unclaimed', async () => {
    const tracker = Effect.runSync(makeMemoryIssueTracker(issues))
    const board = loadedAt('/issues?group=claimant&view=board')
    const claimed = sent(board, 'card-drop:claude-code/one@ld:106')
    await settled(tracker, claimed)
    expect(
      Option.map(
        Effect.runSync(tracker.fetchIssue('106')),
        issue => issue.claimantId,
      ),
    ).toEqual(Option.some(Option.some('claude-code/one@ld')))
    const released = sent(board, 'card-drop:Unclaimed:103')
    await settled(tracker, released)
    expect(
      Option.map(
        Effect.runSync(tracker.fetchIssue('103')),
        issue => issue.claimantId,
      ),
    ).toEqual(Option.some(Option.none()))
  })

  it('keeps every card object across a live change to one Issue', () => {
    const board = loadedAt('/issues?view=board')
    const before = Array.flatMap(columnsOf(board), column => column.list.items)
    const changed = Array.map(issues, issue =>
      issue.id === '105' ? Issue.make({ ...issue, status: 'Fixed' }) : issue,
    )
    const after = Array.flatMap(
      columnsOf(update(board, ObservedIssues.make({ issues: changed }))[0]),
      column => column.list.items,
    )
    expect(
      Array.filter(after, card => !Array.contains(before, card)).map(
        card => card.key,
      ),
    ).toEqual(['105'])
  })
})

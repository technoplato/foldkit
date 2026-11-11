import { Array, Match as M, Option } from 'effect'
import {
  type ButtonNode,
  type ListItem,
  type UiNode,
  buttonsOf,
  textsOf,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ActiveWork,
  ApplicationProduct,
  Issue,
  IssueStatus,
  IssueWorkInProgress,
  LibraryProduct,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { ObservedIssues, ObservedProducts } from './message.js'
import { Backlog, IssueDetail, type Model } from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { update } from './update.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })
const foldkit = LibraryProduct.make({ id: 'foldkit', name: 'Foldkit' })

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

const green = Option.some(
  IssueWorkInProgress.make({
    activity: ActiveWork.make({}),
    agentId: Option.none(),
    branch: Option.none(),
    commitSha: Option.none(),
    landingState: 'Green',
    lastStep: Option.none(),
    repository: Option.none(),
    targetBuild: Option.none(),
    updatedAtMs: 1_000,
    worktree: Option.none(),
  }),
)

const issues = [
  Issue.make({
    ...stored,
    claimantId: Option.some('claude-code/one@ld'),
    createdAtMs: 6_000,
    id: '106',
    product: foldkit,
    status: 'Open',
    updatedAtMs: 6_000,
    workInProgress: green,
  }),
  Issue.make({
    ...stored,
    createdAtMs: 5_000,
    id: '105',
    product: foldkit,
    status: 'Open',
    updatedAtMs: 9_000,
  }),
  Issue.make({
    ...stored,
    claimantId: Option.some('claude-code/one@ld'),
    createdAtMs: 4_000,
    id: '104',
    priority: 'P0',
    status: 'InProgress',
    updatedAtMs: 4_000,
  }),
  Issue.make({
    ...stored,
    claimantId: Option.some('claude-code/two@ld'),
    createdAtMs: 3_000,
    id: '103',
    priority: 'P1',
    status: 'Blocked',
    updatedAtMs: 8_000,
  }),
  Issue.make({
    ...stored,
    createdAtMs: 2_000,
    id: '102',
    priority: 'P0',
    status: 'Open',
    updatedAtMs: 2_000,
    workInProgress: green,
  }),
  Issue.make({
    ...stored,
    createdAtMs: 1_000,
    id: '101',
    priority: 'P4',
    status: 'Closed',
    updatedAtMs: 1_000,
  }),
]

const loadedAt = (path: string): Model =>
  update(
    update(
      modelForNavigation(pathToNavigation(path)),
      ObservedIssues.make({ issues }),
    )[0],
    ObservedProducts.make({
      products: [
        { product: scribe, updatedAtMs: 1_000 },
        { product: foldkit, updatedAtMs: 1_000 },
      ],
    }),
  )[0]

const sent = (model: Model, token: string): Model =>
  update(model, Option.getOrThrow(messageForScreenToken(model, token)))[0]

const pressedAll = (model: Model, tokens: ReadonlyArray<string>): Model =>
  Array.reduce(tokens, model, sent)

const listSectionsIn = (node: UiNode): ReadonlyArray<ListItem> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ListItem>>(),
    M.tagsExhaustive({
      List: list => list.items,
      Row: row => Array.flatMap(row.children, listSectionsIn),
      Column: column => Array.flatMap(column.children, listSectionsIn),
      Box: box =>
        box.layer === undefined
          ? Array.flatMap(box.children, listSectionsIn)
          : [],
      DeviceShell: shell => Array.flatMap(shell.children, listSectionsIn),
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Progress: () => [],
      Seek: () => [],
      Transcript: () => [],
    }),
  )

const shownOf = (model: Model): ReadonlyArray<string> =>
  Array.map(listSectionsIn(issuesScreen(model)), row => row.key)

const listsIn = (
  node: UiNode,
): ReadonlyArray<Readonly<{ label: string; rows: ReadonlyArray<string> }>> =>
  M.value(node).pipe(
    M.withReturnType<
      ReadonlyArray<Readonly<{ label: string; rows: ReadonlyArray<string> }>>
    >(),
    M.tagsExhaustive({
      List: list => [
        { label: list.label, rows: Array.map(list.items, row => row.key) },
      ],
      Row: row => Array.flatMap(row.children, listsIn),
      Column: column => Array.flatMap(column.children, listsIn),
      Box: box =>
        box.layer === undefined ? Array.flatMap(box.children, listsIn) : [],
      DeviceShell: shell => Array.flatMap(shell.children, listsIn),
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Progress: () => [],
      Seek: () => [],
      Transcript: () => [],
    }),
  )

const groupsOf = (model: Model) => listsIn(issuesScreen(model))

const toolbarButtonOf = (
  model: Model,
  token: string,
): Option.Option<ButtonNode> =>
  Array.findFirst(
    buttonsOf(issuesScreen(model)),
    button => button.token === token,
  )

describe('Issue Tracker views: the filters live in the URL', () => {
  it('reads and prints a view as its link', () => {
    Array.forEach(
      [
        '/issues',
        '/issues?product=foldkit',
        '/issues?landing=close',
        '/issues?landing=working',
        '/issues?status=Open',
        '/issues?priority=P1',
        '/issues?claimant=claude-code%2Fone%40ld',
        '/issues?claimant=unclaimed',
        '/issues?sort=updated',
        '/issues?group=status',
        '/issues?product=foldkit&landing=close&status=Open',
        '/issues?q=heart+rate&product=foldkit&status=Open%2CInProgress&priority=P0%2CP1&sort=priority&group=product',
      ],
      path => {
        expect(navigationToPath(pathToNavigation(path))).toBe(path)
      },
    )
  })

  it('shows the same rows after a reload of the link', () => {
    const chosen = pressedAll(loadedAt('/issues'), [
      'product:foldkit',
      'landing:close',
      'filter-status:Open',
    ])
    expect(shownOf(chosen)).toEqual(['106'])
    const link = navigationToPath(chosen.navigation)
    expect(link).toBe('/issues?product=foldkit&landing=close&status=Open')
    expect(shownOf(loadedAt(link))).toEqual(['106'])
  })

  it('reads a parameter it does not know, or a value that names nothing, as no filter', () => {
    expect(
      shownOf(loadedAt('/issues?status=Nonsense&priority=P9&nope=1')),
    ).toEqual(shownOf(loadedAt('/issues')))
    expect(navigationToPath(pathToNavigation('/issues?sort=sideways'))).toBe(
      '/issues',
    )
  })

  it('filters by status, by more than one, as issues list --status does', () => {
    const open = pressedAll(loadedAt('/issues'), ['filter-status:Open'])
    expect(shownOf(open)).toEqual(['106', '105', '102'])
    const openOrBlocked = sent(open, 'filter-status:Blocked')
    expect(shownOf(openOrBlocked)).toEqual(['106', '105', '103', '102'])
    expect(navigationToPath(openOrBlocked.navigation)).toBe(
      '/issues?status=Open%2CBlocked',
    )
    expect(shownOf(sent(openOrBlocked, 'filter-status:Open'))).toEqual(['103'])
    expect(shownOf(sent(openOrBlocked, 'filter-status:any'))).toHaveLength(6)
  })

  it('filters by priority', () => {
    const urgent = pressedAll(loadedAt('/issues'), ['filter-priority:P0'])
    expect(shownOf(urgent)).toEqual(['104', '102'])
    expect(shownOf(sent(urgent, 'filter-priority:P1'))).toEqual([
      '104',
      '103',
      '102',
    ])
    expect(shownOf(sent(urgent, 'filter-priority:any'))).toHaveLength(6)
  })

  it('filters by claimant, and by no claimant', () => {
    const one = sent(loadedAt('/issues'), 'filter-claimant:claude-code/one@ld')
    expect(shownOf(one)).toEqual(['106', '104'])
    const unclaimed = sent(one, 'filter-claimant:unclaimed')
    expect(shownOf(unclaimed)).toEqual(['105', '102', '101'])
    expect(navigationToPath(unclaimed.navigation)).toBe(
      '/issues?claimant=unclaimed',
    )
    expect(shownOf(sent(unclaimed, 'filter-claimant:any'))).toHaveLength(6)
  })

  it('keeps the product filter in the backlog link too', () => {
    const backlog = sent(loadedAt('/issues/backlog'), 'product:foldkit')
    expect(navigationToPath(backlog.navigation)).toBe(
      '/issues/backlog?product=foldkit',
    )
    expect(
      navigationToPath(pathToNavigation('/issues/backlog?product=foldkit')),
    ).toBe('/issues/backlog?product=foldkit')
    expect(pathToNavigation('/issues/backlog')).toEqual(Backlog.make({}))
  })

  it('goes back from an Issue to the same view', () => {
    const chosen = pressedAll(loadedAt('/issues'), [
      'product:foldkit',
      'filter-status:Open',
    ])
    const opened = sent(chosen, 'open:105')
    expect(opened.navigation).toEqual(IssueDetail.make({ issueId: '105' }))
    expect(sent(opened, 'back').navigation).toEqual(chosen.navigation)
  })

  it('shows one line of filters that say what is chosen, each opening its choices', () => {
    const plain = loadedAt('/issues')
    expect(
      Option.map(
        toolbarButtonOf(plain, 'menu:product'),
        button => button.label,
      ),
    ).toEqual(Option.some('Product: All'))
    expect(
      Option.map(toolbarButtonOf(plain, 'menu:status'), button => button.label),
    ).toEqual(Option.some('Status: Any'))
    const chosen = pressedAll(plain, [
      'product:foldkit',
      'filter-status:Open',
      'filter-status:Blocked',
      'filter-priority:P0',
      'filter-claimant:unclaimed',
    ])
    expect(
      Array.flatMap(
        ['menu:product', 'menu:status', 'menu:priority', 'menu:claimant'],
        token =>
          Option.toArray(
            Option.map(toolbarButtonOf(chosen, token), button => ({
              label: button.label,
              variant: button.variant,
            })),
          ),
      ),
    ).toEqual([
      { label: 'Product: Foldkit', variant: 'Primary' },
      { label: 'Status: Open, Blocked', variant: 'Primary' },
      { label: 'Priority: P0', variant: 'Primary' },
      { label: 'Claimant: Unclaimed', variant: 'Primary' },
    ])
  })

  it('lists every choice of a filter with its count above the page, and a choice applies', () => {
    const menu = sent(loadedAt('/issues'), 'menu:status')
    const words = Array.map(textsOf(issuesScreen(menu)), text => text.content)
    expect(words).toContain('Status')
    const statusRows = Array.flatMap(groupsOfLayer(menu), layer => layer.rows)
    expect(Array.length(statusRows)).toBe(IssueStatus.literals.length + 1)
    expect(Array.head(statusRows)).toEqual(
      Option.some(
        expect.objectContaining({
          key: 'filter-status:any',
          title: 'Any status',
        }),
      ),
    )
    expect(statusRows).toContainEqual(
      expect.objectContaining({
        key: 'filter-status:Open',
        lines: ['3'],
        title: 'Open',
      }),
    )
    const openChosen = sent(menu, 'palette-run:filter-status:Open')
    expect(shownOf(openChosen)).toEqual(['106', '105', '102'])
    expect(Array.isReadonlyArrayEmpty(groupsOfLayer(openChosen))).toBe(false)
    const productMenu = sent(loadedAt('/issues'), 'menu:product')
    const pickedProduct = sent(productMenu, 'palette-run:product:foldkit')
    expect(Array.isReadonlyArrayEmpty(groupsOfLayer(pickedProduct))).toBe(true)
    expect(shownOf(pickedProduct)).toEqual(['106', '105'])
  })
})

const layersIn = (
  node: UiNode,
): ReadonlyArray<Readonly<{ label: string; rows: ReadonlyArray<ListItem> }>> =>
  M.value(node).pipe(
    M.withReturnType<
      ReadonlyArray<Readonly<{ label: string; rows: ReadonlyArray<ListItem> }>>
    >(),
    M.tagsExhaustive({
      List: () => [],
      Row: row => Array.flatMap(row.children, layersIn),
      Column: column => Array.flatMap(column.children, layersIn),
      Box: box =>
        box.layer === undefined
          ? Array.flatMap(box.children, layersIn)
          : [
              {
                label: box.layer.label,
                rows: Array.flatMap(box.children, listSectionsIn),
              },
            ],
      DeviceShell: shell => Array.flatMap(shell.children, layersIn),
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Progress: () => [],
      Seek: () => [],
      Transcript: () => [],
    }),
  )

const groupsOfLayer = (model: Model) => layersIn(issuesScreen(model))

describe('Issue Tracker views: grouping and sorting', () => {
  it('sorts by created, updated, priority and number', () => {
    const plain = loadedAt('/issues')
    expect(shownOf(plain)).toEqual(['106', '105', '104', '103', '102', '101'])
    expect(shownOf(sent(plain, 'sort:updated'))).toEqual([
      '105',
      '103',
      '106',
      '104',
      '102',
      '101',
    ])
    expect(shownOf(sent(plain, 'sort:priority'))).toEqual([
      '104',
      '102',
      '103',
      '106',
      '105',
      '101',
    ])
    expect(shownOf(sent(plain, 'sort:number'))).toEqual([
      '101',
      '102',
      '103',
      '104',
      '105',
      '106',
    ])
    expect(shownOf(sent(sent(plain, 'sort:number'), 'sort:created'))).toEqual(
      shownOf(plain),
    )
    expect(navigationToPath(sent(plain, 'sort:priority').navigation)).toBe(
      '/issues?sort=priority',
    )
  })

  it('groups by status with counts in the headings, the rows newest first as issues list --status prints them', () => {
    const grouped = sent(loadedAt('/issues'), 'group:status')
    expect(navigationToPath(grouped.navigation)).toBe('/issues?group=status')
    expect(groupsOf(grouped)).toEqual([
      { label: 'Open: 3 Issues', rows: ['106', '105', '102'] },
      { label: 'InProgress: 1 Issue', rows: ['104'] },
      { label: 'Blocked: 1 Issue', rows: ['103'] },
      { label: 'Closed: 1 Issue', rows: ['101'] },
    ])
    expect(
      Array.map(textsOf(issuesScreen(grouped)), text => text.content),
    ).toEqual(expect.arrayContaining(['Open: 3 Issues', 'Closed: 1 Issue']))
  })

  it('groups by priority, product and claimant', () => {
    const plain = loadedAt('/issues')
    expect(groupsOf(sent(plain, 'group:priority'))).toEqual([
      { label: 'P0: 2 Issues', rows: ['104', '102'] },
      { label: 'P1: 1 Issue', rows: ['103'] },
      { label: 'P2: 2 Issues', rows: ['106', '105'] },
      { label: 'P4: 1 Issue', rows: ['101'] },
    ])
    expect(groupsOf(sent(plain, 'group:product'))).toEqual([
      { label: 'Foldkit: 2 Issues', rows: ['106', '105'] },
      { label: 'Scribe: 4 Issues', rows: ['104', '103', '102', '101'] },
    ])
    expect(groupsOf(sent(plain, 'group:claimant'))).toEqual([
      { label: 'claude-code/one@ld: 2 Issues', rows: ['106', '104'] },
      { label: 'claude-code/two@ld: 1 Issue', rows: ['103'] },
      { label: 'Unclaimed: 3 Issues', rows: ['105', '102', '101'] },
    ])
    expect(groupsOf(sent(sent(plain, 'group:claimant'), 'group:none'))).toEqual(
      [{ label: 'Issues', rows: ['106', '105', '104', '103', '102', '101'] }],
    )
  })

  it('walks the rows in the order the groups show them', () => {
    const grouped = sent(loadedAt('/issues'), 'group:status')
    const walked = pressedAll(grouped, [
      'cursor:next',
      'cursor:next',
      'cursor:next',
      'cursor:next',
    ])
    expect(
      Array.flatMap(listSectionsIn(issuesScreen(walked)), row =>
        row.isCurrent === true ? [row.key] : [],
      ),
    ).toEqual(['104'])
  })
})

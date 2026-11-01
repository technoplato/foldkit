import { Array, Effect, Match as M, Option, Stream } from 'effect'
import { type ListItem, type UiNode, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import {
  IssueViewError,
  IssueViews,
  type IssueViewsService,
  SavedView,
  instantIssueViews,
  makeMemoryIssueViews,
  storedViewsQuery,
} from './issueViews.js'
import { type KeyPress, tokenForKeyPress } from './keys.js'
import { type Message, ObservedIssues, ObservedSavedViews } from './message.js'
import { type Model } from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { update } from './update.js'

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
  product: ApplicationProduct.make({ id: 'foldkit', name: 'Foldkit' }),
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
  Issue.make({ ...stored, id: '102' }),
  Issue.make({ ...stored, id: '101', status: 'Closed' }),
]

const LONG_VIEW =
  '/issues?product=foldkit&status=Open&sort=updated&group=priority&view=board'

const listAt = (path: string): Model =>
  update(
    modelForNavigation(pathToNavigation(path)),
    ObservedIssues.make({ issues }),
  )[0]

const closeToLanding = SavedView.make({
  createdAtMs: 1_000,
  id: 'view-1',
  name: 'Close to landing',
  position: 1,
  query: '?landing=close',
  updatedAtMs: 1_000,
})

const foldkitBoard = SavedView.make({
  createdAtMs: 2_000,
  id: 'view-2',
  name: 'Foldkit board',
  position: 2,
  query: '?product=foldkit&view=board',
  updatedAtMs: 2_000,
})

const withViews = (model: Model, views: ReadonlyArray<SavedView>): Model =>
  update(model, ObservedSavedViews.make({ views }))[0]

type Step = ReturnType<typeof update>

const sent = (model: Model, token: string): Step =>
  update(model, Option.getOrThrow(messageForScreenToken(model, token)))

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

const pressed = (model: Model, press: KeyPress): Step =>
  Option.match(tokenForKeyPress(model, press), {
    onNone: () => [model, []],
    onSome: token => sent(model, token),
  })

const settled = async (
  views: IssueViewsService,
  [model, commands]: Step,
  ran: Array<string> = [],
): Promise<Readonly<{ model: Model; ran: ReadonlyArray<string> }>> =>
  Option.match(Array.head(commands), {
    onNone: () => Promise.resolve({ model, ran }),
    onSome: async command => {
      const message = await Effect.runPromise(
        command.effect.pipe(
          Effect.provideService(IssueViews, views),
        ) as Effect.Effect<Message>,
      )
      return settled(views, update(model, message), [...ran, command.name])
    },
  })

const rowsIn = (node: UiNode): ReadonlyArray<ListItem> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ListItem>>(),
    M.tagsExhaustive({
      List: rows => rows.items,
      Row: row => Array.flatMap(row.children, rowsIn),
      Column: column => Array.flatMap(column.children, rowsIn),
      Box: box => Array.flatMap(box.children, rowsIn),
      DeviceShell: shell => Array.flatMap(shell.children, rowsIn),
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Progress: () => [],
      Seek: () => [],
      Transcript: () => [],
    }),
  )

const layerRowsOf = (model: Model): ReadonlyArray<ListItem> => {
  const inLayers = (node: UiNode): ReadonlyArray<ListItem> =>
    node._tag === 'Box' && node.layer !== undefined
      ? rowsIn(node)
      : node._tag === 'Column' || node._tag === 'Row'
        ? Array.flatMap(node.children, inLayers)
        : []
  return inLayers(issuesScreen(model))
}

const chipsOf = (model: Model) =>
  Array.flatMap(textsOf(issuesScreen(model)), text =>
    Array.flatMap(text.parts ?? [], part =>
      part._tag === 'Reference' && part.kind?.endsWith('View') === true
        ? [part]
        : [],
    ),
  )

const memoryViews = (views: ReadonlyArray<SavedView> = []): IssueViewsService =>
  Effect.runSync(makeMemoryIssueViews(views))

const storedRows = (views: IssueViewsService) =>
  Effect.runPromise(
    Stream.runHead(views.observeViews).pipe(
      Effect.map(maybeRows => Option.getOrElse(maybeRows, () => [])),
    ),
  )

describe('Issue Tracker saved views', () => {
  it('saves what the list shows, filters, sort, grouping and layout, under a name', async () => {
    const views = memoryViews()
    const model = withViews(listAt(LONG_VIEW), [])
    const [naming] = sent(model, 'view-save')
    const [named] = sent(naming, 'view-name:Foldkit by priority')
    const { model: done, ran } = await settled(
      views,
      sent(named, 'view-name-submit'),
    )
    expect(ran).toEqual(['CreateIssueView'])
    expect(done.layer._tag).toBe('NoLayer')
    expect(await storedRows(views)).toEqual([
      expect.objectContaining({
        name: 'Foldkit by priority',
        position: 1,
        query:
          '?product=foldkit&status=Open&sort=updated&group=priority&view=board',
      }),
    ])
  })

  it('saves the whole list with an empty query', async () => {
    const views = memoryViews()
    const [naming] = sent(withViews(listAt('/issues'), []), 'view-save')
    const [named] = sent(naming, 'view-name:Everything')
    await settled(views, sent(named, 'view-name-submit'))
    expect(await storedRows(views)).toEqual([
      expect.objectContaining({ query: '' }),
    ])
  })

  it('takes a name from the keyboard, Enter to save and Esc to leave', () => {
    const [naming] = sent(
      withViews(listAt('/issues?landing=close'), []),
      'view-save',
    )
    const [named] = sent(naming, 'view-name:Landing')
    const [left] = pressed(named, on('Escape', { target: 'Field' }))
    expect(left.layer._tag).toBe('NoLayer')
    const [, commands] = pressed(named, on('Enter', { target: 'Field' }))
    expect(Array.map(commands, command => command.name)).toEqual([
      'CreateIssueView',
    ])
  })

  it('refuses an empty name', () => {
    const [naming] = sent(
      withViews(listAt('/issues?landing=close'), []),
      'view-save',
    )
    const [same, commands] = sent(naming, 'view-name-submit')
    expect(commands).toEqual([])
    expect(same.layer._tag).toBe('NamingViewLayer')
  })

  it('puts a new view after the others', async () => {
    const views = memoryViews([closeToLanding, foldkitBoard])
    const [naming] = sent(
      withViews(listAt('/issues?status=Open'), [closeToLanding, foldkitBoard]),
      'view-save',
    )
    const [named] = sent(naming, 'view-name:Open')
    await settled(views, sent(named, 'view-name-submit'))
    expect(Array.map(await storedRows(views), view => view.position)).toEqual([
      1, 2, 3,
    ])
  })

  it('shows each view on the list as a link that opens what it saved', () => {
    const model = withViews(listAt('/issues'), [closeToLanding, foldkitBoard])
    expect(Array.map(chipsOf(model), chip => [chip.label, chip.href])).toEqual([
      ['Close to landing', '/issues?landing=close'],
      ['Foldkit board', '/issues?product=foldkit&view=board'],
    ])
    const opened = pathToNavigation('/issues?product=foldkit&view=board')
    expect(navigationToPath(opened)).toBe('/issues?product=foldkit&view=board')
    expect(opened._tag === 'IssueList' ? opened.view.layout : 'List').toBe(
      'Board',
    )
  })

  it('marks the view on screen, and offers to save one that is not', () => {
    const atSaved = withViews(listAt('/issues?landing=close'), [closeToLanding])
    expect(Array.map(chipsOf(atSaved), chip => chip.kind)).toEqual([
      'CurrentView',
    ])
    expect(messageForScreenToken(atSaved, 'view-save')).toEqual(Option.none())
    const atOther = withViews(listAt('/issues?status=Open'), [closeToLanding])
    expect(Array.map(chipsOf(atOther), chip => chip.kind)).toEqual(['View'])
    expect(Option.isSome(messageForScreenToken(atOther, 'view-save'))).toBe(
      true,
    )
  })

  it('lists the views in a menu, g then v, each a link, Enter opening the marked one', () => {
    const model = withViews(listAt('/issues'), [closeToLanding, foldkitBoard])
    const [pending] = pressed(model, on('g'))
    const [menu] = pressed(pending, on('v'))
    expect(Array.map(layerRowsOf(menu), row => [row.title, row.href])).toEqual([
      ['Close to landing', '/issues?landing=close'],
      ['Foldkit board', '/issues?product=foldkit&view=board'],
    ])
    const [next] = pressed(menu, on('ArrowDown', { target: 'Field' }))
    const [opened] = pressed(next, on('Enter', { target: 'Field' }))
    expect(navigationToPath(opened.navigation)).toBe(
      '/issues?product=foldkit&view=board',
    )
  })

  it('offers each view in the palette', () => {
    const model = withViews(listAt('/issues'), [closeToLanding])
    const [palette] = pressed(model, on('k', { isMeta: true }))
    expect(Array.map(layerRowsOf(palette), row => row.title)).toContain(
      'View: Close to landing',
    )
  })

  it('renames a view, keeping what it shows', async () => {
    const views = memoryViews([closeToLanding])
    const model = withViews(listAt('/issues'), [closeToLanding])
    const [naming] = sent(model, 'view-rename:view-1')
    const [named] = sent(naming, 'view-name:Nearly there')
    const { ran } = await settled(views, sent(named, 'view-name-submit'))
    expect(ran).toEqual(['UpdateIssueView'])
    expect(await storedRows(views)).toEqual([
      expect.objectContaining({
        id: 'view-1',
        name: 'Nearly there',
        query: '?landing=close',
      }),
    ])
  })

  it('puts what the list shows now into a view', async () => {
    const views = memoryViews([closeToLanding])
    const model = withViews(listAt('/issues?status=Open'), [closeToLanding])
    const { ran } = await settled(views, sent(model, 'view-update:view-1'))
    expect(ran).toEqual(['UpdateIssueView'])
    expect(await storedRows(views)).toEqual([
      expect.objectContaining({
        name: 'Close to landing',
        query: '?status=Open',
      }),
    ])
  })

  it('moves a view by writing one row, between its new neighbours', async () => {
    const third = SavedView.make({ ...foldkitBoard, id: 'view-3', position: 3 })
    const views = memoryViews([closeToLanding, foldkitBoard, third])
    const model = withViews(listAt('/issues'), [
      closeToLanding,
      foldkitBoard,
      third,
    ])
    const { ran } = await settled(views, sent(model, 'view-up:view-3'))
    expect(ran).toEqual(['UpdateIssueView'])
    expect(
      Array.map(await storedRows(views), view => [view.id, view.position]),
    ).toEqual([
      ['view-1', 1],
      ['view-3', 1.5],
      ['view-2', 2],
    ])
    const toTheEnd = await settled(views, sent(model, 'view-down:view-1'))
    expect(toTheEnd.ran).toEqual(['UpdateIssueView'])
  })

  it('deletes a view', async () => {
    const views = memoryViews([closeToLanding, foldkitBoard])
    const model = withViews(listAt('/issues'), [closeToLanding, foldkitBoard])
    const { ran } = await settled(views, sent(model, 'view-delete:view-1'))
    expect(ran).toEqual(['DeleteIssueView'])
    expect(Array.map(await storedRows(views), view => view.id)).toEqual([
      'view-2',
    ])
  })

  it('says why when a view does not save', async () => {
    const refusing: IssueViewsService = {
      ...memoryViews(),
      createView: () =>
        Effect.fail(
          new IssueViewError({ cause: new Error('Permission denied') }),
        ),
    }
    const [naming] = sent(withViews(listAt('/issues'), []), 'view-save')
    const [named] = sent(naming, 'view-name:Everything')
    const { model } = await settled(refusing, sent(named, 'view-name-submit'))
    expect(
      Array.map(textsOf(issuesScreen(model)), text => text.content),
    ).toContain('Not saved: view Everything: Permission denied')
  })
})

describe('Issue Tracker saved views on Instant', () => {
  type Written = ReadonlyArray<unknown>

  const fakeDatabase = (
    rows: ReadonlyArray<unknown>,
    written: Array<Written> = [],
  ) => ({
    newId: () => 'made-id',
    nowMs: () => 5_000,
    ownerUserId: 'owner-1',
    subscribeQuery: (
      _query: unknown,
      onResponse: (response: { data?: unknown; error?: unknown }) => void,
    ) => {
      onResponse({ data: { issueViews: rows } })
      return () => undefined
    },
    deleteRow: (viewId: string) => {
      written.push(['delete', viewId])
      return Promise.resolve()
    },
    saveRow: (viewId: string, row: unknown) => {
      written.push(['save', viewId, row])
      return Promise.resolve()
    },
  })

  const serviceOver = (database: ReturnType<typeof fakeDatabase>) =>
    instantIssueViews(Effect.succeed(database))

  it('asks only for the fields a view needs', () => {
    expect(storedViewsQuery.issueViews.$.fields).toEqual([
      'createdAtMs',
      'name',
      'position',
      'query',
      'updatedAtMs',
    ])
  })

  it('reads the rows in their order', async () => {
    const service = serviceOver(
      fakeDatabase([
        {
          createdAtMs: 2,
          id: 'b',
          name: 'Second',
          position: 2,
          query: '',
          updatedAtMs: 2,
        },
        {
          createdAtMs: 1,
          id: 'a',
          name: 'First',
          position: 1,
          query: '?landing=close',
          updatedAtMs: 1,
        },
      ]),
    )
    const views = await storedRows(service)
    expect(Array.map(views, view => view.name)).toEqual(['First', 'Second'])
  })

  it('writes a new row with Scribe owner fields', async () => {
    const written: Array<Written> = []
    const service = serviceOver(fakeDatabase([], written))
    await Effect.runPromise(
      service.createView({ name: 'Mine', position: 1, query: '?view=board' }),
    )
    expect(written).toEqual([
      [
        'save',
        'made-id',
        {
          createdAtMs: 5_000,
          formatVersion: 1,
          name: 'Mine',
          ownerUserID: 'owner-1',
          position: 1,
          query: '?view=board',
          updatedAtMs: 5_000,
        },
      ],
    ])
  })

  it('writes only what can change on a saved row', async () => {
    const written: Array<Written> = []
    const service = serviceOver(fakeDatabase([], written))
    await Effect.runPromise(
      service.updateView({ ...closeToLanding, name: 'Renamed' }),
    )
    expect(written).toEqual([
      [
        'save',
        'view-1',
        {
          name: 'Renamed',
          position: 1,
          query: '?landing=close',
          updatedAtMs: 5_000,
        },
      ],
    ])
  })

  it('deletes by id', async () => {
    const written: Array<Written> = []
    const service = serviceOver(fakeDatabase([], written))
    await Effect.runPromise(service.deleteView('view-1'))
    expect(written).toEqual([['delete', 'view-1']])
  })
})

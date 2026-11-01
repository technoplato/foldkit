import { Array, Match as M, Option } from 'effect'
import {
  type ListItem,
  type TextInputNode,
  type UiNode,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { type KeyPress, tokenForKeyPress } from './keys.js'
import { ObservedIssues, ObservedProducts } from './message.js'
import { Backlog, IssueDetail, IssueList, type Model } from './model.js'
import { interactionsForModel, messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { update } from './update.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })

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

const issues = [
  Issue.make({ ...stored, createdAtMs: 4_000, id: '1358', title: 'CPU burns' }),
  Issue.make({ ...stored, createdAtMs: 3_000, id: '103', title: 'Third' }),
]

const list = (): Model =>
  update(
    update(
      modelForNavigation(IssueList.make({})),
      ObservedIssues.make({ issues }),
    )[0],
    ObservedProducts.make({
      products: [{ product: scribe, updatedAtMs: 1_000 }],
    }),
  )[0]

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

const pressed = (model: Model, press: KeyPress): Model =>
  Option.match(tokenForKeyPress(model, press), {
    onNone: () => model,
    onSome: token =>
      update(model, Option.getOrThrow(messageForScreenToken(model, token)))[0],
  })

const sent = (model: Model, token: string): Model =>
  update(model, Option.getOrThrow(messageForScreenToken(model, token)))[0]

const opened = (model: Model): Model =>
  pressed(model, on('k', { isMeta: true }))

const typed = (model: Model, query: string): Model =>
  sent(model, `palette:${query}`)

const FIELD: Partial<Omit<KeyPress, 'key'>> = { target: 'Field' }

type Painted = Readonly<{
  layerLabels: ReadonlyArray<string>
  rows: ReadonlyArray<ListItem>
  fields: ReadonlyArray<TextInputNode>
  texts: ReadonlyArray<string>
}>

const nothingPainted: Painted = {
  fields: [],
  layerLabels: [],
  rows: [],
  texts: [],
}

const merged = (parts: ReadonlyArray<Painted>): Painted =>
  Array.reduce(parts, nothingPainted, (all, part) => ({
    fields: [...all.fields, ...part.fields],
    layerLabels: [...all.layerLabels, ...part.layerLabels],
    rows: [...all.rows, ...part.rows],
    texts: [...all.texts, ...part.texts],
  }))

const paintedIn = (node: UiNode): Painted =>
  M.value(node).pipe(
    M.withReturnType<Painted>(),
    M.tagsExhaustive({
      List: rows => ({ ...nothingPainted, rows: rows.items }),
      Row: row => merged(Array.map(row.children, paintedIn)),
      Column: column => merged(Array.map(column.children, paintedIn)),
      Box: box => merged(Array.map(box.children, paintedIn)),
      DeviceShell: shell => merged(Array.map(shell.children, paintedIn)),
      Text: text => ({ ...nothingPainted, texts: [text.content] }),
      Button: () => nothingPainted,
      TextInput: input => ({ ...nothingPainted, fields: [input] }),
      Spacer: () => nothingPainted,
      Progress: () => nothingPainted,
      Seek: () => nothingPainted,
      Transcript: () => nothingPainted,
    }),
  )

const layersIn = (node: UiNode): ReadonlyArray<Painted & { label: string }> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<Painted & { label: string }>>(),
    M.tagsExhaustive({
      List: () => [],
      Row: row => Array.flatMap(row.children, layersIn),
      Column: column => Array.flatMap(column.children, layersIn),
      Box: box =>
        box.layer === undefined
          ? Array.flatMap(box.children, layersIn)
          : [
              {
                ...merged(Array.map(box.children, paintedIn)),
                label: box.layer.label,
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

const paletteOf = (model: Model) =>
  Array.findFirst(
    layersIn(issuesScreen(model)),
    layer => layer.label === 'Command palette',
  )

const paletteTitlesOf = (model: Model): ReadonlyArray<string> =>
  Option.match(paletteOf(model), {
    onNone: () => [],
    onSome: palette => Array.map(palette.rows, row => row.title),
  })

const markedTitleOf = (model: Model): Option.Option<string> =>
  Option.flatMap(paletteOf(model), palette =>
    Option.map(
      Array.findFirst(palette.rows, row => row.isCurrent === true),
      row => row.title,
    ),
  )

describe('Issue Tracker command palette', () => {
  it('opens on Cmd+K and Ctrl+K, from any page and from a field, and closes on Esc and Cmd+K', () => {
    expect(paletteOf(list())).toEqual(Option.none())
    expect(Option.isSome(paletteOf(opened(list())))).toBe(true)
    expect(
      Option.isSome(paletteOf(pressed(list(), on('k', { isControl: true })))),
    ).toBe(true)
    expect(
      Option.isSome(
        paletteOf(pressed(list(), on('k', { isMeta: true, target: 'Field' }))),
      ),
    ).toBe(true)
    expect(Option.isSome(paletteOf(opened(sent(list(), 'backlog'))))).toBe(true)
    expect(
      Option.isSome(paletteOf(pressed(opened(list()), on('Escape', FIELD)))),
    ).toBe(false)
    expect(Option.isSome(paletteOf(opened(opened(list()))))).toBe(false)
  })

  it('puts its field in the focus, and takes keys only for itself', () => {
    const palette = opened(list())
    expect(
      Option.map(paletteOf(palette), found =>
        Array.map(found.fields, field => field.focused),
      ),
    ).toEqual(Option.some([true]))
    expect(tokenForKeyPress(palette, on('j', FIELD))).toEqual(Option.none())
    expect(tokenForKeyPress(palette, on('j'))).toEqual(Option.none())
    expect(tokenForKeyPress(palette, on('c'))).toEqual(Option.none())
  })

  it('lists every place and action the program offers, by name', () => {
    const titles = paletteTitlesOf(opened(list()))
    expect(titles).toEqual(
      expect.arrayContaining([
        'Go to list',
        'Go to backlog',
        'Go to triage',
        'File issue',
        'Search Issues',
        'Product: Scribe',
        'Product: All products',
        'Work: Close to landing',
        'Work: Working now',
        'Work: All work',
      ]),
    )
  })

  it('offers everything the page offers, but opening each Issue one by one', () => {
    const palette = opened(list())
    const offered = Option.match(paletteOf(palette), {
      onNone: () => [],
      onSome: found => Array.map(found.rows, row => row.key),
    })
    const pageTokens = Array.filter(
      Array.map(interactionsForModel(list()), action => action.token),
      token =>
        !token.startsWith('open:') &&
        !token.startsWith('menu:') &&
        !Array.contains(['triage', 'backlog'], token),
    )
    expect(offered).toEqual(expect.arrayContaining(pageTokens))
    expect(Array.filter(offered, token => token.startsWith('open:'))).toEqual(
      [],
    )
  })

  it('matches names fuzzily, the closest first', () => {
    expect(Array.head(paletteTitlesOf(typed(opened(list()), 'bklg')))).toEqual(
      Option.some('Go to backlog'),
    )
    expect(Array.head(paletteTitlesOf(typed(opened(list()), 'close')))).toEqual(
      Option.some('Work: Close to landing'),
    )
    expect(Array.head(paletteTitlesOf(typed(opened(list()), 'gtt')))).toEqual(
      Option.some('Go to triage'),
    )
    expect(Array.head(paletteTitlesOf(typed(opened(list()), 'FILE')))).toEqual(
      Option.some('File issue'),
    )
  })

  it('runs the marked row on Enter, and moves the mark with the arrows', () => {
    const palette = typed(opened(list()), 'go to')
    expect(markedTitleOf(palette)).toEqual(Option.some('Go to list'))
    const down = pressed(palette, on('ArrowDown', FIELD))
    expect(markedTitleOf(down)).toEqual(Option.some('Go to backlog'))
    expect(markedTitleOf(pressed(down, on('ArrowUp', FIELD)))).toEqual(
      Option.some('Go to list'),
    )
    const ran = pressed(down, on('Enter', FIELD))
    expect(ran.navigation).toEqual(Backlog.make({}))
    expect(paletteOf(ran)).toEqual(Option.none())
  })

  it('stops the mark at each end of the list', () => {
    const palette = typed(opened(list()), 'gtb')
    expect(markedTitleOf(pressed(palette, on('ArrowDown', FIELD)))).toEqual(
      Option.some('Go to backlog'),
    )
    expect(markedTitleOf(pressed(palette, on('ArrowUp', FIELD)))).toEqual(
      Option.some('Go to backlog'),
    )
  })

  it('runs a row a person clicks', () => {
    const palette = opened(list())
    const row = Option.getOrThrow(
      Option.flatMap(paletteOf(palette), found =>
        Array.findFirst(found.rows, candidate => candidate.key === 'file'),
      ),
    )
    const ran = sent(palette, row.action ?? '')
    expect(ran.navigation._tag).toBe('FileIssue')
    expect(paletteOf(ran)).toEqual(Option.none())
  })

  it('goes to the Issue a typed number names', () => {
    const palette = typed(opened(list()), '1358')
    expect(Array.head(paletteTitlesOf(palette))).toEqual(
      Option.some('Go to Issue 1358: CPU burns'),
    )
    expect(pressed(palette, on('Enter', FIELD)).navigation).toEqual(
      IssueDetail.make({ issueId: '1358' }),
    )
  })

  it('goes to an Issue by the words of its title, after the actions', () => {
    expect(paletteTitlesOf(typed(opened(list()), 'burns'))).toEqual([
      'Go to Issue 1358: CPU burns',
    ])
  })

  it('says when nothing matches', () => {
    const palette = typed(opened(list()), 'zzzzqqq')
    expect(paletteTitlesOf(palette)).toEqual([])
    expect(Option.map(paletteOf(palette), found => found.texts)).toEqual(
      Option.some(['Nothing matches "zzzzqqq".']),
    )
  })
})

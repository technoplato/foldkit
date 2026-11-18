import { Array, Match as M, Option } from 'effect'
import { type ListItem, type UiNode, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { type KeyPress, tokenForKeyPress } from './keys.js'
import { ObservedIssues } from './message.js'
import { IssueDetail, IssueList, type Model } from './model.js'
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
  Issue.make({
    ...stored,
    createdAtMs: 3_000,
    details: 'Details of the third.',
    id: '103',
    title: 'Third',
  }),
  Issue.make({
    ...stored,
    createdAtMs: 2_000,
    details: 'Details of the second.',
    id: '102',
    title: 'Second',
  }),
]

const list = (): Model =>
  update(
    modelForNavigation(IssueList.make({})),
    ObservedIssues.make({ issues }),
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

const pressedAll = (model: Model, keys: ReadonlyArray<string>): Model =>
  Array.reduce(keys, model, (current, key) => pressed(current, on(key)))

type Layer = Readonly<{
  kind: string
  label: string
  words: ReadonlyArray<string>
}>

const layersIn = (node: UiNode): ReadonlyArray<Layer> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<Layer>>(),
    M.tagsExhaustive({
      List: () => [],
      Row: row => Array.flatMap(row.children, layersIn),
      Column: column => Array.flatMap(column.children, layersIn),
      Box: box =>
        box.layer === undefined
          ? Array.flatMap(box.children, layersIn)
          : [
              {
                kind: box.layer.kind,
                label: box.layer.label,
                words: Array.map(textsOf(box), text => text.content),
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

const rowsIn = (node: UiNode): ReadonlyArray<ListItem> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ListItem>>(),
    M.tagsExhaustive({
      List: rows => rows.items,
      Row: row => Array.flatMap(row.children, rowsIn),
      Column: column => Array.flatMap(column.children, rowsIn),
      Box: box =>
        box.layer === undefined ? Array.flatMap(box.children, rowsIn) : [],
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

const peekOf = (model: Model): Option.Option<Layer> =>
  Array.findFirst(
    layersIn(issuesScreen(model)),
    layer => layer.kind === 'Panel',
  )

describe('Issue Tracker peek', () => {
  it('shows the Issue under the cursor in a side Panel over the list on Space', () => {
    const peeking = pressedAll(list(), ['j', ' '])
    expect(Option.map(peekOf(peeking), layer => layer.label)).toEqual(
      Option.some('Peek at #103'),
    )
    expect(
      Option.map(peekOf(peeking), layer =>
        Array.contains(layer.words, 'Details of the third.'),
      ),
    ).toEqual(Option.some(true))
    expect(peeking.navigation).toEqual(IssueList.make({}))
    expect(Array.map(rowsIn(issuesScreen(peeking)), row => row.key)).toEqual([
      '103',
      '102',
    ])
  })

  it('leaves Space to the browser with no row under the cursor', () => {
    expect(tokenForKeyPress(list(), on(' '))).toEqual(Option.none())
  })

  it('closes on Esc and on Space, the cursor where it was', () => {
    const peeking = pressedAll(list(), ['j', 'j', ' '])
    const closed = pressed(peeking, on('Escape'))
    expect(peekOf(closed)).toEqual(Option.none())
    expect(closed.maybeRowCursor).toEqual(Option.some('102'))
    expect(peekOf(pressed(peeking, on(' ')))).toEqual(Option.none())
    expect(closed.navigation).toEqual(IssueList.make({}))
  })

  it('follows the cursor with j and k', () => {
    const peeking = pressedAll(list(), ['j', ' '])
    const next = pressed(peeking, on('j'))
    expect(Option.map(peekOf(next), layer => layer.label)).toEqual(
      Option.some('Peek at #102'),
    )
    expect(
      Option.map(peekOf(pressed(next, on('k'))), layer => layer.label),
    ).toEqual(Option.some('Peek at #103'))
  })

  it('opens the page with Enter', () => {
    const opened = pressedAll(list(), ['j', ' ', 'Enter'])
    expect(opened.navigation).toEqual(IssueDetail.make({ issueId: '103' }))
    expect(peekOf(opened)).toEqual(Option.none())
  })

  it('takes no other page key while it shows, and the palette still opens', () => {
    const peeking = pressedAll(list(), ['j', ' '])
    expect(tokenForKeyPress(peeking, on('c'))).toEqual(Option.none())
    expect(tokenForKeyPress(peeking, on('/'))).toEqual(Option.none())
    expect(tokenForKeyPress(peeking, on('k', { isMeta: true }))).toEqual(
      Option.some('palette'),
    )
  })

  it('makes the status buttons of the page it shows work on the Issue it shows, staying in the peek', () => {
    const peeking = pressedAll(list(), ['j', ' '])
    const [next, commands] = update(
      peeking,
      Option.getOrThrow(messageForScreenToken(peeking, 'status:Blocked')),
    )
    expect(next.layer._tag).toBe('PeekLayer')
    expect(Array.map(commands, command => command.name)).toEqual([
      'SetIssueStatus',
    ])
  })

  it('says so when the Issue it shows is gone', () => {
    const peeking = pressedAll(list(), ['j', ' '])
    const gone = update(
      peeking,
      ObservedIssues.make({
        issues: Array.filter(issues, i => i.id !== '103'),
      }),
    )[0]
    expect(Option.map(peekOf(gone), layer => layer.words)).toEqual(
      Option.some(['#103 is no longer stored.']),
    )
  })
})

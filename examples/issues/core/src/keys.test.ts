import { Array, Match as M, Option } from 'effect'
import {
  type ListItem,
  type UiNode,
  inputsOf,
  textsOf,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { type KeyPress, tokenForKeyPress } from './keys.js'
import { ObservedIssues } from './message.js'
import {
  Backlog,
  FileIssue,
  IssueDetail,
  IssueList,
  type Model,
  TriageInbox,
} from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen, issuesValid } from './program.js'
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
  Issue.make({ ...stored, createdAtMs: 4_000, id: '104', title: 'Fourth' }),
  Issue.make({ ...stored, createdAtMs: 3_000, id: '103', title: 'Third' }),
  Issue.make({ ...stored, createdAtMs: 2_000, id: '102', title: 'Second' }),
  Issue.make({ ...stored, createdAtMs: 1_000, id: '101', title: 'First' }),
]

const onPage = (navigation: Parameters<typeof modelForNavigation>[0]): Model =>
  update(modelForNavigation(navigation), ObservedIssues.make({ issues }))[0]

const list = (): Model => onPage(IssueList.make({}))

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

const rowsOf = (node: UiNode): ReadonlyArray<ListItem> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ListItem>>(),
    M.tagsExhaustive({
      List: rows => rows.items,
      Row: row => Array.flatMap(row.children, rowsOf),
      Column: column => Array.flatMap(column.children, rowsOf),
      Box: box =>
        box.layer === undefined ? Array.flatMap(box.children, rowsOf) : [],
      DeviceShell: shell => Array.flatMap(shell.children, rowsOf),
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Progress: () => [],
      Seek: () => [],
      Transcript: () => [],
    }),
  )

const markedRowsOf = (model: Model): ReadonlyArray<string> =>
  Array.flatMap(rowsOf(issuesScreen(model)), row =>
    row.isCurrent === true ? [row.key] : [],
  )

const searchFieldOf = (model: Model) =>
  Array.findFirst(
    inputsOf(issuesScreen(model)),
    input => input.label === 'Search Issues',
  )

const isSearchFocused = (model: Model): boolean =>
  Option.exists(searchFieldOf(model), input => input.focused === true)

describe('Issue Tracker keys: the row cursor', () => {
  it('moves through the rows with j and k, marks the row under it, and stops at each end', () => {
    expect(markedRowsOf(list())).toEqual([])
    expect(markedRowsOf(pressedAll(list(), ['j']))).toEqual(['104'])
    expect(markedRowsOf(pressedAll(list(), ['j', 'j']))).toEqual(['103'])
    expect(markedRowsOf(pressedAll(list(), ['j', 'j', 'k']))).toEqual(['104'])
    expect(markedRowsOf(pressedAll(list(), ['j', 'k', 'k']))).toEqual(['104'])
    expect(
      markedRowsOf(pressedAll(list(), ['j', 'j', 'j', 'j', 'j', 'j'])),
    ).toEqual(['101'])
  })

  it('moves the same way with the arrow keys', () => {
    expect(
      markedRowsOf(pressedAll(list(), ['ArrowDown', 'ArrowDown', 'ArrowUp'])),
    ).toEqual(['104'])
  })

  it('opens the row under the cursor with Enter', () => {
    expect(pressedAll(list(), ['j', 'j', 'Enter']).navigation).toEqual(
      IssueDetail.make({ issueId: '103' }),
    )
  })

  it('leaves Enter and Space to a link or button that holds the focus', () => {
    const atRow = pressedAll(list(), ['j'])
    expect(tokenForKeyPress(atRow, on('Enter', { target: 'Control' }))).toEqual(
      Option.none(),
    )
    expect(tokenForKeyPress(atRow, on(' ', { target: 'Control' }))).toEqual(
      Option.none(),
    )
    expect(tokenForKeyPress(list(), on('Enter'))).toEqual(Option.none())
  })

  it('keeps the cursor on its Issue through a live change that moves the Issue', () => {
    const atThird = pressedAll(list(), ['j', 'j'])
    const moved = update(
      atThird,
      ObservedIssues.make({
        issues: [
          Issue.make({
            ...stored,
            createdAtMs: 5_000,
            id: '105',
            title: 'New',
          }),
          ...issues,
        ],
      }),
    )[0]
    expect(markedRowsOf(moved)).toEqual(['103'])
    expect(markedRowsOf(pressedAll(moved, ['k']))).toEqual(['104'])
  })

  it('starts again at the first row when the Issue under it leaves the list', () => {
    const atThird = pressedAll(list(), ['j', 'j'])
    const gone = update(
      atThird,
      ObservedIssues.make({
        issues: Array.filter(issues, issue => issue.id !== '103'),
      }),
    )[0]
    expect(markedRowsOf(gone)).toEqual([])
    expect(markedRowsOf(pressedAll(gone, ['j']))).toEqual(['104'])
  })

  it('walks the backlog in its order', () => {
    const backlog = onPage(Backlog.make({}))
    expect(markedRowsOf(pressedAll(backlog, ['j', 'j']))).toEqual(['102'])
    expect(pressedAll(backlog, ['j', 'Enter']).navigation).toEqual(
      IssueDetail.make({ issueId: '101' }),
    )
  })

  it('ignores a key held with Cmd, Ctrl or Alt', () => {
    expect(tokenForKeyPress(list(), on('j', { isMeta: true }))).toEqual(
      Option.none(),
    )
    expect(tokenForKeyPress(list(), on('j', { isControl: true }))).toEqual(
      Option.none(),
    )
    expect(tokenForKeyPress(list(), on('j', { isAlt: true }))).toEqual(
      Option.none(),
    )
  })
})

describe('Issue Tracker keys: the search field', () => {
  it('focuses the search with /, from any page', () => {
    expect(isSearchFocused(list())).toBe(false)
    expect(isSearchFocused(pressedAll(list(), ['/']))).toBe(true)
    const fromFile = pressedAll(onPage(FileIssue.make({})), ['/'])
    expect(fromFile.navigation._tag).toBe('IssueList')
    expect(isSearchFocused(fromFile)).toBe(true)
  })

  it('never fires while typing in a field, except Esc', () => {
    const field = { target: 'Field' as const }
    Array.forEach(['j', 'k', '/', 'c', 'g', ' ', 'x', 's', 'p', 'a'], key => {
      expect(tokenForKeyPress(list(), on(key, field))).toEqual(Option.none())
    })
    expect(
      tokenForKeyPress(pressedAll(list(), ['/']), on('Escape', field)),
    ).not.toEqual(Option.none())
  })

  it('clears the search with Esc, then leaves the field', () => {
    const field = { target: 'Field' as const }
    const typed = update(
      pressedAll(list(), ['/']),
      Option.getOrThrow(messageForScreenToken(list(), 'search:third')),
    )[0]
    const cleared = pressed(typed, on('Escape', field))
    expect(cleared.navigation).toEqual(IssueList.make({}))
    expect(isSearchFocused(cleared)).toBe(true)
    const left = pressed(cleared, on('Escape', field))
    expect(isSearchFocused(left)).toBe(false)
    expect(tokenForKeyPress(left, on('Escape'))).toEqual(Option.none())
  })

  it('opens a typed number with Enter, or the row under the cursor', () => {
    const field = { target: 'Field' as const }
    const typedNumber = update(
      pressedAll(list(), ['/']),
      Option.getOrThrow(messageForScreenToken(list(), 'search:102')),
    )[0]
    expect(pressed(typedNumber, on('Enter', field)).navigation).toEqual(
      IssueDetail.make({ issueId: '102' }),
    )
    const typedWords = update(
      pressedAll(list(), ['/']),
      Option.getOrThrow(messageForScreenToken(list(), 'search:wrong')),
    )[0]
    const walked = pressed(typedWords, on('ArrowDown', field))
    const walkedOn = pressed(walked, on('j'))
    expect(walkedOn.navigation).toEqual(
      IssueList.make({ view: { query: 'wrong' } }),
    )
    expect(pressed(walkedOn, on('Enter')).navigation).toEqual(
      IssueDetail.make({ issueId: '103' }),
    )
  })

  it('leaves the field for the rows on an arrow, so j and k walk what it found', () => {
    const field = { target: 'Field' as const }
    const searching = pressedAll(list(), ['/'])
    const down = pressed(searching, on('ArrowDown', field))
    expect(isSearchFocused(down)).toBe(false)
    expect(markedRowsOf(down)).toEqual(['104'])
  })

  it('tells the Model when the field gains and loses the focus', () => {
    const focused = update(
      list(),
      Option.getOrThrow(messageForScreenToken(list(), 'search-focus')),
    )[0]
    expect(isSearchFocused(focused)).toBe(true)
    const blurred = update(
      focused,
      Option.getOrThrow(messageForScreenToken(focused, 'search-blur')),
    )[0]
    expect(isSearchFocused(blurred)).toBe(false)
    const field = Option.getOrThrow(searchFieldOf(focused))
    expect(field.focusToken).toBe('search-focus')
    expect(field.blurToken).toBe('search-blur')
  })
})

describe('Issue Tracker keys: going places', () => {
  it('goes to the backlog, triage and the list with g then b, t or l', () => {
    expect(pressedAll(list(), ['g', 'b']).navigation).toEqual(Backlog.make({}))
    expect(pressedAll(list(), ['g', 't']).navigation).toEqual(
      TriageInbox.make({}),
    )
    expect(pressedAll(onPage(Backlog.make({})), ['g', 'l']).navigation).toEqual(
      IssueList.make({}),
    )
  })

  it('shows what g waits for, and any other key lets it go', () => {
    const waiting = pressedAll(list(), ['g'])
    expect(
      Array.map(textsOf(issuesScreen(waiting)), text => text.content),
    ).toContain('Go to: l list, b backlog, t triage')
    const letGo = pressedAll(waiting, ['q'])
    expect(
      Array.map(textsOf(issuesScreen(letGo)), text => text.content),
    ).not.toContain('Go to: l list, b backlog, t triage')
    expect(letGo.navigation).toEqual(IssueList.make({}))
    expect(markedRowsOf(pressedAll(letGo, ['j']))).toEqual(['104'])
  })

  it('opens the file form with c, and goes back with Esc', () => {
    const filing = pressedAll(list(), ['c'])
    expect(filing.navigation).toEqual(FileIssue.make({}))
    expect(pressedAll(filing, ['Escape']).navigation._tag).toBe('IssueList')
  })

  it('goes back from an Issue with Esc to the same search and the same row', () => {
    const searched = update(
      list(),
      Option.getOrThrow(messageForScreenToken(list(), 'search:wrong')),
    )[0]
    const opened = pressedAll(searched, ['j', 'j', 'Enter'])
    expect(opened.navigation).toEqual(IssueDetail.make({ issueId: '103' }))
    const back = pressedAll(opened, ['Escape'])
    expect(back.navigation).toEqual(
      IssueList.make({ view: { query: 'wrong' } }),
    )
    expect(markedRowsOf(back)).toEqual(['103'])
  })

  it('declares every key on the action it presses, for every host', () => {
    const keysOf = (token: string): ReadonlyArray<string> =>
      Option.match(
        Array.findFirst(issuesValid(list()), action => action.token === token),
        { onNone: () => [], onSome: action => action.keys },
      )
    expect(keysOf('cursor:next')).toEqual(['j', 'ArrowDown'])
    expect(keysOf('cursor:previous')).toEqual(['k', 'ArrowUp'])
    expect(keysOf('search-focus')).toEqual(['/'])
    expect(keysOf('file')).toEqual(['c'])
    expect(keysOf('go')).toEqual(['g'])
  })
})

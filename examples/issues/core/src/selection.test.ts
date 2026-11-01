import { Array, Effect, Match as M, Option } from 'effect'
import { type ListItem, type UiNode, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueTracker,
  IssueTrackerError,
  type IssueTrackerService,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { IssueIdentity, type IssueIdentityService } from './issueIdentity.js'
import { type KeyPress, tokenForKeyPress } from './keys.js'
import { type Message, ObservedIssues } from './message.js'
import { IssueList, type Model } from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { makeMemoryIssueTracker } from './resources.js'
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

const ROW_COUNT = 10
const FIRST_NUMBER = 101

const issues = Array.makeBy(ROW_COUNT, position =>
  Issue.make({
    ...stored,
    createdAtMs: 100_000 - position,
    id: (FIRST_NUMBER + position).toString(),
    title: `Issue ${(FIRST_NUMBER + position).toString()}`,
  }),
)

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

const SHIFT = { isShift: true }

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

const selectedRowsOf = (model: Model): ReadonlyArray<string> =>
  Array.flatMap(rowsIn(issuesScreen(model)), row =>
    row.check?.isChecked === true ? [row.key] : [],
  )

const wordsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const authoredBy = (author: string): IssueIdentityService => ({
  author: Effect.succeed(author),
  next: Effect.succeed({ id: 'issue-preview', nowMs: 2_000 }),
})

type Step = ReturnType<typeof update>

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

const failingOn = (
  tracker: IssueTrackerService,
  failingId: string,
): IssueTrackerService => ({
  ...tracker,
  update: (issueId, change) =>
    issueId === failingId
      ? Effect.fail(
          new IssueTrackerError({ cause: 'Refused', operation: 'Update' }),
        )
      : tracker.update(issueId, change),
})

const pickedKey = (model: Model, key: string): Step =>
  update(
    model,
    Option.getOrThrow(
      messageForScreenToken(
        model,
        Option.getOrThrow(tokenForKeyPress(model, on(key))),
      ),
    ),
  )

describe('Issue Tracker selection', () => {
  it('selects and lets go of the row under the cursor with x', () => {
    const selected = pressedAll(list(), ['j', 'x'])
    expect(selectedRowsOf(selected)).toEqual(['101'])
    const more = pressedAll(selected, ['j', 'j', 'x'])
    expect(selectedRowsOf(more)).toEqual(['101', '103'])
    expect(selectedRowsOf(pressedAll(more, ['x']))).toEqual(['101'])
  })

  it('moves to the first row when x finds no row under the cursor', () => {
    const moved = pressedAll(list(), ['x'])
    expect(moved.maybeRowCursor).toEqual(Option.some('101'))
    expect(selectedRowsOf(moved)).toEqual([])
  })

  it('extends the selection with Shift+j and Shift+k, from where it started', () => {
    const atThird = pressedAll(list(), ['j', 'j', 'j'])
    const down = pressed(pressed(atThird, on('J', SHIFT)), on('J', SHIFT))
    expect(selectedRowsOf(down)).toEqual(['103', '104', '105'])
    expect(down.maybeRowCursor).toEqual(Option.some('105'))
    const back = pressed(pressed(down, on('K', SHIFT)), on('K', SHIFT))
    expect(selectedRowsOf(back)).toEqual(['103'])
    const up = pressed(back, on('K', SHIFT))
    expect(selectedRowsOf(up)).toEqual(['102', '103'])
    expect(selectedRowsOf(pressed(atThird, on('ArrowDown', SHIFT)))).toEqual([
      '103',
      '104',
    ])
  })

  it('keeps what x chose when Shift extends another run', () => {
    const chosen = pressedAll(list(), ['j', 'x', 'j', 'j', 'j', 'x'])
    expect(selectedRowsOf(pressed(chosen, on('J', SHIFT)))).toEqual([
      '101',
      '104',
      '105',
    ])
  })

  it('extends to a row a person Shift-clicks', () => {
    const atSecond = pressedAll(list(), ['j', 'j'])
    const clicked = update(
      atSecond,
      Option.getOrThrow(messageForScreenToken(atSecond, 'select-to:105')),
    )[0]
    expect(selectedRowsOf(clicked)).toEqual(['102', '103', '104', '105'])
    expect(clicked.maybeRowCursor).toEqual(Option.some('105'))
  })

  it('clears the selection with Esc, before the search and the cursor', () => {
    const searched = update(
      list(),
      Option.getOrThrow(messageForScreenToken(list(), 'search:Issue')),
    )[0]
    const selected = pressedAll(searched, ['j', 'x'])
    const cleared = pressedAll(selected, ['Escape'])
    expect(selectedRowsOf(cleared)).toEqual([])
    expect(cleared.navigation).toEqual(
      IssueList.make({ view: { query: 'Issue' } }),
    )
    const noSearch = pressedAll(cleared, ['Escape'])
    expect(noSearch.navigation).toEqual(IssueList.make({}))
    expect(noSearch.maybeRowCursor).toEqual(Option.some('101'))
    expect(pressedAll(noSearch, ['Escape']).maybeRowCursor).toEqual(
      Option.none(),
    )
  })

  it('keeps the selection for when the list comes back, and leaves Esc to go back on an Issue page', () => {
    const selected = pressedAll(list(), ['j', 'x', 'j'])
    const opened = pressedAll(selected, ['Enter'])
    expect(opened.navigation._tag).toBe('IssueDetail')
    expect(wordsOf(opened).join(' ')).not.toContain('selected')
    const back = pressedAll(opened, ['Escape'])
    expect(back.navigation._tag).toBe('IssueList')
    expect(selectedRowsOf(back)).toEqual(['101'])
  })

  it('says how many are selected and what the keys do', () => {
    expect(wordsOf(pressedAll(list(), ['j', 'x']))).toContain(
      '1 selected: s status, p priority, a claim, x let go, Esc clear',
    )
  })

  it('names the Issues in hand in the menu', () => {
    const selected = pressedAll(list(), ['j', 'x', 'j', 'x'])
    expect(wordsOf(pressedAll(selected, ['s']))).toContain(
      'Status of 2 selected Issues',
    )
  })

  it('leaves a selected row out of what a change reaches while a filter hides it', () => {
    const selected = pressedAll(list(), ['j', 'x', 'j', 'x'])
    const searched = update(
      selected,
      Option.getOrThrow(messageForScreenToken(selected, 'search:Issue 101')),
    )[0]
    expect(selectedRowsOf(searched)).toEqual(['101'])
    expect(wordsOf(pressedAll(searched, ['s']))).toContain('Status of #101')
  })
})

describe('Issue Tracker bulk changes', () => {
  it('sets P2 on 10 selected rows, showing all at once and writing them one by one', async () => {
    const all = Array.reduce(
      Array.makeBy(ROW_COUNT - 1, () => 'J'),
      pressedAll(list(), ['j']),
      (model, key) => pressed(model, on(key, SHIFT)),
    )
    expect(selectedRowsOf(all)).toHaveLength(ROW_COUNT)
    const picked = pickedKey(pressedAll(all, ['p']), '2')
    expect(picked[1]).toHaveLength(1)
    expect(
      Array.every(rowsIn(issuesScreen(picked[0])), row =>
        Array.some(row.trailing ?? [], button => button.label === 'P2'),
      ),
    ).toBe(true)
    expect(wordsOf(picked[0])).toContain('Saving 10 changes…')
    const tracker = Effect.runSync(makeMemoryIssueTracker(issues))
    const { model, ran } = await settled(tracker, picked)
    expect(ran).toHaveLength(ROW_COUNT)
    expect(Array.dedupe(ran)).toEqual(['EditIssue'])
    expect(model.rowEdits).toEqual([])
    Array.forEach(issues, issue => {
      expect(
        Option.map(
          Effect.runSync(tracker.fetchIssue(issue.id)),
          found => found.priority,
        ),
      ).toEqual(Option.some('P2'))
    })
  })

  it('goes on past a write that fails, and says which one failed', async () => {
    const selected = pressedAll(list(), ['j', 'x', 'j', 'x', 'j', 'x'])
    const picked = pickedKey(pressedAll(selected, ['s']), 'l')
    const memory = Effect.runSync(makeMemoryIssueTracker(issues))
    const { model } = await settled(failingOn(memory, '102'), picked)
    expect(
      Array.filter(wordsOf(model), words => words.startsWith('Not saved')),
    ).toEqual([expect.stringMatching(/^Not saved: #102 status Blocked: /)])
    const statusOf = (issueId: string) =>
      Option.map(
        Effect.runSync(memory.fetchIssue(issueId)),
        found => found.status,
      )
    expect(statusOf('101')).toEqual(Option.some('Blocked'))
    expect(statusOf('102')).toEqual(Option.some('Open'))
    expect(statusOf('103')).toEqual(Option.some('Blocked'))
  })
})

import { Array, Effect, Match as M, Option } from 'effect'
import { type ListItem, type UiNode, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueStatus,
  IssueTracker,
  type IssueTrackerService,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { IssueIdentity, type IssueIdentityService } from './issueIdentity.js'
import { type KeyPress, tokenForKeyPress } from './keys.js'
import { type Message, ObservedIssues } from './message.js'
import { IssueDetail, IssueList, type Model } from './model.js'
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
  Issue.make({ ...stored, createdAtMs: 3_000, id: '103', title: 'Third' }),
  Issue.make({ ...stored, createdAtMs: 2_000, id: '102', title: 'Second' }),
]

const listAt = (path: Parameters<typeof modelForNavigation>[0]): Model =>
  update(modelForNavigation(path), ObservedIssues.make({ issues }))[0]

const list = (): Model => listAt(IssueList.make({}))

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

const FIELD: Partial<Omit<KeyPress, 'key'>> = { target: 'Field' }

type Pressed = Readonly<{
  model: Model
  commands: ReadonlyArray<ReturnType<typeof update>[1][number]>
}>

const pressedWith = (model: Model, press: KeyPress): Pressed =>
  Option.match(tokenForKeyPress(model, press), {
    onNone: () => ({ commands: [], model }),
    onSome: token => {
      const [next, commands] = update(
        model,
        Option.getOrThrow(messageForScreenToken(model, token)),
      )
      return { commands, model: next }
    },
  })

const pressed = (model: Model, press: KeyPress): Model =>
  pressedWith(model, press).model

const pressedAll = (model: Model, keys: ReadonlyArray<string>): Model =>
  Array.reduce(keys, model, (current, key) => pressed(current, on(key)))

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

type Layer = Readonly<{
  kind: string
  label: string
  rows: ReadonlyArray<ListItem>
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
                rows: Array.flatMap(box.children, rowsIn),
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

const dialogOf = (model: Model): Option.Option<Layer> =>
  Array.findFirst(
    layersIn(issuesScreen(model)),
    layer => layer.kind === 'Dialog',
  )

const rowWordsOf = (model: Model, id: string): ReadonlyArray<string> =>
  Option.match(
    Array.findFirst(rowsIn(issuesScreen(model)), row => row.key === id),
    {
      onNone: () => [],
      onSome: row => [
        ...(row.lines ?? []),
        ...Array.map(row.trailing ?? [], button => button.label),
      ],
    },
  )

const wordsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const authoredBy = (author: string): IssueIdentityService => ({
  author: Effect.succeed(author),
  next: Effect.succeed({ id: 'issue-preview', nowMs: 2_000 }),
})

const failingTracker = (tracker: IssueTrackerService): IssueTrackerService => ({
  ...tracker,
  update: () =>
    Effect.flatMap(Effect.succeed('Permission denied'), reason =>
      tracker.update('missing', {
        apply: issue => issue,
        hasLanded: () => reason === '',
      }),
    ),
})

const runCommand = (
  tracker: IssueTrackerService,
  command: ReturnType<typeof update>[1][number],
): Promise<Message> =>
  Effect.runPromise(
    command.effect.pipe(
      Effect.provideService(IssueTracker, tracker),
      Effect.provideService(IssueIdentity, authoredBy('owner@example.com')),
    ) as Effect.Effect<Message>,
  )

const settled = async (
  tracker: IssueTrackerService,
  { commands, model }: Pressed,
): Promise<Model> => {
  const firstCommand = Array.head(commands)
  if (Option.isNone(firstCommand)) {
    return model
  } else {
    const message = await runCommand(tracker, firstCommand.value)
    const [next, nextCommands] = update(model, message)
    return settled(tracker, { commands: nextCommands, model: next })
  }
}

const memoryTracker = (): IssueTrackerService =>
  Effect.runSync(makeMemoryIssueTracker(issues))

describe('Issue Tracker triage: status, priority and claim from the row', () => {
  it('opens every status for the row under the cursor on s, each with its key', () => {
    const menu = pressedAll(list(), ['j', 's'])
    const dialog = Option.getOrThrow(dialogOf(menu))
    expect(dialog.label).toBe('Status of #104')
    expect(dialog.rows).toHaveLength(IssueStatus.literals.length)
    expect(
      Option.map(
        Array.findFirst(dialog.rows, row => row.title === 'Blocked'),
        row => row.lines,
      ),
    ).toEqual(Option.some(['l']))
    expect(
      Option.map(
        Array.findFirst(dialog.rows, row => row.title === 'Open'),
        row => row.lines,
      ),
    ).toEqual(Option.some(['o', '✓']))
  })

  it('shows the new status on the row at once, before the write comes back, and writes it', async () => {
    const tracker = memoryTracker()
    const picked = pressedWith(pressedAll(list(), ['j', 's']), on('l'))
    expect(dialogOf(picked.model)).toEqual(Option.none())
    expect(rowWordsOf(picked.model, '104')).toContain('Blocked')
    expect(Array.map(picked.commands, command => command.name)).toEqual([
      'SetIssueStatus',
    ])
    expect(wordsOf(picked.model)).toContain('Saving 1 change…')
    const done = await settled(tracker, picked)
    expect(rowWordsOf(done, '104')).toContain('Blocked')
    expect(wordsOf(done)).not.toContain('Saving 1 change…')
    expect(done.navigation).toEqual(IssueList.make({}))
    expect(
      Option.map(
        Effect.runSync(tracker.fetchIssue('104')),
        issue => issue.status,
      ),
    ).toEqual(Option.some('Blocked'))
  })

  it('sets the priority on p then a digit', async () => {
    const tracker = memoryTracker()
    const picked = pressedWith(pressedAll(list(), ['j', 'p']), on('1'))
    expect(rowWordsOf(picked.model, '104')).toContain('P1')
    expect(Array.map(picked.commands, command => command.name)).toEqual([
      'EditIssue',
    ])
    await settled(tracker, picked)
    expect(
      Option.map(
        Effect.runSync(tracker.fetchIssue('104')),
        issue => issue.priority,
      ),
    ).toEqual(Option.some('P1'))
  })

  it('claims as the person signed in on a then Enter, moving it to InProgress as issues claim does', async () => {
    const tracker = memoryTracker()
    const menu = pressedAll(list(), ['j', 'a'])
    expect(
      Option.map(dialogOf(menu), dialog =>
        Array.map(dialog.rows, row => row.title),
      ),
    ).toEqual(Option.some(['Claim as me', 'Release the claim']))
    const picked = pressedWith(menu, on('Enter', FIELD))
    expect(rowWordsOf(picked.model, '104')).toContain('InProgress')
    expect(rowWordsOf(picked.model, '104')).toContain('me')
    const done = await settled(tracker, picked)
    expect(rowWordsOf(done, '104')).toContain('owner@example.com')
    const claimed = Option.getOrThrow(Effect.runSync(tracker.fetchIssue('104')))
    expect(claimed.claimantId).toEqual(Option.some('owner@example.com'))
    expect(claimed.status).toBe('InProgress')
    expect(
      Option.map(Array.last(claimed.workLog), entry => entry.summary),
    ).toEqual(Option.some('Claimed by owner@example.com.'))
  })

  it('claims for someone who already holds a claim, and releases a claim', async () => {
    const claimedIssue = Issue.make({
      ...stored,
      claimantId: Option.some('claude-code/one@ld'),
      createdAtMs: 500,
      id: '101',
    })
    const tracker = Effect.runSync(
      makeMemoryIssueTracker([...issues, claimedIssue]),
    )
    const loaded = update(
      modelForNavigation(IssueList.make({})),
      ObservedIssues.make({ issues: [...issues, claimedIssue] }),
    )[0]
    const menu = pressedAll(loaded, ['j', 'a'])
    const forOne = await settled(
      tracker,
      pressedWith(
        update(
          menu,
          Option.getOrThrow(
            messageForScreenToken(menu, 'palette-run:claim:claude-code/one@ld'),
          ),
        )[0],
        on('q'),
      ),
    )
    expect(rowWordsOf(forOne, '104')).toContain('claude-code/one@ld')
    const atLast = pressedAll(loaded, ['j', 'j', 'j', 'j', 'a'])
    const [released, commands] = update(
      atLast,
      Option.getOrThrow(
        messageForScreenToken(atLast, 'palette-run:claim:release'),
      ),
    )
    expect(rowWordsOf(released, '101')).not.toContain('claude-code/one@ld')
    await settled(tracker, { commands, model: released })
    expect(
      Option.map(
        Effect.runSync(tracker.fetchIssue('101')),
        issue => issue.claimantId,
      ),
    ).toEqual(Option.some(Option.none()))
  })

  it('takes status, priority and claim in 6 keys', () => {
    const keys = ['s', 'x', 'p', '1']
    const atRow = pressedAll(list(), ['j'])
    const triaged = pressedAll(atRow, keys)
    const claimMenu = pressed(triaged, on('a'))
    const done = pressed(claimMenu, on('Enter', FIELD))
    expect(keys.length + 2).toBe(6)
    expect(rowWordsOf(done, '104')).toEqual(
      expect.arrayContaining(['#104', 'P1', 'InProgress', 'me']),
    )
    expect(done.rowEdits).toHaveLength(3)
  })

  it('writes one change at a time, the next when the last comes back', async () => {
    const tracker = memoryTracker()
    const first = pressedWith(pressedAll(list(), ['j', 's']), on('l'))
    expect(first.commands).toHaveLength(1)
    const second = pressedWith(pressed(first.model, on('p')), on('0'))
    expect(second.commands).toEqual([])
    expect(rowWordsOf(second.model, '104')).toEqual(
      expect.arrayContaining(['Blocked', 'P0']),
    )
    expect(wordsOf(second.model)).toContain('Saving 2 changes…')
    const firstDone = await runCommand(
      tracker,
      Option.getOrThrow(Array.head(first.commands)),
    )
    const [afterFirst, nextCommands] = update(second.model, firstDone)
    expect(nextCommands).toHaveLength(1)
    const done = await settled(tracker, {
      commands: nextCommands,
      model: afterFirst,
    })
    expect(wordsOf(done)).not.toContain('Saving 1 change…')
    const stored104 = Option.getOrThrow(
      Effect.runSync(tracker.fetchIssue('104')),
    )
    expect(stored104.status).toBe('Blocked')
    expect(stored104.priority).toBe('P0')
  })

  it('puts the row back and says which when a write fails, and Esc lets the words go', async () => {
    const picked = pressedWith(pressedAll(list(), ['j', 's']), on('l'))
    const done = await settled(failingTracker(memoryTracker()), picked)
    expect(rowWordsOf(done, '104')).toContain('Open')
    expect(rowWordsOf(done, '104')).not.toContain('Blocked')
    expect(
      Array.some(wordsOf(done), words =>
        words.startsWith('Not saved: #104 status Blocked: '),
      ),
    ).toBe(true)
    const dismissed = pressed(done, on('Escape'))
    expect(
      Array.some(wordsOf(dismissed), words => words.startsWith('Not saved:')),
    ).toBe(false)
  })

  it('moves the cursor to the next row when the change takes its row out of the list', () => {
    const onlyOpen = update(
      list(),
      Option.getOrThrow(messageForScreenToken(list(), 'filter-status:Open')),
    )[0]
    const atSecond = pressedAll(onlyOpen, ['j', 'j', 's', 'c'])
    expect(atSecond.maybeRowCursor).toEqual(Option.some('102'))
  })

  it('takes the same keys on an Issue page, staying on it', () => {
    const page = update(
      modelForNavigation(IssueDetail.make({ issueId: '104' })),
      ObservedIssues.make({ issues }),
    )[0]
    const menu = pressed(page, on('s'))
    expect(Option.map(dialogOf(menu), dialog => dialog.label)).toEqual(
      Option.some('Status of #104'),
    )
    const picked = pressedWith(menu, on('l'))
    expect(picked.model.navigation).toEqual(
      IssueDetail.make({ issueId: '104' }),
    )
    expect(picked.commands).toHaveLength(1)
  })

  it('offers status, priority and claim for the row under the cursor in the palette', () => {
    const palette = pressed(
      pressedAll(list(), ['j']),
      on('k', { isMeta: true }),
    )
    const titles = Array.map(
      Option.getOrThrow(dialogOf(palette)).rows,
      row => row.title,
    )
    expect(titles).toEqual(
      expect.arrayContaining([
        'Set status: VerificationNeeded',
        'Set priority: P0',
        'Claim as me',
        'Peek at the Issue under the cursor',
      ]),
    )
    const ran = update(
      palette,
      Option.getOrThrow(
        messageForScreenToken(palette, 'palette-run:set-status:Blocked'),
      ),
    )
    expect(rowWordsOf(ran[0], '104')).toContain('Blocked')
    expect(ran[1]).toHaveLength(1)
  })

  it('offers nothing to change with no row under the cursor', () => {
    const palette = pressed(list(), on('k', { isMeta: true }))
    expect(
      Array.filter(Option.getOrThrow(dialogOf(palette)).rows, row =>
        row.title.startsWith('Set status'),
      ),
    ).toEqual([])
  })

  it('moves to the first row when Enter, s, p or a find no row under the cursor', () => {
    Array.forEach(['Enter', 's', 'p', 'a'], key => {
      expect(pressedAll(list(), [key]).maybeRowCursor).toEqual(
        Option.some('104'),
      )
    })
  })

  it('changes the Issue a peek shows, and returns to the peek', () => {
    const peeking = pressedAll(list(), ['j', 'j', ' '])
    const menu = pressed(peeking, on('s'))
    expect(Option.map(dialogOf(menu), dialog => dialog.label)).toEqual(
      Option.some('Status of #103'),
    )
    const done = pressed(menu, on('l'))
    expect(done.layer._tag).toBe('PeekLayer')
    expect(rowWordsOf(done, '103')).toContain('Blocked')
    expect(pressed(pressed(done, on('s')), on('Escape')).layer._tag).toBe(
      'PeekLayer',
    )
  })
})

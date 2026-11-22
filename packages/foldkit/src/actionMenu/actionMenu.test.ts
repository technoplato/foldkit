import { Array, Match as M, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import {
  type KeyInput,
  echoOfKey,
  keyInput,
} from '../interaction/interaction.js'
import { terminalLineText, terminalMenuLines } from '../interaction/terminal.js'
import * as Declaration from '../navigation/declaration.js'
import { Dialog, entriesOf, stackAtRoot } from '../navigation/structure.js'
import { make } from '../program/program.js'
import * as Route from '../route/parser.js'
import { ts } from '../schema/index.js'
import * as ActionMenu from './actionMenu.js'

const CounterModel = S.Struct({ count: S.Number })
type CounterModel = typeof CounterModel.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'To count one more',
  meta: { label: '+', keys: ['+', '='] },
})
const Decrement = Catalog.action('Decrement', {
  what: 'Decrements the count by one',
  why: 'To count one fewer',
  meta: { label: '-', keys: ['-'] },
})
const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'To start over',
  enabled: (model: CounterModel) =>
    model.count === 0
      ? Catalog.Disabled({ because: 'count is already 0' })
      : Catalog.Enabled(),
  meta: { label: 'Reset', keys: ['r'] },
})
const catalog = Catalog.make([Increment, Decrement, Reset])
type CounterMessage = typeof catalog.Message.Type

const Counter = ts('Counter')

const CounterProgram = make({
  id: 'counter',
  version: 1,
  Model: CounterModel,
  Message: catalog.Message,
  init: () => [{ count: 0 }, []],
  update: (model: CounterModel, message: CounterMessage) =>
    M.value(message).pipe(
      M.withReturnType<readonly [CounterModel, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        Increment: () => [{ count: model.count + 1 }, []],
        Decrement: () => [{ count: model.count - 1 }, []],
        Reset: () => [{ count: 0 }, []],
      }),
    ),
  catalog,
  navigation: Declaration.screens({
    root: Declaration.rootScreen(Counter, Route.here),
  }),
})

const App = ActionMenu.compose({ of: CounterProgram })
type AppModel = typeof App.Model.Type
type AppMessage = typeof App.Message.Type

const required = <A>(value: A | undefined, name: string): A => {
  if (value === undefined) {
    throw new Error(`App is missing ${name}`)
  }
  return value
}

const interaction = required(App.interaction, 'interaction')

const apply = (
  model: AppModel,
  messages: ReadonlyArray<AppMessage>,
): AppModel =>
  Array.reduce(
    messages,
    model,
    (current, message) => App.update(current, message)[0],
  )

const press = (model: AppModel, input: KeyInput): AppModel =>
  apply(model, interaction.pressKey(model, input))

const initial = (count = 0): AppModel => ({ ...App.init()[0], count })

const openMenu = (model: AppModel): AppModel =>
  press(model, keyInput('k', { isMeta: true }))

const focusOf = (model: AppModel): Option.Option<ActionMenu.Focus> =>
  Option.map(ActionMenu.menuOf(model.navigation), menu => menu.focus)

describe('ActionMenu.compose', () => {
  it('keeps the child Model flat beside a navigation stack at the child root', () => {
    expect(App.init()[0]).toEqual({
      count: 0,
      navigation: stackAtRoot(Counter()),
    })
    expect(S.decodeUnknownSync(App.Model)(App.init()[0])).toEqual(App.init()[0])
  })

  it('refuses a child that already owns a navigation field', () => {
    const Reserved = make({
      ...CounterProgram,
      Model: S.Struct({ count: S.Number, navigation: S.String }),
    })
    expect(() => ActionMenu.compose({ of: Reserved })).toThrow(
      ActionMenu.ActionMenuReservedFieldError,
    )
  })

  it('refuses a child without a root destination', () => {
    const { navigation: _navigation, ...withoutNavigation } = CounterProgram
    expect(() => ActionMenu.compose({ of: withoutNavigation })).toThrow(
      ActionMenu.ActionMenuChildIncompleteError,
    )
  })
})

describe('opening and dismissing', () => {
  it('opens on Cmd-K as a presented Dialog with the first row highlighted', () => {
    const model = openMenu(initial())
    expect(interaction.menu(model)).toEqual(
      Option.some({
        title: 'Actions',
        filterLabel: 'Search actions',
        dismissLabel: 'Close actions',
        query: '',
        isFilterFocused: true,
        areRowKeysLive: false,
        rowKeysHint:
          'Letters search here. Press ↓ to use this key, or press it on the page once the menu is closed',
        style: Dialog(),
        summary: '3 actions',
        hints: [
          { keys: ['↑', '↓'], does: 'move' },
          { keys: ['↵'], does: 'run' },
          { keys: ['esc'], does: 'close' },
          { keys: ['a–z'], does: 'search' },
        ],
        rows: [
          expect.objectContaining({
            title: [{ text: 'Increment', isMatch: false }],
            description: [
              { text: 'Increments the count by one', isMatch: false },
            ],
            spokenLabel: 'Increment, Increments the count by one',
            keys: ['+'],
            isHighlighted: true,
            isFocused: false,
          }),
          expect.objectContaining({ isHighlighted: false, isFocused: false }),
          expect.objectContaining({ isHighlighted: false, isFocused: false }),
        ],
      }),
    )
  })

  it('opens on ? only while closed', () => {
    const opened = press(initial(), keyInput('?'))
    expect(Option.isSome(ActionMenu.menuOf(opened.navigation))).toBe(true)
    const typed = press(opened, keyInput('?'))
    expect(
      Option.map(ActionMenu.menuOf(typed.navigation), menu => menu.query),
    ).toEqual(Option.some('?'))
  })

  it('dismisses on Escape from the filter and on Cmd-K', () => {
    expect(press(openMenu(initial()), keyInput('Escape')).navigation).toEqual(
      stackAtRoot(Counter()),
    )
    expect(
      press(openMenu(initial()), keyInput('k', { isControl: true })).navigation,
    ).toEqual(stackAtRoot(Counter()))
  })

  it('opens once even when asked twice', () => {
    const model = apply(initial(), [
      ActionMenu.OpenedActionMenu(),
      ActionMenu.OpenedActionMenu(),
    ])
    expect(entriesOf(model.navigation)).toHaveLength(1)
  })
})

describe('filtering', () => {
  it('types into the query and narrows rows by label and tag', () => {
    const model = Array.reduce(
      ['r', 's', 't'],
      openMenu(initial(3)),
      (current, key) => press(current, keyInput(key)),
    )
    const view = interaction.menu(model)
    expect(Option.map(view, menu => menu.query)).toEqual(Option.some('rst'))
    expect(
      Option.map(view, menu => menu.rows.map(row => row.entry.tag)),
    ).toEqual(Option.some(['Reset']))
    expect(focusOf(model)).toEqual(
      Option.some(
        ActionMenu.OnFilter({ maybeHighlighted: Option.some('Reset') }),
      ),
    )
  })

  it('lists unavailable rows last, under a hairline', () => {
    const resetFirst = Catalog.make([Reset, Increment, Decrement])
    const rowsAt = (query: string) =>
      ActionMenu.menuViewOf(
        Catalog.entries(resetFirst, { count: 0 }),
        ActionMenu.ActionMenu({
          query,
          focus: ActionMenu.OnFilter({ maybeHighlighted: Option.none() }),
          maybeChoosing: Option.none(),
        }),
        Dialog(),
      ).rows.map(row => [row.entry.tag, row.isFirstUnavailable])
    expect(rowsAt('')).toEqual([
      ['Increment', false],
      ['Decrement', false],
      ['Reset', true],
    ])
    expect(rowsAt('re')).toEqual([
      ['Increment', false],
      ['Decrement', false],
      ['Reset', true],
    ])
    expect(rowsAt('reset')).toEqual([['Reset', false]])
    expect(
      terminalMenuLines(
        ActionMenu.menuViewOf(
          Catalog.entries(resetFirst, { count: 0 }),
          ActionMenu.opened([]),
          Dialog(),
        ),
        40,
      )
        .map(terminalLineText)
        .filter(line => line.includes('─')),
    ).toEqual([`  ${'─'.repeat(36)}`])
  })

  it('numbers the rows that can run and runs one on Command and its number', () => {
    const atZero = openMenu(initial(0))
    expect(
      Option.map(interaction.menu(atZero), menu =>
        menu.rows.map(row => [row.entry.tag, row.maybePick]),
      ),
    ).toEqual(
      Option.some([
        ['Increment', Option.some(1)],
        ['Decrement', Option.some(2)],
        ['Reset', Option.none()],
      ]),
    )
    const chosen = press(atZero, keyInput('2', { isMeta: true }))
    expect(chosen.count).toBe(-1)
    expect(ActionMenu.menuOf(chosen.navigation)).toEqual(Option.none())
    expect(
      press(atZero, keyInput('3', { isControl: true })).navigation,
    ).toEqual(atZero.navigation)
  })

  it('deletes with Backspace', () => {
    const model = press(
      press(openMenu(initial()), keyInput('d')),
      keyInput('Backspace'),
    )
    expect(
      Option.map(ActionMenu.menuOf(model.navigation), menu => menu.query),
    ).toEqual(Option.some(''))
  })

  it('marks the letters a query matched in each row', () => {
    const titlesOf = (query: string) =>
      Option.map(
        interaction.menu(
          apply(openMenu(initial(3)), [
            ActionMenu.ChangedActionMenuQuery({ query }),
          ]),
        ),
        menu => menu.rows.map(row => [row.title, row.description]),
      )
    expect(titlesOf('re')).toEqual(
      Option.some([
        [
          [
            { text: 'Re', isMatch: true },
            { text: 'set', isMatch: false },
          ],
          [{ text: 'Sets the count to 0', isMatch: false }],
        ],
        [
          [
            { text: 'Inc', isMatch: false },
            { text: 're', isMatch: true },
            { text: 'ment', isMatch: false },
          ],
          [{ text: 'Increments the count by one', isMatch: false }],
        ],
        [
          [
            { text: 'Dec', isMatch: false },
            { text: 're', isMatch: true },
            { text: 'ment', isMatch: false },
          ],
          [{ text: 'Decrements the count by one', isMatch: false }],
        ],
      ]),
    )
    expect(titlesOf('rst')).toEqual(
      Option.some([
        [
          [
            { text: 'R', isMatch: true },
            { text: 'e', isMatch: false },
            { text: 's', isMatch: true },
            { text: 'e', isMatch: false },
            { text: 't', isMatch: true },
          ],
          [{ text: 'Sets the count to 0', isMatch: false }],
        ],
      ]),
    )
    expect(titlesOf('by one')).toEqual(
      Option.some([
        [
          [{ text: 'Increment', isMatch: false }],
          [
            { text: 'Increments the count ', isMatch: false },
            { text: 'by one', isMatch: true },
          ],
        ],
        [
          [{ text: 'Decrement', isMatch: false }],
          [
            { text: 'Decrements the count ', isMatch: false },
            { text: 'by one', isMatch: true },
          ],
        ],
      ]),
    )
  })

  it('puts letters in a title above a description that contains the query', () => {
    const Mirror = Catalog.action('Mirror', {
      what: 'Shows the first screen',
      why: 'The person wants every device on one screen',
      meta: { label: 'Mirror', keys: [] },
    })
    const mirrorCatalog = Catalog.make([Mirror, Reset])
    expect(
      ActionMenu.matchedEntries(
        Catalog.entries(mirrorCatalog, { count: 3 }),
        'rs',
      ).map(matched => matched.entry.tag),
    ).toEqual(['Reset', 'Mirror'])
  })

  it('summarizes the rows for a screen reader', () => {
    const summaryOf = (query: string) =>
      Option.map(
        interaction.menu(
          apply(openMenu(initial(3)), [
            ActionMenu.ChangedActionMenuQuery({ query }),
          ]),
        ),
        menu => menu.summary,
      )
    expect(summaryOf('')).toEqual(Option.some('3 actions'))
    expect(summaryOf('rst')).toEqual(Option.some('1 action matches “rst”'))
    expect(summaryOf('zz')).toEqual(Option.some('No actions match “zz”'))
  })

  it('highlights nothing when nothing matches', () => {
    const model = press(openMenu(initial()), keyInput('z'))
    expect(focusOf(model)).toEqual(
      Option.some(ActionMenu.OnFilter({ maybeHighlighted: Option.none() })),
    )
  })
})

describe('titleOf', () => {
  it('reads a tag as words and keeps acronyms', () => {
    expect(ActionMenu.titleOf('OpenSessionSettings')).toBe(
      'Open session settings',
    )
    expect(ActionMenu.titleOf('OpenURL')).toBe('Open URL')
    expect(ActionMenu.titleOf('Reset')).toBe('Reset')
  })
})

describe('focus', () => {
  it('hints that Escape returns to the search from a row', () => {
    const inList = press(openMenu(initial()), keyInput('ArrowDown'))
    expect(
      Option.map(interaction.menu(inList), menu =>
        menu.hints.map(hint => hint.does),
      ),
    ).toEqual(
      Option.some(['move', 'run', 'back to search', 'run a row by its key']),
    )
  })

  it('moves from the filter into the list and back up', () => {
    const inList = press(openMenu(initial()), keyInput('ArrowDown'))
    expect(focusOf(inList)).toEqual(
      Option.some(ActionMenu.OnAction({ tag: 'Increment' })),
    )
    const second = press(inList, keyInput('j'))
    expect(focusOf(second)).toEqual(
      Option.some(ActionMenu.OnAction({ tag: 'Decrement' })),
    )
    const backToFirst = press(second, keyInput('k'))
    const toFilter = press(backToFirst, keyInput('ArrowUp'))
    expect(focusOf(toFilter)).toEqual(
      Option.some(
        ActionMenu.OnFilter({ maybeHighlighted: Option.some('Increment') }),
      ),
    )
  })

  it('moves Up from the search to the last row', () => {
    const fromSearch = press(openMenu(initial(3)), keyInput('ArrowUp'))
    expect(focusOf(fromSearch)).toEqual(
      Option.some(ActionMenu.OnAction({ tag: 'Reset' })),
    )
    const backUp = press(
      press(openMenu(initial(3)), keyInput('Tab', { isShift: true })),
      keyInput('ArrowUp'),
    )
    expect(focusOf(backUp)).toEqual(
      Option.some(ActionMenu.OnAction({ tag: 'Decrement' })),
    )
  })

  it('jumps with J, K, and Cmd-arrows', () => {
    const inList = press(openMenu(initial()), keyInput('Tab'))
    expect(focusOf(press(inList, keyInput('J')))).toEqual(
      Option.some(ActionMenu.OnAction({ tag: 'Reset' })),
    )
    const atLast = press(inList, keyInput('ArrowDown', { isMeta: true }))
    expect(focusOf(atLast)).toEqual(
      Option.some(ActionMenu.OnAction({ tag: 'Reset' })),
    )
    expect(focusOf(press(atLast, keyInput('K')))).toEqual(
      Option.some(ActionMenu.OnAction({ tag: 'Increment' })),
    )
  })

  it('stays on the last row when moving down past it', () => {
    const atLast = press(
      press(openMenu(initial()), keyInput('Tab')),
      keyInput('J'),
    )
    expect(focusOf(press(atLast, keyInput('j')))).toEqual(
      Option.some(ActionMenu.OnAction({ tag: 'Reset' })),
    )
  })

  it('returns to the filter on Escape from a row, then closes', () => {
    const inList = press(openMenu(initial()), keyInput('ArrowDown'))
    const onFilter = press(inList, keyInput('Escape'))
    expect(focusOf(onFilter)).toEqual(
      Option.some(
        ActionMenu.OnFilter({ maybeHighlighted: Option.some('Increment') }),
      ),
    )
    expect(press(onFilter, keyInput('Escape')).navigation).toEqual(
      stackAtRoot(Counter()),
    )
  })
})

describe('choosing', () => {
  it('closes the menu, then sends the Action itself', () => {
    const model = openMenu(initial())
    expect(interaction.pressKey(model, keyInput('Enter'))).toEqual([
      ActionMenu.ChoseActionMenuAction({ tag: 'Increment' }),
      Increment(),
    ])
    const chosen = press(model, keyInput('Enter'))
    expect(chosen).toEqual({ count: 1, navigation: stackAtRoot(Counter()) })
  })

  it('refuses a Disabled row and stays open', () => {
    const onReset = press(
      press(openMenu(initial(0)), keyInput('Tab')),
      keyInput('J'),
    )
    expect(interaction.pressKey(onReset, keyInput('Enter'))).toEqual([])
    expect(interaction.chooseFromMenu(onReset, 'Reset')).toEqual([])
  })

  it('lets declared Action keys send from the list without closing', () => {
    const inList = press(openMenu(initial()), keyInput('ArrowDown'))
    const incremented = press(inList, keyInput('+'))
    expect(incremented.count).toBe(1)
    expect(Option.isSome(ActionMenu.menuOf(incremented.navigation))).toBe(true)
  })

  it('does not choose while the menu is closed', () => {
    expect(interaction.chooseFromMenu(initial(), 'Increment')).toEqual([])
  })
})

describe('synchronization', () => {
  const synchronization = required(App.synchronization, 'synchronization')

  it('classifies menu Messages as Navigation and Actions as Domain', () => {
    expect(synchronization.messageCategory(ActionMenu.OpenedActionMenu())).toBe(
      'Navigation',
    )
    expect(
      synchronization.messageCategory(
        ActionMenu.ChoseActionMenuAction({ tag: 'Increment' }),
      ),
    ).toBe('Navigation')
    expect(synchronization.messageCategory(Increment())).toBe('Domain')
  })

  it('keeps the domain projection unchanged under Navigation Messages', () => {
    const model = initial(4)
    const navigated = apply(model, [
      ActionMenu.OpenedActionMenu(),
      ActionMenu.ChangedActionMenuQuery({ query: 're' }),
      ActionMenu.MovedActionMenuFocus({ move: 'Next' }),
    ])
    expect(synchronization.projectDomain(navigated)).toEqual(
      synchronization.projectDomain(model),
    )
  })

  it('leaves an open menu alone when a Domain Message arrives', () => {
    const open = openMenu(initial())
    const incremented = apply(open, [Increment()])
    expect(incremented.navigation).toEqual(open.navigation)
    expect(incremented.count).toBe(1)
  })
})

describe('saying what a key will do', () => {
  const hintsOf = (model: AppModel) =>
    Option.map(interaction.menu(model), menu => ({
      does: menu.hints.map(hint => hint.does),
      areRowKeysLive: menu.areRowKeysLive,
    }))

  it('says letters search while the search has the keyboard', () => {
    expect(hintsOf(openMenu(initial()))).toEqual(
      Option.some({
        does: ['move', 'run', 'close', 'search'],
        areRowKeysLive: false,
      }),
    )
  })

  it("says a row's own key runs it once a row has the keyboard", () => {
    expect(hintsOf(press(openMenu(initial()), keyInput('ArrowDown')))).toEqual(
      Option.some({
        does: ['move', 'run', 'back to search', 'run a row by its key'],
        areRowKeysLive: true,
      }),
    )
  })

  it('counts the rows a typed letter kept', () => {
    const typed = press(openMenu(initial(3)), keyInput('r'))
    expect(Option.map(interaction.menu(typed), menu => menu.summary)).toEqual(
      Option.some('3 actions match “r”'),
    )
    const narrowed = press(typed, keyInput('s'))
    expect(
      Option.map(interaction.menu(narrowed), menu => menu.summary),
    ).toEqual(Option.some('1 action matches “rs”'))
  })
})

describe('saying what a key did', () => {
  const echo = (model: AppModel, input: KeyInput) =>
    Option.map(echoOfKey(interaction, model, input), found => [
      found.title,
      Option.getOrNull(found.maybeNote),
    ])

  it('names the Action a key runs on the page, and why a key does nothing', () => {
    expect(echo(initial(3), keyInput('r'))).toEqual(
      Option.some(['Reset', null]),
    )
    expect(echo(initial(0), keyInput('r'))).toEqual(
      Option.some(['Reset', 'Unavailable: count is already 0']),
    )
    expect(echo(initial(0), keyInput('x'))).toEqual(Option.none())
  })

  it('says nothing for a letter typed into the search', () => {
    expect(echo(openMenu(initial(3)), keyInput('r'))).toEqual(Option.none())
  })

  it('names the row a number, Enter, or its own key runs from the menu', () => {
    const open = openMenu(initial(0))
    expect(echo(open, keyInput('2', { isControl: true }))).toEqual(
      Option.some(['Decrement', null]),
    )
    expect(echo(open, keyInput('Enter'))).toEqual(
      Option.some(['Increment', null]),
    )
    const inList = press(open, keyInput('ArrowDown'))
    expect(echo(inList, keyInput('-'))).toEqual(
      Option.some(['Decrement', null]),
    )
    expect(echo(inList, keyInput('j'))).toEqual(Option.none())
  })

  it('says nothing for a key the menu itself takes, even when an Action declares it', () => {
    const inList = press(openMenu(initial(0)), keyInput('ArrowDown'))
    const withEscape = {
      ...interaction,
      entries: (model: AppModel) =>
        Array.map(interaction.entries(model), entry =>
          entry.tag === 'Decrement'
            ? { ...entry, keys: ['Escape', 'Tab', 'ArrowDown'] }
            : entry,
        ),
    }
    expect(
      Array.map(['Escape', 'Tab', 'ArrowDown'], key =>
        echoOfKey(withEscape, inList, keyInput(key)),
      ),
    ).toEqual([Option.none(), Option.none(), Option.none()])
  })

  it('says why Enter did nothing on an unavailable row', () => {
    const onReset = press(
      press(openMenu(initial(0)), keyInput('ArrowUp')),
      keyInput('Enter'),
    )
    expect(echo(onReset, keyInput('Enter'))).toEqual(
      Option.some(['Reset', 'Unavailable: count is already 0']),
    )
  })
})

describe('open choosing Actions in the action menu', () => {
  const TodoModel = S.Struct({ items: S.Array(S.String) })
  type TodoModel = typeof TodoModel.Type

  const CreateItem = Catalog.action('CreateItem', {
    fields: { title: S.String },
    what: 'Adds a new item to the list',
    why: 'To capture work before it is forgotten',
    choose: {
      field: 'title',
      noun: 'title',
      prompt: 'What should the item be titled?',
      token: S.String,
      choicesOf: () => [
        { value: 'Verify OTP autofill', title: 'Verify OTP autofill' },
      ],
      accepts: (_model: TodoModel, value: string) =>
        value === 'forbidden'
          ? Catalog.Disabled({ because: 'that title is reserved' })
          : Catalog.Enabled(),
      nothingToChoose: 'type a title',
    },
    meta: { label: 'Create Item', keys: [] },
  })
  const todoCatalog = Catalog.make([CreateItem])
  const TodoHome = ts('TodoHome')
  const TodoApp = ActionMenu.compose({
    of: make({
      id: 'todo',
      version: 1,
      Model: TodoModel,
      Message: todoCatalog.Message,
      init: () => [{ items: [] }, []],
      update: (model, message) => [
        { items: [...model.items, message.title] },
        [],
      ],
      catalog: todoCatalog,
      navigation: Declaration.screens({
        root: Declaration.rootScreen(TodoHome, Route.here),
      }),
    }),
  })
  const todoInteraction = required(TodoApp.interaction, 'interaction')
  const stepTodo = (
    model: typeof TodoApp.Model.Type,
    messages: ReadonlyArray<typeof TodoApp.Message.Type>,
  ) =>
    Array.reduce(
      messages,
      model,
      (current, message) => TodoApp.update(current, message)[0],
    )

  it('offers a typed free-form value on an open choose step and runs it on Enter', () => {
    const start = TodoApp.init()[0]
    const opened = stepTodo(start, todoInteraction.openMenu(start))
    const choosing = stepTodo(
      opened,
      todoInteraction.chooseFromMenu(opened, 'CreateItem'),
    )
    const typed = stepTodo(
      choosing,
      todoInteraction.typeInMenu(choosing, 'test'),
    )
    const menu = Option.getOrThrow(todoInteraction.menu(typed))
    expect(menu.summary).toBe('1 choice matches “test”')
    expect(menu.rows.map(row => [row.entry.tag, row.isHighlighted])).toEqual([
      ['CreateItem:test', true],
    ])

    const submitted = stepTodo(
      typed,
      todoInteraction.pressKey(typed, keyInput('Enter')),
    )
    expect(submitted.items).toEqual(['test'])
    expect(todoInteraction.menu(submitted)).toEqual(Option.none())
  })

  it('shows why an open choice is disabled when accepts rejects the typed value', () => {
    const start = TodoApp.init()[0]
    const opened = stepTodo(start, todoInteraction.openMenu(start))
    const choosing = stepTodo(
      opened,
      todoInteraction.chooseFromMenu(opened, 'CreateItem'),
    )
    const typed = stepTodo(
      choosing,
      todoInteraction.typeInMenu(choosing, 'forbidden'),
    )
    const menu = Option.getOrThrow(todoInteraction.menu(typed))
    expect(menu.rows.map(row => row.entry.availability)).toEqual([
      Catalog.Disabled({ because: 'that title is reserved' }),
    ])
  })
})

import { Array, Match as M, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import { type KeyInput, keyInput } from '../interaction/interaction.js'
import { Dialog, stackAtRoot } from '../navigation/structure.js'
import { make } from '../program/program.js'
import { ts } from '../schema/index.js'
import * as ActionMenu from './actionMenu.js'

const CounterModel = S.Struct({ count: S.Number })
type CounterModel = typeof CounterModel.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+', '='] },
})
const Decrement = Catalog.action('Decrement', {
  what: 'Decrements the count by one',
  why: 'The person wants a lower count',
  meta: { label: '-', keys: ['-'] },
})
const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'The person wants to start over',
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
  navigation: { Destination: Counter, root: Counter() },
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
        query: '',
        isFilterFocused: true,
        style: Dialog(),
        rows: [
          expect.objectContaining({ isHighlighted: true, isFocused: false }),
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
    expect(model.navigation.presented._tag).toBe('PresentingEntries')
    expect(
      model.navigation.presented._tag === 'PresentingEntries'
        ? model.navigation.presented.entries.length
        : 0,
    ).toBe(1)
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

  it('deletes with Backspace', () => {
    const model = press(
      press(openMenu(initial()), keyInput('d')),
      keyInput('Backspace'),
    )
    expect(
      Option.map(ActionMenu.menuOf(model.navigation), menu => menu.query),
    ).toEqual(Option.some(''))
  })

  it('highlights nothing when nothing matches', () => {
    const model = press(openMenu(initial()), keyInput('z'))
    expect(focusOf(model)).toEqual(
      Option.some(ActionMenu.OnFilter({ maybeHighlighted: Option.none() })),
    )
  })
})

describe('focus', () => {
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
  it('sends the Action itself, then closes the menu', () => {
    const model = openMenu(initial())
    expect(interaction.pressKey(model, keyInput('Enter'))).toEqual([
      Increment(),
      ActionMenu.ChoseActionMenuAction({ tag: 'Increment' }),
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

import { Option } from 'effect'
import { Program } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  actionMenuMessageFromKey,
  canAttachDomKeydown,
  chosenMenuTokenOf,
  isActionMenuEnterKey,
  productMessageFromKey,
} from './actionMenuKeys.js'
import { listActions } from './listActions.js'
import { Decrement, Increment, Reset } from './message.js'
import { Model } from './model.js'
import { CounterProgram } from './program.js'

const openMenu = Program.Open({
  focus: 0,
  maybeQuery: Option.none(),
})
const closedMenu = Program.Closed()
const atZero = Model.make({ count: 0 })
const atTwo = Model.make({ count: 2 })
const rows = listActions(CounterProgram, atZero)

describe('actionMenuMessageFromKey', () => {
  it('toggles cmd-K and ?', () => {
    expect(
      actionMenuMessageFromKey(
        { key: 'k', metaKey: true, ctrlKey: false },
        closedMenu,
        rows,
        atZero,
      ),
    ).toEqual(Program.ActionMenuCommandTriggered())
    expect(
      actionMenuMessageFromKey(
        { key: '?', metaKey: false, ctrlKey: false },
        openMenu,
        rows,
        atZero,
      ),
    ).toEqual(Program.ActionMenuCommandTriggered())
  })

  it('maps Enter aliases to ActionCommandMenuSelectionMade', () => {
    for (const key of ['Enter', 'enter', 'return', '\r', '\n']) {
      expect(isActionMenuEnterKey(key)).toBe(true)
      expect(
        actionMenuMessageFromKey(
          { key, metaKey: false, ctrlKey: false },
          openMenu,
          rows,
          atZero,
        ),
      ).toEqual(Program.ActionCommandMenuSelectionMade({ token: 'increment' }))
    }
  })

  it('sends Increment from + while Closed and while Open', () => {
    expect(
      actionMenuMessageFromKey(
        { key: '+', metaKey: false, ctrlKey: false },
        closedMenu,
        rows,
        atZero,
      ),
    ).toEqual(Increment())
    expect(
      actionMenuMessageFromKey(
        { key: '+', metaKey: false, ctrlKey: false },
        openMenu,
        rows,
        atZero,
      ),
    ).toEqual(Increment())
    expect(
      actionMenuMessageFromKey(
        { key: '=', metaKey: false, ctrlKey: false },
        closedMenu,
        rows,
        atZero,
      ),
    ).toEqual(Increment())
    expect(
      actionMenuMessageFromKey(
        { key: '-', metaKey: false, ctrlKey: false },
        openMenu,
        rows,
        atZero,
      ),
    ).toEqual(Decrement())
  })

  it('does not send Reset when hidden and does send when tappable', () => {
    expect(productMessageFromKey('r', atZero)).toBeUndefined()
    expect(
      actionMenuMessageFromKey(
        { key: 'r', metaKey: false, ctrlKey: false },
        closedMenu,
        rows,
        atZero,
      ),
    ).toBeUndefined()
    expect(
      actionMenuMessageFromKey(
        { key: 'r', metaKey: false, ctrlKey: false },
        openMenu,
        rows,
        atZero,
      ),
    ).toBeUndefined()
    expect(productMessageFromKey('r', atTwo)).toEqual(Reset())
    expect(
      actionMenuMessageFromKey(
        { key: 'R', metaKey: false, ctrlKey: false },
        openMenu,
        listActions(CounterProgram, atTwo),
        atTwo,
      ),
    ).toEqual(Reset())
  })

  it('filters printable keys that are not Action keys', () => {
    expect(
      actionMenuMessageFromKey(
        { key: 's', metaKey: false, ctrlKey: false },
        openMenu,
        rows,
        atZero,
      ),
    ).toEqual(Program.ActionMenuQueryChanged({ query: 's' }))
    const querying = Program.Open({
      focus: 0,
      maybeQuery: Option.some('s'),
    })
    expect(
      actionMenuMessageFromKey(
        { key: 'e', metaKey: false, ctrlKey: false },
        querying,
        rows,
        atZero,
      ),
    ).toEqual(Program.ActionMenuQueryChanged({ query: 'se' }))
  })

  it('closes on Escape while Open', () => {
    expect(
      actionMenuMessageFromKey(
        { key: 'Escape', metaKey: false, ctrlKey: false },
        openMenu,
        rows,
        atZero,
      ),
    ).toEqual(Program.ActionMenuDismissed())
  })

  it('does not attach DOM keys in Node', () => {
    expect(canAttachDomKeydown()).toBe(false)
  })

  it('names the chosen token for Enter and Action keys', () => {
    expect(chosenMenuTokenOf(Increment())).toEqual(Option.some('increment'))
    expect(chosenMenuTokenOf(Reset())).toEqual(Option.some('reset'))
    expect(
      chosenMenuTokenOf(
        Program.ActionCommandMenuSelectionMade({ token: 'decrement' }),
      ),
    ).toEqual(Option.some('decrement'))
    expect(chosenMenuTokenOf(Program.ActionMenuDismissed())).toEqual(
      Option.none(),
    )
  })
})

import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import * as ActionMenu from '../actionMenu/actionMenu.js'
import {
  App,
  Increment,
  appInteraction,
  bindCounter,
} from '../test/apps/catalogCounter.js'
import {
  ChoseFromMenu,
  DismissedMenu,
  OpenedMenu,
  PressedAction,
  PressedKey,
  TypedInMenu,
  applyGesture,
  messagesOfGesture,
} from './gesture.js'
import { keyInput } from './interaction.js'

describe('applyGesture', () => {
  it('presses an Enabled Action and refuses a Disabled one', () => {
    const bound = bindCounter()
    expect(applyGesture(bound, PressedAction({ tag: 'Reset' }))).toBe(false)
    expect(applyGesture(bound, PressedAction({ tag: 'Increment' }))).toBe(true)
    expect(bound.readModel().count).toBe(1)
  })

  it('routes a pressed key through the Catalog keys', () => {
    const bound = bindCounter()
    expect(applyGesture(bound, PressedKey({ input: keyInput('+') }))).toBe(true)
    expect(bound.readModel().count).toBe(1)
  })

  it('opens, filters, chooses from, and dismisses the menu', () => {
    const bound = bindCounter(4)
    applyGesture(bound, OpenedMenu())
    applyGesture(bound, TypedInMenu({ query: 'res' }))
    expect(Option.map(bound.menu(), menu => menu.query)).toEqual(
      Option.some('res'),
    )
    applyGesture(bound, ChoseFromMenu({ tag: 'Reset' }))
    expect(bound.readModel().count).toBe(0)
    expect(Option.isNone(bound.menu())).toBe(true)

    applyGesture(bound, OpenedMenu())
    applyGesture(bound, DismissedMenu())
    expect(Option.isNone(bound.menu())).toBe(true)
  })
})

describe('messagesOfGesture', () => {
  it('returns the Messages a gesture would send without sending them', () => {
    const [model] = App.init()
    expect(
      messagesOfGesture(
        appInteraction,
        model,
        PressedAction({ tag: 'Increment' }),
      ),
    ).toEqual([Increment()])
    const [open] = App.update(model, ActionMenu.OpenedActionMenu())
    expect(
      messagesOfGesture(
        appInteraction,
        open,
        ChoseFromMenu({ tag: 'Increment' }),
      ),
    ).toEqual([
      Increment(),
      ActionMenu.ChoseActionMenuAction({ tag: 'Increment' }),
    ])
  })
})

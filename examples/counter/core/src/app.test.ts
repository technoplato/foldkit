import { Array, Option } from 'effect'
import { ActionMenu, Interaction, Navigation } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { App, type AppMessage, type AppModel } from './app.js'
import { Increment, Reset } from './message.js'
import { Counter } from './navigation.js'

const interactionOf = () => {
  const interaction = App.interaction
  if (interaction === undefined) {
    throw new Error('App must carry an interaction')
  }
  return interaction
}

const apply = (
  model: AppModel,
  messages: ReadonlyArray<AppMessage>,
): AppModel =>
  Array.reduce(
    messages,
    model,
    (current, message) => App.update(current, message)[0],
  )

const pressAll = (model: AppModel, keys: ReadonlyArray<string>): AppModel =>
  Array.reduce(keys, model, (current, key) =>
    apply(
      current,
      interactionOf().pressKey(current, Interaction.keyInput(key)),
    ),
  )

const withCount = (count: number): AppModel => ({ ...App.init()[0], count })

describe('App', () => {
  it('starts at the Counter page with the count beside the stack', () => {
    expect(App.init()[0]).toEqual({
      count: 0,
      navigation: Navigation.stackAtRoot(Counter()),
    })
  })

  it('opens the menu, filters to Reset, and sends it with Enter', () => {
    const open = apply(withCount(3), interactionOf().openMenu(withCount(3)))
    const filtered = pressAll(open, ['r', 'e', 's'])
    expect(
      Option.map(interactionOf().menu(filtered), menu =>
        menu.rows.map(row => row.entry.tag),
      ),
    ).toEqual(Option.some(['Reset']))
    expect(
      interactionOf().pressKey(filtered, Interaction.keyInput('Enter')),
    ).toEqual([Reset(), ActionMenu.ChoseActionMenuAction({ tag: 'Reset' })])
    const chosen = pressAll(filtered, ['Enter'])
    expect(chosen).toEqual({
      count: 0,
      navigation: Navigation.stackAtRoot(Counter()),
    })
  })

  it('keeps sending `+` straight to the Counter while the menu is closed', () => {
    expect(
      interactionOf().pressKey(withCount(0), Interaction.keyInput('+')),
    ).toEqual([Increment()])
  })

  it('classifies menu Messages as Navigation and Counter Actions as Domain', () => {
    const synchronization = App.synchronization
    expect(
      synchronization?.messageCategory(ActionMenu.OpenedActionMenu()),
    ).toBe('Navigation')
    expect(synchronization?.messageCategory(Increment())).toBe('Domain')
  })
})

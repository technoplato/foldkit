import { Array, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import { paintScreen } from 'foldkit/cli'
import { describe, expect, it } from 'vitest'

import { App, type AppModel } from './app.js'

const bindApp = () => {
  let model: AppModel = App.init()[0]
  return Interaction.bind(App, {
    readModel: () => model,
    subscribe: () => () => {},
    send: message => {
      model = App.update(model, message)[0]
    },
    stop: () => Promise.resolve(),
  })
}

type Bound = ReturnType<typeof bindApp>

const pressAll = (
  bound: Bound,
  keys: ReadonlyArray<string>,
  focus: Interaction.TerminalFocus = Interaction.noTerminalFocus,
): Interaction.TerminalFocus =>
  Array.reduce(
    keys,
    focus,
    (current, key) =>
      Interaction.pressTerminalKeyAt(bound, Interaction.keyInput(key), current)
        .focus,
  )

const focusedOf = (bound: Bound, focus: Interaction.TerminalFocus) =>
  Option.flatMap(Navigation.frameOf(bound), frame =>
    Interaction.focusedTagOf(frame, focus),
  )

const uriOf = (bound: Bound) => Option.map(bound.navigation(), plan => plan.uri)

const countsOf = (bound: Bound) =>
  Array.map(bound.readModel().counters, row => row.counter.count)

describe('Multiple Counters in a terminal', () => {
  it('moves a highlight across the buttons, row by row', () => {
    const bound = bindApp()
    bound.press('Add')
    const onFirst = pressAll(bound, ['ArrowDown'])
    expect(focusedOf(bound, onFirst)).toEqual(Option.some('Increment:1'))
    const onSecondRow = pressAll(bound, ['ArrowRight', 'ArrowDown'], onFirst)
    expect(focusedOf(bound, onSecondRow)).toEqual(Option.some('Decrement:2'))
    expect(paintScreen(bound, onSecondRow)).toContain('[>-<]')
  })

  it('presses the highlighted button on Enter, and acts on its row with a key', () => {
    const bound = bindApp()
    bound.press('Add')
    const onSecondRow = pressAll(bound, ['ArrowDown', 'ArrowDown'])
    pressAll(bound, ['Enter', 'Enter'], onSecondRow)
    expect(countsOf(bound)).toEqual([0, 2])
    pressAll(bound, ['r'], onSecondRow)
    expect(countsOf(bound)).toEqual([0, 0])
    pressAll(bound, ['o'], onSecondRow)
    expect(uriOf(bound)).toEqual(Option.some('/counters/2'))
  })

  it('gives a dialog the keyboard, with its keys on its buttons', () => {
    const bound = bindApp()
    bound.press('Add')
    const onSecondRow = pressAll(bound, ['ArrowDown', 'ArrowDown'])
    pressAll(bound, ['d'], onSecondRow)
    expect(uriOf(bound)).toEqual(Option.some('/counters/delete/2'))
    expect(paintScreen(bound, onSecondRow)).toContain(
      '[>Delete (y)<] [ Cancel (n) ]',
    )
    const onCancel = pressAll(bound, ['ArrowRight'], onSecondRow)
    pressAll(bound, ['Enter'], onCancel)
    expect(uriOf(bound)).toEqual(Option.some('/counters'))
    expect(focusedOf(bound, onCancel)).toEqual(Option.some('Increment:2'))
  })
})

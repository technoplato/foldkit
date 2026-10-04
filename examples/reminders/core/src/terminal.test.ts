import { Array, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import { paintScreen } from 'foldkit/cli'
import { describe, expect, it } from 'vitest'

import { App, type AppModel } from './app.js'
import { LocalDay } from './calendar.js'
import { ReachedDay, ReceivedBoard } from './message.js'
import { sampleBoard, sampleListIds } from './sample.js'

const today = LocalDay.make('2026-10-07')

const oatMilk = '00000000-0000-4000-8003-000000000001'

const sourdough = '00000000-0000-4000-8003-000000000002'

const bindApp = () => {
  let model: AppModel = App.update(
    App.update(App.init()[0], ReceivedBoard({ board: sampleBoard(today) }))[0],
    ReachedDay({ today }),
  )[0]
  const pressed: Array<string> = []
  const bound = Interaction.bind(App, {
    readModel: () => model,
    subscribe: () => () => {},
    send: message => {
      pressed.push(message._tag)
      model = App.update(model, message)[0]
    },
    stop: () => Promise.resolve(),
  })
  return { bound, pressed }
}

type Bound = ReturnType<typeof bindApp>['bound']

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

describe('Reminders in a terminal', () => {
  it('highlights a reminder’s box first, ticks it on Enter, and opens it to the right', () => {
    const { bound, pressed } = bindApp()
    bound.press(`OpenList:${sampleListIds.groceries}`)
    const onBox = pressAll(bound, ['ArrowDown'])
    expect(focusedOf(bound, onBox)).toEqual(Option.some(`Complete:${oatMilk}`))
    expect(paintScreen(bound, onBox)).toContain('›[ ]')
    pressAll(bound, ['Enter'], onBox)
    const onRow = pressAll(bound, ['ArrowRight'], onBox)
    expect(focusedOf(bound, onRow)).toEqual(
      Option.some(`OpenReminder:${oatMilk}`),
    )
    expect(Array.filter(pressed, tag => tag !== 'OpenList')).toEqual([
      'Complete',
    ])
  })

  it('acts on the highlighted reminder with its keys', () => {
    const { bound, pressed } = bindApp()
    bound.press(`OpenList:${sampleListIds.groceries}`)
    const onSecond = pressAll(bound, ['ArrowDown', 'ArrowDown'])
    expect(focusedOf(bound, onSecond)).toEqual(
      Option.some(`Complete:${sourdough}`),
    )
    pressAll(bound, ['x', 'f'], onSecond)
    expect(Array.filter(pressed, tag => tag !== 'OpenList')).toEqual([
      'Complete',
      'Flag',
    ])
  })

  it('paints done reminders ticked', () => {
    const { bound } = bindApp()
    bound.press('OpenSmartList:completed')
    expect(paintScreen(bound, Interaction.noTerminalFocus)).toContain(
      '[x]   Olive oil',
    )
  })
})

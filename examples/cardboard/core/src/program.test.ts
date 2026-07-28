import { Effect } from 'effect'
import * as Program from 'foldkit/program'
import { describe, expect, it } from 'vitest'

import { zeroMachine } from './machine.js'
import {
  AdvancedZeroButtonHold,
  AdvancedZeroOpening,
  CompletedZeroGame,
  CompletedZeroOpening,
  PressedLowercaseG,
  PressedSpace,
  PressedZeroButton,
  ReleasedZeroButton,
  SelectedAccessibilityProfile,
  SelectedIncorrectInputMethod,
  SelectedMirrorAnswer,
  ToggledRgbInversion,
} from './message.js'
import { initialModel } from './model.js'
import { CardboardRouter } from './route.js'
import { update } from './update.js'

describe('Cardboard Program', () => {
  it('models hold, opening, configuration, and completion as legal states', () => {
    const [pressing] = update(initialModel, PressedZeroButton())
    const [stillPressing] = update(
      pressing,
      AdvancedZeroButtonHold({ elapsedMilliseconds: 900 }),
    )
    const [opening] = update(
      stillPressing,
      AdvancedZeroButtonHold({ elapsedMilliseconds: 1_800 }),
    )
    const [openingHalfway] = update(
      opening,
      AdvancedZeroOpening({ progressPermille: 500 }),
    )
    const [configuring] = update(openingHalfway, CompletedZeroOpening())
    const [groovebox] = update(
      configuring,
      SelectedAccessibilityProfile({ profile: 'Groovebox' }),
    )
    const [inverted] = update(groovebox, ToggledRgbInversion())
    const [choosing] = update(inverted, CompletedZeroGame())
    const [rejected] = update(
      choosing,
      SelectedIncorrectInputMethod({
        inputMethod: 'Nintendo64Controller',
      }),
    )
    const [completed] = update(rejected, SelectedMirrorAnswer())

    expect(pressing.zero._tag).toBe('PressingZero')
    expect(stillPressing.zero).toMatchObject({ elapsedMilliseconds: 900 })
    expect(opening.zero._tag).toBe('OpeningZero')
    expect(openingHalfway.zero).toMatchObject({ progressPermille: 500 })
    expect(configuring.zero._tag).toBe('ConfiguringAtZero')
    expect(groovebox.zero).toMatchObject({ profile: 'Groovebox' })
    expect(inverted.zero).toMatchObject({ isRgbInverted: true })
    expect(choosing.zero._tag).toBe('ChoosingInputMethod')
    expect(rejected.zero).toMatchObject({
      _tag: 'RejectedInputMethodChoice',
      attemptedInputMethod: 'Nintendo64Controller',
    })
    expect(completed.zero).toMatchObject({
      _tag: 'CompletedAtZero',
      resolution: { _tag: 'AnsweredMirrorRiddle' },
      slashCount: 0,
    })
  })

  it('cancels an incomplete hold on release', () => {
    const [pressing] = update(initialModel, PressedZeroButton())
    const [released] = update(pressing, ReleasedZeroButton())

    expect(released).toStrictEqual(initialModel)
  })

  it('interprets three Spaces as skip and canonical Vim gg as return', () => {
    const [oneSpace] = update(initialModel, PressedSpace())
    const [twoSpaces] = update(oneSpace, PressedSpace())
    const [skipped] = update(twoSpaces, PressedSpace())
    const [oneG] = update(skipped, PressedLowercaseG())
    const [returned] = update(oneG, PressedLowercaseG())

    expect(oneSpace.keyboardInput.spacePressCount).toBe(1)
    expect(twoSpaces.keyboardInput.spacePressCount).toBe(2)
    expect(skipped.zero._tag).toBe('ConfiguringAtZero')
    expect(returned).toStrictEqual(initialModel)
  })

  it('exposes an enumerable graph with no unreachable state', () => {
    expect(zeroMachine.unreachableStates()).toEqual([])
    expect(zeroMachine.deadTransitions()).toEqual([])
    expect(zeroMachine.toMermaid()).toContain(
      'WaitingAtZero --> PressingZero: PressedZeroButton',
    )
  })

  it('round-trips the constitutional root and engine-owned state routes', async () => {
    await expect(
      Effect.runPromise(CardboardRouter.canonicalize('/0/')),
    ).resolves.toBe('/0')

    const [pressing] = update(initialModel, PressedZeroButton())
    const stateRoute = Program.state(pressing)
    const printed = await Effect.runPromise(CardboardRouter.print(stateRoute))
    const parsed = await Effect.runPromise(CardboardRouter.parse(printed))

    expect(printed.startsWith('/0/state?model=')).toBe(true)
    expect(parsed).toStrictEqual(stateRoute)
  })
})

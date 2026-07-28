import { Array, Effect, Exit, Layer } from 'effect'
import * as Program from 'foldkit/program'
import * as Runtime from 'foldkit/program-runtime'
import { describe, expect, it } from 'vitest'

import {
  cardboardAuthorship,
  cardboardAuthorshipAcronym,
  cardboardAuthorshipStatement,
} from './authorship.js'
import { cardboardScreen, renderCardboardText } from './component.js'
import { conversationLedger, currentConversationScaleLevel } from './ledger.js'
import { zeroMachine } from './machine.js'
import {
  AdvancedCardboardSequence,
  AdvancedZeroButtonHold,
  AdvancedZeroOpening,
  CompletedZeroGame,
  CompletedZeroOpening,
  OpenedConversationLedger,
  PressedLowercaseG,
  PressedSpace,
  PressedZeroButton,
  ReleasedZeroButton,
  ReturnedToCardboardSequence,
  SelectedAccessibilityProfile,
  SelectedIncorrectInputMethod,
  SelectedMirrorAnswer,
  ToggledRgbInversion,
} from './message.js'
import {
  initialConversationLedgerModel,
  initialModel,
  initialRuleZeroModel,
} from './model.js'
import { CardboardProgram } from './program.js'
import { CardboardRouter, sequencePortableRoute } from './route.js'
import { update } from './update.js'

const sha256 = async (value: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )

  const hexadecimalOctets = Array.map(
    Array.fromIterable(new Uint8Array(digest)),
    byte => byte.toString(16).padStart(2, '0'),
  )
  return hexadecimalOctets.join('')
}

describe('Cardboard Program', () => {
  it('content-addresses the exact public authorship record', async () => {
    expect(await sha256(cardboardAuthorshipAcronym)).toBe(
      cardboardAuthorship.acronymSha256,
    )
    expect(await sha256(cardboardAuthorshipStatement)).toBe(
      cardboardAuthorship.statementSha256,
    )
  })

  it('models hold, opening, configuration, and completion as legal states', () => {
    const [pressing] = update(initialRuleZeroModel, PressedZeroButton())
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
    const [pressing] = update(initialRuleZeroModel, PressedZeroButton())
    const [released] = update(pressing, ReleasedZeroButton())

    expect(released).toStrictEqual(initialRuleZeroModel)
  })

  it('interprets three Spaces as skip and canonical Vim gg as return', () => {
    const [oneSpace] = update(initialRuleZeroModel, PressedSpace())
    const [twoSpaces] = update(oneSpace, PressedSpace())
    const [skipped] = update(twoSpaces, PressedSpace())
    const [oneG] = update(skipped, PressedLowercaseG())
    const [returned] = update(oneG, PressedLowercaseG())

    expect(oneSpace.keyboardInput.spacePressCount).toBe(1)
    expect(twoSpaces.keyboardInput.spacePressCount).toBe(2)
    expect(skipped.zero._tag).toBe('ConfiguringAtZero')
    expect(returned).toStrictEqual(initialRuleZeroModel)
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

    const [pressing] = update(initialRuleZeroModel, PressedZeroButton())
    const stateRoute = Program.state(pressing)
    const printed = await Effect.runPromise(CardboardRouter.print(stateRoute))
    const parsed = await Effect.runPromise(CardboardRouter.parse(printed))

    expect(printed.startsWith('/0/state?model=')).toBe(true)
    expect(parsed).toStrictEqual(stateRoute)
  })

  it('round-trips the append-only ledger at /0/log', async () => {
    await expect(
      Effect.runPromise(CardboardRouter.canonicalize('/0/log/')),
    ).resolves.toBe('/0/log')

    const obsoleteAlias = await Effect.runPromiseExit(
      CardboardRouter.parse('/0/0'),
    )

    const parsed = await Effect.runPromise(CardboardRouter.parse('/0/log'))
    const printed = await Effect.runPromise(CardboardRouter.print(parsed))

    expect(Exit.isFailure(obsoleteAlias)).toBe(true)
    expect(parsed).toStrictEqual(Program.state(initialConversationLedgerModel))
    expect(printed).toBe('/0/log')
  })

  it('moves between the sequence and ledger through factual Messages', () => {
    const [ledger] = update(initialModel, OpenedConversationLedger())
    const [sequence] = update(ledger, ReturnedToCardboardSequence())

    expect(ledger.page._tag).toBe('ConversationLedgerPage')
    expect(sequence).toStrictEqual(initialModel)
  })

  it('records each page replacement in the Message tape', async () => {
    const tape = await Effect.runPromise(
      Effect.scoped(
        Runtime.recordReplayTape(CardboardProgram, Layer.empty, [
          AdvancedCardboardSequence(),
          OpenedConversationLedger(),
          ReturnedToCardboardSequence(),
        ]),
      ),
    )
    const five = await Effect.runPromise(
      Runtime.replayToFrame(CardboardProgram, tape, 1),
    )
    const ledger = await Effect.runPromise(
      Runtime.replayToFrame(CardboardProgram, tape, 2),
    )
    const four = await Effect.runPromise(
      Runtime.replayToFrame(CardboardProgram, tape, 3),
    )

    expect(
      Array.map(tape.transitions, transition => transition.message._tag),
    ).toStrictEqual([
      'AdvancedCardboardSequence',
      'OpenedConversationLedger',
      'ReturnedToCardboardSequence',
    ])
    expect(tape.initialModel.page).toMatchObject({ value: 4n })
    expect(five.page).toMatchObject({ value: 5n })
    expect(ledger.page._tag).toBe('ConversationLedgerPage')
    expect(four).toStrictEqual(initialModel)
  })

  it('models an unbounded sequence with one finite value', async () => {
    const [five] = update(initialModel, AdvancedCardboardSequence())
    const [six] = update(five, AdvancedCardboardSequence())
    const veryLargeValue =
      999999999999999999999999999999999999999999999999999999999999n
    const veryLargeRoute = sequencePortableRoute(veryLargeValue)
    const parsed = await Effect.runPromise(
      CardboardRouter.parse(veryLargeRoute),
    )

    expect(initialModel.page).toMatchObject({ value: 4n })
    expect(five.page).toMatchObject({ value: 5n })
    expect(six.page).toMatchObject({ value: 6n })
    expect(
      await Effect.runPromise(CardboardRouter.print(Program.state(five))),
    ).toBe('/0/5')
    expect(parsed).toMatchObject({ model: { page: { value: veryLargeValue } } })
  })

  it('projects one shared semantic button for every renderer', () => {
    const screen = cardboardScreen(initialModel)

    expect(screen).toStrictEqual({
      _tag: 'CardboardScreen',
      commands: [
        {
          _tag: 'CardboardCommand',
          action: 'OpenConversationLedger',
          key: 'L',
          text: 'Log',
        },
      ],
      content: {
        _tag: 'CardboardButton',
        accessibilityLabel: 'Next',
        action: 'AdvanceCardboardSequence',
        text: '4',
      },
    })
    expect(renderCardboardText(screen)).toBe('4')
  })

  it('keeps the public conversation ledger ordered and at Ship level', () => {
    expect(currentConversationScaleLevel).toBe(4)
    expect(conversationLedger.map(entry => entry.sequence)).toStrictEqual([
      1, 2, 3, 4, 5, 6,
    ])
  })
})

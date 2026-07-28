import { Match as M } from 'effect'
import type * as Command from 'foldkit/command'
import { evo } from 'foldkit/struct'

import { zeroMachine } from './machine.js'
import {
  type Message,
  ReturnedToZeroStart,
  SkippedZeroStep,
} from './message.js'
import {
  ConversationLedgerPage,
  type KeyboardInput,
  type Model,
  RuleZeroPage,
  SequencePage,
  type SpacePressCount,
  initialKeyboardInput,
} from './model.js'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const resetKeyboardInput = (): KeyboardInput => initialKeyboardInput

const transitionZero = (model: Model, message: Message): UpdateReturn => {
  const [nextZero, commands] = zeroMachine.transition(model.zero, message)
  return [
    evo(model, {
      keyboardInput: resetKeyboardInput,
      zero: () => nextZero,
    }),
    commands,
  ]
}

const nextSpacePressCount = (
  spacePressCount: SpacePressCount,
): SpacePressCount => (spacePressCount === 0 ? 1 : 2)

const pressedSpace = (model: Model): UpdateReturn => {
  if (model.keyboardInput.spacePressCount === 2) {
    return transitionZero(model, SkippedZeroStep())
  } else {
    return [
      evo(model, {
        keyboardInput: keyboardInput => ({
          lowercaseGPressCount: 0,
          spacePressCount: nextSpacePressCount(keyboardInput.spacePressCount),
        }),
      }),
      [],
    ]
  }
}

const pressedLowercaseG = (model: Model): UpdateReturn => {
  if (model.keyboardInput.lowercaseGPressCount === 1) {
    return transitionZero(model, ReturnedToZeroStart())
  } else {
    return [
      evo(model, {
        keyboardInput: () => ({
          lowercaseGPressCount: 1,
          spacePressCount: 0,
        }),
      }),
      [],
    ]
  }
}

const openedConversationLedger = (model: Model): UpdateReturn => [
  evo(model, {
    keyboardInput: resetKeyboardInput,
    page: () => ConversationLedgerPage(),
  }),
  [],
]

const returnedToRuleZeroPage = (model: Model): UpdateReturn => [
  evo(model, {
    keyboardInput: resetKeyboardInput,
    page: () => RuleZeroPage(),
  }),
  [],
]

const advancedCardboardSequence = (model: Model): UpdateReturn => {
  if (model.page._tag === 'SequencePage') {
    const nextValue = model.page.value + 1n
    return [
      evo(model, {
        keyboardInput: resetKeyboardInput,
        page: () => SequencePage({ value: nextValue }),
      }),
      [],
    ]
  } else {
    return [model, []]
  }
}

/** Applies one Cardboard Message through its keyboard grammar or Rule Zero Machine. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      PressedSpace: () => pressedSpace(model),
      PressedLowercaseG: () => pressedLowercaseG(model),
      OpenedConversationLedger: () => openedConversationLedger(model),
      ReturnedToRuleZeroPage: () => returnedToRuleZeroPage(model),
      AdvancedCardboardSequence: () => advancedCardboardSequence(model),
      PressedZeroButton: zeroMessage => transitionZero(model, zeroMessage),
      AdvancedZeroButtonHold: zeroMessage => transitionZero(model, zeroMessage),
      ReleasedZeroButton: zeroMessage => transitionZero(model, zeroMessage),
      AdvancedZeroOpening: zeroMessage => transitionZero(model, zeroMessage),
      CompletedZeroOpening: zeroMessage => transitionZero(model, zeroMessage),
      SelectedAccessibilityProfile: zeroMessage =>
        transitionZero(model, zeroMessage),
      ToggledRgbInversion: zeroMessage => transitionZero(model, zeroMessage),
      SelectedMirrorAnswer: zeroMessage => transitionZero(model, zeroMessage),
      SelectedIncorrectInputMethod: zeroMessage =>
        transitionZero(model, zeroMessage),
      SkippedZeroStep: zeroMessage => transitionZero(model, zeroMessage),
      CompletedZeroGame: zeroMessage => transitionZero(model, zeroMessage),
      ReturnedToZeroStart: zeroMessage => transitionZero(model, zeroMessage),
    }),
  )

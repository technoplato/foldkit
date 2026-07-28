import { Machine } from 'foldkit/experimental'
import { otherwise, to, when } from 'foldkit/experimental/machine'

import { Message } from './message.js'
import {
  type AccessibilityProfile,
  AnsweredMirrorRiddle,
  ChoosingInputMethod,
  CompletedAtZero,
  ConfiguringAtZero,
  OpeningZero,
  PressingZero,
  RejectedInputMethodChoice,
  SkippedInputMethodRiddle,
  WaitingAtZero,
  ZeroState,
  initialAccessibilityProfile,
  initialSlashCount,
} from './model.js'

/** Milliseconds required to open Rule Zero by holding its control. */
export const holdThresholdMilliseconds = 1_800
/** Milliseconds represented by each hold progress tick. */
export const holdTickMilliseconds = 100
/** Permille represented by each opening progress tick. */
export const openingTickPermille = 100

const waitingAtZero = (slashCount: number): typeof WaitingAtZero.Type =>
  WaitingAtZero({ slashCount })

const configuringAtZero = (slashCount: number): typeof ConfiguringAtZero.Type =>
  ConfiguringAtZero({
    isRgbInverted: false,
    profile: initialAccessibilityProfile,
    slashCount,
  })

const choosingInputMethod = (
  state: Readonly<{
    isRgbInverted: boolean
    profile: AccessibilityProfile
    slashCount: number
  }>,
): typeof ChoosingInputMethod.Type =>
  ChoosingInputMethod({
    isRgbInverted: state.isRgbInverted,
    profile: state.profile,
    slashCount: state.slashCount,
  })

/** The typed and inspectable Rule Zero transition graph. */
export const zeroMachine = Machine.define({
  state: ZeroState,
  message: Message,
})({
  initial: WaitingAtZero({ slashCount: initialSlashCount }),
  states: {
    WaitingAtZero: {
      on: {
        PressedZeroButton: to('PressingZero', ({ state }) =>
          PressingZero({
            elapsedMilliseconds: 0,
            slashCount: state.slashCount,
          }),
        ),
        SkippedZeroStep: to('ConfiguringAtZero', ({ state }) =>
          configuringAtZero(state.slashCount),
        ),
        CompletedZeroGame: to('ChoosingInputMethod', ({ state }) =>
          choosingInputMethod(configuringAtZero(state.slashCount)),
        ),
        ReturnedToZeroStart: to('WaitingAtZero', ({ state }) =>
          waitingAtZero(state.slashCount),
        ),
      },
    },
    PressingZero: {
      on: {
        AdvancedZeroButtonHold: [
          when(
            (_state, message) =>
              message.elapsedMilliseconds >= holdThresholdMilliseconds,
            'OpeningZero',
            ({ state }) =>
              OpeningZero({
                progressPermille: 0,
                slashCount: state.slashCount,
              }),
          ),
          otherwise(
            to('PressingZero', ({ state, message }) =>
              PressingZero({
                elapsedMilliseconds: message.elapsedMilliseconds,
                slashCount: state.slashCount,
              }),
            ),
          ),
        ],
        ReleasedZeroButton: to('WaitingAtZero', ({ state }) =>
          waitingAtZero(state.slashCount),
        ),
        SkippedZeroStep: to('ConfiguringAtZero', ({ state }) =>
          configuringAtZero(state.slashCount),
        ),
        CompletedZeroGame: to('ChoosingInputMethod', ({ state }) =>
          choosingInputMethod(configuringAtZero(state.slashCount)),
        ),
        ReturnedToZeroStart: to('WaitingAtZero', ({ state }) =>
          waitingAtZero(state.slashCount),
        ),
      },
    },
    OpeningZero: {
      on: {
        AdvancedZeroOpening: to('OpeningZero', ({ state, message }) =>
          OpeningZero({
            progressPermille: message.progressPermille,
            slashCount: state.slashCount,
          }),
        ),
        CompletedZeroOpening: to('ConfiguringAtZero', ({ state }) =>
          configuringAtZero(state.slashCount),
        ),
        SkippedZeroStep: to('ConfiguringAtZero', ({ state }) =>
          configuringAtZero(state.slashCount),
        ),
        CompletedZeroGame: to('ChoosingInputMethod', ({ state }) =>
          choosingInputMethod(configuringAtZero(state.slashCount)),
        ),
        ReturnedToZeroStart: to('WaitingAtZero', ({ state }) =>
          waitingAtZero(state.slashCount),
        ),
      },
    },
    ConfiguringAtZero: {
      on: {
        SelectedAccessibilityProfile: to(
          'ConfiguringAtZero',
          ({ state, message }) =>
            ConfiguringAtZero({ ...state, profile: message.profile }),
        ),
        ToggledRgbInversion: to('ConfiguringAtZero', ({ state }) =>
          ConfiguringAtZero({
            ...state,
            isRgbInverted: !state.isRgbInverted,
          }),
        ),
        SkippedZeroStep: to('ChoosingInputMethod', ({ state }) =>
          choosingInputMethod(state),
        ),
        CompletedZeroGame: to('ChoosingInputMethod', ({ state }) =>
          choosingInputMethod(state),
        ),
        ReturnedToZeroStart: to('WaitingAtZero', ({ state }) =>
          waitingAtZero(state.slashCount),
        ),
      },
    },
    ChoosingInputMethod: {
      on: {
        SelectedMirrorAnswer: to('CompletedAtZero', ({ state }) =>
          CompletedAtZero({
            isRgbInverted: state.isRgbInverted,
            profile: state.profile,
            resolution: AnsweredMirrorRiddle(),
            slashCount: state.slashCount,
          }),
        ),
        SelectedIncorrectInputMethod: to(
          'RejectedInputMethodChoice',
          ({ state, message }) =>
            RejectedInputMethodChoice({
              attemptedInputMethod: message.inputMethod,
              isRgbInverted: state.isRgbInverted,
              profile: state.profile,
              slashCount: state.slashCount,
            }),
        ),
        SkippedZeroStep: to('CompletedAtZero', ({ state }) =>
          CompletedAtZero({
            isRgbInverted: state.isRgbInverted,
            profile: state.profile,
            resolution: SkippedInputMethodRiddle(),
            slashCount: state.slashCount,
          }),
        ),
        CompletedZeroGame: to('CompletedAtZero', ({ state }) =>
          CompletedAtZero({
            isRgbInverted: state.isRgbInverted,
            profile: state.profile,
            resolution: SkippedInputMethodRiddle(),
            slashCount: state.slashCount,
          }),
        ),
        ReturnedToZeroStart: to('WaitingAtZero', ({ state }) =>
          waitingAtZero(state.slashCount),
        ),
      },
    },
    RejectedInputMethodChoice: {
      on: {
        SelectedMirrorAnswer: to('CompletedAtZero', ({ state }) =>
          CompletedAtZero({
            isRgbInverted: state.isRgbInverted,
            profile: state.profile,
            resolution: AnsweredMirrorRiddle(),
            slashCount: state.slashCount,
          }),
        ),
        SelectedIncorrectInputMethod: to(
          'RejectedInputMethodChoice',
          ({ state, message }) =>
            RejectedInputMethodChoice({
              ...state,
              attemptedInputMethod: message.inputMethod,
            }),
        ),
        SkippedZeroStep: to('CompletedAtZero', ({ state }) =>
          CompletedAtZero({
            isRgbInverted: state.isRgbInverted,
            profile: state.profile,
            resolution: SkippedInputMethodRiddle(),
            slashCount: state.slashCount,
          }),
        ),
        CompletedZeroGame: to('CompletedAtZero', ({ state }) =>
          CompletedAtZero({
            isRgbInverted: state.isRgbInverted,
            profile: state.profile,
            resolution: SkippedInputMethodRiddle(),
            slashCount: state.slashCount,
          }),
        ),
        ReturnedToZeroStart: to('WaitingAtZero', ({ state }) =>
          waitingAtZero(state.slashCount),
        ),
      },
    },
    CompletedAtZero: {
      on: {
        SelectedAccessibilityProfile: to(
          'CompletedAtZero',
          ({ state, message }) =>
            CompletedAtZero({ ...state, profile: message.profile }),
        ),
        ToggledRgbInversion: to('CompletedAtZero', ({ state }) =>
          CompletedAtZero({
            ...state,
            isRgbInverted: !state.isRgbInverted,
          }),
        ),
        SkippedZeroStep: to('CompletedAtZero', ({ state }) =>
          CompletedAtZero({ ...state }),
        ),
        CompletedZeroGame: to('CompletedAtZero', ({ state }) =>
          CompletedAtZero({ ...state }),
        ),
        ReturnedToZeroStart: to('WaitingAtZero', ({ state }) =>
          waitingAtZero(state.slashCount),
        ),
      },
    },
  },
})

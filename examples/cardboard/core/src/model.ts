import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

// MODEL

/** Every presentation profile offered by Rule Zero. */
export const AccessibilityProfile = S.Literals([
  'AmberPaper',
  'QuietBlack',
  'Groovebox',
  'GrooveboxThroughInvert',
  'Negative',
  'HighContrast',
])
/** A Rule Zero presentation profile. */
export type AccessibilityProfile = typeof AccessibilityProfile.Type

/** Input choices that do not answer the mirror riddle. */
export const IncorrectInputMethod = S.Literals([
  'SegaGenesisController',
  'Nintendo64Controller',
  'GameBoyColor',
  'Xbox360Controller',
  'MouseAndKeyboard',
  'Joystick',
  'Eyes',
  'HeadLookingUp',
  'HeadLookingDown',
  'HeadLookingRight',
])
/** An input choice that does not answer the mirror riddle. */
export type IncorrectInputMethod = typeof IncorrectInputMethod.Type

/** Every portable choice in the first Cardboard riddle. */
export const InputMethod = S.Union([IncorrectInputMethod, S.Literal('Mirror')])
/** A portable Cardboard input choice. */
export type InputMethod = typeof InputMethod.Type

/** The mirror riddle was deliberately skipped. */
export const SkippedInputMethodRiddle = ts('SkippedInputMethodRiddle')
/** The mirror riddle was answered with Mirror. */
export const AnsweredMirrorRiddle = ts('AnsweredMirrorRiddle')
/** Every legal resolution of the mirror riddle. */
export const RiddleResolution = S.Union([
  SkippedInputMethodRiddle,
  AnsweredMirrorRiddle,
])
/** A legal resolution of the mirror riddle. */
export type RiddleResolution = typeof RiddleResolution.Type

/** Rule Zero is waiting for its first interaction. */
export const WaitingAtZero = ts('WaitingAtZero', { slashCount: S.Int })
/** Rule Zero is measuring an active hold. */
export const PressingZero = ts('PressingZero', {
  elapsedMilliseconds: S.Int,
  slashCount: S.Int,
})
/** The black block is opening. */
export const OpeningZero = ts('OpeningZero', {
  progressPermille: S.Int,
  slashCount: S.Int,
})
/** Rule Zero is configuring its accessible presentation. */
export const ConfiguringAtZero = ts('ConfiguringAtZero', {
  isRgbInverted: S.Boolean,
  profile: AccessibilityProfile,
  slashCount: S.Int,
})
/** Rule Zero is asking which choice looks back at the participant. */
export const ChoosingInputMethod = ts('ChoosingInputMethod', {
  isRgbInverted: S.Boolean,
  profile: AccessibilityProfile,
  slashCount: S.Int,
})
/** Rule Zero records an incorrect riddle choice without adding a slash. */
export const RejectedInputMethodChoice = ts('RejectedInputMethodChoice', {
  attemptedInputMethod: IncorrectInputMethod,
  isRgbInverted: S.Boolean,
  profile: AccessibilityProfile,
  slashCount: S.Int,
})
/** Rule Zero has completed without adding a slash. */
export const CompletedAtZero = ts('CompletedAtZero', {
  isRgbInverted: S.Boolean,
  profile: AccessibilityProfile,
  resolution: RiddleResolution,
  slashCount: S.Int,
})

/** Every legal Rule Zero state. */
export const ZeroState = S.Union([
  WaitingAtZero,
  PressingZero,
  OpeningZero,
  ConfiguringAtZero,
  ChoosingInputMethod,
  RejectedInputMethodChoice,
  CompletedAtZero,
])
/** A legal Rule Zero state. */
export type ZeroState = typeof ZeroState.Type

/** Progress through the three-Space skip gesture. */
export const SpacePressCount = S.Literals([0, 1, 2])
/** Progress through the three-Space skip gesture. */
export type SpacePressCount = typeof SpacePressCount.Type

/** Progress through the Vim `gg` return gesture. */
export const LowercaseGPressCount = S.Literals([0, 1])
/** Progress through the Vim `gg` return gesture. */
export type LowercaseGPressCount = typeof LowercaseGPressCount.Type

/** Portable keyboard-sequence state shared by keyboard-capable clients. */
export const KeyboardInput = S.Struct({
  lowercaseGPressCount: LowercaseGPressCount,
  spacePressCount: SpacePressCount,
})
/** Portable keyboard-sequence state. */
export type KeyboardInput = typeof KeyboardInput.Type

/** The complete renderer-neutral Cardboard Model. */
export const Model = S.Struct({
  keyboardInput: KeyboardInput,
  zero: ZeroState,
})
/** A renderer-neutral Cardboard Model value. */
export type Model = typeof Model.Type

/** The canonical initial presentation profile. */
export const initialAccessibilityProfile: AccessibilityProfile = 'AmberPaper'
/** The constitutional initial slash count. */
export const initialSlashCount = 0
/** The canonical empty keyboard sequence. */
export const initialKeyboardInput = KeyboardInput.make({
  lowercaseGPressCount: 0,
  spacePressCount: 0,
})
/** The canonical Rule Zero Model. */
export const initialModel = Model.make({
  keyboardInput: initialKeyboardInput,
  zero: WaitingAtZero({ slashCount: initialSlashCount }),
})

import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import type { CallableTaggedStruct } from 'foldkit/schema'

import { AccessibilityProfile, IncorrectInputMethod } from './model.js'

// MESSAGE

/** Records that the Rule Zero control began being pressed. */
export const PressedZeroButton: CallableTaggedStruct<'PressedZeroButton', {}> =
  m('PressedZeroButton')
/** Records measured progress while the Rule Zero control remains pressed. */
export const AdvancedZeroButtonHold = m('AdvancedZeroButtonHold', {
  elapsedMilliseconds: S.Int,
})
/** Records that the Rule Zero control stopped being pressed. */
export const ReleasedZeroButton: CallableTaggedStruct<
  'ReleasedZeroButton',
  {}
> = m('ReleasedZeroButton')
/** Records visual opening progress after the hold succeeds. */
export const AdvancedZeroOpening = m('AdvancedZeroOpening', {
  progressPermille: S.Int,
})
/** Records that the Rule Zero opening completed. */
export const CompletedZeroOpening: CallableTaggedStruct<
  'CompletedZeroOpening',
  {}
> = m('CompletedZeroOpening')
/** Records the selected accessible presentation profile. */
export const SelectedAccessibilityProfile = m('SelectedAccessibilityProfile', {
  profile: AccessibilityProfile,
})
/** Records that literal RGB inversion was toggled. */
export const ToggledRgbInversion: CallableTaggedStruct<
  'ToggledRgbInversion',
  {}
> = m('ToggledRgbInversion')
/** Records that the participant selected Mirror as the riddle answer. */
export const SelectedMirrorAnswer: CallableTaggedStruct<
  'SelectedMirrorAnswer',
  {}
> = m('SelectedMirrorAnswer')
/** Records an input-method choice that does not answer the mirror riddle. */
export const SelectedIncorrectInputMethod = m('SelectedIncorrectInputMethod', {
  inputMethod: IncorrectInputMethod,
})
/** Records that the current Rule Zero step was skipped. */
export const SkippedZeroStep: CallableTaggedStruct<'SkippedZeroStep', {}> =
  m('SkippedZeroStep')
/** Records that Rule Zero was completed. */
export const CompletedZeroGame: CallableTaggedStruct<'CompletedZeroGame', {}> =
  m('CompletedZeroGame')
/** Records that Rule Zero returned to its beginning. */
export const ReturnedToZeroStart: CallableTaggedStruct<
  'ReturnedToZeroStart',
  {}
> = m('ReturnedToZeroStart')

/** Every domain and lifecycle Message understood by the Rule Zero Machine. */
export const ZeroMessage = S.Union([
  PressedZeroButton,
  AdvancedZeroButtonHold,
  ReleasedZeroButton,
  AdvancedZeroOpening,
  CompletedZeroOpening,
  SelectedAccessibilityProfile,
  ToggledRgbInversion,
  SelectedMirrorAnswer,
  SelectedIncorrectInputMethod,
  SkippedZeroStep,
  CompletedZeroGame,
  ReturnedToZeroStart,
])
/** A Rule Zero Machine Message. */
export type ZeroMessage = typeof ZeroMessage.Type

/** Records one Space key press in a keyboard-capable client. */
export const PressedSpace: CallableTaggedStruct<'PressedSpace', {}> =
  m('PressedSpace')
/** Records one lowercase G key press in a keyboard-capable client. */
export const PressedLowercaseG: CallableTaggedStruct<'PressedLowercaseG', {}> =
  m('PressedLowercaseG')
/** Records that the append-only conversation ledger was opened. */
export const OpenedConversationLedger: CallableTaggedStruct<
  'OpenedConversationLedger',
  {}
> = m('OpenedConversationLedger')
/** Records that Cardboard returned from the ledger to Rule Zero. */
export const ReturnedToRuleZeroPage: CallableTaggedStruct<
  'ReturnedToRuleZeroPage',
  {}
> = m('ReturnedToRuleZeroPage')
/** Records that the participant advanced the Cardboard sequence once. */
export const AdvancedCardboardSequence: CallableTaggedStruct<
  'AdvancedCardboardSequence',
  {}
> = m('AdvancedCardboardSequence')

/** Every Message accepted by the Cardboard Program. */
export const Message = S.Union([
  PressedZeroButton,
  AdvancedZeroButtonHold,
  ReleasedZeroButton,
  AdvancedZeroOpening,
  CompletedZeroOpening,
  SelectedAccessibilityProfile,
  ToggledRgbInversion,
  SelectedMirrorAnswer,
  SelectedIncorrectInputMethod,
  SkippedZeroStep,
  CompletedZeroGame,
  ReturnedToZeroStart,
  PressedSpace,
  PressedLowercaseG,
  OpenedConversationLedger,
  ReturnedToRuleZeroPage,
  AdvancedCardboardSequence,
])
/** A Cardboard Message value. */
export type Message = typeof Message.Type

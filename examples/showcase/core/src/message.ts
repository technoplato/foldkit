import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import type { CallableTaggedStruct } from 'foldkit/schema'

import { Navigation } from './model.js'

// MESSAGE

/** Records that the Counter button was tapped. */
export const TappedCounterButton: CallableTaggedStruct<
  'TappedCounterButton',
  {}
> = m('TappedCounterButton')
/** Records that the Multiple Counters button was tapped. */
export const TappedMultipleCountersButton: CallableTaggedStruct<
  'TappedMultipleCountersButton',
  {}
> = m('TappedMultipleCountersButton')
/** Records that the Calculator button was tapped. */
export const TappedCalculatorButton: CallableTaggedStruct<
  'TappedCalculatorButton',
  {}
> = m('TappedCalculatorButton')
/** Records that the Fact button was tapped. */
export const TappedFactButton: CallableTaggedStruct<'TappedFactButton', {}> =
  m('TappedFactButton')
/** Records that the Wallet button was tapped. */
export const TappedWalletButton: CallableTaggedStruct<
  'TappedWalletButton',
  {}
> = m('TappedWalletButton')
/** Records that the back button was tapped. */
export const TappedBackButton: CallableTaggedStruct<'TappedBackButton', {}> =
  m('TappedBackButton')
/** Records that a host opened a projected showcase destination. */
export const OpenedNavigation: CallableTaggedStruct<
  'OpenedNavigation',
  { navigation: typeof Navigation }
> = m('OpenedNavigation', { navigation: Navigation })

/** Every Message accepted by the showcase navigation Program. */
export const Message = S.Union([
  TappedCounterButton,
  TappedMultipleCountersButton,
  TappedCalculatorButton,
  TappedFactButton,
  TappedWalletButton,
  TappedBackButton,
  OpenedNavigation,
])
/** A showcase navigation Message. */
export type Message = typeof Message.Type

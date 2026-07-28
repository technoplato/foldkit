import { Match as M, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { AdvancedCardboardSequence, type Message } from './message.js'
import { type Model } from './model.js'

/** A renderer-neutral action exposed by a Cardboard component. */
export const CardboardAction = S.Literal('AdvanceCardboardSequence')
/** A renderer-neutral Cardboard action. */
export type CardboardAction = typeof CardboardAction.Type

/** One semantic Cardboard button without presentation-medium details. */
export const CardboardButton = ts('CardboardButton', {
  accessibilityLabel: S.String,
  action: CardboardAction,
  text: S.String,
})
/** One semantic Cardboard button. */
export type CardboardButton = typeof CardboardButton.Type

/** One renderer-neutral Cardboard screen. */
export const CardboardScreen = ts('CardboardScreen', {
  content: CardboardButton,
})
/** One renderer-neutral Cardboard screen. */
export type CardboardScreen = typeof CardboardScreen.Type

/** Projects the canonical Cardboard Model into shared semantic components. */
export const cardboardScreen = (model: Model): CardboardScreen => {
  if (model.page._tag === 'SequencePage') {
    return CardboardScreen({
      content: CardboardButton({
        accessibilityLabel: 'Next',
        action: 'AdvanceCardboardSequence',
        text: model.page.value.toString(),
      }),
    })
  } else {
    return CardboardScreen({
      content: CardboardButton({
        accessibilityLabel: 'Return to four',
        action: 'AdvanceCardboardSequence',
        text: '4',
      }),
    })
  }
}

/** Converts one renderer-neutral component action into its domain Message. */
export const messageForCardboardAction = (action: CardboardAction): Message =>
  M.value(action).pipe(
    M.withReturnType<Message>(),
    M.when('AdvanceCardboardSequence', () => AdvancedCardboardSequence()),
    M.exhaustive,
  )

/** Renders the same Cardboard screen as plain text. */
export const renderCardboardText = (screen: CardboardScreen): string =>
  screen.content.text

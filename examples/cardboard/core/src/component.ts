import { Match as M, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import {
  AdvancedCardboardSequence,
  type Message,
  OpenedConversationLedger,
} from './message.js'
import { type Model } from './model.js'

/** A renderer-neutral action exposed by a Cardboard component. */
export const CardboardAction = S.Literals([
  'AdvanceCardboardSequence',
  'OpenConversationLedger',
])
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

/** One compact keyboard-style command rendered beneath Cardboard content. */
export const CardboardCommand = ts('CardboardCommand', {
  action: CardboardAction,
  key: S.String,
  text: S.String,
})
/** One compact Cardboard command. */
export type CardboardCommand = typeof CardboardCommand.Type

/** One renderer-neutral Cardboard screen. */
export const CardboardScreen = ts('CardboardScreen', {
  commands: S.Array(CardboardCommand),
  content: CardboardButton,
})
/** One renderer-neutral Cardboard screen. */
export type CardboardScreen = typeof CardboardScreen.Type

/** Projects the canonical Cardboard Model into shared semantic components. */
export const cardboardScreen = (model: Model): CardboardScreen => {
  if (model.page._tag === 'SequencePage') {
    return CardboardScreen({
      commands: [
        CardboardCommand({
          action: 'OpenConversationLedger',
          key: 'L',
          text: 'Log',
        }),
      ],
      content: CardboardButton({
        accessibilityLabel: 'Next',
        action: 'AdvanceCardboardSequence',
        text: model.page.value.toString(),
      }),
    })
  } else {
    return CardboardScreen({
      commands: [],
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
    M.when('OpenConversationLedger', () => OpenedConversationLedger()),
    M.exhaustive,
  )

/** Renders the same Cardboard screen as plain text. */
export const renderCardboardText = (screen: CardboardScreen): string =>
  screen.content.text

import { Match as M, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { type Model } from './model.js'
import { accessibleDescription } from './presentation.js'
import { portableRouteForModel } from './route.js'

/** Presentation-neutral content for describing one public Cardboard state. */
export const CardboardPreview = ts('CardboardPreview', {
  content: S.String,
  description: S.String,
  portableRoute: S.String,
  title: S.String,
})
/** Presentation-neutral content for describing one public Cardboard state. */
export type CardboardPreview = typeof CardboardPreview.Type

const contentForModel = (model: Model): string =>
  M.value(model.page).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      SequencePage: ({ value }) => value.toString(),
      RuleZeroPage: () => 'Rule Zero',
      ConversationLedgerPage: () => 'Conversation Ledger',
    }),
  )

/** Projects the authoritative Model into content shared by preview hosts. */
export const cardboardPreview = (model: Model): CardboardPreview => {
  const content = contentForModel(model)
  return CardboardPreview({
    content,
    description: accessibleDescription(model),
    portableRoute: portableRouteForModel(model),
    title: `${content} | Project Cardboard`,
  })
}

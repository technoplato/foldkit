import { Match as M } from 'effect'
import { type Synchronization } from 'foldkit'

import { type Message } from './message.js'
import { type Model, projectDomain } from './model.js'

/** Classifies every Message as shared domain or semantic navigation. */
export const messageCategory = (
  message: Message,
): Synchronization.MessageCategory =>
  M.value(message).pipe(
    M.withReturnType<Synchronization.MessageCategory>(),
    M.tagsExhaustive({
      ClickedAddCounter: () => 'Domain',
      GotCounterMessage: () => 'Domain',
      SelectedCounter: () => 'Navigation',
      DismissedCounterDetail: () => 'Navigation',
      ClickedShowCounterFact: () => 'Navigation',
      DismissedCounterFactAlert: () => 'Navigation',
      ClickedDeleteCounter: () => 'Navigation',
      CancelledDeleteCounter: () => 'Navigation',
      ConfirmedDeleteCounter: () => 'Domain',
      OpenedNavigation: () => 'Navigation',
    }),
  )

/** The Program-owned synchronization contract used by session policies. */
export const synchronization = {
  messageCategory,
  projectDomain: (model: Model) => projectDomain(model),
}

import * as Counter from 'counter-core-example'
import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { CounterFact, Navigation } from './model.js'

// MESSAGE

/** Records that the add-counter control was clicked. */
export const ClickedAddCounter = m('ClickedAddCounter')
/** Routes one child Counter Message to its identified Counter Submodel. */
export const GotCounterMessage = m('GotCounterMessage', {
  counterId: S.String,
  message: Counter.Message,
})
/** Records that one counter was selected for detail presentation. */
export const SelectedCounter = m('SelectedCounter', {
  counterId: S.String,
})
/** Records that the counter detail was dismissed. */
export const DismissedCounterDetail = m('DismissedCounterDetail')
/** Records that the counter fact control was clicked. */
export const ClickedShowCounterFact = m('ClickedShowCounterFact')
/** Records that FetchCounterFact returned a fact. */
export const SucceededFetchCounterFact = m('SucceededFetchCounterFact', {
  counterId: S.String,
  fact: CounterFact,
})
/** Records that FetchCounterFact failed. */
export const FailedFetchCounterFact = m('FailedFetchCounterFact', {
  counterId: S.String,
  reason: S.String,
})
/** Records that the counter fact alert was dismissed. */
export const DismissedCounterFactAlert = m('DismissedCounterFactAlert')
/** Records that the delete-counter control was clicked. */
export const ClickedDeleteCounter = m('ClickedDeleteCounter')
/** Records that delete-counter confirmation was cancelled. */
export const CancelledDeleteCounter = m('CancelledDeleteCounter')
/** Records that deletion of the selected counter was confirmed. */
export const ConfirmedDeleteCounter = m('ConfirmedDeleteCounter')
/** Records that a host opened a projected navigation destination. */
export const OpenedNavigation = m('OpenedNavigation', {
  navigation: Navigation,
})

/** Every Message accepted by the Multiple Counters Program. */
export const Message = S.Union([
  ClickedAddCounter,
  GotCounterMessage,
  SelectedCounter,
  DismissedCounterDetail,
  ClickedShowCounterFact,
  SucceededFetchCounterFact,
  FailedFetchCounterFact,
  DismissedCounterFactAlert,
  ClickedDeleteCounter,
  CancelledDeleteCounter,
  ConfirmedDeleteCounter,
  OpenedNavigation,
])
/** Every Message accepted by the Multiple Counters Program. */
export type Message = typeof Message.Type

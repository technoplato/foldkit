import * as Counter from 'counter-core-example'
import { Match as M, Schema as S } from 'effect'
import { m } from 'foldkit/message'

import {
  CounterDetailPresentationId,
  CounterFactRequestId,
  CounterId,
  DeleteCounterConfirmationId,
} from './model.js'

/** Opens the counter list through an external navigation carrier. */
export const CounterListTarget = S.TaggedStruct('CounterListTarget', {})
/** Opens one counter detail through an external navigation carrier. */
export const CounterDetailTarget = S.TaggedStruct('CounterDetailTarget', {
  counterId: CounterId,
})
/** Opens one counter fact through an external navigation carrier. */
export const CounterFactTarget = S.TaggedStruct('CounterFactTarget', {
  counterId: CounterId,
})
/** Opens one delete confirmation through an external navigation carrier. */
export const DeleteCounterTarget = S.TaggedStruct('DeleteCounterTarget', {
  counterId: CounterId,
})

/** Every external navigation target accepted by the Program. */
export const NavigationTarget = S.Union([
  CounterListTarget,
  CounterDetailTarget,
  CounterFactTarget,
  DeleteCounterTarget,
])
/** Every external navigation target accepted by the Program. */
export type NavigationTarget = typeof NavigationTarget.Type

/** Opens the semantic counter-list target. */
export const CounterListOpening = S.TaggedStruct('CounterListOpening', {
  target: CounterListTarget,
})
/** Opens the semantic counter-detail target. */
export const CounterDetailOpening = S.TaggedStruct('CounterDetailOpening', {
  presentationId: CounterDetailPresentationId,
  target: CounterDetailTarget,
})
/** Opens the semantic fact target with one transient presentation identity. */
export const CounterFactOpening = S.TaggedStruct('CounterFactOpening', {
  presentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
  target: CounterFactTarget,
})
/** Opens the semantic delete target with one transient presentation identity. */
export const DeleteCounterOpening = S.TaggedStruct('DeleteCounterOpening', {
  confirmationId: DeleteCounterConfirmationId,
  presentationId: CounterDetailPresentationId,
  target: DeleteCounterTarget,
})

/** A semantic URI target paired with only the transient identity it requires. */
export const NavigationOpening = S.Union([
  CounterListOpening,
  CounterDetailOpening,
  CounterFactOpening,
  DeleteCounterOpening,
])
/** A semantic URI target paired with only the transient identity it requires. */
export type NavigationOpening = typeof NavigationOpening.Type

/** Supplies fresh occurrence identities at a Client input boundary. */
export type NavigationIdentitySource = Readonly<{
  counterDetailPresentationId: () => CounterDetailPresentationId
  counterFactRequestId: () => CounterFactRequestId
  deleteCounterConfirmationId: () => DeleteCounterConfirmationId
}>

/** Pairs one semantic target with a fresh, non-URI presentation identity. */
export const openingForTarget = (
  target: NavigationTarget,
  identitySource: NavigationIdentitySource,
): NavigationOpening =>
  M.value(target).pipe(
    M.withReturnType<NavigationOpening>(),
    M.tagsExhaustive({
      CounterListTarget: target => CounterListOpening.make({ target }),
      CounterDetailTarget: target =>
        CounterDetailOpening.make({
          presentationId: identitySource.counterDetailPresentationId(),
          target,
        }),
      CounterFactTarget: target =>
        CounterFactOpening.make({
          presentationId: identitySource.counterDetailPresentationId(),
          requestId: identitySource.counterFactRequestId(),
          target,
        }),
      DeleteCounterTarget: target =>
        DeleteCounterOpening.make({
          confirmationId: identitySource.deleteCounterConfirmationId(),
          presentationId: identitySource.counterDetailPresentationId(),
          target,
        }),
    }),
  )

// MESSAGE

/** Records that the add-counter control was clicked. */
export const ClickedAddCounter = m('ClickedAddCounter', {
  counterId: CounterId,
})
/** Routes one child Counter Message to its identified Counter Submodel. */
export const GotCounterMessage = m('GotCounterMessage', {
  counterId: CounterId,
  message: Counter.Message,
})
/** Records that one counter was selected for detail presentation. */
export const SelectedCounter = m('SelectedCounter', {
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
})
/** Records that the counter detail was dismissed. */
export const DismissedCounterDetail = m('DismissedCounterDetail', {
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
})
/** Records that the counter fact control was clicked. */
export const ClickedShowCounterFact = m('ClickedShowCounterFact', {
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
})
/** Records that the counter fact alert was dismissed. */
export const DismissedCounterFactAlert = m('DismissedCounterFactAlert', {
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
})
/** Records that the delete-counter control was clicked. */
export const ClickedDeleteCounter = m('ClickedDeleteCounter', {
  confirmationId: DeleteCounterConfirmationId,
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
})
/** Records that delete-counter confirmation was cancelled. */
export const CancelledDeleteCounter = m('CancelledDeleteCounter', {
  confirmationId: DeleteCounterConfirmationId,
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
})
/** Records that deletion of the selected counter was confirmed. */
export const ConfirmedDeleteCounter = m('ConfirmedDeleteCounter', {
  confirmationId: DeleteCounterConfirmationId,
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
})
/** Records that a host opened a projected navigation destination. */
export const OpenedNavigation = m('OpenedNavigation', {
  opening: NavigationOpening,
})

/** Every Message accepted by the Multiple Counters Program. */
export const Message = S.Union([
  ClickedAddCounter,
  GotCounterMessage,
  SelectedCounter,
  DismissedCounterDetail,
  ClickedShowCounterFact,
  DismissedCounterFactAlert,
  ClickedDeleteCounter,
  CancelledDeleteCounter,
  ConfirmedDeleteCounter,
  OpenedNavigation,
])
/** Every Message accepted by the Multiple Counters Program. */
export type Message = typeof Message.Type

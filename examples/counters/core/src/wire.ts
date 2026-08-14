import { Effect, Match as M, Schema as S } from 'effect'
import * as Program from 'foldkit/program'

import {
  CancelledDeleteCounter,
  ClickedAddCounter,
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  ConfirmedDeleteCounter,
  DismissedCounterDetail,
  DismissedCounterFactAlert,
  FailedLoadCounterFact,
  GotCounterMessage,
  type Message,
  OpenedNavigation,
  SelectedCounter,
  SucceededLoadCounterFact,
} from './message.js'

/** A current event identifier and JSON payload ready for an envelope. */
export type EncodedEvent = Readonly<{
  eventId: string
  eventVersion: number
  payload: S.Json
}>

const eventIds = {
  cancelledDeleteCounter: 'MultipleCounters.CancelledDeleteCounter',
  clickedAddCounter: 'MultipleCounters.ClickedAddCounter',
  clickedDeleteCounter: 'MultipleCounters.ClickedDeleteCounter',
  clickedShowCounterFact: 'MultipleCounters.ClickedShowCounterFact',
  succeededLoadCounterFact: 'MultipleCounters.SucceededLoadCounterFact',
  failedLoadCounterFact: 'MultipleCounters.FailedLoadCounterFact',
  confirmedDeleteCounter: 'MultipleCounters.ConfirmedDeleteCounter',
  dismissedCounterDetail: 'MultipleCounters.DismissedCounterDetail',
  dismissedCounterFactAlert: 'MultipleCounters.DismissedCounterFactAlert',
  gotCounterMessage: 'MultipleCounters.GotCounterMessage',
  openedNavigation: 'MultipleCounters.OpenedNavigation',
  selectedCounter: 'MultipleCounters.SelectedCounter',
}
const currentEventVersion = 1

const ClickedAddCounterPayload = S.Struct({
  counterId: ClickedAddCounter.fields.counterId,
})
const GotCounterMessagePayload = S.Struct({
  counterId: GotCounterMessage.fields.counterId,
  message: GotCounterMessage.fields.message,
})
const SelectedCounterPayload = S.Struct({
  counterId: SelectedCounter.fields.counterId,
  detailPresentationId: SelectedCounter.fields.detailPresentationId,
})
const DismissedCounterDetailPayload = S.Struct({
  counterId: DismissedCounterDetail.fields.counterId,
  detailPresentationId: DismissedCounterDetail.fields.detailPresentationId,
})
const ClickedShowCounterFactPayload = S.Struct({
  counterId: ClickedShowCounterFact.fields.counterId,
  detailPresentationId: ClickedShowCounterFact.fields.detailPresentationId,
  requestId: ClickedShowCounterFact.fields.requestId,
})
const SucceededLoadCounterFactPayload = S.Struct({
  counterId: SucceededLoadCounterFact.fields.counterId,
  detailPresentationId: SucceededLoadCounterFact.fields.detailPresentationId,
  fact: SucceededLoadCounterFact.fields.fact,
  requestId: SucceededLoadCounterFact.fields.requestId,
})
const FailedLoadCounterFactPayload = S.Struct({
  counterId: FailedLoadCounterFact.fields.counterId,
  detailPresentationId: FailedLoadCounterFact.fields.detailPresentationId,
  reason: FailedLoadCounterFact.fields.reason,
  requestId: FailedLoadCounterFact.fields.requestId,
})
const DismissedCounterFactAlertPayload = S.Struct({
  counterId: DismissedCounterFactAlert.fields.counterId,
  detailPresentationId: DismissedCounterFactAlert.fields.detailPresentationId,
  requestId: DismissedCounterFactAlert.fields.requestId,
})
const ClickedDeleteCounterPayload = S.Struct({
  confirmationId: ClickedDeleteCounter.fields.confirmationId,
  counterId: ClickedDeleteCounter.fields.counterId,
  detailPresentationId: ClickedDeleteCounter.fields.detailPresentationId,
})
const CancelledDeleteCounterPayload = S.Struct({
  confirmationId: CancelledDeleteCounter.fields.confirmationId,
  counterId: CancelledDeleteCounter.fields.counterId,
  detailPresentationId: CancelledDeleteCounter.fields.detailPresentationId,
})
const ConfirmedDeleteCounterPayload = S.Struct({
  confirmationId: ConfirmedDeleteCounter.fields.confirmationId,
  counterId: ConfirmedDeleteCounter.fields.counterId,
  detailPresentationId: ConfirmedDeleteCounter.fields.detailPresentationId,
})
const OpenedNavigationPayload = S.Struct({
  opening: OpenedNavigation.fields.opening,
})

const makeFamily = <Payload>(
  eventId: string,
  CurrentPayload: Program.ProgramSchema<Payload>,
  toMessage: (payload: Payload) => Message,
) =>
  Effect.runSync(
    Program.makeVersionedEventFamily({
      CurrentPayload,
      currentVersion: currentEventVersion,
      eventId,
      migrations: [],
      minimumVersion: currentEventVersion,
      toMessage,
    }),
  )

/** The complete Program-owned registry for accepted Multiple Counters events. */
export const EventRegistry = Effect.runSync(
  Program.makeVersionedEventRegistry<Message>({
    currentProgramVersion: 2,
    families: [
      makeFamily(
        eventIds.clickedAddCounter,
        ClickedAddCounterPayload,
        ClickedAddCounter,
      ),
      makeFamily(
        eventIds.gotCounterMessage,
        GotCounterMessagePayload,
        GotCounterMessage,
      ),
      makeFamily(
        eventIds.selectedCounter,
        SelectedCounterPayload,
        SelectedCounter,
      ),
      makeFamily(
        eventIds.dismissedCounterDetail,
        DismissedCounterDetailPayload,
        DismissedCounterDetail,
      ),
      makeFamily(
        eventIds.clickedShowCounterFact,
        ClickedShowCounterFactPayload,
        ClickedShowCounterFact,
      ),
      makeFamily(
        eventIds.succeededLoadCounterFact,
        SucceededLoadCounterFactPayload,
        SucceededLoadCounterFact,
      ),
      makeFamily(
        eventIds.failedLoadCounterFact,
        FailedLoadCounterFactPayload,
        FailedLoadCounterFact,
      ),
      makeFamily(
        eventIds.dismissedCounterFactAlert,
        DismissedCounterFactAlertPayload,
        DismissedCounterFactAlert,
      ),
      makeFamily(
        eventIds.clickedDeleteCounter,
        ClickedDeleteCounterPayload,
        ClickedDeleteCounter,
      ),
      makeFamily(
        eventIds.cancelledDeleteCounter,
        CancelledDeleteCounterPayload,
        CancelledDeleteCounter,
      ),
      makeFamily(
        eventIds.confirmedDeleteCounter,
        ConfirmedDeleteCounterPayload,
        ConfirmedDeleteCounter,
      ),
      makeFamily(
        eventIds.openedNavigation,
        OpenedNavigationPayload,
        OpenedNavigation,
      ),
    ],
    programId: 'multiple-counters',
  }),
)

/** Encodes one current Message without credentials or executable code. */
export const encodeMessage = (message: Message): EncodedEvent =>
  M.value(message).pipe(
    M.withReturnType<EncodedEvent>(),
    M.tagsExhaustive({
      ClickedAddCounter: ({ counterId }) => ({
        eventId: eventIds.clickedAddCounter,
        eventVersion: currentEventVersion,
        payload: { counterId },
      }),
      GotCounterMessage: ({ counterId, message }) => ({
        eventId: eventIds.gotCounterMessage,
        eventVersion: currentEventVersion,
        payload: { counterId, message },
      }),
      SelectedCounter: ({ counterId, detailPresentationId }) => ({
        eventId: eventIds.selectedCounter,
        eventVersion: currentEventVersion,
        payload: { counterId, detailPresentationId },
      }),
      DismissedCounterDetail: ({ counterId, detailPresentationId }) => ({
        eventId: eventIds.dismissedCounterDetail,
        eventVersion: currentEventVersion,
        payload: { counterId, detailPresentationId },
      }),
      ClickedShowCounterFact: ({
        counterId,
        detailPresentationId,
        requestId,
      }) => ({
        eventId: eventIds.clickedShowCounterFact,
        eventVersion: currentEventVersion,
        payload: { counterId, detailPresentationId, requestId },
      }),
      SucceededLoadCounterFact: ({
        counterId,
        detailPresentationId,
        fact,
        requestId,
      }) => ({
        eventId: eventIds.succeededLoadCounterFact,
        eventVersion: currentEventVersion,
        payload: { counterId, detailPresentationId, fact, requestId },
      }),
      FailedLoadCounterFact: ({
        counterId,
        detailPresentationId,
        reason,
        requestId,
      }) => ({
        eventId: eventIds.failedLoadCounterFact,
        eventVersion: currentEventVersion,
        payload: { counterId, detailPresentationId, reason, requestId },
      }),
      DismissedCounterFactAlert: ({
        counterId,
        detailPresentationId,
        requestId,
      }) => ({
        eventId: eventIds.dismissedCounterFactAlert,
        eventVersion: currentEventVersion,
        payload: { counterId, detailPresentationId, requestId },
      }),
      ClickedDeleteCounter: ({
        confirmationId,
        counterId,
        detailPresentationId,
      }) => ({
        eventId: eventIds.clickedDeleteCounter,
        eventVersion: currentEventVersion,
        payload: { confirmationId, counterId, detailPresentationId },
      }),
      CancelledDeleteCounter: ({
        confirmationId,
        counterId,
        detailPresentationId,
      }) => ({
        eventId: eventIds.cancelledDeleteCounter,
        eventVersion: currentEventVersion,
        payload: { confirmationId, counterId, detailPresentationId },
      }),
      ConfirmedDeleteCounter: ({
        confirmationId,
        counterId,
        detailPresentationId,
      }) => ({
        eventId: eventIds.confirmedDeleteCounter,
        eventVersion: currentEventVersion,
        payload: { confirmationId, counterId, detailPresentationId },
      }),
      OpenedNavigation: ({ opening }) => ({
        eventId: eventIds.openedNavigation,
        eventVersion: currentEventVersion,
        payload: { opening },
      }),
    }),
  )

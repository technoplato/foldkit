import * as Counter from 'counter-core-example'
import {
  ClickedAddCounter,
  ClickedShowCounterFact,
  DismissedCounterDetail,
  GotChild,
  type Message,
  type Model,
  SelectedCounter,
} from 'counters-core-example'

import { nextAllocatedCounterId } from './ids.js'

/** Adds one new Counter row. */
export const addCounterMessage = (model: Model): Message =>
  ClickedAddCounter({ counterId: nextAllocatedCounterId(model) })

/** Increments one identified Counter. */
export const incrementCounterMessage = (counterId: string): Message =>
  GotChild({
    id: counterId,
    message: Counter.Increment(),
  })

/** Decrements one identified Counter. */
export const decrementCounterMessage = (counterId: string): Message =>
  GotChild({
    id: counterId,
    message: Counter.Decrement(),
  })

/** Resets one identified Counter. */
export const resetCounterMessage = (counterId: string): Message =>
  GotChild({
    id: counterId,
    message: Counter.Reset(),
  })

/** Opens one Counter detail. */
export const selectCounterMessage = (counterId: string): Message =>
  SelectedCounter({
    counterId,
    detailPresentationId: `detail-${crypto.randomUUID()}`,
  })

/** Fetches the favorite fact for the open Counter detail. */
export const showCounterFactMessage = (
  counterId: string,
  detailPresentationId: string,
): Message =>
  ClickedShowCounterFact({
    counterId,
    detailPresentationId,
    requestId: `fact-${crypto.randomUUID()}`,
  })

/** Leaves the open Counter detail. */
export const dismissCounterDetailMessage = (
  counterId: string,
  detailPresentationId: string,
): Message =>
  DismissedCounterDetail({
    counterId,
    detailPresentationId,
  })

import { Schema as S } from 'effect'
import { Navigation } from 'foldkit'
import { ts } from 'foldkit/schema'

import { CounterId } from './counterId.js'

// DESTINATION

/** The list of every counter: the root every stack starts from. */
export const CounterList = ts('CounterList')
/** The list of every counter. */
export type CounterList = typeof CounterList.Type

/** One counter on its own page, pushed above the list. */
export const CounterDetail = ts('CounterDetail', { counterId: CounterId })
/** One counter on its own page. */
export type CounterDetail = typeof CounterDetail.Type

/**
 * The question "Delete Counter 3?", a Dialog over the page beneath. It
 * names the counter it asks about, so answering it can only delete that
 * one.
 */
export const DeleteQuestion = ts('DeleteQuestion', { counterId: CounterId })
/** The question "Delete Counter 3?". */
export type DeleteQuestion = typeof DeleteQuestion.Type

/**
 * Every place the Multiple Counters can show, and the URI no route
 * matched. There is no other: a stack holds only these.
 */
export const Destination = S.Union([
  CounterList,
  CounterDetail,
  DeleteQuestion,
  Navigation.NotFound,
])
/** Every place the Multiple Counters can show. */
export type Destination = typeof Destination.Type

/** True for the list. */
export const isCounterList = S.is(CounterList)

/** True for a counter's page. */
export const isCounterDetail = S.is(CounterDetail)

/** True for the delete question. */
export const isDeleteQuestion = S.is(DeleteQuestion)

/**
 * True for a page or question about counter `counterId`. Deleting a counter
 * removes every one of them.
 *
 * @example
 * ```typescript
 * namesCounter(CounterDetail({ counterId: 3 }), 3) // true
 * namesCounter(CounterList(), 3) // false
 * ```
 */
export const namesCounter = (
  destination: unknown,
  counterId: CounterId,
): boolean =>
  (isCounterDetail(destination) || isDeleteQuestion(destination)) &&
  destination.counterId === counterId

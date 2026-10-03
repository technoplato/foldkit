import { Array, Option } from 'effect'

import type { CounterId } from './counterId.js'
import { isCounterDetail, isDeleteQuestion } from './destination.js'

// STACK

type HasStack = Readonly<{
  navigation: Readonly<{
    pages: ReadonlyArray<unknown>
    maybeModal: Option.Option<Readonly<{ destination: unknown }>>
  }>
}>

/**
 * The counter the open delete question asks about. None while no question
 * is open, which is the only time anything beneath it can be pressed.
 *
 * @example
 * ```typescript
 * confirmingOf(model) // Some(3) while "Delete Counter 3?" is open
 * ```
 */
export const confirmingOf = (model: HasStack): Option.Option<CounterId> =>
  Option.flatMap(model.navigation.maybeModal, modal =>
    isDeleteQuestion(modal.destination)
      ? Option.some(modal.destination.counterId)
      : Option.none(),
  )

/**
 * The counter whose page is on top, the one `+` and `-` press. None on
 * the list.
 *
 * @example
 * ```typescript
 * shownOf(model) // Some(3) on `/counters/3`
 * ```
 */
export const shownOf = (model: HasStack): Option.Option<CounterId> =>
  Option.flatMap(Array.last(model.navigation.pages), page =>
    isCounterDetail(page) ? Option.some(page.counterId) : Option.none(),
  )

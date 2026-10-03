import { Model as CounterModel } from 'counter-core-example'
import { Array, type Option, Schema as S } from 'effect'
import { Navigation } from 'foldkit'

import { CounterId } from './counterId.js'
import { Destination } from './destination.js'

// MODEL

/**
 * One counter in the list: its number and the Counter Program's own
 * Model, so every counter counts exactly as the single Counter does.
 */
export const CounterRow = S.Struct({
  counterId: CounterId,
  counter: CounterModel,
})
/** One counter in the list. */
export type CounterRow = typeof CounterRow.Type

/**
 * The Multiple Counters Model: the counters in the order they were added,
 * the number the next one gets, and the navigation stack. A number is
 * never handed out twice, so deleting Counter 2 and adding another gives
 * Counter 3, and nothing that still names 2 can reach the new one.
 */
export const Model = S.Struct({
  counters: S.Array(CounterRow),
  nextCounterId: CounterId,
  navigation: Navigation.NavigationStack(Destination),
})
/** A Multiple Counters Model value. */
export type Model = typeof Model.Type

/** The counter `counterId` names, while it is still in the list. */
export const counterOf = (
  model: Readonly<{ counters: ReadonlyArray<CounterRow> }>,
  counterId: CounterId,
): Option.Option<CounterRow> =>
  Array.findFirst(model.counters, row => row.counterId === counterId)

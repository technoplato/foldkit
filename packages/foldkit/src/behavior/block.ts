import { Array, type Schema as S } from 'effect'

import type { Machine, Tagged } from '../experimental/machine/machine.js'
import type { Sync } from './pace.js'

// NOTE: a block is one small behavior that keeps state. Its state is a
// field of the Model, its rule is a Machine's chart, and each of its
// Messages says once how it syncs. A behavior that keeps nothing, such as
// where a menu goes, is a pure function and not a block.

/**
 * One small behavior that keeps state: the Schemas of its state and its
 * Messages, its chart (which holds the state it starts at), how each
 * Message syncs, and what a restart opens it on.
 *
 * @example
 * ```typescript
 * const hold: Block<LongPress.State, LongPress.Message> = LongPress.block
 * hold.chart.transition(hold.chart.initial, LongPress.PressedDown({ press: 'ShowTitleMenu:salt-road' }))
 * ```
 */
export type Block<
  State extends Tagged,
  Message extends Tagged,
  R = never,
> = Readonly<{
  name: string
  State: S.Codec<State, unknown, never, never>
  Message: S.Codec<Message, unknown, never, never>
  chart: Machine<State, Message, R>
  sync: Readonly<Record<Message['_tag'], Sync>>
  atRest: (state: State) => State
}>

/**
 * What is wrong with a block's chart, one sentence each: a state nothing
 * leads to, or an edge that can never fire. A block with no problems
 * answers none.
 *
 * @example
 * ```typescript
 * problemsOf(LongPress.block) // []
 * ```
 */
export const problemsOf = (
  block: Readonly<{
    name: string
    chart: Readonly<{
      unreachableStates: () => ReadonlyArray<string>
      deadTransitions: () => ReadonlyArray<
        Readonly<{
          edge: Readonly<{ from: string; messageTag: string }>
          reason: string
        }>
      >
    }>
  }>,
): ReadonlyArray<string> => [
  ...Array.map(
    block.chart.unreachableStates(),
    tag => `${block.name}: nothing leads to the state ${tag}`,
  ),
  ...Array.map(
    block.chart.deadTransitions(),
    dead =>
      `${block.name}: ${dead.edge.messageTag} in ${dead.edge.from} can never fire (${dead.reason})`,
  ),
]

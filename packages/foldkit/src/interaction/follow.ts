import { Effect, Equal, Queue, Stream } from 'effect'

import type { ProgramHandle } from './bind.js'

// FOLLOW

/**
 * The values a reading of a running Program takes, as a Stream: the value
 * now, then each one that differs from the last, until the Stream is
 * interrupted. `read` is any pure reading of the Program, such as the
 * place a player has reached or the paragraph being read, so a Client
 * that only prints can follow it without knowing the Program's Messages.
 * A reading that comes out the same after a Message emits nothing.
 *
 * @example
 * ```typescript
 * // the count is 3, then a person presses `+` twice
 * Interaction.follow(bound, () => bound.readModel().count) // 3, 4, 5
 * ```
 */
export const follow = <Model, Message, A>(
  handle: Pick<ProgramHandle<Model, Message>, 'subscribe'>,
  read: () => A,
  isSame: (self: A, that: A) => boolean = Equal.equals,
): Stream.Stream<A> =>
  Stream.callback<A>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const state = { last: read() }
        Queue.offerUnsafe(queue, state.last)
        return handle.subscribe(() => {
          const next = read()
          if (!isSame(state.last, next)) {
            state.last = next
            Queue.offerUnsafe(queue, next)
          }
        })
      }),
      stopListening => Effect.sync(stopListening),
    ),
  )

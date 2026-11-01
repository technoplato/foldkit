import { Effect, Schema as S } from 'effect'

import { Message } from './message.js'

/**
 * One currently valid interaction, its canonical Message, and the keys that
 * press it: `{ token: 'cursor:next', label: 'Next Issue', keys: ['j', 'ArrowDown'] }`.
 */
export const Interaction = S.Struct({
  keys: S.Array(S.String).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  label: S.String,
  message: Message,
  token: S.String,
})
/** One currently valid interaction. */
export type Interaction = typeof Interaction.Type

/**
 * One interaction from a Message already built, without parsing the Message
 * again: a palette lists hundreds of them on each key.
 */
export const interaction = (
  token: string,
  label: string,
  message: Message,
  keys: ReadonlyArray<string> = [],
): Interaction => ({ keys, label, message, token })

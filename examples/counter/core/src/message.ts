import { Array, Option, Schema as S } from 'effect'
import { type ActionContext, md } from 'foldkit/message'

import { type Model } from './model.js'

// MESSAGE

type Context = ActionContext

/** Increments the count by one. */
export const Increment = md('Increment', {
  what: 'Increments the count by one',
  why: 'Triggered when the user indicates a desire to increment the count',
  keys: ['+', '='],
  tokens: ['increment'],
  spoken: ['increment', 'go up'],
  command: 'increment',
  event: 'incremented',
  mutate: 'count = count + 1',
  sideEffects: '(none)',
  valid: (_model: Model, _context: Context) => true,
})

/** Decrements the count by one. */
export const Decrement = md('Decrement', {
  what: 'Decrements the count by one',
  why: 'Triggered when the user indicates a desire to decrement the count',
  keys: ['-'],
  tokens: ['decrement'],
  spoken: ['decrement', 'go down'],
  command: 'decrement',
  event: 'decremented',
  mutate: 'count = count - 1',
  sideEffects: '(none)',
  valid: (_model: Model, _context: Context) => true,
})

/** Sets the count to 0 when the count is not already 0. */
export const Reset = md('Reset', {
  what: 'Sets the count to 0',
  why: 'Triggered when the user indicates a desire to reset the count',
  keys: ['r'],
  tokens: ['reset'],
  spoken: ['reset', 'start over'],
  command: 'reset',
  event: 'reset',
  mutate: 'count = 0',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => model.count !== 0,
  hiddenBecause: (model: Model) =>
    model.count === 0 ? 'count is already 0' : undefined,
})

/** Every Message accepted by the Counter Program. */
export const Message = S.Union([Increment, Decrement, Reset])
/** A Counter Message value. */
export type Message = typeof Message.Type

/** Message constructors that `show` walks for ACESS. */
export const actions = [Increment, Decrement, Reset] as const

/** One constructor from {@link actions}. */
export type Action = (typeof actions)[number]

/** Finds a constructor by its CLI token. */
export const actionByToken = (token: string): Action | undefined => {
  const maybeAction = Array.findFirst(actions, action =>
    Array.contains(action.tokens ?? [], token),
  )
  if (Option.isSome(maybeAction)) {
    return maybeAction.value
  }
  return undefined
}

const spokenOf = (action: Action): ReadonlyArray<string> => action.spoken ?? []

/** Finds a constructor by a spoken phrase. */
export const actionBySpoken = (utterance: string): Action | undefined => {
  const phrase = utterance.trim().toLowerCase()
  const maybeAction = Array.findFirst(actions, action =>
    Array.contains(spokenOf(action), phrase),
  )
  if (Option.isSome(maybeAction)) {
    return maybeAction.value
  }
  return undefined
}

/** Token printed for a constructor. */
export const tokenOf = (action: Action): string =>
  Option.getOrElse(Array.head(action.tokens ?? []), () => action.command ?? '')

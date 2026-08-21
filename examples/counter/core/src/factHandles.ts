import { Data, Match as M, Option } from 'effect'
import { Program } from 'foldkit'

import {
  type Action,
  Decrement,
  Increment,
  type Message,
  Reset,
} from './message.js'
import { Model } from './model.js'

// FACT HANDLES

/**
 * A gated fact handle. Tappable carries the only way to send the fact.
 * Hidden carries the sentence from `hiddenBecause`. There is no way to
 * send a hidden fact.
 */
export type TapHandle = Data.TaggedEnum<{
  Tappable: { readonly tap: () => void }
  Hidden: { readonly because: string }
}>
/** Constructors and matchers for {@link TapHandle}. */
export const TapHandle = Data.taggedEnum<TapHandle>()

/**
 * The handle for an Action that is valid on every Model. Calling it
 * sends the fact.
 */
export type FactCallable = () => void

/**
 * Past-tense Actions generic on a Program's always-valid and gated
 * tokens. The name is the Action token plus this surface's origin
 * suffix.
 */
export type ProgramActions<
  AlwaysValid extends string,
  Gated extends string = never,
> = Readonly<
  { [Token in AlwaysValid as `${Token}ButtonTapped`]: FactCallable } & {
    [Token in Gated as `${Token}ButtonTapped`]: TapHandle
  }
>

/**
 * Counter Actions derived from the Action declarations. The wire
 * Message stays today's `Increment` / `Decrement` / `Reset`; the fact
 * vocabulary lives in the handle names.
 */
export type Actions = ProgramActions<'increment' | 'decrement', 'reset'>

/** Same type as {@link Actions}. Kept for hosts that still import the old name. */
export type CounterFactHandles = Actions

const notReadyBecause = 'the Counter is not Ready'

const tapped =
  (action: Action, send: (message: Message) => void): FactCallable =>
  () => {
    send(action())
  }

const gateSentence = (action: Action, model: Model): string => {
  if (action.hiddenBecause === undefined) {
    return notReadyBecause
  }
  return Option.getOrElse(
    Option.fromNullishOr(action.hiddenBecause(model)),
    () => notReadyBecause,
  )
}

const gated = (
  action: Action,
  model: Model,
  send: (message: Message) => void,
): TapHandle =>
  action.valid(model, {})
    ? TapHandle.Tappable({ tap: tapped(action, send) })
    : TapHandle.Hidden({ because: gateSentence(action, model) })

/**
 * Derives the fact handles for one Ready Model. Validity and the
 * hidden sentence come from the Action declarations in `message.ts`.
 * No caller re-implements the gate.
 */
export const counterFactHandles = (
  model: Model,
  send: (message: Message) => void,
): Actions => ({
  incrementButtonTapped: tapped(Increment, send),
  decrementButtonTapped: tapped(Decrement, send),
  resetButtonTapped: gated(Reset, model, send),
})

/**
 * Derives fact handles from the synced Model ADT. Before Ready every
 * gated handle is Hidden, so no surface can tap a fact the Program
 * cannot yet gate.
 */
export const counterSyncedFactHandles = (
  synced: Program.SyncedModel<
    Program.ActionMenuAppModel<Model>,
    Program.ActionMenuAppMessage<Message>
  >,
  send: (message: Program.ActionMenuAppMessage<Message>) => void,
): Actions =>
  M.value(synced).pipe(
    M.withReturnType<Actions>(),
    M.tagsExhaustive({
      Starting: () => notReadyFactHandles(send),
      Failed: () => notReadyFactHandles(send),
      Ready: ({ product }) => counterFactHandles(product, send),
    }),
  )

const notReadyFactHandles = (send: (message: Message) => void): Actions => ({
  incrementButtonTapped: tapped(Increment, send),
  decrementButtonTapped: tapped(Decrement, send),
  resetButtonTapped: TapHandle.Hidden({ because: notReadyBecause }),
})

/**
 * Pairs each Action declaration with its derived handle so surfaces
 * that look up an Action by metadata (`keys`, `tokens`, `spoken`) can
 * resolve the handle without a switch.
 */
export const factHandleEntries = (
  handles: Actions,
): ReadonlyArray<readonly [Action, FactCallable | TapHandle]> => [
  [Increment, handles.incrementButtonTapped],
  [Decrement, handles.decrementButtonTapped],
  [Reset, handles.resetButtonTapped],
]

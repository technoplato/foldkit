import { Context, Effect, Layer, Schema as S, Stream } from 'effect'

import { m } from '../message/index.js'

// MODEL

/**
 * Whether a hardware keyboard is attached to this device, as a Program
 * holds it. It is a fact about the outside: the host reports it, update
 * folds it, and no screen asks.
 */
export const KeyboardState = S.Struct({ isHardwareAttached: S.Boolean })
/** Whether a hardware keyboard is attached. */
export type KeyboardState = typeof KeyboardState.Type

/** Not known to be attached, until the host says so. */
export const initialKeyboard: KeyboardState = { isHardwareAttached: false }

// MESSAGE

/** The host said whether a hardware keyboard is attached. */
export const ObservedHardwareKeyboard = m('ObservedHardwareKeyboard', {
  isAttached: S.Boolean,
})

// UPDATE

/**
 * The state after the host's report.
 *
 * @example
 * ```typescript
 * updateKeyboard(initialKeyboard, ObservedHardwareKeyboard({ isAttached: true }))
 * // { isHardwareAttached: true }
 * ```
 */
export const updateKeyboard = (
  _state: KeyboardState,
  message: typeof ObservedHardwareKeyboard.Type,
): KeyboardState => ({ isHardwareAttached: message.isAttached })

// SUBSCRIPTION

/**
 * What a host knows about its keyboard: whether one is attached, again
 * whenever that changes. A host that provides nothing reports none, so
 * a touch device never names a key nobody can press.
 */
export const HardwareKeyboard = Context.Reference<
  Readonly<{ attached: Stream.Stream<boolean> }>
>('foldkit/HardwareKeyboard', {
  defaultValue: () => ({ attached: Stream.make(false) }),
})

/** The host's reports as Messages, for a Program's Subscription. */
export const hardwareKeyboardStream: Stream.Stream<
  typeof ObservedHardwareKeyboard.Type
> = Stream.unwrap(
  Effect.map(HardwareKeyboard, host =>
    Stream.map(host.attached, isAttached =>
      ObservedHardwareKeyboard({ isAttached }),
    ),
  ),
)

/** For a host that always has a keyboard, such as a terminal. */
export const attachedHardwareKeyboard = Layer.succeed(HardwareKeyboard, {
  attached: Stream.make(true),
})

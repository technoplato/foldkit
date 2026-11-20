import { Array, Option, Schema as S } from 'effect'

import { GestureKind, rawHold } from './gesture.js'
import { HoldBinding, type SlotBinding } from './slot.js'

// NOTE: a host is the one piece of a painter that knows parts exist. It is
// given a binding from the screen tree and says, in a table, which
// gestures its platform recognizes. `plan` is the whole decision of what
// to listen for; a host only binds events and presses the strings it is
// handed.

/**
 * What one painter listens for on one bound element: the press a tap
 * sends, the press the second button sends, the press a hold the platform
 * recognized sends, or, where the platform has no hold, what to tell
 * core's rule so it can decide. Each is none where the binding does not
 * ask for it or the platform cannot hear it.
 *
 * @example
 * ```typescript
 * const onAPhone: Plan = {
 *   maybePressed: Option.none(),
 *   maybeSecondary: Option.none(),
 *   maybeHeld: Option.some('ShowTitleMenu:salt-road'),
 *   maybeHold: Option.none(),
 * }
 * ```
 */
export const Plan = S.Struct({
  maybePressed: S.Option(S.String),
  maybeSecondary: S.Option(S.String),
  maybeHeld: S.Option(S.String),
  maybeHold: S.Option(HoldBinding),
})
/** What one painter listens for on one bound element. */
export type Plan = typeof Plan.Type

const pressFor = (
  binding: SlotBinding,
  gesture: GestureKind,
): Option.Option<string> =>
  Option.map(
    Array.findFirst(binding.gestures, each => each.gesture === gesture),
    each => each.press,
  )

const heard = (
  binding: SlotBinding,
  gesture: GestureKind,
  recognizes: ReadonlyArray<GestureKind>,
): Option.Option<string> =>
  Array.contains(recognizes, gesture)
    ? pressFor(binding, gesture)
    : Option.none()

/**
 * What a painter that recognizes `recognizes` listens for on a bound
 * element. A hold is heard as one `HeldLong` where the platform has a
 * recognizer; where it has none and can tell the raw three, the plan
 * carries the hold to tell instead; where it can do neither, a hold is
 * not heard at all.
 *
 * @example
 * ```typescript
 * const row = Slot.menuAsk('ShowTitleMenu:salt-road')
 *
 * plan(row, ['Pressed', 'HeldLong'])
 * // a phone: maybeHeld Some('ShowTitleMenu:salt-road'), maybeSecondary None, maybeHold None
 *
 * plan(row, ['Pressed', 'PressedSecondary', 'PressedDown', 'MovedPointerAway', 'ReleasedPointer'])
 * // a browser: maybeSecondary Some('ShowTitleMenu:salt-road'), maybeHeld None,
 * // maybeHold Some({ down: 'fk-hold-down:ShowTitleMenu:salt-road', ... })
 * ```
 */
export const plan = (
  binding: SlotBinding,
  recognizes: ReadonlyArray<GestureKind>,
): Plan => {
  const maybeHeld = heard(binding, 'HeldLong', recognizes)
  const isHoldTold =
    Option.isNone(maybeHeld) &&
    Array.every(rawHold, raw => Array.contains(recognizes, raw))
  return {
    maybePressed: heard(binding, 'Pressed', recognizes),
    maybeSecondary: heard(binding, 'PressedSecondary', recognizes),
    maybeHeld,
    maybeHold: isHoldTold ? binding.maybeHold : Option.none(),
  }
}

/**
 * The gestures of a binding that a painter recognizing `recognizes` cannot
 * hear at all, such as the second button on a phone. A host's test reads
 * it to say what its platform leaves out.
 *
 * @example
 * ```typescript
 * unheard(Slot.menuAsk('ShowTitleMenu:salt-road'), ['Pressed', 'HeldLong'])
 * // ['PressedSecondary']
 * ```
 */
export const unheard = (
  binding: SlotBinding,
  recognizes: ReadonlyArray<GestureKind>,
): ReadonlyArray<GestureKind> => {
  const planned = plan(binding, recognizes)
  return Array.filter(
    Array.map(binding.gestures, each => each.gesture),
    gesture =>
      !Array.contains(recognizes, gesture) &&
      !(gesture === 'HeldLong' && Option.isSome(planned.maybeHold)),
  )
}

/**
 * What a person does to ask for something, in words no platform owns. The
 * gesture test runs each of these on every painter with that painter's
 * own events, and expects the same Action.
 */
export const PersonAct = S.Literals(['Hold', 'SecondaryPress'])
/** What a person does to ask for something. */
export type PersonAct = typeof PersonAct.Type

/** Every act the gesture test runs, in order. */
export const personActs: ReadonlyArray<PersonAct> = PersonAct.literals

/**
 * The gesture a person's act is, where a platform recognizes it whole.
 *
 * @example
 * ```typescript
 * gestureOf('Hold') // 'HeldLong'
 * ```
 */
export const gestureOf = (act: PersonAct): GestureKind =>
  act === 'Hold' ? 'HeldLong' : 'PressedSecondary'

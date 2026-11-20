import { Array, Schema as S } from 'effect'

// NOTE: this is the closed list of what a person can do to a painted
// element, in words no platform owns. Every painter translates its own
// events into these, and a part says which of them a slot listens for. The
// list grows only here, and only with a painter for each addition.

/**
 * One thing a person does to a painted element.
 *
 * - `Pressed`: a tap or a click.
 * - `PressedSecondary`: the second button, a right click.
 * - `HeldLong`: a hold the platform recognized by itself, as a phone does.
 * - `PressedDown`, `MovedPointerAway`, `ReleasedPointer`: the raw three a
 *   platform with no recognizer tells, so core's rule decides what a hold
 *   is. A finger going down, moving off the spot, and lifting.
 *
 * @example
 * ```typescript
 * const ask: GestureKind = 'HeldLong'
 * ```
 */
export const GestureKind = S.Literals([
  'Pressed',
  'PressedSecondary',
  'HeldLong',
  'PressedDown',
  'MovedPointerAway',
  'ReleasedPointer',
])
/** One thing a person does to a painted element. */
export type GestureKind = typeof GestureKind.Type

/** Every gesture there is, in the order the list declares them. */
export const all: ReadonlyArray<GestureKind> = GestureKind.literals

/**
 * The three raw facts that stand in for `HeldLong` on a platform that
 * does not recognize a hold itself.
 */
export const rawHold: ReadonlyArray<GestureKind> = [
  'PressedDown',
  'MovedPointerAway',
  'ReleasedPointer',
]

/**
 * What a pointer is: a mouse, a finger, or a pen. A hold is asked with a
 * finger or a pen and never with a mouse, which has a second button.
 */
export const PointerKind = S.Literals(['Mouse', 'Touch', 'Pen'])
/** What a pointer is. */
export type PointerKind = typeof PointerKind.Type

/**
 * Whether a platform that recognizes `recognizes` can hear a `gesture` at
 * all: by itself, or, for a hold, through the raw three.
 *
 * @example
 * ```typescript
 * isHeardBy('HeldLong', ['Pressed', 'PressedDown', 'MovedPointerAway', 'ReleasedPointer']) // true
 * isHeardBy('PressedSecondary', ['Pressed', 'HeldLong']) // false: a phone has no second button
 * ```
 */
export const isHeardBy = (
  gesture: GestureKind,
  recognizes: ReadonlyArray<GestureKind>,
): boolean =>
  Array.contains(recognizes, gesture) ||
  (gesture === 'HeldLong' &&
    Array.every(rawHold, raw => Array.contains(recognizes, raw)))

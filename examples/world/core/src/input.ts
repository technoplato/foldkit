import { Match as M, Option } from 'effect'
import { East, North, South, West } from 'foldkit/spatial'
import {
  PressedClear,
  PressedDigit,
  PressedEnter,
  type Digit,
} from 'vending-core-example'

import {
  Dismissed,
  GotVendingMessage,
  type Message,
  Moved,
  PressedA,
} from './message.js'
import { type Model } from './model.js'

const facingForKey = (key: string) =>
  M.value(key).pipe(
    M.whenOr('ArrowUp', 'w', 'W', () => Option.some(North())),
    M.whenOr('ArrowDown', 's', 'S', () => Option.some(South())),
    M.whenOr('ArrowLeft', 'a', 'A', () => Option.none<never>()),
    M.whenOr('ArrowRight', 'd', 'D', () => Option.some(East())),
    M.orElse(() => Option.none()),
  )

const isDigit = (value: string): value is Digit =>
  value.length === 1 && value >= '0' && value <= '9'

/**
 * Maps one key to a World Message. `a`/`A` is interact, not west.
 * Use `q` or ArrowLeft for west.
 */
export const messageFromKey = (key: string, model: Model): Option.Option<Message> => {
  if (key === 'a' || key === 'A' || key === ' ') {
    if (model._tag === 'Roaming') {
      return Option.some(PressedA())
    }
    return Option.some(Dismissed())
  }
  if (key === 'Escape') {
    return Option.some(Dismissed())
  }
  if (key === 'ArrowLeft' || key === 'q' || key === 'Q') {
    return Option.some(Moved({ facing: West() }))
  }
  const maybeFacing = facingForKey(key)
  if (Option.isSome(maybeFacing)) {
    return Option.some(Moved({ facing: maybeFacing.value }))
  }
  if (model._tag !== 'Operating') {
    return Option.none()
  }
  if (isDigit(key)) {
    return Option.some(
      GotVendingMessage({ message: PressedDigit.make({ digit: key }) }),
    )
  }
  if (key === 'Enter') {
    return Option.some(GotVendingMessage({ message: PressedEnter.make({}) }))
  }
  if (key === 'Backspace' || key === 'c' || key === 'C') {
    return Option.some(GotVendingMessage({ message: PressedClear.make({}) }))
  }
  return Option.none()
}

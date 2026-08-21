import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import { CardinalFacing } from 'foldkit/spatial'
import { Message as VendingMessage } from 'vending-core-example'

/** The player asked to step or turn while roaming. */
export const Moved = m('Moved', { facing: CardinalFacing })

/** The player pressed A. Update no-ops when the faced cell is empty. */
export const PressedA = m('PressedA')

/** The player dismissed a sign or the vending menu. */
export const Dismissed = m('Dismissed')

/** A nested Vending Program Message. Keypad digits arrive here. */
export const GotVendingMessage = m('GotVendingMessage', {
  message: VendingMessage,
})

/** Every Message the World Program accepts. */
export const Message = S.Union([Moved, PressedA, Dismissed, GotVendingMessage])

/** A World Message value. */
export type Message = typeof Message.Type

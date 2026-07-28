import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { ControlOrigin, SlideId } from './model.js'

/** Records that one control advanced the deck. */
export const AdvancedSlide = m('AdvancedSlide', { origin: ControlOrigin })
/** Records that one control rewound the deck. */
export const RewoundSlide = m('RewoundSlide', { origin: ControlOrigin })
/** Records that one control selected a stable slide directly. */
export const SelectedSlide = m('SelectedSlide', {
  origin: ControlOrigin,
  slideId: SlideId,
})

/** Every Message accepted by the constructive modeling deck. */
export const Message = S.Union([AdvancedSlide, RewoundSlide, SelectedSlide])
/** A constructive modeling deck Message value. */
export type Message = typeof Message.Type

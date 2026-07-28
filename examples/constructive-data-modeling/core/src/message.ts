import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import {
  ControlOrigin,
  PageChooserScope,
  RevealPage,
  SlideId,
} from './model.js'

/** Records that one control advanced to the next authored page or Q&A tail. */
export const AdvancedPage = m('AdvancedPage', { origin: ControlOrigin })
/** Records that one control rewound to the previous authored page. */
export const RewoundPage = m('RewoundPage', { origin: ControlOrigin })
/** Records that one control selected an exact authored reveal page. */
export const SelectedRevealPage = m('SelectedRevealPage', {
  origin: ControlOrigin,
  page: RevealPage,
})
/** Records that one control selected a stable slide directly. */
export const SelectedSlide = m('SelectedSlide', {
  origin: ControlOrigin,
  slideId: SlideId,
})
/** Records one current-time observation from a video-capable host. */
export const ObservedPlayback = m('ObservedPlayback', {
  seconds: S.Number,
})
/** Records that one control opened the authored page chooser. */
export const OpenedPageChooser = m('OpenedPageChooser', {
  origin: ControlOrigin,
})
/** Records that the visible page chooser changed its listing scope. */
export const ChangedPageChooserScope = m('ChangedPageChooserScope', {
  scope: PageChooserScope,
})
/** Records that one exact page became the chooser target. */
export const ChosePageChooserTarget = m('ChosePageChooserTarget', {
  page: RevealPage,
})
/** Records that the chooser advanced its selected target. */
export const AdvancedPageChooserSelection = m('AdvancedPageChooserSelection')
/** Records that the chooser rewound its selected target. */
export const RewoundPageChooserSelection = m('RewoundPageChooserSelection')
/** Records that the selected chooser target became the current page. */
export const ConfirmedPageChooser = m('ConfirmedPageChooser')
/** Records that the visible chooser was dismissed without navigation. */
export const CancelledPageChooser = m('CancelledPageChooser')

/** Every Message accepted by the constructive modeling deck. */
export const Message = S.Union([
  AdvancedPage,
  RewoundPage,
  SelectedRevealPage,
  SelectedSlide,
  ObservedPlayback,
  OpenedPageChooser,
  ChangedPageChooserScope,
  ChosePageChooserTarget,
  AdvancedPageChooserSelection,
  RewoundPageChooserSelection,
  ConfirmedPageChooser,
  CancelledPageChooser,
])
/** A constructive modeling deck Message value. */
export type Message = typeof Message.Type

import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { LiveClientMedium, MatrixOrientation, ScreenMode } from './model.js'

/** The user selected a destination for the state inspector. */
export const SelectedScreenMode = m('SelectedScreenMode', {
  mode: ScreenMode,
})

/** The user selected the matrix row axis. */
export const SelectedMatrixOrientation = m('SelectedMatrixOrientation', {
  orientation: MatrixOrientation,
})

/** The user opened an interactive browser client from one matrix capture. */
export const OpenedLiveClient = m('OpenedLiveClient', {
  medium: LiveClientMedium,
  mode: ScreenMode,
})

/** The user returned the live matrix cell to its checked-in capture. */
export const ClosedLiveClient = m('ClosedLiveClient')

/** Every Message accepted by the Client Matrix Program. */
export const Message = S.Union([
  SelectedScreenMode,
  SelectedMatrixOrientation,
  OpenedLiveClient,
  ClosedLiveClient,
])
/** Every Message accepted by the Client Matrix Program. */
export type Message = typeof Message.Type

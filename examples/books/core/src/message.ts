import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

export const PressedSignIn = m('PressedSignIn')
export const PressedSignOut = m('PressedSignOut')
export const PressedOpenBook = m('PressedOpenBook', { itemId: S.String })
export const PressedGoBack = m('PressedGoBack')
export const PressedShowText = m('PressedShowText')
export const PressedShowAudio = m('PressedShowAudio')
export const PressedShowBoth = m('PressedShowBoth')
export const PressedOpenImport = m('PressedOpenImport')
export const PressedScanShelf = m('PressedScanShelf')
export const PressedScanFinished = m('PressedScanFinished')
export const PressedOpenSettings = m('PressedOpenSettings')
export const PressedOpenAccounts = m('PressedOpenAccounts')
export const PressedOpenSearch = m('PressedOpenSearch')
export const PressedSetQuery = m('PressedSetQuery', { query: S.String })
export const PressedStartPlayback = m('PressedStartPlayback', {
  itemId: S.String,
})
export const PressedPausePlayback = m('PressedPausePlayback')
export const PressedResumePlayback = m('PressedResumePlayback')
export const PressedStopPlayback = m('PressedStopPlayback')
export const PressedOpenPlaybackReader = m('PressedOpenPlaybackReader')

export const Message = S.Union([
  PressedSignIn,
  PressedSignOut,
  PressedOpenBook,
  PressedGoBack,
  PressedShowText,
  PressedShowAudio,
  PressedShowBoth,
  PressedOpenImport,
  PressedScanShelf,
  PressedScanFinished,
  PressedOpenSettings,
  PressedOpenAccounts,
  PressedOpenSearch,
  PressedSetQuery,
  PressedStartPlayback,
  PressedPausePlayback,
  PressedResumePlayback,
  PressedStopPlayback,
  PressedOpenPlaybackReader,
])
export type Message = typeof Message.Type

import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { Word } from './model.js'

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
export const PressedSeekWord = m('PressedSeekWord', { start: S.Number })
export const HeardPlaybackPosition = m('HeardPlaybackPosition', {
  mediaPosition: S.Number,
})
export const HeardAudioPlaying = m('HeardAudioPlaying', {
  itemId: S.String,
  renditionId: S.String,
})
export const HeardAudioPaused = m('HeardAudioPaused')
export const HeardAudioEnded = m('HeardAudioEnded')
export const HeardFollowAlong = m('HeardFollowAlong', {
  itemId: S.String,
  body: S.String,
  words: S.Array(Word),
})
export const FailedFollowAlong = m('FailedFollowAlong')
export const CompletedPlayAudio = m('CompletedPlayAudio')
export const CompletedPauseAudio = m('CompletedPauseAudio')
export const CompletedSeekAudio = m('CompletedSeekAudio')
export const CompletedScrollCurrentWord = m('CompletedScrollCurrentWord')

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
  PressedSeekWord,
  HeardPlaybackPosition,
  HeardAudioPlaying,
  HeardAudioPaused,
  HeardAudioEnded,
  HeardFollowAlong,
  FailedFollowAlong,
  CompletedPlayAudio,
  CompletedPauseAudio,
  CompletedSeekAudio,
  CompletedScrollCurrentWord,
])
export type Message = typeof Message.Type

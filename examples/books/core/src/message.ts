import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import {
  Bookmark,
  ChapterSort,
  Item,
  Note,
  NoteAudience,
  Progress,
  Seconds,
  Word,
} from './model.js'
import { NavigationTarget } from './route.js'

export const PressedSignIn = m('PressedSignIn')
export const PressedSignOut = m('PressedSignOut')
export const PressedOpenBook = m('PressedOpenBook', { itemId: S.String })
export const PressedOpenChapter = m('PressedOpenChapter', {
  itemId: S.String,
  chapterId: S.String,
})
export const PressedSetChapterSort = m('PressedSetChapterSort', {
  sort: ChapterSort,
})
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
export const PressedSeekWord = m('PressedSeekWord', { start: Seconds })
export const HeardPlaybackPosition = m('HeardPlaybackPosition', {
  mediaPosition: Seconds,
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
export const HeardSignedIn = m('HeardSignedIn', { accountId: S.String })
export const FailedSignIn = m('FailedSignIn')
export const HeardCatalog = m('HeardCatalog', { items: S.Array(Item) })
export const FailedCatalog = m('FailedCatalog')
export const HeardUserData = m('HeardUserData', {
  bookmarks: S.Array(Bookmark),
  notes: S.Array(Note),
  progress: S.Array(Progress),
})
export const PressedAddBookmark = m('PressedAddBookmark')
export const PressedOpenBookmark = m('PressedOpenBookmark', {
  bookmarkId: S.String,
})
export const PressedDeleteBookmark = m('PressedDeleteBookmark', {
  bookmarkId: S.String,
})
export const UpdatedNoteDraft = m('UpdatedNoteDraft', { value: S.String })
export const PressedAddNote = m('PressedAddNote')
export const PressedDeleteNote = m('PressedDeleteNote', { noteId: S.String })
export const CompletedSaveProgress = m('CompletedSaveProgress')
export const FailedSaveProgress = m('FailedSaveProgress')
export const CompletedSaveBookmark = m('CompletedSaveBookmark')
export const FailedSaveBookmark = m('FailedSaveBookmark')
export const CompletedSaveNote = m('CompletedSaveNote')
export const FailedSaveNote = m('FailedSaveNote')
export const CompletedSignOut = m('CompletedSignOut')
export const CompletedPlayAudio = m('CompletedPlayAudio')
export const CompletedPauseAudio = m('CompletedPauseAudio')
export const CompletedSeekAudio = m('CompletedSeekAudio')
export const CompletedScrollCurrentWord = m('CompletedScrollCurrentWord')
export const ClickedLink = m('ClickedLink', { request: UrlRequest })
export const ChangedUrl = m('ChangedUrl', { url: Url })
export const OpenedNavigation = m('OpenedNavigation', {
  target: NavigationTarget,
})
export const CompletedNavigateInternal = m('CompletedNavigateInternal')
export const CompletedLoadExternal = m('CompletedLoadExternal')
export const CompletedHistoryBack = m('CompletedHistoryBack')
export const PressedToggleAppearance = m('PressedToggleAppearance')
export const PressedFollowLive = m('PressedFollowLive')
export const ScrolledAway = m('ScrolledAway')
export const PressedSetNoteAudience = m('PressedSetNoteAudience', {
  audience: NoteAudience,
})
export const PressedCopySharePath = m('PressedCopySharePath')
export const HeardSharedNote = m('HeardSharedNote', {
  note: S.Option(Note),
})
export const FailedSharedNote = m('FailedSharedNote')

export const Message = S.Union([
  PressedSignIn,
  PressedSignOut,
  PressedOpenBook,
  PressedOpenChapter,
  PressedSetChapterSort,
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
  HeardSignedIn,
  FailedSignIn,
  HeardCatalog,
  FailedCatalog,
  HeardUserData,
  PressedAddBookmark,
  PressedOpenBookmark,
  PressedDeleteBookmark,
  UpdatedNoteDraft,
  PressedAddNote,
  PressedDeleteNote,
  CompletedSaveProgress,
  FailedSaveProgress,
  CompletedSaveBookmark,
  FailedSaveBookmark,
  CompletedSaveNote,
  FailedSaveNote,
  CompletedSignOut,
  CompletedPlayAudio,
  CompletedPauseAudio,
  CompletedSeekAudio,
  CompletedScrollCurrentWord,
  ClickedLink,
  ChangedUrl,
  OpenedNavigation,
  CompletedNavigateInternal,
  CompletedLoadExternal,
  CompletedHistoryBack,
  PressedToggleAppearance,
  PressedFollowLive,
  ScrolledAway,
  PressedSetNoteAudience,
  PressedCopySharePath,
  HeardSharedNote,
  FailedSharedNote,
])
export type Message = typeof Message.Type

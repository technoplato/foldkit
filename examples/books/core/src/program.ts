import { Match as M, Option, Record as Record_ } from 'effect'
import { Program } from 'foldkit'
import * as CodeUpdates from 'foldkit/code-updates'
import * as Theme from 'foldkit/theme'
import * as TranscriptPlayer from 'transcript-player-core-example'

import * as Audible from './audible/index.js'
import { init } from './init.js'
import { Message, catalog, isBookmarkEdit } from './message.js'
import { Model } from './model.js'
import { navigation } from './navigation.js'
import { libraryScreen } from './screen.js'
import { Quiet } from './stretch.js'
import { subscriptions } from './subscriptions.js'
import { update } from './update.js'

// PROGRAM

const categoryOf = (message: Message): 'Domain' | 'Navigation' =>
  M.value(message).pipe(
    M.withReturnType<'Domain' | 'Navigation'>(),
    M.tagsExhaustive({
      Listen: () => 'Navigation',
      Play: () => 'Navigation',
      Pause: () => 'Navigation',
      SkipBack: () => 'Navigation',
      SeekTo: () => 'Navigation',
      PreviousSection: () => 'Navigation',
      NextSection: () => 'Navigation',
      SetSeekScope: () => 'Navigation',
      PreviousParagraph: () => 'Navigation',
      NextParagraph: () => 'Navigation',
      ShowSearch: () => 'Navigation',
      CloseSearch: () => 'Navigation',
      SearchFor: () => 'Navigation',
      ClearSearch: () => 'Navigation',
      NextMatch: () => 'Navigation',
      PreviousMatch: () => 'Navigation',
      ShowMatch: () => 'Navigation',
      PlayFrom: () => 'Navigation',
      LeavePlayhead: () => 'Navigation',
      BackToPlayhead: () => 'Navigation',
      ShowWordMenu: () => 'Navigation',
      CloseWordMenu: () => 'Navigation',
      CopyWordLink: () => 'Navigation',
      ReceivedMatches: () => 'Navigation',
      FailedSearch: () => 'Navigation',
      ReadSearchWords: () => 'Navigation',
      FailedReadSearchWords: () => 'Navigation',
      ExpandControls: () => 'Navigation',
      CollapseControls: () => 'Navigation',
      SetAppearance: () => 'Navigation',
      ObservedSystemMode: () => 'Navigation',
      ObservedSystemContrast: () => 'Navigation',
      RestartToUpdate: () => 'Navigation',
      ObservedCodeStatus: () => 'Navigation',
      CompletedRestartOnNewerCode: () => 'Navigation',
      FailedRestartOnNewerCode: () => 'Navigation',
      ShowLibrary: () => 'Navigation',
      ShowProfile: () => 'Navigation',
      ShowReadAloud: () => 'Navigation',
      OpenBook: () => 'Navigation',
      PreviousPage: () => 'Navigation',
      NextPage: () => 'Navigation',
      TurnToPage: () => 'Navigation',
      FollowReading: () => 'Navigation',
      SharePage: () => 'Navigation',
      ReceivedReadings: () => 'Domain',
      FailedReadReadings: () => 'Domain',
      ReceivedPreview: () => 'Navigation',
      FailedCheckPreview: () => 'Navigation',
      SeekToWord: () => 'Navigation',
      SkipForward: () => 'Navigation',
      Open: () => 'Navigation',
      ShowTitleMenu: () => 'Navigation',
      CloseTitleMenu: () => 'Navigation',
      OpenPlayer: () => 'Navigation',
      ShowContents: () => 'Navigation',
      JumpToChapter: () => 'Navigation',
      ShowSpeeds: () => 'Navigation',
      SetSpeed: () => 'Navigation',
      AddBookmark: () => 'Domain',
      AddNotedBookmark: () => 'Domain',
      BookmarkWord: () => 'Domain',
      MarkedMoment: () => 'Domain',
      ShowBookmarks: () => 'Navigation',
      OpenBookmark: () => 'Navigation',
      SetBookmarkNote: () => 'Domain',
      ClearBookmarkNote: () => 'Domain',
      UndoRemoveBookmark: () => 'Domain',
      PlayBookmark: () => 'Navigation',
      DeleteBookmark: () => 'Navigation',
      ConfirmDeleteBookmark: () => 'Domain',
      CancelDeleteBookmark: () => 'Navigation',
      ReceivedShelf: () => 'Domain',
      ReceivedPlaces: () => 'Domain',
      ReceivedBookmarks: () => 'Domain',
      FailedReadShelf: () => 'Domain',
      ReceivedChapters: () => 'Navigation',
      FailedReadChapters: () => 'Navigation',
      OpenedPlace: () => 'Navigation',
      ReceivedMember: () => 'Navigation',
      SharePlace: () => 'Navigation',
      SharedLink: () => 'Navigation',
      FailedShareLink: () => 'Navigation',
      ReachedPlace: () => 'Navigation',
      ReachedEnd: () => 'Navigation',
      FailedPlayAudio: () => 'Navigation',
      ReceivedPassages: () => 'Navigation',
      FailedLoadTranscript: () => 'Navigation',
      CompletedWriteLibrary: () => 'Domain',
      FailedWriteLibrary: () => 'Domain',
      CompletedReportStretch: () => 'Navigation',
      FailedReportStretch: () => 'Navigation',
      ReceivedUnendedPlays: () => 'Navigation',
      CompletedCloseUnendedPlays: () => 'Navigation',
      FailedCloseUnendedPlays: () => 'Navigation',
      ShowAddBooks: () => 'Navigation',
      ImportFromAudible: () => 'Navigation',
      ReconnectAudible: () => 'Navigation',
      ConnectAudible: () => 'Navigation',
      TryAudibleSignInAgain: () => 'Navigation',
      ToggleAudibleTitle: () => 'Navigation',
      SelectAllAudibleTitles: () => 'Navigation',
      DeselectAudibleTitles: () => 'Navigation',
      ImportAudibleTitles: () => 'Navigation',
      ReadAudibleLibraryAgain: () => 'Navigation',
      StartedAudibleSignIn: () => 'Navigation',
      FailedStartAudibleSignIn: () => 'Navigation',
      ConnectedAudible: () => 'Navigation',
      FailedConnectAudible: () => 'Navigation',
      ReceivedAudibleLibrary: () => 'Navigation',
      FailedReadAudibleLibrary: () => 'Navigation',
      AdvancedAudibleImport: () => 'Navigation',
      ImportedAudibleTitles: () => 'Navigation',
      FailedImportAudibleTitles: () => 'Navigation',
      GetAudiobookAudio: () => 'Navigation',
      ReceivedAudiobookAudio: () => 'Navigation',
      FailedReadAudiobookAudio: () => 'Navigation',
      QueuedAudiobookAudio: () => 'Navigation',
      FailedQueueAudiobookAudio: () => 'Navigation',
      OpenedUri: () => 'Navigation',
      NavigatedBack: () => 'Navigation',
    }),
  )

/**
 * True for a Message that stays on the device that sent it and never
 * reaches the log: the Audible import's, so a pasted sign-in address
 * never leaves; the look, as the integration branch already kept it;
 * what one person is looking at in the reader, the search,
 * its matches, and whether the words follow the playhead, so a search on
 * a phone never moves the words on a desk; a book's menu on the shelf,
 * so a long press on a phone opens nothing on a desk; copying a link,
 * which goes to this device's clipboard; and which update this device
 * runs, with its restart, so an update a phone fetched is never shown on
 * a desk.
 *
 * @example
 * ```typescript
 * isLocalOnlyMessage(SearchFor({ query })) // true
 * isLocalOnlyMessage(ObservedCodeStatus({ status })) // true: one device's update is no other's
 * isLocalOnlyMessage(PlayFrom({ placeMs })) // false: the audio moves on every device that mirrors
 * isLocalOnlyMessage(SetBookmarkNote({ note })) // true: the note reaches every device through the library store
 * ```
 */
export const isLocalOnlyMessage = (message: Message): boolean =>
  Audible.isMessage(message) ||
  Theme.isMessage(message) ||
  CodeUpdates.isMessage(message) ||
  TranscriptPlayer.isViewMessage(message) ||
  message._tag === 'CopyWordLink' ||
  message._tag === 'ShowTitleMenu' ||
  message._tag === 'CloseTitleMenu' ||
  isBookmarkEdit(message)

/**
 * The Books Program: a library of audiobooks, a page per title and per
 * chapter, and a player, with Read Aloud's picture books at
 * `/books/read-aloud`. The shelf comes from the library store and every
 * change to it goes back there as a Command, so every device reads the
 * same progress and bookmarks. The player counts on this device; playing,
 * pausing, turning a picture book's page, and moving around are
 * Navigation, which the session mirrors or keeps local. The Audible
 * import's Messages stay on the device that sent them: the log never holds
 * them, so a pasted sign-in address never reaches it. It knows nothing
 * about React, terminals, Scribe's files, or Instant.
 */
export const BooksProgram = Program.make({
  id: 'books',
  version: 1,
  Model,
  Message,
  init,
  update,
  catalog,
  navigation,
  subscriptions,
  screen: libraryScreen,
  synchronization: {
    messageCategory: categoryOf,
    projectDomain: model => ({ library: model.library }),
    isLocalOnly: isLocalOnlyMessage,
    keepOnRefold: (current, refolded) => ({
      ...refolded,
      library: current.library,
      chapters: current.chapters,
      listening: current.listening,
      maybeTimelineProblem: current.maybeTimelineProblem,
      unsentReports: current.unsentReports,
      readings: current.readings,
      previewChecks: current.previewChecks,
      audible: current.audible,
      maybeRemovedBookmark: current.maybeRemovedBookmark,
      maybeTitleMenu: current.maybeTitleMenu,
      appearance: current.appearance,
      maybeCodeStatus: current.maybeCodeStatus,
    }),
    projectLocal: model => ({
      ...model,
      chapters: Record_.filter(
        model.chapters,
        state => state._tag === 'ChaptersReady',
      ),
      listening:
        model.listening._tag === 'Loaded'
          ? {
              ...model.listening,
              player: {
                ...model.listening.player,
                transport: TranscriptPlayer.Paused(),
              },
              stretch: Quiet(),
            }
          : model.listening,
      maybeNotice: Option.none(),
      maybeRemovedBookmark: Option.none(),
      maybeTitleMenu: Option.none(),
      // NOTE: the host says which update runs each time the app opens. A
      // status kept across a restart would name the update before it.
      maybeCodeStatus: Option.none(),
    }),
  },
})

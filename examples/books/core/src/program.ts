import { Match as M } from 'effect'
import { Program } from 'foldkit'

import { init } from './init.js'
import { Message, catalog } from './message.js'
import { Model } from './model.js'
import { navigation } from './navigation.js'
import { libraryScreen } from './screen.js'
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
      SeekToWord: () => 'Navigation',
      SkipForward: () => 'Navigation',
      Open: () => 'Navigation',
      OpenPlayer: () => 'Navigation',
      ShowContents: () => 'Navigation',
      JumpToChapter: () => 'Navigation',
      OpenChapter: () => 'Navigation',
      ShowSpeeds: () => 'Navigation',
      SetSpeed: () => 'Navigation',
      AddBookmark: () => 'Domain',
      PlayBookmark: () => 'Navigation',
      DeleteBookmark: () => 'Navigation',
      ConfirmDeleteBookmark: () => 'Domain',
      CancelDeleteBookmark: () => 'Navigation',
      ReceivedShelf: () => 'Domain',
      FailedReadShelf: () => 'Domain',
      ReachedPlace: () => 'Navigation',
      ReachedEnd: () => 'Navigation',
      FailedPlayAudio: () => 'Navigation',
      ReceivedPassages: () => 'Navigation',
      FailedLoadTranscript: () => 'Navigation',
      CompletedWriteLibrary: () => 'Domain',
      FailedWriteLibrary: () => 'Domain',
      OpenedUri: () => 'Navigation',
      NavigatedBack: () => 'Navigation',
    }),
  )

/**
 * The Books Program: a library of audiobooks, a page per title and per
 * chapter, and a player. The shelf comes from the library store and every
 * change to it goes back there as a Command, so every device reads the
 * same progress and bookmarks. The player counts on this device; playing,
 * pausing, and moving around are Navigation, which the session mirrors or
 * keeps local. It knows nothing about React, terminals, or Instant.
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
    keepOnRefold: (current, refolded) => ({
      ...refolded,
      library: current.library,
      listening: current.listening,
    }),
  },
})

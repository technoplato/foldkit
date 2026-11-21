import { Array, Match as M, Option } from 'effect'
import { Navigation, Program } from 'foldkit'
import * as CodeUpdates from 'foldkit/code-updates'
import * as Theme from 'foldkit/theme'
import * as ReadAloud from 'read-aloud-core-example'
import * as TranscriptPlayer from 'transcript-player-core-example'

import * as Audible from './audible/index.js'
import {
  AddBooksSheet,
  BookmarksDrawer,
  ContentsSheet,
  Destination,
  PlayerPage,
  ProfilePage,
  SpeedSheet,
  TitlePage,
  isAddBooksSheet,
  isBesidePanel,
  isBookmarksDrawer,
  isContentsSheet,
  isDeleteBookmarkQuestion,
  isPlayerScreen,
  isProfilePage,
  isSpeedSheet,
  isTitlePage,
} from './destination.js'
import { Milliseconds } from './ids.js'
import { init } from './init.js'
import { secondOf } from './links.js'
import { Message, catalog, isBookmarkEdit } from './message.js'
import { Model } from './model.js'
import { navigation } from './navigation.js'
import { declared } from './routes.js'
import { libraryScreen } from './screen.js'
import { subscriptions } from './subscriptions.js'
import { update } from './update.js'

// PROGRAM

type SyncedModel = Program.SyncedOfSchema<typeof Model>

const skipMs = 30_000

const panelSide = 'Left'

const clampedPlace = (
  durationMs: Milliseconds,
  placeMs: number,
): Milliseconds =>
  Milliseconds.make(Math.round(Math.min(durationMs, Math.max(0, placeMs))))

const withoutModal = (
  synced: SyncedModel,
  isModal: (destination: unknown) => boolean,
): SyncedModel => ({
  ...synced,
  navigation: Navigation.withoutDestinations(synced.navigation, isModal),
})

const toggledBeside = (
  synced: SyncedModel,
  isShowing: boolean,
  destination: Destination,
): SyncedModel =>
  isShowing
    ? withoutModal(synced, isBesidePanel)
    : {
        ...synced,
        navigation: Navigation.pushed(
          Navigation.withoutDestinations(synced.navigation, isBesidePanel),
          Navigation.presented<Destination>(
            destination,
            Navigation.Drawer({ from: panelSide }),
          ),
        ),
      }

const withSyncedPlace = (
  synced: SyncedModel,
  compute: (placeMs: Milliseconds, durationMs: Milliseconds) => Milliseconds,
): SyncedModel => {
  if (synced.listening._tag !== 'Loaded') {
    return synced
  }
  const nextPlaceMs = compute(
    synced.listening.player.placeMs,
    synced.listening.player.media.durationMs,
  )
  const nextLoaded = {
    ...synced.listening,
    player: {
      ...synced.listening.player,
      placeMs: nextPlaceMs,
    },
  }
  const maybeTop = Array.last(synced.navigation.pages)
  const nextNavigation =
    Option.isSome(maybeTop) && isPlayerScreen(maybeTop.value)
      ? {
          ...synced.navigation,
          pages: [
            ...Array.dropRight(synced.navigation.pages, 1),
            PlayerPage({ atMs: secondOf(nextPlaceMs) }),
          ],
        }
      : synced.navigation
  return {
    ...synced,
    listening: nextLoaded,
    navigation: nextNavigation,
  }
}

const syncedNavigation = Navigation.composeNavigation({
  child: declared,
  hold: 'Owns',
  Destination,
  childOf: (_synced: SyncedModel) => undefined,
  stack: Navigation.fieldLens<SyncedModel, Destination>(),
  embedNotFound: notFound => notFound,
  routes: [],
  viewOf: () => Option.none(),
})

/**
 * Pure synced-only fold used by shared log snapshots (`strangerViewpoint`).
 * Operates strictly on `Program.SyncedOfSchema<typeof Model>` so TypeScript
 * guarantees shared folds never read `loaded`, `local`, or `ephemeral` fields.
 */
const foldSynced = (synced: SyncedModel, message: Message): SyncedModel =>
  M.value(message).pipe(
    M.withReturnType<SyncedModel>(),
    M.tags({
      SetSpeed: ({ speed }) => ({
        ...withoutModal(synced, isSpeedSheet),
        speed,
        listening:
          synced.listening._tag === 'Loaded'
            ? {
                ...synced.listening,
                player: { ...synced.listening.player, speed },
              }
            : synced.listening,
      }),
      SetSeekScope: ({ scope }) =>
        synced.listening._tag === 'Loaded'
          ? {
              ...synced,
              listening: {
                ...synced.listening,
                player: { ...synced.listening.player, seekScope: scope },
              },
            }
          : synced,
      SkipBack: () =>
        withSyncedPlace(synced, (placeMs, durationMs) =>
          clampedPlace(durationMs, placeMs - skipMs),
        ),
      SkipForward: () =>
        withSyncedPlace(synced, (placeMs, durationMs) =>
          clampedPlace(durationMs, placeMs + skipMs),
        ),
      SeekTo: ({ placeMs }) =>
        withSyncedPlace(synced, (_current, durationMs) =>
          clampedPlace(durationMs, placeMs),
        ),
      PlayFrom: ({ placeMs }) =>
        withSyncedPlace(synced, (_current, durationMs) =>
          clampedPlace(durationMs, placeMs),
        ),
      ShowLibrary: () => ({
        ...synced,
        navigation: {
          ...synced.navigation,
          pages: [],
          maybeModal: Option.none(),
        },
      }),
      ShowProfile: () => ({
        ...synced,
        navigation: {
          ...synced.navigation,
          pages: [ProfilePage()],
          maybeModal: Option.none(),
        },
      }),
      ShowReadAloud: () => ({
        ...synced,
        navigation: {
          ...synced.navigation,
          pages: [ReadAloud.ReadAloudShelf()],
          maybeModal: Option.none(),
        },
      }),
      ShowContents: () =>
        toggledBeside(
          synced,
          Option.exists(synced.navigation.maybeModal, modal =>
            isContentsSheet(modal.destination),
          ),
          ContentsSheet(),
        ),
      ShowBookmarks: () =>
        toggledBeside(
          synced,
          Option.exists(synced.navigation.maybeModal, modal =>
            isBookmarksDrawer(modal.destination),
          ),
          BookmarksDrawer(),
        ),
      ShowSpeeds: () => ({
        ...synced,
        navigation: Navigation.pushed(
          synced.navigation,
          Navigation.presented<Destination>(SpeedSheet(), Navigation.Sheet()),
        ),
      }),
      ShowAddBooks: () => ({
        ...synced,
        navigation: Navigation.pushed(
          synced.navigation,
          Navigation.presented<Destination>(
            AddBooksSheet(),
            Navigation.Sheet(),
          ),
        ),
      }),
      ImportFromAudible: () => {
        const closed = Navigation.withoutDestinations(
          synced.navigation,
          isAddBooksSheet,
        )
        return {
          ...synced,
          navigation: {
            ...closed,
            pages: [
              ...Array.filter(closed.pages, isProfilePage),
              Audible.AudibleTitlesPage(),
            ],
          },
        }
      },
      ReconnectAudible: () =>
        Option.exists(
          Array.last(synced.navigation.pages),
          Audible.isAudibleTitlesPage,
        )
          ? {
              ...synced,
              navigation: {
                ...synced.navigation,
                pages: [
                  ...Array.dropRight(synced.navigation.pages, 1),
                  Audible.AudibleConnectPage(),
                ],
              },
            }
          : synced,
      OpenPlayer: () => {
        if (synced.listening._tag !== 'Loaded') {
          return synced
        }
        const slug = synced.listening.slug
        const playerPage = PlayerPage({
          atMs: secondOf(synced.listening.player.placeMs),
        })
        const existingTitle = Array.findFirst(
          synced.navigation.pages,
          isTitlePage,
        )
        const isAlreadyOnPlayer =
          Option.exists(Array.last(synced.navigation.pages), isPlayerScreen) &&
          Option.exists(existingTitle, page => page.slug === slug)
        if (isAlreadyOnPlayer) {
          return synced
        }
        const basePages = Option.exists(
          existingTitle,
          page => page.slug === slug,
        )
          ? Array.filter(synced.navigation.pages, isTitlePage)
          : [TitlePage({ slug })]
        return {
          ...synced,
          navigation: Navigation.pushed(
            { ...synced.navigation, pages: basePages },
            Navigation.presented<Destination>(playerPage, Navigation.Push()),
          ),
        }
      },
      CancelDeleteBookmark: () =>
        withoutModal(synced, isDeleteBookmarkQuestion),
      FollowedReadAloudPage: ({ place }) => ({
        ...synced,
        navigation: {
          ...synced.navigation,
          pages: [...Array.dropRight(synced.navigation.pages, 1), place],
        },
      }),
      OpenedUri: fact => Navigation.foldMessage(syncedNavigation, synced, fact),
      NavigatedBack: fact =>
        Navigation.foldMessage(syncedNavigation, synced, fact),
    }),
    M.orElse(() => synced),
  )

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
      FollowedReadAloudPage: () => 'Navigation',
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
      DetectedAddressCue: () => 'Navigation',
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
      NeededAudibleSignIn: () => 'Navigation',
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
  message._tag === 'NeededAudibleSignIn' ||
  message._tag === 'CopyWordLink' ||
  message._tag === 'ShowTitleMenu' ||
  message._tag === 'CloseTitleMenu' ||
  isBookmarkEdit(message)

/**
 * The Books Program: a library of audiobooks, a page per title and per
 * chapter, and a player, with Read Aloud's picture books at
 * `/books/read-aloud`. The shelf comes from the library store and every
 * change to it goes back there as a Command, so every device reads the
 * same progress and bookmarks. Durability roles on `Model` derive
 * `keepOnRefold`, local/shared snapshot stripping, and Subscription write
 * enforcement automatically.
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
    foldSynced,
  },
})

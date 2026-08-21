import {
  BooksProgram,
  Message,
  Model,
  PressedGoBack,
  PressedOpenAccounts,
  PressedOpenBook,
  PressedOpenChapter,
  PressedOpenImport,
  PressedOpenPlaybackReader,
  PressedOpenSearch,
  PressedOpenSettings,
  PressedPausePlayback,
  PressedResumePlayback,
  PressedScanFinished,
  PressedScanShelf,
  PressedSetChapterSort,
  PressedSetQuery,
  PressedShowAudio,
  PressedShowBoth,
  PressedShowText,
  PressedSignIn,
  PressedSignOut,
  PressedStartPlayback,
  PressedStopPlayback,
  initialModel,
} from 'books-core-example'
import { Layer } from 'effect'
import { Program } from 'foldkit'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

export type BooksActions = Readonly<{
  pressedSignIn: () => void
  pressedSignOut: () => void
  pressedOpenBook: (itemId: string) => void
  pressedOpenChapter: (itemId: string, chapterId: string) => void
  pressedGoBack: () => void
  pressedShowText: () => void
  pressedShowAudio: () => void
  pressedShowBoth: () => void
  pressedOpenImport: () => void
  pressedScanShelf: () => void
  pressedScanFinished: () => void
  pressedOpenSettings: () => void
  pressedOpenAccounts: () => void
  pressedOpenSearch: () => void
  pressedSetQuery: (query: string) => void
  pressedSetChapterSort: (sort: 'Index' | 'Title') => void
  pressedStartPlayback: (itemId: string) => void
  pressedPausePlayback: () => void
  pressedResumePlayback: () => void
  pressedStopPlayback: () => void
  pressedOpenPlaybackReader: () => void
}>

export type BooksInitialRoute = Program.ResolvedProgramRoute<Model, Message>

export const initialBooksRoute: BooksInitialRoute = Program.state(initialModel)

export const BooksClient = createReplayableReactProgramClient<
  Model,
  Message,
  BooksActions,
  BooksInitialRoute
>({
  createActions: enqueueMessage => ({
    pressedSignIn: () => enqueueMessage(PressedSignIn()),
    pressedSignOut: () => enqueueMessage(PressedSignOut()),
    pressedOpenBook: itemId => enqueueMessage(PressedOpenBook({ itemId })),
    pressedOpenChapter: (itemId, chapterId) =>
      enqueueMessage(PressedOpenChapter({ itemId, chapterId })),
    pressedGoBack: () => enqueueMessage(PressedGoBack()),
    pressedShowText: () => enqueueMessage(PressedShowText()),
    pressedShowAudio: () => enqueueMessage(PressedShowAudio()),
    pressedShowBoth: () => enqueueMessage(PressedShowBoth()),
    pressedOpenImport: () => enqueueMessage(PressedOpenImport()),
    pressedScanShelf: () => enqueueMessage(PressedScanShelf()),
    pressedScanFinished: () => enqueueMessage(PressedScanFinished()),
    pressedOpenSettings: () => enqueueMessage(PressedOpenSettings()),
    pressedOpenAccounts: () => enqueueMessage(PressedOpenAccounts()),
    pressedOpenSearch: () => enqueueMessage(PressedOpenSearch()),
    pressedSetQuery: query => enqueueMessage(PressedSetQuery({ query })),
    pressedSetChapterSort: sort =>
      enqueueMessage(PressedSetChapterSort({ sort })),
    pressedStartPlayback: itemId =>
      enqueueMessage(PressedStartPlayback({ itemId })),
    pressedPausePlayback: () => enqueueMessage(PressedPausePlayback()),
    pressedResumePlayback: () => enqueueMessage(PressedResumePlayback()),
    pressedStopPlayback: () => enqueueMessage(PressedStopPlayback()),
    pressedOpenPlaybackReader: () =>
      enqueueMessage(PressedOpenPlaybackReader()),
  }),
  name: 'Books',
  program: BooksProgram,
  resources: Layer.empty,
  route: initialRoute => initialRoute,
})

export const BooksProvider = ({
  children,
  fallback,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) => (
  <BooksClient.Provider initialRoute={initialBooksRoute} fallback={fallback}>
    {children}
  </BooksClient.Provider>
)

export const useBooksModel = BooksClient.useModel
export const useBooksActions = BooksClient.useActions
export const useBooksReplay = BooksClient.useReplay

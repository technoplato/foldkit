import {
  BooksProgram,
  HeardPlaybackPosition,
  type Message,
  type Model,
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
  PressedSeekWord,
  PressedSetChapterSort,
  PressedSetQuery,
  PressedShowAudio,
  PressedShowBoth,
  PressedShowText,
  PressedSignIn,
  PressedSignOut,
  PressedStartPlayback,
  PressedStopPlayback,
  chapterDuration,
  durationOfItem,
  formatClock,
  formatSpokenTail,
  itemById,
  playMediaPosition,
  playOf,
  screenOf,
  sortedChapters,
  spokenTail,
} from 'books-core-example'
import { Console, Data, Effect, Layer, Match as M, Option } from 'effect'
import { Runtime } from 'foldkit'

export class BooksCliError extends Data.TaggedError('BooksCliError')<{
  readonly reason: string
}> {}

export type BooksCliExecution = Readonly<{
  initialModel: Model
  messages: ReadonlyArray<Message>
  finalModel: Model
}>

export const messageForToken = (
  token: string,
): Effect.Effect<Message, BooksCliError> => {
  const normalized = token.trim()
  if (normalized === 'signin') {
    return Effect.succeed(PressedSignIn())
  }
  if (normalized === 'signout') {
    return Effect.succeed(PressedSignOut())
  }
  if (normalized === 'back') {
    return Effect.succeed(PressedGoBack())
  }
  if (normalized === 'text') {
    return Effect.succeed(PressedShowText())
  }
  if (normalized === 'audio') {
    return Effect.succeed(PressedShowAudio())
  }
  if (normalized === 'both') {
    return Effect.succeed(PressedShowBoth())
  }
  if (normalized === 'import') {
    return Effect.succeed(PressedOpenImport())
  }
  if (normalized === 'scan') {
    return Effect.succeed(PressedScanShelf())
  }
  if (normalized === 'scanned') {
    return Effect.succeed(PressedScanFinished())
  }
  if (normalized === 'settings') {
    return Effect.succeed(PressedOpenSettings())
  }
  if (normalized === 'accounts') {
    return Effect.succeed(PressedOpenAccounts())
  }
  if (normalized === 'search') {
    return Effect.succeed(PressedOpenSearch())
  }
  if (normalized === 'pause') {
    return Effect.succeed(PressedPausePlayback())
  }
  if (normalized === 'resume') {
    return Effect.succeed(PressedResumePlayback())
  }
  if (normalized === 'stop') {
    return Effect.succeed(PressedStopPlayback())
  }
  if (normalized === 'reader') {
    return Effect.succeed(PressedOpenPlaybackReader())
  }
  if (normalized.startsWith('open:')) {
    return Effect.succeed(
      PressedOpenBook({ itemId: normalized.slice('open:'.length) }),
    )
  }
  if (normalized.startsWith('chapter:')) {
    const rest = normalized.slice('chapter:'.length)
    const separator = rest.indexOf(':')
    if (separator <= 0 || separator === rest.length - 1) {
      return Effect.fail(
        new BooksCliError({
          reason: `Unknown books token "${token}"`,
        }),
      )
    }
    return Effect.succeed(
      PressedOpenChapter({
        itemId: rest.slice(0, separator),
        chapterId: rest.slice(separator + 1),
      }),
    )
  }
  if (normalized.startsWith('play:')) {
    return Effect.succeed(
      PressedStartPlayback({ itemId: normalized.slice('play:'.length) }),
    )
  }
  if (normalized.startsWith('query:')) {
    return Effect.succeed(
      PressedSetQuery({ query: normalized.slice('query:'.length) }),
    )
  }
  if (normalized === 'sort:index') {
    return Effect.succeed(PressedSetChapterSort({ sort: 'Index' }))
  }
  if (normalized === 'sort:title') {
    return Effect.succeed(PressedSetChapterSort({ sort: 'Title' }))
  }
  if (normalized.startsWith('seek:')) {
    const start = Number(normalized.slice('seek:'.length))
    if (!Number.isFinite(start)) {
      return Effect.fail(
        new BooksCliError({
          reason: `Unknown books token "${token}"`,
        }),
      )
    }
    return Effect.succeed(PressedSeekWord({ start }))
  }
  if (normalized.startsWith('tick:')) {
    const mediaPosition = Number(normalized.slice('tick:'.length))
    if (!Number.isFinite(mediaPosition)) {
      return Effect.fail(
        new BooksCliError({
          reason: `Unknown books token "${token}"`,
        }),
      )
    }
    return Effect.succeed(HeardPlaybackPosition({ mediaPosition }))
  }
  return Effect.fail(
    new BooksCliError({
      reason: `Unknown books token "${token}"`,
    }),
  )
}

const runMessages = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  initialModel: Model,
  messages: ReadonlyArray<Message>,
): Effect.Effect<Model> =>
  Effect.gen(function* () {
    let nextModel = initialModel
    for (const message of messages) {
      nextModel = yield* runtime.run(message)
    }
    return nextModel
  })

export const executeBooksInput = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<BooksCliExecution, BooksCliError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: BooksProgram,
          resources: Layer.empty,
        }),
      )
      const initialModel = yield* runtime.initialization
      const messages = yield* Effect.forEach(tokens, messageForToken)
      const finalModel = yield* runMessages(runtime, initialModel, messages)
      yield* runtime.shutdown
      return { initialModel, messages, finalModel }
    }),
  )

const describePlay = (model: Model): string =>
  M.value(playOf(model)).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      PlayIdle: () => 'playIdle',
      PlayPaused: play => {
        const item = Option.getOrUndefined(itemById(model.items, play.itemId))
        return `${item?.title ?? play.itemId} paused`
      },
      PlayPlaying: play => {
        const item = Option.getOrUndefined(itemById(model.items, play.itemId))
        return `${item?.title ?? play.itemId} playing`
      },
    }),
  )

const titlePageLines = (model: Model, itemId: string): string => {
  const item = Option.getOrUndefined(itemById(model.items, itemId))
  if (item === undefined) {
    return itemId
  }
  const duration = durationOfItem(item)
  return [
    item.title,
    item.authorLabel,
    duration > 0 ? formatClock(duration) : '',
    'Play',
    ...sortedChapters(item, model.chapterSort).map(
      chapter =>
        `${chapter.index}  ${chapter.title}  ${formatClock(chapterDuration(chapter))}`,
    ),
    describePlay(model),
  ].join('\n')
}

const readerLines = (model: Model, itemId: string, pane: string): string => {
  const item = Option.getOrUndefined(itemById(model.items, itemId))
  const tail =
    item === undefined
      ? ''
      : formatSpokenTail(
          spokenTail(item, playMediaPosition(playOf(model), itemId)),
        )
  const spoken = tail === '' ? (item?.body ?? '') : tail
  return [
    `${item?.title ?? itemId} · ${pane}`,
    spoken,
    describePlay(model),
  ].join('\n')
}

export const describeScreen = (model: Model): string =>
  M.value(screenOf(model)).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      SignedOut: () => 'signed out',
      ShelfEmpty: () => 'shelf empty',
      ShelfBrowse: () =>
        [
          ...model.items.map(item => {
            const line = `${item.title} · ${item.authorLabel} · ${item.packaging._tag}`
            return Option.isSome(item.coverUrl) ? `${line} · cover` : line
          }),
          describePlay(model),
        ].join('\n'),
      TitlePage: ({ itemId }) => titlePageLines(model, itemId),
      ReaderText: ({ itemId }) => readerLines(model, itemId, 'text'),
      ReaderAudio: ({ itemId }) => readerLines(model, itemId, 'audio'),
      ReaderBoth: ({ itemId }) => readerLines(model, itemId, 'both'),
      ImportIdle: () => '/media/books · watch on',
      ImportScanning: () => 'scanning',
      Settings: () =>
        `settings · speech rate ${model.speechRate} · highlight ≤ 50 ms`,
      Accounts: () => 'people · michael · root · on',
      Search: ({ query }) =>
        [
          query === '' ? 'no query' : query,
          ...model.items
            .filter(
              item =>
                query === '' ||
                item.title.toLowerCase().includes(query.toLowerCase()),
            )
            .map(item => item.title),
        ].join('\n'),
      SharedNote: ({ noteId }) =>
        Option.isSome(model.sharedNote)
          ? model.sharedNote.value.body
          : `Note ${noteId} is not available.`,
    }),
  )

const formatMessage = (message: Message): string =>
  M.value(message).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      PressedSignIn: () => 'PressedSignIn()',
      PressedSignOut: () => 'PressedSignOut()',
      PressedOpenBook: ({ itemId }) => `PressedOpenBook(${itemId})`,
      PressedOpenChapter: ({ itemId, chapterId }) =>
        `PressedOpenChapter(${itemId},${chapterId})`,
      PressedSetChapterSort: ({ sort }) => `PressedSetChapterSort(${sort})`,
      PressedGoBack: () => 'PressedGoBack()',
      PressedShowText: () => 'PressedShowText()',
      PressedShowAudio: () => 'PressedShowAudio()',
      PressedShowBoth: () => 'PressedShowBoth()',
      PressedOpenImport: () => 'PressedOpenImport()',
      PressedScanShelf: () => 'PressedScanShelf()',
      PressedScanFinished: () => 'PressedScanFinished()',
      PressedOpenSettings: () => 'PressedOpenSettings()',
      PressedOpenAccounts: () => 'PressedOpenAccounts()',
      PressedOpenSearch: () => 'PressedOpenSearch()',
      PressedSetQuery: ({ query }) => `PressedSetQuery(${query})`,
      PressedStartPlayback: ({ itemId }) => `PressedStartPlayback(${itemId})`,
      PressedPausePlayback: () => 'PressedPausePlayback()',
      PressedResumePlayback: () => 'PressedResumePlayback()',
      PressedStopPlayback: () => 'PressedStopPlayback()',
      PressedOpenPlaybackReader: () => 'PressedOpenPlaybackReader()',
      PressedSeekWord: ({ start }) => `PressedSeekWord(${start})`,
      HeardPlaybackPosition: ({ mediaPosition }) =>
        `HeardPlaybackPosition(${mediaPosition})`,
      HeardAudioPlaying: ({ itemId }) => `HeardAudioPlaying(${itemId})`,
      HeardAudioPaused: () => 'HeardAudioPaused()',
      HeardAudioEnded: () => 'HeardAudioEnded()',
      HeardFollowAlong: ({ itemId }) => `HeardFollowAlong(${itemId})`,
      FailedFollowAlong: () => 'FailedFollowAlong()',
      HeardSignedIn: ({ accountId }) => `HeardSignedIn(${accountId})`,
      FailedSignIn: () => 'FailedSignIn()',
      HeardCatalog: () => 'HeardCatalog()',
      FailedCatalog: () => 'FailedCatalog()',
      HeardUserData: () => 'HeardUserData()',
      PressedAddBookmark: () => 'PressedAddBookmark()',
      PressedOpenBookmark: ({ bookmarkId }) =>
        `PressedOpenBookmark(${bookmarkId})`,
      PressedDeleteBookmark: ({ bookmarkId }) =>
        `PressedDeleteBookmark(${bookmarkId})`,
      UpdatedNoteDraft: ({ value }) => `UpdatedNoteDraft(${value})`,
      PressedAddNote: () => 'PressedAddNote()',
      PressedDeleteNote: ({ noteId }) => `PressedDeleteNote(${noteId})`,
      CompletedSaveProgress: () => 'CompletedSaveProgress()',
      FailedSaveProgress: () => 'FailedSaveProgress()',
      CompletedSaveBookmark: () => 'CompletedSaveBookmark()',
      FailedSaveBookmark: () => 'FailedSaveBookmark()',
      CompletedSaveNote: () => 'CompletedSaveNote()',
      FailedSaveNote: () => 'FailedSaveNote()',
      CompletedSignOut: () => 'CompletedSignOut()',
      CompletedPlayAudio: () => 'CompletedPlayAudio()',
      CompletedPauseAudio: () => 'CompletedPauseAudio()',
      CompletedSeekAudio: () => 'CompletedSeekAudio()',
      CompletedScrollCurrentWord: () => 'CompletedScrollCurrentWord()',
      ClickedLink: () => 'ClickedLink()',
      ChangedUrl: () => 'ChangedUrl()',
      OpenedNavigation: ({ target }) => `OpenedNavigation(${target._tag})`,
      CompletedNavigateInternal: () => 'CompletedNavigateInternal()',
      CompletedLoadExternal: () => 'CompletedLoadExternal()',
      CompletedHistoryBack: () => 'CompletedHistoryBack()',
      PressedToggleAppearance: () => 'PressedToggleAppearance()',
      PressedFollowLive: () => 'PressedFollowLive()',
      ScrolledAway: () => 'ScrolledAway()',
      PressedSetNoteAudience: ({ audience }) =>
        `PressedSetNoteAudience(${audience})`,
      PressedCopySharePath: () => 'PressedCopySharePath()',
      HeardSharedNote: () => 'HeardSharedNote()',
      FailedSharedNote: () => 'FailedSharedNote()',
    }),
  )

export const runBooksShow = (
  isVerbose: boolean,
): Effect.Effect<void, BooksCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeBooksInput([])
    if (isVerbose) {
      yield* Console.log(`Screen: ${screenOf(execution.finalModel)._tag}`)
    }
    yield* Console.log(describeScreen(execution.finalModel))
  })

export const runBooksInput = (
  tokens: ReadonlyArray<string>,
  isVerbose: boolean,
): Effect.Effect<void, BooksCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeBooksInput(tokens)
    if (isVerbose) {
      for (const message of execution.messages) {
        yield* Console.log(`Message: ${formatMessage(message)}`)
      }
      yield* Console.log(`Screen: ${screenOf(execution.finalModel)._tag}`)
    }
    yield* Console.log(describeScreen(execution.finalModel))
  })

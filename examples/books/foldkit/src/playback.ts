import {
  CompletedHistoryBack,
  CompletedLoadExternal,
  CompletedNavigateInternal,
  CompletedPauseAudio,
  CompletedPlayAudio,
  CompletedScrollCurrentWord,
  CompletedSeekAudio,
  FailedFollowAlong,
  HeardFollowAlong,
  Message,
  Model,
  Word,
  applyNavigationTarget,
  chapterAt,
  update as coreUpdate,
  initialModel,
  itemById,
  pathToNavigationTarget,
  progressForItem,
  restore,
  screenToPath,
} from 'books-core-example'
import { Effect, Match as M, Option, Schema as S } from 'effect'
import { Command, Program } from 'foldkit'
import { back, load, pushUrl, replaceUrl } from 'foldkit/navigation'
import { toString as urlToString } from 'foldkit/url'

import { booksDatabase } from './database.js'
import {
  DeleteBookmark,
  DeleteNote,
  LoadCatalog,
  LoadUserData,
  RestoreSession,
  SaveBookmark,
  SaveNote,
  SaveProgress,
  SignInGuest,
  SignOutGuest,
} from './persist.js'

const FollowAlongPayload = S.Struct({
  itemId: S.String,
  body: S.String,
  words: S.Array(Word),
})

/** Evocation word times are relative to the chapter; the full file starts 18.669s earlier. */
export const EVOCATION_START_SECONDS = 18.669

const readerAudio = (): HTMLAudioElement | undefined => {
  const element = document.getElementById('books-reader-audio')
  return element instanceof HTMLAudioElement ? element : undefined
}

/** Loads the local A New Earth word map for the Foldkit demo host. */
export const LoadFollowAlong = Command.define(
  'LoadFollowAlong',
  HeardFollowAlong,
  FailedFollowAlong,
)(
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch('/a-new-earth-evocation.words.json'),
      catch: () => new Error('follow-along request failed'),
    }).pipe(Effect.option)
    if (response._tag === 'None' || !response.value.ok) {
      return FailedFollowAlong()
    }
    const json = yield* Effect.tryPromise({
      try: () => response.value.json() as Promise<unknown>,
      catch: () => new Error('follow-along json failed'),
    }).pipe(Effect.option)
    if (json._tag === 'None') {
      return FailedFollowAlong()
    }
    const decoded = S.decodeUnknownOption(FollowAlongPayload)(json.value)
    if (decoded._tag === 'None') {
      return FailedFollowAlong()
    }
    return HeardFollowAlong({
      itemId: decoded.value.itemId,
      body: decoded.value.body,
      words: decoded.value.words.map(word => ({
        ...word,
        start: word.start + EVOCATION_START_SECONDS,
        end: word.end + EVOCATION_START_SECONDS,
      })),
    })
  }),
)

/** Starts the mounted reader audio element. */
export const PlayAudio = Command.define(
  'PlayAudio',
  CompletedPlayAudio,
)(
  Effect.gen(function* () {
    const element = readerAudio()
    if (element !== undefined) {
      yield* Effect.promise(() =>
        element.play().then(
          () => undefined,
          () => undefined,
        ),
      )
    }
    return CompletedPlayAudio()
  }),
)

/** Pauses the mounted reader audio element. */
export const PauseAudio = Command.define(
  'PauseAudio',
  CompletedPauseAudio,
)(
  Effect.sync(() => {
    readerAudio()?.pause()
    return CompletedPauseAudio()
  }),
)

/** Seeks the mounted reader audio element. */
export const SeekAudio = Command.define(
  'SeekAudio',
  { seconds: S.Number },
  CompletedSeekAudio,
)(({ seconds }) =>
  Effect.sync(() => {
    const element = readerAudio()
    if (element !== undefined) {
      element.currentTime = seconds
    }
    return CompletedSeekAudio()
  }),
)

const NavigateInternal = Command.define(
  'NavigateInternal',
  { url: S.String },
  CompletedNavigateInternal,
)(({ url }) => pushUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

const ReplaceInternal = Command.define(
  'ReplaceInternal',
  { url: S.String },
  CompletedNavigateInternal,
)(({ url }) => replaceUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

const LoadExternal = Command.define(
  'LoadExternal',
  { href: S.String },
  CompletedLoadExternal,
)(({ href }) => load(href).pipe(Effect.as(CompletedLoadExternal())))

const HistoryBack = Command.define(
  'HistoryBack',
  CompletedHistoryBack,
)(back().pipe(Effect.as(CompletedHistoryBack())))

const ScrollFollowLive = Command.define(
  'ScrollFollowLive',
  CompletedScrollCurrentWord,
)(
  Effect.sync(() => {
    document
      .querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'center', inline: 'nearest' })
    return CompletedScrollCurrentWord()
  }),
)

export const APPEARANCE_STORAGE_KEY = 'foldkit-books-appearance'

const appearanceFromHost = (): 'light' | 'dark' => {
  try {
    return localStorage.getItem(APPEARANCE_STORAGE_KEY) === 'dark'
      ? 'dark'
      : 'light'
  } catch {
    return 'light'
  }
}

let navigationDepth = 0
let pendingProgrammaticNavigation = false
let lastProgrammaticScrollAt = 0

const markProgrammaticNavigation = (): void => {
  pendingProgrammaticNavigation = true
}

const syncUrlCommand = (
  previous: Model,
  next: Model,
  mode: 'push' | 'replace',
): Command.Command<Message> | undefined => {
  const from = screenToPath(previous.screen)
  const to = screenToPath(next.screen)
  if (from === to) {
    return undefined
  }
  markProgrammaticNavigation()
  if (mode === 'push') {
    navigationDepth += 1
    return NavigateInternal({ url: to })
  }
  return ReplaceInternal({ url: to })
}

type Result = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const PROGRESS_SAVE_MS = 5000
let lastProgressSaveAt = 0

const progressFromPlay = (model: Model) => {
  if (model.play._tag === 'PlayIdle') {
    return undefined
  }
  const existing = progressForItem(model.progress, model.play.itemId)
  const item = itemById(model.items, model.play.itemId)
  const chapter =
    item === undefined
      ? Option.none()
      : chapterAt(item.chapters, model.play.mediaPosition)
  return {
    id: Option.isSome(existing)
      ? existing.value.id
      : `progress-${model.play.itemId}`,
    itemId: model.play.itemId,
    chapterId: Option.isSome(chapter)
      ? chapter.value.id
      : (item?.chapters[0]?.id ?? 'chapter-unknown'),
    renditionId: model.play.renditionId,
    relative: model.play.mediaPosition,
    finished: false,
    hidden: false,
    startedAt: Option.isSome(existing) ? existing.value.startedAt : 0,
    updatedAt: 0,
  }
}

/** Core update plus host audio, routing, and Instant Commands. */
export const update = (model: Model, message: Message): Result => {
  if (message._tag === 'ClickedLink') {
    return M.value(message.request).pipe(
      M.withReturnType<Result>(),
      M.tagsExhaustive({
        Internal: ({ url }) => {
          markProgrammaticNavigation()
          navigationDepth += 1
          return [model, [NavigateInternal({ url: urlToString(url) })]]
        },
        External: ({ href }) => [model, [LoadExternal({ href })]],
      }),
    )
  }
  if (message._tag === 'PressedGoBack' && navigationDepth > 0) {
    navigationDepth -= 1
    markProgrammaticNavigation()
    return [model, [HistoryBack()]]
  }
  if (
    message._tag === 'ScrolledAway' &&
    Date.now() - lastProgrammaticScrollAt < 150
  ) {
    return [model, []]
  }
  if (message._tag === 'ChangedUrl' && !pendingProgrammaticNavigation) {
    navigationDepth = Math.max(0, navigationDepth - 1)
  }
  pendingProgrammaticNavigation = false

  const [next, commands] = coreUpdate(model, message)
  const extra: Array<Command.Command<Message>> = []
  if (message._tag === 'CompletedScrollCurrentWord') {
    lastProgrammaticScrollAt = Date.now()
  }
  if (message._tag === 'PressedFollowLive') {
    extra.push(ScrollFollowLive())
  }
  if (
    message._tag === 'PressedStartPlayback' &&
    next.play._tag === 'PlayPlaying'
  ) {
    extra.push(SeekAudio({ seconds: next.play.mediaPosition }), PlayAudio())
  }
  if (
    message._tag === 'PressedResumePlayback' &&
    next.play._tag === 'PlayPlaying'
  ) {
    extra.push(PlayAudio())
  }
  if (
    message._tag === 'PressedPausePlayback' &&
    next.play._tag === 'PlayPaused'
  ) {
    extra.push(PauseAudio())
  }
  if (message._tag === 'PressedStopPlayback') {
    extra.push(PauseAudio())
  }
  if (message._tag === 'PressedSeekWord') {
    extra.push(SeekAudio({ seconds: message.start }))
  }
  if (message._tag === 'PressedOpenBookmark') {
    const bookmark = next.bookmarks.find(row => row.id === message.bookmarkId)
    if (bookmark !== undefined) {
      extra.push(SeekAudio({ seconds: bookmark.relative }))
    }
  }
  if (booksDatabase() !== undefined) {
    if (message._tag === 'PressedSignIn') {
      extra.push(SignInGuest())
    }
    if (message._tag === 'PressedSignOut') {
      extra.push(SignOutGuest())
    }
    if (message._tag === 'HeardSignedIn') {
      extra.push(LoadCatalog(), LoadUserData({ accountId: message.accountId }))
    }
    if (Option.isSome(next.accountId)) {
      const accountId = next.accountId.value
      if (
        message._tag === 'PressedPausePlayback' ||
        message._tag === 'PressedStopPlayback' ||
        message._tag === 'HeardAudioEnded' ||
        message._tag === 'HeardAudioPaused' ||
        message._tag === 'PressedSeekWord'
      ) {
        const row =
          progressFromPlay(next) ??
          next.progress.find(
            progress =>
              next.play._tag !== 'PlayIdle' &&
              progress.itemId === next.play.itemId,
          )
        if (row !== undefined) {
          extra.push(SaveProgress({ accountId, progress: row }))
        }
      }
      if (
        message._tag === 'HeardPlaybackPosition' &&
        next.play._tag === 'PlayPlaying'
      ) {
        const now = Date.now()
        if (now - lastProgressSaveAt >= PROGRESS_SAVE_MS) {
          lastProgressSaveAt = now
          const row = progressFromPlay(next)
          if (row !== undefined) {
            extra.push(SaveProgress({ accountId, progress: row }))
          }
        }
      }
      if (
        message._tag === 'PressedAddBookmark' &&
        next.bookmarks.length > model.bookmarks.length
      ) {
        const bookmark = next.bookmarks[next.bookmarks.length - 1]
        if (bookmark !== undefined) {
          extra.push(SaveBookmark({ accountId, bookmark }))
        }
      }
      if (message._tag === 'PressedDeleteBookmark') {
        extra.push(DeleteBookmark({ bookmarkId: message.bookmarkId }))
      }
      if (
        message._tag === 'PressedAddNote' &&
        next.notes.length > model.notes.length
      ) {
        const note = next.notes[next.notes.length - 1]
        if (note !== undefined) {
          extra.push(SaveNote({ accountId, note }))
        }
      }
      if (message._tag === 'PressedDeleteNote') {
        extra.push(DeleteNote({ noteId: message.noteId }))
      }
    }
  }
  const replaceTags = new Set([
    'PressedShowText',
    'PressedShowAudio',
    'PressedShowBoth',
    'PressedSignIn',
    'PressedSignOut',
    'PressedScanFinished',
    'HeardSignedIn',
    'PressedGoBack',
  ])
  const pushTags = new Set([
    'PressedOpenBook',
    'PressedOpenSearch',
    'PressedOpenSettings',
    'PressedOpenAccounts',
    'PressedOpenImport',
    'PressedOpenBookmark',
    'PressedOpenPlaybackReader',
  ])
  if (message._tag !== 'ChangedUrl' && message._tag !== 'OpenedNavigation') {
    const mode = replaceTags.has(message._tag)
      ? 'replace'
      : pushTags.has(message._tag)
        ? 'push'
        : undefined
    if (mode !== undefined) {
      const command = syncUrlCommand(model, next, mode)
      if (command !== undefined) {
        extra.push(command)
      }
    }
  }
  return [next, [...commands, ...extra]]
}

/** Foldkit host Program: Instant catalog when configured, local follow-along otherwise. */
export const BooksFoldkitProgram = Program.make({
  id: 'books',
  version: 4,
  Model,
  Message,
  init: (): Result => {
    const appearance = appearanceFromHost()
    const withAppearance = { ...initialModel, appearance }
    const target =
      typeof window === 'undefined'
        ? undefined
        : pathToNavigationTarget(window.location.href)
    return [
      target === undefined
        ? withAppearance
        : applyNavigationTarget(withAppearance, target),
      booksDatabase() === undefined ? [LoadFollowAlong()] : [RestoreSession()],
    ]
  },
  restore,
  update,
})

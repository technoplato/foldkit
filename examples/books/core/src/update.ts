import { Array, Match as M, Option } from 'effect'
import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import {
  Accounts,
  FollowAway,
  FollowLive,
  ImportIdle,
  ImportScanning,
  type Model,
  PlayIdle,
  PlayPaused,
  PlayPlaying,
  type Progress,
  ReaderAudio,
  ReaderBoth,
  ReaderText,
  Search,
  Settings,
  SignedOut,
  TitlePage,
  audioOfItem,
  chapterAt,
  chapterById,
  itemById,
  playOf,
  progressForItem,
  readerForItem,
  screenOf,
  shelfForItems,
  withAccount,
  withPlay,
  withView,
} from './model.js'
import { applyNavigationTarget, urlToNavigationTarget } from './route.js'

type Result = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const none = (model: Model): Result => [model, []]

const playPosition = (
  model: Model,
): Option.Option<{
  itemId: string
  renditionId: string
  mediaPosition: number
}> =>
  M.value(playOf(model)).pipe(
    M.withReturnType<
      Option.Option<{
        itemId: string
        renditionId: string
        mediaPosition: number
      }>
    >(),
    M.tagsExhaustive({
      PlayIdle: () => Option.none(),
      PlayPaused: play => Option.some(play),
      PlayPlaying: play => Option.some(play),
    }),
  )

const upsertProgress = (
  model: Model,
  itemId: string,
  renditionId: string,
  relative: number,
): ReadonlyArray<Progress> => {
  const maybeItem = itemById(model.items, itemId)
  const maybeChapter = Option.flatMap(maybeItem, item =>
    chapterAt(item.chapters, relative),
  )
  const chapterId = Option.match(maybeChapter, {
    onSome: chapter => chapter.id,
    onNone: () =>
      Option.match(
        Option.flatMap(maybeItem, item => Array.head(item.chapters)),
        {
          onSome: chapter => chapter.id,
          onNone: () => 'chapter-unknown',
        },
      ),
  })
  const existing = progressForItem(model.progress, itemId)
  if (Option.isSome(existing)) {
    return model.progress.map(row =>
      row.itemId === itemId
        ? {
            ...row,
            chapterId,
            renditionId,
            relative,
          }
        : row,
    )
  }
  return [
    ...model.progress,
    {
      id: `progress-${itemId}`,
      itemId,
      chapterId,
      renditionId,
      relative,
      finished: false,
      hidden: false,
      startedAt: 0,
      updatedAt: 0,
    },
  ]
}

const readerItemId = (model: Model): string | undefined =>
  M.value(screenOf(model)).pipe(
    M.withReturnType<string | undefined>(),
    M.tagsExhaustive({
      ReaderAudio: ({ itemId }) => itemId,
      ReaderBoth: ({ itemId }) => itemId,
      ReaderText: ({ itemId }) => itemId,
      TitlePage: ({ itemId }) => itemId,
      Accounts: () => undefined,
      ImportIdle: () => undefined,
      ImportScanning: () => undefined,
      Search: () => undefined,
      Settings: () => undefined,
      ShelfBrowse: () => undefined,
      ShelfEmpty: () => undefined,
      SharedNote: () => undefined,
      SignedOut: () => undefined,
    }),
  )

export const update = (model: Model, message: Message): Result =>
  M.value(message).pipe(
    M.withReturnType<Result>(),
    M.tagsExhaustive({
      PressedSignIn: () => [
        withView(model, { screen: shelfForItems(model.items) }),
        [],
      ],
      PressedSignOut: () => [
        {
          ...model,
          session: SignedOut(),
          bookmarks: [],
          notes: [],
          noteDraft: '',
          progress: [],
        },
        [],
      ],
      PressedOpenBook: ({ itemId }) => {
        const maybeItem = itemById(model.items, itemId)
        if (Option.isNone(maybeItem)) {
          return none(model)
        }
        return [
          withView(model, {
            screen: TitlePage({ itemId: maybeItem.value.id }),
          }),
          [],
        ]
      },
      PressedOpenChapter: ({ itemId, chapterId }) => {
        const maybeItem = itemById(model.items, itemId)
        if (Option.isNone(maybeItem)) {
          return none(model)
        }
        const item = maybeItem.value
        const chapter = chapterById(item.chapters, chapterId)
        if (Option.isNone(chapter)) {
          return none(model)
        }
        const start = chapter.value.start
        const audio = audioOfItem(item)
        if (Option.isNone(audio)) {
          return [
            {
              ...withView(model, { screen: readerForItem(item) }),
              follow: FollowLive(),
            },
            [],
          ]
        }
        const playing = playOf(model)
        const isPlayingThis =
          playing._tag === 'PlayPlaying' && playing.itemId === item.id
        const nextPlay = isPlayingThis
          ? PlayPlaying({
              itemId: item.id,
              renditionId: audio.value.audioId,
              mediaPosition: start,
            })
          : PlayPaused({
              itemId: item.id,
              renditionId: audio.value.audioId,
              mediaPosition: start,
            })
        return [
          {
            ...withView(model, { screen: readerForItem(item), play: nextPlay }),
            follow: FollowLive(),
            progress: upsertProgress(
              model,
              item.id,
              audio.value.audioId,
              start,
            ),
          },
          [],
        ]
      },
      PressedSetChapterSort: ({ sort }) => [
        { ...model, chapterSort: sort },
        [],
      ],
      PressedGoBack: () => {
        const itemId = readerItemId(model)
        if (itemId !== undefined && screenOf(model)._tag !== 'TitlePage') {
          return [withView(model, { screen: TitlePage({ itemId }) }), []]
        }
        return [withView(model, { screen: shelfForItems(model.items) }), []]
      },
      PressedShowText: () => {
        const itemId = readerItemId(model)
        if (itemId === undefined) {
          return none(model)
        }
        return [withView(model, { screen: ReaderText({ itemId }) }), []]
      },
      PressedShowAudio: () => {
        const itemId = readerItemId(model)
        if (itemId === undefined) {
          return none(model)
        }
        return [withView(model, { screen: ReaderAudio({ itemId }) }), []]
      },
      PressedShowBoth: () => {
        const itemId = readerItemId(model)
        if (itemId === undefined) {
          return none(model)
        }
        return [withView(model, { screen: ReaderBoth({ itemId }) }), []]
      },
      PressedOpenImport: () => [withView(model, { screen: ImportIdle() }), []],
      PressedScanShelf: () => [
        withView(model, { screen: ImportScanning() }),
        [],
      ],
      PressedScanFinished: () => [
        withView(model, { screen: shelfForItems(model.items) }),
        [],
      ],
      PressedOpenSettings: () => [withView(model, { screen: Settings() }), []],
      PressedOpenAccounts: () => [withView(model, { screen: Accounts() }), []],
      PressedOpenSearch: () => [
        withView(model, { screen: Search({ query: '' }) }),
        [],
      ],
      PressedSetQuery: ({ query }) => [
        withView(model, { screen: Search({ query }) }),
        [],
      ],
      PressedStartPlayback: ({ itemId }) => {
        const maybeItem = itemById(model.items, itemId)
        if (Option.isNone(maybeItem)) {
          return none(model)
        }
        const item = maybeItem.value
        const audio = audioOfItem(item)
        if (Option.isNone(audio)) {
          return none(model)
        }
        const saved = progressForItem(model.progress, itemId)
        const screen = screenOf(model)
        const fromCover =
          screen._tag === 'TitlePage' ||
          screen._tag === 'ShelfBrowse' ||
          screen._tag === 'ShelfEmpty'
        const nextPlay = PlayPlaying({
          itemId,
          renditionId: audio.value.audioId,
          mediaPosition: Option.isSome(saved) ? saved.value.relative : 0,
        })
        return [
          {
            ...withView(model, {
              play: nextPlay,
              screen: fromCover ? readerForItem(item) : screen,
            }),
            follow: fromCover ? FollowLive() : model.follow,
          },
          [],
        ]
      },
      PressedPausePlayback: () =>
        M.value(playOf(model)).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => none(model),
            PlayPaused: () => none(model),
            PlayPlaying: play => [
              {
                ...withPlay(
                  model,
                  PlayPaused({
                    itemId: play.itemId,
                    renditionId: play.renditionId,
                    mediaPosition: play.mediaPosition,
                  }),
                ),
                progress: upsertProgress(
                  model,
                  play.itemId,
                  play.renditionId,
                  play.mediaPosition,
                ),
              },
              [],
            ],
          }),
        ),
      PressedResumePlayback: () =>
        M.value(playOf(model)).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => none(model),
            PlayPlaying: () => none(model),
            PlayPaused: play => [
              withPlay(
                model,
                PlayPlaying({
                  itemId: play.itemId,
                  renditionId: play.renditionId,
                  mediaPosition: play.mediaPosition,
                }),
              ),
              [],
            ],
          }),
        ),
      PressedStopPlayback: () => {
        const playing = playPosition(model)
        if (Option.isNone(playing)) {
          return [withPlay(model, PlayIdle()), []]
        }
        return [
          {
            ...withPlay(model, PlayIdle()),
            progress: upsertProgress(
              model,
              playing.value.itemId,
              playing.value.renditionId,
              playing.value.mediaPosition,
            ),
          },
          [],
        ]
      },
      PressedOpenPlaybackReader: () =>
        M.value(playOf(model)).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => none(model),
            PlayPaused: ({ itemId }) => [
              withView(model, { screen: ReaderAudio({ itemId }) }),
              [],
            ],
            PlayPlaying: ({ itemId }) => [
              withView(model, { screen: ReaderAudio({ itemId }) }),
              [],
            ],
          }),
        ),
      PressedSeekWord: ({ start }) =>
        M.value(playOf(model)).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => {
              const itemId = readerItemId(model)
              const maybeItem =
                itemId === undefined
                  ? Option.none()
                  : itemById(model.items, itemId)
              if (Option.isNone(maybeItem)) {
                return none(model)
              }
              const item = maybeItem.value
              const audio = audioOfItem(item)
              if (Option.isNone(audio)) {
                return none(model)
              }
              return [
                {
                  ...withPlay(
                    model,
                    PlayPaused({
                      itemId: item.id,
                      renditionId: audio.value.audioId,
                      mediaPosition: start,
                    }),
                  ),
                  progress: upsertProgress(
                    model,
                    item.id,
                    audio.value.audioId,
                    start,
                  ),
                },
                [],
              ]
            },
            PlayPaused: play => [
              {
                ...withPlay(
                  model,
                  PlayPaused({ ...play, mediaPosition: start }),
                ),
                progress: upsertProgress(
                  model,
                  play.itemId,
                  play.renditionId,
                  start,
                ),
              },
              [],
            ],
            PlayPlaying: play => [
              {
                ...withPlay(
                  model,
                  PlayPlaying({ ...play, mediaPosition: start }),
                ),
                progress: upsertProgress(
                  model,
                  play.itemId,
                  play.renditionId,
                  start,
                ),
              },
              [],
            ],
          }),
        ),
      HeardPlaybackPosition: ({ mediaPosition }) =>
        M.value(playOf(model)).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => none(model),
            PlayPaused: play => [
              withPlay(model, PlayPaused({ ...play, mediaPosition })),
              [],
            ],
            PlayPlaying: play => [
              withPlay(model, PlayPlaying({ ...play, mediaPosition })),
              [],
            ],
          }),
        ),
      HeardAudioPlaying: ({ itemId, renditionId }) => {
        const playing = playOf(model)
        const mediaPosition =
          playing._tag === 'PlayIdle' || playing.itemId !== itemId
            ? 0
            : playing.mediaPosition
        return [
          withPlay(model, PlayPlaying({ itemId, renditionId, mediaPosition })),
          [],
        ]
      },
      HeardAudioPaused: () =>
        M.value(playOf(model)).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => none(model),
            PlayPaused: () => none(model),
            PlayPlaying: play => [
              {
                ...withPlay(
                  model,
                  PlayPaused({
                    itemId: play.itemId,
                    renditionId: play.renditionId,
                    mediaPosition: play.mediaPosition,
                  }),
                ),
                progress: upsertProgress(
                  model,
                  play.itemId,
                  play.renditionId,
                  play.mediaPosition,
                ),
              },
              [],
            ],
          }),
        ),
      HeardAudioEnded: () => {
        const playing = playPosition(model)
        if (Option.isNone(playing)) {
          return [withPlay(model, PlayIdle()), []]
        }
        return [
          {
            ...withPlay(model, PlayIdle()),
            progress: upsertProgress(
              model,
              playing.value.itemId,
              playing.value.renditionId,
              playing.value.mediaPosition,
            ),
          },
          [],
        ]
      },
      HeardFollowAlong: ({ itemId, body, words }) => [
        {
          ...model,
          items: model.items.map(item =>
            item.id === itemId ? { ...item, body, words } : item,
          ),
        },
        [],
      ],
      FailedFollowAlong: () => none(model),
      HeardSignedIn: ({ accountId }) => [
        withAccount(model, Option.some(accountId)),
        [],
      ],
      FailedSignIn: () => none(model),
      HeardCatalog: ({ items }) => {
        const screen = screenOf(model)
        const nextScreen =
          screen._tag === 'SignedOut'
            ? screen
            : screen._tag === 'ShelfEmpty' || screen._tag === 'ShelfBrowse'
              ? shelfForItems(items)
              : screen
        return [withView({ ...model, items }, { screen: nextScreen }), []]
      },
      FailedCatalog: () => none(model),
      HeardUserData: ({ bookmarks, notes, progress }) => [
        { ...model, bookmarks, notes, progress },
        [],
      ],
      PressedAddBookmark: () => {
        const playing = playPosition(model)
        if (Option.isNone(playing)) {
          return none(model)
        }
        const maybeItem = itemById(model.items, playing.value.itemId)
        const maybeChapter = Option.flatMap(maybeItem, item =>
          chapterAt(item.chapters, playing.value.mediaPosition),
        )
        const chapterId = Option.match(maybeChapter, {
          onSome: chapter => chapter.id,
          onNone: () =>
            Option.match(
              Option.flatMap(maybeItem, item => Array.head(item.chapters)),
              {
                onSome: chapter => chapter.id,
                onNone: () => 'chapter-unknown',
              },
            ),
        })
        const id = `bookmark-${playing.value.itemId}-${Math.floor(playing.value.mediaPosition * 1000)}`
        if (model.bookmarks.some(row => row.id === id)) {
          return none(model)
        }
        return [
          {
            ...model,
            bookmarks: [
              ...model.bookmarks,
              {
                id,
                itemId: playing.value.itemId,
                chapterId,
                renditionId: playing.value.renditionId,
                relative: playing.value.mediaPosition,
                createdAt: 0,
              },
            ],
          },
          [],
        ]
      },
      PressedOpenBookmark: ({ bookmarkId }) => {
        const bookmark = model.bookmarks.find(row => row.id === bookmarkId)
        if (bookmark === undefined) {
          return none(model)
        }
        const playing = playPosition(model)
        if (
          Option.isNone(playing) ||
          playing.value.itemId !== bookmark.itemId
        ) {
          return [
            withView(model, {
              screen: ReaderBoth({ itemId: bookmark.itemId }),
              play: PlayPaused({
                itemId: bookmark.itemId,
                renditionId: bookmark.renditionId,
                mediaPosition: bookmark.relative,
              }),
            }),
            [],
          ]
        }
        return [
          withPlay(
            model,
            playOf(model)._tag === 'PlayPlaying'
              ? PlayPlaying({
                  itemId: bookmark.itemId,
                  renditionId: bookmark.renditionId,
                  mediaPosition: bookmark.relative,
                })
              : PlayPaused({
                  itemId: bookmark.itemId,
                  renditionId: bookmark.renditionId,
                  mediaPosition: bookmark.relative,
                }),
          ),
          [],
        ]
      },
      PressedDeleteBookmark: ({ bookmarkId }) => [
        {
          ...model,
          bookmarks: model.bookmarks.filter(row => row.id !== bookmarkId),
        },
        [],
      ],
      UpdatedNoteDraft: ({ value }) => [{ ...model, noteDraft: value }, []],
      PressedAddNote: () => {
        const trimmed = model.noteDraft.trim()
        if (trimmed === '') {
          return none(model)
        }
        const itemId = readerItemId(model)
        if (itemId === undefined) {
          return none(model)
        }
        const playing = playPosition(model)
        const relative =
          Option.isSome(playing) && playing.value.itemId === itemId
            ? Option.some(playing.value.mediaPosition)
            : Option.none()
        const maybeItem = itemById(model.items, itemId)
        const chapter =
          Option.isNone(relative) || Option.isNone(maybeItem)
            ? Option.none()
            : chapterAt(maybeItem.value.chapters, relative.value)
        const id =
          globalThis.crypto !== undefined &&
          typeof globalThis.crypto.randomUUID === 'function'
            ? globalThis.crypto.randomUUID()
            : `note-${itemId}-${model.notes.length}`
        const lastSharePath =
          model.noteAudience === 'unlisted' &&
          globalThis.crypto !== undefined &&
          typeof globalThis.crypto.randomUUID === 'function'
            ? Option.some(`/n/${id}?s=${globalThis.crypto.randomUUID()}`)
            : Option.some(`/n/${id}`)
        return [
          {
            ...model,
            lastSharePath,
            noteDraft: '',
            notes: [
              ...model.notes,
              {
                id,
                itemId,
                body: trimmed,
                chapterId: Option.map(chapter, row => row.id),
                renditionId: Option.isSome(playing)
                  ? Option.some(playing.value.renditionId)
                  : Option.none(),
                relative,
                createdAt: 0,
                updatedAt: 0,
              },
            ],
          },
          [],
        ]
      },
      PressedDeleteNote: ({ noteId }) => [
        {
          ...model,
          notes: model.notes.filter(row => row.id !== noteId),
        },
        [],
      ],
      CompletedSaveProgress: () => none(model),
      FailedSaveProgress: () => none(model),
      CompletedSaveBookmark: () => none(model),
      FailedSaveBookmark: () => none(model),
      CompletedSaveNote: () => none(model),
      FailedSaveNote: () => none(model),
      CompletedSignOut: () => none(model),
      CompletedPlayAudio: () => none(model),
      CompletedPauseAudio: () => none(model),
      CompletedSeekAudio: () => none(model),
      CompletedScrollCurrentWord: () => none(model),
      ClickedLink: () => none(model),
      ChangedUrl: ({ url }) => [
        applyNavigationTarget(model, urlToNavigationTarget(url)),
        [],
      ],
      OpenedNavigation: ({ target }) => [
        applyNavigationTarget(model, target),
        [],
      ],
      CompletedNavigateInternal: () => none(model),
      CompletedLoadExternal: () => none(model),
      CompletedHistoryBack: () => none(model),
      PressedToggleAppearance: () => [
        {
          ...model,
          appearance: model.appearance === 'light' ? 'dark' : 'light',
        },
        [],
      ],
      PressedFollowLive: () => [{ ...model, follow: FollowLive() }, []],
      ScrolledAway: () =>
        model.follow._tag === 'FollowAway'
          ? none(model)
          : [{ ...model, follow: FollowAway() }, []],
      PressedSetNoteAudience: ({ audience }) => [
        { ...model, noteAudience: audience },
        [],
      ],
      PressedCopySharePath: () => none(model),
      HeardSharedNote: ({ note }) => [{ ...model, sharedNote: note }, []],
      FailedSharedNote: () => [{ ...model, sharedNote: Option.none() }, []],
    }),
  )

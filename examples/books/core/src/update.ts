import { Match as M, Option } from 'effect'
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
  chapterAt,
  itemById,
  progressForItem,
  readerForItem,
  shelfForItems,
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
  M.value(model.play).pipe(
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
  const item = itemById(model.items, itemId)
  const chapter =
    item === undefined ? Option.none() : chapterAt(item.chapters, relative)
  const chapterId = Option.isSome(chapter)
    ? chapter.value.id
    : (item?.chapters[0]?.id ?? 'chapter-unknown')
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
  M.value(model.screen).pipe(
    M.withReturnType<string | undefined>(),
    M.tagsExhaustive({
      ReaderAudio: ({ itemId }) => itemId,
      ReaderBoth: ({ itemId }) => itemId,
      ReaderText: ({ itemId }) => itemId,
      Accounts: () => undefined,
      ImportIdle: () => undefined,
      ImportScanning: () => undefined,
      Search: () => undefined,
      Settings: () => undefined,
      ShelfBrowse: () => undefined,
      ShelfEmpty: () => undefined,
      SignedOut: () => undefined,
    }),
  )

export const update = (model: Model, message: Message): Result =>
  M.value(message).pipe(
    M.withReturnType<Result>(),
    M.tagsExhaustive({
      PressedSignIn: () => [
        { ...model, screen: shelfForItems(model.items) },
        [],
      ],
      PressedSignOut: () => [
        {
          ...model,
          screen: SignedOut(),
          play: PlayIdle(),
          accountId: Option.none(),
          bookmarks: [],
          notes: [],
          noteDraft: '',
          progress: [],
        },
        [],
      ],
      PressedOpenBook: ({ itemId }) => {
        const item = itemById(model.items, itemId)
        if (item === undefined) {
          return none(model)
        }
        return [
          { ...model, screen: readerForItem(item), follow: FollowLive() },
          [],
        ]
      },
      PressedGoBack: () => [
        { ...model, screen: shelfForItems(model.items) },
        [],
      ],
      PressedShowText: () => {
        const itemId = readerItemId(model)
        if (itemId === undefined) {
          return none(model)
        }
        return [{ ...model, screen: ReaderText({ itemId }) }, []]
      },
      PressedShowAudio: () => {
        const itemId = readerItemId(model)
        if (itemId === undefined) {
          return none(model)
        }
        return [{ ...model, screen: ReaderAudio({ itemId }) }, []]
      },
      PressedShowBoth: () => {
        const itemId = readerItemId(model)
        if (itemId === undefined) {
          return none(model)
        }
        return [{ ...model, screen: ReaderBoth({ itemId }) }, []]
      },
      PressedOpenImport: () => [{ ...model, screen: ImportIdle() }, []],
      PressedScanShelf: () => [{ ...model, screen: ImportScanning() }, []],
      PressedScanFinished: () => [
        { ...model, screen: shelfForItems(model.items) },
        [],
      ],
      PressedOpenSettings: () => [{ ...model, screen: Settings() }, []],
      PressedOpenAccounts: () => [{ ...model, screen: Accounts() }, []],
      PressedOpenSearch: () => [
        { ...model, screen: Search({ query: '' }) },
        [],
      ],
      PressedSetQuery: ({ query }) => [
        { ...model, screen: Search({ query }) },
        [],
      ],
      PressedStartPlayback: ({ itemId }) => {
        const item = itemById(model.items, itemId)
        if (item === undefined || Option.isNone(item.audioId)) {
          return none(model)
        }
        const saved = progressForItem(model.progress, itemId)
        return [
          {
            ...model,
            play: PlayPlaying({
              itemId,
              renditionId: item.audioId.value,
              mediaPosition: Option.isSome(saved) ? saved.value.relative : 0,
            }),
          },
          [],
        ]
      },
      PressedPausePlayback: () =>
        M.value(model.play).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => none(model),
            PlayPaused: () => none(model),
            PlayPlaying: play => [
              {
                ...model,
                play: PlayPaused({
                  itemId: play.itemId,
                  renditionId: play.renditionId,
                  mediaPosition: play.mediaPosition,
                }),
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
        M.value(model.play).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => none(model),
            PlayPlaying: () => none(model),
            PlayPaused: play => [
              {
                ...model,
                play: PlayPlaying({
                  itemId: play.itemId,
                  renditionId: play.renditionId,
                  mediaPosition: play.mediaPosition,
                }),
              },
              [],
            ],
          }),
        ),
      PressedStopPlayback: () => {
        const playing = playPosition(model)
        if (Option.isNone(playing)) {
          return [{ ...model, play: PlayIdle() }, []]
        }
        return [
          {
            ...model,
            play: PlayIdle(),
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
        M.value(model.play).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => none(model),
            PlayPaused: ({ itemId }) => [
              { ...model, screen: ReaderAudio({ itemId }) },
              [],
            ],
            PlayPlaying: ({ itemId }) => [
              { ...model, screen: ReaderAudio({ itemId }) },
              [],
            ],
          }),
        ),
      PressedSeekWord: ({ start }) =>
        M.value(model.play).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => {
              const itemId = readerItemId(model)
              const item =
                itemId === undefined ? undefined : itemById(model.items, itemId)
              if (item === undefined || Option.isNone(item.audioId)) {
                return none(model)
              }
              return [
                {
                  ...model,
                  play: PlayPaused({
                    itemId: item.id,
                    renditionId: item.audioId.value,
                    mediaPosition: start,
                  }),
                  progress: upsertProgress(
                    model,
                    item.id,
                    item.audioId.value,
                    start,
                  ),
                },
                [],
              ]
            },
            PlayPaused: play => [
              {
                ...model,
                play: PlayPaused({ ...play, mediaPosition: start }),
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
                ...model,
                play: PlayPlaying({ ...play, mediaPosition: start }),
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
        M.value(model.play).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => none(model),
            PlayPaused: play => [
              {
                ...model,
                play: PlayPaused({ ...play, mediaPosition }),
              },
              [],
            ],
            PlayPlaying: play => [
              {
                ...model,
                play: PlayPlaying({ ...play, mediaPosition }),
              },
              [],
            ],
          }),
        ),
      HeardAudioPlaying: ({ itemId, renditionId }) => {
        const mediaPosition =
          model.play._tag === 'PlayIdle' || model.play.itemId !== itemId
            ? 0
            : model.play.mediaPosition
        return [
          {
            ...model,
            play: PlayPlaying({ itemId, renditionId, mediaPosition }),
          },
          [],
        ]
      },
      HeardAudioPaused: () =>
        M.value(model.play).pipe(
          M.withReturnType<Result>(),
          M.tagsExhaustive({
            PlayIdle: () => none(model),
            PlayPaused: () => none(model),
            PlayPlaying: play => [
              {
                ...model,
                play: PlayPaused({
                  itemId: play.itemId,
                  renditionId: play.renditionId,
                  mediaPosition: play.mediaPosition,
                }),
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
          return [{ ...model, play: PlayIdle() }, []]
        }
        return [
          {
            ...model,
            play: PlayIdle(),
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
        {
          ...model,
          accountId: Option.some(accountId),
          screen:
            model.screen._tag === 'SignedOut'
              ? shelfForItems(model.items)
              : model.screen,
        },
        [],
      ],
      FailedSignIn: () => none(model),
      HeardCatalog: ({ items }) => [
        {
          ...model,
          items,
          screen:
            model.screen._tag === 'SignedOut'
              ? model.screen
              : model.screen._tag === 'ShelfEmpty' ||
                  model.screen._tag === 'ShelfBrowse'
                ? shelfForItems(items)
                : model.screen,
        },
        [],
      ],
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
        const item = itemById(model.items, playing.value.itemId)
        const chapter =
          item === undefined
            ? Option.none()
            : chapterAt(item.chapters, playing.value.mediaPosition)
        const chapterId = Option.isSome(chapter)
          ? chapter.value.id
          : (item?.chapters[0]?.id ?? 'chapter-unknown')
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
            {
              ...model,
              play: PlayPaused({
                itemId: bookmark.itemId,
                renditionId: bookmark.renditionId,
                mediaPosition: bookmark.relative,
              }),
              screen: ReaderBoth({ itemId: bookmark.itemId }),
            },
            [],
          ]
        }
        return [
          {
            ...model,
            play:
              model.play._tag === 'PlayPlaying'
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
          },
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
        const item = itemById(model.items, itemId)
        const chapter =
          Option.isNone(relative) || item === undefined
            ? Option.none()
            : chapterAt(item.chapters, relative.value)
        const id = `note-${itemId}-${model.notes.length}`
        return [
          {
            ...model,
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
    }),
  )

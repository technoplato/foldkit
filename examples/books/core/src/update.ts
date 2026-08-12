import { Match as M, Option } from 'effect'
import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import {
  Accounts,
  ImportIdle,
  ImportScanning,
  PlayIdle,
  PlayPaused,
  PlayPlaying,
  ReaderAudio,
  ReaderBoth,
  ReaderText,
  Search,
  Settings,
  SignedOut,
  itemById,
  readerForItem,
  shelfForItems,
  type Model,
} from './model.js'

type Result = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const none = (model: Model): Result => [model, []]

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
        { ...model, screen: SignedOut(), play: PlayIdle() },
        [],
      ],
      PressedOpenBook: ({ itemId }) => {
        const item = itemById(model.items, itemId)
        if (item === undefined) {
          return none(model)
        }
        return [{ ...model, screen: readerForItem(item) }, []]
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
        return [
          {
            ...model,
            play: PlayPlaying({
              itemId,
              renditionId: item.audioId.value,
              mediaPosition: 0,
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
      PressedStopPlayback: () => [{ ...model, play: PlayIdle() }, []],
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
            PlayIdle: () => none(model),
            PlayPaused: play => [
              {
                ...model,
                play: PlayPaused({ ...play, mediaPosition: start }),
              },
              [],
            ],
            PlayPlaying: play => [
              {
                ...model,
                play: PlayPlaying({ ...play, mediaPosition: start }),
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
              },
              [],
            ],
          }),
        ),
      HeardAudioEnded: () => [{ ...model, play: PlayIdle() }, []],
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
      CompletedPlayAudio: () => none(model),
      CompletedPauseAudio: () => none(model),
      CompletedSeekAudio: () => none(model),
      CompletedScrollCurrentWord: () => none(model),
    }),
  )

import { Array, Match as M, String as Str } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import type * as Command from 'foldkit/command'

import {
  Bookmark,
  ExcerptNone,
  OtherCapture,
  Unsaved,
  Video,
  classifyDeterministic,
  displayTitle,
  mapClassifierOutput,
} from './domain/index.js'
import { type Message } from './message.js'
import {
  All,
  CaptureIdle,
  Confirming,
  DeletingIdle,
  Drafting,
  Idle,
  LibraryEmpty,
  LibraryPopulated,
  type Model,
  Only,
  Searching,
  failedNotice,
  findBookmark,
  nextBookmarkId,
  succeededNotice,
  withBookmark,
  withLibrary,
  withLooking,
  withoutNotice,
} from './model.js'

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const lookingOfQuery = (query: string) =>
  Str.isEmpty(query)
    ? Idle()
    : Searching.make({ query: NonEmptyString.make(query) })

const classifyText = (model: Model, text: string) => {
  if (model.classifier._tag === 'WasmReady') {
    return mapClassifierOutput(text)
  }
  return classifyDeterministic(text)
}

const titleOf = (text: string): string => {
  const line = text.split('\n')[0] ?? text
  if (Str.isEmpty(line)) {
    return 'Untitled'
  }
  return line.slice(0, 80)
}

/** Applies one Ingest Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedCaptureOther: () => [
        {
          ...model,
          capture: Drafting.make({ text: '' }),
          notice: model.notice,
        },
        [],
      ],
      ClickedCaptureVideo: () => {
        if (model.videoTool._tag === 'Missing') {
          return [
            failedNotice(
              model,
              'yt-dlp missing',
              'Video saves need a local yt-dlp. The screen still paints.',
            ),
            [],
          ]
        }
        return [
          {
            ...model,
            capture: Drafting.make({ text: '' }),
          },
          [],
        ]
      },
      ClickedCaptureX: () => {
        if (model.xSession._tag === 'Signed') {
          return [
            succeededNotice(
              model,
              'X bookmarks pending',
              'Signed-in session is not scraped in this build.',
            ),
            [],
          ]
        }
        if (model.xSession._tag === 'Pending') {
          return [
            failedNotice(
              model,
              'X session pending',
              'The screen still paints.',
            ),
            [],
          ]
        }
        return [
          failedNotice(
            model,
            'X session unsigned',
            'Chrome is not signed in. The screen still paints.',
          ),
          [],
        ]
      },
      TypedDraft: typed => {
        if (model.capture._tag !== 'Drafting') {
          return [model, []]
        }
        return [
          {
            ...model,
            capture: Drafting.make({ text: typed.text }),
          },
          [],
        ]
      },
      AppliedDraft: () => {
        if (
          model.capture._tag !== 'Drafting' ||
          Str.isEmpty(model.capture.text)
        ) {
          return [model, []]
        }
        const text = model.capture.text
        const bookmark = Bookmark.make({
          id: nextBookmarkId(model.library),
          title: NonEmptyString.make(titleOf(text)),
          excerpt: ExcerptNone(),
          category: classifyText(model, text),
          source: OtherCapture.make({ note: NonEmptyString.make(text) }),
        })
        return [
          succeededNotice(
            {
              ...withBookmark(model, bookmark),
              capture: CaptureIdle(),
            },
            'Captured',
            displayTitle(bookmark),
          ),
          [],
        ]
      },
      CancelledDraft: () => [
        {
          ...model,
          capture: CaptureIdle(),
        },
        [],
      ],
      TypedSearch: typed => [
        withLooking(model, lookingOfQuery(typed.query)),
        [],
      ],
      ClearedSearch: () => [withLooking(model, Idle()), []],
      DismissedNotice: () => [withoutNotice(model), []],
      RequestedDelete: requested => {
        if (model.library._tag !== 'Populated') {
          return [model, []]
        }
        const found = findBookmark(model.library.items, requested.bookmarkId)
        if (found._tag === 'None') {
          return [model, []]
        }
        return [
          withLibrary(
            model,
            LibraryPopulated.make({
              items: model.library.items,
              looking: model.library.looking,
              deleting: Confirming.make({ bookmark: found.value }),
            }),
          ),
          [],
        ]
      },
      CancelledDelete: () => {
        if (model.library._tag !== 'Populated') {
          return [model, []]
        }
        return [
          withLibrary(
            model,
            LibraryPopulated.make({
              items: model.library.items,
              looking: model.library.looking,
              deleting: DeletingIdle(),
            }),
          ),
          [],
        ]
      },
      ConfirmedDelete: () => {
        if (
          model.library._tag !== 'Populated' ||
          model.library.deleting._tag !== 'Confirming'
        ) {
          return [model, []]
        }
        const removedId = model.library.deleting.bookmark.id
        const remaining = Array.filter(
          model.library.items,
          item => item.id !== removedId,
        )
        const library = Array.match(remaining, {
          onEmpty: () => LibraryEmpty.make({ looking: model.library.looking }),
          onNonEmpty: items =>
            LibraryPopulated.make({
              items,
              looking: model.library.looking,
              deleting: DeletingIdle(),
            }),
        })
        return [succeededNotice(withLibrary(model, library), 'Deleted'), []]
      },
      ClearedFilter: () => [
        {
          ...model,
          filter: All(),
        },
        [],
      ],
      ChoseFilter: chose => [
        {
          ...model,
          filter: Only.make({ category: mapClassifierOutput(chose.category) }),
        },
        [],
      ],
    }),
  )

export { Video, Unsaved }

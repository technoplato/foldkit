import {
  type Item,
  type Message,
  type Model,
  PressedGoBack,
  PressedOpenAccounts,
  PressedOpenBook,
  PressedOpenImport,
  PressedOpenPlaybackReader,
  PressedOpenSearch,
  PressedOpenSettings,
  PressedPausePlayback,
  PressedResumePlayback,
  PressedScanFinished,
  PressedScanShelf,
  PressedShowAudio,
  PressedShowBoth,
  PressedShowText,
  PressedSignIn,
  PressedSignOut,
  PressedStartPlayback,
  PressedStopPlayback,
  itemById,
} from 'books-core-example'
import { Match as M, Option } from 'effect'
import { Document, html } from 'foldkit/html'

import { Button } from '@foldkit/ui'

const h = html<Message>()

const buttonStyle =
  'bg-zinc-800 text-amber-100 hover:bg-zinc-700 px-3 py-2 rounded border border-zinc-600'
const primaryStyle =
  'bg-amber-500 text-zinc-950 hover:bg-amber-400 px-3 py-2 rounded'

const action = (label: string, message: Message, primary = false) =>
  Button.view<Message>({
    onClick: message,
    toView: attributes =>
      h.button(
        [...attributes.button, h.Class(primary ? primaryStyle : buttonStyle)],
        [label],
      ),
  })

const itemCard = (item: Item) =>
  h.button(
    [
      h.Class(
        'w-full text-left border border-zinc-700 rounded p-3 hover:border-amber-500',
      ),
      h.OnClick(PressedOpenBook({ itemId: item.id })),
    ],
    [
      h.div([h.Class('font-semibold')], [item.title]),
      h.div([h.Class('text-zinc-400 text-sm')], [item.authorLabel]),
    ],
  )

const chrome = (body: ReadonlyArray<ReturnType<typeof h.div>>) =>
  h.div(
    [h.Class('min-h-screen bg-zinc-950 text-amber-50 p-6 max-w-xl mx-auto')],
    body,
  )

const playBar = (model: Model) =>
  M.value(model.play).pipe(
    M.withReturnType<ReturnType<typeof h.div>>(),
    M.tagsExhaustive({
      PlayIdle: () =>
        h.div([h.Class('text-zinc-500 text-sm mt-8')], ['playIdle']),
      PlayPaused: play => {
        const item = itemById(model.items, play.itemId)
        return h.div(
          [h.Class('mt-8 flex flex-wrap gap-2 items-center')],
          [
            action('Resume', PressedResumePlayback()),
            action('Stop', PressedStopPlayback()),
            action('Open audio', PressedOpenPlaybackReader()),
            h.span(
              [h.Class('text-sm text-zinc-400')],
              [`${item?.title ?? play.itemId} paused`],
            ),
          ],
        )
      },
      PlayPlaying: play => {
        const item = itemById(model.items, play.itemId)
        return h.div(
          [h.Class('mt-8 flex flex-wrap gap-2 items-center')],
          [
            action('Pause', PressedPausePlayback()),
            action('Stop', PressedStopPlayback()),
            action('Open audio', PressedOpenPlaybackReader()),
            h.span(
              [h.Class('text-sm text-zinc-400')],
              [`${item?.title ?? play.itemId} playing`],
            ),
          ],
        )
      },
    }),
  )

const signedInNav = () =>
  h.div(
    [h.Class('flex flex-wrap gap-2 mb-6')],
    [
      action('Import', PressedOpenImport()),
      action('Search', PressedOpenSearch()),
      action('People', PressedOpenAccounts()),
      action('Settings', PressedOpenSettings()),
      action('Sign out', PressedSignOut()),
    ],
  )

export const view = (model: Model): Document => {
  const body = M.value(model.screen).pipe(
    M.withReturnType<ReturnType<typeof h.div>>(),
    M.tagsExhaustive({
      SignedOut: () =>
        chrome([
          h.h1([h.Class('text-2xl font-semibold mb-4')], ['Books']),
          h.p(
            [h.Class('text-zinc-400 mb-6')],
            ['Self-hosted shelves. Sign in to open them.'],
          ),
          action('Sign in', PressedSignIn(), true),
        ]),
      ShelfEmpty: () =>
        chrome([
          signedInNav(),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Home']),
          h.p([h.Class('text-zinc-400')], ['No books on this shelf.']),
        ]),
      ShelfBrowse: () =>
        chrome([
          signedInNav(),
          h.h1([h.Class('text-2xl font-semibold mb-4')], ['Home']),
          h.div(
            [h.Class('grid gap-3')],
            model.items.map(item => itemCard(item)),
          ),
          playBar(model),
        ]),
      ReaderText: ({ itemId }) => readerView(model, itemId, 'text'),
      ReaderAudio: ({ itemId }) => readerView(model, itemId, 'audio'),
      ReaderBoth: ({ itemId }) => readerView(model, itemId, 'both'),
      ImportIdle: () =>
        chrome([
          signedInNav(),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Import']),
          h.p(
            [h.Class('text-zinc-400 mb-4')],
            ['/media/books · watch on'],
          ),
          action('Scan shelf', PressedScanShelf(), true),
          action('Back', PressedGoBack()),
        ]),
      ImportScanning: () =>
        chrome([
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Scanning']),
          h.p(
            [h.Class('text-zinc-400 mb-4')],
            ['Host creates file, book, rendition, and item rows.'],
          ),
          action('Done', PressedScanFinished()),
        ]),
      Settings: () =>
        chrome([
          signedInNav(),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Settings']),
          h.p(
            [h.Class('text-zinc-400 mb-4')],
            [`Speech rate ${model.speechRate} · highlight ≤ 50 ms`],
          ),
          action('Back', PressedGoBack()),
        ]),
      Accounts: () =>
        chrome([
          signedInNav(),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['People']),
          h.p([h.Class('text-zinc-400 mb-4')], ['michael · root · on']),
          action('Back', PressedGoBack()),
        ]),
      Search: ({ query }) =>
        chrome([
          signedInNav(),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Search']),
          h.p([h.Class('text-zinc-400 mb-4')], [query === '' ? 'No query' : query]),
          h.div(
            [h.Class('grid gap-3')],
            model.items
              .filter(
                item =>
                  query === '' ||
                  item.title.toLowerCase().includes(query.toLowerCase()),
              )
              .map(item => itemCard(item)),
          ),
          action('Back', PressedGoBack()),
        ]),
    }),
  )

  return { title: 'Books', body }
}

const readerView = (
  model: Model,
  itemId: string,
  pane: 'text' | 'audio' | 'both',
) => {
  const item = itemById(model.items, itemId)
  return chrome([
    signedInNav(),
    h.h1(
      [h.Class('text-2xl font-semibold mb-2')],
      [item?.title ?? itemId],
    ),
    h.p([h.Class('text-zinc-400 mb-2')], [item?.authorLabel ?? '']),
    h.p([h.Class('mb-4')], [item?.body ?? '']),
    h.p(
      [h.Class('text-zinc-500 text-sm mb-4')],
      [
        pane === 'both'
          ? 'two rendition ids · never one body both'
          : pane,
      ],
    ),
    h.div(
      [h.Class('flex flex-wrap gap-2')],
      [
        action('Text', PressedShowText()),
        action('Audio', PressedShowAudio()),
        action('Both', PressedShowBoth()),
        item && Option.isSome(item.audioId)
          ? action('Play', PressedStartPlayback({ itemId }))
          : h.span([], []),
        action('Back', PressedGoBack()),
      ],
    ),
    playBar(model),
  ])
}

import {
  type Item,
  type Message,
  type Model,
  type Word,
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
  PressedSeekWord,
  PressedShowAudio,
  PressedShowBoth,
  PressedShowText,
  PressedSignIn,
  PressedSignOut,
  PressedStartPlayback,
  PressedStopPlayback,
  itemById,
  wordAt,
} from 'books-core-example'
import { Match as M, Option } from 'effect'
import { Document, type Html, html } from 'foldkit/html'

import { Button } from '@foldkit/ui'

import { ObserveReaderAudio, ScrollCurrentWord } from './audio-clock.js'

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

const chrome = (body: ReadonlyArray<Html>) =>
  h.div(
    [h.Class('min-h-screen bg-zinc-950 text-amber-50 p-6 max-w-4xl mx-auto')],
    body,
  )

const formatTime = (seconds: number): string => {
  const rounded = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

const playBar = (model: Model) =>
  M.value(model.play).pipe(
    M.withReturnType<Html>(),
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
              [
                `${item?.title ?? play.itemId} paused · ${formatTime(play.mediaPosition)}`,
              ],
            ),
          ],
        )
      },
      PlayPlaying: play => {
        const item = itemById(model.items, play.itemId)
        const current = item === undefined
          ? Option.none()
          : wordAt(item.words, play.mediaPosition)
        return h.div(
          [h.Class('mt-8 flex flex-wrap gap-2 items-center')],
          [
            action('Pause', PressedPausePlayback()),
            action('Stop', PressedStopPlayback()),
            action('Open audio', PressedOpenPlaybackReader()),
            h.span(
              [h.Class('text-sm text-zinc-400')],
              [
                `${item?.title ?? play.itemId} playing · ${formatTime(play.mediaPosition)}${
                  Option.isSome(current) ? ` · ${current.value.text}` : ''
                }`,
              ],
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

const wordButton = (word: Word, maybeCurrentId: Option.Option<string>) => {
  const isCurrent =
    Option.isSome(maybeCurrentId) && maybeCurrentId.value === word.id
  const attributes = [
    h.Type('button'),
    h.Key(word.id),
    h.AriaLabel(word.text),
    h.Class(
      isCurrent
        ? 'bg-amber-500 text-zinc-950 rounded-sm px-0.5 mx-0.5'
        : 'px-0.5 mx-0.5 hover:bg-zinc-800 rounded-sm',
    ),
    h.OnClick(PressedSeekWord({ start: word.start })),
    ...(isCurrent
      ? [h.AriaCurrent('true'), h.OnMount(ScrollCurrentWord())]
      : []),
  ]
  return h.button(attributes, [word.text])
}

const transcriptView = (item: Item, mediaPosition: number) => {
  if (item.words.length === 0) {
    return h.p([h.Class('leading-7')], [item.body])
  }
  const maybeCurrent = wordAt(item.words, mediaPosition)
  const maybeCurrentId = Option.map(maybeCurrent, word => word.id)
  return h.p(
    [h.Class('leading-8 text-lg max-h-[28rem] overflow-y-auto')],
    item.words.map(word => wordButton(word, maybeCurrentId)),
  )
}

const mediaPositionFor = (model: Model, itemId: string): number => {
  if (model.play._tag === 'PlayIdle' || model.play.itemId !== itemId) {
    return 0
  }
  return model.play.mediaPosition
}

const activeAudioItem = (model: Model): Item | undefined => {
  if (model.play._tag !== 'PlayIdle') {
    return itemById(model.items, model.play.itemId)
  }
  return M.value(model.screen).pipe(
    M.withReturnType<Item | undefined>(),
    M.tagsExhaustive({
      ReaderAudio: ({ itemId }) => itemById(model.items, itemId),
      ReaderBoth: ({ itemId }) => itemById(model.items, itemId),
      ReaderText: ({ itemId }) => itemById(model.items, itemId),
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
}

const readerAudio = (item: Item) => {
  if (Option.isNone(item.audioUrl) || Option.isNone(item.audioId)) {
    return h.span([], [])
  }
  return h.audio(
    [
      h.Id('books-reader-audio'),
      h.Key(item.id),
      h.Class('w-full mt-4'),
      h.Controls(true),
      h.Preload('auto'),
      h.OnMount(
        ObserveReaderAudio({
          itemId: item.id,
          renditionId: item.audioId.value,
          src: item.audioUrl.value,
        }),
      ),
    ],
    [],
  )
}

export const view = (model: Model): Document => {
  const body = M.value(model.screen).pipe(
    M.withReturnType<Html>(),
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
          audioHost(model),
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

const audioHost = (model: Model) => {
  const item = activeAudioItem(model)
  if (item === undefined || Option.isNone(item.audioUrl)) {
    return h.span([], [])
  }
  return readerAudio(item)
}

const readerView = (
  model: Model,
  itemId: string,
  pane: 'text' | 'audio' | 'both',
) => {
  const item = itemById(model.items, itemId)
  const position = mediaPositionFor(model, itemId)
  const transcript =
    item === undefined
      ? h.p([], [itemId])
      : transcriptView(item, position)
  const panes =
    pane === 'both'
      ? h.div(
          [h.Class('grid gap-4 md:grid-cols-2 mb-4')],
          [
            h.section(
              [h.Class('border border-zinc-700 rounded p-3')],
              [
                h.h2([h.Class('text-sm text-zinc-400 mb-2')], ['Text']),
                transcript,
              ],
            ),
            h.section(
              [h.Class('border border-zinc-700 rounded p-3')],
              [
                h.h2([h.Class('text-sm text-zinc-400 mb-2')], ['Audio']),
                h.p(
                  [h.Class('text-zinc-500 text-sm')],
                  [
                    'Press play on the audio bar. Words highlight as Tolle reads. Same timeline · two rendition ids.',
                  ],
                ),
              ],
            ),
          ],
        )
      : h.div(
          [h.Class('mb-4')],
          [
            transcript,
            h.p(
              [h.Class('text-zinc-500 text-sm mt-2')],
              [pane],
            ),
          ],
        )
  return chrome([
    signedInNav(),
    h.h1(
      [h.Class('text-2xl font-semibold mb-2')],
      [item?.title ?? itemId],
    ),
    h.p([h.Class('text-zinc-400 mb-2')], [item?.authorLabel ?? '']),
    panes,
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
    audioHost(model),
  ])
}

import {
  BookAudioTarget,
  BookBothTarget,
  BookTextTarget,
  ImportTarget,
  type Item,
  type Message,
  type Model,
  type NoteAudience,
  OpenedNavigation,
  PeopleTarget,
  PressedAddBookmark,
  PressedAddNote,
  PressedDeleteBookmark,
  PressedDeleteNote,
  PressedFollowLive,
  PressedGoBack,
  PressedOpenAccounts,
  PressedOpenBook,
  PressedOpenBookmark,
  PressedOpenImport,
  PressedOpenSearch,
  PressedOpenSettings,
  PressedPausePlayback,
  PressedResumePlayback,
  PressedScanFinished,
  PressedScanShelf,
  PressedSeekWord,
  PressedSetNoteAudience,
  PressedSetQuery,
  PressedShowAudio,
  PressedShowBoth,
  PressedShowText,
  PressedSignIn,
  PressedSignOut,
  PressedStartPlayback,
  PressedToggleAppearance,
  ScrolledAway,
  SearchTarget,
  SettingsTarget,
  ShelfTarget,
  UpdatedNoteDraft,
  type Word,
  chapterAt,
  itemById,
  navigationTargetToPath,
  progressForItem,
  wordAt,
} from 'books-core-example'
import { Match as M, Option } from 'effect'
import { Document, type Html, html } from 'foldkit/html'

import { Button } from '@foldkit/ui'

import { ObserveReaderAudio, ScrollCurrentWord } from './audio-clock.js'

const h = html<Message>()

const formatTime = (seconds: number): string => {
  const rounded = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

const durationOf = (item: Item): number => {
  const lastChapter = item.chapters[item.chapters.length - 1]
  if (lastChapter !== undefined) {
    return lastChapter.end
  }
  const lastWord = item.words[item.words.length - 1]
  return lastWord?.end ?? 0
}

const mediaPositionFor = (model: Model, itemId: string): number => {
  if (model.play._tag === 'PlayIdle' || model.play.itemId !== itemId) {
    return 0
  }
  return model.play.mediaPosition
}

const quietLink = (href: string, label: string, message: Message) =>
  h.a(
    [
      h.Href(href),
      h.Class('text-sm text-[var(--muted)] hover:text-[var(--fg)]'),
      h.OnClick(message),
    ],
    [label],
  )

const signedInNav = (model: Model) =>
  h.div(
    [h.Class('flex flex-wrap items-center gap-x-4 gap-y-2 mb-4')],
    [
      h.button(
        [
          h.Type('button'),
          h.Class('text-sm text-[var(--muted)] hover:text-[var(--fg)]'),
          h.OnClick(PressedGoBack()),
        ],
        ['Back'],
      ),
      quietLink(
        navigationTargetToPath(ShelfTarget.make({})),
        'Shelf',
        OpenedNavigation({ target: ShelfTarget.make({}) }),
      ),
      h.div(
        [h.Class('ml-auto flex flex-wrap items-center gap-x-3 gap-y-1')],
        [
          quietLink(
            navigationTargetToPath(SearchTarget.make({})),
            'Search',
            PressedOpenSearch(),
          ),
          quietLink(
            navigationTargetToPath(PeopleTarget.make({})),
            'People',
            PressedOpenAccounts(),
          ),
          quietLink(
            navigationTargetToPath(ImportTarget.make({})),
            'Import',
            PressedOpenImport(),
          ),
          quietLink(
            navigationTargetToPath(SettingsTarget.make({})),
            'Settings',
            PressedOpenSettings(),
          ),
          h.button(
            [
              h.Type('button'),
              h.AriaLabel('Toggle appearance'),
              h.Class(
                'text-sm text-[var(--muted)] hover:text-[var(--fg)] px-1',
              ),
              h.OnClick(PressedToggleAppearance()),
            ],
            [model.appearance === 'light' ? 'Dark' : 'Light'],
          ),
          h.button(
            [
              h.Type('button'),
              h.Class('text-sm text-[var(--muted)] hover:text-[var(--fg)]'),
              h.OnClick(PressedSignOut()),
            ],
            ['Sign out'],
          ),
        ],
      ),
    ],
  )

const coverImage = (item: Item, className: string) =>
  Option.isSome(item.coverUrl)
    ? h.img([h.Class(className), h.Src(item.coverUrl.value), h.Alt('')])
    : h.div(
        [
          h.Class(
            `${className} bg-[var(--border)] flex items-center justify-center text-[var(--muted)] text-xs`,
          ),
        ],
        [item.title.slice(0, 1)],
      )

const itemCard = (model: Model, item: Item) => {
  const saved = progressForItem(model.progress, item.id)
  const href = navigationTargetToPath(BookBothTarget.make({ itemId: item.id }))
  return h.a(
    [
      h.Href(href),
      h.Class(
        'block rounded-2xl bg-[var(--card)] border border-[var(--border)] p-3 hover:shadow-md transition-shadow',
      ),
      h.OnClick(PressedOpenBook({ itemId: item.id })),
    ],
    [
      coverImage(item, 'w-full aspect-[3/4] object-cover rounded-xl mb-3'),
      h.div([h.Class('font-semibold leading-snug')], [item.title]),
      h.div(
        [h.Class('text-[var(--muted)] text-sm mt-0.5')],
        [item.authorLabel],
      ),
      Option.isSome(saved)
        ? h.div(
            [h.Class('text-xs text-[var(--accent)] mt-1')],
            [`Resume ${formatTime(saved.value.relative)}`],
          )
        : h.span([], []),
    ],
  )
}

const chrome = (model: Model, body: ReadonlyArray<Html>) =>
  h.div(
    [
      h.Class('books-shell min-h-screen'),
      h.DataAttribute('theme', model.appearance),
    ],
    [h.div([h.Class('max-w-6xl mx-auto px-4 py-4 sm:px-6')], body)],
  )

const playToggle = (model: Model, item: Item) => {
  if (Option.isNone(item.audioId)) {
    return h.span([], [])
  }
  if (model.play._tag === 'PlayPlaying' && model.play.itemId === item.id) {
    return h.button(
      [
        h.Type('button'),
        h.AriaLabel('Pause'),
        h.Class('player-btn player-btn-primary'),
        h.OnClick(PressedPausePlayback()),
      ],
      ['Pause'],
    )
  }
  if (model.play._tag === 'PlayPaused' && model.play.itemId === item.id) {
    return h.button(
      [
        h.Type('button'),
        h.AriaLabel('Play'),
        h.Class('player-btn player-btn-primary'),
        h.OnClick(PressedResumePlayback()),
      ],
      ['Play'],
    )
  }
  return h.button(
    [
      h.Type('button'),
      h.AriaLabel('Play'),
      h.Class('player-btn player-btn-primary'),
      h.OnClick(PressedStartPlayback({ itemId: item.id })),
    ],
    ['Play'],
  )
}

const playerChrome = (model: Model, item: Item) => {
  const position = mediaPositionFor(model, item.id)
  const duration = durationOf(item)
  const skipBack = PressedSeekWord({ start: Math.max(0, position - 15) })
  const skipForward = PressedSeekWord({
    start: duration > 0 ? Math.min(duration, position + 15) : position + 15,
  })
  return h.header(
    [h.Class('player-chrome sticky top-0 z-20')],
    [
      h.div(
        [h.Class('flex items-center gap-3')],
        [
          coverImage(item, 'h-12 w-9 object-cover rounded shrink-0'),
          h.div(
            [h.Class('min-w-0 flex-1')],
            [
              h.div([h.Class('font-semibold truncate text-sm')], [item.title]),
              h.div(
                [h.Class('text-[var(--muted)] text-xs truncate')],
                [item.authorLabel],
              ),
            ],
          ),
          h.div(
            [h.Class('flex items-center gap-1 shrink-0')],
            [
              h.button(
                [
                  h.Type('button'),
                  h.AriaLabel('Skip back 15 seconds'),
                  h.Class('player-btn'),
                  h.OnClick(skipBack),
                ],
                ['-15'],
              ),
              playToggle(model, item),
              h.button(
                [
                  h.Type('button'),
                  h.AriaLabel('Skip forward 15 seconds'),
                  h.Class('player-btn'),
                  h.OnClick(skipForward),
                ],
                ['+15'],
              ),
            ],
          ),
          h.span(
            [h.Class('text-xs tabular-nums text-[var(--muted)] shrink-0')],
            [
              `${formatTime(position)}${
                duration > 0 ? ` / ${formatTime(duration)}` : ''
              }`,
            ],
          ),
        ],
      ),
      h.input([
        h.Type('range'),
        h.Class('player-scrubber'),
        h.Min('0'),
        h.Max(String(Math.max(duration, position, 1))),
        h.Step('0.1'),
        h.Value(String(position)),
        h.AriaLabel('Playback position'),
        h.OnInput(value => PressedSeekWord({ start: Number(value) })),
      ]),
      model.follow._tag === 'FollowAway'
        ? h.button(
            [
              h.Type('button'),
              h.Class('text-xs text-[var(--accent)] mt-1'),
              h.OnClick(PressedFollowLive()),
            ],
            ['Jump to live'],
          )
        : h.span([], []),
    ],
  )
}

const wordButton = (
  word: Word,
  maybeCurrentId: Option.Option<string>,
  followLive: boolean,
) => {
  const isCurrent =
    Option.isSome(maybeCurrentId) && maybeCurrentId.value === word.id
  const attributes = [
    h.Type('button'),
    h.Key(word.id),
    h.AriaLabel(word.text),
    h.Class(isCurrent ? 'word-pill word-pill-current' : 'word-pill'),
    h.OnClick(PressedSeekWord({ start: word.start })),
    ...(isCurrent && followLive
      ? [h.AriaCurrent('true'), h.OnMount(ScrollCurrentWord())]
      : isCurrent
        ? [h.AriaCurrent('true')]
        : []),
  ]
  return h.button(attributes, [word.text])
}

const transcriptView = (model: Model, item: Item, mediaPosition: number) => {
  const currentChapter = chapterAt(item.chapters, mediaPosition)
  const heading = Option.isSome(currentChapter)
    ? h.h2(
        [h.Class('text-xl font-semibold mb-4')],
        [currentChapter.value.title],
      )
    : h.span([], [])
  if (item.words.length === 0) {
    return h.div([], [heading, h.p([h.Class('leading-7')], [item.body])])
  }
  const maybeCurrent = wordAt(item.words, mediaPosition)
  const maybeCurrentId = Option.map(maybeCurrent, word => word.id)
  return h.div(
    [],
    [
      heading,
      h.div(
        [
          h.Class('transcript-scroller'),
          h.OnScroll(_scrollTop => ScrolledAway()),
        ],
        item.words.map(word =>
          wordButton(word, maybeCurrentId, model.follow._tag === 'FollowLive'),
        ),
      ),
    ],
  )
}

const audienceButton = (model: Model, audience: NoteAudience, label: string) =>
  h.button(
    [
      h.Type('button'),
      h.AriaPressed(model.noteAudience === audience ? 'true' : 'false'),
      h.Class(
        model.noteAudience === audience
          ? 'text-xs rounded-full px-2 py-1 bg-[var(--fg)] text-[var(--bg)]'
          : 'text-xs rounded-full px-2 py-1 text-[var(--muted)] border border-[var(--border)]',
      ),
      h.OnClick(PressedSetNoteAudience({ audience })),
    ],
    [label],
  )

const notesPanel = (model: Model, itemId: string) => {
  const rows = model.notes.filter(row => row.itemId === itemId)
  return h.aside(
    [h.Class('notes-panel')],
    [
      h.h2([h.Class('text-sm font-semibold mb-2')], ['Note']),
      h.form(
        [h.Class('grid gap-2'), h.OnSubmit(PressedAddNote())],
        [
          h.textarea(
            [
              h.Class('note-draft'),
              h.Placeholder('Write a note'),
              h.AriaLabel('Note'),
              h.Value(model.noteDraft),
              h.OnInput(value => UpdatedNoteDraft({ value })),
            ],
            [model.noteDraft],
          ),
          h.div(
            [h.Class('flex flex-wrap gap-1')],
            [
              audienceButton(model, 'public', 'Public'),
              audienceButton(model, 'unlisted', 'Unlisted'),
              audienceButton(model, 'private', 'Private'),
            ],
          ),
          Button.view<Message>({
            type: 'submit',
            toView: attributes =>
              h.button(
                [
                  ...attributes.button,
                  h.Class('player-btn player-btn-primary'),
                ],
                ['Add note'],
              ),
          }),
        ],
      ),
      rows.length === 0
        ? h.p([h.Class('text-[var(--muted)] text-sm mt-3')], ['None yet.'])
        : h.div(
            [h.Class('grid gap-2 mt-3')],
            rows.map(note =>
              h.div(
                [h.Class('flex gap-2 items-start'), h.Key(note.id)],
                [
                  h.p([h.Class('flex-1 text-sm')], [note.body]),
                  h.button(
                    [
                      h.Type('button'),
                      h.Class('text-[var(--muted)] text-xs'),
                      h.OnClick(PressedDeleteNote({ noteId: note.id })),
                    ],
                    ['Remove'],
                  ),
                ],
              ),
            ),
          ),
    ],
  )
}

const bookmarkList = (model: Model, itemId: string) => {
  const rows = model.bookmarks.filter(row => row.itemId === itemId)
  return h.section(
    [h.Class('mt-4')],
    [
      h.h2([h.Class('text-sm font-semibold mb-2')], ['Bookmarks']),
      rows.length === 0
        ? h.p([h.Class('text-[var(--muted)] text-sm')], ['None yet.'])
        : h.div(
            [h.Class('grid gap-1')],
            rows.map(bookmark =>
              h.div(
                [h.Class('flex gap-2 items-center'), h.Key(bookmark.id)],
                [
                  h.button(
                    [
                      h.Type('button'),
                      h.Class(
                        'text-left flex-1 text-sm hover:text-[var(--accent)]',
                      ),
                      h.OnClick(
                        PressedOpenBookmark({ bookmarkId: bookmark.id }),
                      ),
                    ],
                    [formatTime(bookmark.relative)],
                  ),
                  h.button(
                    [
                      h.Type('button'),
                      h.Class('text-[var(--muted)] text-xs'),
                      h.OnClick(
                        PressedDeleteBookmark({ bookmarkId: bookmark.id }),
                      ),
                    ],
                    ['Remove'],
                  ),
                ],
              ),
            ),
          ),
    ],
  )
}

const paneLinks = (itemId: string) =>
  h.div(
    [h.Class('flex gap-3 text-xs text-[var(--muted)] mb-3')],
    [
      h.a(
        [
          h.Href(navigationTargetToPath(BookTextTarget.make({ itemId }))),
          h.OnClick(PressedShowText()),
        ],
        ['Text'],
      ),
      h.a(
        [
          h.Href(navigationTargetToPath(BookAudioTarget.make({ itemId }))),
          h.OnClick(PressedShowAudio()),
        ],
        ['Audio'],
      ),
      h.a(
        [
          h.Href(navigationTargetToPath(BookBothTarget.make({ itemId }))),
          h.OnClick(PressedShowBoth()),
        ],
        ['Both'],
      ),
      h.button(
        [
          h.Type('button'),
          h.Class('hover:text-[var(--fg)]'),
          h.OnClick(PressedAddBookmark()),
        ],
        ['Bookmark'],
      ),
    ],
  )

const readerAudio = (item: Item) => {
  if (Option.isNone(item.audioUrl) || Option.isNone(item.audioId)) {
    return h.span([], [])
  }
  return h.audio(
    [
      h.Id('books-reader-audio'),
      h.Key(item.id),
      h.Class('books-audio-host'),
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

const audioHost = (model: Model) => {
  const item = activeAudioItem(model)
  if (item === undefined || Option.isNone(item.audioUrl)) {
    return h.span([], [])
  }
  return readerAudio(item)
}

const followFab = (model: Model) =>
  model.follow._tag === 'FollowAway'
    ? h.button(
        [
          h.Type('button'),
          h.Class('follow-fab'),
          h.AriaLabel('Scroll to current word'),
          h.OnClick(PressedFollowLive()),
        ],
        ['Scroll to current word'],
      )
    : h.span([], [])

const readerView = (model: Model, itemId: string) => {
  const item = itemById(model.items, itemId)
  const position = mediaPositionFor(model, itemId)
  const transcript =
    item === undefined
      ? h.p([], [itemId])
      : transcriptView(model, item, position)
  return chrome(model, [
    signedInNav(model),
    item === undefined ? h.span([], []) : playerChrome(model, item),
    paneLinks(itemId),
    h.div(
      [h.Class('reader-layout')],
      [h.main([h.Class('min-w-0')], [transcript]), notesPanel(model, itemId)],
    ),
    bookmarkList(model, itemId),
    followFab(model),
    audioHost(model),
  ])
}

export const view = (model: Model): Document => {
  const body = M.value(model.screen).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      SignedOut: () =>
        chrome(model, [
          h.h1([h.Class('text-2xl font-semibold mb-4')], ['Books']),
          h.p(
            [h.Class('text-[var(--muted)] mb-6')],
            ['Self-hosted shelves. Sign in to open them.'],
          ),
          Button.view<Message>({
            onClick: PressedSignIn(),
            toView: attributes =>
              h.button(
                [
                  ...attributes.button,
                  h.Class('player-btn player-btn-primary'),
                ],
                ['Sign in'],
              ),
          }),
          h.div(
            [h.Class('mt-6')],
            [
              h.button(
                [
                  h.Type('button'),
                  h.AriaLabel('Toggle appearance'),
                  h.Class('text-sm text-[var(--muted)]'),
                  h.OnClick(PressedToggleAppearance()),
                ],
                [model.appearance === 'light' ? 'Dark' : 'Light'],
              ),
            ],
          ),
        ]),
      ShelfEmpty: () =>
        chrome(model, [
          signedInNav(model),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Shelf']),
          h.p([h.Class('text-[var(--muted)]')], ['No books on this shelf.']),
          audioHost(model),
        ]),
      ShelfBrowse: () =>
        chrome(model, [
          signedInNav(model),
          h.h1([h.Class('text-2xl font-semibold mb-4')], ['Shelf']),
          h.div(
            [h.Class('grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4')],
            model.items.map(item => itemCard(model, item)),
          ),
          audioHost(model),
        ]),
      ReaderText: ({ itemId }) => readerView(model, itemId),
      ReaderAudio: ({ itemId }) => readerView(model, itemId),
      ReaderBoth: ({ itemId }) => readerView(model, itemId),
      ImportIdle: () =>
        chrome(model, [
          signedInNav(model),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Import']),
          h.p(
            [h.Class('text-[var(--muted)] mb-4')],
            ['/media/books · watch on'],
          ),
          Button.view<Message>({
            onClick: PressedScanShelf(),
            toView: attributes =>
              h.button(
                [
                  ...attributes.button,
                  h.Class('player-btn player-btn-primary'),
                ],
                ['Scan shelf'],
              ),
          }),
        ]),
      ImportScanning: () =>
        chrome(model, [
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Scanning']),
          h.p(
            [h.Class('text-[var(--muted)] mb-4')],
            ['Host creates file, book, rendition, and item rows.'],
          ),
          Button.view<Message>({
            onClick: PressedScanFinished(),
            toView: attributes =>
              h.button([...attributes.button, h.Class('player-btn')], ['Done']),
          }),
        ]),
      Settings: () =>
        chrome(model, [
          signedInNav(model),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Settings']),
          h.p(
            [h.Class('text-[var(--muted)] mb-4')],
            [`Speech rate ${model.speechRate} · highlight ≤ 50 ms`],
          ),
        ]),
      Accounts: () =>
        chrome(model, [
          signedInNav(model),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['People']),
          h.p([h.Class('text-[var(--muted)] mb-4')], ['michael · root · on']),
        ]),
      Search: ({ query }) =>
        chrome(model, [
          signedInNav(model),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Search']),
          h.input([
            h.Class('note-draft mb-4'),
            h.Placeholder('Search titles'),
            h.AriaLabel('Search'),
            h.Value(query),
            h.OnInput(value => PressedSetQuery({ query: value })),
          ]),
          h.p(
            [h.Class('text-[var(--muted)] mb-4')],
            [query === '' ? 'No query' : query],
          ),
          h.div(
            [h.Class('grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4')],
            model.items
              .filter(
                item =>
                  query === '' ||
                  item.title.toLowerCase().includes(query.toLowerCase()),
              )
              .map(item => itemCard(model, item)),
          ),
        ]),
    }),
  )

  return { title: 'Books', body }
}

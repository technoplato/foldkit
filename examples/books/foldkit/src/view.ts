import {
  BookAudioTarget,
  BookBothTarget,
  BookTextTarget,
  BookTitleTarget,
  ImportTarget,
  type Item,
  type Message,
  type Model,
  type NoteAudience,
  OpenedNavigation,
  PeopleTarget,
  PressedAddBookmark,
  PressedAddNote,
  PressedCopySharePath,
  PressedDeleteBookmark,
  PressedDeleteNote,
  PressedFollowLive,
  PressedGoBack,
  PressedOpenAccounts,
  PressedOpenBook,
  PressedOpenBookmark,
  PressedOpenChapter,
  PressedOpenImport,
  PressedOpenSearch,
  PressedOpenSettings,
  PressedPausePlayback,
  PressedResumePlayback,
  PressedScanFinished,
  PressedScanShelf,
  PressedSeekWord,
  PressedSetChapterSort,
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
  audioOfItem,
  chapterAt,
  chapterDuration,
  continueListeningItem,
  durationOfItem,
  formatClock,
  itemById,
  navigationTargetToPath,
  playOf,
  progressForItem,
  screenOf,
  sortedChapters,
  wordAt,
} from 'books-core-example'
import { Match as M, Option } from 'effect'
import { Document, type Html, html } from 'foldkit/html'

import { Button } from '@foldkit/ui'

import { ObserveReaderAudio, ScrollCurrentWord } from './audio-clock.js'

const h = html<Message>()

const findItem = (model: Model, itemId: string): Item | undefined =>
  Option.getOrUndefined(itemById(model.items, itemId))

const formatTime = formatClock

const durationOf = durationOfItem

const mediaPositionFor = (model: Model, itemId: string): number => {
  const play = playOf(model)
  if (play._tag === 'PlayIdle' || play.itemId !== itemId) {
    return 0
  }
  return play.mediaPosition
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
  const href = navigationTargetToPath(BookTitleTarget.make({ itemId: item.id }))
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

const chapterHeadline = (item: Item, position: number): string => {
  const current = chapterAt(item.chapters, position)
  if (Option.isSome(current)) {
    return current.value.title
  }
  return item.title
}

const heroResumePosition = (
  model: Model,
  item: Item,
  saved: ReturnType<typeof progressForItem>,
): number => {
  const play = playOf(model)
  if (play._tag !== 'PlayIdle' && play.itemId === item.id) {
    return play.mediaPosition
  }
  if (Option.isSome(saved)) {
    return saved.value.relative
  }
  return 0
}

const playOrContinueLabel = (model: Model, item: Item): string => {
  const saved = progressForItem(model.progress, item.id)
  if (Option.isSome(saved) && saved.value.relative > 0) {
    return 'Continue'
  }
  return 'Play'
}

const continueHero = (model: Model) => {
  const maybeItem = continueListeningItem(
    model.items,
    model.progress,
    playOf(model),
  )
  if (Option.isNone(maybeItem)) {
    return h.span([], [])
  }
  const item = maybeItem.value
  const saved = progressForItem(model.progress, item.id)
  const href = navigationTargetToPath(BookTitleTarget.make({ itemId: item.id }))
  const position = heroResumePosition(model, item, saved)
  return h.section(
    [
      h.Class(
        'mb-8 rounded-3xl bg-[var(--card)] border border-[var(--border)] p-4 sm:p-6',
      ),
    ],
    [
      h.p(
        [h.Class('text-xs uppercase tracking-wide text-[var(--muted)] mb-3')],
        ['Continue Listening'],
      ),
      h.div(
        [h.Class('flex gap-4 sm:gap-6 items-center')],
        [
          h.a(
            [
              h.Href(href),
              h.Class('shrink-0'),
              h.OnClick(PressedOpenBook({ itemId: item.id })),
            ],
            [
              coverImage(
                item,
                'h-36 w-[6.75rem] object-cover rounded-xl shadow-md',
              ),
            ],
          ),
          h.div(
            [h.Class('min-w-0 flex-1')],
            [
              h.a(
                [
                  h.Href(href),
                  h.Class('block'),
                  h.OnClick(PressedOpenBook({ itemId: item.id })),
                ],
                [
                  h.div(
                    [h.Class('text-xl font-semibold leading-snug')],
                    [item.title],
                  ),
                  h.div(
                    [h.Class('text-[var(--muted)] mt-1')],
                    [item.authorLabel],
                  ),
                ],
              ),
              h.div(
                [h.Class('text-sm text-[var(--accent)] mt-2')],
                [`Resume ${formatTime(position)}`],
              ),
              Option.isNone(audioOfItem(item))
                ? h.span([], [])
                : h.button(
                    [
                      h.Type('button'),
                      h.Class('player-btn player-btn-primary mt-3'),
                      h.OnClick(PressedStartPlayback({ itemId: item.id })),
                    ],
                    ['Continue'],
                  ),
            ],
          ),
        ],
      ),
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
  if (Option.isNone(audioOfItem(item))) {
    return h.span([], [])
  }
  const play = playOf(model)
  if (play._tag === 'PlayPlaying' && play.itemId === item.id) {
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
  if (play._tag === 'PlayPaused' && play.itemId === item.id) {
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
    [playOrContinueLabel(model, item)],
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
              h.div(
                [h.Class('font-semibold truncate text-sm')],
                [chapterHeadline(item, position)],
              ),
              h.div(
                [h.Class('text-[var(--muted)] text-xs truncate')],
                [item.title],
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
          Option.isSome(model.lastSharePath)
            ? h.div(
                [h.Class('flex flex-wrap items-center gap-2 mt-1')],
                [
                  h.code(
                    [h.Class('text-xs text-[var(--muted)] break-all')],
                    [model.lastSharePath.value],
                  ),
                  h.button(
                    [
                      h.Type('button'),
                      h.Class('text-xs text-[var(--accent)]'),
                      h.OnClick(PressedCopySharePath()),
                    ],
                    ['Copy'],
                  ),
                ],
              )
            : h.span([], []),
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
  const audio = audioOfItem(item)
  if (Option.isNone(audio) || Option.isNone(audio.value.audioUrl)) {
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
          renditionId: audio.value.audioId,
          src: audio.value.audioUrl.value,
        }),
      ),
    ],
    [],
  )
}

const activeAudioItem = (model: Model): Item | undefined => {
  const play = playOf(model)
  if (play._tag !== 'PlayIdle') {
    return findItem(model, play.itemId)
  }
  return M.value(screenOf(model)).pipe(
    M.withReturnType<Item | undefined>(),
    M.tagsExhaustive({
      ReaderAudio: ({ itemId }) => findItem(model, itemId),
      ReaderBoth: ({ itemId }) => findItem(model, itemId),
      ReaderText: ({ itemId }) => findItem(model, itemId),
      TitlePage: () => undefined,
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
}

const audioHost = (model: Model) => {
  const item = activeAudioItem(model)
  if (item === undefined) {
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

const titlePageView = (model: Model, itemId: string) => {
  const item = findItem(model, itemId)
  if (item === undefined) {
    return chrome(model, [
      signedInNav(model),
      h.p([h.Class('text-[var(--muted)]')], [itemId]),
      audioHost(model),
    ])
  }
  const duration = durationOf(item)
  return chrome(model, [
    signedInNav(model),
    h.article(
      [h.Class('max-w-2xl mx-auto')],
      [
        h.div(
          [h.Class('flex flex-col sm:flex-row gap-6 sm:gap-8 items-start')],
          [
            coverImage(
              item,
              'w-48 max-w-[40%] aspect-[3/4] object-cover rounded-2xl shadow-lg',
            ),
            h.div(
              [h.Class('min-w-0 flex-1')],
              [
                h.h1(
                  [h.Class('text-3xl font-semibold leading-tight')],
                  [item.title],
                ),
                h.p(
                  [h.Class('text-[var(--muted)] mt-2 text-lg')],
                  [item.authorLabel],
                ),
                h.p(
                  [h.Class('text-sm text-[var(--muted)] mt-3')],
                  [duration > 0 ? formatTime(duration) : ''],
                ),
                h.div([h.Class('mt-5')], [playToggle(model, item)]),
              ],
            ),
          ],
        ),
        h.div(
          [h.Class('flex items-baseline justify-between mt-10 mb-2')],
          [
            h.h2(
              [h.Class('text-sm font-semibold uppercase tracking-wide')],
              ['Chapters'],
            ),
            h.div(
              [h.Class('flex gap-2 text-xs')],
              [
                h.button(
                  [
                    h.Type('button'),
                    h.Class(
                      model.chapterSort === 'Index'
                        ? 'text-[var(--fg)] font-semibold'
                        : 'text-[var(--muted)]',
                    ),
                    h.OnClick(PressedSetChapterSort({ sort: 'Index' })),
                  ],
                  ['Index'],
                ),
                h.button(
                  [
                    h.Type('button'),
                    h.Class(
                      model.chapterSort === 'Title'
                        ? 'text-[var(--fg)] font-semibold'
                        : 'text-[var(--muted)]',
                    ),
                    h.OnClick(PressedSetChapterSort({ sort: 'Title' })),
                  ],
                  ['Title'],
                ),
              ],
            ),
          ],
        ),
        h.div(
          [h.Class('divide-y divide-[var(--border)]')],
          sortedChapters(item, model.chapterSort).map(chapter =>
            h.button(
              [
                h.Type('button'),
                h.Key(chapter.id),
                h.Class(
                  'chapter-row w-full flex items-baseline gap-3 py-3 text-left hover:text-[var(--accent)]',
                ),
                h.OnClick(
                  PressedOpenChapter({
                    itemId: item.id,
                    chapterId: chapter.id,
                  }),
                ),
              ],
              [
                h.span(
                  [h.Class('text-xs tabular-nums text-[var(--muted)] w-8')],
                  [String(chapter.index)],
                ),
                h.span([h.Class('flex-1 min-w-0')], [chapter.title]),
                h.span(
                  [h.Class('text-xs tabular-nums text-[var(--muted)]')],
                  [formatTime(chapterDuration(chapter))],
                ),
              ],
            ),
          ),
        ),
      ],
    ),
    audioHost(model),
  ])
}

const readerView = (model: Model, itemId: string) => {
  const item = findItem(model, itemId)
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
  const body = M.value(screenOf(model)).pipe(
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
          continueHero(model),
          h.h1([h.Class('text-2xl font-semibold mb-4')], ['Shelf']),
          h.div(
            [h.Class('grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4')],
            model.items.map(item => itemCard(model, item)),
          ),
          audioHost(model),
        ]),
      TitlePage: ({ itemId }) => titlePageView(model, itemId),
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
      SharedNote: ({ noteId }) =>
        chrome(model, [
          signedInNav(model),
          h.h1([h.Class('text-2xl font-semibold mb-2')], ['Shared note']),
          Option.isSome(model.sharedNote)
            ? h.article(
                [
                  h.Class(
                    'rounded-2xl bg-[var(--card)] border border-[var(--border)] p-4',
                  ),
                ],
                [
                  h.p(
                    [h.Class('text-sm whitespace-pre-wrap')],
                    [model.sharedNote.value.body],
                  ),
                ],
              )
            : h.p(
                [h.Class('text-[var(--muted)]')],
                [`Note ${noteId} is not available.`],
              ),
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

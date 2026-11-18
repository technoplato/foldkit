import {
  Array,
  Match as M,
  Option,
  Record as Record_,
  Schema as S,
} from 'effect'
import { Interaction, Navigation } from 'foldkit'
import {
  type ListItem,
  type ListNode,
  type UiNode,
  buttonsOf,
  textsOf,
  transcriptsOf,
} from 'foldkit/renderers'
import {
  ReachedPlace,
  ReceivedPassages,
  WordId,
} from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import { App, type AppMessage, type AppModel } from './app.js'
import {
  BookmarksListingJson,
  bookmarkCountsOf,
  bookmarkPathOf,
  bookmarksListingLines,
  bookmarksListingOf,
  excerptAround,
  excerptLineOf,
} from './bookmarks.js'
import { BookmarkId, ChapterNumber, Milliseconds, TitleSlug } from './ids.js'
import { LibraryWrite } from './library.js'
import {
  MarkedMoment,
  OpenedPlace,
  ReceivedChapters,
  ReceivedShelf,
} from './message.js'
import { type Bookmark, Shelf } from './model.js'
import { sampleChapters, sampleShelf } from './sample.js'
import { addressCueOfModel } from './subscriptions.js'

const minuteMs = 60_000

const lanternKeeper = TitleSlug.make('the-lantern-keeper')

const heardFromMs = Date.UTC(2026, 9, 18, 19, 0, 0)

const wordMs = 400

const paragraphs = [
  'By the time the survey party reached the pass the snow had closed the lower road and Ilse counted the mules twice',
  'She set the plane table on the one flat stone and waited for the light',
]

const passageStartMs = 20 * minuteMs + 30_000

const passages = Array.map(paragraphs, (text, paragraph) => {
  const startMs = passageStartMs + paragraph * 60_000
  const words = Array.map(text.split(' '), (word, at) => ({
    wordId: WordId.make(`w-${paragraph.toString()}-${at.toString()}`),
    text: word,
    startMs: Milliseconds.make(startMs + at * wordMs),
    endMs: Milliseconds.make(startMs + at * wordMs + wordMs - 40),
  }))
  return {
    passageId: `p-${paragraph.toString()}`,
    startMs: Milliseconds.make(startMs),
    endMs: Milliseconds.make(startMs + words.length * wordMs),
    words,
  }
})

type Written = Readonly<{ name: string; args: unknown }>

const bindApp = (shelf: typeof Shelf.Type = sampleShelf) => {
  let model: AppModel = Array.reduce(
    Record_.toEntries(sampleChapters),
    App.update(App.init()[0], ReceivedShelf({ shelf }))[0],
    (current, [slug, chapters]) =>
      App.update(
        current,
        ReceivedChapters({ slug: TitleSlug.make(slug), chapters }),
      )[0],
  )
  const written: Array<Written> = []
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: AppMessage) => {
      const [next, commands] = App.update(model, message)
      model = next
      Array.forEach(commands, command => {
        written.push({ name: command.name, args: command.args })
      })
      Option.map(addressCueOfModel(model), cue => {
        handle.send(OpenedPlace(cue))
      })
    },
    stop: () => Promise.resolve(),
  }
  return { bound: Interaction.bind(App, handle), send: handle.send, written }
}

type Bound = ReturnType<typeof bindApp>['bound']

const uriOf = (bound: Bound) => Option.map(bound.navigation(), plan => plan.uri)

const playingAt = (placeMs: number, shelf: typeof Shelf.Type = sampleShelf) => {
  const app = bindApp(shelf)
  app.bound.press(`Listen:${lanternKeeper}`)
  app.send(ReceivedPassages({ passages }))
  app.send(
    ReachedPlace({
      placeMs: Milliseconds.make(placeMs),
      wallClockMs: heardFromMs,
    }),
  )
  return app
}

const WrittenWrite = S.Struct({ write: S.toType(LibraryWrite) })

const writesOf = (written: ReadonlyArray<Written>): ReadonlyArray<unknown> =>
  Array.map(
    Array.filter(
      Array.map(
        Array.filter(written, command => command.name === 'WriteLibrary'),
        command => S.decodeUnknownSync(WrittenWrite)(command.args).write,
      ),
      write => write._tag !== 'SavePlace',
    ),
    write => S.encodeSync(LibraryWrite)(write),
  )

const nodeOf = (layer: Navigation.FrameLayer): Option.Option<UiNode> =>
  layer.view._tag === 'Screen' ? Option.some(layer.view.node) : Option.none()

const panelOf = (bound: Bound): UiNode =>
  Option.getOrThrow(
    Option.flatMap(Navigation.frameOf(bound), frame =>
      Option.flatMap(Array.last(frame.overlays), nodeOf),
    ),
  )

const listsOf = (node: UiNode): ReadonlyArray<ListNode> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ListNode>>(),
    M.tag('List', list => [list]),
    M.tag('Row', 'Column', 'Box', 'DeviceShell', parent =>
      Array.flatMap(parent.children, listsOf),
    ),
    M.orElse(() => []),
  )

const listOf = (node: UiNode, label: string): ListNode =>
  Option.getOrThrow(
    Array.findFirst(listsOf(node), list => list.label === label),
  )

const bookmarkOf = (fields: {
  id: string
  atMs: number
  note?: string
  words?: readonly [string, string, string]
}): Bookmark => ({
  bookmarkId: BookmarkId.make(fields.id),
  slug: lanternKeeper,
  atMs: Milliseconds.make(fields.atMs),
  createdAtMs: heardFromMs,
  maybeNote: Option.fromNullishOr(fields.note),
  maybeExcerpt: Option.map(
    Option.fromNullishOr(fields.words),
    ([before, word, after]) => ({ before, word, after }),
  ),
})

const marked: ReadonlyArray<Bookmark> = [
  bookmarkOf({
    id: 'b-snow',
    atMs: passageStartMs + 10 * wordMs,
    words: [
      'survey party reached the pass the',
      'snow',
      'had closed the lower',
    ],
  }),
  bookmarkOf({
    id: 'b-stone',
    atMs: passageStartMs + 60_000 + 9 * wordMs,
    note: 'the one flat stone',
    words: ['plane table on the one flat', 'stone', 'and waited for the light'],
  }),
  bookmarkOf({ id: 'b-old', atMs: 61 * minuteMs }),
]

const shelfWithBookmarks = { ...sampleShelf, bookmarks: marked }

describe('excerptAround', () => {
  it('keeps the word and up to eight words either side of it, within its paragraph', () => {
    expect(
      excerptAround(passages, Milliseconds.make(passageStartMs + 10 * wordMs)),
    ).toEqual(
      Option.some({
        before: 'time the survey party reached the pass the',
        word: 'snow',
        after: 'had closed the lower road and Ilse counted',
      }),
    )
  })

  it('has nothing for a place where no words are loaded', () => {
    expect(excerptAround(passages, Milliseconds.make(5 * minuteMs))).toEqual(
      Option.none(),
    )
  })

  it('reads as one line with the words either side trailing off', () => {
    expect(
      excerptLineOf({
        before: 'the pass the',
        word: 'snow',
        after: 'had closed',
      }),
    ).toBe('…the pass the snow had closed…')
    expect(excerptLineOf({ before: '', word: 'By', after: 'the time' })).toBe(
      'By the time…',
    )
  })
})

describe('bookmarkPathOf', () => {
  it('is the player’s address at the millisecond the word starts', () => {
    expect(bookmarkPathOf(lanternKeeper, Milliseconds.make(723_450))).toBe(
      '/books/the-lantern-keeper/listen/12m03.45s',
    )
  })
})

describe('bookmarkCountsOf', () => {
  it('counts the bookmarks in each chapter that has some', () => {
    const chapters = Option.getOrThrow(
      Record_.get(sampleChapters, lanternKeeper),
    )
    expect(bookmarkCountsOf(chapters, marked)).toEqual(
      new Map([
        [ChapterNumber.make(2), 2],
        [ChapterNumber.make(4), 1],
      ]),
    )
  })
})

describe('Adding a bookmark', () => {
  it('asks for the moment, then marks the word being spoken at that moment, with the words around it', () => {
    const { bound, send, written } = playingAt(passageStartMs + 8 * wordMs)
    bound.pressKey(Interaction.keyInput('b'))
    expect(Array.map(written, command => command.name)).toContain('ReadMoment')
    expect(writesOf(written)).toEqual([])
    send(
      MarkedMoment({
        wallClockMs: heardFromMs + 2 * wordMs + 50,
        maybeNote: Option.none(),
      }),
    )
    expect(writesOf(written)).toEqual([
      {
        _tag: 'AddBookmarkAt',
        slug: 'the-lantern-keeper',
        atMs: passageStartMs + 10 * wordMs,
        maybeExcerpt: {
          before: 'time the survey party reached the pass the',
          word: 'snow',
          after: 'had closed the lower road and Ilse counted',
        },
      },
    ])
    expect(bound.readModel().maybeNotice).toEqual(
      Option.some('Bookmarked “snow” at 20:34'),
    )
  })

  it('marks the place itself where no words are loaded', () => {
    const { bound, send, written } = playingAt(5 * minuteMs)
    bound.press('AddBookmark')
    send(MarkedMoment({ wallClockMs: heardFromMs, maybeNote: Option.none() }))
    expect(writesOf(written)).toEqual([
      { _tag: 'AddBookmarkAt', slug: 'the-lantern-keeper', atMs: 5 * minuteMs },
    ])
  })

  it('takes a note with it', () => {
    const { bound, send, written } = playingAt(passageStartMs + 10 * wordMs)
    bound.press('AddNotedBookmark:where the snow starts')
    send(
      MarkedMoment({
        wallClockMs: heardFromMs,
        maybeNote: Option.some('where the snow starts'),
      }),
    )
    expect(writesOf(written)).toMatchObject([
      {
        _tag: 'AddBookmarkAt',
        atMs: passageStartMs + 10 * wordMs,
        maybeNote: 'where the snow starts',
      },
    ])
  })

  it('marks a word a person pressed, by its token', () => {
    const { bound, written } = playingAt(passageStartMs)
    bound.press('BookmarkWord:w-1-9')
    expect(writesOf(written)).toMatchObject([
      {
        _tag: 'AddBookmarkAt',
        atMs: passageStartMs + 60_000 + 9 * wordMs,
        maybeExcerpt: { word: 'stone' },
      },
    ])
  })

  it('does not mark the same word twice', () => {
    const { bound, written } = playingAt(passageStartMs, shelfWithBookmarks)
    bound.press('BookmarkWord:w-1-9')
    expect(writesOf(written)).toEqual([])
    expect(bound.readModel().maybeNotice).toEqual(
      Option.some('That word is already bookmarked'),
    )
  })
})

describe('The Bookmarks panel', () => {
  it('opens beside the page at its own address, a tab next to Contents', () => {
    const { bound } = playingAt(passageStartMs, shelfWithBookmarks)
    bound.pressKey(Interaction.keyInput('m'))
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen/20m30s/bookmarks'),
    )
    expect(
      Option.map(
        Option.flatMap(Navigation.frameOf(bound), frame =>
          Array.last(frame.overlays),
        ),
        layer => layer.maybeStyle,
      ),
    ).toEqual(Option.some(Option.some(Navigation.Drawer({ from: 'Left' }))))
    bound.press('ShowContents')
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen/20m30s/contents'),
    )
    bound.press('ShowBookmarks')
    bound.press('ShowBookmarks')
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen/20m30s'),
    )
  })

  it('lists each bookmark with its words, its note, its time and its chapter, each a link to its word', () => {
    const { bound } = playingAt(passageStartMs, shelfWithBookmarks)
    bound.press('ShowBookmarks')
    const list = listOf(panelOf(bound), 'Bookmarks')
    expect(
      Array.map(list.items, (item: ListItem) => ({
        title: item.title,
        lines: item.lines,
        group: item.group,
        columns: item.columns,
        href: item.href,
      })),
    ).toEqual([
      {
        title: '…survey party reached the pass the snow had closed the lower…',
        lines: undefined,
        group: 'The Light',
        columns: ['20:34'],
        href: '/books/the-lantern-keeper/listen/20m34s',
      },
      {
        title: '…plane table on the one flat stone and waited for the light…',
        lines: ['the one flat stone'],
        group: 'The Light',
        columns: ['21:33'],
        href: '/books/the-lantern-keeper/listen/21m33.6s',
      },
      {
        title: 'Bookmark at 1:01:00',
        lines: undefined,
        group: 'The Keeper',
        columns: ['1:01:00'],
        href: '/books/the-lantern-keeper/listen/1h01m00s',
      },
    ])
    expect(list.filter).toEqual({
      placeholder: 'Find in your bookmarks',
      label: 'Find in the bookmarks of The Lantern Keeper',
      emptyText: 'No bookmark has that in its words or its note.',
      isOverLines: true,
    })
  })

  it('says how to make one while there are none', () => {
    const { bound } = playingAt(passageStartMs)
    bound.press('ShowBookmarks')
    expect(listsOf(panelOf(bound))).toEqual([])
    expect(Array.map(textsOf(panelOf(bound)), text => text.content)).toEqual([
      'No bookmarks yet.',
      'Press b while you listen to mark the word being read.',
    ])
  })

  it('counts a chapter’s bookmarks on its row in Contents', () => {
    const { bound } = playingAt(passageStartMs, shelfWithBookmarks)
    bound.press('ShowContents')
    const chapters = listOf(panelOf(bound), 'Chapters')
    expect(Array.map(chapters.items, item => item.badge)).toEqual([
      undefined,
      { text: '2', label: '2 bookmarks' },
      undefined,
      { text: '1', label: '1 bookmark' },
    ])
  })
})

describe('One bookmark', () => {
  it('opens on its own address with a field for its note', () => {
    const { bound, written } = playingAt(passageStartMs, shelfWithBookmarks)
    bound.press('OpenBookmark:b-snow')
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen/20m30s/bookmarks/b-snow'),
    )
    expect(
      Array.map(
        Array.filter(
          buttonsOf(panelOf(bound)),
          button => button.variant === 'Tab',
        ),
        button => [button.label, button.isCurrent === true, button.action],
      ),
    ).toEqual([
      ['Contents', false, 'ShowContents'],
      ['Bookmarks 3', true, 'ShowBookmarks'],
    ])
    bound.press('SetBookmarkNote:where the road closes')
    expect(writesOf(written)).toEqual([
      {
        _tag: 'NoteBookmark',
        bookmarkId: 'b-snow',
        maybeNote: 'where the road closes',
      },
    ])
  })

  it('clears its note', () => {
    const { bound, written } = playingAt(passageStartMs, shelfWithBookmarks)
    bound.press('OpenBookmark:b-stone')
    bound.press('ClearBookmarkNote')
    expect(writesOf(written)).toEqual([
      { _tag: 'NoteBookmark', bookmarkId: 'b-stone' },
    ])
  })

  it('is put back by Undo after it is removed, with its note and its words', () => {
    const { bound, written } = playingAt(passageStartMs, shelfWithBookmarks)
    bound.press('DeleteBookmark:b-stone')
    bound.press('ConfirmDeleteBookmark:b-stone')
    expect(bound.readModel().maybeNotice).toEqual(
      Option.some('Bookmark removed. Press z to put it back.'),
    )
    bound.pressKey(Interaction.keyInput('z'))
    expect(writesOf(written)).toEqual([
      { _tag: 'RemoveBookmark', bookmarkId: 'b-stone' },
      {
        _tag: 'AddBookmarkAt',
        slug: 'the-lantern-keeper',
        atMs: passageStartMs + 60_000 + 9 * wordMs,
        maybeNote: 'the one flat stone',
        maybeExcerpt: {
          before: 'plane table on the one flat',
          word: 'stone',
          after: 'and waited for the light',
        },
        maybeCreatedAtMs: heardFromMs,
      },
    ])
    expect(
      Array.findFirst(
        bound.entries(),
        entry => entry.tag === 'UndoRemoveBookmark',
      ).pipe(Option.map(entry => entry.availability._tag)),
    ).toEqual(Option.some('Disabled'))
  })
})

describe('The reader', () => {
  it('carries a mark for each bookmark of the title, on its word, with its note and the press that opens it', () => {
    const { bound } = playingAt(passageStartMs, shelfWithBookmarks)
    const base = Option.getOrThrow(
      Option.flatMap(Navigation.frameOf(bound), frame => nodeOf(frame.base)),
    )
    expect(
      Array.flatMap(transcriptsOf(base), transcript => transcript.marks ?? []),
    ).toEqual([
      {
        startMs: passageStartMs + 10 * wordMs,
        label: 'Bookmark at 20:34',
        action: 'OpenBookmark:b-snow',
      },
      {
        startMs: passageStartMs + 60_000 + 9 * wordMs,
        label: 'Bookmark at 21:33',
        note: 'the one flat stone',
        action: 'OpenBookmark:b-stone',
      },
      {
        startMs: 61 * minuteMs,
        label: 'Bookmark at 1:01:00',
        action: 'OpenBookmark:b-old',
      },
    ])
  })
})

describe('The bookmarks of a title for a terminal', () => {
  it('lists them as lines and as JSON', () => {
    const { bound } = playingAt(passageStartMs, shelfWithBookmarks)
    const listing = Option.getOrThrow(bookmarksListingOf(bound.readModel()))
    expect(bookmarksListingLines(listing)).toEqual([
      '# The Lantern Keeper · 3 bookmarks',
      '20:34 · The Light · …survey party reached the pass the snow had closed the lower… · /books/the-lantern-keeper/listen/20m34s · b-snow',
      '21:33 · The Light · …plane table on the one flat stone and waited for the light… · note: the one flat stone · /books/the-lantern-keeper/listen/21m33.6s · b-stone',
      '1:01:00 · The Keeper · /books/the-lantern-keeper/listen/1h01m00s · b-old',
    ])
    expect(
      JSON.parse(S.encodeSync(BookmarksListingJson)(listing)).bookmarks[1],
    ).toEqual({
      bookmarkId: 'b-stone',
      atMs: passageStartMs + 60_000 + 9 * wordMs,
      place: '21:33',
      chapter: 'The Light',
      link: '/books/the-lantern-keeper/listen/21m33.6s',
      words: '…plane table on the one flat stone and waited for the light…',
      note: 'the one flat stone',
    })
  })
})

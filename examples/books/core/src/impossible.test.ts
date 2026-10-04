import { Option } from 'effect'
import { Navigation } from 'foldkit'
import { Playing } from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import {
  DeleteBookmarkQuestion,
  type Destination,
  LibraryPage,
  PlayerPage,
} from './destination.js'
import { BookmarkId, Milliseconds, TitleSlug } from './ids.js'
import {
  ConfirmDeleteBookmark,
  JumpToChapter,
  Listen,
  SetSpeed,
} from './message.js'
import { Loaded } from './model.js'

const slug = TitleSlug.make('the-lantern-keeper')
const question = DeleteBookmarkQuestion({
  bookmarkId: BookmarkId.make('bookmark-1'),
})

describe('states Books rules out by type', () => {
  it('refuses each of them at compile time', () => {
    const attempts = [
      () =>
        // @ts-expect-error a plain string is not a title's name tag
        Listen({ slug: 'the-lantern-keeper' }),
      () =>
        // @ts-expect-error a plain number is not a chapter
        JumpToChapter({ chapterNumber: 3 }),
      () =>
        // @ts-expect-error 3× is not a speed the player offers
        SetSpeed({ speed: 3 }),
      () =>
        // @ts-expect-error playing must say which cue it plays
        Playing({ placeMs: Milliseconds.make(0) }),
      () =>
        // @ts-expect-error a loaded title always holds its player
        Loaded({
          slug,
          savedPlaceMs: Milliseconds.make(0),
        }),
      () =>
        // @ts-expect-error the question must name its bookmark
        DeleteBookmarkQuestion(),
      () =>
        // @ts-expect-error deleting must name the bookmark it deletes
        ConfirmDeleteBookmark(),
      (): Navigation.NavigationStack<Destination> => ({
        root: LibraryPage(),
        pages: [PlayerPage()],
        // @ts-expect-error at most one modal: there is no list of them
        maybeModal: Option.some([
          { destination: question, style: Navigation.Dialog() },
          { destination: question, style: Navigation.Dialog() },
        ]),
      }),
      (): Navigation.NavigationStack<Destination> => ({
        root: LibraryPage(),
        pages: [],
        // @ts-expect-error a pushed page is not a modal
        maybeModal: Option.some({
          destination: PlayerPage(),
          style: Navigation.Push(),
        }),
      }),
      (): Navigation.NavigationStack<Destination> => ({
        root: LibraryPage(),
        // @ts-expect-error no screen exists that the Destination does not name
        pages: [{ _tag: 'Audiobook', slug }],
        maybeModal: Option.none(),
      }),
    ]
    expect(attempts).toHaveLength(10)
  })
})

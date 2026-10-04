import { Array, Option } from 'effect'
import { Navigation } from 'foldkit'
import { textsOf } from 'foldkit/renderers'
import { ts } from 'foldkit/schema'
import { describe, expect, it } from 'vitest'

import {
  ReadAloudPage,
  type ReadAloudPlace,
  ReadAloudShelf,
} from './destination.js'
import {
  BookId,
  BookKey,
  Isbn13,
  PageNumber,
  ReadingId,
  TurnId,
} from './ids.js'
import { NextPage, OpenBook, ReceivedReadings } from './message.js'
import {
  type Book,
  type PageTurn,
  type PreviewCheck,
  ReadingsLoading,
  type ReadingsState,
} from './model.js'
import { readAloudViewOf } from './navigation.js'
import { updateReadAloud } from './update.js'

const HostLibrary = ts('HostLibrary')

type HostDestination = typeof HostLibrary.Type | ReadAloudPlace

type HostModel = Readonly<{
  shelfOfAudiobooks: ReadonlyArray<string>
  readings: ReadingsState
  previewChecks: ReadonlyArray<PreviewCheck>
  navigation: Navigation.NavigationStack<HostDestination>
}>

const book: Book = {
  bookId: BookId.make('thing-feeling-happy'),
  key: BookKey.make('9780063342705'),
  maybeIsbn13: Option.some(Isbn13.make('9780063342705')),
  title: 'Little Blue Truck Feeling Happy',
  authors: ['Alice Schertle'],
  publishers: [],
  maybePublishYear: Option.none(),
  maybePageCount: Option.some(PageNumber.make(14)),
  maybeCoverUrl: Option.none(),
  links: [],
}

const turnAt = (page: number, turnedAtMs: number): PageTurn => ({
  turnId: TurnId.make(`turn-${page.toString()}`),
  bookId: book.bookId,
  readingId: ReadingId.make('tonight'),
  page: PageNumber.make(page),
  turnedAtMs,
  isOngoing: true,
})

const updateHost = updateReadAloud<HostModel, HostDestination>({
  stack: Navigation.fieldLens<HostModel, HostDestination>(),
  place: place => place,
})

const hostAtLibrary: HostModel = {
  shelfOfAudiobooks: ['the-lantern-keeper'],
  readings: ReadingsLoading(),
  previewChecks: [],
  navigation: Navigation.stackAtRoot<HostDestination>(HostLibrary()),
}

const tagsOf = (model: HostModel) =>
  Array.map(model.navigation.pages, page => page._tag)

describe('Read Aloud held by another Program', () => {
  it('opens a book above a shelf it pushes onto the host stack, and keeps the host fields', () => {
    const received = updateHost(
      hostAtLibrary,
      ReceivedReadings({
        readings: { books: [book], turns: [turnAt(4, 4_000)] },
      }),
    )
    const opened = updateHost(received, OpenBook({ book: book.key }))
    expect(tagsOf(opened)).toEqual(['ReadAloudShelf', 'ReadAloudPage'])
    expect(Array.last(opened.navigation.pages)).toEqual(
      Option.some(ReadAloudPage({ book: book.key, page: PageNumber.make(4) })),
    )
    expect(opened.shelfOfAudiobooks).toEqual(['the-lantern-keeper'])
  })

  it('turns and follows the page on top of the host stack, under the same shelf', () => {
    const atShelf: HostModel = {
      ...hostAtLibrary,
      navigation: {
        ...hostAtLibrary.navigation,
        pages: [ReadAloudShelf()],
      },
    }
    const received = updateHost(
      atShelf,
      ReceivedReadings({
        readings: { books: [book], turns: [turnAt(4, 4_000)] },
      }),
    )
    const turned = updateHost(
      updateHost(received, OpenBook({ book: book.key })),
      NextPage(),
    )
    const followed = updateHost(
      turned,
      ReceivedReadings({
        readings: {
          books: [book],
          turns: [turnAt(6, 6_000), turnAt(4, 4_000)],
        },
      }),
    )
    expect(tagsOf(turned)).toEqual(['ReadAloudShelf', 'ReadAloudPage'])
    expect(Array.last(turned.navigation.pages)).toEqual(
      Option.some(ReadAloudPage({ book: book.key, page: PageNumber.make(5) })),
    )
    expect(Array.last(followed.navigation.pages)).toEqual(
      Option.some(ReadAloudPage({ book: book.key, page: PageNumber.make(6) })),
    )
  })

  it('paints its places for the host, the shelf included', () => {
    const received = updateHost(
      hostAtLibrary,
      ReceivedReadings({
        readings: { books: [book], turns: [turnAt(4, 4_000)] },
      }),
    )
    const words = (place: ReadAloudPlace) =>
      Option.map(readAloudViewOf(received, place), view =>
        view._tag === 'Screen'
          ? Array.map(textsOf(view.node), text => text.content)
          : [],
      )
    expect(words(ReadAloudShelf())).toEqual(
      Option.some(
        expect.arrayContaining([
          'Read aloud',
          'Reading now: Little Blue Truck Feeling Happy, page 4 of 14.',
        ]),
      ),
    )
  })
})

import { Array, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import { type UiNode, buttonsOf, textsOf } from 'foldkit/renderers'
import * as ReadAloud from 'read-aloud-core-example'
import { describe, expect, it } from 'vitest'

import { App, type AppMessage, type AppModel } from './app.js'
import { ReceivedShelf } from './message.js'
import { sampleShelf } from './sample.js'

type Written = Readonly<{ name: string; args: string }>

const feelingHappy: ReadAloud.Book = {
  bookId: ReadAloud.BookId.make('thing-feeling-happy'),
  key: ReadAloud.BookKey.make('9780063342705'),
  maybeIsbn13: Option.some(ReadAloud.Isbn13.make('9780063342705')),
  title: 'Little Blue Truck Feeling Happy',
  authors: ['Alice Schertle'],
  publishers: ['HarperCollins Publishers'],
  maybePublishYear: Option.some('2024'),
  maybePageCount: Option.some(ReadAloud.PageNumber.make(14)),
  maybeCoverUrl: Option.some(
    'https://covers.openlibrary.org/b/id/15154333-M.jpg',
  ),
  links: [],
}

const turnAt = (page: number, turnedAtMs: number): ReadAloud.PageTurn => ({
  turnId: ReadAloud.TurnId.make(`tonight-page-${page.toString()}`),
  bookId: feelingHappy.bookId,
  readingId: ReadAloud.ReadingId.make('tonight'),
  page: ReadAloud.PageNumber.make(page),
  turnedAtMs,
  isOngoing: true,
})

const readingsTo = (...pages: ReadonlyArray<number>) =>
  ReadAloud.ReceivedReadings({
    readings: {
      books: [feelingHappy],
      turns: Array.reverse(
        Array.map(pages, (page, index) => ({
          ...turnAt(page, (index + 1) * 1_000),
          isOngoing: index === pages.length - 1,
        })),
      ),
    },
  })

const bindApp = () => {
  let model: AppModel = App.update(
    App.init()[0],
    ReceivedShelf({ shelf: sampleShelf }),
  )[0]
  const written: Array<Written> = []
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: AppMessage) => {
      const [next, commands] = App.update(model, message)
      model = next
      Array.forEach(commands, command => {
        written.push({ name: command.name, args: JSON.stringify(command.args) })
      })
    },
    stop: () => Promise.resolve(),
  }
  const bound = Interaction.bind(App, handle)
  return { bound, written, send: handle.send }
}

type Bound = ReturnType<typeof bindApp>['bound']

const uriOf = (bound: Bound) => Option.map(bound.navigation(), plan => plan.uri)

const screenOf = (bound: Bound): UiNode =>
  Option.getOrThrow(
    Option.flatMap(Navigation.frameOf(bound), frame =>
      frame.base.view._tag === 'Screen'
        ? Option.some(frame.base.view.node)
        : Option.none(),
    ),
  )

const wordsOf = (bound: Bound): ReadonlyArray<string> =>
  Array.map(textsOf(screenOf(bound)), text => text.content)

const buttonLabelsOf = (bound: Bound): ReadonlyArray<string> =>
  Array.map(buttonsOf(screenOf(bound)), button => button.label)

describe('Read Aloud in Books', () => {
  it('shows the book being read aloud on the library, and opens the books read aloud from it', () => {
    const { bound, send } = bindApp()
    send(readingsTo(1, 2, 3, 4))
    expect(wordsOf(bound)).toContain('Read aloud')
    bound.press('ShowReadAloud')
    expect(uriOf(bound)).toEqual(Option.some('/books/read-aloud'))
    expect(wordsOf(bound)).toContain(
      'Reading now: Little Blue Truck Feeling Happy, page 4 of 14.',
    )
  })

  it('opens a page above the books read aloud, follows the reader there, and keeps the tabs', () => {
    const { bound, send } = bindApp()
    send(readingsTo(1, 2, 3, 4))
    bound.press('ShowReadAloud')
    bound.press(`OpenBook:${feelingHappy.key}`)
    expect(uriOf(bound)).toEqual(
      Option.some('/books/read-aloud/9780063342705/page/4'),
    )
    send(readingsTo(1, 2, 3, 4, 5))
    expect(uriOf(bound)).toEqual(
      Option.some('/books/read-aloud/9780063342705/page/5'),
    )
    expect(buttonLabelsOf(bound)).toEqual(
      expect.arrayContaining([
        'Previous page',
        'Next page',
        'Share',
        'Library',
        'Profile',
      ]),
    )
    bound.press('ShowLibrary')
    expect(uriOf(bound)).toEqual(Option.some('/books'))
  })

  it('shares a page the way a moment is shared, and says the link went out', () => {
    const { bound, send, written } = bindApp()
    send(readingsTo(1, 2, 3, 4))
    bound.openUri('/books/read-aloud/9780063342705/page/2', Navigation.Link())
    bound.press('SharePage')
    expect(written).toContainEqual({
      name: 'ShareLink',
      args: JSON.stringify({
        path: '/books/read-aloud/9780063342705/page/2',
        title: 'Little Blue Truck Feeling Happy, page 2',
      }),
    })
  })

  it('opens a link to a page from outside, above the books read aloud and the library', () => {
    const { bound, send } = bindApp()
    send(readingsTo(1, 2, 3, 4))
    bound.openUri('/books/read-aloud/9780063342705/page/2', Navigation.Link())
    expect(
      Option.map(bound.navigation(), plan =>
        Array.map(plan.entries, entry => entry.uri),
      ),
    ).toEqual(
      Option.some([
        '/books',
        '/books/read-aloud',
        '/books/read-aloud/9780063342705/page/2',
      ]),
    )
    bound.openUri('/books/read-aloud/9780063342705', Navigation.Link())
    expect(uriOf(bound)).toEqual(
      Option.some('/books/read-aloud/9780063342705/page/4'),
    )
  })

  it('turns pages by hand with the arrows and turns to the reader again with f', () => {
    const { bound, send } = bindApp()
    send(readingsTo(1, 2, 3, 4))
    bound.openUri('/books/read-aloud/9780063342705/page/2', Navigation.Link())
    bound.pressKey(Interaction.keyInput('ArrowRight'))
    expect(uriOf(bound)).toEqual(
      Option.some('/books/read-aloud/9780063342705/page/3'),
    )
    bound.pressKey(Interaction.keyInput('f'))
    expect(uriOf(bound)).toEqual(
      Option.some('/books/read-aloud/9780063342705/page/4'),
    )
  })

  it('hides the Read aloud row until a book has been read aloud', () => {
    const { bound } = bindApp()
    expect(wordsOf(bound)).not.toContain('Read aloud')
  })
})

import { Array, Match as M, Option } from 'effect'
import { Catalog } from 'foldkit'
import {
  type ButtonNode,
  type ListItem,
  type UiNode,
  buttonsOf,
  inputsOf,
  textsOf,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { Milliseconds } from '../ids.js'
import { catalog } from './message.js'
import {
  type AudibleModel,
  type AudibleView,
  SignInConnecting,
  SignInReady,
  TitlesImported,
  TitlesImporting,
  TitlesRead,
  TitlesUnreadable,
  init,
} from './model.js'
import { AddressMismatch, AmazonRefused, LoginExpired } from './problem.js'
import { connectScreen, titlesScreen } from './screen.js'
import { Asin, type AudibleTitle } from './title.js'

const loginUrl = 'https://www.amazon.com/ap/signin?openid.mode=checkid_setup'

const titleOf = (
  asin: string,
  name: string,
  more: Partial<AudibleTitle> = {},
): AudibleTitle => ({
  asin: Asin.make(asin),
  name,
  maybeSubtitle: Option.none(),
  authors: ['Mara Linden'],
  narrators: ['Ezra Vale'],
  series: [],
  maybeCoverUrl: Option.none(),
  maybeRuntimeMs: Option.some(Milliseconds.make(48_000_000)),
  match: 'New',
  marks: [],
  ...more,
})

const titles = [
  titleOf('B0FAKE0001', 'The Long Way to Noon', {
    marks: ['Explicit'],
    series: [{ name: 'Noon Trilogy', maybeSequence: Option.some('2') }],
  }),
  titleOf('B002V0RAUU', 'A New Earth', { match: 'InLibrary' }),
]

const hostButtons = {
  reconnect: [{ _tag: 'Button', label: 'Connect again' } satisfies ButtonNode],
  openLibrary: [
    { _tag: 'Button', label: 'Go to your library' } satisfies ButtonNode,
  ],
}

const itemsOf = (node: UiNode): ReadonlyArray<ListItem> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ListItem>>(),
    M.tag('List', list => list.items),
    M.tag('Row', 'Column', 'Box', 'DeviceShell', parent =>
      Array.flatMap(parent.children, itemsOf),
    ),
    M.orElse(() => []),
  )

const wordsOf = (node: UiNode): ReadonlyArray<string> =>
  Array.map(textsOf(node), text => text.content)

const rowsOf = (node: UiNode): ReadonlyArray<ReadonlyArray<string>> =>
  Array.map(itemsOf(node), item => [item.title, ...(item.lines ?? [])])

const viewOf = (
  page: AudibleView['page'],
  audible: Partial<AudibleModel>,
): AudibleView => ({ page, audible: { ...init(), ...audible } })

const entriesOf = (view: AudibleView) => Catalog.entries(catalog, view)

const connectOf = (audible: Partial<AudibleModel>): UiNode => {
  const view = viewOf('Connect', audible)
  return connectScreen(view, entriesOf(view))
}

const titlesOf = (audible: Partial<AudibleModel>): UiNode => {
  const view = viewOf('Titles', audible)
  return titlesScreen(view, entriesOf(view), hostButtons)
}

describe('the Audible sign-in screen', () => {
  it('opens Amazon from Step 1 and takes the address in Step 2', () => {
    const screen = connectOf({
      signIn: SignInReady({ loginUrl, maybeProblem: Option.none() }),
    })
    expect(
      Array.map(itemsOf(screen), item => [item.title, item.href]),
    ).toContainEqual(['Open Amazon sign-in', loginUrl])
    expect(wordsOf(screen)).toEqual(
      expect.arrayContaining([
        'Step 1',
        'Step 2',
        'After you sign in, Amazon shows a page that looks broken. That is expected.',
      ]),
    )
    expect(Array.map(inputsOf(screen), input => input.action)).toEqual([
      'ConnectAudible',
    ])
  })

  it('says a wrong paste beside the field, and a refused sign-in above Step 1', () => {
    const wrongPaste = wordsOf(
      connectOf({
        signIn: SignInReady({
          loginUrl,
          maybeProblem: Option.some(AddressMismatch()),
        }),
      }),
    )
    const mismatch = Array.findFirstIndex(wrongPaste, words =>
      words.startsWith('That is not the address'),
    )
    expect(
      Option.zipWith(
        mismatch,
        Array.findFirstIndex(wrongPaste, words => words === 'Step 2'),
        (problem, step) => problem > step,
      ),
    ).toEqual(Option.some(true))
    const refused = wordsOf(
      connectOf({
        signIn: SignInReady({
          loginUrl,
          maybeProblem: Option.some(
            AmazonRefused({
              reason: 'the sign-in was already used or ran out of time',
            }),
          ),
        }),
      }),
    )
    expect(Array.take(refused, 3)).toEqual([
      'Connect Audible',
      'Books reads the titles you own on Audible. It never downloads your audiobooks.',
      'Amazon refused: the sign-in was already used or ran out of time.',
    ])
  })

  it('takes no address while it connects', () => {
    const screen = connectOf({ signIn: SignInConnecting({ loginUrl }) })
    expect(wordsOf(screen)).toContain('Connecting to Audible…')
    expect(inputsOf(screen)).toEqual([])
  })
})

describe('the Audible titles screen', () => {
  const read = TitlesRead({
    titles,
    skipped: [
      { kind: 'Podcast', count: 4 },
      { kind: 'AudiblePlusLoan', count: 2 },
    ],
    selected: [Asin.make('B0FAKE0001')],
    maybeProblem: Option.none(),
  })

  it('counts the titles, says what the importer skips, and marks each title', () => {
    const screen = titlesOf({ titles: read })
    expect(wordsOf(screen)).toEqual(
      expect.arrayContaining([
        '2 books on Audible · 1 already in your library',
        'Skipped 4 podcasts and 2 Audible Plus loans, which Books does not import.',
      ]),
    )
    expect(rowsOf(screen)).toEqual([
      [
        'The Long Way to Noon',
        'Mara Linden',
        'Explicit · 13h 20m · Noon Trilogy, book 2',
      ],
      ['A New Earth', 'Mara Linden', 'In your library'],
    ])
    expect(Array.map(buttonsOf(screen), button => button.label)).toContain(
      'Import 1 book',
    )
  })

  it('counts an import by books while it reads chapters, and by share while it adds them', () => {
    const importing = (stage: 'ReadingChapters' | 'AddingBooks') =>
      wordsOf(
        titlesOf({
          titles: TitlesImporting({
            titles,
            skipped: [],
            selected: [Asin.make('B0FAKE0001'), Asin.make('B002V0RAUU')],
            progress: { stage, done: 3, total: 8 },
          }),
        }),
      )
    expect(importing('ReadingChapters')).toEqual(
      expect.arrayContaining([
        'Importing 2 books…',
        'Reading chapters from Audible: 3 of 8 books',
      ]),
    )
    expect(importing('AddingBooks')).toContain('Adding to your library: 38%')
  })

  it('sums up what the import did and what it chose', () => {
    const screen = titlesOf({
      titles: TitlesImported({
        summary: {
          added: 37,
          matched: 3,
          notAdded: [],
          marked: [
            { mark: 'Free', count: 3 },
            { mark: 'Explicit', count: 1 },
          ],
          leftOut: ['Publisher', 'SeriesName', 'ReleaseDate'],
        },
        skipped: [{ kind: 'Podcast', count: 4 }],
      }),
    })
    expect(wordsOf(screen)).toEqual(
      expect.arrayContaining([
        'Added 37, matched 3',
        'Matched books were already in your library. The new ones have no audio yet.',
      ]),
    )
    expect(rowsOf(screen)).toEqual([
      ['Skipped 4 podcasts', 'Books imports only the books you own'],
      ['3 free titles', 'Imported, and marked free'],
      ['1 explicit title', 'Imported, and marked explicit'],
      ['Listening positions', 'Not imported from Audible yet'],
      [
        'Publisher, series name, and full release date',
        'Not kept: Books has no place for them yet',
      ],
    ])
    expect(Array.map(buttonsOf(screen), button => button.label)).toEqual([
      'Go to your library',
    ])
  })

  it('offers Books’ own Connect again when the login stopped working', () => {
    const screen = titlesOf({
      titles: TitlesUnreadable({ problem: LoginExpired() }),
    })
    expect(wordsOf(screen)).toContain(
      'Your Audible login stopped working. Connect again to read your library.',
    )
    expect(Array.map(buttonsOf(screen), button => button.label)).toEqual([
      'Connect again',
    ])
  })
})

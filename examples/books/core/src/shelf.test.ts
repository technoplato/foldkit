import { Array, Option } from 'effect'
import type { ListNode, UiNode } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ImportFromAudible } from './addBooks.js'
import { Milliseconds, TitleSlug } from './ids.js'
import { init } from './init.js'
import {
  CloseTitleMenu,
  type Message,
  Open,
  ReceivedShelf,
  ShowTitleMenu,
} from './message.js'
import { InProgress, type Model, type Shelf } from './model.js'
import { isLocalOnlyMessage } from './program.js'
import { longSampleShelf, sampleTitles } from './sample.js'
import { libraryScreen } from './screen.js'
import { update } from './update.js'

// Made-up books: nothing here is a real title.
const saltRoad = TitleSlug.make('salt-road')

const smallHours = TitleSlug.make('small-hours')

const lanternKeeper = TitleSlug.make('the-lantern-keeper')

const heardAtMs = Date.UTC(2026, 10, 19, 19, 0, 0)

const withoutAudio = Array.map(Array.take(sampleTitles, 1), title => ({
  ...title,
  slug: saltRoad,
  name: 'Salt Road',
  maybeAudioUrl: Option.none(),
}))

const shelf: Shelf = {
  titles: [...sampleTitles, ...withoutAudio],
  progress: [
    InProgress({
      slug: smallHours,
      placeMs: Milliseconds.make(90_000),
      savedAtMs: heardAtMs,
    }),
  ],
  bookmarks: [],
}

const after = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  Array.reduce(messages, model, (state, message) => update(state, message)[0])

const onLibrary = (given: Shelf): Model =>
  after(init()[0], ReceivedShelf({ shelf: given }))

const listsOf = (node: UiNode): ReadonlyArray<ListNode> => {
  if (node._tag === 'List') {
    return [node]
  } else if (
    node._tag === 'Column' ||
    node._tag === 'Row' ||
    node._tag === 'Box'
  ) {
    return Array.flatMap(node.children, listsOf)
  } else {
    return []
  }
}

const listNamed = (model: Model, label: string): ListNode =>
  Option.getOrThrow(
    Array.findFirst(
      listsOf(libraryScreen(model)),
      list => list.label === label,
    ),
  )

const keysOf = (list: ListNode): ReadonlyArray<string> =>
  Array.map(list.items, item => item.key)

describe('the shelf', () => {
  it('lists every book with audio under Continue listening, the ones in progress first', () => {
    expect(keysOf(listNamed(onLibrary(shelf), 'Continue listening'))).toEqual([
      smallHours,
      lanternKeeper,
      'a-field-guide-to-weather',
    ])
  })

  it('lists all of a long shelf, not only three', () => {
    expect(
      listNamed(onLibrary(longSampleShelf), 'Continue listening').items,
    ).toHaveLength(longSampleShelf.titles.length)
  })

  it('keeps a book with no audio apart, with a More button that opens its menu', () => {
    const waiting = listNamed(onLibrary(shelf), 'No audio yet')
    expect(keysOf(waiting)).toEqual([saltRoad])
    const row = Option.getOrThrow(
      Array.findFirst(waiting.items, item => item.key === saltRoad),
    )
    expect(row.lines).toContain('Its audio is not in the library yet')
    expect(row.menuAction).toBe('ShowTitleMenu:salt-road')
    expect(Array.map(row.trailing ?? [], button => button.action)).toEqual([
      'ShowTitleMenu:salt-road',
    ])
  })
})

describe('a book’s menu', () => {
  it('opens on a long press of any row on the shelf', () => {
    const rows = [
      ...listNamed(onLibrary(shelf), 'Continue listening').items,
      ...listNamed(onLibrary(shelf), 'No audio yet').items,
    ]
    expect(Array.map(rows, row => row.menuAction)).toEqual(
      Array.map(rows, row => `ShowTitleMenu:${row.key}`),
    )
  })

  it('offers a book with no audio its page and the way to get its audio, and no Play', () => {
    const open = after(onLibrary(shelf), ShowTitleMenu({ slug: saltRoad }))
    expect(listNamed(open, 'No audio yet').menu).toEqual({
      key: saltRoad,
      dismissAction: 'CloseTitleMenu',
      items: [
        {
          action: 'Open:salt-road',
          label: 'Open its page',
          icon: 'Chapters',
        },
        {
          action: 'ImportFromAudible',
          label: 'Get its audio from Audible',
          icon: 'Library',
        },
      ],
    })
    expect(listNamed(open, 'Continue listening').menu).toBeUndefined()
  })

  it('offers a book with audio Play and its page', () => {
    const open = after(onLibrary(shelf), ShowTitleMenu({ slug: lanternKeeper }))
    expect(
      Array.map(
        listNamed(open, 'Continue listening').menu?.items ?? [],
        item => item.action,
      ),
    ).toEqual(['Listen:the-lantern-keeper', 'Open:the-lantern-keeper'])
  })

  it('closes when it is dismissed and when something in it is picked', () => {
    const open = after(onLibrary(shelf), ShowTitleMenu({ slug: saltRoad }))
    expect(Option.isSome(open.maybeTitleMenu)).toBe(true)
    const closings: ReadonlyArray<Message> = [
      CloseTitleMenu(),
      Open({ slug: saltRoad }),
      ImportFromAudible(),
    ]
    expect(
      Array.map(closings, message => after(open, message).maybeTitleMenu),
    ).toEqual(Array.map(closings, () => Option.none()))
  })

  it('opens for no book that is not on the shelf', () => {
    expect(
      after(
        onLibrary(shelf),
        ShowTitleMenu({ slug: TitleSlug.make('not-here') }),
      ).maybeTitleMenu,
    ).toEqual(Option.none())
  })

  it('stays on the device it was opened on', () => {
    expect(isLocalOnlyMessage(ShowTitleMenu({ slug: saltRoad }))).toBe(true)
    expect(isLocalOnlyMessage(CloseTitleMenu())).toBe(true)
  })
})

import { Array, Match as M, Option, Record as Record_ } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import {
  type ListNode,
  type UiNode,
  buttonsOf,
  textsOf,
} from 'foldkit/renderers'
import { ReachedPlace } from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import { App, type AppMessage, type AppModel } from './app.js'
import {
  chapterColumnsOf,
  chapterPlaceLineOf,
  chapterReadingAt,
  contentsSummaryOf,
} from './contents.js'
import { ChapterNumber, Milliseconds, TitleSlug } from './ids.js'
import { OpenedPlace, ReceivedChapters, ReceivedShelf } from './message.js'
import type { Chapter } from './model.js'
import { sampleChapters, sampleShelf } from './sample.js'
import { addressCueOfModel } from './subscriptions.js'

const minuteMs = 60_000

const chapterOf = (
  chapterNumber: number,
  name: string,
  startMs: number,
  endMs: number,
): Chapter => ({
  chapterNumber: ChapterNumber.make(chapterNumber),
  name,
  startMs: Milliseconds.make(startMs),
  endMs: Milliseconds.make(endMs),
})

const tide = chapterOf(1, 'The Tide', 0, 20 * minuteMs)
const light = chapterOf(2, 'The Light', 20 * minuteMs, 40 * minuteMs)
const storm = chapterOf(3, 'The Storm', 40 * minuteMs, 60 * minuteMs)
const keeper = chapterOf(4, 'The Keeper', 60 * minuteMs, 80 * minuteMs)

const lanternChapters: Array.NonEmptyReadonlyArray<Chapter> = [
  tide,
  light,
  storm,
  keeper,
]

describe('chapterReadingAt', () => {
  it('says how much of a chapter is heard and how much is left', () => {
    expect(chapterReadingAt(light, Milliseconds.make(28 * minuteMs))).toEqual({
      heardMs: 8 * minuteMs,
      leftMs: 12 * minuteMs,
      lengthMs: 20 * minuteMs,
    })
  })

  it('holds a place before the chapter at its start and one after it at its end', () => {
    expect(chapterReadingAt(light, Milliseconds.make(0)).heardMs).toBe(0)
    expect(
      chapterReadingAt(light, Milliseconds.make(70 * minuteMs)).leftMs,
    ).toBe(0)
  })
})

describe('chapterColumnsOf', () => {
  it('reads a chapter as when it starts and how long it runs', () => {
    expect(chapterColumnsOf(light)).toEqual(['20:00', '20:00'])
    expect(
      chapterColumnsOf(chapterOf(9, 'Late', 3_723_000, 3_723_000 + 95_000)),
    ).toEqual(['1:02:03', '1:35'])
  })
})

describe('chapterPlaceLineOf', () => {
  it('says which chapter of how many a place is in, and what is left of it', () => {
    expect(
      chapterPlaceLineOf(lanternChapters, Milliseconds.make(28 * minuteMs)),
    ).toBe('Chapter 2 of 4 · 12:00 left in it')
  })
})

describe('contentsSummaryOf', () => {
  it('counts the chapters and says how long they run together', () => {
    expect(contentsSummaryOf(lanternChapters)).toBe('4 chapters · 1h 20m')
    expect(contentsSummaryOf([tide])).toBe('1 chapter · 20m')
  })
})

const bindApp = () => {
  let model: AppModel = Array.reduce(
    Record_.toEntries(sampleChapters),
    App.update(App.init()[0], ReceivedShelf({ shelf: sampleShelf }))[0],
    (current, [slug, chapters]) =>
      App.update(
        current,
        ReceivedChapters({ slug: TitleSlug.make(slug), chapters }),
      )[0],
  )
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: AppMessage) => {
      model = App.update(model, message)[0]
      Option.map(addressCueOfModel(model), cue => {
        handle.send(OpenedPlace(cue))
      })
    },
    stop: () => Promise.resolve(),
  }
  return { bound: Interaction.bind(App, handle), send: handle.send }
}

type Bound = ReturnType<typeof bindApp>['bound']

const lanternKeeper = TitleSlug.make('the-lantern-keeper')

const heardFromMs = Date.UTC(2026, 9, 18, 19, 0, 0)

const nodeOf = (layer: Navigation.FrameLayer): Option.Option<UiNode> =>
  layer.view._tag === 'Screen' ? Option.some(layer.view.node) : Option.none()

const baseOf = (bound: Bound): UiNode =>
  Option.getOrThrow(
    Option.flatMap(Navigation.frameOf(bound), frame => nodeOf(frame.base)),
  )

const topLayerOf = (bound: Bound): Navigation.FrameLayer =>
  Option.getOrThrow(
    Option.flatMap(Navigation.frameOf(bound), frame =>
      Array.last(frame.overlays),
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

const uriOf = (bound: Bound) => Option.map(bound.navigation(), plan => plan.uri)

const playingAt = (placeMs: number) => {
  const app = bindApp()
  app.bound.press(`Listen:${lanternKeeper}`)
  app.send(
    ReachedPlace({
      placeMs: Milliseconds.make(placeMs),
      wallClockMs: heardFromMs + placeMs,
    }),
  )
  return app
}

describe('Contents', () => {
  it('opens beside the page, as a drawer from the left, at the same address', () => {
    const { bound } = playingAt(28 * minuteMs)
    bound.press('ShowContents')
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen/28m00s/contents'),
    )
    expect(topLayerOf(bound).maybeStyle).toEqual(
      Option.some(Navigation.Drawer({ from: 'Left' })),
    )
  })

  it('lists each chapter with when it starts and how long it runs in columns', () => {
    const { bound } = playingAt(28 * minuteMs)
    bound.press('ShowContents')
    const chapters = listOf(
      Option.getOrThrow(nodeOf(topLayerOf(bound))),
      'Chapters',
    )
    expect(chapters.columns).toEqual(['Starts', 'Length'])
    expect(
      Array.map(chapters.items, item => [item.title, item.columns]),
    ).toEqual([
      ['The Tide', ['0:00', '20:00']],
      ['The Light', ['20:00', '20:00']],
      ['The Storm', ['40:00', '20:00']],
      ['The Keeper', ['1:00:00', '20:00']],
    ])
  })

  it('marks the chapter being read with how far through it the listener is', () => {
    const { bound } = playingAt(28 * minuteMs)
    bound.press('ShowContents')
    const chapters = listOf(
      Option.getOrThrow(nodeOf(topLayerOf(bound))),
      'Chapters',
    )
    const [first, second] = chapters.items
    expect(second?.isCurrent).toBe(true)
    expect(second?.progress).toEqual({
      value: 8 * minuteMs,
      max: 20 * minuteMs,
    })
    expect(second?.lines).toEqual(['12:00 left in this chapter'])
    expect(first?.isCurrent).toBe(false)
    expect(first?.progress).toBeUndefined()
    expect(first?.lines).toBeUndefined()
  })

  it('offers a field that narrows the chapters by name', () => {
    const { bound } = playingAt(0)
    bound.press('ShowContents')
    const chapters = listOf(
      Option.getOrThrow(nodeOf(topLayerOf(bound))),
      'Chapters',
    )
    expect(chapters.filter).toEqual({
      placeholder: 'Find a chapter',
      label: 'Find a chapter in The Lantern Keeper',
      emptyText: 'No chapter has that in its name.',
    })
  })

  it('heads the list with its tabs, and how many chapters there are and how long they run', () => {
    const { bound } = playingAt(0)
    bound.press('ShowContents')
    const panel = Option.getOrThrow(nodeOf(topLayerOf(bound)))
    expect(
      Array.map(buttonsOf(panel), button => [
        button.label,
        button.isCurrent === true,
        button.action,
      ]),
    ).toEqual([
      ['Contents', true, undefined],
      ['Bookmarks', false, 'ShowBookmarks'],
    ])
    expect(Array.map(textsOf(panel), text => text.content)).toContain(
      '4 chapters · 1h 20m',
    )
  })

  it('closes when Contents is pressed again, so its key and the picker open and close it', () => {
    const { bound } = playingAt(28 * minuteMs)
    bound.press('ShowContents')
    bound.press('ShowContents')
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen/28m00s'),
    )
    bound.pressKey(Interaction.keyInput('c'))
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen/28m00s/contents'),
    )
  })

  it('still plays a chapter from its row, and closes', () => {
    const { bound } = playingAt(28 * minuteMs)
    bound.press('ShowContents')
    bound.press('JumpToChapter:3')
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen/40m00s'),
    )
  })
})

describe('The chapter picker', () => {
  it('sits on the player with the chapter being read and what is left of it', () => {
    const { bound } = playingAt(28 * minuteMs)
    const picker = listOf(baseOf(bound), 'Chapter')
    expect(picker.items).toHaveLength(1)
    const [row] = picker.items
    expect(row?.title).toBe('The Light')
    expect(row?.lines).toEqual(['Chapter 2 of 4 · 12:00 left in it'])
    expect(row?.action).toBe('ShowContents')
    expect(Array.map(row?.trailing ?? [], button => button.icon)).toEqual([
      'Chapters',
    ])
  })

  it('opens the contents when pressed', () => {
    const { bound } = playingAt(28 * minuteMs)
    const [row] = listOf(baseOf(bound), 'Chapter').items
    bound.press(row?.action ?? '')
    expect(uriOf(bound)).toEqual(
      Option.some('/books/the-lantern-keeper/listen/28m00s/contents'),
    )
  })
})

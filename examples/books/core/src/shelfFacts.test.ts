import { Array, Effect, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { App } from './app.js'
import { ReceivedBookmarks, ReceivedPlaces, ReceivedShelf } from './fact.js'
import { BookmarkId, Milliseconds, TitleSlug } from './ids.js'
import { type Bookmark, InProgress, type Shelf } from './model.js'
import { longSampleShelf, sampleShelf } from './sample.js'
import { shelfFacts } from './shelfFacts.js'

// NOTE: A library store hands the whole shelf over each time anything on
// it changes, and a place is saved every ten seconds while a title plays.
// A Client is told the shelf once, then only what changed: the place, or
// the bookmark. The shelf comes whole again only when its titles change.

const lantern = TitleSlug.make('the-lantern-keeper')
const smallHours = TitleSlug.make('small-hours')

const placeAt = (slug: TitleSlug, seconds: number): InProgress =>
  InProgress({
    slug,
    placeMs: Milliseconds.make(seconds * 1_000),
    savedAtMs: 1_000 + seconds,
  })

const bookmark = (id: string, seconds: number): Bookmark => ({
  bookmarkId: BookmarkId.make(id),
  slug: lantern,
  atMs: Milliseconds.make(seconds * 1_000),
  createdAtMs: 5_000,
  maybeNote: Option.none(),
  maybeExcerpt: Option.none(),
})

// A store sends new objects each time, as a decoded query does.
const copyOf = (shelf: Shelf): Shelf => ({
  titles: Array.map(shelf.titles, title => ({ ...title })),
  progress: Array.map(shelf.progress, progress => ({ ...progress })),
  bookmarks: Array.map(shelf.bookmarks, each => ({ ...each })),
})

const factsOf = (shelves: ReadonlyArray<Shelf>) =>
  Effect.runPromise(
    Stream.runCollect(shelfFacts(Stream.fromIterable(shelves))),
  ).then(sent => [...sent])

describe('what a Client is told as the shelf changes', () => {
  it('is the whole shelf once, then nothing while it reads the same', async () => {
    expect(
      await factsOf([sampleShelf, copyOf(sampleShelf), copyOf(sampleShelf)]),
    ).toEqual([ReceivedShelf({ shelf: sampleShelf })])
  })

  it('is the place that was saved, not the shelf it is on', async () => {
    const playing = { ...sampleShelf, progress: [placeAt(lantern, 10)] }
    const later = {
      ...copyOf(sampleShelf),
      progress: [placeAt(lantern, 20)],
    }
    const facts = await factsOf([sampleShelf, playing, later])
    expect(facts).toEqual([
      ReceivedShelf({ shelf: sampleShelf }),
      ReceivedPlaces({ changed: [placeAt(lantern, 10)], removed: [] }),
      ReceivedPlaces({ changed: [placeAt(lantern, 20)], removed: [] }),
    ])
  })

  it('is small however long the shelf is', async () => {
    const [, saved] = await factsOf([
      longSampleShelf,
      { ...copyOf(longSampleShelf), progress: [placeAt(lantern, 10)] },
    ])
    expect(JSON.stringify(saved).length).toBeLessThan(200)
    expect(JSON.stringify(longSampleShelf).length).toBeGreaterThan(10_000)
  })

  it('is the bookmark that was added, changed or removed', async () => {
    const marked = { ...sampleShelf, bookmarks: [bookmark('b1', 30)] }
    const two = {
      ...sampleShelf,
      bookmarks: [bookmark('b1', 30), bookmark('b2', 60)],
    }
    const one = { ...sampleShelf, bookmarks: [bookmark('b2', 60)] }
    expect(await factsOf([sampleShelf, marked, two, one])).toEqual([
      ReceivedShelf({ shelf: sampleShelf }),
      ReceivedBookmarks({ changed: [bookmark('b1', 30)], removed: [] }),
      ReceivedBookmarks({ changed: [bookmark('b2', 60)], removed: [] }),
      ReceivedBookmarks({ changed: [], removed: [BookmarkId.make('b1')] }),
    ])
  })

  it('is a place and a bookmark, each as its own fact, when both changed at once', async () => {
    const both = {
      ...sampleShelf,
      progress: [placeAt(lantern, 10)],
      bookmarks: [bookmark('b1', 30)],
    }
    expect(await factsOf([sampleShelf, both])).toEqual([
      ReceivedShelf({ shelf: sampleShelf }),
      ReceivedPlaces({ changed: [placeAt(lantern, 10)], removed: [] }),
      ReceivedBookmarks({ changed: [bookmark('b1', 30)], removed: [] }),
    ])
  })

  it('is the whole shelf again when its titles change', async () => {
    const fewer = {
      ...sampleShelf,
      titles: Array.take(sampleShelf.titles, 2),
      progress: [placeAt(lantern, 10)],
    }
    expect(await factsOf([sampleShelf, fewer])).toEqual([
      ReceivedShelf({ shelf: sampleShelf }),
      ReceivedShelf({ shelf: fewer }),
    ])
  })
})

describe('a shelf a Client holds, told what changed', () => {
  const started = App.init()[0]
  const opened = App.update(started, ReceivedShelf({ shelf: sampleShelf }))[0]
  const shelfOf = (model: typeof started): Shelf =>
    model.library._tag === 'ShelfReady' ? model.library.shelf : sampleShelf

  it('takes a saved place and keeps its titles the very same', () => {
    const saved = App.update(
      opened,
      ReceivedPlaces({ changed: [placeAt(lantern, 10)], removed: [] }),
    )[0]
    expect(shelfOf(saved).progress).toEqual([placeAt(lantern, 10)])
    expect(shelfOf(saved).titles).toBe(shelfOf(opened).titles)
    expect(shelfOf(saved).bookmarks).toBe(shelfOf(opened).bookmarks)
  })

  it('moves one title’s place and leaves the others', () => {
    const two = App.update(
      opened,
      ReceivedPlaces({
        changed: [placeAt(lantern, 10), placeAt(smallHours, 5)],
        removed: [],
      }),
    )[0]
    const moved = App.update(
      two,
      ReceivedPlaces({ changed: [placeAt(lantern, 20)], removed: [] }),
    )[0]
    expect(shelfOf(moved).progress).toEqual([
      placeAt(lantern, 20),
      placeAt(smallHours, 5),
    ])
    const cleared = App.update(
      moved,
      ReceivedPlaces({ changed: [], removed: [smallHours] }),
    )[0]
    expect(shelfOf(cleared).progress).toEqual([placeAt(lantern, 20)])
  })

  it('takes a bookmark added and a bookmark removed', () => {
    const marked = App.update(
      opened,
      ReceivedBookmarks({ changed: [bookmark('b1', 30)], removed: [] }),
    )[0]
    expect(shelfOf(marked).bookmarks).toEqual([bookmark('b1', 30)])
    const removed = App.update(
      marked,
      ReceivedBookmarks({ changed: [], removed: [BookmarkId.make('b1')] }),
    )[0]
    expect(shelfOf(removed).bookmarks).toEqual([])
    expect(shelfOf(removed).titles).toBe(shelfOf(opened).titles)
  })

  it('leaves a shelf that has not opened as it is', () => {
    const waiting = App.update(
      started,
      ReceivedPlaces({ changed: [placeAt(lantern, 10)], removed: [] }),
    )[0]
    expect(waiting.library).toEqual(started.library)
  })
})

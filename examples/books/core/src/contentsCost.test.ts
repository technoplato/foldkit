import { Array, Record as Record_ } from 'effect'
import { describe, expect, it } from 'vitest'

import { App, type AppModel } from './app.js'
import { ChapterNumber, Milliseconds, TitleSlug } from './ids.js'
import { Open, ReceivedChapters, ReceivedShelf } from './message.js'
import { sampleChapters, sampleShelf } from './sample.js'
import { contentsScreen } from './screen.js'

const lanternKeeper = TitleSlug.make('the-lantern-keeper')

const chapterMs = 60_000

const madeUpChapters = (count: number) =>
  Array.makeBy(count, index => ({
    chapterNumber: ChapterNumber.make(index + 1),
    name: `Part ${(index + 1).toString()}`,
    startMs: Milliseconds.make(index * chapterMs),
    endMs: Milliseconds.make((index + 1) * chapterMs),
  }))

const onTitlePageWith = (chapterCount: number): AppModel => {
  const withShelf = Array.reduce(
    Record_.toEntries(sampleChapters),
    App.update(App.init()[0], ReceivedShelf({ shelf: sampleShelf }))[0],
    (current, [slug, chapters]) =>
      App.update(
        current,
        ReceivedChapters({ slug: TitleSlug.make(slug), chapters }),
      )[0],
  )
  const withChapters = App.update(
    withShelf,
    ReceivedChapters({
      slug: lanternKeeper,
      chapters: madeUpChapters(chapterCount),
    }),
  )[0]
  return App.update(withChapters, Open({ slug: lanternKeeper }))[0]
}

const readsOfTheShelfWhilePainting = (model: AppModel): number => {
  const counted = { reads: 0 }
  const watched = new Proxy(model, {
    get: (target, key, receiver) => {
      if (key === 'library') {
        counted.reads += 1
      }
      return Reflect.get(target, key, receiver)
    },
  })
  contentsScreen(watched)
  return counted.reads
}

describe('the cost of painting Contents', () => {
  it('reads the Catalog once, however many chapters there are', () => {
    const few = readsOfTheShelfWhilePainting(onTitlePageWith(4))
    const many = readsOfTheShelfWhilePainting(onTitlePageWith(120))
    expect(few).toBeGreaterThan(0)
    expect(many).toBe(few)
  })
})

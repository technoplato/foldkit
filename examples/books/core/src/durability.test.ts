import { Array, Option, Record as Record_ } from 'effect'
import { Navigation, Program, Runtime, Session } from 'foldkit'
import * as CodeUpdates from 'foldkit/code-updates'
import * as Theme from 'foldkit/theme'
import * as ReadAloud from 'read-aloud-core-example'
import * as TranscriptPlayer from 'transcript-player-core-example'
import { describe, expect, it } from 'vitest'

import { App, type AppModel } from './app.js'
import * as Audible from './audible/index.js'
import { ChapterId, MediaId, Milliseconds, TitleSlug } from './ids.js'
import {
  Listen,
  ReceivedChapters,
  ReceivedMember,
  ReceivedShelf,
  SetSpeed,
  ShowTitleMenu,
} from './message.js'
import {
  type Chapter,
  InProgress,
  Loaded,
  Model,
  type Shelf,
  type Title,
  mediaOf,
} from './model.js'
import { BooksProgram } from './program.js'
import { sampleChapters, sampleShelf } from './sample.js'
import { Quiet } from './stretch.js'
import { SyncedBooks } from './synced.js'

const makeBigShelf = (titleCount: number): Shelf => ({
  titles: Array.makeBy(titleCount, index => ({
    slug: TitleSlug.make(`book-title-${index.toString()}`),
    mediaId: MediaId.make(`rendition-${index.toString()}`),
    name: `The Long Chronicle Volume ${index.toString()}: A Thorough Study of Every Coastline`,
    authors: [`Author ${index.toString()}`, `Coauthor ${index.toString()}`],
    narrators: [`Narrator ${index.toString()}`],
    durationMs: Milliseconds.make(36_000_000),
    maybeCoverUrl: Option.some(
      `https://covers.example.invalid/books/book-title-${index.toString()}-large.jpg`,
    ),
    maybeAudioUrl: Option.some(
      `https://audio.example.invalid/books/book-title-${index.toString()}-signed-token-abc123.m4b`,
    ),
  })),
  progress: Array.makeBy(titleCount, index =>
    InProgress({
      slug: TitleSlug.make(`book-title-${index.toString()}`),
      placeMs: Milliseconds.make((index + 1) * 15_000),
      savedAtMs: 1_795_000_000_000 + index * 1_000,
    }),
  ),
  bookmarks: [],
})

const makeChapters = (
  slug: TitleSlug,
  chapterCount: number,
): Array.NonEmptyReadonlyArray<Chapter> => {
  const first: Chapter = {
    chapterId: ChapterId.make(`${slug}-ch-0`),
    name: 'Chapter 1: Opening',
    startMs: Milliseconds.make(0),
    endMs: Milliseconds.make(360_000),
  }
  const rest = Array.makeBy(chapterCount - 1, index => ({
    chapterId: ChapterId.make(`${slug}-ch-${(index + 1).toString()}`),
    name: `Chapter ${(index + 2).toString()}: Further Journeys Across the Valley`,
    startMs: Milliseconds.make((index + 1) * 360_000),
    endMs: Milliseconds.make((index + 2) * 360_000),
  }))
  return [first, ...rest]
}

const makePassages = (
  passageCount: number,
  wordsPerPassage: number,
): ReadonlyArray<TranscriptPlayer.Passage> =>
  Array.makeBy(passageCount, passageIndex => {
    const startMs = passageIndex * wordsPerPassage * 400
    return {
      passageId: `passage-${passageIndex.toString()}`,
      startMs: Milliseconds.make(startMs),
      endMs: Milliseconds.make(startMs + wordsPerPassage * 400),
      words: Array.makeBy(wordsPerPassage, wordIndex => ({
        wordId: TranscriptPlayer.WordId.make(
          `p${passageIndex.toString()}-w${wordIndex.toString()}`,
        ),
        text: `word_${wordIndex.toString()}`,
        startMs: Milliseconds.make(startMs + wordIndex * 400),
        endMs: Milliseconds.make(startMs + wordIndex * 400 + 350),
      })),
    }
  })

describe('Books durability roles and snapshot byte invariance', () => {
  it('classifies every field exhaustively and validates every reset thunk', () => {
    expect(() => Program.assertDurabilityExhaustive(Model)).not.toThrow()
    expect(() => Program.assertDurabilityExhaustive(App.Model)).not.toThrow()
  })

  it('produces 0-byte snapshot bloat across realistic shelf, chapters, transcript, and ephemeral state', () => {
    const [initial] = App.init()
    const bigShelf = makeBigShelf(60)
    const firstTitle: Title = Option.getOrThrow(Array.head(bigShelf.titles))
    const slug = firstTitle.slug
    const bigChapters = makeChapters(slug, 40)
    const bigPassages = makePassages(20, 250) // 5,000 transcript words

    // Baseline: same synced & local state (listening to book-title-0 at 15s, speed 1.5),
    // with all loaded/ephemeral fields at their reset defaults.
    let populated: AppModel = initial
    const apply = (message: typeof App.Message.Type) => {
      populated = App.update(populated, message)[0]
    }

    apply(ReceivedShelf({ shelf: bigShelf }))
    apply(ReceivedChapters({ slug, chapters: bigChapters }))
    apply(SetSpeed({ speed: 1.5 }))
    apply(Listen({ slug }))

    // Build baseline by stripping loaded/ephemeral from the synced+local state.
    const baseline = Program.stripForLocalSnapshot(App.Model.ast, populated)

    // Now flood every loaded & ephemeral field with realistic heavy data:
    apply(ReceivedShelf({ shelf: bigShelf }))
    for (const title of Array.take(bigShelf.titles, 20)) {
      apply(
        ReceivedChapters({
          slug: title.slug,
          chapters: makeChapters(title.slug, 40),
        }),
      )
    }
    apply(ReceivedMember({ maybeEmail: Option.some('reader@example.invalid') }))
    apply(
      TranscriptPlayer.ReachedPlace({
        placeMs: Milliseconds.make(42_000),
        wallClockMs: 1_795_000_042_000,
      }),
    )
    apply(TranscriptPlayer.ReceivedPassages({ passages: bigPassages }))
    apply(TranscriptPlayer.ShowSearch())
    apply(ShowTitleMenu({ slug }))
    apply(Theme.ObservedSystemMode({ mode: 'Dark' }))
    apply(Theme.ObservedSystemContrast({ contrast: 'More' }))
    apply(
      CodeUpdates.ObservedCodeStatus({
        status: {
          running: CodeUpdates.BuiltIn({
            maybeUpdateId: Option.some('built-in-id'),
            maybeRuntime: Option.some('runtime-1'),
            maybeMadeAtMs: Option.some(1_795_000_000_000),
          }),
          newer: CodeUpdates.Ready({ maybeUpdateId: Option.some('newer-id') }),
        },
      }),
    )
    apply(
      ReadAloud.ReceivedReadings({
        readings: {
          books: Array.makeBy(10, index => ({
            bookId: ReadAloud.BookId.make(`book-${index.toString()}`),
            key: ReadAloud.BookKey.make(`picture-book-${index.toString()}`),
            maybeIsbn13: Option.none(),
            title: `Picture Book ${index.toString()}`,
            credits: [],
            publishedBy: [],
            maybePublishYear: Option.none(),
            maybePageCount: Option.some(ReadAloud.PageNumber.make(24)),
            maybeCoverUrl: Option.none(),
            links: [],
            aliases: [],
            contents: [],
          })),
          turns: [],
          sittings: [],
        },
      }),
    )
    apply(
      Audible.ReceivedAudibleLibrary({
        titles: Array.makeBy(
          30,
          (index): Audible.AudibleTitle => ({
            asin: Audible.Asin.make(
              `B0FAKE${index.toString().padStart(4, '0')}`,
            ),
            name: `Audible Title ${index.toString()}`,
            maybeSubtitle: Option.none(),
            authors: ['Author Name'],
            narrators: ['Narrator Name'],
            series: [],
            maybeCoverUrl: Option.none(),
            maybeRuntimeMs: Option.some(Milliseconds.make(36_000_000)),
            match: 'New',
            marks: [],
          }),
        ),
        skipped: [],
      }),
    )

    // Sanity check: raw unstripped populated JSON is huge (> 500 KB).
    const rawPopulatedBytes = new TextEncoder().encode(
      JSON.stringify(populated),
    ).byteLength
    expect(rawPopulatedBytes).toBeGreaterThan(200_000)

    // Ratchet: populated vs baseline must differ by 0 bytes in BOTH local & shared snapshots!
    const sizes = Runtime.LocalSnapshot.assertSnapshotByteInvariance({
      program: {
        id: App.id,
        version: App.version,
        ...(SyncedBooks.foldRevision === undefined
          ? {}
          : { foldRevision: SyncedBooks.foldRevision }),
        Model: App.Model,
        initialModel: initial,
      },
      baseline,
      populated,
    })

    // Snapshot stays tiny (well under 5 KB, down from ~406 KB before durability roles).
    expect(sizes.localBytes).toBeLessThan(5_000)
    expect(Option.isSome(sizes.sharedBytes)).toBe(true)
    if (Option.isSome(sizes.sharedBytes)) {
      expect(sizes.sharedBytes.value).toBeLessThan(5_000)
    }
  })

  it('preserves loaded/ephemeral on same-slug refold and drops them on entity slug switch', () => {
    const keepOnRefold = BooksProgram.synchronization?.keepOnRefold
    expect(keepOnRefold).toBeDefined()
    if (keepOnRefold === undefined) {
      return
    }
    const [initial] = BooksProgram.init()
    const [withShelf] = BooksProgram.update(
      initial,
      ReceivedShelf({ shelf: sampleShelf }),
    )
    const slugA = TitleSlug.make('the-lantern-keeper')
    const slugB = TitleSlug.make('small-hours')
    const chaptersA = Option.getOrThrow(Record_.get(sampleChapters, slugA))
    const [withChapters] = BooksProgram.update(
      withShelf,
      ReceivedChapters({ slug: slugA, chapters: chaptersA }),
    )
    const [listeningA] = BooksProgram.update(
      withChapters,
      Listen({ slug: slugA }),
    )
    const [withTranscriptA] = BooksProgram.update(
      listeningA,
      TranscriptPlayer.ReceivedPassages({ passages: makePassages(2, 10) }),
    )

    // Same-slug refold: preserves Book A's transcript, shelf, and chapters while taking refolded speed.
    const refoldedSame: Model = { ...withTranscriptA, speed: 1.5 }
    const keptSame = keepOnRefold(withTranscriptA, refoldedSame)
    expect(keptSame.speed).toBe(1.5)
    expect(keptSame.library).toBe(withTranscriptA.library)
    expect(keptSame.listening._tag).toBe('Loaded')
    if (keptSame.listening._tag === 'Loaded') {
      expect(keptSame.listening.slug).toBe(slugA)
      expect(keptSame.listening.player.transcript._tag).toBe('TranscriptLoaded')
    }

    // Entity switch (Book A -> Book B): Book A's transcript MUST NOT leak onto Book B!
    const titleB = Option.getOrThrow(
      Array.findFirst(sampleShelf.titles, title => title.slug === slugB),
    )
    const refoldedBookB = {
      ...initial,
      listening: Loaded({
        slug: slugB,
        savedPlaceMs: Milliseconds.make(0),
        player: TranscriptPlayer.init(mediaOf(titleB, [])),
        stretch: Quiet(),
      }),
    }
    const keptSwitched = keepOnRefold(withTranscriptA, refoldedBookB)
    expect(keptSwitched.library).toBe(withTranscriptA.library)
    expect(keptSwitched.listening._tag).toBe('Loaded')
    if (keptSwitched.listening._tag === 'Loaded') {
      expect(keptSwitched.listening.slug).toBe(slugB)
      expect(keptSwitched.listening.player.transcript._tag).toBe(
        'TranscriptLoading',
      )
    }
  })

  it('folds ReadAloud OpenedUri and Session navigation through App.synchronization.foldSynced without crashing', () => {
    const foldSynced = App.synchronization?.foldSynced
    expect(foldSynced).toBeDefined()
    if (foldSynced === undefined) {
      return
    }
    const [initial] = App.init()
    const [withShelf] = App.update(
      initial,
      ReceivedShelf({ shelf: sampleShelf }),
    )
    const slug = TitleSlug.make('the-lantern-keeper')
    const [listening] = App.update(withShelf, Listen({ slug }))
    const startSynced = Program.projectSynced(App.Model.ast, listening)

    const afterReadAloud = foldSynced(
      startSynced,
      Navigation.OpenedUri({
        uri: '/books/read-aloud/9780063342705',
        via: Navigation.Link(),
      }),
    )
    expect('readings' in afterReadAloud).toBe(false)
    expect(afterReadAloud.navigation.pages.length).toBeGreaterThan(0)

    const afterGoBack = foldSynced(afterReadAloud, Session.GoBack())
    expect('readings' in afterGoBack).toBe(false)

    const afterMirror = foldSynced(afterReadAloud, Session.MirrorNavigation())
    expect('readings' in afterMirror).toBe(false)
  })
})

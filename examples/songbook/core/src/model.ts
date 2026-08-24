import { Array, Option, Schema as S, String as Str, pipe } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

import {
  Line,
  Section,
  Song,
  Word,
  displayTitle,
  findSongWord,
} from './domain/index.js'

// MODEL

/** Succeeded notice. */
export const Succeeded = ts('Succeeded')
/** Failed notice. */
export const Failed = ts('Failed')
/** Notice kind. */
export const NoticeKind = S.Union([Succeeded, Failed])
/** Notice kind. */
export type NoticeKind = typeof NoticeKind.Type

/** No extra notice detail. */
export const DetailNone = ts('None')
/** Extra notice detail. */
export const DetailSome = ts('Some', { text: NonEmptyString })
/** Notice detail. */
export const Detail = S.Union([DetailNone, DetailSome])
/** Notice detail. */
export type Detail = typeof Detail.Type

/** No notice. */
export const NoticeNone = ts('None')
/** A notice. */
export const NoticeSome = ts('Some', {
  kind: NoticeKind,
  title: NonEmptyString,
  detail: Detail,
})
/** Transient notice. */
export const Notice = S.Union([NoticeNone, NoticeSome])
/** Transient notice. */
export type Notice = typeof Notice.Type

/** No search query. */
export const Idle = ts('Idle')
/** A search query. */
export const Searching = ts('Searching', { query: NonEmptyString })
/** Library looking. */
export const Looking = S.Union([Idle, Searching])
/** Library looking. */
export type Looking = typeof Looking.Type

/** No songs before the current chart song. */
export const BeforeNone = ts('None')
/** Songs before the current chart song. */
export const BeforeSome = ts('Some', { items: S.NonEmptyArray(Song) })
/** Songs before the current chart song. */
export const Before = S.Union([BeforeNone, BeforeSome])
/** Songs before the current chart song. */
export type Before = typeof Before.Type

/** No songs after the current chart song. */
export const AfterNone = ts('None')
/** Songs after the current chart song. */
export const AfterSome = ts('Some', { items: S.NonEmptyArray(Song) })
/** Songs after the current chart song. */
export const After = S.Union([AfterNone, AfterSome])
/** Songs after the current chart song. */
export type After = typeof After.Type

/** Shelf idle. The songs bag lives here so Confirming is the zipper. */
export const DeletingIdle = ts('Idle', {
  songs: S.NonEmptyArray(Song),
})
/** Confirming delete of the zipper current. Current is a member. */
export const Confirming = ts('Confirming', {
  before: Before,
  current: Song,
  after: After,
})
/** Shelf delete. */
export const Deleting = S.Union([DeletingIdle, Confirming])
/** Shelf delete. */
export type Deleting = typeof Deleting.Type

/** Viewing the chart. */
export const Viewing = ts('Viewing')
/** No typed draft. */
export const DraftNone = ts('None')
/** A typed draft. */
export const DraftSome = ts('Some', { text: NonEmptyString })
/** Lyrics or chord draft. */
export const Draft = S.Union([DraftNone, DraftSome])
/** Lyrics or chord draft. */
export type Draft = typeof Draft.Type

/** No sections before the current section. */
export const SectionsBeforeNone = ts('None')
/** Sections before the current section. */
export const SectionsBeforeSome = ts('Some', {
  items: S.NonEmptyArray(Section),
})
/** Sections before the current section. */
export const SectionsBefore = S.Union([SectionsBeforeNone, SectionsBeforeSome])
/** Sections before the current section. */
export type SectionsBefore = typeof SectionsBefore.Type

/** No sections after the current section. */
export const SectionsAfterNone = ts('None')
/** Sections after the current section. */
export const SectionsAfterSome = ts('Some', {
  items: S.NonEmptyArray(Section),
})
/** Sections after the current section. */
export const SectionsAfter = S.Union([SectionsAfterNone, SectionsAfterSome])
/** Sections after the current section. */
export type SectionsAfter = typeof SectionsAfter.Type

/** No lines before the current line. */
export const LinesBeforeNone = ts('None')
/** Lines before the current line. */
export const LinesBeforeSome = ts('Some', { items: S.NonEmptyArray(Line) })
/** Lines before the current line. */
export const LinesBefore = S.Union([LinesBeforeNone, LinesBeforeSome])
/** Lines before the current line. */
export type LinesBefore = typeof LinesBefore.Type

/** No lines after the current line. */
export const LinesAfterNone = ts('None')
/** Lines after the current line. */
export const LinesAfterSome = ts('Some', { items: S.NonEmptyArray(Line) })
/** Lines after the current line. */
export const LinesAfter = S.Union([LinesAfterNone, LinesAfterSome])
/** Lines after the current line. */
export type LinesAfter = typeof LinesAfter.Type

/** No words before the current word. */
export const WordsBeforeNone = ts('None')
/** Words before the current word. */
export const WordsBeforeSome = ts('Some', { items: S.NonEmptyArray(Word) })
/** Words before the current word. */
export const WordsBefore = S.Union([WordsBeforeNone, WordsBeforeSome])
/** Words before the current word. */
export type WordsBefore = typeof WordsBefore.Type

/** No words after the current word. */
export const WordsAfterNone = ts('None')
/** Words after the current word. */
export const WordsAfterSome = ts('Some', { items: S.NonEmptyArray(Word) })
/** Words after the current word. */
export const WordsAfter = S.Union([WordsAfterNone, WordsAfterSome])
/** Words after the current word. */
export type WordsAfter = typeof WordsAfter.Type

/** Editing lyrics of the zipper current section. */
export const Lyrics = ts('Lyrics', {
  before: SectionsBefore,
  current: Section,
  after: SectionsAfter,
  draft: Draft,
})

/** Placing a chord on the zipper current word. */
export const WordFocus = ts('Word', {
  sectionsBefore: SectionsBefore,
  section: Section,
  sectionsAfter: SectionsAfter,
  linesBefore: LinesBefore,
  line: Line,
  linesAfter: LinesAfter,
  wordsBefore: WordsBefore,
  word: Word,
  wordsAfter: WordsAfter,
  draft: Draft,
})
/** Removing the zipper current section. */
export const Removing = ts('Removing', {
  before: SectionsBefore,
  current: Section,
  after: SectionsAfter,
})
/** Editing focus. */
export const Focus = S.Union([Viewing, Lyrics, WordFocus, Removing])
/** Editing focus. */
export type Focus = typeof Focus.Type

/** Editing a chart. */
export const Editing = ts('Editing', { focus: Focus })
/** Playing a chart. */
export const Playing = ts('Playing')
/** Chart working. */
export const Working = S.Union([Editing, Playing])
/** Chart working. */
export type Working = typeof Working.Type

/** Empty library on the shelf. */
export const EmptyShelf = ts('Shelf', { looking: Looking })
/** Empty library on an unknown path. */
export const EmptyUnknown = ts('Unknown', { path: NonEmptyString })
/** Empty library place. */
export const Place = S.Union([EmptyShelf, EmptyUnknown])
/** Empty library place. */
export type Place = typeof Place.Type

/** Populated library on the shelf. */
export const PopulatedShelf = ts('Shelf', {
  looking: Looking,
  deleting: Deleting,
})
/** Populated library on a chart. */
export const PopulatedChart = ts('Chart', {
  before: Before,
  current: Song,
  after: After,
  working: Working,
})
/** Populated library on an unknown path. */
export const PopulatedUnknown = ts('Unknown', {
  songs: S.NonEmptyArray(Song),
  path: NonEmptyString,
})
/** Populated library place. */
export const PopulatedPlace = S.Union([
  PopulatedShelf,
  PopulatedChart,
  PopulatedUnknown,
])
/** Populated library place. */
export type PopulatedPlace = typeof PopulatedPlace.Type

/** A library with no songs. */
export const LibraryEmpty = ts('Empty', { place: Place })
/** A library with songs. */
export const LibraryPopulated = ts('Populated', { place: PopulatedPlace })
/** Song library. */
export const Library = S.Union([LibraryEmpty, LibraryPopulated])
/** Song library. */
export type Library = typeof Library.Type

/** The Songbook Model. */
export const Model = S.Struct({
  notice: Notice,
  library: Library,
})
/** The Songbook Model. */
export type Model = typeof Model.Type

/** Product identity title printed by hosts that need a document title. */
export const title = 'Songbook'

/** Empty library on the shelf. */
export const emptyModel = (): Model =>
  Model.make({
    notice: NoticeNone(),
    library: LibraryEmpty.make({
      place: EmptyShelf.make({ looking: Idle() }),
    }),
  })

type Identified = Readonly<{ id: string }>

type Rest<A> =
  | Readonly<{ _tag: 'None' }>
  | Readonly<{ _tag: 'Some'; items: Array.NonEmptyReadonlyArray<A> }>

const itemsOf = <A>(side: Rest<A>): ReadonlyArray<A> =>
  side._tag === 'None' ? [] : side.items

const sideOf = <A, Some, None>(
  items: ReadonlyArray<A>,
  some: Readonly<{
    make: (fields: { items: Array.NonEmptyReadonlyArray<A> }) => Some
  }>,
  none: () => None,
): Some | None =>
  Array.match(items, {
    onEmpty: () => none(),
    onNonEmpty: populated => some.make({ items: populated }),
  })

/** Members of a zipper. Current is always in the bag. */
export const zipperItems = <A>(
  before: Rest<A>,
  current: A,
  after: Rest<A>,
): Array.NonEmptyReadonlyArray<A> =>
  Array.match(itemsOf(before), {
    onEmpty: () => Array.prepend(itemsOf(after), current),
    onNonEmpty: populated =>
      Array.appendAll(Array.append(populated, current), itemsOf(after)),
  })

const zipperAtMember = <
  A extends Identified,
  BeforeSomeT,
  BeforeNoneT,
  AfterSomeT,
  AfterNoneT,
>(
  items: Array.NonEmptyReadonlyArray<A>,
  member: A,
  beforeSome: Readonly<{
    make: (fields: { items: Array.NonEmptyReadonlyArray<A> }) => BeforeSomeT
  }>,
  beforeNone: () => BeforeNoneT,
  afterSome: Readonly<{
    make: (fields: { items: Array.NonEmptyReadonlyArray<A> }) => AfterSomeT
  }>,
  afterNone: () => AfterNoneT,
): Option.Option<
  Readonly<{
    before: BeforeSomeT | BeforeNoneT
    current: A
    after: AfterSomeT | AfterNoneT
  }>
> => {
  const maybeIndex = Array.findFirstIndex(items, item => item.id === member.id)
  if (Option.isNone(maybeIndex)) {
    return Option.none()
  }
  const beforeItems = pipe(items, Array.take(maybeIndex.value))
  const afterItems = pipe(items, Array.drop(maybeIndex.value + 1))
  return Option.some({
    before: sideOf(beforeItems, beforeSome, beforeNone),
    current: member,
    after: sideOf(afterItems, afterSome, afterNone),
  })
}

/** Songs of a chart zipper. Current is always a member. */
export const songsOfChart = (
  chart: typeof PopulatedChart.Type,
): Array.NonEmptyReadonlyArray<Song> =>
  zipperItems(chart.before, chart.current, chart.after)

/** Songs of a shelf delete zipper or idle bag. */
export const songsOfDeleting = (
  deleting: Deleting,
): Array.NonEmptyReadonlyArray<Song> => {
  if (deleting._tag === 'Idle') {
    return deleting.songs
  }
  return zipperItems(deleting.before, deleting.current, deleting.after)
}

/** Songs of a populated library. */
export const songsOfPopulated = (
  place: PopulatedPlace,
): Array.NonEmptyReadonlyArray<Song> => {
  if (place._tag === 'Chart') {
    return songsOfChart(place)
  }
  if (place._tag === 'Unknown') {
    return place.songs
  }
  return songsOfDeleting(place.deleting)
}

/** Splits a populated list at a member. */
export const zipperAt = (
  songs: Array.NonEmptyReadonlyArray<Song>,
  member: Song,
): Option.Option<typeof PopulatedChart.Type> =>
  Option.map(
    zipperAtMember(songs, member, BeforeSome, BeforeNone, AfterSome, AfterNone),
    zip =>
      PopulatedChart.make({
        ...zip,
        working: Editing.make({ focus: Viewing() }),
      }),
  )

/** Section zipper for lyrics or removing. */
export const sectionZipperAt = (
  sections: Array.NonEmptyReadonlyArray<Section>,
  member: Section,
) =>
  zipperAtMember(
    sections,
    member,
    SectionsBeforeSome,
    SectionsBeforeNone,
    SectionsAfterSome,
    SectionsAfterNone,
  )

/** Lyrics focus from a populated song member. */
export const lyricsAt = (
  sections: Array.NonEmptyReadonlyArray<Section>,
  member: Section,
  draft: Draft,
): Option.Option<typeof Lyrics.Type> =>
  Option.map(sectionZipperAt(sections, member), zip =>
    Lyrics.make({ ...zip, draft }),
  )

/** Removing focus from a populated song member. */
export const removingAt = (
  sections: Array.NonEmptyReadonlyArray<Section>,
  member: Section,
): Option.Option<typeof Removing.Type> =>
  Option.map(sectionZipperAt(sections, member), zip => Removing.make(zip))

/** Word focus from members of the current song. */
export const wordFocusAt = (
  song: Song,
  wordId: Word['id'],
  draft: Draft,
): Option.Option<typeof WordFocus.Type> => {
  const songSections = song.sections
  if (songSections._tag === 'Empty') {
    return Option.none()
  }
  return Option.flatMap(findSongWord(song, wordId), found => {
    const sectionLines = found.section.lines
    if (sectionLines._tag === 'Empty') {
      return Option.none()
    }
    const lineBody = found.line.body
    if (lineBody._tag !== 'Words') {
      return Option.none()
    }
    return Option.flatMap(
      zipperAtMember(
        songSections.items,
        found.section,
        SectionsBeforeSome,
        SectionsBeforeNone,
        SectionsAfterSome,
        SectionsAfterNone,
      ),
      sections =>
        Option.flatMap(
          zipperAtMember(
            sectionLines.items,
            found.line,
            LinesBeforeSome,
            LinesBeforeNone,
            LinesAfterSome,
            LinesAfterNone,
          ),
          lines =>
            Option.map(
              zipperAtMember(
                lineBody.items,
                found.word,
                WordsBeforeSome,
                WordsBeforeNone,
                WordsAfterSome,
                WordsAfterNone,
              ),
              words =>
                WordFocus.make({
                  sectionsBefore: sections.before,
                  section: sections.current,
                  sectionsAfter: sections.after,
                  linesBefore: lines.before,
                  line: lines.current,
                  linesAfter: lines.after,
                  wordsBefore: words.before,
                  word: words.current,
                  wordsAfter: words.after,
                  draft,
                }),
            ),
        ),
    )
  })
}

/** Replaces the current chart song and keeps zipper membership. */
export const replaceCurrent = (
  chart: typeof PopulatedChart.Type,
  current: Song,
): typeof PopulatedChart.Type =>
  PopulatedChart.make({
    ...chart,
    current,
  })

/** Shown shelf rows. Derived from songs and looking. */
export const shownSongs = (
  songs: Array.NonEmptyReadonlyArray<Song>,
  looking: Looking,
): ReadonlyArray<Song> => {
  if (looking._tag === 'Idle') {
    return songs
  }
  const query = pipe(looking.query, Str.toLowerCase)
  return Array.filter(songs, song => {
    const titleText = pipe(displayTitle(song), Str.toLowerCase)
    if (pipe(titleText, Str.includes(query))) {
      return true
    }
    if (song.artist._tag === 'None') {
      return false
    }
    return pipe(song.artist.name, Str.toLowerCase, Str.includes(query))
  })
}

/** Draft from typed text. Empty is None. */
export const draftFromText = (text: string): Draft =>
  Str.isEmpty(text)
    ? DraftNone()
    : DraftSome.make({ text: NonEmptyString.make(text) })

/** Editable draft text. None is empty. */
export const draftText = (draft: Draft): string =>
  draft._tag === 'None' ? '' : draft.text

/** Clears a notice. */
export const withoutNotice = (model: Model): Model =>
  Model.make({
    ...model,
    notice: NoticeNone(),
  })

/** Sets a succeeded notice. */
export const succeededNotice = (
  model: Model,
  heading: string,
  detail?: string,
): Model =>
  Model.make({
    ...model,
    notice: NoticeSome.make({
      kind: Succeeded(),
      title: NonEmptyString.make(heading),
      detail:
        detail === undefined || Str.isEmpty(detail)
          ? DetailNone()
          : DetailSome.make({ text: NonEmptyString.make(detail) }),
    }),
  })

/** Finds a library member by id. */
export const findSong = (
  songs: Array.NonEmptyReadonlyArray<Song>,
  songId: Song['id'],
): Option.Option<Song> => Array.findFirst(songs, song => song.id === songId)

/** Replaces a populated library place. */
export const withPlace = (model: Model, place: PopulatedPlace): Model =>
  Model.make({
    ...model,
    library: LibraryPopulated.make({ place }),
  })

/** Replaces the whole library. */
export const withLibrary = (model: Model, library: Library): Model =>
  Model.make({
    ...model,
    library,
  })

/** Sets a failed notice. */
export const failedNotice = (
  model: Model,
  heading: string,
  detail?: string,
): Model =>
  Model.make({
    ...model,
    notice: NoticeSome.make({
      kind: Failed(),
      title: NonEmptyString.make(heading),
      detail:
        detail === undefined || Str.isEmpty(detail)
          ? DetailNone()
          : DetailSome.make({ text: NonEmptyString.make(detail) }),
    }),
  })

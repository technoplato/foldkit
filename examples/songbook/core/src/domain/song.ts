import { Array, Option, Schema as S, String as Str, pipe } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

import { Chord, displayChord, printChord } from './chord.js'
import { SectionId, SongId, sectionIdAt } from './ids.js'
import {
  ChordsNone,
  ChordsSome,
  Line,
  Placed,
  Word,
  Words,
  lyricOf,
} from './line.js'
import { Pitch, printPitch } from './pitch.js'
import {
  LinesPopulated,
  Section,
  SectionKind,
  findLine,
  findSectionWord,
  kindLabel,
} from './section.js'

/** Transpose of zero. Stored chords are already in this key. */
export const Unison = ts('Unison')
/** Transpose steps excluding zero. */
export const TransposeSteps = S.Literals([
  -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11,
])
/** Transpose steps excluding zero. */
export type TransposeSteps = typeof TransposeSteps.Type
/** A shifted transpose. */
export const Shifted = ts('Shifted', { steps: TransposeSteps })
/** Display transpose. Zero is unison, not a number. */
export const Transpose = S.Union([Unison, Shifted])
/** Display transpose. */
export type Transpose = typeof Transpose.Type

/** Capo fret 1 through 12. */
export const CapoFret = S.Literals([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
/** Capo fret 1 through 12. */
export type CapoFret = typeof CapoFret.Type
/** No capo. */
export const CapoNone = ts('None')
/** A capo on a fret. */
export const CapoFretted = ts('Fretted', { fret: CapoFret })
/** Capo. Zero is none, not a fret. */
export const Capo = S.Union([CapoNone, CapoFretted])
/** Capo. */
export type Capo = typeof Capo.Type

/** Untitled song. */
export const Untitled = ts('Untitled')
/** A named title. */
export const Named = ts('Named', { name: NonEmptyString })
/** Song title. */
export const Title = S.Union([Untitled, Named])
/** Song title. */
export type Title = typeof Title.Type

/** No artist. */
export const ArtistNone = ts('None')
/** A named artist. */
export const ArtistSome = ts('Some', { name: NonEmptyString })
/** Artist. */
export const Artist = S.Union([ArtistNone, ArtistSome])
/** Artist. */
export type Artist = typeof Artist.Type

/** No original key. */
export const KeyNone = ts('None')
/** A written original key. */
export const KeySome = ts('Some', { pitch: Pitch })
/** Original key. */
export const Key = S.Union([KeyNone, KeySome])
/** Original key. */
export type Key = typeof Key.Type

/** A song with no sections. */
export const SectionsEmpty = ts('Empty')
/** Populated sections with no member zipper. */
export const SectionsIdle = ts('Idle', {
  items: S.NonEmptyArray(Section),
})

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

/**
 * Sections of a song. Zippers replace the bag so lyrics, word, and
 * removing cannot disagree with the stored items.
 */
export const Sections = S.Union([
  SectionsEmpty,
  SectionsIdle,
  Lyrics,
  WordFocus,
  Removing,
])
/** Sections of a song. */
export type Sections = typeof Sections.Type

/** One song in the library. */
export const Song = S.Struct({
  id: SongId,
  title: Title,
  artist: Artist,
  key: Key,
  transpose: Transpose,
  capo: Capo,
  sections: Sections,
})
/** One song in the library. */
export type Song = typeof Song.Type

/** A new untitled song with no sections. */
export const blankSong = (id: SongId): Song =>
  Song.make({
    id,
    title: Untitled(),
    artist: ArtistNone(),
    key: KeyNone(),
    transpose: Unison(),
    capo: CapoNone(),
    sections: SectionsEmpty(),
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

/** Splits a populated list at a member. Current is always in the bag. */
export const zipperAtMember = <
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

const lineOfWord = (word: typeof WordFocus.Type): Line => {
  if (word.line.body._tag !== 'Words') {
    return word.line
  }
  return Line.make({
    ...word.line,
    body: Words.make({
      items: zipperItems(word.wordsBefore, word.word, word.wordsAfter),
      chords: word.line.body.chords,
    }),
  })
}

const sectionOfWord = (word: typeof WordFocus.Type): Section => {
  const line = lineOfWord(word)
  return Section.make({
    ...word.section,
    lines: LinesPopulated.make({
      items: zipperItems(word.linesBefore, line, word.linesAfter),
    }),
  })
}

/** Idle bag or empty. Zippers flatten to the members they hold. */
export const flattenSections = (
  sections: Sections,
): typeof SectionsEmpty.Type | typeof SectionsIdle.Type => {
  if (sections._tag === 'Empty') {
    return SectionsEmpty()
  }
  if (sections._tag === 'Idle') {
    return sections
  }
  if (sections._tag === 'Word') {
    return SectionsIdle.make({
      items: zipperItems(
        sections.sectionsBefore,
        sectionOfWord(sections),
        sections.sectionsAfter,
      ),
    })
  }
  return SectionsIdle.make({
    items: zipperItems(sections.before, sections.current, sections.after),
  })
}

/** Song whose sections zipper is flattened to Empty or Idle. */
export const flattenSong = (song: Song): Song =>
  Song.make({
    ...song,
    sections: flattenSections(song.sections),
  })

/** Draft from typed text. Empty is None. */
export const draftFromText = (text: string): Draft =>
  Str.isEmpty(text)
    ? DraftNone()
    : DraftSome.make({ text: NonEmptyString.make(text) })

/** Editable draft text. None is empty. */
export const draftText = (draft: Draft): string =>
  draft._tag === 'None' ? '' : draft.text

/** Lyrics zipper from a populated song member. */
export const lyricsAt = (
  sections: Array.NonEmptyReadonlyArray<Section>,
  member: Section,
  draft: Draft,
): Option.Option<typeof Lyrics.Type> =>
  Option.map(sectionZipperAt(sections, member), zip =>
    Lyrics.make({ ...zip, draft }),
  )

/** Removing zipper from a populated song member. */
export const removingAt = (
  sections: Array.NonEmptyReadonlyArray<Section>,
  member: Section,
): Option.Option<typeof Removing.Type> =>
  Option.map(sectionZipperAt(sections, member), zip => Removing.make(zip))

/** Word zipper from members of the current song. */
export const wordFocusAt = (
  song: Song,
  wordId: Word['id'],
  draft: Draft,
): Option.Option<typeof WordFocus.Type> => {
  const idle = flattenSong(song)
  const songSections = idle.sections
  if (songSections._tag !== 'Idle') {
    return Option.none()
  }
  return Option.flatMap(findSongWord(idle, wordId), found => {
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

/** Next replay-safe section id for a song. */
export const nextSectionId = (song: Song): SectionId => {
  const bag = flattenSections(song.sections)
  if (bag._tag === 'Empty') {
    return sectionIdAt(song.id, 0)
  }
  return sectionIdAt(song.id, bag.items.length)
}

/** Numeric transpose used only for display math. */
export const transposeStepsOf = (transpose: Transpose): number =>
  transpose._tag === 'Unison' ? 0 : transpose.steps

/** Numeric capo used only for display math. */
export const capoFretOf = (capo: Capo): number =>
  capo._tag === 'None' ? 0 : capo.fret

/** Printed title. Untitled is a case, not stored text. */
export const displayTitle = (song: Song): string =>
  song.title._tag === 'Untitled' ? 'Untitled' : song.title.name

const clampTranspose = (steps: number): Transpose => {
  if (steps === 0) {
    return Unison()
  }
  const wrapped = ((steps + 11 + 12 * 4) % 12) - 11
  if (wrapped === 0) {
    return Unison()
  }
  return Shifted.make({ steps: TransposeSteps.make(wrapped) })
}

/** Moves transpose up one semitone. */
export const transposeUp = (song: Song): Song =>
  Song.make({
    ...song,
    transpose: clampTranspose(transposeStepsOf(song.transpose) + 1),
  })

/** Moves transpose down one semitone. */
export const transposeDown = (song: Song): Song =>
  Song.make({
    ...song,
    transpose: clampTranspose(transposeStepsOf(song.transpose) - 1),
  })

const nextFret = (fret: number): Capo => {
  if (fret <= 0) {
    return CapoNone()
  }
  if (fret > 12) {
    return CapoFretted.make({ fret: 12 })
  }
  return CapoFretted.make({ fret: CapoFret.make(fret) })
}

/** Moves capo up one fret. */
export const capoUp = (song: Song): Song =>
  Song.make({
    ...song,
    capo: nextFret(capoFretOf(song.capo) + 1),
  })

/** Moves capo down one fret. */
export const capoDown = (song: Song): Song =>
  Song.make({
    ...song,
    capo: nextFret(capoFretOf(song.capo) - 1),
  })

/** Finds a section member. */
export const findSection = (
  song: Song,
  sectionId: SectionId,
): Option.Option<Section> => {
  const bag = flattenSections(song.sections)
  if (bag._tag === 'Empty') {
    return Option.none()
  }
  return Array.findFirst(bag.items, section => section.id === sectionId)
}

/** Finds a word member in the song. */
export const findSongWord = (
  song: Song,
  wordId: Word['id'],
): Option.Option<Readonly<{ section: Section; line: Line; word: Word }>> => {
  const bag = flattenSections(song.sections)
  if (bag._tag === 'Empty') {
    return Option.none()
  }
  return pipe(
    bag.items,
    Array.findFirst(section => Option.isSome(findSectionWord(section, wordId))),
    Option.flatMap(section =>
      Option.map(findSectionWord(section, wordId), found => ({
        section,
        ...found,
      })),
    ),
  )
}

const replaceSection = (song: Song, next: Section): Song => {
  const bag = flattenSections(song.sections)
  if (bag._tag === 'Empty') {
    return song
  }
  const items = Array.map(bag.items, section =>
    section.id === next.id ? next : section,
  )
  return Array.match(items, {
    onEmpty: () => song,
    onNonEmpty: populated =>
      Song.make({
        ...song,
        sections: SectionsIdle.make({ items: populated }),
      }),
  })
}

/** Replaces one section. */
export const updateSection = (
  song: Song,
  sectionId: SectionId,
  f: (section: Section) => Section,
): Song =>
  Option.match(findSection(song, sectionId), {
    onNone: () => song,
    onSome: section => replaceSection(song, f(section)),
  })

/** Adds a section. Empty becomes idle. */
export const addSection = (song: Song, section: Section): Song => {
  const bag = flattenSections(song.sections)
  if (bag._tag === 'Empty') {
    return Song.make({
      ...song,
      sections: SectionsIdle.make({ items: [section] }),
    })
  }
  return Song.make({
    ...song,
    sections: SectionsIdle.make({
      items: Array.append(bag.items, section),
    }),
  })
}

/** Removes a section member. Last section becomes empty. */
export const removeSection = (song: Song, sectionId: SectionId): Song => {
  const bag = flattenSections(song.sections)
  if (bag._tag === 'Empty') {
    return song
  }
  const remaining = Array.filter(bag.items, section => section.id !== sectionId)
  return Array.match(remaining, {
    onEmpty: () =>
      Song.make({
        ...song,
        sections: SectionsEmpty(),
      }),
    onNonEmpty: items =>
      Song.make({
        ...song,
        sections: SectionsIdle.make({ items }),
      }),
  })
}

const replaceLine = (section: Section, next: Line): Section => {
  if (section.lines._tag === 'Empty') {
    return section
  }
  const items = Array.map(section.lines.items, line =>
    line.id === next.id ? next : line,
  )
  return Array.match(items, {
    onEmpty: () => section,
    onNonEmpty: populated =>
      Section.make({
        ...section,
        lines: LinesPopulated.make({ items: populated }),
      }),
  })
}

const upsertPlaced = (line: Line, placed: Placed): Line => {
  if (line.body._tag === 'Blank') {
    return line
  }
  const existing =
    line.body.chords._tag === 'None' ? [] : line.body.chords.items
  const without = Array.filter(
    existing,
    item => item.word.id !== placed.word.id,
  )
  const next = Array.append(without, placed)
  return Array.match(next, {
    onEmpty: () =>
      Line.make({
        ...line,
        body: Words.make({ items: line.body.items, chords: ChordsNone() }),
      }),
    onNonEmpty: items =>
      Line.make({
        ...line,
        body: Words.make({
          items: line.body.items,
          chords: ChordsSome.make({ items }),
        }),
      }),
  })
}

const clearPlaced = (line: Line, wordId: Word['id']): Line => {
  if (line.body._tag === 'Blank') {
    return line
  }
  if (line.body.chords._tag === 'None') {
    return line
  }
  const remaining = Array.filter(
    line.body.chords.items,
    item => item.word.id !== wordId,
  )
  return Array.match(remaining, {
    onEmpty: () =>
      Line.make({
        ...line,
        body: Words.make({ items: line.body.items, chords: ChordsNone() }),
      }),
    onNonEmpty: items =>
      Line.make({
        ...line,
        body: Words.make({
          items: line.body.items,
          chords: ChordsSome.make({ items }),
        }),
      }),
  })
}

/** Places or replaces a chord on a word. */
export const placeChord = (song: Song, word: Word, chord: Chord): Song =>
  Option.match(findSongWord(song, word.id), {
    onNone: () => song,
    onSome: ({ section, line }) =>
      replaceSection(
        song,
        replaceLine(section, upsertPlaced(line, Placed.make({ word, chord }))),
      ),
  })

/** Clears a chord from a word. */
export const clearChord = (song: Song, wordId: Word['id']): Song =>
  Option.match(findSongWord(song, wordId), {
    onNone: () => song,
    onSome: ({ section, line }) =>
      replaceSection(song, replaceLine(section, clearPlaced(line, wordId))),
  })

const padRight = (text: string, width: number): string =>
  text.length >= width ? text : text + ' '.repeat(width - text.length)

const formatLine = (line: Line, transpose: number, capo: number): string => {
  if (line.body._tag === 'Blank') {
    return ''
  }
  const lyric = lyricOf(line)
  if (line.body.chords._tag === 'None') {
    return lyric
  }
  const chordRow = Array.reduce(line.body.chords.items, '', (row, placed) => {
    const start = lyric.indexOf(placed.word.text)
    const at = start < 0 ? row.length : start
    const name = displayChord(placed.chord, transpose, capo)
    return `${padRight(row, at)}${name}`
  })
  return pipe(chordRow, Str.trimEnd, chords =>
    Str.isNonEmpty(chords) ? `${chords}\n${lyric}` : lyric,
  )
}

const formatSection = (
  section: Section,
  transpose: number,
  capo: number,
): string => {
  const heading = `[${kindLabel(section.kind)}]`
  if (section.lines._tag === 'Empty') {
    return heading
  }
  return pipe(
    section.lines.items,
    Array.map(line => formatLine(line, transpose, capo)),
    Array.join('\n'),
    body => `${heading}\n${body}`,
  )
}

/** Text chart for copy and play. */
export const toChartText = (song: Song): string => {
  const title = displayTitle(song)
  const artistLine = song.artist._tag === 'None' ? '' : song.artist.name
  const keyLine =
    song.key._tag === 'None' ? '' : `Key: ${printPitch(song.key.pitch)}`
  const capoLine =
    song.capo._tag === 'None' ? '' : `Capo: ${String(song.capo.fret)}`
  const steps = transposeStepsOf(song.transpose)
  const transposeLine =
    steps === 0 ? '' : `Transpose: ${steps > 0 ? '+' : ''}${String(steps)}`
  const header = pipe(
    [title, artistLine, keyLine, capoLine, transposeLine],
    Array.filter(Str.isNonEmpty),
    Array.join('\n'),
  )
  const bag = flattenSections(song.sections)
  const body =
    bag._tag === 'Empty'
      ? ''
      : pipe(
          bag.items,
          Array.map(section =>
            formatSection(
              section,
              transposeStepsOf(song.transpose),
              capoFretOf(song.capo),
            ),
          ),
          Array.join('\n\n'),
        )
  return Array.match(pipe([header, body], Array.filter(Str.isNonEmpty)), {
    onEmpty: () => title,
    onNonEmpty: parts => Array.join(parts, '\n\n'),
  })
}

export { findLine, printChord }

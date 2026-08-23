import { Array, Option, Schema as S, String as Str, pipe } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

import { Chord, displayChord, printChord } from './chord.js'
import { SectionId, SongId, sectionIdAt } from './ids.js'
import { ChordsNone, ChordsSome, Line, Placed, Words, lyricOf } from './line.js'
import type { Word } from './line.js'
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
/** A song with sections. */
export const SectionsPopulated = ts('Populated', {
  items: S.NonEmptyArray(Section),
})
/** Sections of a song. */
export const Sections = S.Union([SectionsEmpty, SectionsPopulated])
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

/** Next replay-safe section id for a song. */
export const nextSectionId = (song: Song): SectionId => {
  if (song.sections._tag === 'Empty') {
    return sectionIdAt(song.id, 0)
  }
  return sectionIdAt(song.id, song.sections.items.length)
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
  if (song.sections._tag === 'Empty') {
    return Option.none()
  }
  return Array.findFirst(
    song.sections.items,
    section => section.id === sectionId,
  )
}

/** Finds a word member in the song. */
export const findSongWord = (
  song: Song,
  wordId: Word['id'],
): Option.Option<Readonly<{ section: Section; line: Line; word: Word }>> => {
  if (song.sections._tag === 'Empty') {
    return Option.none()
  }
  return pipe(
    song.sections.items,
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
  if (song.sections._tag === 'Empty') {
    return song
  }
  const items = Array.map(song.sections.items, section =>
    section.id === next.id ? next : section,
  )
  return Array.match(items, {
    onEmpty: () => song,
    onNonEmpty: populated =>
      Song.make({
        ...song,
        sections: SectionsPopulated.make({ items: populated }),
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

/** Adds a section. Empty becomes populated. */
export const addSection = (song: Song, section: Section): Song => {
  if (song.sections._tag === 'Empty') {
    return Song.make({
      ...song,
      sections: SectionsPopulated.make({ items: [section] }),
    })
  }
  return Song.make({
    ...song,
    sections: SectionsPopulated.make({
      items: Array.append(song.sections.items, section),
    }),
  })
}

/** Removes a section member. Last section becomes empty. */
export const removeSection = (song: Song, sectionId: SectionId): Song => {
  if (song.sections._tag === 'Empty') {
    return song
  }
  const remaining = Array.filter(
    song.sections.items,
    section => section.id !== sectionId,
  )
  return Array.match(remaining, {
    onEmpty: () =>
      Song.make({
        ...song,
        sections: SectionsEmpty(),
      }),
    onNonEmpty: items =>
      Song.make({
        ...song,
        sections: SectionsPopulated.make({ items }),
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
  const body =
    song.sections._tag === 'Empty'
      ? ''
      : pipe(
          song.sections.items,
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

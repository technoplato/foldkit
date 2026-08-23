import { Array, Option, Schema as S, pipe } from 'effect'
import { ts } from 'foldkit/schema'

import { SectionId, lineIdAt } from './ids.js'
import { Line, LineId, Word, findWord, lineFromLyric, lyricOf } from './line.js'

/** Named section kinds a chart can hold. */
export const SectionKind = S.Literals([
  'Intro',
  'Verse',
  'PreChorus',
  'Chorus',
  'Bridge',
  'Solo',
  'Outro',
  'Instrumental',
])
/** Named section kinds a chart can hold. */
export type SectionKind = typeof SectionKind.Type

/** Every section kind in display order. */
export const SECTION_KINDS: ReadonlyArray<SectionKind> = [
  'Intro',
  'Verse',
  'PreChorus',
  'Chorus',
  'Bridge',
  'Solo',
  'Outro',
  'Instrumental',
]

/** Printed section heading. */
export const kindLabel = (kind: SectionKind): string =>
  kind === 'PreChorus' ? 'Pre-Chorus' : kind

/** A section with no lines. */
export const LinesEmpty = ts('Empty')
/** A section with lines. */
export const LinesPopulated = ts('Populated', {
  items: S.NonEmptyArray(Line),
})
/** Lines of a section. */
export const Lines = S.Union([LinesEmpty, LinesPopulated])
/** Lines of a section. */
export type Lines = typeof Lines.Type

/** One named section of a chart. */
export const Section = S.Struct({
  id: SectionId,
  kind: SectionKind,
  lines: Lines,
})
/** One named section of a chart. */
export type Section = typeof Section.Type

/** An empty section of the given kind. */
export const emptySection = (id: SectionId, kind: SectionKind): Section =>
  Section.make({
    id,
    kind,
    lines: LinesEmpty(),
  })

/** Replaces lyrics, clearing chords whose words disappeared. */
export const replaceLyrics = (section: Section, draft: string): Section => {
  const rawLines = draft.split('\n')
  const next = pipe(
    rawLines,
    Array.map((lyric, index) =>
      lineFromLyric(lineIdAt(section.id, index), lyric),
    ),
  )
  return Array.match(next, {
    onEmpty: () =>
      Section.make({
        id: section.id,
        kind: section.kind,
        lines: LinesEmpty(),
      }),
    onNonEmpty: items =>
      Section.make({
        id: section.id,
        kind: section.kind,
        lines: LinesPopulated.make({ items }),
      }),
  })
}

/** Prints lyrics as the editable draft. */
export const lyricsDraft = (section: Section): string => {
  if (section.lines._tag === 'Empty') {
    return ''
  }
  return pipe(section.lines.items, Array.map(lyricOf), Array.join('\n'))
}

/** Finds a line member. */
export const findLine = (
  section: Section,
  lineId: LineId,
): Option.Option<Line> => {
  if (section.lines._tag === 'Empty') {
    return Option.none()
  }
  return Array.findFirst(section.lines.items, line => line.id === lineId)
}

/** Finds a word member in this section. */
export const findSectionWord = (
  section: Section,
  wordId: Word['id'],
): Option.Option<Readonly<{ line: Line; word: Word }>> => {
  if (section.lines._tag === 'Empty') {
    return Option.none()
  }
  return pipe(
    section.lines.items,
    Array.findFirst(line => Option.isSome(findWord(line, wordId))),
    Option.flatMap(line =>
      Option.map(findWord(line, wordId), word => ({ line, word })),
    ),
  )
}

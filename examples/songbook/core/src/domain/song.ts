import { Array, Option, Schema as S, String as Str, pipe } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

import { Chord, displayChord, parseChord, printChord } from './chord.js'
import { LineId, SectionId, SongId, sectionIdAt } from './ids.js'
import {
  Chords,
  Line,
  Placed,
  Words,
  Word as lineWord,
  lyricOf,
} from './line.js'
import { Pitch, printPitch } from './pitch.js'
import {
  Lines,
  Section,
  SectionKind,
  emptySection,
  findLine,
  findSectionWord,
  kindLabel,
  replaceLyrics,
} from './section.js'

const withMembers = <Schema extends object, Members extends object>(
  schema: Schema,
  members: Members,
): Schema & Members => {
  const handler: ProxyHandler<Schema> = {
    get(target, property, receiver) {
      if (Object.hasOwn(members, property)) {
        return Reflect.get(members, property)
      }
      return Reflect.get(target, property, receiver)
    },
    has(target, property) {
      return Object.hasOwn(members, property) || Reflect.has(target, property)
    },
  }
  if (typeof schema === 'function') {
    handler.apply = (target, thisArg, argumentsList) =>
      Reflect.apply(
        target as unknown as (...args: Array<never>) => unknown,
        thisArg,
        argumentsList,
      )
  }
  return new Proxy(schema, handler) as Schema & Members
}

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
const capoNone = ts('None')
const capoFretted = ts('Fretted', { fret: CapoFret })
/** Capo. Zero is none, not a fret. */
export const Capo = withMembers(S.Union([capoNone, capoFretted]), {
  None: capoNone,
  Fretted: capoFretted,
})
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

const artistNone = ts('None')
const artistSome = ts('Some', { name: NonEmptyString })
/** Artist. */
export const Artist = withMembers(S.Union([artistNone, artistSome]), {
  None: artistNone,
  Some: artistSome,
})
/** Artist. */
export type Artist = typeof Artist.Type

const keyNone = ts('None')
const keySome = ts('Some', { pitch: Pitch })
/** Original key. */
export const Key = withMembers(S.Union([keyNone, keySome]), {
  None: keyNone,
  Some: keySome,
})
/** Original key. */
export type Key = typeof Key.Type

const empty = ts('Empty')
const idle = ts('Idle', {
  items: S.NonEmptyArray(Section),
})

const draftNone = ts('None')
const draftSome = ts('Some', { text: NonEmptyString })
/** Lyrics or chord draft. */
export const Draft = withMembers(S.Union([draftNone, draftSome]), {
  None: draftNone,
  Some: draftSome,
})
/** Lyrics or chord draft. */
export type Draft = typeof Draft.Type

const beforeNone = ts('None')
const beforeSome = ts('Some', {
  items: S.NonEmptyArray(Section),
})
const before = withMembers(S.Union([beforeNone, beforeSome]), {
  None: beforeNone,
  Some: beforeSome,
})

const afterNone = ts('None')
const afterSome = ts('Some', {
  items: S.NonEmptyArray(Section),
})
const after = withMembers(S.Union([afterNone, afterSome]), {
  None: afterNone,
  Some: afterSome,
})

const lineBeforeNone = ts('None')
const lineBeforeSome = ts('Some', { items: S.NonEmptyArray(Line) })
const lineBefore = withMembers(S.Union([lineBeforeNone, lineBeforeSome]), {
  None: lineBeforeNone,
  Some: lineBeforeSome,
})
const lineAfterNone = ts('None')
const lineAfterSome = ts('Some', { items: S.NonEmptyArray(Line) })
const lineAfter = withMembers(S.Union([lineAfterNone, lineAfterSome]), {
  None: lineAfterNone,
  Some: lineAfterSome,
})

const wordBeforeNone = ts('None')
const wordBeforeSome = ts('Some', { items: S.NonEmptyArray(lineWord) })
const wordBefore = withMembers(S.Union([wordBeforeNone, wordBeforeSome]), {
  None: wordBeforeNone,
  Some: wordBeforeSome,
})
const wordAfterNone = ts('None')
const wordAfterSome = ts('Some', { items: S.NonEmptyArray(lineWord) })
const wordAfter = withMembers(S.Union([wordAfterNone, wordAfterSome]), {
  None: wordAfterNone,
  Some: wordAfterSome,
})

/** Editing lyrics of a zipper member. Draft is the lyrics. */
export const Lyrics = ts('Lyrics', {
  before,
  after,
  id: SectionId,
  kind: SectionKind,
  draft: Draft,
})

/** Placing a chord on the zipper current word. Draft is the chord. */
export const Word = withMembers(
  ts('Word', {
    sectionsBefore: before,
    id: SectionId,
    kind: SectionKind,
    sectionsAfter: after,
    linesBefore: lineBefore,
    lineId: LineId,
    chords: Chords,
    linesAfter: lineAfter,
    wordsBefore: wordBefore,
    word: lineWord,
    wordsAfter: wordAfter,
    draft: Draft,
  }),
  {
    Line: withMembers(lineBefore, {
      Before: lineBefore,
      After: lineAfter,
    }),
    Words: withMembers(wordBefore, {
      Before: wordBefore,
      After: wordAfter,
    }),
  },
)

/** Removing the zipper current section. */
export const Removing = ts('Removing', {
  before,
  current: Section,
  after,
})

/**
 * Sections of a song. Zippers replace the bag so lyrics, word, and
 * removing cannot disagree with the stored items.
 */
export const Sections = withMembers(
  S.Union([empty, idle, Lyrics, Word, Removing]),
  {
    Empty: empty,
    Idle: idle,
    Lyrics,
    Word,
    Removing,
  },
)
/** Sections of a song. */
export type Sections = typeof Sections.Type

/** Stored sections. Playing and the shelf cannot hold zippers. */
export const Stored = withMembers(S.Union([empty, idle]), {
  Empty: empty,
  Idle: idle,
})
/** Stored sections. */
export type Stored = typeof Stored.Type

const songFields = {
  id: SongId,
  title: Title,
  artist: Artist,
  key: Key,
  transpose: Transpose,
  capo: Capo,
}

const stored = S.Struct({
  ...songFields,
  sections: Stored,
})

/** One song in the library. Zippers inhabit only while editing. */
export const Song = withMembers(
  S.Struct({
    ...songFields,
    sections: Sections,
  }),
  { Stored: stored },
)
/** One song in the library. */
export type Song = typeof Song.Type

/** A new untitled song with no sections. */
export const blankSong = (id: SongId): Song =>
  Song.make({
    id,
    title: Untitled(),
    artist: Artist.None(),
    key: Key.None(),
    transpose: Unison(),
    capo: Capo.None(),
    sections: empty(),
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
    before.Some,
    before.None,
    after.Some,
    after.None,
  )

function upsertPlaced(line: Line, placed: Placed): Line {
  const body = line.body
  if (body._tag === 'Blank') {
    return line
  }
  const existing = body.chords._tag === 'None' ? [] : body.chords.items
  const without = Array.filter(
    existing,
    item => item.word.id !== placed.word.id,
  )
  const next = Array.append(without, placed)
  return Array.match(next, {
    onEmpty: () =>
      Line.make({
        ...line,
        body: Words.make({ items: body.items, chords: Chords.None() }),
      }),
    onNonEmpty: items =>
      Line.make({
        ...line,
        body: Words.make({
          items: body.items,
          chords: Chords.Some.make({ items }),
        }),
      }),
  })
}

function clearPlaced(line: Line, wordId: lineWord['id']): Line {
  const body = line.body
  if (body._tag === 'Blank') {
    return line
  }
  if (body.chords._tag === 'None') {
    return line
  }
  const remaining = Array.filter(
    body.chords.items,
    item => item.word.id !== wordId,
  )
  return Array.match(remaining, {
    onEmpty: () =>
      Line.make({
        ...line,
        body: Words.make({ items: body.items, chords: Chords.None() }),
      }),
    onNonEmpty: items =>
      Line.make({
        ...line,
        body: Words.make({
          items: body.items,
          chords: Chords.Some.make({ items }),
        }),
      }),
  })
}

const chordsOfLine = (line: Line): Chords =>
  line.body._tag === 'Words' ? line.body.chords : Chords.None()

const lineOfWord = (word: typeof Word.Type): Line => {
  const reconstructed = Line.make({
    id: word.lineId,
    body: Words.make({
      items: zipperItems(word.wordsBefore, word.word, word.wordsAfter),
      chords: word.chords,
    }),
  })
  if (word.draft._tag === 'None') {
    return reconstructed
  }
  return Option.match(parseChord(word.draft.text), {
    onNone: () => reconstructed,
    onSome: chord =>
      upsertPlaced(reconstructed, Placed.make({ word: word.word, chord })),
  })
}

const sectionOfWord = (word: typeof Word.Type): Section => {
  const line = lineOfWord(word)
  return Section.make({
    id: word.id,
    kind: word.kind,
    lines: Lines.Populated.make({
      items: zipperItems(word.linesBefore, line, word.linesAfter),
    }),
  })
}

/** Draft from typed host text. Empty is None. */
export const draftFromText = (text: string): Draft =>
  Str.isEmpty(text)
    ? Draft.None()
    : Draft.Some.make({ text: NonEmptyString.make(text) })

/** Draft of stored section lyrics. Empty lines are None. */
export const draftOfSection = (section: Section): Draft => {
  if (section.lines._tag === 'Empty') {
    return Draft.None()
  }
  return draftFromText(
    pipe(section.lines.items, Array.map(lyricOf), Array.join('\n')),
  )
}

const lyricsSection = (lyrics: typeof Lyrics.Type): Section => {
  if (lyrics.draft._tag === 'None') {
    return emptySection(lyrics.id, lyrics.kind)
  }
  return replaceLyrics(emptySection(lyrics.id, lyrics.kind), lyrics.draft.text)
}

/** Idle bag or empty. Zippers flatten to the members they hold. */
export const flattenSections = (sections: Sections): Stored => {
  if (sections._tag === 'Empty') {
    return empty()
  }
  if (sections._tag === 'Idle') {
    return sections
  }
  if (sections._tag === 'Word') {
    return idle.make({
      items: zipperItems(
        sections.sectionsBefore,
        sectionOfWord(sections),
        sections.sectionsAfter,
      ),
    })
  }
  if (sections._tag === 'Lyrics') {
    return idle.make({
      items: zipperItems(
        sections.before,
        lyricsSection(sections),
        sections.after,
      ),
    })
  }
  return idle.make({
    items: zipperItems(sections.before, sections.current, sections.after),
  })
}

/** Song whose sections zipper is flattened to Empty or Idle. */
export const flattenSong = (song: Song): typeof Song.Stored.Type =>
  Song.Stored.make({
    id: song.id,
    title: song.title,
    artist: song.artist,
    key: song.key,
    transpose: song.transpose,
    capo: song.capo,
    sections: flattenSections(song.sections),
  })

/** Stored song as a Song. Sections stay Empty or Idle. */
export const asSong = (song: typeof Song.Stored.Type): Song =>
  Song.make({
    id: song.id,
    title: song.title,
    artist: song.artist,
    key: song.key,
    transpose: song.transpose,
    capo: song.capo,
    sections: song.sections,
  })

/** Lyrics zipper from a populated song member. Draft is the lyrics. */
export const lyricsAt = (
  sections: Array.NonEmptyReadonlyArray<Section>,
  member: Section,
  draft: Draft,
): Option.Option<typeof Lyrics.Type> =>
  Option.map(sectionZipperAt(sections, member), zip =>
    Lyrics.make({
      before: zip.before,
      after: zip.after,
      id: member.id,
      kind: member.kind,
      draft,
    }),
  )

/** Removing zipper from a populated song member. */
export const removingAt = (
  sections: Array.NonEmptyReadonlyArray<Section>,
  member: Section,
): Option.Option<typeof Removing.Type> =>
  Option.map(sectionZipperAt(sections, member), zip => Removing.make(zip))

/** Word zipper from members of the current song. Draft is the chord. */
export const wordAt = (
  song: Song,
  wordId: lineWord['id'],
  draft: Draft,
): Option.Option<typeof Word.Type> => {
  const idle = asSong(flattenSong(song))
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
        before.Some,
        before.None,
        after.Some,
        after.None,
      ),
      sections =>
        Option.flatMap(
          zipperAtMember(
            sectionLines.items,
            found.line,
            lineBefore.Some,
            lineBefore.None,
            lineAfter.Some,
            lineAfter.None,
          ),
          lines =>
            Option.map(
              zipperAtMember(
                lineBody.items,
                found.word,
                wordBefore.Some,
                wordBefore.None,
                wordAfter.Some,
                wordAfter.None,
              ),
              words =>
                Word.make({
                  sectionsBefore: sections.before,
                  id: found.section.id,
                  kind: found.section.kind,
                  sectionsAfter: sections.after,
                  linesBefore: lines.before,
                  lineId: found.line.id,
                  chords: chordsOfLine(
                    clearPlaced(lines.current, found.word.id),
                  ),
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
export const displayTitle = (song: Readonly<{ title: Title }>): string =>
  song.title._tag === 'Untitled' ? 'Untitled' : song.title.name

const TRANSPOSE_STEP_VALUES: ReadonlyArray<TransposeSteps> = [
  -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11,
]

const clampTranspose = (steps: number): Transpose => {
  const wrapped = ((steps + 11 + 12 * 4) % 12) - 11
  if (wrapped === 0) {
    return Unison()
  }
  const maybeSteps = Array.findFirst(
    TRANSPOSE_STEP_VALUES,
    value => value === wrapped,
  )
  if (Option.isNone(maybeSteps)) {
    return Unison()
  }
  return Shifted.make({ steps: maybeSteps.value })
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

const CAPO_FRET_VALUES: ReadonlyArray<CapoFret> = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
]

const nextFret = (fret: number): Capo => {
  if (fret <= 0) {
    return Capo.None()
  }
  if (fret > 12) {
    return Capo.Fretted.make({ fret: 12 })
  }
  const maybeFret = Array.findFirst(CAPO_FRET_VALUES, value => value === fret)
  if (Option.isNone(maybeFret)) {
    return Capo.None()
  }
  return Capo.Fretted.make({ fret: maybeFret.value })
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
  wordId: lineWord['id'],
): Option.Option<
  Readonly<{ section: Section; line: Line; word: lineWord }>
> => {
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
        sections: idle.make({ items: populated }),
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
      sections: idle.make({ items: [section] }),
    })
  }
  return Song.make({
    ...song,
    sections: idle.make({
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
        sections: empty(),
      }),
    onNonEmpty: items =>
      Song.make({
        ...song,
        sections: idle.make({ items }),
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
        lines: Lines.Populated.make({ items: populated }),
      }),
  })
}

/** Places or replaces a chord on a word. */
export const placeChord = (song: Song, word: lineWord, chord: Chord): Song =>
  Option.match(findSongWord(song, word.id), {
    onNone: () => song,
    onSome: ({ section, line }) =>
      replaceSection(
        song,
        replaceLine(section, upsertPlaced(line, Placed.make({ word, chord }))),
      ),
  })

/** Clears a chord from a word. */
export const clearChord = (song: Song, wordId: lineWord['id']): Song =>
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

const transposeLine = (transpose: Transpose): Option.Option<string> => {
  if (transpose._tag === 'Unison') {
    return Option.none()
  }
  const steps = transpose.steps
  if (steps > 0) {
    return Option.some(`Transpose: +${String(steps)}`)
  }
  return Option.some(`Transpose: ${String(steps)}`)
}

const headerLinesOf = (song: Song): Array<string> =>
  Array.getSomes([
    Option.some(displayTitle(song)),
    song.artist._tag === 'Some' ? Option.some(song.artist.name) : Option.none(),
    song.key._tag === 'Some'
      ? Option.some(`Key: ${printPitch(song.key.pitch)}`)
      : Option.none(),
    song.capo._tag === 'Fretted'
      ? Option.some(`Capo: ${String(song.capo.fret)}`)
      : Option.none(),
    transposeLine(song.transpose),
  ])

/** Text chart for copy and play. */
export const toChartText = (song: Song): string => {
  const header = Array.join(headerLinesOf(song), '\n')
  const bag = flattenSections(song.sections)
  if (bag._tag === 'Empty') {
    return header
  }
  const body = pipe(
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
  return `${header}\n\n${body}`
}

export { findLine, printChord }

import { Array, Option } from 'effect'

import type { InkRun } from '../theme/terminal.js'
import type { Role } from '../theme/theme.js'
import { layoutTree } from './layout.js'
import { paintAscii } from './paint.js'
import { textsOf } from './query.js'
import type {
  LayoutBox,
  TranscriptNode,
  TranscriptPassage,
  TranscriptWord,
  UiNode,
} from './types.js'

// ANCHOR

const currentRowsOf = (box: LayoutBox): ReadonlyArray<number> => [
  ...(box.isCurrent === true ? [box.y] : []),
  ...Array.flatMap(box.children, currentRowsOf),
]

const shownRowsOf = (box: LayoutBox): ReadonlyArray<number> => [
  ...(box.isShown === true ? [box.y] : []),
  ...Array.flatMap(box.children, shownRowsOf),
]

/**
 * The rows a screen keeps in view: the line a Transcript says to show,
 * such as the match a search is on, when there is one, and otherwise the
 * current lines, such as the one being read.
 *
 * @example
 * ```typescript
 * anchorRowsOf(layoutTree(screen, 0, 0, 80)) // [12]
 * ```
 */
export const anchorRowsOf = (box: LayoutBox): ReadonlyArray<number> =>
  Array.match(shownRowsOf(box), {
    onEmpty: () => currentRowsOf(box),
    onNonEmpty: rows => rows,
  })

// FRAME

/** How many columns and rows a frame may take. */
export type LiveFrameSize = Readonly<{ columns: number; rows: number }>

/**
 * A part of the view as the lines a terminal shows, with the role each
 * part of each line plays, one list per line, for the theme's ink. The
 * lines are plain text, never wider than the columns nor more than the
 * rows the frame was fitted to.
 */
export type LiveFrame = Readonly<{
  lines: ReadonlyArray<string>
  inks: ReadonlyArray<ReadonlyArray<InkRun>>
}>

/**
 * What can be run now, for under a part: each command as it is typed,
 * `books pause`, and the command that lists the rest, `books actions`.
 */
export type LiveFrameFooter = Readonly<{
  commands: ReadonlyArray<string>
  more?: string
}>

/**
 * What sits around a part in its frame: `header`, a node whose texts are
 * the heading above it, such as the title and what is playing, and
 * `footer`, what can be run now. `marks` says how the word being read
 * shows: `Ink` when the frame will be inked, by its role alone, and
 * `Glyph`, the default, in brackets, so it shows without color.
 */
export type LiveFrameAround = Readonly<{
  header?: UiNode
  footer?: LiveFrameFooter
  marks?: 'Glyph' | 'Ink'
}>

type Line = Readonly<{ text: string; inks: ReadonlyArray<InkRun> }>

const blank: Line = { text: '', inks: [] }

/** The columns left empty before every line. */
const margin = 2

const marginText = ' '.repeat(margin)

/** The most columns a line of words takes, however wide the window. */
const readingMeasure = 72

const leastWordColumns = 12

const minimumPartRows = 3

// NOTE: The line to keep in view sits a third of the way down, so a
// reader sees a little of what was just read and more of what comes.
const partsAbove = 3

/** The lines of the paragraph before and of the one after that show. */
const contextLines = 2

const barGlyph = '▎'

const ellipsis = '…'

const indented = (line: Line, by: number): Line =>
  line.text === ''
    ? line
    : {
        text: `${' '.repeat(by)}${line.text}`,
        inks: Array.map(line.inks, run => ({ ...run, col: run.col + by })),
      }

const cut = (line: Line, columns: number): Line =>
  line.text.length <= columns
    ? line
    : {
        text: line.text.slice(0, columns),
        inks: Array.filter(
          Array.map(line.inks, run => ({
            ...run,
            width: Math.min(run.width, columns - run.col),
          })),
          run => run.width > 0,
        ),
      }

// WORDS

type Token = Readonly<{ text: string; maybeRole: Option.Option<Role> }>

const withToken = (line: Line, token: Token): Line => {
  const col = line.text === '' ? 0 : line.text.length + 1
  const text = line.text === '' ? token.text : `${line.text} ${token.text}`
  return Option.match(token.maybeRole, {
    onNone: () => ({ text, inks: line.inks }),
    onSome: role =>
      Option.match(
        Option.filter(
          Array.last(line.inks),
          last =>
            last.role === role &&
            role !== 'ReadingCurrentWord' &&
            last.col + last.width + 1 === col,
        ),
        {
          onNone: () => ({
            text,
            inks: [...line.inks, { col, width: token.text.length, role }],
          }),
          onSome: last => ({
            text,
            inks: [
              ...Array.dropRight(line.inks, 1),
              { ...last, width: last.width + 1 + token.text.length },
            ],
          }),
        },
      ),
  })
}

type Wrapped = Readonly<{ lines: ReadonlyArray<Line>; open: Line }>

/**
 * Tokens as lines no wider than `width`, broken between tokens and never
 * inside one; a token wider than the width has a line to itself.
 */
const wrapped = (
  tokens: ReadonlyArray<Token>,
  width: number,
): ReadonlyArray<Line> => {
  const state = Array.reduce(
    tokens,
    { lines: [], open: blank } as Wrapped,
    (current, token): Wrapped =>
      current.open.text !== '' &&
      current.open.text.length + 1 + token.text.length > width
        ? {
            lines: [...current.lines, current.open],
            open: withToken(blank, token),
          }
        : { lines: current.lines, open: withToken(current.open, token) },
  )
  return state.open.text === '' ? state.lines : [...state.lines, state.open]
}

const plainTokens = (
  text: string,
  maybeRole: Option.Option<Role>,
): ReadonlyArray<Token> =>
  Array.map(
    Array.filter(text.split(/\s+/u), word => word !== ''),
    word => ({ text: word, maybeRole }),
  )

const markedTextOf = (word: TranscriptWord): string => {
  if (word.mark === 'Found') {
    return `‹${word.text}›`
  } else if (word.mark === 'Selected') {
    return `«${word.text}»`
  } else {
    return word.text
  }
}

/**
 * The words of the paragraph being read as tokens: what was spoken, the
 * word being read, a word a search found, the match a person is on, and
 * what is to come, which keeps the terminal's own text.
 */
const readTokens = (
  passage: TranscriptPassage,
  marks: 'Glyph' | 'Ink',
): ReadonlyArray<Token> => {
  const maybeCurrent = Array.findFirstIndex(
    passage.words,
    word => word.isCurrent === true,
  )
  return Array.map(passage.words, (word, index): Token => {
    const text = markedTextOf(word)
    if (word.isCurrent === true) {
      return {
        text: marks === 'Ink' ? text : `[${text}]`,
        maybeRole: Option.some('ReadingCurrentWord'),
      }
    } else if (word.mark === 'Selected') {
      return { text, maybeRole: Option.some('SelectedMark') }
    } else if (word.mark === 'Found') {
      return { text, maybeRole: Option.some('Mark') }
    } else {
      return {
        text,
        maybeRole: Option.exists(maybeCurrent, current => index < current)
          ? Option.some('ReadingSpoken')
          : Option.none(),
      }
    }
  })
}

const quiet: Option.Option<Role> = Option.some('QuietText')

const quietTokens = (passage: TranscriptPassage): ReadonlyArray<Token> =>
  Array.map(passage.words, word => ({
    text: markedTextOf(word),
    maybeRole: quiet,
  }))

// PARAGRAPHS

type Gutter = Readonly<{ labelWidth: number; textWidth: number }>

const gutterGap = 2

/** The columns before the words: the margin, the bar, a space, the time, a gap. */
const prefixWidthOf = (labelWidth: number): number =>
  margin + 1 + 1 + labelWidth + gutterGap

/**
 * A paragraph's lines in the gutter: on its first line its time, under
 * it nothing, so the words stand in one column; with `isRead`, a bar
 * down the gutter.
 */
const inGutter = (
  lines: ReadonlyArray<Line>,
  label: string,
  gutter: Gutter,
  isRead: boolean,
  isLabeled: boolean,
): ReadonlyArray<Line> =>
  Array.map(lines, (line, index): Line => {
    const shownLabel = index === 0 && isLabeled ? label : ''
    const prefix = `${marginText}${isRead ? barGlyph : ' '} ${shownLabel.padEnd(gutter.labelWidth)}${' '.repeat(gutterGap)}`
    return {
      text: `${prefix}${line.text}`.trimEnd(),
      inks: [
        ...(isRead ? [{ col: margin, width: 1, role: 'Accent' as const }] : []),
        ...(shownLabel === ''
          ? []
          : [
              {
                col: margin + 2,
                width: shownLabel.length,
                role: 'QuietText' as const,
              },
            ]),
        ...Array.map(line.inks, run => ({
          ...run,
          col: run.col + prefix.length,
        })),
      ],
    }
  })

const withTrail = (line: Line): Line => ({
  text: `${line.text} ${ellipsis}`,
  inks: [{ col: 0, width: line.text.length + 2, role: 'QuietText' }],
})

const leadToken: Token = { text: ellipsis, maybeRole: quiet }

/**
 * The end of a paragraph in at most `most` lines, led by an ellipsis:
 * words are left off its start until what is left, after the ellipsis,
 * wraps into those lines.
 */
const endOf = (
  tokens: ReadonlyArray<Token>,
  width: number,
  most: number,
): ReadonlyArray<Line> => {
  const lines = wrapped([leadToken, ...tokens], width)
  return lines.length <= most || tokens.length === 0
    ? lines
    : endOf(Array.drop(tokens, 1), width, most)
}

/** The last lines of the paragraph before, led by an ellipsis when cut. */
const beforeLines = (
  passage: TranscriptPassage,
  gutter: Gutter,
  most: number,
): ReadonlyArray<Line> => {
  const tokens = quietTokens(passage)
  const whole = wrapped(tokens, gutter.textWidth)
  return inGutter(
    whole.length <= most ? whole : endOf(tokens, gutter.textWidth, most),
    passage.label,
    gutter,
    false,
    true,
  )
}

/** The first lines of the paragraph after, trailed by an ellipsis when cut. */
const afterLines = (
  passage: TranscriptPassage,
  gutter: Gutter,
  most: number,
): ReadonlyArray<Line> => {
  const whole = wrapped(quietTokens(passage), gutter.textWidth)
  if (whole.length <= most) {
    return inGutter(whole, passage.label, gutter, false, true)
  }
  const kept = Array.take(whole, most)
  const shown = Array.match(kept, {
    onEmpty: () => kept,
    onNonEmpty: nonEmpty => {
      const last = Array.lastNonEmpty(nonEmpty)
      const room =
        last.text.length + 2 <= gutter.textWidth
          ? last
          : {
              text: last.text.slice(0, last.text.lastIndexOf(' ')),
              inks: [],
            }
      return [...Array.initNonEmpty(nonEmpty), withTrail(room)]
    },
  })
  return inGutter(shown, passage.label, gutter, false, true)
}

// TRANSCRIPT

/**
 * The paragraph a frame is about: the one holding the word a Transcript
 * says to show while its words do not follow the voice, else the one
 * being read, else the first.
 */
const subjectIndexOf = (transcript: TranscriptNode): Option.Option<number> => {
  const shown =
    transcript.isFollowing === false && transcript.focusToken !== undefined
      ? Array.findFirstIndex(transcript.passages, passage =>
          Array.some(
            passage.words,
            word => word.token === transcript.focusToken,
          ),
        )
      : Option.none<number>()
  return Option.orElse(shown, () =>
    Option.orElse(
      Array.findFirstIndex(
        transcript.passages,
        passage => passage.isCurrent === true,
      ),
      () => (transcript.passages.length > 0 ? Option.some(0) : Option.none()),
    ),
  )
}

const lineOfWordToKeep = (lines: ReadonlyArray<Line>): number =>
  Option.getOrElse(
    Array.findFirstIndex(lines, line =>
      Array.some(
        line.inks,
        run => run.role === 'ReadingCurrentWord' || run.role === 'SelectedMark',
      ),
    ),
    () => 0,
  )

/**
 * A Transcript as lines to read, in `rows` rows: the paragraph the frame
 * is about, whole, or the part of it around the word being read when it
 * is taller than the rows; then, while rows are left, a blank line and
 * the first lines of the paragraph after, and the last lines of the one
 * before with a blank line under them.
 */
const transcriptLines = (
  transcript: TranscriptNode,
  columns: number,
  rows: number,
  marks: 'Glyph' | 'Ink',
): ReadonlyArray<Line> =>
  Option.match(subjectIndexOf(transcript), {
    onNone: () => [{ text: `${marginText}${transcript.emptyText}`, inks: [] }],
    onSome: subjectIndex => {
      const labelWidth = Array.reduce(
        transcript.passages,
        0,
        (widest, passage) => Math.max(widest, passage.label.length),
      )
      const gutter: Gutter = {
        labelWidth,
        textWidth: Math.max(
          leastWordColumns,
          Math.min(readingMeasure, columns - prefixWidthOf(labelWidth)),
        ),
      }
      const passages = transcript.passages
      const subject = passages[subjectIndex]
      if (subject === undefined) {
        return []
      }
      const isRead = subject.isCurrent === true
      const read = inGutter(
        wrapped(readTokens(subject, marks), gutter.textWidth),
        subject.label,
        gutter,
        isRead,
        true,
      )
      if (read.length >= rows) {
        const keep = lineOfWordToKeep(read)
        const start = Math.max(
          0,
          Math.min(keep - Math.floor(rows / partsAbove), read.length - rows),
        )
        return Array.take(Array.drop(read, start), rows)
      }
      const left = rows - read.length
      const after = Option.match(Array.get(passages, subjectIndex + 1), {
        onNone: (): ReadonlyArray<Line> => [],
        onSome: passage =>
          left >= 2
            ? [
                blank,
                ...afterLines(
                  passage,
                  gutter,
                  Math.min(contextLines, left - 1),
                ),
              ]
            : [],
      })
      const leftAfter = left - after.length
      const before = Option.match(Array.get(passages, subjectIndex - 1), {
        onNone: (): ReadonlyArray<Line> => [],
        onSome: passage =>
          leftAfter >= 2
            ? [
                ...beforeLines(
                  passage,
                  gutter,
                  Math.min(contextLines, leftAfter - 1),
                ),
                blank,
              ]
            : [],
      })
      return [...before, ...read, ...after]
    },
  })

// AROUND

// The heading and the commands keep to the measure too: no wider than a
// line of words with the gutter of a short time before it.
const widestAround = readingMeasure + 8

const widthFor = (columns: number): number =>
  Math.max(leastWordColumns, Math.min(widestAround, columns - margin))

const mostHeadingLines = 2

const roleOfText = (
  text: Readonly<{ emphasis?: unknown; dim?: boolean }>,
): Option.Option<Role> => {
  if (text.dim === true) {
    return quiet
  } else if (text.emphasis !== undefined) {
    return Option.some('Text')
  } else {
    return Option.none()
  }
}

/**
 * A heading's texts as short lines in the margin: each text wrapped
 * between words, two lines of it at most, a text with emphasis strong and
 * a dim one quiet.
 */
const headingLines = (header: UiNode, columns: number): ReadonlyArray<Line> =>
  Array.flatMap(textsOf(header), text =>
    Array.map(
      Array.take(
        wrapped(plainTokens(text.content, roleOfText(text)), widthFor(columns)),
        mostHeadingLines,
      ),
      line => indented(line, margin),
    ),
  )

const commandGap = '   '

const moreMark = '·'

const mostFooterLines = 2

type FooterItem = Readonly<{ text: string; isMore: boolean }>

const footerRows = (
  items: ReadonlyArray<FooterItem>,
  width: number,
): ReadonlyArray<Line> =>
  Array.reduce(items, [] as ReadonlyArray<Line>, (lines, item) => {
    const open = Array.last(lines)
    const joined = (line: Line): Line => {
      const lead = item.isMore
        ? `${line.text}${commandGap}${moreMark}${commandGap}`
        : `${line.text}${commandGap}`
      return {
        text: `${lead}${item.text}`,
        inks: item.isMore
          ? [
              ...line.inks,
              {
                col: line.text.length + commandGap.length,
                width: 1,
                role: 'QuietText',
              },
              ...moreInk(lead.length, item.text),
            ]
          : line.inks,
      }
    }
    const alone: Line = {
      text: item.text,
      inks: item.isMore ? moreInk(0, item.text) : [],
    }
    return Option.match(open, {
      onNone: () => [alone],
      onSome: line => {
        const next = joined(line)
        return next.text.length <= width
          ? [...Array.dropRight(lines, 1), next]
          : [...lines, alone]
      },
    })
  })

const forMore = 'for more'

const moreInk = (col: number, text: string): ReadonlyArray<InkRun> => [
  {
    col: col + text.length - forMore.length,
    width: forMore.length,
    role: 'QuietText',
  },
]

/**
 * What can be run now as a line or two in the margin: the commands as
 * they are typed, a few columns apart, then the command that lists the
 * rest, named quietly. Commands are left off the end until it fits in
 * two lines; a command is never broken.
 */
const footerLines = (
  footer: LiveFrameFooter,
  columns: number,
): ReadonlyArray<Line> => {
  const width = widthFor(columns)
  const more: ReadonlyArray<FooterItem> =
    footer.more === undefined
      ? []
      : [{ text: `${footer.more} ${forMore}`, isMore: true }]
  const fitted = (commands: ReadonlyArray<string>): ReadonlyArray<Line> => {
    const rows = footerRows(
      [...Array.map(commands, text => ({ text, isMore: false })), ...more],
      width,
    )
    return rows.length <= mostFooterLines || commands.length === 0
      ? Array.take(rows, mostFooterLines)
      : fitted(Array.dropRight(commands, 1))
  }
  return Array.map(fitted(footer.commands), line =>
    cut(indented(line, margin), columns),
  )
}

const otherLines = (node: UiNode, columns: number): ReadonlyArray<Line> => {
  const laid = layoutTree(node, 0, 0, widthFor(columns))
  const painted = paintAscii(laid)
  return Array.map(painted.lines, (line, row) =>
    indented(
      {
        text: line.trimEnd(),
        inks: Option.getOrElse(Array.get(painted.inks, row), () => []),
      },
      margin,
    ),
  )
}

/**
 * Fits a part of the view to a terminal's size, laid out to be read, as
 * lines with their roles. Every line sits in a margin of two columns and
 * words wrap between words, in at most 72 columns however wide the
 * window. A Transcript is the paragraph being read, marked by a bar in
 * the gutter with its time once and its lines under its first word, what
 * was spoken strong, the word being read in its own role, what is to
 * come plain; around it, after a blank line each, the last two lines of
 * the paragraph before and the first two of the one after, quiet. Any
 * other part is laid out as a screen lays it out. The heading's texts
 * are short lines above, then a blank line; what can be run now is a
 * line or two below, after a blank line. With few rows the commands go
 * first, then the paragraphs around, then the heading; the line of the
 * word being read is always there. Pure: the same node and size give the
 * same lines, on any Client.
 *
 * @example
 * ```typescript
 * liveFrameOf(transcript, { columns: 60, rows: 20 }, {
 *   header: Column({}, Text('The Lantern Keeper', { emphasis: 'Headline' }), Text('The Tide · 0:36 of 1:20:00 · playing', { dim: true })),
 *   footer: { commands: ['books pause', 'books skip-back'], more: 'books actions' },
 * })
 * // lines: ['  The Lantern Keeper', '  The Tide · 0:36 of 1:20:00 · playing', '',
 * //         '  ▎ 0:35  He [trimmed] the wick and waited.', '', '  books pause   books skip-back   ·   books actions for more']
 * ```
 */
export const liveFrameOf = (
  part: UiNode,
  size: LiveFrameSize,
  around: LiveFrameAround = {},
): LiveFrame => {
  const columns = Math.max(margin + leastWordColumns, size.columns)
  const rows = Math.max(1, size.rows)
  const heading =
    around.header === undefined ? [] : headingLines(around.header, columns)
  const above = heading.length === 0 ? [] : [...heading, blank]
  const commands =
    around.footer === undefined ? [] : footerLines(around.footer, columns)
  const below = commands.length === 0 ? [] : [blank, ...commands]
  const hasHeader = rows - above.length >= minimumPartRows
  const hasFooter =
    rows - (hasHeader ? above.length : 0) - below.length >=
    minimumPartRows + contextLines
  const height = Math.max(
    1,
    rows - (hasHeader ? above.length : 0) - (hasFooter ? below.length : 0),
  )
  const body =
    part._tag === 'Transcript'
      ? transcriptLines(part, columns, height, around.marks ?? 'Glyph')
      : Array.take(otherLines(part, columns), height)
  const shown = Array.map(
    [...(hasHeader ? above : []), ...body, ...(hasFooter ? below : [])],
    line => cut(line, size.columns),
  )
  return {
    lines: Array.map(shown, line => line.text),
    inks: Array.map(shown, line => line.inks),
  }
}

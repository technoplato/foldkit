import { Array, Match as M, Option, pipe } from 'effect'

import { terminalWidth, wrapWords } from '../cli/layout.js'
import type { BoundInteraction } from './bind.js'
import {
  type KeyInput,
  type MenuRow,
  type MenuView,
  type TextRun,
  hintLineOf,
  menuHintOf,
} from './interaction.js'

// MODEL

/**
 * How one run of terminal text stands out. A plain terminal ignores the
 * tone; OpenTUI colors it: `Strong` bold, `Quiet` dim, and `Match`
 * underlined in the match color.
 */
export type TerminalTone = 'Plain' | 'Strong' | 'Quiet' | 'Match'

/** One run of terminal text and its tone. */
export type TerminalRun = Readonly<{ text: string; tone: TerminalTone }>

/**
 * One terminal line of the action menu. `maybeChoice` is the Action a
 * click on the line chooses, None for a heading or a disabled row, and
 * `isFocused` marks the line of the row that has the keyboard.
 */
export type TerminalLine = Readonly<{
  runs: ReadonlyArray<TerminalRun>
  maybeChoice: Option.Option<string>
  isFocused: boolean
}>

/** What a terminal does with a key: the Program took it, quit, or nothing. */
export type TerminalKeyOutcome = 'Handled' | 'Quit' | 'Ignored'

// RUN

const plain = (text: string): TerminalRun => ({ text, tone: 'Plain' })

const quiet = (text: string): TerminalRun => ({ text, tone: 'Quiet' })

const strong = (text: string): TerminalRun => ({ text, tone: 'Strong' })

const lineOf = (runs: ReadonlyArray<TerminalRun>): TerminalLine => ({
  runs,
  maybeChoice: Option.none(),
  isFocused: false,
})

const lengthOf = (runs: ReadonlyArray<TerminalRun>): number =>
  Array.reduce(runs, 0, (length, run) => length + run.text.length)

const padded = (
  runs: ReadonlyArray<TerminalRun>,
  width: number,
): ReadonlyArray<TerminalRun> => {
  const gap = width - lengthOf(runs)
  return gap > 0 ? [...runs, plain(' '.repeat(gap))] : runs
}

const tonedRuns = (
  runs: ReadonlyArray<TextRun>,
  tone: TerminalTone,
): ReadonlyArray<TerminalRun> =>
  Array.map(runs, run => ({
    text: run.text,
    tone: run.isMatch ? 'Match' : tone,
  }))

/**
 * The plain text of one terminal line, for a terminal that shows no tones.
 *
 * @example
 * ```typescript
 * terminalLineText(line) // '  > Reset          r     Sets the count to 0'
 * ```
 */
export const terminalLineText = (line: TerminalLine): string =>
  pipe(
    line.runs,
    Array.map(run => run.text),
    Array.join(''),
  ).trimEnd()

// WRAP

type Word = ReadonlyArray<TerminalRun>

const minimumWrapWidth = 20

const wordsOf = (runs: ReadonlyArray<TerminalRun>): ReadonlyArray<Word> =>
  pipe(
    runs,
    Array.flatMap(run =>
      Array.map(run.text.split(' '), (text, index) => ({
        piece: { text, tone: run.tone },
        startsWord: index > 0,
      })),
    ),
    Array.reduce(Array.empty<Word>(), (words, { piece, startsWord }) => {
      const withPiece = (word: Word): Word =>
        piece.text === '' ? word : [...word, piece]
      return Array.match(words, {
        onEmpty: () => [withPiece([])],
        onNonEmpty: nonEmpty =>
          startsWord
            ? [...nonEmpty, withPiece([])]
            : [
                ...Array.initNonEmpty(nonEmpty),
                withPiece(Array.lastNonEmpty(nonEmpty)),
              ],
      })
    }),
    Array.filter(Array.isReadonlyArrayNonEmpty),
  )

const wrapRuns = (
  runs: ReadonlyArray<TerminalRun>,
  width: number,
): ReadonlyArray<ReadonlyArray<TerminalRun>> => {
  const fit = Math.max(width, minimumWrapWidth)
  return pipe(
    wordsOf(runs),
    Array.reduce(Array.empty<ReadonlyArray<TerminalRun>>(), (lines, word) =>
      Array.match(lines, {
        onEmpty: () => [word],
        onNonEmpty: nonEmpty => {
          const last = Array.lastNonEmpty(nonEmpty)
          return lengthOf(last) + 1 + lengthOf(word) <= fit
            ? [...Array.initNonEmpty(nonEmpty), [...last, plain(' '), ...word]]
            : [...nonEmpty, word]
        },
      }),
    ),
  )
}

// MENU

const indent = '  '

const columnGap = 2

const minimumTitleWidth = 12

const minimumKeysWidth = 6

const rowMark = (row: MenuRow): string => (row.isHighlighted ? '> ' : '  ')

const nestedMark = ' ›'

const hairline = '─'

const keysTextOf = (row: MenuRow): string => Array.join(row.keys, ' ')

const isDisabledRow = (row: MenuRow): boolean =>
  row.entry.availability._tag === 'Disabled'

const widestOf = (texts: ReadonlyArray<string>, minimum: number): number =>
  Array.reduce(texts, minimum, (widest, text) =>
    Math.max(widest, text.length + columnGap),
  )

type MenuColumns = Readonly<{ titleWidth: number; keysWidth: number }>

const menuColumnsOf = (rows: ReadonlyArray<MenuRow>): MenuColumns => ({
  titleWidth: widestOf(
    Array.map(
      rows,
      row =>
        `${rowMark(row)}${Array.join(
          Array.map(row.title, run => run.text),
          '',
        )}${row.isNested ? nestedMark : ''}`,
    ),
    minimumTitleWidth,
  ),
  keysWidth: widestOf(Array.map(rows, keysTextOf), minimumKeysWidth),
})

const rowLines = (
  row: MenuRow,
  columns: MenuColumns,
  width: number,
): ReadonlyArray<TerminalLine> => {
  const isDisabled = isDisabledRow(row)
  const lead = [
    plain(indent),
    ...padded(
      [
        isDisabled ? quiet(rowMark(row)) : strong(rowMark(row)),
        ...tonedRuns(row.title, isDisabled ? 'Quiet' : 'Strong'),
        ...(row.isNested ? [quiet(nestedMark)] : []),
      ],
      columns.titleWidth,
    ),
    ...padded([quiet(keysTextOf(row))], columns.keysWidth),
  ]
  const leadWidth = lengthOf(lead)
  const under = plain(' '.repeat(leadWidth))
  const descriptionRuns = Array.match(
    wrapRuns(tonedRuns(row.description, 'Quiet'), width - leadWidth),
    {
      onEmpty: () => [lead],
      onNonEmpty: lines => [
        [...lead, ...Array.headNonEmpty(lines)],
        ...Array.map(Array.tailNonEmpty(lines), line => [under, ...line]),
      ],
    },
  )
  const unavailableRuns = M.value(row.entry.availability).pipe(
    M.withReturnType<ReadonlyArray<ReadonlyArray<TerminalRun>>>(),
    M.tagsExhaustive({
      Enabled: () => [],
      Disabled: ({ because }) =>
        Array.map(
          wrapWords(`Unavailable: ${because}`, width - leadWidth),
          line => [under, quiet(line)],
        ),
    }),
  )
  const maybeChoice = isDisabled ? Option.none() : Option.some(row.entry.tag)
  return Array.map([...descriptionRuns, ...unavailableRuns], runs => ({
    runs,
    maybeChoice,
    isFocused: row.isFocused,
  }))
}

/**
 * The action menu as terminal lines that fit `width`, 80 columns unless a
 * painter has less, shared by every terminal painter: the title and the
 * query, one line per row with its mark, title, keys, and description
 * wrapped under itself, why a row is unavailable beneath it, and the keys
 * that work right now. The program CLI prints the text; OpenTUI colors
 * each run by its tone and makes each row's lines choose its Action.
 *
 * @example
 * ```typescript
 * terminalMenuLines(menu).map(terminalLineText)
 * // ['Actions  Search actions: "re"',
 * //  '  > Reset          r     Sets the count to 0',
 * //  '    Increment      + =   Increments the count by one',
 * //  '  [↑↓] move  [↵] run  [esc] close']
 * ```
 */
export const terminalMenuLines = (
  menu: MenuView,
  width: number = terminalWidth,
): ReadonlyArray<TerminalLine> => {
  const filterText = `${menu.filterLabel}: "${menu.query}"`
  const heading = lineOf([
    strong(menu.title),
    plain('  '),
    menu.isFilterFocused ? strong(filterText) : quiet(filterText),
  ])
  const rows = Array.match(menu.rows, {
    onEmpty: () => [lineOf([plain(indent), quiet(`(${menu.summary})`)])],
    onNonEmpty: nonEmpty => {
      const columns = menuColumnsOf(nonEmpty)
      const divider = lineOf([
        plain(indent),
        quiet(hairline.repeat(Math.max(0, width - indent.length * 2))),
      ])
      return Array.flatMap(nonEmpty, row => [
        ...(row.isFirstUnavailable ? [divider] : []),
        ...rowLines(row, columns, width),
      ])
    },
  })
  return [
    heading,
    ...rows,
    lineOf([plain(indent), quiet(hintLineOf(menu.hints))]),
  ]
}

// FOOTER

const quitKey = 'q'

const quitHint = `[${quitKey}] quit`

/**
 * The footer every terminal paints under the screen: how to open the
 * action menu, then how to quit.
 *
 * @example
 * ```typescript
 * terminalFooterOf(bound.menuKeys()) // '[?] actions  [q] quit'
 * ```
 */
export const terminalFooterOf = (menuKeys: ReadonlyArray<KeyInput>): string =>
  Option.match(menuHintOf(menuKeys), {
    onNone: () => quitHint,
    onSome: menuHint => `${menuHint}  ${quitHint}`,
  })

const isQuitKey = (input: KeyInput): boolean =>
  input.key === quitKey && !input.isMeta && !input.isControl

/**
 * Presses one key in a terminal: the Program's interaction takes it
 * first, and `q` quits only when neither an Action nor the open menu took
 * it. Every terminal host uses this, so `q` means the same everywhere.
 *
 * @example
 * ```typescript
 * if (pressTerminalKey(bound, terminalKeyInput(event)) === 'Quit') {
 *   process.exit(0)
 * }
 * ```
 */
export const pressTerminalKey = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  input: KeyInput,
): TerminalKeyOutcome => {
  if (bound.pressKey(input)) {
    return 'Handled'
  } else if (isQuitKey(input) && Option.isNone(bound.menu())) {
    return 'Quit'
  } else {
    return 'Ignored'
  }
}

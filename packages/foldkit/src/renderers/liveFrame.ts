import { Array, Option } from 'effect'

import type { InkRun } from '../theme/terminal.js'
import { layoutTree } from './layout.js'
import { paintAscii } from './paint.js'
import type { LayoutBox, UiNode } from './types.js'

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
 * What sits around a part in its frame: `header`, a node pinned above it,
 * such as what is playing, and `footer`, lines under it, such as what
 * can be run now. Each is left out when the rows have no room for it
 * beside the part itself.
 */
export type LiveFrameAround = Readonly<{
  header?: UiNode
  footer?: ReadonlyArray<string>
}>

type Line = Readonly<{ text: string; inks: ReadonlyArray<InkRun> }>

const minimumPartRows = 3

// NOTE: The line to keep in view sits a third of the way down, so a
// reader sees a little of what was just read and more of what comes.
const partsAbove = 3

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

const linesOf = (node: UiNode, columns: number) => {
  const laid = layoutTree(node, 0, 0, columns)
  const painted = paintAscii(laid)
  return {
    lines: Array.map(
      painted.lines,
      (line, row): Line =>
        cut(
          {
            text: line.trimEnd(),
            inks: Option.getOrElse(Array.get(painted.inks, row), () => []),
          },
          columns,
        ),
    ),
    maybeAnchor: Array.head(anchorRowsOf(laid)),
  }
}

const resting = (text: string, columns: number): Line => {
  const shown = text.slice(0, columns)
  return {
    text: shown,
    inks:
      shown === '' ? [] : [{ col: 0, width: shown.length, role: 'QuietText' }],
  }
}

/**
 * Fits a part of the view to a terminal's size, as lines with their
 * roles. The part is laid out to the columns, which wraps a Transcript
 * between words; then as many of its rows as fit are kept, with the row
 * to keep in view, such as the line of the word being read, a third of
 * the way down, so the paragraphs before and after are trimmed and the
 * one being read stays. A header is pinned above and a footer below when
 * the rows leave the part at least three rows of its own; with fewer, the
 * footer goes first, then the header. The frame is never wider than the
 * columns nor taller than the rows. Pure: the same node and size give
 * the same lines, on any Client.
 *
 * @example
 * ```typescript
 * liveFrameOf(transcript, { columns: 60, rows: 14 }, {
 *   header: Text('The Lantern Keeper · 0:36 of 1:20:00 · playing'),
 *   footer: ['  books pause  Pauses and keeps your place'],
 * })
 * // { lines: ['The Lantern Keeper · 0:36 …', '›0:35   He [trimmed] the wick', …], inks: […] }
 * ```
 */
export const liveFrameOf = (
  part: UiNode,
  size: LiveFrameSize,
  around: LiveFrameAround = {},
): LiveFrame => {
  const columns = Math.max(1, size.columns)
  const rows = Math.max(1, size.rows)
  const headerLines =
    around.header === undefined ? [] : linesOf(around.header, columns).lines
  const footerLines = Array.map(around.footer ?? [], line =>
    resting(line, columns),
  )
  const hasFooter =
    rows - headerLines.length - footerLines.length >= minimumPartRows
  const hasHeader = rows - headerLines.length >= 1
  const above = hasHeader ? headerLines : []
  const below = hasFooter ? footerLines : []
  const height = Math.max(1, rows - above.length - below.length)
  const body = linesOf(part, columns)
  const offset = Option.match(body.maybeAnchor, {
    onNone: () => 0,
    onSome: anchor =>
      Math.max(
        0,
        Math.min(
          anchor - Math.floor(height / partsAbove),
          body.lines.length - height,
        ),
      ),
  })
  const shown = [
    ...above,
    ...Array.take(Array.drop(body.lines, offset), height),
    ...below,
  ]
  return {
    lines: Array.map(shown, line => line.text),
    inks: Array.map(shown, line => line.inks),
  }
}

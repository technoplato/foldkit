import { Array, Match as M, Option, Record } from 'effect'

import type { InkRun } from '../theme/terminal.js'
import type { Role } from '../theme/theme.js'
import type { Device } from './device.js'
import {
  deviceHasHome,
  deviceHasStand,
  deviceHasStatus,
  fitText,
} from './layout.js'
import type {
  AsciiFrame,
  AsciiHotspot,
  LayoutBox,
  LayoutFrame,
} from './types.js'

/** One run of characters written at a row and column, in paint order. */
type Mark = Readonly<{
  row: number
  col: number
  chars: ReadonlyArray<string>
  inks: ReadonlyArray<InkRun>
}>

type Border = Readonly<{
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
  horizontal: string
  vertical: string
}>

const rounded: Border = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
}

const square: Border = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
}

const double: Border = {
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  horizontal: '═',
  vertical: '║',
}

const markOf = (
  row: number,
  col: number,
  text: string,
  inks: ReadonlyArray<InkRun> = [],
): Mark => ({
  row,
  col,
  chars: Array.fromIterable(text),
  inks,
})

const borderFor = (device: Device): Border =>
  M.value(device).pipe(
    M.withReturnType<Border>(),
    M.when('watch', () => rounded),
    M.when('tv', () => double),
    M.orElse(() => square),
  )

const spaceBetween = (left: string, right: string, width: number): string => {
  const gap = Math.max(1, width - left.length - right.length)
  return fitText(`${left}${' '.repeat(gap)}${right}`, width)
}

const center = (content: string, width: number): string => {
  const remaining = Math.max(0, width - content.length)
  const left = Math.floor(remaining / 2)
  return fitText(`${' '.repeat(left)}${content}`, width)
}

const statusText = (box: LayoutBox, innerWidth: number): string => {
  const time = box.time ?? '9:41'
  const title = box.title ?? ''
  const device = box.device
  if (device === undefined) {
    return fitText('', innerWidth)
  }
  return M.value(device).pipe(
    M.withReturnType<string>(),
    M.when('watch', () => spaceBetween(time, '●', innerWidth)),
    M.when('phone', () => spaceBetween('• • •', time, innerWidth)),
    M.when('tablet', () => spaceBetween('• • •', time, innerWidth)),
    M.when('computer', () => spaceBetween('● ● ●', title, innerWidth)),
    M.when('tv', () => fitText('', innerWidth)),
    M.exhaustive,
  )
}

const boxMarks = (
  x: number,
  y: number,
  w: number,
  h: number,
  border: Border,
): ReadonlyArray<Mark> => {
  if (w < 2 || h < 2) {
    return []
  }
  const bar = border.horizontal.repeat(w - 2)
  const ends = [
    markOf(y, x, `${border.topLeft}${bar}${border.topRight}`),
    markOf(y + h - 1, x, `${border.bottomLeft}${bar}${border.bottomRight}`),
  ]
  if (h === 2) {
    return ends
  }
  return [
    ...ends,
    ...Array.flatMap(Array.range(1, h - 2), rowOffset => [
      markOf(y + rowOffset, x, border.vertical),
      markOf(y + rowOffset, x + w - 1, border.vertical),
    ]),
  ]
}

const deviceMarks = (box: LayoutBox): ReadonlyArray<Mark> => {
  const device = box.device
  if (device === undefined) {
    return []
  }
  const standH = deviceHasStand(device) ? 1 : 0
  const boxH = box.h - standH
  const innerWidth = box.w - 2
  return [
    ...boxMarks(box.x, box.y, box.w, boxH, borderFor(device)),
    ...(deviceHasStatus(device)
      ? [markOf(box.y + 1, box.x + 1, statusText(box, innerWidth))]
      : []),
    ...(deviceHasHome(device)
      ? [markOf(box.y + boxH - 2, box.x + 1, center('─────', innerWidth))]
      : []),
    ...(deviceHasStand(device)
      ? [
          markOf(
            box.y + boxH,
            box.x,
            fitText(` ${'▔'.repeat(innerWidth)} `, box.w),
          ),
        ]
      : []),
  ]
}

const frameBorderFor = (style: LayoutFrame['style']): Border =>
  M.value(style).pipe(
    M.withReturnType<Border>(),
    M.when('Rounded', () => rounded),
    M.when('Square', () => square),
    M.when('Double', () => double),
    M.exhaustive,
  )

const frameMarks = (
  box: LayoutBox,
  frame: LayoutFrame,
): ReadonlyArray<Mark> => {
  if (box.w < 2 || box.h < 2) {
    return []
  }
  const border = frameBorderFor(frame.style)
  const borderInk = (col: number, width: number): ReadonlyArray<InkRun> =>
    frame.role !== undefined && width > 0
      ? [{ col, width, role: frame.role }]
      : []
  const innerW = box.w - 2
  const hasTitle =
    frame.title !== undefined && frame.title !== '' && innerW >= 4
  const topMark = (() => {
    if (!hasTitle || frame.title === undefined) {
      return markOf(
        box.y,
        box.x,
        `${border.topLeft}${border.horizontal.repeat(innerW)}${border.topRight}`,
        borderInk(box.x, box.w),
      )
    }
    const maxTitle = innerW - 3
    const clipped =
      frame.title.length > maxTitle
        ? frame.title.substring(0, maxTitle)
        : frame.title
    const fill = Math.max(0, innerW - clipped.length - 3)
    const topLine = `${border.topLeft}${border.horizontal} ${clipped} ${border.horizontal.repeat(fill)}${border.topRight}`
    const titleRole: Role =
      frame.role === undefined || frame.role === 'Border' ? 'Text' : frame.role
    const titleStart = box.x + 3
    const rightStart = titleStart + clipped.length + 1
    const topInks: ReadonlyArray<InkRun> = [
      ...borderInk(box.x, 2),
      { col: titleStart, width: clipped.length, role: titleRole },
      ...borderInk(rightStart, box.x + box.w - rightStart),
    ]
    return markOf(box.y, box.x, topLine, topInks)
  })()
  const bottomBar = `${border.bottomLeft}${border.horizontal.repeat(innerW)}${border.bottomRight}`
  const ends = [
    topMark,
    markOf(box.y + box.h - 1, box.x, bottomBar, borderInk(box.x, box.w)),
  ]
  if (box.h === 2) {
    return ends
  }
  return [
    ...ends,
    ...Array.flatMap(Array.range(1, box.h - 2), rowOffset => [
      markOf(box.y + rowOffset, box.x, border.vertical, borderInk(box.x, 1)),
      markOf(
        box.y + rowOffset,
        box.x + box.w - 1,
        border.vertical,
        borderInk(box.x + box.w - 1, 1),
      ),
    ]),
  ]
}

const marksOf = (box: LayoutBox): ReadonlyArray<Mark> => [
  ...(box.kind === 'DeviceShell' ? deviceMarks(box) : []),
  ...(box.frame === undefined ? [] : frameMarks(box, box.frame)),
  ...(box.text === undefined
    ? []
    : [markOf(box.y, box.x, box.text, box.inks ?? [])]),
  ...Array.flatMap(box.children, marksOf),
]

const hotspotsOf = (box: LayoutBox): ReadonlyArray<AsciiHotspot> => [
  ...(box.action === undefined
    ? []
    : [
        {
          id: box.id,
          label: box.label ?? box.text ?? box.id,
          row: box.y,
          col: box.x,
          width: box.w,
          height: box.h,
          action: box.action,
        },
      ]),
  ...Array.flatMap(box.children, hotspotsOf),
]

const placed = (
  cells: ReadonlyArray<string>,
  mark: Mark,
  width: number,
): ReadonlyArray<string> => {
  if (mark.col >= width) {
    return cells
  }
  const shown = Array.take(mark.chars, width - mark.col)
  return [
    ...Array.take(cells, mark.col),
    ...shown,
    ...Array.drop(cells, mark.col + shown.length),
  ]
}

const blankRow = (width: number): ReadonlyArray<string> =>
  Array.makeBy(width, () => ' ')

const lineOf = (marks: ReadonlyArray<Mark>, width: number): string =>
  Array.join(
    Array.reduce(marks, blankRow(width), (cells, mark) =>
      placed(cells, mark, width),
    ),
    '',
  )

const noMarks: ReadonlyArray<Mark> = []

type RoleCell = Role | undefined

const blankRoles = (width: number): ReadonlyArray<RoleCell> =>
  Array.makeBy(width, () => undefined)

// NOTE: A later mark covers an earlier one, roles and all, as its
// characters do: the cells it writes lose the role they had, then take
// the roles its own runs say.
const rolesPlaced = (
  cells: ReadonlyArray<RoleCell>,
  mark: Mark,
  width: number,
): ReadonlyArray<RoleCell> => {
  const end = Math.min(width, mark.col + mark.chars.length)
  return Array.map(cells, (cell, col) => {
    if (col < mark.col || col >= end) {
      return cell
    } else {
      return Option.getOrUndefined(
        Option.map(
          Array.findFirst(
            mark.inks,
            run => col >= run.col && col < run.col + run.width,
          ),
          run => run.role,
        ),
      )
    }
  })
}

type Runs = Readonly<{
  runs: ReadonlyArray<InkRun>
  maybeOpen: Option.Option<InkRun>
}>

const noRuns: Runs = { runs: [], maybeOpen: Option.none() }

const closed = (state: Runs): ReadonlyArray<InkRun> => [
  ...state.runs,
  ...Option.toArray(state.maybeOpen),
]

const runsOf = (cells: ReadonlyArray<RoleCell>): ReadonlyArray<InkRun> =>
  closed(
    Array.reduce(cells, noRuns, (state, cell, col) => {
      const maybeContinued = Option.filter(
        state.maybeOpen,
        open => open.role === cell && open.col + open.width === col,
      )
      if (Option.isSome(maybeContinued)) {
        return {
          runs: state.runs,
          maybeOpen: Option.some({
            ...maybeContinued.value,
            width: maybeContinued.value.width + 1,
          }),
        }
      } else {
        return {
          runs: closed(state),
          maybeOpen:
            cell === undefined
              ? Option.none()
              : Option.some({ col, width: 1, role: cell }),
        }
      }
    }),
  )

const inksOf = (
  marks: ReadonlyArray<Mark>,
  width: number,
): ReadonlyArray<InkRun> =>
  Array.some(marks, mark => Array.isReadonlyArrayNonEmpty(mark.inks))
    ? runsOf(
        Array.reduce(marks, blankRoles(width), (cells, mark) =>
          rolesPlaced(cells, mark, width),
        ),
      )
    : []

/**
 * Paints a layout tree to monospace lines and hotspots. Each row is
 * composed from the runs written on it, in paint order, so a later run
 * covers an earlier one, the way a device's chrome sits under its content.
 */
export const paintAscii = (root: LayoutBox): AsciiFrame => {
  const byRow = Array.groupBy(marksOf(root), mark => mark.row.toString())
  const rows = root.h === 0 ? [] : Array.range(0, root.h - 1)
  const marksOn = (row: number): ReadonlyArray<Mark> =>
    Option.match(Record.get(byRow, row.toString()), {
      onNone: () => noMarks,
      onSome: marks => marks,
    })
  const lines = Array.map(rows, row => lineOf(marksOn(row), root.w))
  return {
    maybeDevice: root.device,
    lines,
    inks: Array.map(rows, row => inksOf(marksOn(row), root.w)),
    hotspots: hotspotsOf(root),
  }
}

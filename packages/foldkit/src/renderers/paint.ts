import { Array, Match as M, Option, Record } from 'effect'

import type { Device } from './device.js'
import {
  deviceHasHome,
  deviceHasStand,
  deviceHasStatus,
  fitText,
} from './layout.js'
import type { AsciiFrame, AsciiHotspot, LayoutBox } from './types.js'

/** One run of characters written at a row and column, in paint order. */
type Mark = Readonly<{
  row: number
  col: number
  chars: ReadonlyArray<string>
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

const markOf = (row: number, col: number, text: string): Mark => ({
  row,
  col,
  chars: Array.fromIterable(text),
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

const marksOf = (box: LayoutBox): ReadonlyArray<Mark> => [
  ...(box.kind === 'DeviceShell' ? deviceMarks(box) : []),
  ...(box.text === undefined ? [] : [markOf(box.y, box.x, box.text)]),
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

/**
 * Paints a layout tree to monospace lines and hotspots. Each row is
 * composed from the runs written on it, in paint order, so a later run
 * covers an earlier one, the way a device's chrome sits under its content.
 */
export const paintAscii = (root: LayoutBox): AsciiFrame => {
  const byRow = Array.groupBy(marksOf(root), mark => mark.row.toString())
  const rows = root.h === 0 ? [] : Array.range(0, root.h - 1)
  const lines = Array.map(rows, row =>
    lineOf(
      Option.match(Record.get(byRow, row.toString()), {
        onNone: () => noMarks,
        onSome: marks => marks,
      }),
      root.w,
    ),
  )
  return {
    maybeDevice: root.device,
    lines,
    hotspots: hotspotsOf(root),
  }
}

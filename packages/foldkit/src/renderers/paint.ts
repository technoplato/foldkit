import { Array, HashMap, Match as M, Option } from 'effect'

import type { Device } from './device.js'
import {
  deviceHasHome,
  deviceHasStand,
  deviceHasStatus,
  fitText,
} from './layout.js'
import type { AsciiFrame, AsciiHotspot, LayoutBox } from './types.js'

type Cells = HashMap.HashMap<string, string>

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

const cellKey = (row: number, col: number): string =>
  `${row.toString()}:${col.toString()}`

const paintLine = (
  cells: Cells,
  row: number,
  startCol: number,
  text: string,
): Cells => {
  const chars = Array.fromIterable(text)
  if (Array.isArrayEmpty(chars)) {
    return cells
  }
  const offsets = Array.range(0, chars.length - 1)
  return Array.reduce(Array.zip(offsets, chars), cells, (acc, [offset, ch]) =>
    HashMap.set(acc, cellKey(row, startCol + offset), ch),
  )
}

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

const paintBox = (
  cells: Cells,
  x: number,
  y: number,
  w: number,
  h: number,
  border: Border,
): Cells => {
  if (w < 2 || h < 2) {
    return cells
  }
  const bar = border.horizontal.repeat(w - 2)
  const top = `${border.topLeft}${bar}${border.topRight}`
  const bottom = `${border.bottomLeft}${bar}${border.bottomRight}`
  const withEnds = paintLine(paintLine(cells, y, x, top), y + h - 1, x, bottom)
  if (h === 2) {
    return withEnds
  }
  const innerRows = Array.range(1, h - 2)
  return Array.reduce(innerRows, withEnds, (acc, rowOffset) =>
    HashMap.set(
      HashMap.set(acc, cellKey(y + rowOffset, x), border.vertical),
      cellKey(y + rowOffset, x + w - 1),
      border.vertical,
    ),
  )
}

const paintDevice = (cells: Cells, box: LayoutBox): Cells => {
  const device = box.device
  if (device === undefined) {
    return cells
  }
  const standH = deviceHasStand(device) ? 1 : 0
  const boxH = box.h - standH
  const innerWidth = box.w - 2
  const framed = paintBox(cells, box.x, box.y, box.w, boxH, borderFor(device))
  const withStatus = deviceHasStatus(device)
    ? paintLine(framed, box.y + 1, box.x + 1, statusText(box, innerWidth))
    : framed
  const withHome = deviceHasHome(device)
    ? paintLine(
        withStatus,
        box.y + boxH - 2,
        box.x + 1,
        center('─────', innerWidth),
      )
    : withStatus
  if (!deviceHasStand(device)) {
    return withHome
  }
  return paintLine(
    withHome,
    box.y + boxH,
    box.x,
    fitText(` ${'▔'.repeat(innerWidth)} `, box.w),
  )
}

const paintNode = (
  cells: Cells,
  hotspots: ReadonlyArray<AsciiHotspot>,
  box: LayoutBox,
): Readonly<{
  cells: Cells
  hotspots: ReadonlyArray<AsciiHotspot>
}> => {
  const withChrome =
    box.kind === 'DeviceShell' ? paintDevice(cells, box) : cells
  const withText =
    box.text === undefined
      ? withChrome
      : paintLine(withChrome, box.y, box.x, box.text)
  const nextHotspots =
    box.action === undefined
      ? hotspots
      : [
          ...hotspots,
          {
            id: box.id,
            label: box.label ?? box.text ?? box.id,
            row: box.y,
            col: box.x,
            width: box.w,
            height: box.h,
            action: box.action,
          },
        ]
  return Array.reduce(
    box.children,
    { cells: withText, hotspots: nextHotspots },
    (state, child) => paintNode(state.cells, state.hotspots, child),
  )
}

const lineAt = (cells: Cells, row: number, width: number): string => {
  const chars = Array.makeBy(width, col =>
    Option.getOrElse(HashMap.get(cells, cellKey(row, col)), () => ' '),
  )
  return chars.join('')
}

/** Paints a layout tree to monospace lines and hotspots. */
export const paintAscii = (root: LayoutBox): AsciiFrame => {
  const painted = paintNode(HashMap.empty(), [], root)
  const rows = root.h === 0 ? [] : Array.range(0, root.h - 1)
  const lines = Array.map(rows, row => lineAt(painted.cells, row, root.w))
  return {
    maybeDevice: root.device,
    lines,
    hotspots: painted.hotspots,
  }
}

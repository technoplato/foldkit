import type { AsciiFrame, AsciiHotspot, LayoutBox } from './types.js'

const setChar = (grid: string[][], row: number, col: number, ch: string) => {
  if (row < 0 || col < 0) return
  while (grid.length <= row) grid.push([])
  const line = grid[row]!
  while (line.length <= col) line.push(' ')
  line[col] = ch
}

const writeText = (
  grid: string[][],
  row: number,
  col: number,
  text: string,
) => {
  for (let i = 0; i < text.length; i++) {
    setChar(grid, row, col + i, text[i]!)
  }
}

/** Paint layout tree to monospace lines + hotspots (absolute cell coords). */
export function paintAscii(root: LayoutBox): AsciiFrame {
  const grid: string[][] = []
  const hotspots: AsciiHotspot[] = []

  const walk = (box: LayoutBox) => {
    if (box.kind === 'phone') {
      // ASCII-only border so every cell is one mono advance (Unicode box
      // drawing often has a different width and shifts hotspots off glyphs).
      const { x, y, w, h } = box
      for (let c = 0; c < w; c++) {
        setChar(grid, y, x + c, c === 0 ? '+' : c === w - 1 ? '+' : '-')
        setChar(
          grid,
          y + h - 1,
          x + c,
          c === 0 ? '+' : c === w - 1 ? '+' : '-',
        )
      }
      for (let r = 1; r < h - 1; r++) {
        setChar(grid, y + r, x, '|')
        setChar(grid, y + r, x + w - 1, '|')
        for (let c = 1; c < w - 1; c++) setChar(grid, y + r, x + c, ' ')
      }
    }

    if (
      (box.kind === 'text' ||
        box.kind === 'button' ||
        box.kind === 'textinput') &&
      box.text
    ) {
      writeText(grid, box.y, box.x, box.text)
    }

    if (box.action && (box.kind === 'button' || box.kind === 'textinput')) {
      hotspots.push({
        id: box.id,
        label: box.label ?? box.text ?? box.id,
        row: box.y,
        col: box.x,
        width: box.w,
        height: box.h,
        action: box.action,
      })
    }

    for (const child of box.children) walk(child)
  }

  walk(root)

  const width = root.w
  const height = root.h
  const lines: string[] = []
  for (let r = 0; r < height; r++) {
    const row = grid[r] ?? []
    let s = ''
    for (let c = 0; c < width; c++) s += row[c] ?? ' '
    lines.push(s)
  }

  return { device: 'phone', lines, hotspots }
}

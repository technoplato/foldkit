/**
 * Shared terminal frame writer used by `books tui`, `books follow`,
 * `runProgramTui`, and `runProgramWatch`. Keeps zero held state: each
 * frame writes cursor-home, every line fitted by display width with
 * erase-to-end-of-line, and erase-below when fewer lines than rows are
 * shown, wrapped in synchronized output and autowrap-off. This module
 * must not import Effect, Instant, or a Program.
 */

export const SYNC_START = '\u001b[?2026h'

export const SYNC_END = '\u001b[?2026l'

export const AUTOWRAP_OFF = '\u001b[?7l'

export const AUTOWRAP_ON = '\u001b[?7h'

export const CURSOR_HOME = '\u001b[H'

export const ERASE_TO_EOL = '\u001b[K'

export const ERASE_BELOW = '\u001b[J'

const RESET_STYLE = '\u001b[0m'

const CSI_PATTERN = /^\u001b\[[0-9;?]*[ -/]*[@-~]/u

const OSC_PATTERN = /^\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/u

const ZERO_WIDTH_PATTERN = /^[\p{Mn}\p{Me}\p{Cf}]$/u

const isWideCodePoint = (code: number): boolean =>
  (code >= 0x1100 && code <= 0x115f) ||
  code === 0x2329 ||
  code === 0x232a ||
  (code >= 0x231a && code <= 0x231b) ||
  (code >= 0x23e9 && code <= 0x23f3) ||
  (code >= 0x23f8 && code <= 0x23fa) ||
  (code >= 0x25fd && code <= 0x25fe) ||
  (code >= 0x2614 && code <= 0x2615) ||
  (code >= 0x2648 && code <= 0x2653) ||
  code === 0x267f ||
  code === 0x2693 ||
  code === 0x26a1 ||
  (code >= 0x26aa && code <= 0x26ab) ||
  (code >= 0x26bd && code <= 0x26be) ||
  (code >= 0x26c4 && code <= 0x26c5) ||
  code === 0x26ce ||
  code === 0x26d4 ||
  code === 0x26ea ||
  (code >= 0x26f2 && code <= 0x26f3) ||
  code === 0x26f5 ||
  code === 0x26fa ||
  code === 0x26fd ||
  code === 0x2705 ||
  (code >= 0x270a && code <= 0x270b) ||
  code === 0x2728 ||
  code === 0x274c ||
  code === 0x274e ||
  (code >= 0x2753 && code <= 0x2755) ||
  code === 0x2757 ||
  (code >= 0x2795 && code <= 0x2797) ||
  code === 0x27b0 ||
  code === 0x27bf ||
  (code >= 0x2b1b && code <= 0x2b1c) ||
  code === 0x2b50 ||
  code === 0x2b55 ||
  (code >= 0x2e80 && code <= 0x303e) ||
  (code >= 0x3040 && code <= 0xa4cf) ||
  (code >= 0xac00 && code <= 0xd7a3) ||
  (code >= 0xf900 && code <= 0xfaff) ||
  (code >= 0xfe10 && code <= 0xfe19) ||
  (code >= 0xfe30 && code <= 0xfe6f) ||
  (code >= 0xff00 && code <= 0xff60) ||
  (code >= 0xffe0 && code <= 0xffe6) ||
  (code >= 0x1f300 && code <= 0x1faff) ||
  (code >= 0x20000 && code <= 0x3fffd)

const charDisplayWidth = (character: string): number => {
  const code = character.codePointAt(0)
  if (code === undefined || code < 0x20 || (code >= 0x7f && code < 0xa0)) {
    return 0
  } else if (ZERO_WIDTH_PATTERN.test(character)) {
    return 0
  } else if (isWideCodePoint(code)) {
    return 2
  } else {
    return 1
  }
}

const matchEscapeAt = (text: string, index: number): string | undefined => {
  if (text.charCodeAt(index) !== 0x1b) {
    return undefined
  }
  const rest = text.slice(index)
  const csi = CSI_PATTERN.exec(rest)
  if (csi !== null) {
    return csi[0]
  }
  const osc = OSC_PATTERN.exec(rest)
  if (osc !== null) {
    return osc[0]
  }
  return undefined
}

/**
 * The terminal cell width of `text`, counting wide CJK and emoji glyphs as
 * two cells, combining marks and ANSI escape sequences as zero.
 */
export const displayWidth = (text: string): number => {
  let width = 0
  let index = 0
  while (index < text.length) {
    const escape = matchEscapeAt(text, index)
    if (escape !== undefined) {
      index += escape.length
    } else {
      const code = text.codePointAt(index)
      const step = code !== undefined && code > 0xffff ? 2 : 1
      width += charDisplayWidth(text.slice(index, index + step))
      index += step
    }
  }
  return width
}

/** One line fitted to a display-cell budget, with its resulting cell width. */
export type FittedDisplayLine = Readonly<{
  text: string
  width: number
}>

/**
 * Truncates `text` so its visible terminal cell width is at most
 * `maxColumns`, keeping ANSI escape sequences intact and appending a style
 * reset when a styled line is cut short.
 */
export const fitDisplayWidth = (
  text: string,
  maxColumns: number,
): FittedDisplayLine => {
  if (maxColumns <= 0) {
    return { text: '', width: 0 }
  }
  let width = 0
  let index = 0
  let output = ''
  let sawEscape = false
  let wasTruncated = false
  while (index < text.length) {
    const escape = matchEscapeAt(text, index)
    if (escape !== undefined) {
      sawEscape = true
      output += escape
      index += escape.length
    } else {
      const code = text.codePointAt(index)
      const step = code !== undefined && code > 0xffff ? 2 : 1
      const glyph = text.slice(index, index + step)
      const glyphWidth = charDisplayWidth(glyph)
      if (width + glyphWidth > maxColumns) {
        wasTruncated = true
        break
      }
      output += glyph
      width += glyphWidth
      index += step
    }
  }
  return {
    text: wasTruncated && sawEscape ? `${output}${RESET_STYLE}` : output,
    width,
  }
}

/** Options for painting one frame onto a terminal screen. */
export type TerminalFrameOptions = Readonly<{
  columns?: number
  rows?: number
  prefix?: string
}>

/**
 * Formats one full terminal frame without `ESC[2J`: wraps cursor-home,
 * every line fitted by display width with erase-to-end-of-line (omitted
 * when the line fills the final column so the last cell is preserved),
 * and erase-below when fewer lines than `rows` are shown, inside
 * synchronized output (`ESC[?2026h` ... `ESC[?2026l`) and autowrap-off.
 */
export const formatTerminalFrame = (
  text: string,
  options: TerminalFrameOptions = {},
): string => {
  const withoutTrailingNewline = text.endsWith('\n') ? text.slice(0, -1) : text
  const rawLines = withoutTrailingNewline.split('\n')
  const rows = options.rows
  const columns = options.columns
  const keptLines =
    rows !== undefined && rows > 0 ? rawLines.slice(0, rows) : rawLines
  const paintedLines = keptLines.map(line => {
    if (columns !== undefined && columns > 0) {
      const fitted = fitDisplayWidth(line, columns)
      return fitted.width < columns
        ? `${fitted.text}${ERASE_TO_EOL}`
        : fitted.text
    } else {
      return `${line}${ERASE_TO_EOL}`
    }
  })
  const needsEraseBelow = rows === undefined || keptLines.length < rows
  const eraseRest = needsEraseBelow ? `\n\r${ERASE_BELOW}` : ''
  return `${options.prefix ?? ''}${SYNC_START}${AUTOWRAP_OFF}${CURSOR_HOME}${paintedLines.join('\n')}${eraseRest}${AUTOWRAP_ON}${SYNC_END}`
}

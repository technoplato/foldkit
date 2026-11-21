import { Array, Option } from 'effect'

import { type TerminalInk, inkedLine } from '../theme/terminal.js'
import {
  type Contrast,
  type Mode,
  type Theme,
  defaultTheme,
} from '../theme/theme.js'
import { type LayoutOptions, layoutTree } from './layout.js'
import { paintAscii } from './paint.js'
import type { AsciiFrame, UiNode } from './types.js'

// NOTE: static non-interactive CLI renderer (Scribe #2656). Runs any Foldkit
// UiNode tree (built with Elements.* or foldkit/jsx-runtime) through the
// generic layout.ts / paint.ts engine and paints semantic theme roles to
// deterministic ANSI terminal text or plain text (color: false). Reads only
// generic Slot bindings through layout.ts and never names any widget module.

const defaultWidth = 80

const ansiPattern = /\u001b\[[0-9;]*m/gu

/** Options for painting a `UiNode` tree to static CLI terminal output. */
export type CliPaintOptions = Readonly<{
  /** Maximum terminal column width (`80` by default). */
  width?: number
  /** Whether to emit ANSI color and style escape codes (`true` by default when `ink` is omitted). */
  color?: boolean
  /** Explicit terminal ink configuration; overrides `color`, `ground`, `contrast`, and `theme`. */
  ink?: TerminalInk
  /** Terminal background polarity (`'Dark' | 'Light'`) for choosing theme colors. */
  ground?: Mode
  /** Contrast preference (`'Standard' | 'More'`). */
  contrast?: Contrast
  /** Theme whose semantic roles color the output (`defaultTheme` by default). */
  theme?: Theme
  /** Paint the active transcript passage with a left vertical bar. */
  activePassageBar?: boolean
  /** Trim trailing spaces on each rendered line (`true` by default). */
  trimTrailingSpaces?: boolean
}>

/** Static CLI paint result carrying plain lines, ANSI-styled lines, and the underlying `AsciiFrame`. */
export type CliFrame = Readonly<{
  plainLines: ReadonlyArray<string>
  lines: ReadonlyArray<string>
  plainText: string
  text: string
  frame: AsciiFrame
}>

const inkOfOptions = (options: CliPaintOptions): TerminalInk => {
  if (options.ink !== undefined) {
    return options.ink
  }
  return {
    isColor: options.color ?? true,
    maybeGround: options.ground,
    contrast: options.contrast ?? 'Standard',
    theme: options.theme ?? defaultTheme,
  }
}

/**
 * Removes ANSI SGR escape sequences from a styled terminal string.
 *
 * @example
 * ```typescript
 * stripAnsi('\u001b[1mHello\u001b[22m') // 'Hello'
 * ```
 */
export const stripAnsi = (text: string): string => text.replace(ansiPattern, '')

/**
 * Paints any Foldkit `UiNode` tree into a deterministic {@link CliFrame} with
 * both plain text and ANSI-styled lines derived from theme semantic roles.
 *
 * @example
 * ```typescript
 * const painted = paintCli(screen, { width: 60, color: true, ground: 'Dark' })
 * painted.text // ANSI-styled string
 * painted.plainText // plain no-color string
 * ```
 */
export const paintCli = (
  root: UiNode,
  options: CliPaintOptions = {},
): CliFrame => {
  const width = options.width ?? defaultWidth
  const layoutOptions: LayoutOptions =
    options.activePassageBar === undefined
      ? {}
      : { activePassageBar: options.activePassageBar }
  const frame = paintAscii(layoutTree(root, 0, 0, width, layoutOptions))
  const ink = inkOfOptions(options)
  const shouldTrim = options.trimTrailingSpaces !== false

  const plainLines = Array.map(frame.lines, line =>
    shouldTrim ? line.trimEnd() : line,
  )
  const lines = Array.map(plainLines, (line, row) => {
    const runs = Option.getOrElse(Array.get(frame.inks, row), () => [])
    return inkedLine(ink, line, runs)
  })

  return {
    plainLines,
    lines,
    plainText: Array.join(plainLines, '\n'),
    text: Array.join(lines, '\n'),
    frame,
  }
}

/**
 * Renders any Foldkit `UiNode` tree to a deterministic CLI string (ANSI-styled
 * by default; pass `{ color: false }` for plain text).
 *
 * @example
 * ```typescript
 * renderCli(screen, { width: 72, color: false })
 * ```
 */
export const renderCli = (
  root: UiNode,
  options: CliPaintOptions = {},
): string => paintCli(root, options).text

/**
 * Renders any Foldkit `UiNode` tree to plain no-color CLI text.
 *
 * @example
 * ```typescript
 * renderPlainCli(screen, { width: 72 })
 * ```
 */
export const renderPlainCli = (
  root: UiNode,
  options: Omit<CliPaintOptions, 'color' | 'ink'> = {},
): string => paintCli(root, { ...options, color: false }).plainText

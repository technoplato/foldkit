import { Array, Match as M, Option } from 'effect'

import type { BoundInteraction } from '../interaction/bind.js'
import {
  terminalFooterOf,
  terminalLineText,
  terminalMenuLines,
} from '../interaction/terminal.js'
import {
  type TerminalFocus,
  focusedTagOf,
  noTerminalFocus,
  terminalFrameOf,
} from '../interaction/terminalFocus.js'
import { type Frame, type FrameLayer, frameOf } from '../navigation/frame.js'
import type { Host } from '../processor/host.js'
import { layoutTree } from '../renderers/layout.js'
import { anchorRowsOf } from '../renderers/liveFrame.js'
import { paintAscii } from '../renderers/paint.js'
import type { UiNode } from '../renderers/types.js'
import type { RenderReport } from '../telemetry/recorder.js'
import type { InkRun } from '../theme/terminal.js'
import { paintScreen } from './program.js'

// MODEL

/** How many rows and columns a terminal shows. */
export type TerminalSize = Readonly<{ rows: number; columns: number }>

/**
 * Where a terminal screen is scrolled: the first body line shown, for the
 * screen with this identity, such as `/books/a-tin-comet/contents`.
 */
export type TerminalScroll = Readonly<{ identity: string; offset: number }>

/**
 * What a terminal keeps between paints: the highlighted button on each
 * screen, and how far the screen with the keyboard is scrolled.
 */
export type TerminalView = Readonly<{
  focus: TerminalFocus
  maybeScroll: Option.Option<TerminalScroll>
}>

/** A terminal view with nothing highlighted and nothing scrolled. */
export const initialTerminalView: TerminalView = {
  focus: noTerminalFocus,
  maybeScroll: Option.none(),
}

/**
 * One painted terminal screen, exactly as tall as the terminal. `inks`
 * says the role each part of each line plays, one list per line, such as
 * the word being spoken or the button with the keyboard, so a host whose
 * output takes color inks the lines from the theme (`inkedLine`); the
 * lines themselves are plain text.
 */
export type TerminalPaint = Readonly<{
  lines: ReadonlyArray<string>
  inks: ReadonlyArray<ReadonlyArray<InkRun>>
  view: TerminalView
}>

/**
 * Why a terminal host painted a frame: `mount` for a view's first frame,
 * `update` after a Model change, `key` after a key, and `refresh` when a
 * remote view asked for its frame again, as `books tui` does twice a
 * second.
 */
export type TerminalPaintPhase = 'mount' | 'update' | 'key' | 'refresh'

/**
 * Where a terminal host reports each frame it paints: how long laying it
 * out and painting it took, and its phase, such as
 * `{ painter: 'Terminal', durationMs: 2.6, phase: 'key' }`. Pass
 * telemetry's `recordRendered` to keep every paint with the session.
 *
 * @example
 * ```typescript
 * const telemetry = Telemetry.attach(handle, { app: 'books', sink: fileSink() })
 * runProgramTui(bound, 'books', { onPainted: telemetry.recordRendered })
 * ```
 */
export type TerminalPaintReporting = Readonly<{
  onPainted?: (report: RenderReport) => void
}>

/** The painter a terminal host reports its frames as. */
export const terminalPainter = 'Terminal'

const minimumRows = 8

const minimumColumns = 40

const contextLines = 2

const chromeRows = 2

const minimumBodyRows = 3

// BODY

// One line of the screen and the roles its parts play.
type Line = Readonly<{ text: string; inks: ReadonlyArray<InkRun> }>

const plain = (text: string): Line => ({ text, inks: [] })

// The screen's own lines rest: where it is, how much is hidden, the keys.
const quiet = (text: string): Line => ({
  text,
  inks: text === '' ? [] : [{ col: 0, width: text.length, role: 'QuietText' }],
})

type Part = Readonly<{
  lines: ReadonlyArray<Line>
  maybeFocusedRow: Option.Option<number>
  currentRows: ReadonlyArray<number>
}>

const emptyPart: Part = {
  lines: [],
  maybeFocusedRow: Option.none(),
  currentRows: [],
}

type Split = Readonly<{
  maybeNode: Option.Option<UiNode>
  docks: ReadonlyArray<UiNode>
}>

type SplitChildren = Readonly<{
  children: ReadonlyArray<UiNode>
  docks: ReadonlyArray<UiNode>
}>

const kept = (node: UiNode): Split => ({
  maybeNode: Option.some(node),
  docks: [],
})

const splitChildren = (children: ReadonlyArray<UiNode>): SplitChildren => {
  const splits = Array.map(children, withoutDocks)
  return {
    children: Array.getSomes(Array.map(splits, split => split.maybeNode)),
    docks: Array.flatMap(splits, split => split.docks),
  }
}

/**
 * A screen tree without its docks, and the docks, so a terminal pins the
 * now-playing bar and the tabs under a body that scrolls.
 */
const withoutDocks = (node: UiNode): Split =>
  M.value(node).pipe(
    M.withReturnType<Split>(),
    M.tagsExhaustive({
      Text: kept,
      Button: kept,
      TextInput: kept,
      Spacer: kept,
      Progress: kept,
      List: kept,
      Seek: kept,
      Transcript: kept,
      Row: row => {
        const { children, docks } = splitChildren(row.children)
        return { maybeNode: Option.some({ ...row, children }), docks }
      },
      Column: column => {
        const { children, docks } = splitChildren(column.children)
        return { maybeNode: Option.some({ ...column, children }), docks }
      },
      DeviceShell: shell => {
        const { children, docks } = splitChildren(shell.children)
        return { maybeNode: Option.some({ ...shell, children }), docks }
      },
      Box: box => {
        if (box.isDock === true) {
          return { maybeNode: Option.none(), docks: [box] }
        } else {
          const { children, docks } = splitChildren(box.children)
          return { maybeNode: Option.some({ ...box, children }), docks }
        }
      },
    }),
  )

const treePart = (
  node: UiNode,
  width: number,
  maybeFocused: Option.Option<string>,
): Part => {
  const laid = layoutTree(node, 0, 0, width)
  const painted = paintAscii(laid)
  return {
    lines: Array.map(painted.lines, (line, row) => ({
      text: line.trimEnd(),
      inks: Option.getOrElse(Array.get(painted.inks, row), () => []),
    })),
    maybeFocusedRow: Option.flatMap(maybeFocused, tag =>
      Option.map(
        Array.findFirst(painted.hotspots, hotspot => hotspot.action.id === tag),
        hotspot => hotspot.row,
      ),
    ),
    currentRows: anchorRowsOf(laid),
  }
}

type Layered = Readonly<{
  body: Part
  docks: ReadonlyArray<UiNode>
}>

const layerPart = (
  layer: FrameLayer,
  width: number,
  maybeFocused: Option.Option<string>,
): Layered =>
  M.value(layer.view).pipe(
    M.withReturnType<Layered>(),
    M.tagsExhaustive({
      Screen: ({ node }) => {
        const split = withoutDocks(node)
        return {
          body: Option.match(split.maybeNode, {
            onNone: () => emptyPart,
            onSome: bodyNode => treePart(bodyNode, width, maybeFocused),
          }),
          docks: split.docks,
        }
      },
      Menu: ({ menu }) => {
        const lines = terminalMenuLines(menu, width)
        return {
          body: {
            lines: Array.map(lines, line => {
              const text = terminalLineText(line)
              return line.isFocused
                ? {
                    text,
                    inks: [{ col: 0, width: text.length, role: 'Focus' }],
                  }
                : plain(text)
            }),
            maybeFocusedRow: Array.findFirstIndex(
              lines,
              line => line.isFocused,
            ),
            currentRows: [],
          },
          docks: [],
        }
      },
    }),
  )

const shifted = (part: Part, by: number): Part => ({
  lines: part.lines,
  maybeFocusedRow: Option.map(part.maybeFocusedRow, row => row + by),
  currentRows: Array.map(part.currentRows, row => row + by),
})

type Stacked = Readonly<{
  parts: ReadonlyArray<Part>
  nextLine: number
}>

const noneStacked: Stacked = { parts: [], nextLine: 0 }

const stacked = (bodies: ReadonlyArray<Part>): Stacked =>
  Array.reduce(bodies, noneStacked, (state, body) => ({
    parts: Array.append(state.parts, shifted(body, state.nextLine)),
    nextLine: state.nextLine + body.lines.length,
  }))

// SCROLL

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), Math.max(low, high))

/**
 * The first body line to show: the previous one while the line to keep in
 * view still shows, else the nearest one that shows it with two lines of
 * context. A screen seen for the first time starts at its top.
 */
const offsetOf = (
  totalLines: number,
  height: number,
  minimumOffset: number,
  maybeAnchor: Option.Option<number>,
  maybePrevious: Option.Option<number>,
): number => {
  const highest = Math.max(minimumOffset, totalLines - height)
  const start = clamp(
    Option.getOrElse(maybePrevious, () => minimumOffset),
    minimumOffset,
    highest,
  )
  return Option.match(maybeAnchor, {
    onNone: () => start,
    onSome: anchor => {
      if (anchor < start + contextLines) {
        return clamp(anchor - contextLines, minimumOffset, highest)
      } else if (anchor >= start + height - contextLines) {
        return clamp(anchor - height + 1 + contextLines, minimumOffset, highest)
      } else {
        return start
      }
    },
  })
}

const moreLine = (arrow: string, count: number): Line =>
  quiet(`  ${arrow} ${count.toString()} more ${count === 1 ? 'line' : 'lines'}`)

/**
 * The body lines a window shows, with a line saying how much is hidden
 * above or below, in place of the line at that edge.
 */
const windowLines = (
  lines: ReadonlyArray<Line>,
  offset: number,
  height: number,
  minimumOffset: number,
): ReadonlyArray<Line> => {
  const top = offset > minimumOffset ? 1 : 0
  const bottom = lines.length > offset + height ? 1 : 0
  const shown = Array.take(
    Array.drop(lines, offset + top),
    Math.max(0, height - top - bottom),
  )
  const hiddenBelow = lines.length - offset - top - shown.length
  return [
    ...(top === 1 ? [moreLine('↑', offset - minimumOffset + top)] : []),
    ...shown,
    ...(bottom === 1 ? [moreLine('↓', hiddenBelow)] : []),
  ]
}

const blankLines = (count: number): ReadonlyArray<Line> =>
  count > 0 ? Array.makeBy(count, () => plain('')) : []

const padded = (
  lines: ReadonlyArray<Line>,
  height: number,
): ReadonlyArray<Line> => [
  ...Array.take(lines, height),
  ...blankLines(height - lines.length),
]

const fittedLine =
  (width: number) =>
  (line: Line): Line =>
    line.text.length > width
      ? { text: line.text.slice(0, width), inks: line.inks }
      : line

const paintOf = (
  lines: ReadonlyArray<Line>,
  view: TerminalView,
): TerminalPaint => ({
  lines: Array.map(lines, line => line.text),
  inks: Array.map(lines, line => line.inks),
  view,
})

// PAINT

const paintedFrame = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  view: TerminalView,
  frame: Frame,
  size: TerminalSize,
): TerminalPaint => {
  const decorated = terminalFrameOf(frame, view.focus)
  const maybeFocused = focusedTagOf(frame, view.focus)
  const keyboard = Option.getOrElse(
    Array.last(decorated.overlays),
    () => decorated.base,
  )
  const layered = Array.map([decorated.base, ...decorated.overlays], layer =>
    layerPart(
      layer,
      size.columns,
      layer.identity === keyboard.identity ? maybeFocused : Option.none(),
    ),
  )
  const { parts } = stacked(Array.map(layered, part => part.body))
  const keyboardPart = Option.getOrElse(Array.last(parts), () => emptyPart)
  const overlayStart = Array.reduce(
    Array.dropRight(parts, 1),
    0,
    (lines, part) => lines + part.lines.length,
  )
  const body = Array.flatMap(parts, part => part.lines)
  const dockNodes: ReadonlyArray<UiNode> = Array.flatMap(
    layered,
    part => part.docks,
  )
  const docks = Array.flatMap(
    dockNodes,
    dock => treePart(dock, size.columns, Option.none()).lines,
  )
  const dockLines = Array.takeRight(
    docks,
    Math.max(0, size.rows - chromeRows - minimumBodyRows),
  )
  const height = Math.max(1, size.rows - chromeRows - dockLines.length)
  const hasOverlay = Array.isReadonlyArrayNonEmpty(decorated.overlays)
  const minimumOffset =
    hasOverlay && body.length - overlayStart > height ? overlayStart : 0
  const maybeAnchor = Option.orElse(keyboardPart.maybeFocusedRow, () =>
    Option.orElse(Array.head(keyboardPart.currentRows), () =>
      hasOverlay ? Option.some(overlayStart) : Option.none(),
    ),
  )
  const maybePrevious = Option.flatMap(view.maybeScroll, scroll =>
    scroll.identity === keyboard.identity
      ? Option.some(scroll.offset)
      : Option.none(),
  )
  const offset = offsetOf(
    body.length,
    height,
    minimumOffset,
    maybeAnchor,
    maybePrevious,
  )
  return paintOf(
    Array.map(
      [
        quiet(`${name}  ${frame.uri}`),
        ...padded(windowLines(body, offset, height, minimumOffset), height),
        ...dockLines,
        quiet(terminalFooterOf(bound.menuKeys())),
      ],
      fittedLine(size.columns),
    ),
    {
      focus: view.focus,
      maybeScroll: Option.some({ identity: keyboard.identity, offset }),
    },
  )
}

const startingLines = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  view: TerminalView,
  size: TerminalSize,
): ReadonlyArray<Line> => {
  const screen = Array.map(paintScreen(bound, view.focus).split('\n'), line =>
    line.trimEnd(),
  )
  const lines = Array.match(screen, {
    onEmpty: () => [quiet(name)],
    onNonEmpty: nonEmpty => [
      quiet(`${name}  ${Array.headNonEmpty(nonEmpty)}`),
      ...Array.map(Array.tailNonEmpty(nonEmpty), plain),
    ],
  })
  return Array.map(
    [
      ...padded(lines, size.rows - 1),
      quiet(terminalFooterOf(bound.menuKeys())),
    ],
    fittedLine(size.columns),
  )
}

/**
 * Paints a bound Program to fit a terminal exactly: one line naming the
 * Program and where it is, the screen's body scrolled so the highlighted
 * button shows, else what is current, such as the chapter playing or the
 * line with the word being spoken, then the screen's docks, such as the
 * now-playing bar and the tabs, and the key hints, always in view. A line
 * says how much is hidden above or below. A Sheet taller than the
 * terminal scrolls on its own under the dock, so a book's 114 chapters
 * never push the player off the screen.
 *
 * @example
 * ```typescript
 * const painted = paintTerminal(bound, 'books', view, { rows: 24, columns: 80 })
 * // painted.lines: 24 lines, 'books  /books/a-tin-comet/contents' first and
 * // '[↑↓←→] move  [↵] press  [?] actions  [q] quit' last
 * ```
 */
export const paintTerminal = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  view: TerminalView,
  size: TerminalSize,
): TerminalPaint => {
  const fitted: TerminalSize = {
    rows: Math.max(minimumRows, size.rows),
    columns: Math.max(minimumColumns, size.columns),
  }
  return Option.match(frameOf(bound), {
    onNone: () => paintOf(startingLines(bound, name, view, fitted), view),
    onSome: frame => paintedFrame(bound, name, view, frame, fitted),
  })
}

/**
 * {@link paintTerminal}, then tells `reporting.onPainted` how long the
 * paint took and why it happened, such as
 * `{ painter: 'Terminal', durationMs: 2.6, phase: 'key' }`, with the
 * `clientHost` it was painted for when a daemon paints for a remote view,
 * such as `{ _tag: 'Tui' }` for `books tui`.
 */
export const paintTerminalReported = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  view: TerminalView,
  size: TerminalSize,
  phase: TerminalPaintPhase,
  reporting: TerminalPaintReporting,
  maybeClientHost: Option.Option<Host> = Option.none(),
): TerminalPaint => {
  const startedAt = performance.now()
  const painted = paintTerminal(bound, name, view, size)
  if (reporting.onPainted !== undefined) {
    reporting.onPainted({
      painter: terminalPainter,
      durationMs: performance.now() - startedAt,
      phase,
      ...Option.match(maybeClientHost, {
        onNone: () => ({}),
        onSome: clientHost => ({ clientHost }),
      }),
    })
  }
  return painted
}

export { anchorRowsOf }

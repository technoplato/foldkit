import { Array, Effect, Option, Ref, pipe } from 'effect'

import type { BoundInteraction } from '../interaction/bind.js'
import { terminalKeyInput } from '../interaction/interaction.js'
import { pressTerminalKeyAt } from '../interaction/terminalFocus.js'
import { paintProgram, runProgramCommand } from './program.js'
import type {
  CliDaemonFlags,
  CliDaemonPaintedResult,
  CliDaemonSurface,
} from './protocol.js'
import {
  type TerminalSize,
  type TerminalView,
  initialTerminalView,
  paintTerminal,
} from './terminalScreen.js'

// TERMINAL VIEW

const fallbackSize: TerminalSize = { rows: 24, columns: 80 }

const sizeFlagOf = (
  flags: CliDaemonFlags,
  name: 'rows' | 'columns',
  fallback: number,
): number =>
  pipe(
    Option.fromNullishOr(flags[name]),
    Option.map(Number),
    Option.filter(value => Number.isInteger(value) && value > 0),
    Option.getOrElse(() => fallback),
  )

const sizeOf = (flags: CliDaemonFlags): TerminalSize => ({
  rows: sizeFlagOf(flags, 'rows', fallbackSize.rows),
  columns: sizeFlagOf(flags, 'columns', fallbackSize.columns),
})

/**
 * True for a request from a terminal UI view, which sends
 * `{ view: 'tui', rows, columns }` with every Show and Do.
 */
export const isTerminalViewRequest = (flags: CliDaemonFlags): boolean =>
  flags['view'] === 'tui'

/**
 * What a daemon keeps for the terminal UI that shows its Program: the
 * highlight and the scroll, so each key and each refresh paints the next
 * frame from where the last one left off.
 */
export type ProgramTerminalView = Readonly<{
  paint: (flags: CliDaemonFlags) => Effect.Effect<CliDaemonPaintedResult, never>
  pressKey: (
    flags: CliDaemonFlags,
  ) => Effect.Effect<CliDaemonPaintedResult, never>
}>

/**
 * A terminal UI for a bound Program that a daemon serves to a remote view.
 * `paint` paints a frame exactly as tall and wide as the view's terminal;
 * `pressKey` routes the key the view read, `{ name: 'down' }` or
 * `{ sequence: 'p' }`, through the Program's interaction the way an
 * in-process TUI does, then paints, and says what came of it in
 * `flags.outcome`, `Quit` after a `q` nothing else took.
 *
 * @example
 * ```typescript
 * const terminal = makeProgramTerminalView(bound, 'books')
 * yield* terminal.pressKey({ view: 'tui', rows: '24', columns: '80', name: 'down' })
 * // { stdout: '…24 lines…', exitCode: 0, flags: { outcome: 'Handled' } }
 * ```
 */
export const makeProgramTerminalView = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
): ProgramTerminalView => {
  const view = Effect.runSync(Ref.make<TerminalView>(initialTerminalView))
  const paint = (flags: CliDaemonFlags) =>
    Effect.gen(function* () {
      const painted = paintTerminal(
        bound,
        name,
        yield* Ref.get(view),
        sizeOf(flags),
      )
      yield* Ref.set(view, painted.view)
      return { stdout: Array.join(painted.lines, '\n'), exitCode: 0 }
    })
  const pressKey = (flags: CliDaemonFlags) =>
    Effect.gen(function* () {
      const current = yield* Ref.get(view)
      const pressed = pressTerminalKeyAt(
        bound,
        terminalKeyInput({
          sequence: flags['sequence'] ?? '',
          name: flags['name'] ?? '',
          isMeta: flags['meta'] === '1',
          isControl: flags['ctrl'] === '1',
          isShift: flags['shift'] === '1',
        }),
        current.focus,
      )
      yield* Ref.set(view, { ...current, focus: pressed.focus })
      const painted = yield* paint(flags)
      return { ...painted, flags: { outcome: pressed.outcome } }
    })
  return { paint, pressKey }
}

// SURFACE

const wordsOf = (token: string): ReadonlyArray<string> =>
  pipe(
    token.split(' '),
    Array.filter(word => word !== ''),
  )

/**
 * A CLI daemon surface for any bound Program. `show` paints; `do` runs the
 * words the view sent. A request from a terminal UI view paints the
 * Program to fit that terminal and presses the key it read, so
 * `runCliTuiView` shows the daemon's Program live.
 */
export const programCliSurface = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
): CliDaemonSurface<Model, Message> => {
  const terminal = makeProgramTerminalView(bound, name)
  return {
    read: () => Effect.sync(() => bound.readModel()),
    run: message =>
      Effect.sync(() => {
        const previous = bound.readModel()
        bound.send(message)
        return { model: bound.readModel(), previous }
      }),
    show: flags =>
      isTerminalViewRequest(flags)
        ? terminal.paint(flags)
        : Effect.sync(() => ({
            stdout: paintProgram(bound, name),
            exitCode: 0,
          })),
    do: (token, flags) =>
      isTerminalViewRequest(flags)
        ? terminal.pressKey(flags)
        : Effect.sync(() =>
            runProgramCommand(bound, name, wordsOf(token), flags),
          ),
  }
}

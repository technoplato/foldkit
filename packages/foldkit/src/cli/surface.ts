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
  type TerminalPaintPhase,
  type TerminalPaintReporting,
  type TerminalSize,
  type TerminalView,
  initialTerminalView,
  paintTerminalReported,
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

const viewsKept = 8

type KeptView = Readonly<{ viewId: string; view: TerminalView }>

/**
 * What a daemon keeps for each terminal UI that shows its Program, by the
 * `viewId` the view sends: the highlight and the scroll, so each key and
 * each refresh paints the next frame from where the last one left off,
 * and a new `books tui` starts fresh.
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
 * `flags.outcome`, `Quit` after a `q` nothing else took. `onPainted` hears
 * how long each frame took to paint and why: `mount` for a view's first
 * frame, `refresh` when it asks again, and `key` after a key.
 *
 * @example
 * ```typescript
 * const terminal = makeProgramTerminalView(bound, 'books', {
 *   onPainted: telemetry.recordRendered,
 * })
 * yield* terminal.pressKey({ view: 'tui', rows: '24', columns: '80', name: 'down' })
 * // { stdout: '…24 lines…', exitCode: 0, flags: { outcome: 'Handled' } }
 * ```
 */
export const makeProgramTerminalView = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  reporting: TerminalPaintReporting = {},
): ProgramTerminalView => {
  const views = Effect.runSync(Ref.make<ReadonlyArray<KeptView>>([]))
  const viewIdOf = (flags: CliDaemonFlags): string => flags['viewId'] ?? ''
  const keptOf = (flags: CliDaemonFlags) =>
    Effect.map(Ref.get(views), kept =>
      Option.map(
        Array.findFirst(kept, entry => entry.viewId === viewIdOf(flags)),
        entry => entry.view,
      ),
    )
  const viewOf = (flags: CliDaemonFlags) =>
    Effect.map(keptOf(flags), maybeKept =>
      Option.getOrElse(maybeKept, () => initialTerminalView),
    )
  const keep = (flags: CliDaemonFlags, next: TerminalView) =>
    Ref.update(views, kept =>
      Array.takeRight(
        [
          ...Array.filter(kept, entry => entry.viewId !== viewIdOf(flags)),
          { viewId: viewIdOf(flags), view: next },
        ],
        viewsKept,
      ),
    )
  const paintAs = (flags: CliDaemonFlags, phase: TerminalPaintPhase) =>
    Effect.gen(function* () {
      const painted = paintTerminalReported(
        bound,
        name,
        yield* viewOf(flags),
        sizeOf(flags),
        phase,
        reporting,
      )
      yield* keep(flags, painted.view)
      return { stdout: Array.join(painted.lines, '\n'), exitCode: 0 }
    })
  const paint = (flags: CliDaemonFlags) =>
    Effect.flatMap(keptOf(flags), maybeKept =>
      paintAs(flags, Option.isSome(maybeKept) ? 'refresh' : 'mount'),
    )
  const pressKey = (flags: CliDaemonFlags) =>
    Effect.gen(function* () {
      const current = yield* viewOf(flags)
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
      yield* keep(flags, { ...current, focus: pressed.focus })
      const painted = yield* paintAs(flags, 'key')
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
 * `runCliTuiView` shows the daemon's Program live, and `onPainted` hears
 * how long each of those frames took to paint.
 */
export const programCliSurface = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  reporting: TerminalPaintReporting = {},
): CliDaemonSurface<Model, Message> => {
  const terminal = makeProgramTerminalView(bound, name, reporting)
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

import {
  type Cause,
  Effect,
  Option,
  type PlatformError,
  Queue,
  Ref,
  Terminal,
} from 'effect'

import type { BoundInteraction } from '../interaction/bind.js'
import { type KeyInput, terminalKeyInput } from '../interaction/interaction.js'
import { pressTerminalKeyAt } from '../interaction/terminalFocus.js'
import {
  type TerminalSize,
  type TerminalView,
  initialTerminalView,
  paintTerminal,
} from './terminalScreen.js'

const enterScreen = '\u001b[?1049h\u001b[?25l'

const leaveScreen = '\u001b[?25h\u001b[?1049l'

const clearScreen = '\u001b[H\u001b[2J'

const fallbackSize: TerminalSize = { rows: 24, columns: 80 }

/**
 * One terminal key event as a KeyInput. Named keys such as `return` and
 * `up` use the key name; printable keys use the typed character.
 *
 * @example
 * ```typescript
 * keyInputOfTerminal({ input: Option.some('+'), key: { name: '+', ... } })
 * // { key: '+', ... }
 * ```
 */
export const keyInputOfTerminal = (input: Terminal.UserInput): KeyInput =>
  terminalKeyInput({
    sequence: Option.getOrElse(input.input, () => ''),
    name: input.key.name,
    isMeta: input.key.meta,
    isControl: input.key.ctrl,
    isShift: input.key.shift,
  })

const windowTitleSequence = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
): string => `\u001b]0;${bound.windowTitle()}\u0007`

const isInterrupt = (input: Terminal.UserInput): boolean =>
  input.key.ctrl && input.key.name === 'c'

const sizeOf = (terminal: Terminal.Terminal) =>
  Effect.map(
    Effect.all({ rows: terminal.rows, columns: terminal.columns }),
    ({ rows, columns }): TerminalSize =>
      rows > 0 && columns > 0 ? { rows, columns } : fallbackSize,
  )

/**
 * Runs a live terminal UI for any bound Program. It repaints when the
 * Model changes and routes each key through the Program's interaction, so
 * `+` increments and `?` opens the action menu without any host code.
 * Ctrl-C quits, and so does `q` when neither an Action nor the menu takes
 * it. It paints on the terminal's own screen, restored on quit, exactly as
 * tall and wide as the terminal: the screen's body scrolls to the
 * highlighted button, or to what is current, under the docks and the key
 * hints, which always show. Model changes that land faster than a paint
 * fold into one repaint, so a Program that changes every second never
 * keeps a key waiting. The terminal window's title follows the screen and
 * names the Host the Program was started on, `Session | TUI`. The arrows
 * and Tab move a highlight across the buttons, Enter presses it, and an
 * Action's key acts on the highlighted row, so `r` with Counter 2's `+`
 * highlighted resets Counter 2. A dialog's buttons show their keys:
 * `[ Delete (y) ] [ Cancel (n) ]`. It returns when the person quits; the
 * host then stops the Program and exits.
 *
 * @example
 * ```typescript
 * runProgramTui(bindCounter(handle), 'counter').pipe(
 *   Effect.provide(NodeServices.layer),
 *   NodeRuntime.runMain,
 * )
 * ```
 */
export const runProgramTui = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const input = yield* terminal.readInput
      const repaints = yield* Queue.sliding<void>(1)
      const stopWatching = bound.subscribe(() => {
        Queue.offerUnsafe(repaints, undefined)
      })
      yield* Effect.addFinalizer(() => Effect.sync(stopWatching))
      const view = yield* Ref.make<TerminalView>(initialTerminalView)
      const maybeLastFrame = yield* Ref.make(Option.none<string>())

      yield* Effect.addFinalizer(() =>
        Effect.ignore(terminal.display(leaveScreen)),
      )

      const paint = Effect.gen(function* () {
        const size = yield* sizeOf(terminal)
        const painted = paintTerminal(bound, name, yield* Ref.get(view), size)
        yield* Ref.set(view, painted.view)
        const frame = `${windowTitleSequence(bound)}${clearScreen}${painted.lines.join('\n')}`
        const maybeLast = yield* Ref.get(maybeLastFrame)
        if (!Option.contains(maybeLast, frame)) {
          yield* Ref.set(maybeLastFrame, Option.some(frame))
          yield* terminal.display(
            Option.isNone(maybeLast) ? `${enterScreen}${frame}` : frame,
          )
        }
      })

      const readKeys: Effect.Effect<
        void,
        Cause.Done | PlatformError.PlatformError
      > = Queue.take(input).pipe(
        Effect.flatMap(event => {
          if (isInterrupt(event)) {
            return Effect.void
          }
          return Effect.flatMap(Ref.get(view), current => {
            const pressed = pressTerminalKeyAt(
              bound,
              keyInputOfTerminal(event),
              current.focus,
            )
            return pressed.outcome === 'Quit'
              ? Effect.void
              : Ref.set(view, { ...current, focus: pressed.focus }).pipe(
                  Effect.andThen(paint),
                  Effect.andThen(Effect.suspend(() => readKeys)),
                )
          })
        }),
      )

      const repaintLoop = Queue.take(repaints).pipe(
        Effect.andThen(paint),
        Effect.forever,
      )

      yield* paint
      yield* Effect.raceFirst(readKeys, repaintLoop)
    }),
  )

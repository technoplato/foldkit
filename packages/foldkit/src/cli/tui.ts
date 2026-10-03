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
import { terminalFooterOf } from '../interaction/terminal.js'
import {
  noTerminalFocus,
  pressTerminalKeyAt,
} from '../interaction/terminalFocus.js'
import { paintScreen } from './program.js'

const clearScreen = '\u001b[2J\u001b[H'

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

/**
 * Runs a live terminal UI for any bound Program. It repaints on every Model
 * change and routes each key through the Program's interaction, so `+`
 * increments and `?` opens the action menu without any host code. Ctrl-C
 * quits, and so does `q` when neither an Action nor the menu takes it.
 * The terminal window's title follows the screen and names the Host the
 * Program was started on, `Session | TUI`. It paints the screen and the
 * menu when open, not the list of every Action that `show` prints. The
 * arrows and Tab move a highlight across the buttons, Enter presses it,
 * and an Action's key acts on the highlighted row, so `r` with Counter 2's
 * `+` highlighted resets Counter 2. A dialog's buttons show their keys:
 * `[ Delete (y) ] [ Cancel (n) ]`.
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
      const repaints = yield* Queue.unbounded<void>()
      const stopWatching = bound.subscribe(() => {
        Effect.runSync(Queue.offer(repaints, undefined))
      })
      yield* Effect.addFinalizer(() => Effect.sync(stopWatching))
      const focus = yield* Ref.make(noTerminalFocus)

      const paint = Effect.flatMap(Ref.get(focus), currentFocus =>
        terminal.display(
          `${windowTitleSequence(bound)}${clearScreen}${name}  ${paintScreen(bound, currentFocus)}\n\n${terminalFooterOf(bound.menuKeys())}\n`,
        ),
      )

      const readKeys: Effect.Effect<
        void,
        Cause.Done | PlatformError.PlatformError
      > = Queue.take(input).pipe(
        Effect.flatMap(event => {
          if (isInterrupt(event)) {
            return Effect.void
          }
          return Effect.flatMap(Ref.get(focus), currentFocus => {
            const pressed = pressTerminalKeyAt(
              bound,
              keyInputOfTerminal(event),
              currentFocus,
            )
            return pressed.outcome === 'Quit'
              ? Effect.void
              : Ref.set(focus, pressed.focus).pipe(
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

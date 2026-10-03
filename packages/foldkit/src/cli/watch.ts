import { Effect, Option, type Scope } from 'effect'

import type { BoundInteraction } from '../interaction/bind.js'
import { paintScreen } from './program.js'

// WATCH

const clearScreen = '\u001b[H\u001b[2J'

const watchFooter = 'Watching every device. Ctrl-C stops.'

/** Where a watch paints: a terminal clears before each paint, a pipe does not. */
export type WatchOptions = Readonly<{
  isTerminal: boolean
}>

/**
 * The screen a watch paints for one Model: where the Program is, what it
 * shows, and how to stop, without the Action list `show` prints.
 *
 * @example
 * ```typescript
 * paintWatch(bound)
 * // 'at /counters\nCounters\nCounter 1 3 [ + ] [ - ] ...\n\nWatching every device. Ctrl-C stops.'
 * ```
 */
export const paintWatch = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
): string => `${paintScreen(bound)}\n\n${watchFooter}`

/**
 * Repaints a Program's screen every time its Model changes, from this
 * device or any other, until the scope closes. A terminal clears between
 * paints, so `counters watch` stays one live screen; a pipe gets each
 * paint in turn. An unchanged paint is skipped.
 *
 * @example
 * ```typescript
 * await Effect.runPromise(
 *   Effect.scoped(
 *     runProgramWatch(bound, text => process.stdout.write(text), {
 *       isTerminal: process.stdout.isTTY === true,
 *     }),
 *   ),
 * )
 * ```
 */
export const runProgramWatch = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  write: (painted: string) => void,
  options: WatchOptions,
): Effect.Effect<never, never, Scope.Scope> =>
  Effect.andThen(
    Effect.acquireRelease(
      Effect.sync(() => {
        let maybeLastPaint = Option.none<string>()
        const paint = (): void => {
          const painted = paintWatch(bound)
          if (Option.contains(maybeLastPaint, painted)) {
            return
          }
          maybeLastPaint = Option.some(painted)
          write(
            options.isTerminal
              ? `${clearScreen}${painted}\n`
              : `${painted}\n\n`,
          )
        }
        paint()
        return bound.subscribe(paint)
      }),
      stopWatching => Effect.sync(stopWatching),
    ),
    Effect.never,
  )

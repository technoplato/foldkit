import { Console, Effect } from 'effect'

import { NodeRuntime } from '@effect/platform-node'

import { PuzzleCliError, runDo, runReplay, runShow } from './host.js'
import {
  type ParsedPuzzleArgv,
  parsePuzzleArgv,
  puzzleUsage,
} from './parseArgv.js'
import { runScreenDo, runScreenShow } from './screenHost.js'
import { withCliTrace } from './trace.js'

const dispatchPuzzle = (
  parsed: ParsedPuzzleArgv,
): Effect.Effect<void, PuzzleCliError> => {
  if (parsed._tag === 'Help') {
    return Console.log(puzzleUsage)
  }
  if (parsed._tag === 'Failed') {
    return Effect.fail(new PuzzleCliError({ message: parsed.message }))
  }
  if (parsed._tag === 'Show') {
    return runShow(parsed.device, parsed.path)
  }
  if (parsed._tag === 'Do') {
    return runDo(parsed.token)
  }
  return runReplay(parsed.tape)
}

const failToStderr = (error: PuzzleCliError): Effect.Effect<void> =>
  Effect.flatMap(Console.error(error.message), () =>
    Effect.sync(() => {
      process.exitCode = 1
    }),
  )

/** Memory tape and replay stay in this process. Instant uses the slim view. */
export const runInProcessPuzzle = (argv: ReadonlyArray<string>): void => {
  dispatchPuzzle(parsePuzzleArgv(argv)).pipe(
    Effect.catchTag('PuzzleCliError', failToStderr),
    Effect.withSpan('puzzle.invoke'),
    withCliTrace,
    NodeRuntime.runMain,
  )
}

const dispatchScreen = (
  argv: ReadonlyArray<string>,
): Effect.Effect<void, PuzzleCliError> => {
  const first = argv.find((_, index) => index === 0)
  const second = argv.find((_, index) => index === 1)
  if (second !== undefined) {
    return Effect.fail(
      new PuzzleCliError({
        message: `Send one command. Got ${argv.join(' ')}.`,
      }),
    )
  }
  if (
    first === undefined ||
    first === 'help' ||
    first === '--help' ||
    first === '-h'
  ) {
    return runScreenShow()
  }
  return runScreenDo(first)
}

/** Memory tape for the screen-window CLI stays in this process. */
export const runInProcessScreen = (argv: ReadonlyArray<string>): void => {
  dispatchScreen(argv).pipe(
    Effect.catchTag('PuzzleCliError', failToStderr),
    NodeRuntime.runMain,
  )
}

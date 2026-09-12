import { Console, Effect } from 'effect'

import { NodeRuntime } from '@effect/platform-node'

import {
  CounterCliError,
  runDo,
  runPalette,
  runReplay,
  runSay,
  runShare,
  runShow,
} from './host.js'
import {
  type ParsedCounterArgv,
  counterUsage,
  parseCounterArgv,
} from './parseArgv.js'
import { runScreenDo, runScreenShow } from './screenHost.js'
import { withCliTrace } from './trace.js'

const dispatchCounter = (
  parsed: ParsedCounterArgv,
): Effect.Effect<void, CounterCliError> => {
  if (parsed._tag === 'Help') {
    return Console.log(counterUsage)
  }
  if (parsed._tag === 'Failed') {
    return Effect.fail(new CounterCliError({ message: parsed.message }))
  }
  if (parsed._tag === 'Show') {
    return runShow(parsed.device, parsed.path)
  }
  if (parsed._tag === 'Do') {
    return runDo(parsed.token)
  }
  if (parsed._tag === 'Palette') {
    return runPalette(parsed.token)
  }
  if (parsed._tag === 'Say') {
    return runSay(parsed.utterance)
  }
  if (parsed._tag === 'Share') {
    return runShare(parsed.name, parsed.with, parsed.subject ?? '')
  }
  return runReplay(parsed.tape)
}

const failToStderr = (error: CounterCliError): Effect.Effect<void> =>
  Effect.flatMap(Console.error(error.message), () =>
    Effect.sync(() => {
      process.exitCode = 1
    }),
  )

/** Memory tape and replay stay in this process. Instant uses the slim view. */
export const runInProcessCounter = (argv: ReadonlyArray<string>): void => {
  dispatchCounter(parseCounterArgv(argv)).pipe(
    Effect.catchTag('CounterCliError', failToStderr),
    Effect.withSpan('counter.invoke'),
    withCliTrace,
    NodeRuntime.runMain,
  )
}

const dispatchScreen = (
  argv: ReadonlyArray<string>,
): Effect.Effect<void, CounterCliError> => {
  const first = argv.find((_, index) => index === 0)
  const second = argv.find((_, index) => index === 1)
  if (second !== undefined) {
    return Effect.fail(
      new CounterCliError({
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
    Effect.catchTag('CounterCliError', failToStderr),
    NodeRuntime.runMain,
  )
}

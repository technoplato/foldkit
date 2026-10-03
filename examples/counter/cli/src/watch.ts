import { Effect } from 'effect'
import { runProgramWatch } from 'foldkit/cli'

import { openCounterSession } from './session.js'
import { type CounterCliTape } from './settings.js'

/**
 * `counter watch`: repaints the Counter as it changes, from every device,
 * until Ctrl-C. The paint comes from the Counter Program; this host only
 * starts it and picks the output.
 */
export const runWatch = async (tape: CounterCliTape): Promise<void> => {
  const session = await openCounterSession(tape)
  await Effect.runPromise(
    Effect.scoped(
      runProgramWatch(
        session.bound,
        painted => {
          process.stdout.write(painted)
        },
        { isTerminal: process.stdout.isTTY === true },
      ),
    ),
  ).finally(session.stop)
}

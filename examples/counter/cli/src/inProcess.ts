import { runProgramCommand } from 'foldkit/cli'
import { writeCliViewResult } from 'foldkit/cli/view'

import { openCounterSession } from './session.js'
import { type CounterCliTape } from './settings.js'

/**
 * Runs one command in this process for Memory and File tapes: start, run,
 * paint, stop. The count lives in the tape, not in this process.
 */
export const runInProcess = async (
  tape: CounterCliTape,
  words: ReadonlyArray<string>,
  flags: Readonly<Record<string, string>>,
): Promise<void> => {
  const session = await openCounterSession(tape)
  const painted = runProgramCommand(session.bound, 'counter', words, flags)
  await session.stop()
  writeCliViewResult({ stderr: '', ...painted })
}

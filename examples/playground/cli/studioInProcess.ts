import { Interaction, Processor, Runtime } from 'foldkit'
import { runProgramCommand } from 'foldkit/cli'
import { writeCliViewResult } from 'foldkit/cli/view'

import {
  SyncedStudio,
  makeStudioInstance,
  studioCommandName,
} from '../src/studioCore'

export const runStudioInProcess = async (
  words: ReadonlyArray<string>,
  flags: Readonly<Record<string, string>>,
): Promise<void> => {
  const instance = makeStudioInstance()
  const handle = Runtime.startHandle({
    program: SyncedStudio,
    sync: Runtime.Memory({ processor: `studio-cli-memory-${instance}` }),
    host: Processor.Host.Cli(),
  })
  const bound = Interaction.bind(SyncedStudio, handle)
  await Interaction.whenSettled(bound, 5_000)
  const painted = runProgramCommand(
    bound,
    studioCommandName,
    words.length === 0 ? ['show'] : words,
    flags,
  )
  await handle.stop()
  writeCliViewResult({ stderr: '', ...painted })
}

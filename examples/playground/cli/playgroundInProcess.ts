import { Interaction, Processor, Runtime } from 'foldkit'
import { runProgramCommand } from 'foldkit/cli'
import { writeCliViewResult } from 'foldkit/cli/view'

import {
  SyncedPlayground,
  makePlaygroundInstance,
  playgroundCommandName,
} from '../src/playgroundCore'

export const runPlaygroundInProcess = async (
  words: ReadonlyArray<string>,
  flags: Readonly<Record<string, string>>,
): Promise<void> => {
  const instance = makePlaygroundInstance()
  const handle = Runtime.startHandle({
    program: SyncedPlayground,
    sync: Runtime.Memory({ processor: `playground-cli-memory-${instance}` }),
    host: Processor.Host.Cli(),
  })
  const bound = Interaction.bind(SyncedPlayground, handle)
  await Interaction.whenSettled(bound, 5_000)
  const painted = runProgramCommand(
    bound,
    playgroundCommandName,
    words.length === 0 ? ['show'] : words,
    flags,
  )
  await handle.stop()
  writeCliViewResult({ stderr: '', ...painted })
}

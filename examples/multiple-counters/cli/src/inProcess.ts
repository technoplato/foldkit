import { Effect } from 'effect'
import { Interaction, Processor } from 'foldkit'
import { runProgramTail, runProgramWatch } from 'foldkit/cli'
import {
  MessageWire,
  bindCounters,
  countersEngine,
  newProcessorInstance,
  startCounters,
} from 'multiple-counters-core-example'

const readyTimeoutMs = 10_000

const configOf = () => ({
  host: Processor.Host.Cli(),
  instance: newProcessorInstance(),
})

/** `counters tail`: prints every Message the log takes, until Ctrl-C. */
export const runTail = async (): Promise<void> => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.andThen(
        runProgramTail(countersEngine(configOf()), MessageWire, line => {
          process.stdout.write(`${line}\n`)
        }),
        Effect.never,
      ),
    ),
  )
}

/** `counters watch`: repaints the list as it changes, until Ctrl-C. */
export const runWatch = async (): Promise<void> => {
  const handle = startCounters(configOf())
  const bound = bindCounters(handle)
  await Interaction.whenSettled(bound, readyTimeoutMs)
  await Effect.runPromise(
    Effect.scoped(
      runProgramWatch(
        bound,
        painted => {
          process.stdout.write(painted)
        },
        { isTerminal: process.stdout.isTTY === true },
      ),
    ),
  ).finally(handle.stop)
}

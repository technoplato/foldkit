import {
  MessageWire,
  counterEngine,
  newProcessorInstance,
} from 'counter-core-example'
import { Effect } from 'effect'
import { Processor } from 'foldkit'
import { runProgramTail } from 'foldkit/cli'

/**
 * `counter tail`: prints every Counter event as it lands, from every
 * device, until interrupted. The lines come from the Counter's Message
 * wire and the log; this host only picks the engine and the output.
 */
export const runTail = (): Promise<void> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.andThen(
        runProgramTail(
          counterEngine({
            host: Processor.Host.Cli(),
            instance: newProcessorInstance(),
          }),
          MessageWire,
          line => {
            process.stdout.write(`${line}\n`)
          },
        ),
        Effect.never,
      ),
    ),
  )

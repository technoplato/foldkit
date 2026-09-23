import {
  type BoundCounter,
  bindCounter,
  newProcessorInstance,
  startCounter,
  syncPolicyOf,
} from 'counter-core-example'
import { Option } from 'effect'
import { Processor } from 'foldkit'

import { type CounterCliTape, counterCliSyncWord } from './settings.js'

const readyTimeoutMs = 20_000

/** One live Counter the CLI drives through the generic interaction. */
export type CounterCliSession = Readonly<{
  bound: BoundCounter
  stop: () => Promise<void>
}>

/**
 * Starts the Counter and resolves once it is Ready or Failed, so a one-shot
 * command always prints a real count. The Counter core reads
 * `COUNTER_TAPE` and `COUNTER_TAPE_PATH` to choose the engine.
 */
export const openCounterSession = (
  tape: CounterCliTape,
): Promise<CounterCliSession> =>
  new Promise((resolve, reject) => {
    const handle = startCounter({
      host: Processor.Host.Cli(),
      instance: newProcessorInstance(),
      ...(tape._tag === 'Memory' ? { tape: 'Memory' } : {}),
      ...Option.match(syncPolicyOf(counterCliSyncWord()), {
        onNone: () => ({}),
        onSome: policy => ({ policy }),
      }),
    })
    const bound = bindCounter(handle)
    const timeout = setTimeout(() => {
      stopListening()
      reject(new Error('The Counter did not become Ready in time.'))
    }, readyTimeoutMs)
    const settle = (): void => {
      if (bound.status()._tag === 'Starting') {
        return
      }
      clearTimeout(timeout)
      stopListening()
      resolve({ bound, stop: handle.stop })
    }
    const stopListening = handle.subscribe(settle)
    settle()
  })

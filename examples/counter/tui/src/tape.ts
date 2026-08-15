import { counterProcessorIds } from 'counter-core-example'
import { resolveCounterTape as resolveSharedCounterTape } from 'counter-instant-example/node'

export { CounterInstantTapeError } from 'counter-instant-example/node'
export type { CounterTape } from 'counter-instant-example'

/** Resolves the TUI Instant tape from the process environment. */
export const resolveCounterTape = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
) => resolveSharedCounterTape(environment, counterProcessorIds.tui)

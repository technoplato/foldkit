#!/usr/bin/env node
/**
 * The Counter CLI, all of it. Every command comes from the Counter's
 * Catalog and the words every Program's terminal has: `counter` paints
 * the count and every Action, `counter increment` presses one, `counter
 * watch` repaints as the count changes on any device, `counter tail`
 * prints every Message the log takes, `counter tui` is the live terminal
 * UI, and `counter stop` ends the Background Processor that holds the
 * Counter between commands. `counter help` prints them, each line derived
 * from its declaration, so no list of commands is kept here.
 *
 * The Counter is imported only in the Background Processor, so a command
 * starts fast.
 */
import { terminal } from 'foldkit/cli/host'

await terminal({
  name: 'counter',
  entry: import.meta.url,
  processor: async () => {
    const {
      MessageWire,
      SyncedCounter,
      counterEngine,
      newProcessorInstance,
      startCounter,
    } = await import('counter-core-example')
    return {
      program: SyncedCounter,
      start: host => startCounter({ host, instance: newProcessorInstance() }),
      log: () => ({
        engine: counterEngine({
          host: { _tag: 'Cli' },
          instance: newProcessorInstance(),
        }),
        wire: MessageWire,
      }),
    }
  },
})

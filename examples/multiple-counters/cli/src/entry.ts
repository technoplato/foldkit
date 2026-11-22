#!/usr/bin/env node
/**
 * The Multiple Counters CLI, all of it. Every command comes from the
 * Program and the words every Program's terminal has, so this file names
 * no counter, Action, or route: `counters` paints the list and every
 * Action, `counters add` and `counters increment 1` press one, `counters
 * watch` repaints as the list changes on any device, `counters tail`
 * prints every Message the log takes, `counters tui` is the live terminal
 * UI, and `counters stop` ends the Background Processor that holds the
 * Program between commands. `counters help` prints them, each line
 * derived from its declaration.
 *
 * The counters live on the one Instant project, shared with every other
 * window; run it through `with-counter-v01-env` for the admin token. The
 * Program is imported only in the Background Processor, so a command
 * starts fast.
 */
import { terminal } from 'foldkit/cli/host'

await terminal({
  name: 'counters',
  entry: import.meta.url,
  processor: async () => {
    const {
      MessageWire,
      SyncedCounters,
      countersEngine,
      newProcessorInstance,
      startCounters,
    } = await import('multiple-counters-core-example')
    return {
      program: SyncedCounters,
      start: host => startCounters({ host, instance: newProcessorInstance() }),
      log: () => ({
        engine: countersEngine({
          host: { _tag: 'Cli' },
          instance: newProcessorInstance(),
        }),
        wire: MessageWire,
      }),
    }
  },
})

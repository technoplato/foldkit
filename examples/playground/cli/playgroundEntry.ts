#!/usr/bin/env node
/**
 * The `playground` command, all of it. Every command comes from the
 * Playground Catalog and the words every Program's terminal has, so no
 * list of commands is kept here: `playground help` prints them, each line
 * derived from its declaration, `playground watch` repaints as the
 * Playground changes in any window, and `playground stop` ends the
 * Background Processor that holds it between commands.
 *
 * The Program is imported only in the Background Processor, so a command
 * starts fast.
 */
import { terminal } from 'foldkit/cli/host'

await terminal({
  name: 'playground',
  entry: import.meta.url,
  processor: async () => {
    const { Runtime } = await import('foldkit')
    const { onNode } = await import('./onNode')
    const { SyncedPlayground, makePlaygroundInstance, playgroundProgramId } =
      await import('../src/playgroundCore')
    return {
      program: SyncedPlayground,
      start: host =>
        Runtime.startHandle({
          program: SyncedPlayground,
          ...onNode(playgroundProgramId, makePlaygroundInstance(), host),
        }),
    }
  },
})

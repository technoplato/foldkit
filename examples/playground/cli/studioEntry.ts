#!/usr/bin/env node
/**
 * The `studio` command, all of it. Every command comes from the Studio
 * Catalog and the words every Program's terminal has, so no list of
 * commands is kept here: `studio help` prints them, each line derived
 * from its declaration, `studio watch` repaints as the Studio changes in
 * any window, and `studio stop` ends the Background Processor that holds
 * it between commands.
 *
 * The Program is imported only in the Background Processor, so a command
 * starts fast.
 */
import { terminal } from 'foldkit/cli/host'

await terminal({
  name: 'studio',
  entry: import.meta.url,
  processor: async () => {
    const { Runtime } = await import('foldkit')
    const { onNode } = await import('./onNode')
    const { SyncedStudio, makeStudioInstance, studioProgramId } =
      await import('../src/studioCore')
    return {
      program: SyncedStudio,
      start: host =>
        Runtime.startHandle({
          program: SyncedStudio,
          ...onNode(studioProgramId, makeStudioInstance(), host),
        }),
    }
  },
})

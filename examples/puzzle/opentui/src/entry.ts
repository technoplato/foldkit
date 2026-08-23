#!/usr/bin/env bun
/**
 * Puzzle OpenTUI Client.
 *
 *   bun src/entry.ts
 *
 * Default state syncs on the shared live Instant tape with every
 * other Puzzle Client. PUZZLE_TAPE=memory isolates the process.
 * PUZZLE_TAPE_PATH syncs on a local file tape instead.
 */
import { Processor } from 'foldkit'
import { startLivePuzzle } from 'puzzle-core-example'

import { createCliRenderer } from '@opentui/core'

import { runPuzzleOpenTui } from './client.js'

const instanceLength = 8

const handle = startLivePuzzle(Processor.Host.OpenTui(), {
  instance: globalThis.crypto.randomUUID().slice(0, instanceLength),
})
const renderer = await createCliRenderer({ exitOnCtrlC: true })

await runPuzzleOpenTui(handle, renderer)

handle.stop()
renderer.destroy()
process.exit(0)

#!/usr/bin/env bun
/**
 * The Multiple Counters on OpenTUI.
 *
 *   bun src/entry.ts
 *
 * It shares the one Instant project's log with every other window, live.
 * Click a button or press its key, `?` opens the action menu, and Escape
 * goes back one screen.
 */
import { Processor } from 'foldkit'
import {
  bindCounters,
  newProcessorInstance,
  startCounters,
} from 'multiple-counters-core-example'

import { runOpenTui } from '@foldkit/opentui/interaction'
import { createCliRenderer } from '@opentui/core'

const bound = bindCounters(
  startCounters({
    host: Processor.Host.OpenTui(),
    instance: newProcessorInstance(),
  }),
)
const renderer = await createCliRenderer({ exitOnCtrlC: true })

await runOpenTui(bound, renderer)

await bound.stop()
renderer.destroy()
process.exit(0)

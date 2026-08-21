#!/usr/bin/env bun
/**
 * Counter OpenTUI Client.
 *
 *   bun src/entry.ts
 *
 * Default state syncs on the shared live Instant tape with every
 * other Counter Client. COUNTER_TAPE=memory isolates the process.
 * COUNTER_TAPE_PATH syncs on a local file tape instead.
 */
import { startLiveCounter } from 'counter-core-example'
import { Processor } from 'foldkit'

import { createCliRenderer } from '@opentui/core'

import { runCounterOpenTui } from './client.js'

const instanceLength = 8

const handle = startLiveCounter(Processor.Host.OpenTui(), {
  instance: globalThis.crypto.randomUUID().slice(0, instanceLength),
})
const renderer = await createCliRenderer({ exitOnCtrlC: true })

await runCounterOpenTui(handle, renderer)

handle.stop()
renderer.destroy()
process.exit(0)

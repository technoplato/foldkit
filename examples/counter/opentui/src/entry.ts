#!/usr/bin/env bun
/**
 * The Counter on OpenTUI.
 *
 *   bun src/entry.ts
 *
 * It joins the shared Instant tape with every other Counter Client.
 * `COUNTER_TAPE=memory` isolates the process. The session's mode is shared
 * state: choose "Keep navigation local" from the action menu to keep this
 * terminal's menu to itself.
 */
import {
  bindCounter,
  newProcessorInstance,
  startCounter,
} from 'counter-core-example'
import { Processor } from 'foldkit'

import { runOpenTui } from '@foldkit/opentui/interaction'
import { createCliRenderer } from '@opentui/core'

const bound = bindCounter(
  startCounter({
    host: Processor.Host.OpenTui(),
    instance: newProcessorInstance(),
  }),
)
const renderer = await createCliRenderer({ exitOnCtrlC: true })

await runOpenTui(bound, renderer)

await bound.stop()
renderer.destroy()
process.exit(0)

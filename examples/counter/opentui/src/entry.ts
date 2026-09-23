#!/usr/bin/env bun
/**
 * The Counter on OpenTUI.
 *
 *   bun src/entry.ts
 *
 * It joins the shared Instant tape with every other Counter Client.
 * `COUNTER_TAPE=memory` isolates the process; `COUNTER_SYNC=shared-domain`
 * keeps the action menu on this terminal.
 */
import {
  bindCounter,
  newProcessorInstance,
  startCounter,
  syncPolicyOf,
} from 'counter-core-example'
import { Option } from 'effect'
import { Processor } from 'foldkit'

import { createCliRenderer } from '@opentui/core'

import { runOpenTui } from './runOpenTui.js'

const bound = bindCounter(
  startCounter({
    host: Processor.Host.OpenTui(),
    instance: newProcessorInstance(),
    ...Option.match(syncPolicyOf(process.env['COUNTER_SYNC'] ?? ''), {
      onNone: () => ({}),
      onSome: policy => ({ policy }),
    }),
  }),
)
const renderer = await createCliRenderer({ exitOnCtrlC: true })

await runOpenTui(bound, renderer)

await bound.stop()
renderer.destroy()
process.exit(0)

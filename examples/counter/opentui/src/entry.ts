#!/usr/bin/env bun
/**
 * The Counter on OpenTUI.
 *
 *   bun src/entry.ts
 *   bun src/entry.ts --at /counter/session
 *
 * It joins the shared Instant tape with every other Counter Client.
 * `COUNTER_TAPE=memory` isolates the process. The session's mode is shared
 * state: choose "Keep navigation local" from the action menu to keep this
 * terminal's menu to itself. `--at` opens a URI at launch, unless the
 * session mirrors navigation, where a newcomer joins the shared screen.
 * Escape goes back one screen.
 */
import {
  bindCounter,
  newProcessorInstance,
  startCounter,
} from 'counter-core-example'
import { Array, Option, pipe } from 'effect'
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

const maybeLaunchUri = pipe(
  process.argv,
  Array.findFirstIndex(argument => argument === '--at'),
  Option.flatMap(index => Array.get(process.argv, index + 1)),
)

await runOpenTui(
  bound,
  renderer,
  Option.match(maybeLaunchUri, {
    onNone: () => ({}),
    onSome: launchUri => ({ launchUri }),
  }),
)

await bound.stop()
renderer.destroy()
process.exit(0)

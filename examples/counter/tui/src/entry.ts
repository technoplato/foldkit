#!/usr/bin/env node
/**
 * The Counter as a live terminal UI. The generic Foldkit TUI paints the
 * Program and routes keys: `+` and `-` press Actions, `?` opens the action
 * menu, `q` quits. `COUNTER_TAPE=memory` keeps the count in this process;
 * `COUNTER_SYNC=shared-domain` keeps the menu on this terminal.
 */
import {
  bindCounter,
  newProcessorInstance,
  startCounter,
  syncPolicyOf,
} from 'counter-core-example'
import { Effect, Option } from 'effect'
import { Processor } from 'foldkit'
import { runProgramTui } from 'foldkit/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

const bound = bindCounter(
  startCounter({
    host: Processor.Host.Tui(),
    instance: newProcessorInstance(),
    ...Option.match(syncPolicyOf(process.env['COUNTER_SYNC'] ?? ''), {
      onNone: () => ({}),
      onSome: policy => ({ policy }),
    }),
  }),
)

runProgramTui(bound, 'counter').pipe(
  Effect.ensuring(Effect.promise(bound.stop)),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)

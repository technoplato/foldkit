#!/usr/bin/env node
/**
 * The Counter as a live terminal UI. The generic Foldkit TUI paints the
 * Program and routes keys: `+` and `-` press Actions, `?` opens the action
 * menu, `q` quits. `COUNTER_TAPE=memory` keeps the count in this process;
 */
import {
  bindCounter,
  newProcessorInstance,
  startCounter,
} from 'counter-core-example'
import { Effect } from 'effect'
import { Processor } from 'foldkit'
import { runProgramTui } from 'foldkit/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

const bound = bindCounter(
  startCounter({
    host: Processor.Host.Tui(),
    instance: newProcessorInstance(),
  }),
)

runProgramTui(bound, 'counter').pipe(
  Effect.ensuring(Effect.promise(bound.stop)),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
